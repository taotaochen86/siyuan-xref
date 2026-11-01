"use strict";
/**
 * siyuan-xref —— 思源笔记 图/表/公式 自动编号 + 交叉引用
 * 手写 CommonJS 插件，无需构建。依赖 siyuan 3.7+ 的 protyleSlash / addCommand / fetchSyncPost。
 */
const { Plugin, Setting, showMessage, fetchSyncPost } = require("siyuan");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ==================== 界面语言（中 / 英，跟随思源） ====================
 * 思源把界面语言放在 window.siyuan.config.lang（zh_CN / en_US / es_ES …）。
 * 插件不另设开关（用户 2026-11-01 定：只跟随思源）：zh* 出中文，其余一律出英文
 * —— 英文覆盖最广，西语/法语用户看英文也比看中文有用。
 * 所有用户可见文案统一走 tr("key", 参数…)，{0} {1} 是占位符。
 * 离线测试没有 window，detectUiLang 返回 zh，所以旧断言一行都不用改。
 */
const UI_TEXT = {
    zh: {
        "label.fig": "图", "label.tab": "表", "label.eq": "式",
        "dead.text": "失效引用",

        // 斜杠命令
        "slash.xref.text": "交叉引用", "slash.xref.meta": "图 / 表 / 式",
        "slash.num.text": "重排图表编号", "slash.num.meta": "同步刷新引用",
        // 原生命令
        "cmd.insert": "插入交叉引用", "cmd.renumber": "重排图表编号",
        "cmd.undo": "撤销上次重排", "cmd.redo": "重做重排",

        // 右键菜单
        "menu.setFig": "设为图题注", "menu.setTab": "设为表题注",
        "menu.clear": "取消图表题注",
        "menu.add": "在{0}添加{1}题注",
        "menu.useNext": "把{0}段落设为{1}题注",
        "menu.ref": "插入交叉引用…",
        "menu.where.below": "下方", "menu.where.above": "上方",
        "menu.word.fig": "图", "menu.word.tab": "表",
        "noun.image": "图片", "noun.table": "表格",
        "hint.table": "图表题注：表格单元格内不支持，请右键表格本身或表格上方的题注段落",
        "hint.mixed": "图表题注：请选中同类块（段落，或单张图/单个表）",
        "hint.math": "图表题注：公式块会自动编号，不用设题注",
        "hint.default": "图表题注：请右键图片/表格本身，或图下方（表上方）的题注段落",

        // 设置面板
        "set.mode.title": "编号模式",
        "set.mode.desc": "全文连续（图 1、图 2）或按一级标题分章（图 1-1、图 2-1）",
        "set.mode.continuous": "全文连续", "set.mode.chapter": "按章编号",
        "set.labels.title": "图 / 表 / 式 标签",
        "set.labels.desc": "题注前缀文字，例如填 Figure / Table / Eq",
        "set.refs.title": "重排时同步刷新引用",
        "set.refs.desc": "把 ((块ID \"旧锚文本\")) 全部改成新编号。关闭后只改编号不动引用",
        "set.auto.title": "自动重排",
        "set.auto.desc": "写完题注停手 1.5 秒后自动重排编号并刷新引用。不会写入光标所在的块，避免打断输入",
        "set.detect.title": "文字自动识别",
        "set.detect.desc": "正文以「图 3 ……」「表 2 ……」开头的段落自动当作题注参与编号。关掉后只认" +
            "右键菜单设的题注（custom-xref 属性）——正文里顺口写到「图 3 中可以看出」这种普通段落" +
            "就不会被误编号。自动识别本来就要等索引进位，慢一点没关系；右键设的题注不受此开关影响，点了立刻生效",
        "set.dead.title": "失效引用怎么处理",
        "set.dead.desc": "指向已删块、或指向「已取消题注」的块的引用。默认「不处理」：引用原样留着，删块后按 Ctrl+Alt+Z 能把块重建回来、" +
            "引用自动接回；「仅标红」会在正文里涂红加删除线（看着像内容被改坏）；" +
            "「转成文本」会让引用彻底失效、无法还原，还会等 10 秒才动手",
        "set.dead.off": "不处理，保持原样（推荐）",
        "set.dead.mark": "仅标红，保留引用",
        "set.dead.text": "转成红色删除线文本（不可逆）",
        "set.center.title": "题注居中",
        "set.center.desc": "重排时把「图 N …」「表 N …」题注段落设为居中",
        "set.bg.title": "题注底色",
        "set.bg.desc": "给「图 N …」「表 N …」题注加一层很淡的底色，暗色主题下也看得清；自己设过底色的不会被改",
        "set.bg.none": "无底色", "set.bg.faint": "极浅", "set.bg.light": "浅（默认）", "set.bg.blue": "浅蓝",
        "set.keys.title": "自定义快捷键",
        "set.keys.desc": "点一下输入框，再按下想用的组合键（必须带 Ctrl / Alt / ⌘）。Backspace 清空，Esc 取消。" +
            "同时也会出现在「设置 → 快捷键 → 插件」里，两处改都行",
        "set.keys.insert": "插入交叉引用", "set.keys.renumber": "重排编号",
        "set.keys.undo": "撤销上次重排", "set.keys.redo": "重做",
        "set.keys.unset": "未设置", "set.keys.press": "请按组合键…", "set.keys.tip": "点击后按下组合键",
        "set.undo.title": "撤销步数",
        "set.undo.desc": "插件自己记多少轮重排可以撤回（1~50）。思源的 Ctrl+Z 撤不到插件写入，所以单独记一份",
        "set.restore.title": "还原失效引用",
        "set.restore.desc": "把以前被「转成文本」烧掉的引用改回 ((块ID \"锚\"))。目标块已删除的会自动跳过",
        "set.restore.btn": "还原当前文档", "set.restore.busy": "还原中…",
        "set.debug.title": "诊断日志（排查用）",
        "set.debug.desc": "开启后会拦截全局网络请求并写 ws-log.json / err-log.json。" +
            "**只在排查问题时开，平时请关闭**，会拖慢思源",

        // 提示消息
        "msg.loadErr": "siyuan-xref 加载异常：{0}（详见 data/storage/petal/siyuan-xref/err-log.json）",
        "msg.error": "siyuan-xref 出错：{0}",
        "msg.noDoc": "siyuan-xref：未取到当前文档",
        "msg.busy": "siyuan-xref：重排一直没结束，本次操作未执行，请稍后重试",
        "msg.renumbering": "siyuan-xref：正在重排，请稍候再试",
        "msg.setDone": "已设为{0}题注{1}",
        "msg.nBlocks": " {0} 处",
        "msg.attrWritten": "siyuan-xref：属性已写入，编号稍后自动补上（{0} 处）",
        "msg.addFail": "siyuan-xref：没能在图/表旁边插入题注段落，请重试",
        "msg.addPending": "siyuan-xref：题注段落已插入，编号稍后自动补上",
        "msg.addDone": "已在{0}添加{1}题注{2}，可直接补写说明",
        "msg.notIndexed": "siyuan-xref：这块还没进索引，请稍后重试",
        "msg.wrongSide": "siyuan-xref：题注不在{0}{1}，而在另一侧。请直接右键那个题注段落，选「取消图表题注」",
        "msg.noNeighbor": "siyuan-xref：没找到该{0}{1}紧邻的题注段落，请右键题注段落本身取消",
        "msg.cancelled": "已取消题注{0}{1}",
        "msg.cancelWrap": "（{0}）",
        "msg.cancel.none": "本来就没有编号前缀",
        "msg.cancel.names": "已清除块命名 {0} 处",
        "msg.cancel.stuck": "{0} 处的编号前缀没能去除，请手动删掉那行前缀后重试",
        "msg.cancel.orphan": "另有 {0} 处引用仍写着原编号",
        "msg.sep": "，",
        "msg.settingsSaved": "siyuan-xref：设置已保存",
        "msg.noTargets": "siyuan-xref：本文档没识别到图/表/公式",
        "msg.emptyEq": "siyuan-xref：有 {0} 个公式块内容为空（只剩 \\tag），请检查公式是否丢失",
        "msg.renumbered": "siyuan-xref：已重排 {0} 项，刷新引用 {1} 处",
        "msg.burned": "，另把 {0} 处失效引用转成了红色删除线文本",
        "msg.deadGrace": "，发现 {0} 处失效引用（{1} 秒后仍未恢复才转文本）",
        "msg.deadFound": "，发现 {0} 处失效引用",
        "msg.deadPainted": "siyuan-xref：{0} 处交叉引用已失效（指向已删的块，或该块已取消题注），已在正文里标红",
        "msg.noUndo": "siyuan-xref：没有可撤销的重排记录",
        "msg.undoDone": "siyuan-xref：已撤销 {0} 那轮重排（{1} 处{2}{3}），还剩 {4} 步可撤",
        "msg.undoRebuilt": "，重建了 {0} 个已被删除的块",
        "msg.undoMiss": "，{0} 处块已不存在",
        "msg.noRedo": "siyuan-xref：没有可重做的重排记录",
        "msg.redoDone": "siyuan-xref：已重做，撤销栈 {0} 步{1}",
        "msg.redoRebuilt": "（重建 {0} 块）",
        "msg.noArchive": "siyuan-xref：没有可还原的记录（dead-fix-log.json 为空）",
        "msg.noDocDead": "siyuan-xref：当前文档没有失效引用记录",
        "msg.restored": "siyuan-xref：还原 {0} 处引用（{1} 个块）{2}",
        "msg.restoreMiss": "；{0} 个块找不到或目标块已删",
        "msg.readFail": "siyuan-xref 读取失败：{0}",
        "msg.insertFail": "插入失败：{0}",

        // 交叉引用选择面板
        "picker.title": "插入交叉引用",
        "picker.ph": "搜索编号或题注，↑↓ 选择，回车插入，Esc 关闭",
        "picker.empty": "没有匹配项",
        "picker.all": "全部",
        "picker.allSec": "全部章节",
        "picker.secTip": "只看某个标题下的图 / 表 / 式（含它的子标题）",
        "picker.secNone": "（无标题）",
        "picker.noAnchor": "siyuan-xref：定位不到这个段落，引用未插入。请把光标放到目标段落再试",
        "picker.noSlash": "siyuan-xref：定位不到 /xref 所在位置，已取消插入。请把光标放到目标段落再试",
    },
    en: {
        "label.fig": "Figure", "label.tab": "Table", "label.eq": "Eq",
        "dead.text": "broken reference",

        "slash.xref.text": "Cross-reference", "slash.xref.meta": "figure / table / equation",
        "slash.num.text": "Renumber captions", "slash.num.meta": "refresh references too",
        "cmd.insert": "Insert cross-reference", "cmd.renumber": "Renumber captions",
        "cmd.undo": "Undo last renumber", "cmd.redo": "Redo renumber",

        "menu.setFig": "Set as figure caption", "menu.setTab": "Set as table caption",
        "menu.clear": "Clear caption",
        "menu.add": "Add a {1} caption {0}",
        "menu.useNext": "Use the paragraph {0} as the {1} caption",
        "menu.ref": "Insert cross-reference…",
        "menu.where.below": "below", "menu.where.above": "above",
        "menu.word.fig": "figure", "menu.word.tab": "table",
        "noun.image": "image", "noun.table": "table",
        "hint.table": "Captions: not available inside a table cell — right-click the table itself or the caption above it",
        "hint.mixed": "Captions: select blocks of the same kind (paragraphs, or a single image / table)",
        "hint.math": "Captions: equation blocks are numbered automatically, no caption needed",
        "hint.default": "Captions: right-click the image / table itself, or the caption paragraph below a figure (above a table)",

        "set.mode.title": "Numbering mode",
        "set.mode.desc": "Continuous through the whole document (Figure 1, Figure 2) or restart at every top-level heading (Figure 1-1, Figure 2-1)",
        "set.mode.continuous": "Continuous", "set.mode.chapter": "Per chapter",
        "set.labels.title": "Figure / table / equation labels",
        "set.labels.desc": "Text written in front of each number, e.g. Figure / Table / Eq",
        "set.refs.title": "Refresh references when renumbering",
        "set.refs.desc": "Rewrites every ((block id \"old anchor\")) to the new number. Turn it off to change numbers only and leave references alone.",
        "set.auto.title": "Auto renumber",
        "set.auto.desc": "Renumbers and refreshes references 1.5 s after you stop typing. It never writes into the block holding the caret, so typing is not interrupted.",
        "set.detect.title": "Detect captions from text",
        "set.detect.desc": "A paragraph that starts with 图 3 / Figure 3 / 表 2 / Table 2 counts as a caption. " +
            "Turn it off to accept only captions set from the right-click menu (the custom-xref attribute), so an ordinary " +
            "sentence such as \"as Figure 3 shows\" is never renumbered. Detection has to wait for the index to catch up, which is fine; " +
            "captions set from the menu are not affected and take effect immediately.",
        "set.dead.title": "Broken references",
        "set.dead.desc": "A reference pointing to a deleted block, or to a block whose caption was cleared. Default \"leave alone\": the reference " +
            "stays as it is, and Ctrl+Alt+Z rebuilds the deleted block with its original ID so the reference reconnects. \"Mark red\" paints it red " +
            "with a strikethrough, which is easy to mistake for content damage. \"Convert to text\" is irreversible and waits 10 s before acting.",
        "set.dead.off": "Leave alone (recommended)",
        "set.dead.mark": "Mark red, keep the reference",
        "set.dead.text": "Convert to red strikethrough text (irreversible)",
        "set.center.title": "Centre captions",
        "set.center.desc": "Centres every figure / table caption paragraph while renumbering",
        "set.bg.title": "Caption tint",
        "set.bg.desc": "Adds a very light tint behind caption paragraphs; still readable in dark themes. Captions you tinted yourself are left alone.",
        "set.bg.none": "None", "set.bg.faint": "Very faint", "set.bg.light": "Light (default)", "set.bg.blue": "Pale blue",
        "set.keys.title": "Custom hotkeys",
        "set.keys.desc": "Click a field, then press the combination you want (Ctrl / Alt / ⌘ required). Backspace clears it, Esc cancels. " +
            "The same keys also appear under Settings → Keymap → Plugins; either place works.",
        "set.keys.insert": "Insert reference", "set.keys.renumber": "Renumber",
        "set.keys.undo": "Undo renumber", "set.keys.redo": "Redo",
        "set.keys.unset": "not set", "set.keys.press": "press keys…", "set.keys.tip": "Click, then press the keys",
        "set.undo.title": "Undo depth",
        "set.undo.desc": "How many renumber runs stay undoable (1–50). SiYuan's own Ctrl+Z cannot undo API writes, so the plugin keeps its own stack.",
        "set.restore.title": "Restore broken references",
        "set.restore.desc": "Turns references that were previously burned into plain text back into ((block id \"anchor\")). Blocks whose target no longer exists are skipped.",
        "set.restore.btn": "Restore this document", "set.restore.busy": "Restoring…",
        "set.debug.title": "Diagnostic log (troubleshooting)",
        "set.debug.desc": "Intercepts every network request and writes ws-log.json / err-log.json. " +
            "Turn it on only while troubleshooting — it slows SiYuan down.",

        "msg.loadErr": "siyuan-xref failed to load: {0} (see data/storage/petal/siyuan-xref/err-log.json)",
        "msg.error": "siyuan-xref error: {0}",
        "msg.noDoc": "siyuan-xref: no current document",
        "msg.busy": "siyuan-xref: renumbering never finished, nothing was done — please try again",
        "msg.renumbering": "siyuan-xref: renumbering in progress, please wait",
        "msg.setDone": "Set as {0} caption{1}",
        "msg.nBlocks": " ({0} blocks)",
        "msg.attrWritten": "siyuan-xref: attribute saved, numbers will follow shortly ({0})",
        "msg.addFail": "siyuan-xref: could not insert a caption paragraph next to the figure / table, please retry",
        "msg.addPending": "siyuan-xref: caption paragraph inserted, numbers will follow shortly",
        "msg.addDone": "Added a {1} caption {0}{2} — you can type the description now",
        "msg.notIndexed": "siyuan-xref: this block is not indexed yet, please retry",
        "msg.wrongSide": "siyuan-xref: the caption sits on the other side, not {1} the {0}. Right-click that caption paragraph and choose \"Clear caption\"",
        "msg.noNeighbor": "siyuan-xref: no caption paragraph directly {1} this {0}. Right-click the caption paragraph itself to clear it",
        "msg.cancelled": "Caption cleared{0}{1}",
        "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "there was no leading number",
        "msg.cancel.names": "{0} block name(s) cleared",
        "msg.cancel.stuck": "{0} leading number(s) could not be removed — delete that prefix by hand and retry",
        "msg.cancel.orphan": "{0} reference(s) still show the old number",
        "msg.sep": ", ",
        "msg.settingsSaved": "siyuan-xref: settings saved",
        "msg.noTargets": "siyuan-xref: no figures, tables or equations found in this document",
        "msg.emptyEq": "siyuan-xref: {0} equation block(s) are empty (only \\tag left) — check whether the formula was lost",
        "msg.renumbered": "siyuan-xref: {0} caption(s) renumbered, {1} reference(s) refreshed",
        "msg.burned": ", {0} broken reference(s) converted to red strikethrough text",
        "msg.deadGrace": ", {0} broken reference(s) found (converted to text only after {1}s)",
        "msg.deadFound": ", {0} broken reference(s) found",
        "msg.deadPainted": "siyuan-xref: {0} cross-reference(s) are broken (target deleted, or its caption was cleared) and are marked red in the document",
        "msg.noUndo": "siyuan-xref: nothing to undo",
        "msg.undoDone": "siyuan-xref: undid the {0} renumber run ({1} change(s){2}{3}), {4} step(s) left",
        "msg.undoRebuilt": ", rebuilt {0} deleted block(s)",
        "msg.undoMiss": ", {0} block(s) no longer exist",
        "msg.noRedo": "siyuan-xref: nothing to redo",
        "msg.redoDone": "siyuan-xref: redone, undo stack {0} step(s){1}",
        "msg.redoRebuilt": " (rebuilt {0} block(s))",
        "msg.noArchive": "siyuan-xref: nothing to restore (dead-fix-log.json is empty)",
        "msg.noDocDead": "siyuan-xref: no broken references recorded for this document",
        "msg.restored": "siyuan-xref: restored {0} reference(s) in {1} block(s){2}",
        "msg.restoreMiss": "; {0} block(s) missing or target already deleted",
        "msg.readFail": "siyuan-xref read failed: {0}",
        "msg.insertFail": "Insert failed: {0}",

        "picker.title": "Insert cross-reference",
        "picker.ph": "Search by number or caption · ↑↓ to choose · Enter to insert · Esc to close",
        "picker.empty": "No matches",
        "picker.all": "All",
        "picker.allSec": "All sections",
        "picker.secTip": "Show only the figures / tables / equations under one heading (sub-headings included)",
        "picker.secNone": "(no heading)",
        "picker.noAnchor": "siyuan-xref: cannot locate this paragraph, nothing was inserted. Put the caret in the target paragraph and retry",
        "picker.noSlash": "siyuan-xref: cannot locate where /xref was typed, insertion cancelled. Put the caret in the target paragraph and retry",
    },
};

/** 当前界面语言：zh | en。由 setUiLang 在 boot 时按思源语言设定 */
let UI_LANG = "zh";

function detectUiLang() {
    try {
        if (typeof window === "undefined") return "zh";   // 离线测试：保持中文，旧断言不受影响
        const l = String((window.siyuan && window.siyuan.config && window.siyuan.config.lang) || "");
        if (!l) return "zh";
        return /^zh/i.test(l) ? "zh" : "en";
    } catch (e) { return "zh"; }
}

function setUiLang(v) {
    UI_LANG = v === "en" ? "en" : "zh";
    return UI_LANG;
}

/** 取界面文案，{0} {1} 依次代入参数；缺 key 时退回中文再退回 key 本身 */
function tr(key) {
    const dict = UI_TEXT[UI_LANG] || UI_TEXT.zh;
    let s = dict[key];
    if (s === undefined) s = UI_TEXT.zh[key];
    if (s === undefined) s = key;
    if (arguments.length < 2) return s;
    const args = Array.prototype.slice.call(arguments, 1);
    return String(s).replace(/\{(\d)\}/g, (m, i) => {
        const v = args[Number(i)];
        return v === undefined || v === null ? "" : String(v);
    });
}

const DEFAULTS = {
    mode: "continuous", // continuous 全文连续 | chapter 按 h1 分章（图 1-1）
    // 标签留空 = 跟界面语言（中文出「图/表/式」，英文出 Figure/Table/Eq）。
    // 老用户 settings.json 里已经有值，boot 时只填空的那几个，不动他们改过的
    figLabel: "",
    tabLabel: "",
    eqLabel: "",
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
    let t = String(old || "").trim() || tr("dead.text");
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
 * **只看这一个方向**，反向一律不认（2026-11-01 用户明确选的 B：
 * 题注放错了边，就让人去右键那个题注本身，不要插件替他猜）。
 * 最多看两格：中间夹一个空段落是常见排版（手动空行），跳过它继续找同方向的题注。
 * 返回 null = 那一侧没有可用段落；undefined = 拿不到 DOM（调用方就别提前判断）。
 */
function neighborPara(el, kind) {
    try {
        if (!el || !el.getAttribute) return undefined;
        const key = kind === "tab" ? "previousElementSibling" : "nextElementSibling";
        if (!(key in el)) return undefined;
        let nx = el[key];
        for (let n = 1; n <= 2; n++) {
            if (!nx || !nx.getAttribute) return null;
            const m = domBlockMeta(nx);
            if (!m || m.img || m.type !== "p" || m.tbl) return null;
            const cap = { id: m.id, kind: nx.getAttribute("custom-xref") || "", text: nx.textContent || "" };
            const capLike = cap.kind === "fig" || cap.kind === "tab" ||
                NUM_HEAD.test(String(cap.text || "").trim());
            if (capLike) return cap;
            // 第一格是普通段落：有正文就交给菜单判断（「把这一块设为题注」）；
            // 空段落没内容可当题注，跳过去看第二格（那里只认已经是题注的块）
            if (n === 1 && String(cap.text || "").trim()) return cap;
            if (n === 2) return null;
            nx = nx[key];
        }
        return null;
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
    const word = kind === "fig" ? tr("menu.word.fig") : tr("menu.word.tab");
    const where = kind === "fig" ? tr("menu.where.below") : tr("menu.where.above");
    const icon = kind === "fig" ? "iconImage" : "iconTable";
    const items = [{ key: "add", label: tr("menu.add", where, word), icon: icon, kind: kind, add: true }];
    if (media.length === 1) {
        const hasNext = "next" in media[0];
        const nb = hasNext ? media[0].next : undefined;
        if (nb && nb.id) {
            const nbKind = nb.kind || "";
            const capLike = nbKind === "fig" || nbKind === "tab" || NUM_HEAD.test(String(nb.text || ""));
            if (capLike) {
                // 已经是同类型题注（或老数据只有「图 3」前缀没属性）才给「取消」
                if (!nbKind || nbKind === kind) {
                    items.push({ key: "clear", label: tr("menu.clear"), icon: "iconTrashcan",
                        cancel: true, kind: kind, targets: [nb.id] });
                }
            } else if (String(nb.text || "").trim()) {
                items.push({ key: "use-next", label: tr("menu.useNext", where, word), icon: icon,
                    kind: kind, targets: [nb.id] });
            }
        } else if (!hasNext) {
            // 拿不到 DOM，判断不了那一侧有没有题注 —— 保守留着「取消」，点下去现场再找
            items.push({ key: "clear", label: tr("menu.clear"), icon: "iconTrashcan", cancel: true, kind: kind });
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
        { key: "fig", label: tr("menu.setFig"), icon: "iconImage", kind: "fig" },
        { key: "tab", label: tr("menu.setTab"), icon: "iconTable", kind: "tab" },
    ];
    if (isCap) items.push({ key: "clear", label: tr("menu.clear"), icon: "iconTrashcan", cancel: true,
        targets: list.map((e) => e.id) });
    // 「插入交叉引用…」不在这里给：它由 onBlockIcon 统一追加，只在**正文文字**上出现
    // （块标菜单不给、图片/表格本身也不给 —— 2026-11-01 用户定的）。
    return { ok: true, mode: "para", reason: "", items: items };
}

/** 不能用题注时的灰字说明（按原因给不同提示，别让人以为是插件坏了） */
function menuHint(reason) {
    if (reason === "table") return tr("hint.table");
    if (reason === "mixed") return tr("hint.mixed");
    if (reason === "type:m") return tr("hint.math");
    return tr("hint.default");
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

/** 标题块的纯文字（去掉 `##` 前缀和行尾 IAL），面板的章节下拉要显示它 */
function headingText(md) {
    return String(md || "")
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/\s*\{:[^}]*\}\s*$/, "")
        .replace(/\s*\n\s*/g, " ")
        .trim()
        .slice(0, 60);
}

/**
 * 交叉引用面板的筛选：类型（kind）+ 所属标题（secId，含子标题）+ 搜索词（q）。
 * 抽成纯函数是为了能离线测 —— 面板本体要 DOM 和内核，测不动。
 * secId 命中判定看 hPath（"根/…/当前" 的标题块 id 链），所以选一个 h1 会带出它所有子节的图表。
 */
function filterPickerRows(rows, opt) {
    const o = opt || {};
    const kind = o.kind || "";
    const sec = o.secId || "";
    const q = String(o.q || "").trim().toLowerCase();
    return (rows || []).filter((x) => {
        if (!x) return false;
        if (kind && x.kind !== kind) return false;
        if (sec && ("/" + (x.hPath || "") + "/").indexOf("/" + sec + "/") < 0) return false;
        if (q && (x.name + " " + x.oldMd).toLowerCase().indexOf(q) < 0) return false;
        return true;
    });
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

function buildPlan(blocks, s, deadSet, exclSet) {
    const dead = deadSet instanceof Set ? deadSet : new Set();
    // 点名排除：这些块本轮**绝不写前缀、不占编号**（取消题注刚剥完前缀的那一刻用）。
    // 不走 classify —— 那一条还得看 blocks 表里的旧文字/旧属性，索引没跟上就会把它
    // 重新认成题注、把编号又写回去，用户看到的现象就是「取消题注点了没反应」。
    const excl = exclSet instanceof Set ? exclSet : new Set();
    const act = s.deadRefAction || "off";
    const fixDead = act === "text" && dead.size > 0;
    const counters = { fig: 0, tab: 0, eq: 0 };
    // 标签留空 = 跟界面语言走（中文「图」、英文「Figure」）
    const labelOf = { fig: s.figLabel || tr("label.fig"), tab: s.tabLabel || tr("label.tab"),
        eq: s.eqLabel || tr("label.eq") };
    const chapLv = s.mode === "chapter" ? pickChapterLevel(blocks) : 0;
    let chapter = 1;
    let seenH1 = false;
    const plan = [];
    // 当前所在的标题链（越靠后越深）。面板要按「这一节」筛选，靠它给每项标注归属。
    const hStack = [];
    const sections = [];   // 文档大纲（按出现顺序），面板的章节下拉用它
    const secSeen = new Set();
    for (const b of blocks) {
        // 标题块：先把「现在写到哪一节了」记下来 —— 章节切换的判断也要靠这一步，
        // 所以放在 continue 之前，否则每章的标题会漏出栈
        let chapBreak = false;
        if (b.type === "h" && b.subtype) {
            const lv = parseInt(String(b.subtype).slice(1), 10) || 1;
            while (hStack.length && hStack[hStack.length - 1].lv >= lv) hStack.pop();
            const txt = headingText(b.markdown);
            hStack.push({ id: b.id, lv: lv, text: txt });
            if (chapLv && b.subtype === "h" + chapLv) chapBreak = true;
            if (!secSeen.has(b.id)) {
                secSeen.add(b.id);
                sections.push({ id: b.id, lv: lv, text: txt, path: hStack.map((x) => x.id).join("/") });
            }
        }
        if (chapBreak) {
            if (seenH1) {
                chapter += 1;
                counters.fig = counters.tab = counters.eq = 0;
            }
            seenH1 = true;
            continue;
        }
        if (excl.has(b.id)) continue;      // 本轮点名不编号（取消题注的块）
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
        const top = hStack.length ? hStack[hStack.length - 1] : null;
        plan.push({ id: b.id, type: b.type, kind: kind, seq: seq, name: name, newMd: newMd,
            emptyEq: emptyEq,
            oldMd: (b.markdown || "").slice(0, 60),
            curMd: b.markdown || "",   // 未截断的原内容，用来判断「真的需要重写吗」
            ial: b.ial || "",
            // 归属章节：面板按标题筛选要用。hPath 是「根→当前」的块 id 链（"a/b/c"），
            // 选某个标题时用它判断「这一项是不是在那一节里（含子节）」
            hPath: hStack.map((x) => x.id).join("/"),
            hLv: top ? top.lv : 0,
            hText: top ? top.text : "",
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
    return { plan: plan, refs: refs, deadRefs: deadRefs, sections: sections };
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
    // 两种语言的内置标签都认：用户中途换语言、或文档是别人给的，都不能漏认
    push(tr("label.fig")); push(tr("label.tab")); push(tr("label.eq"));
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

/**
 * 把光标放到指定块的**末尾**，不认斜杠残留。
 * 右键菜单专用：右击某个段落 → 插入交叉引用，条就该出现在这一段最后，
 * 而不是跑到别的块里（右键会移动选区，不能指望原来的光标位置还在）。
 */
function caretToBlockEnd(blockId) {
    if (typeof document === "undefined") return false;
    const el = blockId
        ? document.querySelector('.protyle-wysiwyg [data-node-id="' + blockId + '"]')
        : null;
    if (!el) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
}

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- 公式预览：把 $$ … \tag{2-1} $$ 渲染成真公式 ---------- */

/**
 * 从公式块 markdown 里取纯 LaTeX：去掉 $$ 包裹和 \tag{n}。
 * 编号已经在列表左侧的名字（「式 2-1」）里了，预览里再显示一遍 \tag 只是噪音。
 */
function eqTex(md) {
    let s = String(md || "").trim();
    s = s.replace(/^\$\$/, "").replace(/\$\$$/, "");
    s = s.replace(/\\{1,2}tag\s*\{[^}]*\}/g, "");
    return s.replace(/\s+/g, " ").trim();
}

let XR_MATH = null;   // (tex) => html，失败返回 ""。null = 还没试过

/** 只给离线测试用：忘掉缓存过的渲染器，重新探测（运行时不调用） */
function resetMathRenderer() { XR_MATH = null; }

/**
 * 取一个「LaTeX → HTML」渲染器，优先用页面里现成的：
 *   ① MathJax（思源默认引擎，输出自包含 SVG，不依赖任何 CSS）
 *   ② KaTeX（思源的数学引擎若是 KaTeX，脚本已在页面里）
 *   ③ 都没有 → 按需加载思源**自带**的 katex.min.js / katex.min.css
 *      （/stage/protyle/js/katex/，本地文件毫秒级，插件不必自己打包 280KB）
 * 全失败返回 null，调用方退回等宽源码。绝不抛异常 —— 渲染不出来也不能影响插入引用。
 */
async function ensureMathRenderer() {
    if (XR_MATH) return XR_MATH;
    const w = typeof window === "undefined" ? null : window;
    if (!w || typeof document === "undefined") return null;
    const useMj = () => {
        const mj = w.MathJax;
        if (!mj || typeof mj.tex2svg !== "function") return null;
        XR_MATH = (tex) => { try { return (mj.tex2svg(tex, { display: false }) || {}).outerHTML || ""; } catch (e) { return ""; } };
        return XR_MATH;
    };
    const useKatex = () => {
        const k = w.katex;
        if (!k || typeof k.renderToString !== "function") return null;
        XR_MATH = (tex) => { try { return k.renderToString(tex, { throwOnError: false, displayMode: false }); } catch (e) { return ""; } };
        return XR_MATH;
    };
    if (useMj() || useKatex()) return XR_MATH;
    try {
        if (!document.querySelector('script[data-xref-katex]')) {
            const base = "/stage/protyle/js/katex/";
            if (!document.querySelector('link[data-xref-katex]')) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = base + "katex.min.css";
                link.setAttribute("data-xref-katex", "1");
                document.head.appendChild(link);
            }
            const sc = document.createElement("script");
            sc.src = base + "katex.min.js";
            sc.setAttribute("data-xref-katex", "1");
            document.head.appendChild(sc);
        }
        // 最多等 1.2 秒：思源自带的 katex.min.js 是本地文件，正常几十毫秒就好了；
        // 真加载不到就当没有，面板照常弹出来（只是显示源码），别让人干等
        for (let i = 0; i < 24; i++) {
            if (useKatex()) return XR_MATH;
            await sleep(50);
        }
    } catch (e) { /* 走下面的 null */ }
    return null;
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
            showMessage(tr("msg.loadErr", (e && e.message ? e.message : e)), 9000, "error");
        }
    }

    async boot() {
        // 界面语言最先定：后面所有菜单/提示都靠它（用户 2026-11-01 定：只跟随思源，不做手动开关）
        setUiLang(detectUiLang());
        // 先同步注册斜杠命令：onload 内后续有 await，避免打开文档时读不到
        this.protyleSlash = [
            {
                id: "xref-ref",
                filter: ["xref", "交叉引用", "图ref", "tref", "reference", "cite"],
                html: '<div class="b3-list-item__first"><span class="b3-list-item__text">' + esc(tr("slash.xref.text")) + "</span>" +
                    '<span class="b3-list-item__meta">' + esc(tr("slash.xref.meta")) + "</span></div>",
                showInLite: true,
                callback: (protyle, nodeEl) => {
                    this.openPicker(protyle, nodeEl).catch((e) => {
                        logErr("slash:xref", e);
                        showMessage(tr("msg.error", (e && e.message ? e.message : e)), 8000, "error");
                    });
                },
            },
            {
                id: "xref-num",
                filter: ["xrefnum", "重排编号", "图表编号", "renumber"],
                html: '<div class="b3-list-item__first"><span class="b3-list-item__text">' + esc(tr("slash.num.text")) + "</span>" +
                    '<span class="b3-list-item__meta">' + esc(tr("slash.num.meta")) + "</span></div>",
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
                langText: tr("cmd.insert"),
                hotkey: "",
                editorCallback: (protyle) => { this.fire("insert", protyle, null); },
            });
            this.addCommand({
                langKey: "xrefRenumber",
                langText: tr("cmd.renumber"),
                hotkey: "",
                editorCallback: (protyle) => { this.fire("num", protyle, null); },
            });
            this.addCommand({
                langKey: "xrefUndo",
                langText: tr("cmd.undo"),
                hotkey: "",
                editorCallback: () => { this.fire("undo", null, null); },
            });
            this.addCommand({
                langKey: "xrefRedo",
                langText: tr("cmd.redo"),
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
        // 标签留空 = 跟界面语言（英文思源首次安装出 Figure/Table/Eq，老用户已存的值一律不动）
        if (!this.settings.figLabel) this.settings.figLabel = tr("label.fig");
        if (!this.settings.tabLabel) this.settings.tabLabel = tr("label.tab");
        if (!this.settings.eqLabel) this.settings.eqLabel = tr("label.eq");
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
            title: tr("set.mode.title"),
            description: tr("set.mode.desc"),
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [["continuous", tr("set.mode.continuous")], ["chapter", tr("set.mode.chapter")]].forEach(([v, t]) => {
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
            title: tr("set.labels.title"),
            description: tr("set.labels.desc"),
            createActionElement: () => {
                const box = document.createElement("div");
                [["figLabel", tr("label.fig")], ["tabLabel", tr("label.tab")],
                    ["eqLabel", tr("label.eq")]].forEach(([k, ph]) => {
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
            title: tr("set.refs.title"),
            description: tr("set.refs.desc"),
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
            title: tr("set.auto.title"),
            description: tr("set.auto.desc"),
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
            title: tr("set.detect.title"),
            description: tr("set.detect.desc"),
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
            title: tr("set.dead.title"),
            description: tr("set.dead.desc"),
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [
                    ["off", tr("set.dead.off")],
                    ["mark", tr("set.dead.mark")],
                    ["text", tr("set.dead.text")],
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
            title: tr("set.center.title"),
            description: tr("set.center.desc"),
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
            title: tr("set.bg.title"),
            description: tr("set.bg.desc"),
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [
                    ["none", tr("set.bg.none")],
                    ["faint", tr("set.bg.faint")],
                    ["light", tr("set.bg.light")],
                    ["blue", tr("set.bg.blue")],
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
            title: tr("set.keys.title"),
            description: tr("set.keys.desc"),
            createActionElement: () => {
                // 竖排两行：设置面板右侧这一栏窄，横着放开两个框会被裁掉
                const box = document.createElement("div");
                box.style.display = "flex";
                box.style.flexDirection = "column";
                box.style.rowGap = "6px";
                box.style.width = "190px";
                [["keyInsert", tr("set.keys.insert")], ["keyRenumber", tr("set.keys.renumber")],
                 ["keyUndo", tr("set.keys.undo")], ["keyRedo", tr("set.keys.redo")]].forEach(([k, label]) => {
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
                    inp.placeholder = tr("set.keys.unset");
                    inp.value = this.settings[k] || "";
                    inp.title = tr("set.keys.tip");
                    inp.addEventListener("focus", () => { inp.value = ""; inp.placeholder = tr("set.keys.press"); });
                    inp.addEventListener("blur", () => {
                        inp.value = this.settings[k] || "";
                        inp.placeholder = tr("set.keys.unset");
                    });
                    inp.addEventListener("keydown", (ev) => {
                        // 录键期间拦住一切：别让 Ctrl+Alt+R 同时触发文档里的动作
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (ev.key === "Escape") { inp.blur(); return; }
                        if (ev.key === "Backspace" || ev.key === "Delete") {
                            this.settings[k] = "";
                            inp.value = "";
                            inp.placeholder = tr("set.keys.unset");
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
            title: tr("set.undo.title"),
            description: tr("set.undo.desc"),
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
            title: tr("set.restore.title"),
            description: tr("set.restore.desc"),
            createActionElement: () => {
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline fn__size200";
                btn.textContent = tr("set.restore.btn");
                btn.addEventListener("click", () => {
                    btn.disabled = true;
                    btn.textContent = tr("set.restore.busy");
                    this.restoreDeadRefs()
                        .catch((e) => { logErr("restoreDead", e); })
                        .finally(() => { btn.disabled = false; btn.textContent = tr("set.restore.btn"); });
                });
                return btn;
            },
        });

        // 诊断开关：默认关。开着会拦全局 fetch，长期开必然拖慢思源，排查完记得关掉
        this.setting.addItem({
            title: tr("set.debug.title"),
            description: tr("set.debug.desc"),
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
        // 刚取消题注的块：id -> 名单到期时间。给自动轮一个硬性的「别碰」名单，
        // 挡住 blocks 表索引滞后那 0.6~2s（甚至更久）里「旧文字把它重新认成题注」的可能。
        this._cancelGuard = new Map();

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
                for (const trx of (d.data || [])) {
                    for (const op of (trx.doOperations || [])) {
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
                showMessage(tr("msg.error", e && e.message ? e.message : e), 8000, "error");
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
        // 「插入交叉引用…」给谁（2026-11-01 用户第三次明确）：
        //   ✅ 正文文字上右键 —— 普通段落、标题、列表项（mode === "para"），以及表格单元格里的文字。
        //      引用是写在文字中间的动作，入口就该在文字右键里。
        //   ❌ 块标（块左侧小图标）菜单不给；❌ 图片/表格本身也不给（那里应该先有题注）。
        // 插在**当前光标处**：openPicker 默认就用选区，绝不传 forceAnchor（传了会定死到块末尾，
        // 反而丢掉用户在单元格里点的位置）。
        const wantRef = r.ok ? r.mode === "para"
            : (r.reason === "table" && els.some((x) => !x.img));
        const refItem = () => ({
            icon: "iconRef",
            label: tr("menu.ref"),
            click: () => {
                const p = protyle || this._lastProtyle || null;
                this.openPicker(p, null).catch((err) => {
                    logErr("blockmenu/ref", err);
                    showMessage(tr("msg.error", err && err.message ? err.message : err), 6000, "error");
                });
            },
        });
        const root0 = menuItemRoot(host);
        const before0 = root0 && root0.children ? root0.children.length : 0;
        if (!r.ok) {
            // 单元格里的文字只给这一项（往单元格写编号会把表搞坏，所以没有题注项）
            if (wantRef) {
                host.addItem(refItem());
                promoteMenuItems(host, before0);
                this.logMenuTree(host);
                return;
            }
            // 公式块 / 混选 / 单元格里的图片：放一条灰掉的说明，让用户知道该右键哪儿，
            // 而不是以为插件没反应。正文右键（quiet）不加：那里已经有思源自己的菜单，再塞一条灰字只是噪音
            if (!quiet && r.reason && r.reason !== "empty") {
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
                        showMessage(tr("msg.error", err && err.message ? err.message : err), 6000, "error");
                    });
                },
            });
        }
        if (wantRef) host.addItem(refItem());
        promoteMenuItems(host, before);
        this.logMenuTree(host);
    }

    /** kind 该以什么打头：优先用户自己配的标签，再兜中英文默认 */
    captionHeadRe(kind) {
        const lab = kind === "fig" ? (this.settings.figLabel || tr("label.fig"))
            : (this.settings.tabLabel || tr("label.tab"));
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
        if (!getDocId(p)) { showMessage(tr("msg.noDoc"), 4000, "error"); return; }
        // 又设回题注了：立刻从「取消别碰」名单里放出来，否则编号会被挡
        this.forgetCancelled(ids);
        // 自动轮正在跑的时候排队等它收工，别静默丢掉这次点击（以前是弹一句就 return）
        if (!(await this.waitIdle(3000))) {
            showMessage(tr("msg.busy"), 4000, "error");
            return;
        }
        for (const id of ids) {
            await retry(() => api("/api/attr/setBlockAttrs", { id: id, attrs: { "custom-xref": kind } }));
        }
        const left = await this.commitCaption(ids, kind, p);
        const word = kind === "fig" ? tr("label.fig") : tr("label.tab");
        if (left.length) {
            await logErr("setCaption/not-numbered", new Error("未编号: " + left.join(",")));
            showMessage(tr("msg.attrWritten", left.length), 4000);
        } else {
            showMessage(tr("msg.setDone", word, ids.length > 1 ? tr("msg.nBlocks", ids.length) : ""), 2000);
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
        if (!getDocId(p)) { showMessage(tr("msg.noDoc"), 4000, "error"); return; }
        if (!(await this.waitIdle(3000))) {
            showMessage(tr("msg.busy"), 4000, "error");
            return;
        }
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
            showMessage(tr("msg.addFail"), 5000, "error");
            return;
        }
        const left = await this.commitCaption(made, kind, p);
        const word = kind === "fig" ? tr("menu.word.fig") : tr("menu.word.tab");
        if (left.length) {
            await logErr("addCaption/not-numbered", new Error("未编号: " + left.join(",")));
            showMessage(tr("msg.addPending"), 4000);
        } else {
            showMessage(tr("msg.addDone", above ? tr("menu.where.above") : tr("menu.where.below"), word,
                made.length > 1 ? tr("msg.nBlocks", made.length) : ""), 2600);
        }
    }

    /**
     * 自动重排正在跑的时候点了菜单项，**不能静默丢掉**。
     * 以前的写法是 `if (this._running) { showMessage("请稍候再试"); return; }` ——
     * 用户点了「取消图表题注」，程序弹一句就结束了，什么也没做，
     * 这就是 1.0.3「取消题注失效」最直接的一条原因（自动轮很频繁，撞上的概率不低）。
     * 现在改成排队：最多等 3 秒，重排一收工就执行；真等不到才报错，且明确写出「未执行」。
     */
    async whenIdle(label, fn) {
        if (!(await this.waitIdle(3000))) {
            await logErr("menu/" + label, new Error("重排长时间未结束，本次操作未执行"));
            showMessage(tr("msg.busy"), 4000, "error");
            return null;
        }
        try {
            return await fn();
        } catch (e) {
            await logErr("menu/" + label, e);
            showMessage(tr("msg.error", e && e.message ? e.message : e), 6000, "error");
            return null;
        }
    }

    /** 最多等 maxMs，重排收工了就返回 true */
    async waitIdle(maxMs) {
        const end = Date.now() + (maxMs || 3000);
        while (this._running && Date.now() < end) await sleep(250);
        return !this._running;
    }

    /** 把刚取消的块记进「别碰」名单（默认 30 秒，足够覆盖索引延迟） */
    markCancelled(ids) {
        if (!this._cancelGuard) this._cancelGuard = new Map();
        const until = Date.now() + 30000;
        (ids || []).forEach((id) => { if (id) this._cancelGuard.set(id, until); });
    }

    /** 取当前仍在名单里的块 id（顺手清掉过期的，不落盘、自愈） */
    cancelledIds() {
        if (!this._cancelGuard) this._cancelGuard = new Map();
        const now = Date.now();
        const out = [];
        this._cancelGuard.forEach((t, id) => {
            if (t > now) out.push(id); else this._cancelGuard.delete(id);
        });
        return out;
    }

    /** 又设回题注了 → 立刻从名单里放出来，别挡着编号 */
    forgetCancelled(ids) {
        if (!this._cancelGuard) return;
        (ids || []).forEach((id) => this._cancelGuard.delete(id));
    }

    /**
     * 右键图片/表格点「取消图表题注」的兜底：现场找它旁边那个题注段落。
     * 方向同插入：图往下看、表往上看。（菜单里通常已经算出来了，这条只在拿不到 DOM 时用。）
     * 只认同方向的题注（用户 2026-11-01 选 B）：题注写到反方向去了，就提示去右键它本身。
     */
    async clearCaptionNear(ids, kind, protyle) {
        if (!ids || !ids.length) return;
        const p = protyle || this._lastProtyle || null;
        const docId = getDocId(p);
        if (!docId) { showMessage(tr("msg.noDoc"), 4000, "error"); return; }
        return this.whenIdle("clear-near", async () => {
            const grab = async () => {
                let bs = [];
                try { bs = await collectBlocks(docId); } catch (e) { bs = []; }
                const map = {};
                bs.forEach((b, i) => { map[b.id] = i; });
                return { bs: bs, map: map };
            };
            let got = await grab();
            // blocks 表刚写入时可能还查不到这一块（实测 0.6~2s，偶发更久）。采不到位置就再采，
            // 否则「找不到题注」的提示其实是「没找到这张图」，会把人带偏。
            for (let i = 0; i < 3 && ids.some((id) => got.map[id] === undefined); i++) {
                await sleep(500);
                got = await grab();
            }
            const blocks = got.bs, at = got.map;
            const up = kind === "tab";
            const targets = [];
            const onWrongSide = [];
            const lost = [];
            for (const id of ids) {
                const i = at[id];
                if (i === undefined) { lost.push(id); continue; }
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
                if (targets.length) continue;
                // 反方向扫一眼只为了**把话说准**，不做任何写入：
                // 这一步能区分「真的是普通图片」和「题注放到了图的上方」
                for (let n = 1; n <= 2; n++) {
                    const j = i - step * n;
                    if (j < 0 || j >= blocks.length) break;
                    if (blocks[j].type !== "p") break;
                    const k = classify(blocks[j], this.settings);
                    if (k) { onWrongSide.push(blocks[j].id); break; }
                    if (String(blocks[j].markdown || "").trim()) break;
                }
            }
            this.trace({ clearNear: "lookup", ids: ids, hit: targets.length, wrong: onWrongSide.length,
                lost: lost.length, kind: kind || "?" });
            if (!targets.length) {
                const side = up ? tr("menu.where.above") : tr("menu.where.below");
                if (lost.length) {
                    // 连这块本身都没在快照里 —— 这是索引延迟，不是「没有题注」，别误导
                    showMessage(tr("msg.notIndexed"), 3500);
                } else if (onWrongSide.length) {
                    showMessage(tr("msg.wrongSide", up ? tr("noun.table") : tr("noun.image"), side), 5000);
                } else {
                    showMessage(tr("msg.noNeighbor", up ? tr("label.tab") : tr("label.fig"), side), 4500);
                }
                return;
            }
            await this.clearCaption(targets, p);
        });
    }

    /**
     * 取消题注：先清属性，再剥「图 3」前缀，最后重排让后面的编号顺延。
     *
     * ⚠ 顺序不能反。剥前缀走的是 updateBlock(dataType:"dom") 整块回传，回传的 DOM 里
     * 带着块自己的 IAL —— 属性还没清就回传，会把 custom-xref="fig" 原样写回去，
     * 而且这次回写的落地比 setBlockAttrs 还晚，表现就是「编号没了但属性还在，
     * 下一轮又变回题注、后面的编号也不顺延」（1.0.3 快通道测试抓到的真 bug）。
     *
     * ⚠ 入口先排队（whenIdle），不再「正在重排就直接放弃」：自动轮很频繁，撞上就白点一次，
     * 这是 1.0.3「取消题注点了没反应」最直接的一条原因。
     */
    async clearCaption(ids, protyle) {
        if (!ids || !ids.length) return;
        const p = protyle || this._lastProtyle || null;
        const docId = getDocId(p);
        if (!docId) { showMessage(tr("msg.noDoc"), 4000, "error"); return; }
        // 先占「别碰」名单：等重排收工这段时间里，它也不会把这块重新当成题注编一次号
        this.markCancelled(ids);
        this.trace({ clear: "enter", doc: docId, n: ids.length, ids: ids.join(","), busy: !!this._running });
        return this.whenIdle("clear", () => this.clearCaptionNow(ids, p));
    }

    /** 取块正文（kramdown 去掉末行 IAL）。返回 null = 读不到，调用方别据此下判断 */
    async kramdownBody(id) {
        try {
            const r = await api("/api/block/getBlockKramdown", { id: id });
            const k = (r && r.kramdown) ? String(r.kramdown) : "";
            return k.replace(/\n?\{:[^}]*\}\s*$/, "");
        } catch (e) { return null; }
    }

    /** 把剥掉编号后的正文写回去（空串要显式清空，不能直接跳过） */
    async writeStripped(id, next, protyle) {
        if (String(next || "").trim()) {
            await updateContent(id, String(next).trim(), protyle, null);
            return;
        }
        // 题注正文只有编号（新建题注段落最常见：整块就一个「表 1」）——
        // 剥完是空串，这里必须显式清空。实测 updateBlock(markdown,"") 能把段落
        // 清成空块且块本身还在（不是删块）；md 模式会丢 IAL，但此时属性已在第 1 步清完。
        await retry(() => api("/api/block/updateBlock",
            { id: id, dataType: "markdown", data: "" }));
    }

    async clearCaptionNow(ids, p) {
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
        this.trace({ clear: "attrs", n: ids.length, names: clearedName });
        // 2) 再剥前缀，此时 DOM 回传里已经没有 custom-xref
        let changed = 0;
        for (const id of ids) {
            const body = await this.kramdownBody(id);
            if (body === null) continue;                 // 读不到就不动，留给下一轮
            const next = stripCaptionPrefix(body);
            if (next === body) continue;                 // 本来就没有编号前缀
            await this.writeStripped(id, next, p);
            changed += 1;
        }
        // 2b) 回读核实：前缀真的没了才算成功。
        // 少了这一步，「接口返回成功、正文其实没变」会静默放过，随后自动轮凭旧文字
        // 再把它认成题注，属性、块名、编号整套写回来 —— 现象就是「取消了又自己变回来」。
        const stuck = [];
        for (const id of ids) {
            let body = await this.kramdownBody(id);
            if (body === null) { stuck.push(id); continue; }
            if (stripCaptionPrefix(body) === body) continue;
            await this.writeStripped(id, stripCaptionPrefix(body), p);
            body = await this.kramdownBody(id);
            if (body === null || stripCaptionPrefix(body) !== body) stuck.push(id);
        }
        // 前缀去不掉的块**放回正常编号**：正文里明明白白写着「图 1-1」，
        // 却把它排除在编号外，会造出「两个块都叫图 2」这种更难查的错。
        // 这里明确告诉用户去手动删那行前缀，而不是继续按取消处理。
        if (stuck.length) {
            this.forgetCancelled(stuck);
            await logErr("clearCaption/stuck", new Error("编号前缀未能去除: " + stuck.join(",")));
        }
        this.trace({ clear: "strip", changed: changed, stuck: stuck.length });
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
        // 4) 重排，让后面的编号顺延。
        //    kindOverride 把「已不是题注」盖到本轮采集上，不必等 blocks 表索引；
        //    exclude 再上一道硬挡 —— 两道都不依赖那行旧数据，所以必定生效。
        //    （老写法在 ready=false 时退回「等 SQL 再重排」，那条路上 SQL 只要还是旧值，
        //     编号就会被重新写回去，取消等于没做。）
        const map = {};
        ids.forEach((id) => { map[id] = ""; });
        const exclude = this.cancelledIds().filter((id) => ids.indexOf(id) >= 0);
        const ready = await this.waitCaptionAttrs(ids, "");
        if (!ready) this.trace({ clear: "attrs-lag", ids: ids.join(",") });
        await this.renumber(p, { kindOverride: map, mustInclude: ids, exclude: exclude });
        const bits = [];
        if (!changed) bits.push(tr("msg.cancel.none"));
        if (clearedName) bits.push(tr("msg.cancel.names", clearedName));
        if (stuck.length) bits.push(tr("msg.cancel.stuck", stuck.length));
        // 「不处理」档下不改引用，但得让人知道有这么几处引用还挂着旧编号
        if ((this.settings.deadRefAction || "off") === "off" && this._lastOrphan) {
            bits.push(tr("msg.cancel.orphan", this._lastOrphan));
        }
        this.trace({ clear: "done", n: ids.length, stuck: stuck.length, orphan: this._lastOrphan || 0 });
        showMessage(tr("msg.cancelled", ids.length > 1 ? tr("msg.nBlocks", ids.length) : "",
            bits.length ? tr("msg.cancelWrap", bits.join(tr("msg.sep"))) : ""), stuck.length ? 5000 : 2500);
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
        showMessage(tr("msg.settingsSaved"));
    }

    /**
     * opts.auto  自动模式：绝不写入光标所在的块（打断输入），等光标离开再排
     * opts.silent 成功不弹提示（自动模式用）
     */
    async renumber(protyle, opts) {
        const o = opts || {};
        // 重入保护：自动轮和手动轮同时跑会互相覆盖编号
        if (this._running) {
            if (!o.auto) showMessage(tr("msg.renumbering"), 3000);
            return;
        }
        const docId = getDocId(protyle);
        if (!docId) {
            if (!o.silent) showMessage(tr("msg.noDoc"), 4000, "error");
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
            // 刚取消的块（含 30 秒内的自动轮）一并盖成「不是题注」：
            // 它们正文前缀刚剥掉、SQL 里那行旧文字还在，不盖住就会被重新认成题注。
            const excl = new Set(o.exclude || []);
            this.cancelledIds().forEach((id) => excl.add(id));
            if (excl.size) {
                const map = Object.assign({}, o.kindOverride || {});
                excl.forEach((id) => { map[id] = ""; });
                withKindOverride(blocks, map);
            } else if (o.kindOverride) {
                withKindOverride(blocks, o.kindOverride);
            }
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
            const r = buildPlan(blocks, this.settings, burnable, excl);
            if (!r.plan.length && !r.refs.length) {
                if (!o.silent) showMessage(tr("msg.noTargets"), 4000);
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
                showMessage(tr("msg.emptyEq", emptyEqs.length), 9000, "error");
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
                let msg = tr("msg.renumbered", r.plan.length, r.refs.length);
                if (dead.length) {
                    if (this.settings.deadRefAction === "text") {
                        // 只有真烧掉了才说「已转成」；还在宽限期内就照实说清
                        const burned = (r.deadRefs || []).reduce((a, x) => a + (x.n || 0), 0);
                        const gs = Math.round((this.settings.deadGrace || 10000) / 1000);
                        msg += burned ? tr("msg.burned", burned) : tr("msg.deadGrace", dead.length, gs);
                    } else {
                        msg += tr("msg.deadFound", dead.length);
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
                showMessage(tr("msg.error", e && e.message ? e.message : e), 8000, "error");
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
        showMessage(tr("msg.deadPainted", this._deadIds.length), 7000, "error");
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
        if (!this._undo.length) { showMessage(tr("msg.noUndo"), 4000); return; }
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
        showMessage(tr("msg.undoDone", hh, r.n,
            r.rebuilt ? tr("msg.undoRebuilt", r.rebuilt) : "",
            r.miss ? tr("msg.undoMiss", r.miss) : "", this._undo.length), 7000);
        this.auditAndPaint();
    }

    async redoLast() {
        this._redo = this._redo || [];
        if (!this._redo.length) { showMessage(tr("msg.noRedo"), 4000); return; }
        const rec = this._redo.pop();
        this._quietUntil = Date.now() + 2500;
        let r = { n: 0, miss: 0, rebuilt: 0 };
        try { r = await this.replay(rec, "after"); } catch (e) { await logErr("redoLast", e); }
        this._undo = this._undo || [];
        this._undo.push(rec);
        this.saveUndo();
        showMessage(tr("msg.redoDone", this._undo.length,
            r.rebuilt ? tr("msg.redoRebuilt", r.rebuilt) : ""), 5000);
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
            showMessage(tr("msg.noArchive"), 5000);
            return;
        }
        const rows = docId ? log.filter((x) => x.doc === docId) : log;
        if (!rows.length) {
            showMessage(tr("msg.noDocDead"), 5000);
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
        showMessage(tr("msg.restored", okRef, okB, missB ? tr("msg.restoreMiss", missB) : ""), 9000);
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

    async openPicker(protyle, nodeEl, opts) {
        const o = opts || {};
        // opts.anchorId = 由调用方指定「引用条插到哪个段落」，比从选区反推稳。
        // ⚠ 1.0.5 起块右键菜单不再给「插入交叉引用」，所以当前没有调用方传这个参数；
        // 代码保留（传空串时整条分支完全不起作用，/xref 与快捷键路径行为不变），
        // 留给将来可能加的工具栏按钮 / 大纲入口。
        const forceAnchor = o.anchorId || "";
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
        if (forceAnchor) anchorId = forceAnchor;
        const docId = getDocId(protyle);
        if (!docId) {
            await logErr("openPicker", new Error("未取到当前文档 ID，protyle=" +
                (protyle ? Object.keys(protyle).slice(0, 12).join(",") : "null")));
            showMessage(tr("msg.noDoc"), 4000, "error");
            return;
        }
        let rows = [];
        let sections = [];
        try {
            // 用 collectFresh 而不是 collectBlocks：面板刚打开时，用户可能刚写完一个题注，
            // blocks 表索引还没跟上（实测 0.6~2s）→ 采不到它，面板里就少一条。
            // collectFresh 会拿页面 DOM 里的一级块 id 对照快照，缺了重采；拿不到 DOM 时行为与 collectBlocks 一致。
            const fresh = await collectFresh(docId, protyle);
            const built = buildPlan(fresh.blocks, this.settings);
            rows = built.plan;
            sections = built.sections || [];
        } catch (e) {
            await logErr("openPicker:collect", e);
            showMessage(tr("msg.readFail", e && e.message ? e.message : e), 8000, "error");
            return;
        }
        if (!rows.length) { showMessage(tr("msg.noTargets"), 4000); return; }

        const mask = document.createElement("div");
        mask.className = "xr-mask";
        const panel = document.createElement("div");
        panel.className = "xr-panel";
        const title = document.createElement("div");
        title.className = "xr-title";
        title.textContent = tr("picker.title");
        const input = document.createElement("input");
        input.className = "b3-text-field xr-input";
        input.placeholder = tr("picker.ph");
        // 筛选条：左边是类型（全部 / 图 / 表 / 式），右边是「只看某一节」的章节下拉。
        // 图表公式几十上百条时，光靠打字搜编号太慢（用户 2026-11-01 提）。
        const tools = document.createElement("div");
        tools.className = "xr-tools";
        const chipBox = document.createElement("div");
        chipBox.className = "xr-chips";
        const secSel = document.createElement("select");
        secSel.className = "b3-select xr-sec";
        secSel.title = tr("picker.secTip");
        tools.appendChild(chipBox);
        tools.appendChild(secSel);
        const list = document.createElement("div");
        list.className = "xr-list";
        panel.appendChild(title);
        panel.appendChild(tools);
        panel.appendChild(input);
        panel.appendChild(list);
        mask.appendChild(panel);
        document.body.appendChild(mask);
        input.focus();

        // 公式行要渲染成真公式（用户 2026-11-01 反馈：别显示 $$ y=1-sin(x) \tag{2-1} $$ 这种源码）
        const renderMath = await ensureMathRenderer();
        /** 一行的右侧预览：公式→渲染，其余→纯文字 */
        const previewOf = (x) => {
            if (x.kind === "eq") {
                const tex = eqTex(x.curMd || x.oldMd);
                if (!tex) return '<span class="xr-tex">' + esc(x.name) + "</span>";
                const html = renderMath ? renderMath(tex) : "";
                // 渲染不出来就显示等宽 LaTeX（已去掉 $$ 与 \tag），至少是能读的源码
                return html ? '<span class="xr-math">' + html + "</span>"
                    : '<span class="xr-tex">' + esc(tex.slice(0, 60)) + "</span>";
            }
            return esc(String(x.oldMd || "").replace(/\n/g, " ").slice(0, 50));
        };
        // ── 筛选：类型（图/表/式） + 所属标题 ────────────────────────────
        let typeFilter = "";   // "" 全部 | fig | tab | eq
        let secFilter = "";    // "" 全部 | 标题块 id
        let items = [];
        let cur = 0;
        /** 章节 + 搜索词都满足的项（不含类型判断）——chip 上的计数用它 */
        const baseRows = () => filterPickerRows(rows, { secId: secFilter, q: input.value });
        const applyFilter = () => filterPickerRows(rows,
            { kind: typeFilter, secId: secFilter, q: input.value });

        const chips = [];
        [["", tr("picker.all")], ["fig", tr("label.fig")],
         ["tab", tr("label.tab")], ["eq", tr("label.eq")]].forEach(([k, label]) => {
            const chip = document.createElement("div");
            // tabindex=-1：鼠标点得动，但 Tab 和方向键还是留在输入框里，不打乱 ↑↓ 选行
            chip.setAttribute("tabindex", "-1");
            chip.className = "xr-chip" + (k === "" ? " xr-chip-on" : "");
            chip.addEventListener("mousedown", (ev) => {
                ev.preventDefault();
                // 再点一次当前类型 = 取消，回到全部
                typeFilter = (k && typeFilter !== k) ? k : "";
                refresh();
            });
            chips.push({ el: chip, kind: k, label: label });
            chipBox.appendChild(chip);
        });
        /** 刷新 chip 文字（带各类条数）和高亮 */
        const paintChips = () => {
            const base = baseRows();
            const n = { "": base.length, fig: 0, tab: 0, eq: 0 };
            base.forEach((x) => { n[x.kind] = (n[x.kind] || 0) + 1; });
            chips.forEach((c) => {
                c.el.textContent = c.label + " (" + n[c.kind] + ")";
                c.el.classList.toggle("xr-chip-on", c.kind === typeFilter);
            });
        };

        // 章节下拉：只列「真的有图/表/式」的标题，免得长文档里一整屏都是空节
        const secIds = new Set();
        rows.forEach((x) => { if (x.hPath) x.hPath.split("/").forEach((id) => secIds.add(id)); });
        const optAll = document.createElement("option");
        optAll.value = "";
        optAll.textContent = tr("picker.allSec");
        secSel.appendChild(optAll);
        let secCount = 0;
        sections.forEach((sec) => {
            if (!secIds.has(sec.id)) return;
            const opt = document.createElement("option");
            opt.value = sec.id;
            // H2 缩进两格 → 一眼看出层级，跟思源大纲的缩进习惯一致
            opt.textContent = "H" + sec.lv + " " + new Array(Math.max(0, sec.lv)).join("\u3000") +
                (sec.text || tr("picker.secNone"));
            secSel.appendChild(opt);
            secCount += 1;
        });
        // 整篇一个标题都没有（纯图片集 / 单节文档）：藏起来，别白占一行
        if (!secCount) secSel.style.display = "none";
        secSel.addEventListener("change", () => {
            secFilter = secSel.value;
            refresh();
        });
        // 下拉会把焦点抢走，选完还给输入框，否则 ↑↓ / Enter 全失效
        secSel.addEventListener("blur", () => { try { input.focus(); } catch (e) { /* 忽略 */ } });

        const render = () => {
            list.innerHTML = "";
            if (!items.length) {
                const empty = document.createElement("div");
                empty.className = "xr-empty";
                empty.textContent = tr("picker.empty");
                list.appendChild(empty);
                return;
            }
            items.forEach((x, i) => {
                const it = document.createElement("div");
                it.className = "xr-item" + (i === cur ? " xr-cur" : "");
                it.innerHTML = '<span class="xr-name">' + esc(x.name) + "</span>" +
                    '<span class="xr-preview">' + previewOf(x) + "</span>";
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
            if (forceAnchor) {
                // 右键菜单：直接插到那个段落的末尾（不认斜杠残留，免得误删正文）
                restored = caretToBlockEnd(anchorId);
            } else if (slashRangeIn(anchorEl)) {
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
                showMessage(forceAnchor ? tr("picker.noAnchor") : tr("picker.noSlash"), 8000, "error");
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
                catch (e2) { showMessage(tr("msg.insertFail", e && e.message ? e.message : e), 6000, "error"); return; }
            }

        };
        const onKey = (ev) => {
            // 章节下拉自己要用方向键，别在这里截走
            if (ev.target === secSel) return;
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
        /** 筛选条件变了：重算列表 + 重算 chip 计数 + 回到第一行 */
        const refresh = () => {
            items = applyFilter();
            cur = 0;
            paintChips();
            render();
        };
        input.addEventListener("input", refresh);
        mask.addEventListener("mousedown", (ev) => { if (ev.target === mask) close(); });
        refresh();
    }
}

// 供本地离线测试使用（插件运行时不读这个字段）
SiYuanXref.__test = { collectBlocks: collectBlocks, buildPlan: buildPlan, applyPlan: applyPlan,
    classify: classify, findDeadRefs: findDeadRefs, paintDead: paintDead, rebuildBlock: rebuildBlock,
    withKindOverride: withKindOverride,
    isBlockAlive: isBlockAlive, aliveMap: aliveMap, dropStaleDead: dropStaleDead, collectRaw: collectRaw,
    ownVersion: ownVersion,
    slashRangeIn: slashRangeIn, restoreCaret: restoreCaret, getDocId: getDocId,
    caretToBlockEnd: caretToBlockEnd,
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
    stripNumber: stripNumber,
    mainMenuOf: mainMenuOf, menuItemRoot: menuItemRoot,
    stripCaptionPrefix: stripCaptionPrefix, DEFAULTS: DEFAULTS,
    tr: tr, setUiLang: setUiLang, detectUiLang: detectUiLang, UI_TEXT: UI_TEXT,
    eqTex: eqTex, ensureMathRenderer: ensureMathRenderer, resetMathRenderer: resetMathRenderer,
    headingText: headingText, filterPickerRows: filterPickerRows,
    ialValue: ialValue, restoreDeadInMd: restoreDeadInMd, countRestored: countRestored };
module.exports = SiYuanXref;
