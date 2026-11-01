"use strict";
/**
 * siyuan-xref —— 思源笔记 图/表/公式 自动编号 + 交叉引用
 * 手写 CommonJS 插件，无需构建。依赖 siyuan 3.7+ 的 protyleSlash / addCommand / fetchSyncPost。
 */
const { Plugin, Setting, showMessage, fetchSyncPost } = require("siyuan");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULTS = {
    mode: "continuous", // continuous 全文连续 | chapter 按 h1 分章（图 1-1）
    figLabel: "图",
    tabLabel: "表",
    eqLabel: "式",
    refreshRefs: true,
    autoMode: true,     // 写完停手 autoDelay 毫秒后自动重排
    autoDelay: 1500,
    textDetect: true,   // 靠正文前缀「图 3 …」自动认题注；关掉后只认 custom-xref 属性（右键设的）
    // 指向已删块的引用怎么处理：off 不看不标记（默认）| mark 只标红保留引用 | text 转成红色删除线文本
    // 1.0.2 起默认改成 off：标红是运行时加的 class，思源一重渲染就掉、下一轮又加回来，
    // 用户看到「红字+删除线」只会以为是插件把内容改坏了（2026-10-31 用户两次反馈）。
    // 而且死链真正的解法是「撤销时把块重建回来」，不是把引用涂红。
    deadRefAction: "off",
    deadGrace: 10000,   // text 模式下死链要连续存在这么久才允许烧成文本，给撤销留窗口
    undoSteps: 10,      // 插件自建撤销栈保留多少轮（思源撤销栈收不到 API 写入，只能自己记）
    keyUndo: "Ctrl+Alt+Z",   // 撤销上次重排
    keyRedo: "Ctrl+Alt+Y",   // 重做重排
    centerCaption: true, // 重排时把「图 N …」「表 N …」题注段落设为居中
    captionBg: "light",  // 题注底色：none / faint / light / blue
    // 自定义快捷键（空串 = 不绑定）。格式由 hotkeyFromEvent 统一生成：Ctrl+Alt+R
    debug: false,       // 诊断模式：装 fetch 探针 + 写 ws-log.json。默认关，别长期开着
    keyInsert: "Ctrl+Alt+R",   // 插入交叉引用
    keyRenumber: "Ctrl+Alt+N", // 重排图表编号
};

/**
 * 键名归一表 + 组键函数。
 * 录键（设置面板里按下组合键）和全局监听都用同一个函数生成字符串，
 * 所以不需要再写解析逻辑，两边格式天然一致。
 */
const KEY_ALIAS = {
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    " ": "Space", Escape: "Esc", Delete: "Del", PageUp: "PgUp", PageDown: "PgDn",
    Home: "Home", End: "End", Enter: "Enter", Tab: "Tab", "+": "Plus",
};
const ONLY_MOD = /^(Control|Alt|Shift|Meta|CapsLock|AltGraph)$/;

function hotkeyFromEvent(ev) {
    if (!ev) return "";
    const raw = String(ev.key || "");
    if (ONLY_MOD.test(raw)) return "";          // 只按下修饰键，还在途中
    const parts = [];
    if (ev.ctrlKey) parts.push("Ctrl");
    if (ev.altKey) parts.push("Alt");
    if (ev.shiftKey) parts.push("Shift");
    if (ev.metaKey) parts.push("Meta");
    if (!parts.length) return "";               // 必须带修饰键，否则打字会误触发
    let k = raw;
    if (!k || k === "Process" || k === "Unidentified") {
        // 中文输入法/AltGr 下 ev.key 可能是 Process，退回物理键位
        const c = String(ev.code || "");
        if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
        else if (/^Digit\d$/.test(c)) k = c.slice(5);
        else if (/^F\d{1,2}$/.test(c)) k = c;
        else return "";
    } else if (KEY_ALIAS[k]) {
        k = KEY_ALIAS[k];                       // 空格、方向键、Esc 等先归一，别被下面的单字符分支吃掉
    } else if (k.length === 1) {
        k = k.toUpperCase();
    } else {
        k = k; // 其余保持原样（F5、Home 之类）
    }
    parts.push(k);
    return parts.join("+");
}

/** 题注底色。用半透明灰，浅色主题下是浅灰、暗色主题下是浅一点的灰，都不会太重 */
const CAPTION_BG = {
    none: "",
    faint: "rgba(127, 127, 127, 0.06)",
    light: "rgba(127, 127, 127, 0.10)",
    blue: "rgba(64, 130, 220, 0.08)",
};

function captionBgOf(s) {
    const v = CAPTION_BG[s && s.captionBg];
    return v === undefined ? CAPTION_BG.light : v;
}

/**
 * 把失效引用降级成「红色 + 删除线」的普通文字。
 * 思源对目标不存在的引用会一直报「未找到块」，转成纯文本就没这问题；
 * 而 ~~…~~ 叠加 color 会被归一化成 <span data-type="s" style="color:var(--b3-font-color1)">，
 * 删除线和红色都在一个元素上（实测 insertBlock 归一化结果）。
 */
function deadText(old) {
    let t = String(old || "").trim() || "失效引用";
    t = t.replace(/[<>{}~]/g, ""); // 防内联语法被撑破
    return '~~<span data-type="text" style="color:var(--b3-font-color1)">' + t + "</span>~~";
}

/** 光标所在的块 ID（只在编辑器内算数，否则返回空串） */
function currentEditingId() {
    if (typeof document === "undefined") return "";
    const pick = (node) => {
        if (!node || !node.closest) return "";
        const host = node.closest("[data-node-id]");
        if (!host || !host.closest(".protyle-wysiwyg")) return "";
        return host.getAttribute("data-node-id") || "";
    };
    const id = pick(document.activeElement);
    if (id) return id;
    // 公式 / 表格 / 块引用是浮层编辑，焦点可能落在 body 上，activeElement 拿不到块
    const alt = document.querySelector(
        ".protyle-wysiwyg .cm-editor.cm-focused, .protyle-wysiwyg .cm-content:focus, " +
        ".protyle-util .cm-editor.cm-focused");
    return pick(alt);
}

/**
 * 用户是否正在编辑器里敲公式 / 代码。此时任何写回都会打断输入，甚至把内容冲掉。
 *
 * 判定依据：思源的公式、代码块都用 CodeMirror（.cm-editor）；正文 WYSIWYG 不是。
 * 所以「可见且聚焦的 cm-editor」≈「正在改公式或代码」，这是唯一可靠的信号。
 *
 * 历史坑：旧版查 `.protyle-math` 这个类，而它在思源（3.8.9）里全局 0 处引用，
 * 等于永远不会命中；反过来的 `.protyle-util` 又是通用浮层（搜索、块引用都往里放），
 * 焦点类 `.cm-focused` 残留时会让判定恒为真 —— 自动重排被静默跳过，表现就是「没反应」。
 * 现在两个方向都收紧：必须真的可见，且浮层里的编辑器也必须连着正文块。
 */
function mathEditing() {
    if (typeof document === "undefined") return false;
    try {
        return mathEditingUnsafe();
    } catch (e) {
        return false; // 任何意外（残缺的 DOM 环境）都当没在编辑，别把整轮重排带崩
    }
}

function mathEditingUnsafe() {
    const visible = (el) => {
        if (!el || !el.isConnected) return false;
        try {
            if (typeof el.getClientRects === "function" && el.getClientRects().length === 0) return false;
            const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
            if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
        } catch (e) { /* 拿不到样式就当可见 */ }
        return true;
    };
    // 1) 焦点所在的编辑器最可信
    const ae = document.activeElement;
    if (ae && ae.closest) {
        const ed = ae.closest(".cm-editor");
        if (ed && visible(ed)) return true;
    }
    // 2) 焦点可能因浮层/iframe 丢失，退一步找「带焦点类且看得见」的编辑器
    const list = document.querySelectorAll(".cm-editor.cm-focused");
    for (let i = 0; i < list.length; i++) {
        if (visible(list[i])) return true;
    }
    return false;
}

/**
 * 光标停着 != 正在打字：靠「该块最近 N 毫秒内被改过」来区分。
 *
 * 这个值直接决定「刚敲完的题注多久能被自动编号」：
 *  - 太短：blocks 表索引还没跟上，读到的是半截内容，写回会把用户刚敲的字冲掉（数据丢失）
 *  - 太长：题注被判定为「正在编辑」而整块跳过，表现就是「自动重排没反应」
 * 实测（3.8.9，同一台机器）：`updateBlock` 写入后 SQL 可见耗时 0.59s / 1.50s，偶发 >1.8s。
 * 取 3000ms：覆盖实测上限并留一倍余量，同时把「敲完等到编号」的等待压到 3 秒内。
 * 万一还是慢，不会静默不管 —— 超时后放弃本轮并自动重试。
 */
const EDIT_GRACE = 3000;

/** 兜底：事件没触发过时，从 DOM 里找当前打开的文档 ID（文档标题块带 data-node-id） */
function docIdFromDom() {
    if (typeof document === "undefined") return "";
    const els = document.querySelectorAll(".protyle-title[data-node-id]");
    for (let i = els.length - 1; i >= 0; i--) {
        const id = els[i].getAttribute("data-node-id");
        if (id && els[i].offsetParent !== null) return id;
    }
    return "";
}

const REF_ANY = /\(\((\d{14}-[0-9a-z]{7})/g;

/** 找出文档内指向「已不存在块」的引用（跨文档引用靠实时接口核实） */
async function findDeadRefs(blocks) {
    const alive = new Set(blocks.map((b) => b.id));
    const cand = new Set();
    for (const b of blocks) {
        const md = b.markdown || "";
        if (md.indexOf("((") < 0) continue;
        REF_ANY.lastIndex = 0;
        let m;
        while ((m = REF_ANY.exec(md))) { if (!alive.has(m[1])) cand.add(m[1]); }
    }
    if (!cand.size) return [];
    const ids = Array.from(cand);
    // 一律用实时接口核实，不再用 SQL 粗筛：
    // SQL 说「有」可能是删除后 index 还没清的残影（实测留 2~4s），拿它当活块正是老 bug 的根。
    // 候选集只包含「不在本文档块列表里」的 id（跨文档引用 + 残影），一般 0~5 个，成本可忽略。
    const am = await aliveMap(ids);
    return ids.filter((i) => am[i] === false); // null（判不出）按活着处理，绝不误杀
}

/* ---------- 诊断：内存留痕 + 失败落盘（复盘"Field [id] must not be null"这类内核报错用） ---------- */
const CALLS = [];      // 最近 40 次 API 调用
const ERRS = [];       // 最近 20 次失败
let LOG_SINK = null;   // 由插件实例注入，负责写盘

function callNote(path, pl) {
    const brief = {};
    try {
        for (const k of Object.keys(pl || {})) {
            const v = pl[k];
            brief[k] = (typeof v === "string" && v.length > 80) ? v.slice(0, 80) + "…" : v;
        }
    } catch (e) {}
    CALLS.push({ t: new Date().toISOString().slice(11, 23), path: path, pl: brief });
    if (CALLS.length > 40) CALLS.shift();
}

async function logErr(where, e) {
    try {
        ERRS.push({
            t: new Date().toISOString().slice(11, 23),
            where: where,
            msg: e && e.message ? e.message : String(e),
            stack: e && e.stack ? String(e.stack).split("\n").slice(0, 4).join(" | ") : "",
            calls: CALLS.slice(-12),
        });
        if (ERRS.length > 20) ERRS.shift();
        if (LOG_SINK) await LOG_SINK(ERRS.slice());
    } catch (err) {}
}

const ID_KEYS = ["id", "parentID", "previousID", "nextID"];

async function api(path, payload) {
    const pl = payload || {};
    // 关键：id 为 null/空时内核会直接弹「Field [id] must not be null」，先拦住，换成能定位的本地错误
    for (const k of ID_KEYS) {
        if (k in pl && (pl[k] === null || pl[k] === undefined || pl[k] === "")) {
            const e = new Error("本地拦截：" + path + " 的 " + k + " 为空（null/undefined/空串）");
            e.__local = true;
            await logErr(path, e);
            throw e;
        }
    }
    callNote(path, pl);
    const r = await fetchSyncPost(path, pl);
    if (r && r.truncated) {
        // 思源 SQL 默认 64 行上限：静默截断比报错更危险，至少留痕
        await logErr(path + " 结果被截断", new Error("SQL 结果被思源截断（limit=" + r.limit + "），请加 limit -1"));
    }
    if (r.code !== 0) {
        const e = new Error(path + " -> " + r.msg);
        await logErr(path, e);
        throw e;
    }
    return r.data;
}

const sql = (stmt) => api("/api/query/sql", { stmt });

/**
 * 块到底还在不在？三级判据，优先用最实时的：
 *   1) /api/block/checkBlockExist —— 实测删除后 0ms 就返回 false（真·实时）
 *   2) /api/block/getBlockDOM    —— 实时读树，错误信息含 "block not found"
 *   3) SQL blocks 表             —— 最不可靠（删除后行还要留 2~4s），只作最后兜底
 * 返回 true 在 / false 确定不在 / null 判不出（调用方按「在」保守处理，绝不误杀）。
 *
 * ⚠ 不能只用 SQL 判存活：删块后 blocks 表 2~4s 内还留着行，这段时间它把已删块当活块。
 *   1.0.2 之前 findDeadRefs 就栽在这里 ——「删了图，引用失效」永远检测不出来。
 * 这里直接用 fetchSyncPost 而不是 api()：api() 会把 code!==0 记进 err-log 并抛异常，
 * 而「块不存在」是正常业务结果，不该刷爆错误日志。
 */
async function isBlockAlive(id) {
    if (!id) return false;
    try {
        const r = await fetchSyncPost("/api/block/checkBlockExist", { id: id });
        if (r && r.code === 0 && typeof r.data === "boolean") return r.data;
    } catch (e) { /* 老内核没这个接口 -> 往下走 */ }
    try {
        const r = await fetchSyncPost("/api/block/getBlockDOM", { id: id });
        if (r && r.code === 0 && r.data && typeof r.data.dom === "string" && r.data.dom) return true;
        const msg = String((r && r.msg) || "");
        if (r && r.code !== 0 && /not\s*found|not\s*exist|不存在|not\s*a\s*block/i.test(msg)) return false;
    } catch (e) { /* 网络/内核异常 -> SQL 兜底 */ }
    try {
        const rows = await sql("select id from blocks where id='" + id + "' limit -1");
        return !!(rows && rows.length);
    } catch (e) {
        return null;
    }
}

/** 批量核实存活：小并发跑，避免一条一条串行等（跨文档引用多时差别明显） */async function aliveMap(ids) {
    const out = {};
    const CONC = 8;
    for (let i = 0; i < ids.length; i += CONC) {
        const batch = ids.slice(i, i + CONC);
        const res = await Promise.all(batch.map((id) => isBlockAlive(id)));
        batch.forEach((id, k) => { out[id] = res[k]; });
    }
    return out;
}

/**
 * 取自己的版本号，写进 load-check.json 供排查。
 * 实测 3.8.9 里 onload 阶段 this.manifest 可能还取不到（旧版一直写成 "unknown"，
 * 于是「本地装的到底是哪一版」根本没法确认），这里退回读静态 plugin.json。
 */
async function ownVersion(inst) {
    try { if (inst && inst.manifest && inst.manifest.version) return inst.manifest.version; } catch (e) {}
    let name = "siyuan-xref";
    try { if (inst && inst.name) name = inst.name; } catch (e) {}
    try {
        const r = await fetch("/plugins/" + name + "/plugin.json", { cache: "no-store" });
        const j = await r.json();
        if (j && j.version) return j.version;
    } catch (e) { /* Node 测试环境没有相对路径 fetch，忽略 */ }
    return "unknown";
}

async function retry(fn, tries = 4, delay = 600) {
    let last;
    for (let i = 0; i < tries; i++) {
        try {
            return await fn();
        } catch (e) {
            last = e;
            await sleep(delay * (i + 1));
        }
    }
    throw last;
}

const NUM_HEAD = /^\s*(图|表|Figure|Table)\s*(\d+(?:[-.]\d+)?)\s*/;

/** 归类：custom-xref 属性优先；公式块=m→eq；段落前缀 图/表→fig/tab
 *
 * opt.textDetect === false 时不认「图 3 xxx」这种正文前缀（设置里可关），
 * 只认 custom-xref 属性 —— 手写正文里偶尔提到「图 3」的普通段落就不会被误当题注。
 */
function classify(b, opt) {
    // 调用方点名强制归类（快通道用）：值是 fig/tab/eq，或 "" 表示「明确不是题注」。
    // 后者不能省 —— 取消题注时属性已清、正文前缀刚被剥，但 blocks 表里两样都还是旧的，
    // 光改 ial 会被「图 N …」前缀重新认成题注，编号永远不顺延。
    if (b && Object.prototype.hasOwnProperty.call(b, "__xrKind")) {
        if (b.__xrKind) return b.__xrKind;
        return b.type === "m" ? "eq" : null;
    }
    const m = /custom-xref="([^"]*)"/.exec(b.ial || "");
    if (m && ["fig", "tab", "eq"].indexOf(m[1]) >= 0) return m[1];
    if (b.type === "m") return "eq";
    if (opt && opt.textDetect === false) return null;
    const p = NUM_HEAD.exec((b.markdown || "").trim());
    if (p) return p[1] === "图" || p[1] === "Figure" ? "fig" : "tab";
    return null;
}

/**
 * 找出「锚文本还写着图表编号、目标块却已经不是题注」的引用 —— 取消题注留下的孤儿引用。
 *
 * 为什么不能靠 findDeadRefs：取消题注后块还活着，按存在性判永远查不出来；
 * 而后续编号会把这个号让给别的块，正文里就出现「两条引用都叫图 2、指向不同块」的静默指错。
 * 用户要求这类引用和失效引用完全一样处理（设置里那三档：不处理 / 仅标红 / 转成文本）。
 *
 * 三个条件同时成立才算，避免误伤用户自己打的引用：
 *   ① 目标块在本文档里（不在 = 真失效引用，归 findDeadRefs 管）
 *   ② 目标块已经不是题注（classify 返回 null）
 *   ③ 引用锚文本长得像插件写的编号（isAutoCaptionName）
 */
function findOrphanCaptionRefs(blocks, s) {
    const byId = {};
    for (const b of blocks) byId[b.id] = b;
    const out = new Set();
    const REF = /\(\((\d{14}-[0-9a-z]{7})\s+(["'])(.*?)\2\)\)/g;
    for (const b of blocks) {
        const md = b.markdown || "";
        if (md.indexOf("((") < 0) continue;
        REF.lastIndex = 0;
        let m;
        while ((m = REF.exec(md))) {
            const t = byId[m[1]];
            if (!t) continue;                          // 目标不在文档里 → 失效引用那条路
            if (classify(t, s)) continue;               // 还是题注 → 正常刷新锚文本
            if (!isAutoCaptionName(m[3], s)) continue;  // 锚文本不像编号 → 用户自己的引用，不碰
            out.add(t.id);
        }
    }
    return Array.from(out);
}

/**
 * 把「刚写进去但 SQL 还没看到」的属性盖到本次采集结果上。
 * renumber 读的是 blocks.ial，而它索引滞后 0.6~2s；不等它，右键设题注就只能干等。
 * 只影响这一轮的内存副本，不写库。
 */
function withKindOverride(blocks, map) {
    if (!map || !blocks) return blocks;
    for (const b of blocks) {
        if (!Object.prototype.hasOwnProperty.call(map, b.id)) continue;
        const k = map[b.id];
        let ial = String(b.ial || "").replace(/\s*custom-xref="[^"]*"/g, "");
        if (k) ial += ' custom-xref="' + k + '"';
        b.ial = ial;
        b.__xrKind = k;   // "" = 明确不是题注，盖住库里还没更新的「图 N」前缀
    }
    return blocks;
}

function stripNumber(kind, txt) {
    let t = (txt || "").trim();
    if (kind === "eq") {
        t = t.replace(/^\$\$\s*/, "").replace(/\s*\$\$$/, "");
        t = t.replace(/\\{1,2}tag\s*\{[^}]*\}/g, "");
        return t.trim();
    }
    return t.replace(NUM_HEAD, "").trim();
}

/* ==================== 块右键菜单：设为图/表题注 ==================== */

/** 取消题注时剥掉开头的「图 3」「表 2-1」，只动这一处，不 trim 正文 */
function stripCaptionPrefix(md) {
    return String(md || "").replace(NUM_HEAD, "");
}

/**
 * 思源 click-blockicon / open-menu-content 的 detail.blockElements 是 **DOM 元素数组**，
 * 不是 {id, type} 对象 —— 要用 getAttribute 取，DOM 的 data-type 还是 NodeParagraph 这种长名。
 * 这里统一规整成 {id, type, img}，type 用 blocks 表的短码（p/t/m…），与 SQL 侧一致。
 *
 * ⚠ 图片块在 blocks 表里也是 type='p'（DOM 是 NodeParagraph 里包 span[data-type=img]），
 *   所以必须单独用 img 标出来，否则会被当成普通段落放行。
 */
/** 思源 Menu 的项容器（类名几个版本略有差别，逐个试，最后退回 element 本身） */
function menuItemRoot(menu) {
    const el = menu && menu.element;
    if (!el) return null;
    try {
        if (el.querySelector) {
            const q = el.querySelector(".b3-menu__items");
            if (q) return q;
        }
    } catch (e) { /* 退回 element */ }
    return el;
}

/**
 * 取「真正的主菜单」。
 *
 * ⚠ 关键结论（1.0.3 排查四轮后从思源 common.*.js 里读出来的）：
 * 思源 App 层在 emit click-blockicon / open-menu-content 之前，会 new 一个 subMenu
 * 顶替掉 detail.menu，等事件跑完再把这个 subMenu 整体挂成主菜单里那个「插件 ›」子项
 * （`new MenuItem({id:"plugin", type:"submenu", submenu:y.menus})`）。
 * 所以凡经 detail.menu.addItem 的项，**注定**进子菜单 —— 调 index、加分隔线、
 * 之后再把 DOM 搬出来都没用，因为「插件 ›」这个子项本身就在主菜单最底部，
 * 而节点搬家又会破坏 MenuItem 的宿主（它的 click 里 T.remove() 关的是 subMenu，不是主菜单）。
 *
 * 正路：主菜单实例仍挂在 window.siyuan.menus.menu 上，而且 MenuItem 的默认宿主就是它
 * （`constructor(D, T = window.siyuan.menus.menu)`），在这里 addItem 既落在主菜单、
 * 点完也能正常关闭菜单。
 */
function mainMenuOf(menu) {
    try {
        if (typeof window === "undefined") return null;
        const m = window.siyuan && window.siyuan.menus && window.siyuan.menus.menu;
        if (!m || m === menu) return null;
        if (typeof m.addItem !== "function" || !m.element) return null;
        if (typeof m.element.querySelector !== "function") return null;
        // 主菜单必须有 items 容器，否则是初始化阶段的空壳，退回去用子菜单更安全
        if (!m.element.querySelector(".b3-menu__items")) return null;
        return m;
    } catch (e) {
        return null;
    }
}

/**
 * 把刚 addItem 加进去的项搬到菜单最前面。
 * 思源块菜单有二十多项，插件默认 append 在最底部 —— 不滚到底根本看不见，
 * 用户会以为「没有这个菜单项」。这些项一直是直接挂在根菜单上的（没有 submenu），
 * 这里只是换位置，顺手补一条分隔线，免得和思源自己的第一项粘在一起。
 *
 * before：addItem 之前容器的子节点数，用来界定哪些是新加的。
 */
function promoteMenuItems(menu, before) {
    try {
        const root = menuItemRoot(menu);
        if (!root || !root.children) return;
        const kids = Array.prototype.slice.call(root.children);
        if (kids.length <= before) return;
        const fresh = kids.slice(before);
        const anchor = root.firstChild;
        for (const el of fresh) root.insertBefore(el, anchor);
        const doc = root.ownerDocument || (root.parentNode && root.parentNode.ownerDocument);
        if (doc && root.children.length > fresh.length) {
            const sep = doc.createElement("div");
            sep.className = "b3-menu__separator";
            root.insertBefore(sep, fresh[fresh.length - 1].nextSibling);
        }
    } catch (e) { /* 排不上就保持原位，功能不受影响 */ }
}

const DOM_TYPE_MAP = {
    NodeParagraph: "p", NodeHeading: "h", NodeTable: "t", NodeMathBlock: "m",
    NodeList: "l", NodeListItem: "i", NodeBlockquote: "b", NodeSuperBlock: "s",
    NodeCodeBlock: "c", NodeDocument: "d", NodeAttributeView: "av",
    NodeHTMLBlock: "html", NodeIFrame: "iframe", NodeVideo: "video", NodeAudio: "audio",
    NodeWidget: "widget", NodeThematicBreak: "tb",
};

/**
 * 是否在表格单元格内部（表格本身不算）。
 * 单元格里的段落/图片有自己的 data-node-id，右键也会落到它们身上；
 * 往那里写「图 1」会把单元格内容弄坏，所以在入口就标记出来、菜单里拦掉。
 */
function inTableCell(el) {
    try {
        if (!el || typeof el.closest !== "function") return false;
        const t = el.closest('[data-type="NodeTable"]');
        return !!t && t !== el;
    } catch (e) { return false; }
}

function domBlockMeta(el) {
    if (!el) return null;
    // 已经是 {id,type} 形态（单测、或未来思源改结构）直接放行
    if (!el.getAttribute && el.id) {
        return { id: String(el.id), type: String(el.type || ""), img: !!el.img, tbl: !!el.tbl };
    }
    if (!el.getAttribute) return null;
    const id = el.getAttribute("data-node-id") ||
        (el.dataset && el.dataset.nodeId) || el.id || "";
    if (!id) return null;
    const dt = (el.getAttribute("data-type") || el.dataset && el.dataset.type || "") + "";
    const tbl = inTableCell(el);
    // 图片是**行内节点**（span[data-type=img]），它自己的 id 不是「块」：
    // 题注段落得插在包着它的那个段落之后，所以这里先上溯到段落块，
    // 否则算出来的「下方一块」是图片后面的行内文字，插块也会插到奇怪的地方。
    if (dt === "img" || dt === "NodeImage") {
        let host = el;
        try { if (el.closest) host = el.closest('[data-type="NodeParagraph"]') || el; } catch (e) { host = el; }
        if (host && host !== el && host.getAttribute && host.getAttribute("data-node-id")) {
            return { id: host.getAttribute("data-node-id"), type: "p", img: true,
                typeName: "NodeParagraph", el: host, tbl: tbl };
        }
        return { id: id, type: "p", img: true, typeName: dt, el: el, tbl: tbl };
    }
    const type = DOM_TYPE_MAP[dt] || dt;
    let img = false;
    try {
        if (el.querySelector) img = !!el.querySelector('[data-type="img"], [data-type="NodeImage"], .img');
        if (!img && el.classList) img = el.classList.contains("img");
    } catch (e) { /* 拿不到就按段落处理，最多少拦一次 */ }
    return { id: id, type: type, img: img, typeName: dt, el: el, tbl: tbl };
}

/**
 * 图/表紧邻的那一块（只认普通段落，且不在表格里）。
 * 方向按学术排版惯例：**图题在下、表题在上** —— 所以图看下一个兄弟，表看上一个。
 * 返回 null = 那一侧没有可用段落；undefined = 拿不到 DOM（调用方就别提前判断）。
 */
function neighborPara(el, kind) {
    try {
        if (!el || !el.getAttribute) return undefined;
        const key = kind === "tab" ? "previousElementSibling" : "nextElementSibling";
        if (!(key in el)) return undefined;
        const nx = el[key];
        if (!nx || !nx.getAttribute) return null;
        const m = domBlockMeta(nx);
        if (!m || m.img || m.type !== "p" || m.tbl) return null;
        return { id: m.id, kind: nx.getAttribute("custom-xref") || "", text: nx.textContent || "" };
    } catch (e) { return undefined; }
}

/**
 * 块右键菜单该出哪几项（纯函数，离线可测）。
 * els  : 已规整的 [{id, type, img, tbl, next?}]，详见 captionMenu
 * look : (id) => ({kind, text})，kind 取自块根节点的 custom-xref 属性，text 是段落文字
 */

/** 媒体块能当哪种题注：图片→fig，表格→tab；公式/代码/列表等一律不放行 */
function mediaKindOf(e) {
    if (!e) return "";
    if (e.img) return "fig";
    if (e.type === "t") return "tab";
    return "";
}

/**
 * 右键图片/表格：题注不能写进它自己（会变成「图 1 ![图](…)」这种坏文本，
 * 表格更会直接毁掉表格结构），所以在它**旁边**插一个题注段落再编号 ——
 * 图题插在图下方，表题插在表上方（学术排版惯例，也符合用户习惯）。
 * 顺手提供两条捷径：那一侧已经是题注 → 给「取消」；那一侧是普通文字 → 给「设为…」。
 */
function mediaCaptionMenu(media) {
    const kinds = media.map(mediaKindOf);
    const bad = media.filter((e, i) => !kinds[i])[0];
    if (bad) return { ok: false, mode: "none", reason: "type:" + (bad.type || "?"), items: [] };
    if (kinds.some((k) => k !== kinds[0])) return { ok: false, mode: "none", reason: "mixed", items: [] };
    const kind = kinds[0];
    const word = kind === "fig" ? "图" : "表";
    const where = kind === "fig" ? "下方" : "上方";
    const icon = kind === "fig" ? "iconImage" : "iconTable";
    const items = [{ key: "add", label: "在" + where + "添加" + word + "题注", icon: icon, kind: kind, add: true }];
    if (media.length === 1) {
        const hasNext = "next" in media[0];
        const nb = hasNext ? media[0].next : undefined;
        if (nb && nb.id) {
            const nbKind = nb.kind || "";
            const capLike = nbKind === "fig" || nbKind === "tab" || NUM_HEAD.test(String(nb.text || ""));
            if (capLike) {
                // 已经是同类型题注（或老数据只有「图 3」前缀没属性）才给「取消」
                if (!nbKind || nbKind === kind) {
                    items.push({ key: "clear", label: "取消图表题注", icon: "iconTrashcan",
                        cancel: true, kind: kind, targets: [nb.id] });
                }
            } else if (String(nb.text || "").trim()) {
                items.push({ key: "use-next", label: "把" + where + "段落设为" + word + "题注", icon: icon,
                    kind: kind, targets: [nb.id] });
            }
        } else if (!hasNext) {
            // 拿不到 DOM，判断不了那一侧有没有题注 —— 保守留着「取消」，点下去现场再找
            items.push({ key: "clear", label: "取消图表题注", icon: "iconTrashcan", cancel: true, kind: kind });
        }
    }
    return { ok: true, mode: "media", reason: "", kind: kind, items: items };
}

/**
 * 块右键菜单该出哪几项（纯函数，离线可测）。
 * els  : 已规整的 [{id, type, img, tbl, next?}]
 * look : (id) => ({kind, text})，kind 取自块根节点的 custom-xref 属性，text 是段落文字
 *
 * 段落块：直接设成题注（往正文前面写「图 N」）。
 * 图片/表格：不给「直接设」，改成在下方插题注段落（见 mediaCaptionMenu）。
 * 表格单元格里的块：什么都不给 —— 往单元格里写编号会把表格搞坏。
 * 公式/代码/列表等：仍然拦住（buildPlan 会往块里写坏文本）。
 */
function captionMenu(els, look) {
    const list = (els || []).filter((e) => e && e.id);
    if (!list.length) return { ok: false, mode: "none", reason: "empty", items: [] };
    const inCell = list.filter((e) => e.tbl)[0];
    if (inCell) return { ok: false, mode: "none", reason: "table", items: [] };
    const isPara = (e) => !e.img && (!e.type || e.type === "p");
    const media = list.filter((e) => !isPara(e));
    if (media.length && media.length !== list.length) {
        return { ok: false, mode: "none", reason: "mixed", items: [] };
    }
    if (media.length) return mediaCaptionMenu(media);
    const info = list.map((e) => (look ? look(e.id) : null) || {});
    // 已经是题注（有属性，或正文本来就以「图 3」开头）才显示「取消」，避免误删普通文字
    const isCap = info.some((i) => i.kind === "fig" || i.kind === "tab" ||
        NUM_HEAD.test(String(i.text || "")));
    const items = [
        { key: "fig", label: "设为图题注", icon: "iconImage", kind: "fig" },
        { key: "tab", label: "设为表题注", icon: "iconTable", kind: "tab" },
    ];
    if (isCap) items.push({ key: "clear", label: "取消图表题注", icon: "iconTrashcan", cancel: true });
    return { ok: true, mode: "para", reason: "", items: items };
}

/** 不能用题注时的灰字说明（按原因给不同提示，别让人以为是插件坏了） */
function menuHint(reason) {
    if (reason === "table") return "图表题注：表格单元格内不支持，请右键表格本身或表格上方的题注段落";
    if (reason === "mixed") return "图表题注：请选中同类块（段落，或单张图/单个表）";
    if (reason === "type:m") return "图表题注：公式块会自动编号，不用设题注";
    return "图表题注：请右键图片/表格本身，或图下方（表上方）的题注段落";
}

/**
 * 文档顺序：一次 getDoc 拿到整篇 HTML，块在 HTML 里出现的先后就是 DFS 先序。
 * 实测 68 篇真实文档（2~348 块）与「逐块 getChildBlocks 递归」的顺序完全一致。
 * 而后者是 O(n) 次往返：348 块的文档要 349 次、约 1.5 秒；这里 1 次、约 10 毫秒。
 */
async function orderFromDoc(docId) {
    const doc = await api("/api/filetree/getDoc", { id: docId, size: 8 * 1024 * 1024 });
    const html = (doc && doc.content) || "";
    const re = /data-node-id="(\d{14}-[0-9a-z]{7})"/g;
    const out = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(html))) {
        const id = m[1];
        if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
}

/** 兜底顺序：逐块 getChildBlocks 走 DFS。慢，只在 getDoc 整篇拿不到时用 */
async function orderFromTree(docId, meta) {
    const out = [];
    const seen = new Set();
    async function walk(pid) {
        const kids = await api("/api/block/getChildBlocks", { id: pid });
        for (const c of kids) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            if (meta[c.id] && meta[c.id].type !== "d") out.push(meta[c.id]);
            await walk(c.id);
        }
    }
    await walk(docId);
    return out;
}

/** 单次采集：一条 SQL 拿全部块，一次 getDoc 定顺序 */
async function collectOnce(docId) {
    // blocks 表索引会滞后：刚建的块可能还查不到，问几次拿到就走
    let rows = [];
    // 只重试一次：collectBlocks 本身还要连采两轮比对，这里再死等就纯属浪费
    for (let i = 0; i < 2; i++) {
        rows = (await sql(
            "select id,type,subtype,parent_id,markdown,name,ial from blocks " +
            "where root_id='" + docId + "' limit -1" // limit -1：不加会被截到 64 行，长文档直接漏块
        )) || [];
        if (rows.length) break;
        await sleep(400);
    }
    if (!rows.length) return [];

    const meta = {};
    const all = [];
    rows.forEach((r) => {
        meta[r.id] = r;
        if (r.type !== "d" && r.id !== docId) all.push(r);
    });

    let order = [];
    try { order = await orderFromDoc(docId); } catch (e) { order = []; }

    const out = [];
    const got = new Set();
    for (const id of order) {
        const b = meta[id];
        if (b && b.type !== "d" && !got.has(id)) { got.add(id); out.push(b); }
    }
    if (!out.length && all.length) return await orderFromTree(docId, meta); // getDoc 整篇失败才退回老路
    // HTML 里没出现的块（渲染节点缺失，实测 68 篇里 0 例）：补到末尾，宁可顺序略差也不漏块。
    // 打上 stale 标记：这些块多半是「SQL 里还留着、实际已删」的残影，
    // collectBlocks 会把确认已死的剔掉，否则会连带污染编号和死链判定。
    if (out.length < all.length) {
        for (const b of all) if (!got.has(b.id)) { got.add(b.id); out.push(b); b.stale = true; }
    }
    return out;
}

/** 连续两次采集结果一致才返回：刚保存的块 blocks 表索引会滞后，直接读会漏掉引用 */
async function collectRaw(docId) {
    let prev = null;
    for (let round = 0; round < 4; round++) {
        const cur = await collectOnce(docId);
        const sig = cur.map((b) => b.id + ":" + (b.markdown || "").length).join("|");
        if (prev === sig) return cur;
        prev = sig;
        if (!cur.length) return cur; // 空文档没必要再等一轮
        await sleep(300);
    }
    return await collectOnce(docId);
}

/**
 * 剔掉「SQL 里还在、实际已删」的残影块。
 * 不剔的后果（1.0.2 前的真 bug）：
 *  - 死链：已删目标被算进 alive 集合 -> 「删了图，引用全部失效」检测不出来
 *  - 编号：给已删的题注留号，写回时 tree not found
 * 正常文档 stale 块数为 0，这条几乎零成本；有残影时也只对那几个块各问一次 getBlockDOM。
 */
async function dropStaleDead(blocks) {
    if (!blocks || !blocks.length) return blocks;
    let has = false;
    for (const b of blocks) if (b.stale) { has = true; break; }
    if (!has) return blocks;
    const dead = new Set();
    for (const b of blocks) {
        if (!b.stale) continue;
        if ((await isBlockAlive(b.id)) === false) dead.add(b.id);
    }
    if (!dead.size) return blocks;
    return blocks.filter((b) => !dead.has(b.id));
}

/** 采集入口：老行为 + 残影剔除 */
async function collectBlocks(docId) {
    return await dropStaleDead(await collectRaw(docId));
}

/**
 * 页面上真实存在的一级块 id（编辑器渲染结果，就是 ground truth）。
 * 用于校验 SQL 快照是否已经跟上 —— blocks 表延迟实测可达 2s+，
 * 刚敲出来的题注如果还没进索引，采集结果里根本没有它，
 * 计划自然是空的，于是「自动重排毫无反应」。只比一级块，够用且便宜。
 */
function domTopIds(protyle) {
    try {
        const ip = protyle ? (protyle.protyle || protyle) : null;
        const el = ip && ip.wysiwyg && ip.wysiwyg.element;
        if (!el || !el.children) return null;
        const out = [];
        for (let i = 0; i < el.children.length; i++) {
            const c = el.children[i];
            const id = c && c.getAttribute ? c.getAttribute("data-node-id") : "";
            if (id) out.push(id);
        }
        return out.length ? out : null;
    } catch (e) {
        return null; // 拿不到 DOM 就不做校验，退回纯 SQL 行为
    }
}

/**
 * 采集 + 用页面校验新鲜度。返回 { blocks, stale }：
 * stale=true 表示等了几轮，页面上还是有一级块不在快照里（索引没跟上）。
 */
async function collectFresh(docId, protyle) {
    let blocks = await collectBlocks(docId);
    const want = domTopIds(protyle);
    if (!want) return { blocks: blocks, stale: false };
    let stale = false;
    for (let i = 0; i < 4; i++) {
        const have = new Set(blocks.map((b) => b.id));
        let missing = 0;
        for (const id of want) if (!have.has(id)) missing++;
        if (!missing) return { blocks: blocks, stale: false };
        stale = true;
        await sleep(400);
        blocks = await collectBlocks(docId);
    }
    return { blocks: blocks, stale: stale };
}

/** 生成编号计划 + 需要刷新的引用 */
/** 取文档里最浅的标题级别作为分章依据（h1 优先，没有 h1 就用 h2，以此类推） */
function pickChapterLevel(blocks) {
    let lv = 9;
    for (const b of blocks) {
        if (b.type === "h" && b.subtype) {
            const n = parseInt(String(b.subtype).slice(1), 10);
            if (!isNaN(n) && n < lv) lv = n;
        }
    }
    return lv === 9 ? 0 : lv;
}

function buildPlan(blocks, s, deadSet) {
    const dead = deadSet instanceof Set ? deadSet : new Set();
    const act = s.deadRefAction || "off";
    const fixDead = act === "text" && dead.size > 0;
    const counters = { fig: 0, tab: 0, eq: 0 };
    const labelOf = { fig: s.figLabel, tab: s.tabLabel, eq: s.eqLabel };
    const chapLv = s.mode === "chapter" ? pickChapterLevel(blocks) : 0;
    let chapter = 1;
    let seenH1 = false;
    const plan = [];
    for (const b of blocks) {
        if (chapLv && b.subtype === "h" + chapLv) {
            if (seenH1) {
                chapter += 1;
                counters.fig = counters.tab = counters.eq = 0;
            }
            seenH1 = true;
            continue;
        }
        const kind = classify(b, s);
        if (!kind) continue;
        counters[kind] += 1;
        const seq = s.mode === "chapter" ? chapter + "-" + counters[kind] : String(counters[kind]);
        const label = labelOf[kind];
        const name = label + " " + seq;
        const body = stripNumber(kind, b.markdown || "");
        let newMd = null;
        // 公式体为空时绝不写 tag：否则会造出 `$$\n\tag{1-4}\n$$` 这种只剩编号的坏块，
        // 而且它是自维持的（下一轮 stripNumber 还是空），比不编号坏得多。
        const emptyEq = kind === "eq" && !String(body).replace(/[\\{}\s]/g, "");
        if (kind === "eq") {
            newMd = emptyEq ? null : "$$\n" + body + " \\tag{" + seq + "}\n$$";
        } else if (b.type !== "t") {
            newMd = name + " " + body;
        }
        plan.push({ id: b.id, type: b.type, kind: kind, seq: seq, name: name, newMd: newMd,
            emptyEq: emptyEq,
            oldMd: (b.markdown || "").slice(0, 60),
            curMd: b.markdown || "",   // 未截断的原内容，用来判断「真的需要重写吗」
            ial: b.ial || "",
            // 图/表题注默认居中 + 浅底色（公式块本身居中，不用设）
            center: s.centerCaption !== false && (kind === "fig" || kind === "tab"),
            bg: (kind === "fig" || kind === "tab") ? captionBgOf(s) : "" });
    }
    const anchor = {};
    plan.forEach((p) => { anchor[p.id] = p.name; });
    const refs = [];
    const deadRefs = [];
    if (s.refreshRefs || fixDead) {
        const REF = /\(\((\d{14}-[0-9a-z]{7})\s+(["'])(.*?)\2\)\)/g;
        for (const b of blocks) {
            const md = b.markdown || "";
            if (md.indexOf("((") < 0) continue;
            let changed = false;
            let fixedDead = 0;
            const next = md.replace(REF, (whole, bid, q, old) => {
                if (anchor[bid]) {
                    if (!s.refreshRefs) return whole;
                    if (anchor[bid] !== old) {
                        changed = true;
                        return "((" + bid + ' "' + anchor[bid] + '"))';
                    }
                    return whole;
                }
                if (fixDead && dead.has(bid)) {
                    changed = true;
                    fixedDead += 1;
                    return deadText(old);
                }
                return whole;
            });
            if (changed) {
                refs.push({ id: b.id, next: next, old: md.slice(0, 60) });
                if (fixedDead) deadRefs.push({ id: b.id, from: md, to: next, n: fixedDead });
            }
        }
    }
    return { plan: plan, refs: refs, deadRefs: deadRefs };
}

/**
 * 把一块「已经被删掉」的块按记录里的 DOM 原样插回去。
 *
 * 为什么值得专门做：思源 insertBlock 会**保留 DOM 里写死的 data-node-id**
 * （2026-10-31 实测），所以重建出来的块 ID 和删除前一模一样，
 * 指向它的 ((块ID "锚")) 会立刻自动接回 —— 这是「删了图/表还能救回来」的唯一办法。
 *
 * 安全前提：先确认它真的不存在，活着的一律不动（避免重复插入）。
 */
async function rebuildBlock(dom, id, pid, attrs) {
    if (!dom || !id) return false;
    // 存在性一律看 DOM，不看 SQL：blocks 表索引滞后实测可超 1.2s，
    // 刚插进去就查会误判成「没插成功」，反过来也会把活块当成死的
    const isAlive = async () => {
        try {
            const d = await api("/api/block/getBlockDOM", { id: id });
            return !!(d && d.dom);
        } catch (e) { return false; }
    };
    if (await isAlive()) return false;          // 还活着，不该重建
    const parent = pid || docIdFromDom();
    if (!parent) return false;
    // 旧 DOM 里的 index / updated 是上次渲染的产物，带着会让块的排序时间和更新时间错乱
    const clean = String(dom)
        .replace(/\sdata-node-index="[^"]*"/g, "")
        .replace(/\supdated="[^"]*"/g, "");
    if (clean.indexOf('data-node-id="' + id + '"') < 0) return false;   // DOM 和 id 对不上就别乱插
    try {
        await api("/api/block/insertBlock", { dataType: "dom", data: clean, parentID: parent });
    } catch (e) {
        await logErr("rebuildBlock/insert", e);
        return false;
    }
    // DOM 里没有 IAL（name / custom-xref / style 是 setBlockAttrs 单独写的），跟着一起补回去，
    // 否则重建出来的题注没名字、没居中、下一轮识别不到它是个图
    if (attrs && Object.keys(attrs).length) {
        try { await api("/api/attr/setBlockAttrs", { id: id, attrs: attrs }); } catch (e) { await logErr("rebuildBlock/attrs", e); }
    }
    for (let i = 0; i < 6; i++) {
        await sleep(250);
        if (await isAlive()) return true;
    }
    return false;
}

/** IAL 里某属性是否已经等于目标值 */
function ialHas(ial, key, val) {
    if (!ial) return false;
    const esc = String(val).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp('(^|\\s)' + key + '="' + esc + '"').test(ial);
}

/** 取 IAL 里某个属性的当前值（没有就空串）——撤销时要把老值原样写回去 */
function ialValue(ial, key) {
    if (!ial) return "";
    const m = new RegExp('(?:^|\\s)' + key + '="([^"]*)"').exec(ial);
    return m ? m[1] : "";
}

/**
 * 把烧成纯文本的引用改回 ((块ID "锚"))。
 * 思源把 ~~<span style="color:…">锚</span>~~ 归一化后有三种落法，实测都得认：
 *   ① kramdown： ~~锚~~{: style="color:var(--b3-font-color1)"}      ← getBlockKramdown 拿到的就是它
 *   ② HTML：     <span data-type="s" style="color:…">锚</span>
 *   ③ HTML：     ~~<span …>锚</span>~~
 * 只认带 var(--b3-font-color1) 的那个，用户自己敲的删除线不碰。
 * map 是「锚文本 -> 块ID」，锚文本取自出事前那份原文（dead-fix-log 的 from）。
 */
const DEAD_COLOR = "var(--b3-font-color1)";

function restoreDeadInMd(md, map) {
    let out = String(md || "");
    const hit = (t) => {
        const key = String(t).replace(/<[^>]+>/g, "").trim();
        return map[key] ? '((' + map[key] + ' "' + key + '"))' : null;
    };
    // ① kramdown 形态（最常遇到）
    out = out.replace(/~~([^~\n]+)~~\{:([^}]*)\}/g, (whole, t, ial) => {
        if (ial.indexOf(DEAD_COLOR) < 0) return whole;
        return hit(t) || whole;
    });
    // ② HTML span 形态
    out = out.replace(/<span[^>]*data-type="s"[^>]*>([^<]*)<\/span>/g, (whole, t) => {
        if (whole.indexOf(DEAD_COLOR) < 0) return whole;
        return hit(t) || whole;
    });
    // ③ ~~<span…>锚</span>~~ 形态
    out = out.replace(/~~<span[^>]*>([^<]*)<\/span>~~/g, (whole, t) => {
        if (whole.indexOf(DEAD_COLOR) < 0) return whole;
        return hit(t) || whole;
    });
    return out;
}

/** 数一下这次还原了几处：只比较删除线数量差，用户自己的删除线前后不变，不会误计 */
function countRestored(before, after) {
    const n = (s) => (String(s).match(/~~[^~\n]+~~/g) || []).length;
    return Math.max(0, n(before) - n(after));
}

/** 取一个可用的 Lute：优先用当前编辑器自带的那个（配置与正文一致），其次 window.Lute */
let LUTE_ONCE = null; // 自建 Lute 只造一次：每改一个块新建一个纯属浪费

function getLute(protyle) {
    if (protyle && protyle.lute && typeof protyle.lute.Md2BlockDOM === "function") return protyle.lute;
    if (LUTE_ONCE) return LUTE_ONCE;
    try {
        if (typeof window !== "undefined" && window.Lute && typeof window.Lute.New === "function") {
            const l = window.Lute.New();
            if (l && typeof l.Md2BlockDOM === "function") {
                if (l.SetProtyleWYSIWYG) l.SetProtyleWYSIWYG(true);
                if (l.SetKramdownIAL) l.SetKramdownIAL(true);
                LUTE_ONCE = l;
                return l;
            }
        }
    } catch (e) { /* 拿不到就走 md 兜底 */ }
    return null;
}

/**
 * 把 Lute 新生成的块 DOM 的「内容」搬进当前块的根节点，根的属性原样保留。
 * 关键：块的 IAL（name / style / custom-* / memo…）全部挂在根节点的 HTML 属性上，
 * 只要根节点不换，属性就不会丢——这正是 markdown 模式做不到的。
 * data-type / data-subtype / data-content / class 属于结构，必须跟着新内容走。
 */
function mergeBlockDom(curDom, builtDom) {
    if (!curDom || !builtDom || typeof DOMParser === "undefined") return null;
    const P = new DOMParser();
    const curDoc = P.parseFromString(curDom, "text/html");
    const newDoc = P.parseFromString(builtDom, "text/html");
    const cur = curDoc.body.firstElementChild;
    const nw = newDoc.body.firstElementChild;
    if (!cur || !nw) return null;
    // 类型变了（段落变列表之类）不硬套，交给 md 兜底
    if ((cur.getAttribute("data-type") || "") !== (nw.getAttribute("data-type") || "")) return null;

    ["data-type", "data-subtype", "data-content", "class"].forEach((k) => {
        const v = nw.getAttribute(k);
        if (v === null) cur.removeAttribute(k);
        else cur.setAttribute(k, v);
    });

    const attrBox = cur.querySelector(":scope > .protyle-attr");
    Array.from(cur.children).forEach((el) => { if (el !== attrBox) el.remove(); });
    Array.from(nw.children).forEach((el) => {
        if (el.classList && el.classList.contains("protyle-attr")) return;
        cur.insertBefore(curDoc.adoptNode(el), attrBox || null);
    });
    return cur.outerHTML;
}

/** DOM 里有没有真实的行内块引用节点（不是字面文本） */
function hasRefNode(dom) {
    return /data-type="block-ref"/.test(String(dom || ""));
}

/**
 * 改块内容：优先 DOM 模式（保留 IAL），拿不到 Lute 才退回 markdown 模式。
 * 返回 true 表示走的是 DOM（属性安全），false 表示走了 md（IAL 已被清空，需要补写属性）。
 * rec 传了就把「改前 / 改后」的 DOM 记进撤销记录，用户能一键退回。
 */
async function updateContent(id, md, protyle, rec) {
    const lut = getLute(protyle);
    if (lut) {
        try {
            const cur = await api("/api/block/getBlockDOM", { id: id });
            const merged = mergeBlockDom(cur && cur.dom, lut.Md2BlockDOM(md));
            if (merged) {
                // 防呆：原块里有可点的块引用、合并后却没了，说明这一版 Lute 把 ((id "锚"))
                // 当成了字面文本。这种写入会把引用彻底毁掉（用户只能看到 ((2026… "图 1-1")），
                // 宁可不写也不毁内容。2026-10-31 用户实测踩到过这个形态。
                // 只在「原来有、现在没了」时拦：原来没有的情况交给思源自己判断
                if (hasRefNode(cur && cur.dom) && !hasRefNode(merged)) {
                    await logErr("updateContent/ref-lost",
                        new Error("合并后引用节点丢失，已跳过写入 id=" + id));
                    return true;
                }
                await retry(() => api("/api/block/updateBlock",
                    { id: id, dataType: "dom", data: merged }));
                if (rec) rec.items.push({ id: id, before: (cur && cur.dom) || "", after: merged });
                return true;
            }
        } catch (e) {
            await logErr("updateContent/dom", e);
        }
    }
    // md 兜底会清空 IAL，改前那份 DOM 还得单独取一次，否则撤销时没有可回退的内容
    let before0 = "";
    if (rec) {
        try { before0 = ((await api("/api/block/getBlockDOM", { id: id })) || {}).dom || ""; }
        catch (e) { before0 = ""; }
    }
    await retry(() => api("/api/block/updateBlock",
        { id: id, dataType: "markdown", data: md }));
    if (rec && before0) {
        try {
            const after0 = ((await api("/api/block/getBlockDOM", { id: id })) || {}).dom || "";
            if (after0) rec.items.push({ id: id, before: before0, after: after0 });
        } catch (e) { /* 取不到就不记，撤销时跳过这块 */ }
    }
    return false;
}

/**
 * 数学块专用：只改根节点 data-content 上的 \tag，不经过 Lute、不动子节点。
 *
 * 为什么单独开这条路：数学公式的正文存在块根节点的 data-content 属性里（不在子节点内），
 * 走 Md2BlockDOM + mergeBlockDom 时一旦 Lute 的 DOM 结构对不上，就会把 data-content 覆盖成空，
 * 公式正文整个丢失、只剩 \tag。这里直接读当前 DOM 的真值来算，天生免疫 blocks 表索引滞后。
 *
 * 返回 true = 内容已是目标值或已写好；false = 空公式/不是数学块，没动。
 */
async function updateMathTag(id, seq, rec) {
    if (typeof DOMParser === "undefined") return false;
    const cur = await api("/api/block/getBlockDOM", { id: id });
    const dom = cur && cur.dom;
    if (!dom) return false;
    const root = new DOMParser().parseFromString(dom, "text/html").body.firstElementChild;
    if (!root || root.getAttribute("data-type") !== "NodeMathBlock") return false;
    const raw = root.getAttribute("data-content");
    if (raw === null) return false;
    const body = String(raw).replace(/\\{1,2}tag\s*\{[^}]*\}/g, "").trim();
    // 只剩反斜杠/花括号/空白也算空：这类残留当正文写回去只会做脏块
    if (!body.replace(/[\\{}\s]/g, "")) return false;  // 空公式：宁可不动，也不写只有一个 tag 的块
    const next = body + " \\tag{" + seq + "}";
    if (next === String(raw).trim()) return true;   // 已经是目标值，省一次写入
    root.setAttribute("data-content", next);
    const out = root.outerHTML;
    await retry(() => api("/api/block/updateBlock",
        { id: id, dataType: "dom", data: out }));
    if (rec) rec.items.push({ id: id, before: dom, after: out });
    return true;
}

/**
 * 防误写：新内容比旧内容短掉一半以上，基本是「采集到的是旧快照/半截内容」。
 * 这种情况宁可不改，也不能用残缺内容覆盖用户刚写的东西。
 */
function looksLossy(oldMd, newMd) {
    const a = String(oldMd || "").replace(/\s/g, "").length;
    const b = String(newMd || "").replace(/\s/g, "").length;
    if (a < 8) return false;
    return b < a * 0.6;
}

/** 在已有 style 上补居中，别把用户自己设的颜色、缩进等冲掉 */
/** 取出块 IAL 里的 style 声明串（没有就空串） */
function styleOf(ial) {
    const m = /\bstyle="([^"]*)"/.exec(ial || "");
    return (m ? m[1] : "").trim();
}

function appendDecl(s, decl) {
    return (s ? s.replace(/\s*;?\s*$/, "; ") : "") + decl;
}

/** 按需给题注补居中 / 背景，已有声明（颜色、缩进等）一律保留 */
function captionStyle(ial, opt) {
    let s = styleOf(ial);
    if (opt.center && !/text-align\s*:\s*center/i.test(s)) s = appendDecl(s, "text-align: center;");
    if (opt.bg && !/background-color\s*:/i.test(s)) s = appendDecl(s, "background-color: " + opt.bg + ";");
    return s;
}

/**
 * 我们给题注写过的块命名长什么样：`label + " " + seq`（「图 3」「表 1-2」「式 2」），
 * 除标签和编号外没有别的字。取消题注时要靠这个认出「这名字是插件写的」，
 * 否则用户自己起的块名（比如「图 1 试验设计」）会被一起抹掉。
 */
function captionLabelList(s) {
    const out = [];
    const push = (x) => {
        const t = String(x || "").trim();
        if (t && out.indexOf(t) < 0) out.push(t);
    };
    if (s) { push(s.figLabel); push(s.tabLabel); push(s.eqLabel); }
    ["图", "表", "式", "Figure", "Table", "Equation", "Eq"].forEach(push);
    // 长标签优先，否则「Equation 3」会先被「Eq」匹配掉一半
    return out.sort((a, b) => b.length - a.length);
}

function isAutoCaptionName(name, s) {
    const v = String(name || "").trim();
    if (!v) return false;
    const labs = captionLabelList(s).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp("^(?:" + labs.join("|") + ")\\s+\\d+(?:-\\d+)?$").test(v);
}

/** CSS 值归一化：只为比对用（去空白、小写、去掉小数末尾的 0，0.10 与 0.1 视为同一个） */
function normCssVal(v) {
    return String(v || "").replace(/\s+/g, "").toLowerCase()
        .replace(/(\d+\.\d*?)0+(?=[,)])/g, "$1")
        .replace(/\.(?=[,)])/g, "");
}

/**
 * 去掉题注底色。只按调色板里的值精确匹配 —— 插件只会写这几个 rgba，
 * 用户自己在工具条上设的底色（var(--b3-…) 之类）一定不匹配，不会被误删。
 * 返回 null 表示没动；返回 "" 表示样式整体清空。
 */
function stripCaptionBg(style) {
    const cur = String(style || "").trim();
    if (!cur) return null;
    const want = {};
    Object.keys(CAPTION_BG).forEach((k) => {
        const v = CAPTION_BG[k];
        if (v) want[normCssVal(v)] = 1;
    });
    const kept = [];
    let hit = false;
    for (const d of cur.split(";")) {
        const t = d.trim();
        if (!t) continue;
        const i = t.indexOf(":");
        const prop = (i < 0 ? "" : t.slice(0, i)).trim().toLowerCase();
        if (prop === "background-color" && want[normCssVal(t.slice(i + 1))]) { hit = true; continue; }
        kept.push(t);
    }
    if (!hit) return null;
    return kept.length ? kept.join("; ") + ";" : "";
}

/** 兼容旧调用：只补居中 */
function centerStyle(ial) {
    return captionStyle(ial, { center: true });
}

async function applyPlan(plan, refs, skip, protyle, rec) {
    const miss = skip || new Set();
    // 只有走 md 兜底时 IAL 才会被清空，这些块稍后要全量补属性
    const wiped = new Set();
    let lossy = 0;
    // 第一轮：改内容。DOM 模式下 IAL 不受影响，所以顺序其实无所谓，
    // 但兜底路径仍会把属性冲掉，属性补写在最后统一做最稳。
    for (const p of plan) {
        if (miss.has(p.id)) continue;
        if (p.kind === "eq") {
            // 公式：只改 data-content 的 \tag，不重建块 —— 这是唯一不会丢公式正文的写法
            if (p.emptyEq) continue;                 // 空公式不编号
            try { await updateMathTag(p.id, p.seq, rec); } catch (e) { await logErr("applyPlan/math", e); }
            await sleep(120);
            continue;
        }
        // 内容没变就不写：避免每轮自动重排都重写全文、刷一堆历史记录
        if (p.newMd && p.newMd !== p.curMd) {
            if (looksLossy(p.curMd, p.newMd)) { lossy += 1; continue; }
            const ok = await updateContent(p.id, p.newMd, protyle, rec);
            if (!ok) wiped.add(p.id);
            await sleep(150);
        }
    }
    for (const r of refs) {
        if (miss.has(r.id)) continue;
        if (looksLossy(r.old || "", r.next || "")) { lossy += 1; continue; }
        const ok = await updateContent(r.id, r.next, protyle, rec);
        if (!ok) wiped.add(r.id);
        await sleep(150);
    }
    // 第二轮：补属性。正常情况下 DOM 写入没动属性，这里只会补「本来就没有」的那几个。
    for (const p of plan) {
        if (miss.has(p.id)) continue;
        const full = wiped.has(p.id);
        const attrs = {};
        if (full || !ialHas(p.ial, "name", p.name)) attrs.name = p.name;
        if (full || !ialHas(p.ial, "custom-xref", p.kind)) attrs["custom-xref"] = p.kind;
        if (p.center || p.bg) {
            const cur = full ? "" : (p.ial || "");
            const want = captionStyle(cur, { center: p.center, bg: p.bg });
            if (styleOf(cur) !== want) attrs.style = want;
        }
        if (!Object.keys(attrs).length) continue;
        // 撤销要能把属性还原：记下这三个键改之前的值（空串 = 原本没有，撤销时写空即删除）。
        // 即使走 md 兜底（full=true，属性已被清空）也要从采集快照 p.ial 里取旧值，
        // 否则撤销只能把属性写成空，name / custom-xref 就永久丢了
        const old = {};
        Object.keys(attrs).forEach((k) => { old[k] = ialValue(p.ial, k); });
        await retry(() => api("/api/attr/setBlockAttrs", { id: p.id, attrs: attrs }));
        if (rec) rec.attrs.push({ id: p.id, before: old, after: attrs });
        await sleep(80);
    }
}

/** callback 收到的是 Protyle 实例（.protyle 才是 IProtyle），两种都兼容；拿不到就退回查 DOM */
function getDocId(p) {
    const ip = p ? (p.protyle || p) : null;
    const b = (ip && ip.block) || {};
    const id = b.rootID || b.id || "";
    if (id) return id;
    return docIdFromDom();
}

/** 在当前块里找出 "/xxx" 触发文本的范围（斜杠面板关闭后选区会丢，得自己找回来） */
function slashRangeIn(blockEl) {
    if (!blockEl || !blockEl.querySelectorAll) return null;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null);
    let node = null;
    let best = null;
    let bestIdx = -1;
    while ((node = walker.nextNode())) {
        const t = node.data || "";
        const k = t.lastIndexOf("/");
        if (k >= 0) { best = node; bestIdx = k; }
    }
    if (!best) return null;
    const tail = best.data.slice(bestIdx + 1);
    // "/xref" 这类触发串：短、无空白，否则不是斜杠命令残留
    if (tail.length > 24 || /\s/.test(tail)) return null;
    const r = document.createRange();
    r.setStart(best, bestIdx);
    r.setEnd(best, bestIdx + 1 + tail.length);
    return r;
}

/**
 * 把选区恢复到斜杠触发文本处，让 protyle.insert 插在正确位置。
 * 斜杠菜单只调 callback(protyle, nodeEl)，既不删 /xref 也不恢复选区，
 * 直接用 protyle.insert 会落到文档开头（实测过）。
 */
/** 终极兜底：扫可见编辑区，找文本以 "/xxx" 结尾的块（就是斜杠命令留下的那块） */
function findSlashBlock() {
    if (typeof document === "undefined") return "";
    const wys = document.querySelectorAll(".protyle-wysiwyg");
    for (let i = wys.length - 1; i >= 0; i--) {
        if (wys[i].offsetParent === null) continue; // 跳过不可见编辑区
        const els = wys[i].querySelectorAll("[data-node-id]");
        for (let j = els.length - 1; j >= 0; j--) {
            const t = (els[j].textContent || "").trim();
            if (/\/[A-Za-z\u4e00-\u9fa5]{1,24}$/.test(t)) {
                return els[j].getAttribute("data-node-id");
            }
        }
    }
    return "";
}

function restoreCaret(blockId) {
    if (typeof document === "undefined") return false;
    const id = blockId || findSlashBlock();
    const blockEl = id
        ? document.querySelector('.protyle-wysiwyg [data-node-id="' + id + '"]')
        : null;
    const sel = window.getSelection();
    if (!sel) return false;
    const r = slashRangeIn(blockEl);
    sel.removeAllRanges();
    if (r) {
        sel.addRange(r); // 选中 "/xref"，insert 会替换掉它
        return true;
    }
    if (blockEl) {
        const rr = document.createRange();
        rr.selectNodeContents(blockEl);
        rr.collapse(false);
        sel.addRange(rr);
        return true;
    }
    return false;
}

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 给指向已删块的引用 span 加红：只在当前打开文档可见，导出靠锚文本里的〔已删除〕 */
function paintDead(ids) {
    if (typeof document === "undefined") return 0;
    const set = new Set(ids || []);
    let n = 0;
    const spans = document.querySelectorAll('.protyle-wysiwyg span[data-type="block-ref"]');
    for (const el of spans) {
        const id = el.getAttribute("data-id") || "";
        if (set.has(id)) { el.classList.add("xref-dead"); n++; }
        else el.classList.remove("xref-dead");
    }
    return n;
}

class SiYuanXref extends Plugin {
    /** 顶层保护：onload 抛异常会让思源把插件标成「加载失败」，这里一律吞掉并留痕 */
    async onload() {
        try {
            await this.boot();
        } catch (e) {
            await logErr("onload", e);
            try { console.error("[siyuan-xref] 加载失败", e); } catch (err) {}
            showMessage("siyuan-xref 加载异常：" + (e && e.message ? e.message : e) +
                "（详见 data/storage/petal/siyuan-xref/err-log.json）", 9000, "error");
        }
    }

    async boot() {
        // 先同步注册斜杠命令：onload 内后续有 await，避免打开文档时读不到
        this.protyleSlash = [
            {
                id: "xref-ref",
                filter: ["xref", "交叉引用", "图ref", "tref"],
                html: '<div class="b3-list-item__first"><span class="b3-list-item__text">交叉引用</span>' +
                    '<span class="b3-list-item__meta">图 / 表 / 式</span></div>',
                showInLite: true,
                callback: (protyle, nodeEl) => {
                    this.openPicker(protyle, nodeEl).catch((e) => {
                        logErr("slash:xref", e);
                        showMessage("siyuan-xref 出错：" + (e && e.message ? e.message : e), 8000, "error");
                    });
                },
            },
            {
                id: "xref-num",
                filter: ["xrefnum", "重排编号", "图表编号"],
                html: '<div class="b3-list-item__first"><span class="b3-list-item__text">重排图表编号</span>' +
                    '<span class="b3-list-item__meta">同步刷新引用</span></div>',
                showInLite: true,
                callback: (protyle) => {
                    this.renumber(protyle).catch((e) => { logErr("slash:xrefnum", e); });
                },
            },
        ];
        // 原生命令：注册后自动出现在「设置 → 快捷键 → 插件」里，可以在那里改键；
        // 默认不占键位（hotkey 留空），实际快捷键由插件设置面板统一管理，避免两套键互撞。
        try {
            this.addCommand({
                langKey: "xrefInsert",
                langText: "插入交叉引用",
                hotkey: "",
                editorCallback: (protyle) => { this.fire("insert", protyle, null); },
            });
            this.addCommand({
                langKey: "xrefRenumber",
                langText: "重排图表编号",
                hotkey: "",
                editorCallback: (protyle) => { this.fire("num", protyle, null); },
            });
            this.addCommand({
                langKey: "xrefUndo",
                langText: "撤销上次重排",
                hotkey: "",
                editorCallback: () => { this.fire("undo", null, null); },
            });
            this.addCommand({
                langKey: "xrefRedo",
                langText: "重做重排",
                hotkey: "",
                editorCallback: () => { this.fire("redo", null, null); },
            });
        } catch (e) { logErr("addCommand", e); }
        // 自检：onload 真跑通才写这个文件，排查"插件装了但不生效"用
        try {
            await this.saveData("load-check.json", {
                loadedAt: new Date().toISOString(),
                version: await ownVersion(this),
                slash: ["xref", "xrefnum"],
                auto: true,
            });
        } catch (e) { /* 自检失败不影响主功能 */ }
        // 失败留痕落到 data/storage/petal/siyuan-xref/err-log.json
        LOG_SINK = async (arr) => { try { await this.saveData("err-log.json", arr); } catch (e) {} };

        // 全局 fetch 探针**默认不装**：它会给思源每一个 /api/ 请求都 clone 响应、解析 JSON，
        // 长期挂着会白白拖慢整个应用。只在排查问题时（设置里打开「诊断日志」）才装。
        this.settings = Object.assign({}, DEFAULTS, (await this.loadData("settings.json")) || {});
        // 1.0.1 一次性迁移：旧默认 text 会把 ((块ID)) 烧掉、块恢复也接不回来。
        // 已经写在 settings.json 里的旧值不会自动变成新默认，所以这里强制改一次并打标记，
        // 之后用户自己再选「转成文本」就不再干预
        if (!this.settings.migrated101) {
            if ((this.settings.deadRefAction || "text") === "text") this.settings.deadRefAction = "mark";
            this.settings.migrated101 = true;
            try { await this.saveData("settings.json", this.settings); } catch (e) {}
        }
        // 1.0.2 一次性迁移：标红（mark）看着像「插件把引用改坏了」，默认改成不标记。
        // 想看的可以在设置里自己开回来，开过就不再干预
        if (!this.settings.migrated102) {
            if ((this.settings.deadRefAction || "mark") === "mark") this.settings.deadRefAction = "off";
            this.settings.migrated102 = true;
            try { await this.saveData("settings.json", this.settings); } catch (e) {}
        }
        // 撤销栈要跨重启保留：用户可能改完关掉思源才想起来要撤
        await this.loadUndo();
        // 把补全默认值后的设置落盘，排查「设置项没生效」时能直接看文件
        try { await this.saveData("settings.json", this.settings); } catch (e) {}
        this.setting = new Setting({ confirmCallback: () => this.saveSettings() });
        this.setting.addItem({
            title: "编号模式",
            description: "全文连续（图 1、图 2）或按一级标题分章（图 1-1、图 2-1）",
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [["continuous", "全文连续"], ["chapter", "按章编号"]].forEach(([v, t]) => {
                    const o = document.createElement("option");
                    o.value = v;
                    o.textContent = t;
                    if (this.settings.mode === v) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => { this.settings.mode = sel.value; this.saveSettings(); });
                return sel;
            },
        });
        this.setting.addItem({
            title: "图 / 表 / 式 标签",
            description: "题注前缀文字，例如填 Figure / Table / Eq",
            createActionElement: () => {
                const box = document.createElement("div");
                [["figLabel", "图"], ["tabLabel", "表"], ["eqLabel", "式"]].forEach(([k, ph]) => {
                    const inp = document.createElement("input");
                    inp.className = "b3-text-field fn__size80";
                    inp.placeholder = ph;
                    inp.value = this.settings[k];
                    inp.style.marginRight = "4px";
                    inp.addEventListener("change", () => { this.settings[k] = inp.value.trim() || ph; this.saveSettings(); });
                    box.appendChild(inp);
                });
                return box;
            },
        });
        this.setting.addItem({
            title: "重排时同步刷新引用",
            description: "把 ((块ID \"旧锚文本\")) 全部改成新编号。关闭后只改编号不动引用",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.refreshRefs;
                inp.addEventListener("change", () => { this.settings.refreshRefs = inp.checked; this.saveSettings(); });
                return inp;
            },
        });

        this.setting.addItem({
            title: "自动重排",
            description: "写完题注停手 1.5 秒后自动重排编号并刷新引用。不会写入光标所在的块，避免打断输入",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.autoMode;
                inp.addEventListener("change", () => {
                    this.settings.autoMode = inp.checked;
                    this.saveSettings();
                });
                return inp;
            },
        });
        this.setting.addItem({
            title: "文字自动识别",
            description: "正文以「图 3 ……」「表 2 ……」开头的段落自动当作题注参与编号。关掉后只认" +
                "右键菜单设的题注（custom-xref 属性）——正文里顺口写到「图 3 中可以看出」这种普通段落" +
                "就不会被误编号。自动识别本来就要等索引进位，慢一点没关系；右键设的题注不受此开关影响，点了立刻生效",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.textDetect !== false;
                inp.addEventListener("change", () => {
                    this.settings.textDetect = inp.checked;
                    this.saveSettings();
                });
                return inp;
            },
        });
        this.setting.addItem({
            title: "失效引用怎么处理",
            description: "指向已删块、或指向「已取消题注」的块的引用。默认「不处理」：引用原样留着，删块后按 Ctrl+Alt+Z 能把块重建回来、" +
                "引用自动接回；「仅标红」会在正文里涂红加删除线（看着像内容被改坏）；" +
                "「转成文本」会让引用彻底失效、无法还原，还会等 10 秒才动手",
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [
                    ["off", "不处理，保持原样（推荐）"],
                    ["mark", "仅标红，保留引用"],
                    ["text", "转成红色删除线文本（不可逆）"],
                ].forEach(([v, t]) => {
                    const o = document.createElement("option");
                    o.value = v;
                    o.textContent = t;
                    if ((this.settings.deadRefAction || "off") === v) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => {
                    this.settings.deadRefAction = sel.value;
                    this.saveSettings();
                    // 从标红切到「不处理」要立刻把已经涂上的红去掉，否则得等下一次编辑
                    if (sel.value !== "mark") { this._deadIds = []; paintDead([]); }
                });
                return sel;
            },
        });

        this.setting.addItem({
            title: "题注居中",
            description: "重排时把「图 N …」「表 N …」题注段落设为居中",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.centerCaption !== false;
                inp.addEventListener("change", () => {
                    this.settings.centerCaption = inp.checked;
                    this.saveSettings();
                });
                return inp;
            },
        });

        this.setting.addItem({
            title: "题注底色",
            description: "给「图 N …」「表 N …」题注加一层很淡的底色，暗色主题下也看得清；自己设过底色的不会被改",
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [
                    ["none", "无底色"],
                    ["faint", "极浅"],
                    ["light", "浅（默认）"],
                    ["blue", "浅蓝"],
                ].forEach(([v, t]) => {
                    const o = document.createElement("option");
                    o.value = v;
                    o.textContent = t;
                    if ((this.settings.captionBg || "light") === v) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => {
                    this.settings.captionBg = sel.value;
                    this.saveSettings();
                });
                return sel;
            },
        });

        // 自定义快捷键：点输入框后直接按组合键，录完立刻生效并落盘
        this.setting.addItem({
            title: "自定义快捷键",
            description: "点一下输入框，再按下想用的组合键（必须带 Ctrl / Alt / ⌘）。Backspace 清空，Esc 取消。" +
                "同时也会出现在「设置 → 快捷键 → 插件」里，两处改都行",
            createActionElement: () => {
                // 竖排两行：设置面板右侧这一栏窄，横着放开两个框会被裁掉
                const box = document.createElement("div");
                box.style.display = "flex";
                box.style.flexDirection = "column";
                box.style.rowGap = "6px";
                box.style.width = "190px";
                [["keyInsert", "插入交叉引用"], ["keyRenumber", "重排编号"],
                 ["keyUndo", "撤销上次重排"], ["keyRedo", "重做"]].forEach(([k, label]) => {
                    const wrap = document.createElement("div");
                    wrap.style.display = "flex";
                    wrap.style.alignItems = "center";
                    wrap.style.columnGap = "8px";
                    const tip = document.createElement("span");
                    tip.textContent = label;
                    tip.style.fontSize = "12px";
                    tip.style.opacity = "0.72";
                    tip.style.whiteSpace = "nowrap";
                    tip.style.flex = "0 0 auto";
                    const inp = document.createElement("input");
                    inp.className = "b3-text-field";
                    inp.style.flex = "1 1 auto";
                    inp.style.minWidth = "96px";
                    inp.readOnly = true;
                    inp.style.cursor = "pointer";
                    inp.style.textAlign = "center";
                    inp.placeholder = "未设置";
                    inp.value = this.settings[k] || "";
                    inp.title = "点击后按下组合键";
                    inp.addEventListener("focus", () => { inp.value = ""; inp.placeholder = "请按组合键…"; });
                    inp.addEventListener("blur", () => {
                        inp.value = this.settings[k] || "";
                        inp.placeholder = "未设置";
                    });
                    inp.addEventListener("keydown", (ev) => {
                        // 录键期间拦住一切：别让 Ctrl+Alt+R 同时触发文档里的动作
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (ev.key === "Escape") { inp.blur(); return; }
                        if (ev.key === "Backspace" || ev.key === "Delete") {
                            this.settings[k] = "";
                            inp.value = "";
                            inp.placeholder = "未设置";
                            this.saveSettings();
                            return;
                        }
                        const s = hotkeyFromEvent(ev);
                        if (!s) return; // 只按了修饰键
                        this.settings[k] = s;
                        inp.value = s;
                        this.saveSettings();
                    });
                    wrap.appendChild(tip);
                    wrap.appendChild(inp);
                    box.appendChild(wrap);
                });
                return box;
            },
        });

        this.setting.addItem({
            title: "撤销步数",
            description: "插件自己记多少轮重排可以撤回（1~50）。思源的 Ctrl+Z 撤不到插件写入，所以单独记一份",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.className = "b3-text-field fn__size200";
                inp.type = "number";
                inp.min = "1";
                inp.max = "50";
                inp.value = String(this.settings.undoSteps || 10);
                inp.addEventListener("change", () => {
                    let v = parseInt(inp.value, 10);
                    if (isNaN(v)) v = 10;
                    v = Math.max(1, Math.min(50, v));
                    inp.value = String(v);
                    this.settings.undoSteps = v;
                    this._undo = this._undo || [];
                    while (this._undo.length > v) this._undo.shift();
                    this.saveSettings();
                });
                return inp;
            },
        });

        this.setting.addItem({
            title: "还原失效引用",
            description: "把以前被「转成文本」烧掉的引用改回 ((块ID \"锚\"))。目标块已删除的会自动跳过",
            createActionElement: () => {
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline fn__size200";
                btn.textContent = "还原当前文档";
                btn.addEventListener("click", () => {
                    btn.disabled = true;
                    btn.textContent = "还原中…";
                    this.restoreDeadRefs()
                        .catch((e) => { logErr("restoreDead", e); })
                        .finally(() => { btn.disabled = false; btn.textContent = "还原当前文档"; });
                });
                return btn;
            },
        });

        // 诊断开关：默认关。开着会拦全局 fetch，长期开必然拖慢思源，排查完记得关掉
        this.setting.addItem({
            title: "诊断日志（排查用）",
            description: "开启后会拦截全局网络请求并写 ws-log.json / err-log.json。**只在排查问题时开，平时请关闭**，会拖慢思源",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.debug === true;
                inp.addEventListener("change", () => {
                    this.settings.debug = inp.checked;
                    this._debug = inp.checked;
                    if (inp.checked) this.installFetchProbe(); // 打开才装，关掉要重载插件才卸（免得中途钩子断掉）
                    this.saveSettings();
                });
                return inp;
            },
        });

        this.bindHotkeys();
        this.bindBlockMenu();
        this._quietUntil = 0;
        this._running = false;
        this._editAt = {};
        this._debug = this.settings.debug === true; // 排查时才开：会装 fetch 探针并写 ws-log.json
        if (this._debug) this.installFetchProbe();
        this._lastProtyle = null;
        this._autoTimer = null;
        this._retryTimer = null;
        this._retryN = 0;
        this._giveupAt = {};
        this._paintTimer = null;
        this._repaintTimer = null;
        this._deadIds = [];
        this._deadSig = "";
        this._emptySig = "";

        // 记住当前文档的 protyle，自动重排时用；顺手把已失效的引用标红
        const remember = (e) => {
            const p = (e && e.detail && e.detail.protyle) || null;
            if (p) this._lastProtyle = p;
            clearTimeout(this._paintTimer);
            this._paintTimer = setTimeout(() => { this.auditAndPaint(); }, 800);
        };
        this.eventBus.on("switch-protyle", remember);
        this.eventBus.on("loaded-protyle-static", remember);
        this.eventBus.on("loaded-protyle-dynamic", remember);

        // 文档事务 -> 防抖 -> 自动重排
        this.eventBus.on("ws-main", (e) => {
            const d = e && e.detail;
            if (!d || d.cmd !== "transactions") return;
            if (Date.now() < (this._quietUntil || 0)) return; // 自己刚写完，别自激
            let touched = false;
            const acts = this._debug ? [] : null; // 不在诊断模式就别攒这个数组了
            try {
                for (const tr of (d.data || [])) {
                    for (const op of (tr.doOperations || [])) {
                        const a = op && op.action;
                        if (acts) acts.push(a);
                        if (op && op.id) this.markEdit(op.id);
                        if (a === "insert" || a === "update" || a === "delete" || a === "move") {
                            touched = true;
                        }
                    }
                }
            } catch (err) { touched = false; }
            this.trace({ cmd: d.cmd, acts: acts, touched: touched });
            if (!touched) return;
            // 重渲染会把标红冲掉，每次改动后补一次（只有 mark 模式才有引用可标，text 模式别白跑）
            if (this._deadIds && this._deadIds.length && (this.settings.deadRefAction || "off") === "mark") {
                clearTimeout(this._repaintTimer);
                this._repaintTimer = setTimeout(() => { paintDead(this._deadIds); }, 400);
            }
            if (!this._lastProtyle && !docIdFromDom()) return;
            if (!this.settings.autoMode) return;
            clearTimeout(this._autoTimer);
            this._autoTimer = setTimeout(() => { this.autoRun(); }, this.settings.autoDelay || 1500);
        });
    }

    /**
     * 诊断用：拦截所有 /api/ 失败请求（含思源自身与其他插件），记 URL、请求体、调用栈。
     * 只在设置里打开「诊断日志」时才装 —— 它会 clone 每一个响应，长期开必然拖慢整个应用。
     */
    installFetchProbe() {
        try {
            if (typeof window === "undefined" || window.__xrefFetchHook) return;
            window.__xrefFetchHook = true;
            const raw = window.fetch.bind(window);
            window.fetch = async function (input, init) {
                let url = "";
                try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) {}
                const res = await raw(input, init);
                if (url.indexOf("/api/") < 0) return res;
                try {
                    res.clone().json().then((d) => {
                        if (!d || d.code === 0) return;
                        let stack = "";
                        try { stack = String(new Error().stack || "").split("\n").slice(1, 7).join(" | "); } catch (e) {}
                        const body = String((init && init.body) || "").slice(0, 300);
                        logErr("http " + url.replace(location.origin, "") + " body=" + body + " stack=" + stack,
                            new Error(d.msg));
                    }).catch(() => {});
                } catch (e) { /* 探针自身出错不影响请求 */ }
                return res;
            };
        } catch (e) { /* 挂钩失败不影响主功能 */ }
    }

    /**
     * 统一的动作入口。快捷键、斜杠命令、原生命令都走这里，
     * 顺便做 400ms 去重：原生快捷键和自己录的键撞车时只跑一次。
     */
    fire(act, protyle, nodeEl) {
        const now = Date.now();
        this._lastFire = this._lastFire || {};
        if (now - (this._lastFire[act] || 0) < 400) return;
        this._lastFire[act] = now;
        const p = protyle || this.currentProtyle();
        if (act === "insert") {
            this.openPicker(p, nodeEl).catch((e) => {
                logErr("hotkey:insert", e);
                showMessage("siyuan-xref 出错：" + (e && e.message ? e.message : e), 8000, "error");
            });
        } else if (act === "num") {
            this.renumber(p).catch((e) => { logErr("hotkey:num", e); });
        } else if (act === "undo") {
            this.undoLast().catch((e) => { logErr("hotkey:undo", e); });
        } else if (act === "redo") {
            this.redoLast().catch((e) => { logErr("hotkey:redo", e); });
        }
    }

    /** 当前文档对应的 protyle；文档已经切换过就退回归零，免得把编号写到上一个文档 */
    currentProtyle() {
        const p = this._lastProtyle || null;
        if (!p) return null;
        try {
            const domId = docIdFromDom();
            const pid = getDocId(p);
            if (domId && pid && domId !== pid) return null;
        } catch (e) { /* 判断失败就用原值 */ }
        return p;
    }

    /* ==================== 块右键菜单：设为图/表题注 ==================== */

    /** 只注册一次；菜单项按当前选中的块动态生成 */
    bindBlockMenu() {
        if (this._blockMenuOn) return;
        this._blockMenuOn = true;
        // click-blockicon：点块左侧那个小图标（块标菜单）
        this.eventBus.on("click-blockicon", (e) => {
            try { this.onBlockIcon(e, false); } catch (err) { logErr("click-blockicon", err); }
        });
        // open-menu-content：在正文里直接右键（另一个入口，不挂上就只有点块标才看得到）
        // quiet=true：这里不显示「请右键题注段落」的灰提示，否则图片/表格上一右键就多一条废话
        this.eventBus.on("open-menu-content", (e) => {
            try { this.onBlockIcon(e, true); } catch (err) { logErr("open-menu-content", err); }
        });
    }

    /** 同步读块根节点上的 custom-xref —— 菜单必须在同一个 tick 里建好，不能 await */
    captionLook(protyle, id) {
        let kind = "";
        let text = "";
        try {
            const root = protyle && protyle.wysiwyg && protyle.wysiwyg.element;
            const node = root && root.querySelector('[data-node-id="' + id + '"]');
            if (node) {
                kind = node.getAttribute("custom-xref") || "";
                text = node.textContent || "";
            }
        } catch (e) { /* 取不到就当作普通段落，最多少一个「取消」项 */ }
        return { kind: kind, text: text };
    }

    /**
     * 从选区反推块元素：open-menu-content（正文右键）实测可能不给 blockElements，只给 range。
     * 从 startContainer 往上找到第一个带 data-type 的祖先，就是块根节点。
     */
    elsFromRange(d) {
        const out = [];
        try {
            const r = d && d.range;
            let node = r && (r.startContainer || r.commonAncestorContainer);
            while (node && node.nodeType === 3) node = node.parentNode;
            let hops = 0;
            while (node && node.getAttribute && hops++ < 20) {
                if (node.getAttribute("data-node-id") && node.getAttribute("data-type")) {
                    out.push(node);
                    break;
                }
                node = node.parentNode;
            }
        } catch (e) { /* 反推失败就当没有 */ }
        return out;
    }

    /**
     * 诊断：把块菜单事件的 detail 结构记进 menu-probe.json（只留最近 10 条）。
     * 右键才触发，频率极低，不影响性能；"菜单没出现"这类问题只能靠它定位。
     */
    logMenuProbe(src, e, els, hostKind) {
        try {
            const d = (e && e.detail) || {};
            const pick = (x) => {
                if (!x) return null;
                return {
                    id: x.getAttribute ? x.getAttribute("data-node-id") : (x.id || ""),
                    dt: x.getAttribute ? x.getAttribute("data-type") : (x.type || ""),
                    tag: x.tagName || "",
                };
            };
            const arr = d.blockElements || d.elements || [];
            const rec = {
                t: new Date().toISOString(),
                src: src,
                detailKeys: Object.keys(d).slice(0, 24),
                nRaw: arr.length,
                raw: Array.prototype.map.call(arr, pick).slice(0, 5),
                nUsed: els.length,
                used: els.map((x) => ({ id: x.id, type: x.type, img: x.img })),
                hasRange: !!d.range,
                hasProtyle: !!d.protyle,
                host: hostKind || "",
            };
            const list = (this._menuProbe || []).concat([rec]).slice(-10);
            this._menuProbe = list;
            this.saveData("menu-probe.json", list).catch(() => {});
        } catch (err) { /* 诊断失败不影响菜单 */ }
    }

    /**
     * 诊断：把菜单最终的 DOM 层级记进 menu-probe.json。
     * 「菜单项没出现 / 跑到奇怪的位置」只能靠它定位 —— 光看代码是猜。
     */
    logMenuTree(menu) {
        try {
            const root = menuItemRoot(menu);
            if (!root) return;
            const items = Array.prototype.slice.call(root.children).slice(0, 40).map((el) => {
                const cls = String((el && el.className) || "");
                if (cls.indexOf("separator") >= 0) return "[分隔线]";
                const txt = String((el && el.textContent) || "").replace(/\s+/g, " ").trim().slice(0, 24);
                let sub = false;
                try { sub = !!(el.querySelector && el.querySelector(".b3-menu__submenu, .b3-menu__item--submenu")); } catch (e) {}
                return (sub ? "[" + txt + " ›]" : txt);
            });
            const list = this._menuProbe || [];
            if (!list.length) return;
            list[list.length - 1].menuTree = items;
            this.saveData("menu-probe.json", list).catch(() => {});
        } catch (e) { /* 诊断失败不影响菜单 */ }
    }

    onBlockIcon(e, quiet) {
        const d = (e && e.detail) || {};
        const menu = d.menu;
        if (!menu || typeof menu.addItem !== "function") return;
        // detail.menu 是被思源换过的 subMenu，项加进去只会落进「插件 ›」子菜单；
        // 能拿到主菜单就直连主菜单，拿不到（老版本/异常时机）退回原样，功能不受影响
        const host = mainMenuOf(menu) || menu;
        // blockElements 是 DOM 元素数组（不是 {id,type}），必须先规整
        const rawEls = d.blockElements || d.elements || [];
        const els = [];
        for (const el of rawEls) {
            const m = domBlockMeta(el);
            if (m) els.push(m);
        }
        // 正文右键一般不给 blockElements，从 range 反推
        if (!els.length) {
            for (const el of this.elsFromRange(d)) {
                const m = domBlockMeta(el);
                if (m) els.push(m);
            }
        }
        this.logMenuProbe(quiet ? "open-menu-content" : "click-blockicon", e, els, host === menu ? "sub" : "main");
        const protyle = d.protyle || this._lastProtyle || null;
        // 图/表：顺手看清旁边那一块是什么（同步、只读 DOM），菜单才好给「取消」还是「设为…」
        // 方向按图题在下、表题在上
        for (const x of els) {
            if (x.el && !x.tbl && (x.img || (x.type && x.type !== "p"))) {
                x.next = neighborPara(x.el, x.img ? "fig" : "tab");
            }
        }
        // 属性优先直接从刚拿到的 DOM 元素读（比反查 protyle 稳，protyle 取不到时也能用）
        const look = (id) => {
            for (const x of els) {
                if (x.id !== id) continue;
                if (x.el && x.el.getAttribute) {
                    return { kind: x.el.getAttribute("custom-xref") || "", text: x.el.textContent || "" };
                }
            }
            return this.captionLook(protyle, id);
        };
        const r = captionMenu(els, look);
        if (!r.ok) {
            // 表格单元格 / 公式块 / 混选：放一条灰掉的说明，让用户知道该右键哪儿，而不是以为插件没反应
            // 正文右键（quiet）不加：那里已经有思源自己的图片/表格菜单，再塞一条灰字只是噪音
            if (!quiet && r.reason && r.reason !== "empty") {
                const root0 = menuItemRoot(host);
                const before0 = root0 && root0.children ? root0.children.length : 0;
                host.addItem({
                    icon: "iconInfo",
                    label: menuHint(r.reason),
                    disabled: true,
                });
                promoteMenuItems(host, before0);
            }
            this.logMenuTree(host);
            return;
        }
        const ids = els.map((x) => x.id);
        const root = menuItemRoot(host);
        const before = root && root.children ? root.children.length : 0;
        for (const it of r.items) {
            host.addItem({
                icon: it.icon,
                label: it.label,
                click: () => {
                    const p = protyle || this._lastProtyle || null;
                    let job;
                    if (it.cancel) {
                        // 图片/表格上的「取消」：菜单里已经认出下方题注就直取，否则点下去现场找
                        job = it.targets ? this.clearCaption(it.targets, p)
                            : this.clearCaptionNear(ids, it.kind || "", p);
                    } else if (it.targets) {
                        job = this.setCaption(it.targets, it.kind, p);   // 把下方段落设为题注
                    } else if (it.add) {
                        job = this.addCaption(ids, it.kind, p);          // 在下方新建题注段落
                    } else {
                        job = this.setCaption(ids, it.kind, p);
                    }
                    job.catch((err) => {
                        logErr("blockmenu/" + it.key, err);
                        showMessage("siyuan-xref 出错：" + (err && err.message ? err.message : err), 6000, "error");
                    });
                },
            });
        }
        promoteMenuItems(host, before);
        this.logMenuTree(host);
    }

    /** kind 该以什么打头：优先用户自己配的标签，再兜中英文默认 */
    captionHeadRe(kind) {
        const lab = kind === "fig" ? (this.settings.figLabel || "图") : (this.settings.tabLabel || "表");
        const esc = String(lab).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const alt = kind === "fig" ? "图|Figure" : "表|Table";
        return new RegExp("^\\s*(" + esc + "|" + alt + ")\\s*\\d");
    }

    /**
     * 属性写进 blocks 表有延迟，插件重排又是从 SQL 读 ial —— 不等它确认就重排，
     * 这一轮识别不到刚设的题注，表现就是「点了没反应」。
     * 先用 getBlockAttrs（实时，快）确认接口已生效，再用 SQL 确认重排真能读到。
     */
    async waitCaptionAttrs(ids, kind) {
        for (let i = 0; i < 10; i++) {
            let all = true;
            for (const id of ids) {
                try {
                    const r = await api("/api/attr/getBlockAttrs", { id: id });
                    if (String((r && r["custom-xref"]) || "") !== kind) { all = false; break; }
                } catch (e) { all = false; break; }
            }
            if (all) return true;
            await sleep(250);
        }
        return false;
    }

    /**
     * blocks 表的 ial 才是重排真正读的东西（collectOnce 的 SQL）。
     * 实测写入后要 0.6~2s 才可见，不等就重排会把刚设的图题注按旧前缀编成表号。
     */
    async waitCaptionInSql(ids, kind) {
        const want = kind || "";
        const q = "select id, ial from blocks where id in (" +
            ids.map((i) => "'" + i + "'").join(",") + ") limit -1";
        for (let i = 0; i < 16; i++) {
            let all = true;
            try {
                const rows = (await sql(q)) || [];
                const got = {};
                rows.forEach((r) => { got[r.id] = ialValue(r.ial, "custom-xref"); });
                for (const id of ids) {
                    if (String(got[id] || "") !== want) { all = false; break; }
                }
            } catch (e) { all = false; }
            if (all) return true;
            await sleep(300);
        }
        return false;
    }

    /** 重排后核实：这些块是否真的带上编号了。没带的返回，交给调用方补一轮 */
    async captionUnnumbered(ids, kind) {
        const re = this.captionHeadRe(kind);
        const bad = [];
        for (const id of ids) {
            let k = "";
            try {
                const r = await api("/api/block/getBlockKramdown", { id: id });
                k = (r && r.kramdown) ? String(r.kramdown) : "";
            } catch (e) { k = ""; }
            if (!re.test(k)) bad.push(id);
        }
        return bad;
    }

    /**
     * 属性已经写好之后的那一段：确认接口可见 → 重排 → 回读核实。
     * 返回还没编号的块（空数组 = 全部就位）。
     * setCaption（段落）和 addCaption（新建段落）共用，免得两处逻辑慢慢走偏。
     */
    async commitCaption(ids, kind, p) {
        const map = {};
        ids.forEach((id) => { map[id] = kind; });
        // getBlockAttrs 是实时的：接口一返回就能读到，通常一轮就过（≈0ms）。
        // 过了就把 kind 盖到采集结果上直接重排 —— 不再等 blocks 表索引（那个要 0.6~2s），
        // 右键「设为题注」要的是抬手就看到编号。
        const ready = await this.waitCaptionAttrs(ids, kind);
        if (ready) {
            await this.renumber(p, { kindOverride: map, mustInclude: ids });
        } else {
            // 罕见：属性一时读不到。宁可慢一点也不能按旧前缀排错编号
            await this.waitCaptionInSql(ids, kind);
            await sleep(200);
            await this.renumber(p, { mustInclude: ids });
        }
        let left = await this.captionUnnumbered(ids, kind);
        if (left.length) {
            // 索引还差一点，补一轮；仍不行就留痕，别静默失败
            await sleep(600);
            await this.renumber(p, ready ? { kindOverride: map, mustInclude: ids } : { mustInclude: ids });
            left = await this.captionUnnumbered(ids, kind);
        }
        return left;
    }

    async setCaption(ids, kind, protyle) {
        if (!ids || !ids.length) return;
        const p = protyle || this._lastProtyle || null;
        if (!getDocId(p)) { showMessage("siyuan-xref：未取到当前文档", 4000, "error"); return; }
        if (this._running) { showMessage("siyuan-xref：正在重排，请稍候再试", 3000); return; }
        for (const id of ids) {
            await retry(() => api("/api/attr/setBlockAttrs", { id: id, attrs: { "custom-xref": kind } }));
        }
        const left = await this.commitCaption(ids, kind, p);
        const word = kind === "fig" ? "图" : "表";
        if (left.length) {
            await logErr("setCaption/not-numbered", new Error("未编号: " + left.join(",")));
            showMessage("siyuan-xref：属性已写入，编号稍后自动补上（" + left.length + " 处）", 4000);
        } else {
            showMessage("已设为" + word + "题注" + (ids.length > 1 ? " " + ids.length + " 处" : ""), 2000);
        }
    }

    /**
     * 给图片/表格加题注：在它旁边插一个空段落，再按题注编号。
     * 方向：**图题插在图下方、表题插在表上方**（学术排版惯例）。
     *
     * 为什么不直接把图/表本身标成题注：题注编号是**正文前缀**，
     * 写进图片块会变成「图 1 ![图](…)」这种坏文本，写进表格块会直接毁掉表格结构。
     * 实测 insertBlock 空字符串能干净地建出一个空段落（不是零宽字符那种脏块），
     * 随后重排会把「图 1」/「表 1」写进这个段落，用户接着补写说明即可。
     */
    async addCaption(ids, kind, protyle) {
        if (!ids || !ids.length) return;
        const p = protyle || this._lastProtyle || null;
        if (!getDocId(p)) { showMessage("siyuan-xref：未取到当前文档", 4000, "error"); return; }
        if (this._running) { showMessage("siyuan-xref：正在重排，请稍候再试", 3000); return; }
        const above = kind === "tab";
        const made = [];
        for (const id of ids) {
            let nid = "";
            // previousID = 插到该块之后；nextID = 插到该块之前
            const req = { dataType: "markdown", data: "" };
            if (above) req.nextID = id; else req.previousID = id;
            try {
                const r = await api("/api/block/insertBlock", req);
                nid = (r && r[0] && r[0].doOperations && r[0].doOperations[0] &&
                    r[0].doOperations[0].id) || "";
            } catch (e) { await logErr("addCaption/insert", e); }
            if (!nid) continue;
            try {
                await retry(() => api("/api/attr/setBlockAttrs", { id: nid, attrs: { "custom-xref": kind } }));
            } catch (e) { await logErr("addCaption/attr", e); }
            made.push(nid);
        }
        if (!made.length) {
            showMessage("siyuan-xref：没能在图/表旁边插入题注段落，请重试", 5000, "error");
            return;
        }
        const left = await this.commitCaption(made, kind, p);
        const word = kind === "fig" ? "图" : "表";
        if (left.length) {
            await logErr("addCaption/not-numbered", new Error("未编号: " + left.join(",")));
            showMessage("siyuan-xref：题注段落已插入，编号稍后自动补上", 4000);
        } else {
            showMessage("已在" + (above ? "上方" : "下方") + "添加" + word + "题注" +
                (made.length > 1 ? " " + made.length + " 处" : "") + "，可直接补写说明", 2600);
        }
    }

    /**
     * 右键图片/表格点「取消图表题注」的兜底：现场找它旁边那个题注段落。
     * 方向同插入：图往下看、表往上看。（菜单里通常已经算出来了，这条只在拿不到 DOM 时用。）
     */
    async clearCaptionNear(ids, kind, protyle) {
        if (!ids || !ids.length) return;
        const p = protyle || this._lastProtyle || null;
        const docId = getDocId(p);
        if (!docId) { showMessage("siyuan-xref：未取到当前文档", 4000, "error"); return; }
        if (this._running) { showMessage("siyuan-xref：正在重排，请稍候再试", 3000); return; }
        let blocks = [];
        try { blocks = await collectBlocks(docId); } catch (e) { blocks = []; }
        const at = {};
        blocks.forEach((b, i) => { at[b.id] = i; });
        const up = kind === "tab";
        const targets = [];
        for (const id of ids) {
            const i = at[id];
            if (i === undefined) continue;
            const step = up ? -1 : 1;
            // 最多看两格：中间可能夹着一个空段落
            for (let n = 1; n <= 2; n++) {
                const j = i + step * n;
                if (j < 0 || j >= blocks.length) break;
                const b = blocks[j];
                if (b.type !== "p") break;
                const k = classify(b, this.settings);
                if (k) { if (!kind || k === kind) targets.push(b.id); break; }
                if (String(b.markdown || "").trim()) break;   // 有正文却不是题注 → 不是它
            }
        }
        if (!targets.length) {
            showMessage("siyuan-xref：没找到该" + (up ? "表上方" : "图下方") + "的题注段落", 3500);
            return;
        }
        await this.clearCaption(targets, p);
    }

    /**
     * 取消题注：先清属性，再剥「图 3」前缀，最后重排让后面的编号顺延。
     *
     * ⚠ 顺序不能反。剥前缀走的是 updateBlock(dataType:"dom") 整块回传，回传的 DOM 里
     * 带着块自己的 IAL —— 属性还没清就回传，会把 custom-xref="fig" 原样写回去，
     * 而且这次回写的落地比 setBlockAttrs 还晚，表现就是「编号没了但属性还在，
     * 下一轮又变回题注、后面的编号也不顺延」（1.0.3 快通道测试抓到的真 bug）。
     */
    async clearCaption(ids, protyle) {
        if (!ids || !ids.length) return;
        const p = protyle || this._lastProtyle || null;
        const docId = getDocId(p);
        if (!docId) { showMessage("siyuan-xref：未取到当前文档", 4000, "error"); return; }
        if (this._running) { showMessage("siyuan-xref：正在重排，请稍候再试", 3000); return; }
        // 1) 先清属性（getBlockAttrs 实时可读，一轮就过）
        //    连同「块命名」和题注底色一起去掉：重排时写过 name="图 3"，
        //    光清 custom-xref 会让这个块名永久残留（用户报的 bug）。
        //    必须在这一步做：后面的剥前缀走 DOM 整块回传，回传时若 name 还在
        //    （诊断实测：DOM 里带 name，回写后又写回块属性），就白清了。
        let clearedName = 0;
        for (const id of ids) {
            let cur = {};
            try { cur = (await api("/api/attr/getBlockAttrs", { id: id })) || {}; } catch (e) { cur = {}; }
            const attrs = { "custom-xref": "" };
            if (isAutoCaptionName(cur.name, this.settings)) {
                attrs.name = "";
                clearedName += 1;
            }
            const st = stripCaptionBg(cur.style);
            if (st !== null) attrs.style = st;
            await retry(() => api("/api/attr/setBlockAttrs", { id: id, attrs: attrs }));
        }
        await this.waitCaptionAttrs(ids, "");
        // 2) 再剥前缀，此时 DOM 回传里已经没有 custom-xref
        let changed = 0;
        for (const id of ids) {
            let k = "";
            try {
                const r = await api("/api/block/getBlockKramdown", { id: id });
                k = (r && r.kramdown) ? String(r.kramdown) : "";
            } catch (e) { continue; }
            if (!k) continue;
            // kramdown 末行是 IAL（{: id="…"}），它不是正文，别喂给 Lute
            const body = k.replace(/\n?\{:[^}]*\}\s*$/, "");
            const next = stripCaptionPrefix(body);
            if (next === body) continue;
            if (next.trim()) {
                await updateContent(id, next.trim(), p, null);
            } else {
                // 题注正文只有编号（新建题注段落最常见：整块就一个「表 1」）——
                // 剥完是空串，这里必须显式清空。实测 updateBlock(markdown,"") 能把段落
                // 清成空块且块本身还在（不是删块）；md 模式会丢 IAL，但此时属性已在第 1 步清完。
                await retry(() => api("/api/block/updateBlock",
                    { id: id, dataType: "markdown", data: "" }));
            }
            changed += 1;
        }
        // 3) 复查：万一还是被回写带回来了（老版本/别的插件插一手），再清一次
        const back = [];
        for (const id of ids) {
            try {
                const r = (await api("/api/attr/getBlockAttrs", { id: id })) || {};
                const again = {};
                if (String(r["custom-xref"] || "")) again["custom-xref"] = "";
                if (isAutoCaptionName(r.name, this.settings)) again.name = "";
                const st2 = stripCaptionBg(r.style);
                if (st2 !== null) again.style = st2;
                if (Object.keys(again).length) back.push({ id: id, attrs: again });
            } catch (e) { /* 读不到就交给下一轮 */ }
        }
        for (const b of back) {
            await retry(() => api("/api/attr/setBlockAttrs", { id: b.id, attrs: b.attrs }));
        }
        // 同理：不等索引，直接把「属性已清」盖到本轮采集上，编号立刻顺延
        const map = {};
        ids.forEach((id) => { map[id] = ""; });
        const ready = await this.waitCaptionAttrs(ids, "");
        if (ready) {
            await this.renumber(p, { kindOverride: map, mustInclude: ids });
        } else {
            await this.waitCaptionInSql(ids, "");
            await sleep(200);
            await this.renumber(p, { mustInclude: ids });
        }
        const bits = [];
        if (!changed) bits.push("本来就没有编号前缀");
        if (clearedName) bits.push("已清除块命名 " + clearedName + " 处");
        // 「不处理」档下不改引用，但得让人知道有这么几处引用还挂着旧编号
        if ((this.settings.deadRefAction || "off") === "off" && this._lastOrphan) {
            bits.push("另有 " + this._lastOrphan + " 处引用仍写着原编号");
        }
        showMessage("已取消题注" + (ids.length > 1 ? " " + ids.length + " 处" : "") +
            (bits.length ? "（" + bits.join("，") + "）" : ""), 2500);
    }

    /** 只装一次全局监听；DOM 上没有编辑器时按下键也不会误伤 */
    bindHotkeys() {
        if (typeof document === "undefined") return;
        if (this._onHotkey) return;
        this._onHotkey = (ev) => this.onHotkey(ev);
        document.addEventListener("keydown", this._onHotkey, true);
    }

    onHotkey(ev) {
        if (!ev || ev.repeat || ev.isComposing) return;
        // 最先做最便宜的判断：没按修饰键就直接走人（正常打字全走这条路，零开销）
        if (!ev.ctrlKey && !ev.altKey && !ev.metaKey) return;
        const t = ev.target;
        const tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
        // 输入框、搜索框、设置面板、自己的选择面板里都不拦
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (t && t.closest && t.closest(".b3-dialog, .xr-mask")) return;
        const s = hotkeyFromEvent(ev);
        if (!s) return;                            // 没带修饰键，交给思源自己处理
        const a = this.settings.keyInsert || "";
        const b = this.settings.keyRenumber || "";
        const u = this.settings.keyUndo || "";
        const rd = this.settings.keyRedo || "";
        if (a && s === a) {
            ev.preventDefault();
            ev.stopPropagation();
            this.fire("insert", this.currentProtyle(), null);
        } else if (b && s === b) {
            ev.preventDefault();
            ev.stopPropagation();
            this.fire("num", this.currentProtyle(), null);
        } else if (u && s === u) {
            ev.preventDefault();
            ev.stopPropagation();
            this.fire("undo", null, null);
        } else if (rd && s === rd) {
            ev.preventDefault();
            ev.stopPropagation();
            this.fire("redo", null, null);
        }
    }

    onunload() {
        try {
            clearTimeout(this._autoTimer);
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
            clearTimeout(this._paintTimer);
            clearTimeout(this._repaintTimer);
            clearTimeout(this._deadTimer);
            clearTimeout(this._undoSaveTimer);
            if (this._onHotkey) document.removeEventListener("keydown", this._onHotkey, true);
        } catch (e) { /* 卸载时清不掉也不影响主功能 */ }
        this._onHotkey = null;
    }

    async saveSettings() {
        await this.saveData("settings.json", this.settings);
        showMessage("siyuan-xref：设置已保存");
    }

    /**
     * opts.auto  自动模式：绝不写入光标所在的块（打断输入），等光标离开再排
     * opts.silent 成功不弹提示（自动模式用）
     */
    async renumber(protyle, opts) {
        const o = opts || {};
        // 重入保护：自动轮和手动轮同时跑会互相覆盖编号
        if (this._running) {
            if (!o.auto) showMessage("siyuan-xref：正在重排，请稍候再试", 3000);
            return;
        }
        const docId = getDocId(protyle);
        if (!docId) {
            if (!o.silent) showMessage("siyuan-xref：未取到当前文档", 4000, "error");
            return;
        }
        this._running = true;
        try {
            const got = await collectFresh(docId, protyle || this._lastProtyle);
            let blocks = got.blocks;
            // 快通道把「等 SQL 索引」这一步省了，但刚插入的块可能整个还没进 blocks 表 ——
            // 那样 override 也拿它没办法（override 只能改已采到的块）。这类块先等一下再采，
            // 只针对调用方点名要的 id，正常场景一次就齐、零开销。
            if (o.mustInclude && o.mustInclude.length) {
                for (let i = 0; i < 4; i++) {
                    const have = new Set(blocks.map((b) => b.id));
                    if (o.mustInclude.every((id) => have.has(id))) break;
                    await sleep(250);
                    const again = await collectFresh(docId, protyle || this._lastProtyle);
                    blocks = again.blocks;
                    got.stale = again.stale;
                }
            }
            // 手动设/取消题注时，属性刚写进接口、blocks 表还没索引到，
            // 这里用参数把新属性盖在采集结果上 —— 不写库，只让编号算对
            if (o.kindOverride) withKindOverride(blocks, o.kindOverride);
            this.trace({ renumber: "collected", doc: docId, n: blocks.length, stale: got.stale, auto: !!o.auto });
            // 页面上有块、快照里没有 = blocks 表索引还没跟上。这时候排出来的编号一定是错的
            // （新题注根本没参与编号，旧编号也不会顺延），只能等下一轮
            if (got.stale && o.auto) {
                this.trace({ renumber: "giveup", why: "index-lag" });
                this.noteGiveup("index-lag", docId);
                this.scheduleRetry();
                return;
            }
            // 先判死链：删除块后编号会顺延，旧引用会静默指向错误的公式，必须标出来
            let deadIds = [];
            this._lastOrphan = 0;
            const deadAct = this.settings.deadRefAction || "off";
            // 取消题注留下的孤儿引用必须先判、而且不管哪一档都判：
            // 纯本地正则，不花接口；off 档虽不动作，但要能告诉用户「还有几处引用写着旧编号」
            let orphan = [];
            try { orphan = findOrphanCaptionRefs(blocks, this.settings); } catch (e) { await logErr("renumber/orphan", e); }
            this._lastOrphan = orphan.length;
            if (deadAct !== "off") {
                try { deadIds = await findDeadRefs(blocks); } catch (e) { deadIds = []; }
                // 并进来以后，标红（mark）和烧成文本（text）都走同一条链路，连 deadGrace 的等待也一样
                if (orphan.length) deadIds = Array.from(new Set(deadIds.concat(orphan)));
            }
            // text 模式：死链要连续存在 deadGrace 毫秒才准烧成文本。
            // 烧掉就是销毁 ((块ID))，用户撤销把块恢复回来也接不回去 —— 得留一段反应时间
            let burnable = new Set();
            if (deadAct === "text" && deadIds.length) {
                const key = deadIds.slice().sort().join(",");
                const pend = this._deadPending;
                if (pend && pend.key === key && Date.now() - pend.at >= (this.settings.deadGrace || 10000)) {
                    burnable = new Set(deadIds);
                } else {
                    if (!pend || pend.key !== key) this._deadPending = { key: key, at: Date.now() };
                    this.armDeadGrace();     // 到点自己再跑一轮，不用等用户再敲字
                }
            } else {
                this._deadPending = null;
            }
            const r = buildPlan(blocks, this.settings, burnable);
            if (!r.plan.length && !r.refs.length) {
                if (!o.silent) showMessage("siyuan-xref：本文档没识别到图/表/公式", 4000);
                // 自动轮空手而归，但刚刚确实有人在敲字 —— 多半是刚写的那一行还没进索引，
                // 或者正写一半。别就当没事发生，稍后补一轮
                if (o.auto && this.hasFreshEdit()) {
                    this.trace({ renumber: "giveup", why: "nothing-yet" });
                    this.noteGiveup("nothing-yet", docId);
                    this.scheduleRetry();
                }
                this.handleDead(deadIds);
                return;
            }
            this.trace({ renumber: "plan", plan: r.plan.length, refs: r.refs.length });
            const need = new Set();
            r.plan.forEach((p) => { if (p.newMd || p.name) need.add(p.id); });
            r.refs.forEach((x) => need.add(x.id));

            if (o.auto) {
                // 公式/代码编辑器开着 = 正在敲 LaTeX：这时候任何写回都会打断输入、把公式冲掉，
                // 整轮放弃，等用户写完再说（这是「公式丢失」最主要的一条路径）。
                // 放弃不等于终结 —— 挂一个重试，否则用户写完公式就再也不自动编号了
                if (mathEditing()) {
                    this.trace({ renumber: "giveup", why: "math-editing" });
                    this.noteGiveup("math-editing", docId);
                    this.scheduleRetry();
                    return;
                }
                // 光标停在待改块里：只有「刚改过这个块」才等，光标只是停着不算。
                // 最多等到 EDIT_GRACE 之后，再久就说明人一直在写，这轮放弃（同样挂重试）
                for (let i = 0; i < 8; i++) {
                    const cur = currentEditingId();
                    if (!cur || !need.has(cur)) break;
                    if (this.editAge(cur) > EDIT_GRACE) break;
                    await sleep(400);
                }
                const cur0 = currentEditingId();
                if (cur0 && need.has(cur0) && this.editAge(cur0) <= EDIT_GRACE) {
                    this.trace({ renumber: "giveup", why: "typing", cur: cur0 });
                    this.noteGiveup("typing", docId);
                    this.scheduleRetry();
                    return; // 人还在写，这轮放弃
                }
            }

            // 刚改过的块，blocks 表索引可能还没跟上，采集到的是半截内容 —— 这类块一律不写。
            // 这是防「写回把用户刚敲的字冲掉」的最后一道闸，宁可晚一轮也不能丢字。
            const hot = new Set();
            if (o.auto) {
                for (const id of need) {
                    if (this.editAge(id) <= EDIT_GRACE) hot.add(id);
                }
                // 只要有一个待改的块在保护窗口里，这轮就整轮推迟 ——
                // 编号是全文档一起顺延的，单独跳过一块会写出「两个图 3」这种自相矛盾的状态。
                // 推迟后挂重试，几秒后自动补上，不静默收场
                if (hot.size) {
                    this.trace({ renumber: "giveup", why: "hot-block", n: hot.size });
                    this.noteGiveup("hot-block", docId);
                    this.scheduleRetry();
                    return;
                }
            }

            // 自己写完的静默窗口：别把自己的写入当成用户编辑再触发一轮。
            // 上限 12s —— 100 个题注的文档按 n×200 算要 20s+，会让自动重排长时间瘫痪
            this._quietUntil = Date.now() + Math.min(4000 + r.plan.length * 200 + r.refs.length * 200, 12000);
            // 整轮改动记成一条撤销记录：思源的撤销栈收不到 API 写入，只能自己记
            const rec = { doc: docId, t: Date.now(), items: [], attrs: [] };
            await applyPlan(r.plan, r.refs, hot, protyle || this._lastProtyle, rec);
            // 记下每块的原父块：万一它之后被删，撤销时要按原父块重建（没这信息只能插到文末）
            try {
                const pids = new Map(blocks.map((b) => [b.id, b.parent_id]));
                rec.items.forEach((it) => { it.pid = pids.get(it.id) || docId; });
            } catch (e) { /* 补不到就退回用文档 ID */ }
            this.pushUndo(rec);
            this._retryN = 0; // 这一轮真写进去了，重试链清零
            this.trace({ renumber: "applied", skipped: hot.size });

            // 已经坏掉的公式块（内容空、只剩 \tag）：插件不擅自改它，但要让用户知道
            const emptyEqs = r.plan.filter((p) => p.emptyEq).map((p) => p.id);
            if (emptyEqs.length && emptyEqs.join(",") !== this._emptySig) {
                this._emptySig = emptyEqs.join(",");
                showMessage("siyuan-xref：有 " + emptyEqs.length +
                    " 个公式块内容为空（只剩 \\tag），请检查公式是否丢失", 9000, "error");
            } else if (!emptyEqs.length) {
                this._emptySig = "";
            }

            const dead = deadIds;
            this.handleDead(deadIds);
            if (r.deadRefs && r.deadRefs.length) {
                // 转成文本是不可逆的，原文留一份，方便以后查/手工恢复
                try {
                    await this.archiveDead(docId, r.deadRefs);
                } catch (e) { /* 归档失败不该影响正文 */ }
            }
            if (!o.silent) {
                let msg = "siyuan-xref：已重排 " + r.plan.length + " 项，刷新引用 " + r.refs.length + " 处";
                if (dead.length) {
                    if (this.settings.deadRefAction === "text") {
                        // 只有真烧掉了才说「已转成」；还在宽限期内就照实说清
                        const burned = (r.deadRefs || []).reduce((a, x) => a + (x.n || 0), 0);
                        const gs = Math.round((this.settings.deadGrace || 10000) / 1000);
                        msg += burned
                            ? "，另把 " + burned + " 处失效引用转成了红色删除线文本"
                            : "，发现 " + dead.length + " 处失效引用（" + gs + " 秒后仍未恢复才转文本）";
                    } else {
                        msg += "，发现 " + dead.length + " 处失效引用";
                    }
                }
                showMessage(msg, 6000, dead.length ? "error" : "info");
            }
            this._lastDead = dead;
        } catch (e) {
            // 自动模式不弹窗，但错误要留痕，方便在控制台排查
            try { console.error("[siyuan-xref]", e); } catch (err) {}
            await logErr(o.auto ? "renumber:auto" : "renumber", e);
            if (!o.silent) {
                showMessage("siyuan-xref 出错：" + (e && e.message ? e.message : e), 8000, "error");
            }
        } finally {
            this._running = false;
            this._quietUntil = Math.max(this._quietUntil || 0, Date.now() + 2500);
        }
    }

    /** 死链统一处理：记下、标红（仅 mark 模式）、同一批只提醒一次 */
    handleDead(deadIds) {
        this._deadIds = deadIds || [];
        if ((this.settings.deadRefAction || "off") !== "mark") { paintDead([]); return; } // off/text 都不该有红标，顺手清掉
        paintDead(this._deadIds);
        const sig = this._deadIds.slice().sort().join(",");
        if (!this._deadIds.length) { this._deadSig = ""; return; }
        if (sig === this._deadSig) return;
        this._deadSig = sig;
        showMessage("siyuan-xref：" + this._deadIds.length +
            " 处交叉引用已失效（指向已删的块，或该块已取消题注），已在正文里标红", 7000, "error");
    }

    /** 失效引用被改成文本前，把原文存档（最近 60 条），万一要人工恢复能查 */
    async archiveDead(docId, deadRefs) {
        let log = [];
        try { log = (await this.loadData("dead-fix-log.json")) || []; } catch (e) { log = []; }
        if (!Array.isArray(log)) log = [];
        const t = new Date().toISOString();
        for (const d of deadRefs) {
            log.push({ t: t, doc: docId, block: d.id, n: d.n, from: d.from, to: d.to });
        }
        while (log.length > 60) log.shift();
        await this.saveData("dead-fix-log.json", log);
    }

    /* ---------- 插件自建撤销栈 ----------
     * 为什么不用思源自己的 Ctrl+Z：插件写块走 /api/block/updateBlock（HTTP），
     * 而思源撤销栈只记前端 transaction() 发起的操作，API 写入根本不入栈。
     * 所以只能自己存「改前 / 改后」，用命令撤回。
     */
    pushUndo(rec) {
        if (!rec || (!rec.items.length && !rec.attrs.length)) return;
        this._undo = this._undo || [];
        this._undo.push(rec);
        const cap = Math.max(1, parseInt(this.settings.undoSteps, 10) || 10);
        while (this._undo.length > cap) this._undo.shift();
        this._redo = [];
        this.saveUndo();
    }

    saveUndo() {
        clearTimeout(this._undoSaveTimer);
        this._undoSaveTimer = setTimeout(() => {
            try {
                this.saveData("undo-stack.json", { stack: this._undo || [], redo: this._redo || [] });
            } catch (e) { /* 落盘失败不影响内存里的栈 */ }
        }, 800);
    }

    async loadUndo() {
        try {
            const d = await this.loadData("undo-stack.json");
            this._undo = (d && Array.isArray(d.stack)) ? d.stack : [];
            this._redo = (d && Array.isArray(d.redo)) ? d.redo : [];
        } catch (e) { this._undo = []; this._redo = []; }
    }

    /** dir = "before" 撤销 / "after" 重做 */
    async replay(rec, dir) {
        let n = 0, miss = 0, rebuilt = 0;
        const attrOf = new Map((rec.attrs || []).map((a) => [a.id, a]));
        for (const it of (rec.items || []).slice().reverse()) {
            const dom = it[dir];
            if (!dom) continue;
            try { await api("/api/block/updateBlock", { id: it.id, dataType: "dom", data: dom }); n++; }
            catch (e) {
                const msg = String((e && e.message) || e);
                // 块已被删：不是「撤销失败」，而是要把块重建回来。重建成功 ID 不变，引用自动接回。
                // 优先用 after（块被删那一刻的真实样子，带 name / 居中 / 底色），
                // 没有才退回 before —— 重建的目的是「把块找回来」，不是「退回重排前」
                if (/tree not found|not found/i.test(msg)) {
                    const a = attrOf.get(it.id);
                    if (await rebuildBlock(it.after || dom, it.id, it.pid || rec.doc, a ? a.after : null)) rebuilt++;
                    else miss++;
                } else {
                    miss++;
                }
            }
            await sleep(80);
        }
        for (const a of (rec.attrs || []).slice().reverse()) {
            try { await api("/api/attr/setBlockAttrs", { id: a.id, attrs: a[dir] || {} }); n++; }
            catch (e) { miss++; }
            await sleep(60);
        }
        return { n: n, miss: miss, rebuilt: rebuilt };
    }

    async undoLast() {
        this._undo = this._undo || [];
        if (!this._undo.length) { showMessage("siyuan-xref：没有可撤销的重排记录", 4000); return; }
        const rec = this._undo.pop();
        this._quietUntil = Date.now() + 2500;   // 自己写回去的改动别被当成用户编辑再触发一轮
        let r = { n: 0, miss: 0 };
        try { r = await this.replay(rec, "before"); }
        catch (e) { await logErr("undoLast", e); }
        this._redo = this._redo || [];
        this._redo.push(rec);
        this.saveUndo();
        const at = new Date(rec.t || Date.now());
        const hh = ("0" + at.getHours()).slice(-2) + ":" + ("0" + at.getMinutes()).slice(-2);
        showMessage("siyuan-xref：已撤销 " + hh + " 那轮重排（" + r.n + " 处" +
            (r.rebuilt ? "，重建了 " + r.rebuilt + " 个已被删除的块" : "") +
            (r.miss ? "，" + r.miss + " 处块已不存在" : "") + "），还剩 " + this._undo.length + " 步可撤", 7000);
        this.auditAndPaint();
    }

    async redoLast() {
        this._redo = this._redo || [];
        if (!this._redo.length) { showMessage("siyuan-xref：没有可重做的重排记录", 4000); return; }
        const rec = this._redo.pop();
        this._quietUntil = Date.now() + 2500;
        let r = { n: 0, miss: 0, rebuilt: 0 };
        try { r = await this.replay(rec, "after"); } catch (e) { await logErr("redoLast", e); }
        this._undo = this._undo || [];
        this._undo.push(rec);
        this.saveUndo();
        showMessage("siyuan-xref：已重做，撤销栈 " + this._undo.length + " 步" +
            (r.rebuilt ? "（重建 " + r.rebuilt + " 块）" : ""), 5000);
        this.auditAndPaint();
    }

    /** text 模式：死链先挂 grace 秒再确认，到点自己跑一轮，不用等用户再敲字 */
    armDeadGrace() {
        if (this._deadTimer) return;
        this._deadTimer = setTimeout(() => {
            this._deadTimer = null;
            if (!this._lastProtyle && !docIdFromDom()) return;
            this.renumber(this._lastProtyle, { auto: true, silent: true })
                .catch((e) => { logErr("deadGrace", e); });
        }, (this.settings.deadGrace || 10000) + 500);
    }

    /** 把已烧成纯文本的引用改回 ((块ID "锚"))，数据来自 dead-fix-log.json */
    async restoreDeadRefs() {
        const docId = docIdFromDom() || getDocId(this._lastProtyle);
        let log = [];
        try { log = (await this.loadData("dead-fix-log.json")) || []; } catch (e) { log = []; }
        if (!Array.isArray(log) || !log.length) {
            showMessage("siyuan-xref：没有可还原的记录（dead-fix-log.json 为空）", 5000);
            return;
        }
        const rows = docId ? log.filter((x) => x.doc === docId) : log;
        if (!rows.length) {
            showMessage("siyuan-xref：当前文档没有失效引用记录", 5000);
            return;
        }
        const byBlock = new Map();
        for (const x of rows) {
            if (!byBlock.has(x.block)) byBlock.set(x.block, []);
            byBlock.get(x.block).push(x);
        }
        let okB = 0, missB = 0, okRef = 0;
        for (const [bid, items] of byBlock) {
            const alive = await sql("select id from blocks where id = '" + bid + "' limit -1");
            if (!alive.length) { missB++; continue; }   // 承载引用的段落没了，没法还原
            let md = "";
            try { md = ((await api("/api/block/getBlockKramdown", { id: bid })) || {}).kramdown || ""; }
            catch (e) { md = ""; }
            if (!md) { missB++; continue; }
            const map = {};
            for (const it of items) {
                const re = /\(\((\d{14}-[0-9a-z]{7})\s+["'](.*?)["']\)\)/g;
                let m;
                while ((m = re.exec(String(it.from || "")))) { if (m[2]) map[m[2]] = m[1]; }
            }
            // 目标块本身还在吗？不在的话写回去只会再次变成死链，跳过
            const targetGone = [];
            for (const k of Object.keys(map)) {
                const t = await sql("select id from blocks where id = '" + map[k] + "' limit -1");
                if (!t.length) targetGone.push(k);
            }
            targetGone.forEach((k) => { delete map[k]; });
            if (!Object.keys(map).length) { missB++; continue; }
            const fixed = restoreDeadInMd(md, map);
            if (fixed === md) continue;
            okRef += countRestored(md, fixed);
            try { await updateContent(bid, fixed, this._lastProtyle, null); okB++; }
            catch (e) { missB++; }
            await sleep(120);
        }
        showMessage("siyuan-xref：还原 " + okRef + " 处引用（" + okB + " 个块）" +
            (missB ? "；" + missB + " 个块找不到或目标块已删" : ""), 9000);
        this.auditAndPaint();
    }

    /** 打开文档后：查一遍当前编辑器里的引用，把指向已删块的标红（仅 mark 模式） */
    async auditAndPaint() {
        if ((this.settings.deadRefAction || "off") !== "mark") { paintDead([]); return; }
        if (typeof document === "undefined") return;
        try {
            const ids = [];
            const seen = new Set();
            const spans = document.querySelectorAll('.protyle-wysiwyg span[data-type="block-ref"][data-id]');
            for (const el of spans) {
                const id = el.getAttribute("data-id");
                if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
            }
            if (!ids.length) return;
            const found = await sql("select id from blocks where id in (" +
                ids.map((i) => "'" + i + "'").join(",") + ") limit -1");
            const ok = new Set(found.map((r) => r.id));
            this._deadIds = ids.filter((i) => !ok.has(i));
            paintDead(this._deadIds);
        } catch (e) { /* 审计失败不影响主功能 */ }
    }

    /** 自动模式入口：防抖后调用，重入保护 */
    async autoRun() {
        if (this._running || !this.settings.autoMode) return;
        let p = this._lastProtyle;
        if (!p || !getDocId(p)) {
            const domId = docIdFromDom();
            if (!domId) return;
            p = { protyle: { block: { rootID: domId } } };
        }
        this.trace({ autoRun: "enter", doc: getDocId(p) });
        await this.renumber(p, { auto: true, silent: true });
        this.trace({ autoRun: "done" });
    }

    /**
     * 自动轮放弃时留痕。以前放弃了悄无声息，用户只能看到「没反应」；
     * 现在写进 err-log.json，出问题能直接看出卡在哪。
     * 同一种原因 60 秒内只记一条，免得一直打字把日志刷爆。
     */
    noteGiveup(reason, docId) {
        try {
            const now = Date.now();
            this._giveupAt = this._giveupAt || {};
            if (now - (this._giveupAt[reason] || 0) < 60000) return;
            this._giveupAt[reason] = now;
            const why = {
                "math-editing": "公式/代码编辑器开着，先不动，稍后重试",
                "typing": "光标停在待改的块里，人还在写",
                "hot-block": "要改的块刚被编辑过，内容可能还没进索引（编号需整体一致，故整轮推迟）",
                "index-lag": "页面上有块、blocks 表里还没有（索引延迟），现在排会排错",
                "nothing-yet": "刚才还在敲字，但这一轮没识别出可编号的内容",
            }[reason] || reason;
            logErr("giveup:" + reason, new Error("自动重排本轮放弃（" + why + "）doc=" + docId));
        } catch (e) { /* 留痕失败不影响主功能 */ }
    }

    /**
     * 放弃后别就此终结：稍后悄悄再来一轮，最多 4 次。
     * 没有这个，一次被打断（开着公式、正在打字）就等于这篇文档再也不自动编号，
     * 用户只能手动按快捷键 —— 这正是反馈里的现象。
     *
     * 间隔 = EDIT_GRACE + 800ms：必须晚于「刚编辑过」的保护窗口，
     * 否则重试时那个块依然被判为 hot，等于白跑一轮（甚至连跑 4 次空转）。
     */
    scheduleRetry() {
        const n = (this._retryN = (this._retryN || 0) + 1);
        if (n > 4) { this._retryN = 0; return; }
        if (!this.settings.autoMode) return;
        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            this.autoRun();
        }, EDIT_GRACE + 800);
    }

    /** 这个块距上次被编辑过去了多久（毫秒）。没有记录 = 很久以前，当成「没在改」 */
    editAge(id) {
        if (!this._editAt) this._editAt = {}; // 极端情况下（加载失败/测试环境）也别抛异常
        return Date.now() - (this._editAt[id] || 0);
    }

    /** 最近 EDIT_GRACE 内有没有块被编辑过（用来判断「这轮空手是暂时现象还是真没内容」） */
    hasFreshEdit() {
        try {
            if (!this._editAt) return false;
            const now = Date.now();
            for (const k of Object.keys(this._editAt)) {
                if (now - this._editAt[k] <= EDIT_GRACE) return true;
            }
        } catch (e) { /* 判断失败就当没有 */ }
        return false;
    }

    /** 记下「这个块刚被改过」。顺手做回收：长时间开着插件，_editAt 不该无限长 */
    markEdit(id) {
        const now = Date.now();
        if (!this._editAt) this._editAt = {};
        this._editAt[id] = now;
        this._editN = (this._editN || 0) + 1;
        if (this._editN % 200 === 0) {
            for (const k of Object.keys(this._editAt)) {
                if (now - this._editAt[k] > 60000) delete this._editAt[k];
            }
        }
    }

    /** 诊断留痕：只在排查时用，避免长期写盘 */
    trace(obj) {
        if (!this._debug) return;
        try {
            this._wsLog = this._wsLog || [];
            obj.t = new Date().toISOString().slice(11, 23);
            this._wsLog.push(obj);
            if (this._wsLog.length > 40) this._wsLog.shift();
            this.saveData("ws-log.json", this._wsLog).catch(() => {});
        } catch (e) {}
    }

    async openPicker(protyle, nodeEl) {
        // 记住光标所在的块：面板关闭后选区会丢，插入时必须靠它找回来
        let anchorId = "";
        let savedRange = null; // 快捷键触发时，原样恢复到按键瞬间的光标位置
        try {
            // 优先：斜杠菜单关闭瞬间选区还在 /xref 处
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            if (sel && sel.rangeCount) {
                const r = sel.getRangeAt(0);
                const n = r.startContainer;
                const el = n && n.nodeType === 3 ? n.parentElement : n;
                if (el && el.closest && el.closest(".protyle-wysiwyg")) savedRange = r.cloneRange();
            }
            if (sel && sel.anchorNode) {
                const n = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
                const h = n && n.closest ? n.closest("[data-node-id]") : null;
                if (h) anchorId = h.getAttribute("data-node-id");
            }
            // 次选：回调第二个参数通常是当前块元素
            if (!anchorId && nodeEl && nodeEl.closest) {
                const h2 = nodeEl.closest("[data-node-id]");
                if (h2) anchorId = h2.getAttribute("data-node-id");
            }
        } catch (e) { anchorId = ""; }
        const docId = getDocId(protyle);
        if (!docId) {
            await logErr("openPicker", new Error("未取到当前文档 ID，protyle=" +
                (protyle ? Object.keys(protyle).slice(0, 12).join(",") : "null")));
            showMessage("siyuan-xref：未取到当前文档", 4000, "error");
            return;
        }
        let rows = [];
        try {
            rows = buildPlan(await collectBlocks(docId), this.settings).plan;
        } catch (e) {
            await logErr("openPicker:collect", e);
            showMessage("siyuan-xref 读取失败：" + (e && e.message ? e.message : e), 8000, "error");
            return;
        }
        if (!rows.length) { showMessage("siyuan-xref：本文档没识别到图/表/公式", 4000); return; }

        const mask = document.createElement("div");
        mask.className = "xr-mask";
        const panel = document.createElement("div");
        panel.className = "xr-panel";
        const title = document.createElement("div");
        title.className = "xr-title";
        title.textContent = "插入交叉引用";
        const input = document.createElement("input");
        input.className = "b3-text-field xr-input";
        input.placeholder = "搜索编号或题注，↑↓ 选择，回车插入，Esc 关闭";
        const list = document.createElement("div");
        list.className = "xr-list";
        panel.appendChild(title);
        panel.appendChild(input);
        panel.appendChild(list);
        mask.appendChild(panel);
        document.body.appendChild(mask);
        input.focus();

        let items = rows.slice();
        let cur = 0;
        const render = () => {
            list.innerHTML = "";
            if (!items.length) {
                const empty = document.createElement("div");
                empty.className = "xr-empty";
                empty.textContent = "没有匹配项";
                list.appendChild(empty);
                return;
            }
            items.forEach((x, i) => {
                const it = document.createElement("div");
                it.className = "xr-item" + (i === cur ? " xr-cur" : "");
                it.innerHTML = '<span class="xr-name">' + esc(x.name) + "</span>" +
                    '<span class="xr-preview">' + esc(x.oldMd.replace(/\n/g, " ").slice(0, 50)) + "</span>";
                it.addEventListener("mousedown", (ev) => { ev.preventDefault(); pick(x); });
                it.addEventListener("mousemove", () => {
                    if (cur !== i) { cur = i; render(); }
                });
                list.appendChild(it);
            });
            const el = list.querySelector(".xr-cur");
            if (el) el.scrollIntoView({ block: "nearest" });
        };
        const close = () => { mask.remove(); document.removeEventListener("keydown", onKey, true); };
        const pick = (x) => {
            const html = '<span data-type="block-ref" data-subtype="s" data-id="' + x.id + '">' +
                esc(x.name) + "</span>";
            close(); // 先关面板，否则焦点/选区都还在遮罩上
            // 斜杠命令残留的 /xref 要整段选中替换；其余情况（快捷键触发）原样恢复光标
            const anchorEl = anchorId
                ? document.querySelector('.protyle-wysiwyg [data-node-id="' + anchorId + '"]')
                : null;
            let restored = false;
            if (slashRangeIn(anchorEl)) {
                restored = restoreCaret(anchorId);
            } else if (savedRange) {
                try {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(savedRange);
                    restored = true;
                } catch (e) { restored = false; }
            }
            if (!restored) restored = restoreCaret(anchorId);
            if (!restored) {
                // 宁可不插，也不能插到文档开头污染正文
                showMessage("siyuan-xref：定位不到 /xref 所在位置，已取消插入。请把光标放到目标段落再试", 8000, "error");
                return;
            }
            const runInsert = () => {
                if (protyle && typeof protyle.insert === "function") {
                    protyle.insert(html, false);
                } else {
                    document.execCommand("insertHTML", false, html);
                }
            };
            try {
                runInsert();
            } catch (e) {
                logErr("openPicker:insert", e);
                try { document.execCommand("insertHTML", false, html); }
                catch (e2) { showMessage("插入失败：" + (e && e.message ? e.message : e), 6000, "error"); return; }
            }

        };
        const onKey = (ev) => {
            if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); return; }
            if (ev.key === "ArrowDown") { ev.preventDefault(); cur = Math.min(cur + 1, items.length - 1); render(); return; }
            if (ev.key === "ArrowUp") { ev.preventDefault(); cur = Math.max(cur - 1, 0); render(); return; }
            if (ev.key === "Enter") {
                ev.preventDefault(); ev.stopPropagation();
                if (items[cur]) pick(items[cur]);
                return;
            }
        };
        document.addEventListener("keydown", onKey, true);
        input.addEventListener("input", () => {
            const q = input.value.trim().toLowerCase();
            items = q ? rows.filter((x) => (x.name + " " + x.oldMd).toLowerCase().indexOf(q) >= 0) : rows.slice();
            cur = 0;
            render();
        });
        mask.addEventListener("mousedown", (ev) => { if (ev.target === mask) close(); });
        render();
    }
}

// 供本地离线测试使用（插件运行时不读这个字段）
SiYuanXref.__test = { collectBlocks: collectBlocks, buildPlan: buildPlan, applyPlan: applyPlan,
    classify: classify, findDeadRefs: findDeadRefs, paintDead: paintDead, rebuildBlock: rebuildBlock,
    withKindOverride: withKindOverride,
    isBlockAlive: isBlockAlive, aliveMap: aliveMap, dropStaleDead: dropStaleDead, collectRaw: collectRaw,
    ownVersion: ownVersion,
    slashRangeIn: slashRangeIn, restoreCaret: restoreCaret, getDocId: getDocId,
    findSlashBlock: findSlashBlock, mergeBlockDom: mergeBlockDom,
    updateContent: updateContent, centerStyle: centerStyle, getLute: getLute,
    updateMathTag: updateMathTag, looksLossy: looksLossy, mathEditing: mathEditing,
    currentEditingId: currentEditingId,
    captionStyle: captionStyle, captionBgOf: captionBgOf, styleOf: styleOf,
    isAutoCaptionName: isAutoCaptionName, stripCaptionBg: stripCaptionBg,
    findOrphanCaptionRefs: findOrphanCaptionRefs,
    hotkeyFromEvent: hotkeyFromEvent, collectFresh: collectFresh, domTopIds: domTopIds,
    captionMenu: captionMenu, domBlockMeta: domBlockMeta, promoteMenuItems: promoteMenuItems,
    mediaCaptionMenu: mediaCaptionMenu, mediaKindOf: mediaKindOf, menuHint: menuHint,
    inTableCell: inTableCell, neighborPara: neighborPara,
    mainMenuOf: mainMenuOf, menuItemRoot: menuItemRoot,
    stripCaptionPrefix: stripCaptionPrefix, DEFAULTS: DEFAULTS,
    ialValue: ialValue, restoreDeadInMd: restoreDeadInMd, countRestored: countRestored };
module.exports = SiYuanXref;
