"use strict";
/* v1.2.8 交叉引用窗口「范围层级」离线单测。
 * 用法：node test/picker_scope_level.test.js
 * 只测纯函数，不连思源、不写库。
 */
const Module = require("module");
const orig = Module._load;
Module._load = function (req) {
    if (req === "siyuan") {
        return { Plugin: class {}, Setting: class {},
            showMessage: () => {}, fetchSyncPost: () => Promise.resolve({}) };
    }
    return orig.apply(this, arguments);
};
const assert = require("assert");
const T = require("../index.js").__test;

let pass = 0, fail = 0;
function t(name, fn) {
    try { fn(); pass++; console.log("PASS " + name); }
    catch (e) { fail++; console.log("FAIL " + name + " :: " + (e && e.message)); }
}

// 真机取到的文档属性 custom-doc-num-meta 形态
const M = (rootID, rootNum, targetId) => ({ rootID, rootNum, targetId: targetId || "t1" });
const row = (name, meta) => ({ name, docMeta: meta });
// 【计算机】top 根
const PC = "20230217174422-w4p3z7n";
// 【教材与专著】top 根（不同笔记本，必须永远隔开）
const BK = "20260924192908-8exkk6h";

const rows = [
    row("本章图 3-1", M(PC, "1.2.3.7")),     // 3.7 AAAAA（当前文档）
    row("同章图 3-2", M(PC, "1.2.3.7")),
    row("他章式 4-1", M(PC, "1.2.4.1")),     // 4.1 test，同篇第 2 级链 1.2
    row("他篇图 1-1", M(PC, "1.1.3.7")),     // 同 top 目录，但第 2 级链 1.1
    row("别处图 1-1", M(PC, "2.1.2.3")),     // 另一 rootID（2.3 AAAAA）
    row("教材式 1-1", M(BK, "1.2.3")),       // 别的笔记本，链名同为 1.2
    row("教材图 1-1", M(BK, "1.4.1")),
    row("无编号文档", null),
];

const keyOf = (meta, L) => T.xrChainKeyFromMeta(meta, L);
const pick = (L) => T.xrPickerRowsInLevel(rows, keyOf(M(PC, "1.2.3.7"), L), L)
    .map((x) => x.name);

/* ---------- 1. 可选层级与默认层级 ---------- */
t("levelList/0..n", () => {
    assert.deepStrictEqual(T.xrPickerLevelList(3), [0, 1, 2, 3]);
    assert.deepStrictEqual(T.xrPickerLevelList(1), [0, 1]);
    assert.deepStrictEqual(T.xrPickerLevelList(0), [0, 1]);
});
t("level0/across-all-notebooks", () => {
    const got = T.xrPickerRowsInLevel(rows, "", 0).map((x) => x.name);
    assert.equal(got.length, rows.length, "0 级不砍任何题注");
    assert.ok(got.includes("教材式 1-1"), "0 级要能跨笔记本");
    assert.ok(got.includes("别处图 1-1"), "0 级要能跨范围根");
    assert.ok(got.includes("无编号文档"), "0 级连无 meta 的也列出");
});
t("level0/empty-key-still-all", () => {
    assert.equal(T.xrPickerRowsInLevel(rows, null, 0).length, rows.length);
});
t("defaultLevel/n-minus-1", () => {
    assert.equal(T.xrPickerDefaultLevel(3, true), 2);
    assert.equal(T.xrPickerDefaultLevel(3, false), 3);  // 关自动收窄 = 只本章
    assert.equal(T.xrPickerDefaultLevel(1, true), 1);
});

/* ---------- 2. 默认第 2 级：可跨章，不可跨篇 / 跨 root / 跨笔记本 ---------- */
t("level2/same-chapter-and-sibling-chapter", () => {
    const got = pick(2);
    assert.ok(got.includes("本章图 3-1"), "当前章要在");
    assert.ok(got.includes("同章图 3-2"));
    assert.ok(got.includes("他章式 4-1"), "同篇其它章节要能引用");
});
t("level2/excludes-other-part", () => {
    assert.ok(!pick(2).includes("他篇图 1-1"), "1.1 是别的篇，不能进");
});
t("level2/excludes-other-rootID", () => {
    assert.ok(!pick(2).includes("别处图 1-1"), "2.1.2.3 是另一范围根");
});
t("level2/excludes-other-notebook", () => {
    const got = pick(2);
    assert.ok(!got.includes("教材式 1-1"), "【教材与专著】不能混进【计算机】");
    assert.ok(!got.includes("教材图 1-1"));
});
t("level2/excludes-no-meta", () => {
    assert.ok(!pick(2).includes("无编号文档"), "无 meta 不能放行");
});

/* ---------- 3. 第 3 级：只本章 ---------- */
t("level3/only-this-chapter", () => {
    const got = pick(3);
    assert.equal(got.length, 2);
    assert.ok(got.includes("本章图 3-1") && got.includes("同章图 3-2"));
    assert.ok(!got.includes("他章式 4-1"), "第 3 级不能跨章");
});

/* ---------- 4. 第 1 级：可跨篇，仍不跨 top 目录 / 笔记本 ---------- */
t("level1/cross-part", () => {
    const got = pick(1);
    assert.ok(got.includes("他篇图 1-1"), "第 1 级可引用其它篇");
    assert.ok(got.includes("他章式 4-1"));
});
t("level1/still-excludes-other-root-and-notebook", () => {
    const got = pick(1);
    assert.ok(!got.includes("别处图 1-1"), "rootNum 首段为 2，仍属另一范围根");
    assert.ok(!got.includes("教材式 1-1"), "教材的 1.2.3 首段也是 1，但 rootID 不同");
    assert.ok(!got.includes("教材图 1-1"));
});

/* ---------- 5. 没有「全部范围」放行口 ---------- */
t("empty-key/never-falls-back-to-all", () => {
    assert.deepStrictEqual(T.xrPickerRowsInLevel(rows, "", 2), []);
    assert.deepStrictEqual(T.xrPickerRowsInLevel(rows, undefined, 1), []);
});
t("no-cross-notebook-at-any-level-above-0", () => {
    [1, 2, 3, 4].forEach((L) => {
        const got = T.xrPickerRowsInLevel(rows, keyOf(M(PC, "1.2.3.7"), L), L)
            .map((x) => x.name);
        assert.ok(!got.some((n) => n.indexOf("教材") === 0),
            "L=" + L + " 混进了别的笔记本");
    });
});
t("level-too-deep/returns-empty-not-all", () => {
    // rootNum 只有 4 段，选第 5 级时两边 key 都为空 → 空列表，不放行
    assert.deepStrictEqual(pick(5), []);
});

/* ---------- 6. 按 target 覆盖层级不受影响（A 方案回归） ---------- */
t("per-target-override/unchanged", () => {
    assert.equal(T.xrLevelForDoc({ meta: M(PC, "1.2.3.7", "tA") }, 3, { tA: 2 }), 2);
    assert.equal(T.xrLevelForDoc({ meta: M(PC, "1.2.3.7", "tB") }, 3, { tA: 2 }), 3);
});

/* ---------- 7. v1.2.9：筛选状态持久化（纯函数） ---------- */
t("savedLevel/0-is-legal", () => {
    const list = [0, 1, 2, 3];
    assert.equal(T.xrPickerSavedLevel(0, list, 2), 0, "记住的 0 级必须生效，不能回退默认");
    assert.equal(T.xrPickerSavedLevel(3, list, 2), 3);
});
t("savedLevel/invalid-falls-back", () => {
    const list = [0, 1, 2, 3];
    assert.equal(T.xrPickerSavedLevel(-1, list, 2), 2, "-1 = 没存过，走默认");
    assert.equal(T.xrPickerSavedLevel(9, list, 2), 2, "超出可选范围回退默认");
    assert.equal(T.xrPickerSavedLevel("x", list, 2), 2);
    assert.equal(T.xrPickerSavedLevel(undefined, list, 2), 2);
    assert.equal(T.xrPickerSavedLevel(1, [0, 1], 0), 1);
    assert.equal(T.xrPickerSavedLevel(2, [0, 1], 0), 0);
});
t("savedSec/only-restore-if-present", () => {
    assert.equal(T.xrPickerSavedSec("R|1.2", ["", "R|1.2", "R|1.3"]), "R|1.2");
    assert.equal(T.xrPickerSavedSec("R|9.9", ["", "R|1.2"]), "", "失效的章节要清空");
    assert.equal(T.xrPickerSavedSec("", [""]), "");
    assert.equal(T.xrPickerSavedSec(undefined, ["", "R|1.2"]), "");
});
t("defaults/picker-state-keys", () => {
    assert.equal(T.DEFAULTS.pickerType, "");
    assert.equal(T.DEFAULTS.pickerLevel, -1);
    assert.equal(T.DEFAULTS.pickerSec, "");
});

/* ---------- 8. v0.9.1 属性精简：xref 新旧格式都算得出同样的范围键 ---------- */
const ialOf = (o) => '{: custom-doc-num-meta="' +
    JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
        .replace(/\{/g, "&#123;").replace(/\}/g, "&#125;") + '"}';
const OLD_META = { rootID: "R", rootNum: "1.2.3.7", CustomNum: "3.7", CurrentNum: 7, targetId: "T" };
const NEW_META = { rootID: "R", rootNum: "1.2.3.7", targetId: "T" };
t("metaSlit/old-and-new-parse-identical", () => {
    const a = T.xrParseMeta(ialOf(OLD_META));
    const b = T.xrParseMeta(ialOf(NEW_META));
    assert.ok(a && b, "两种格式都要能解析");
    assert.equal(a.rootID, b.rootID);
    assert.equal(a.rootNum, b.rootNum);
    assert.equal(a.targetId, b.targetId);
});
t("metaSlit/same-scope-key-at-every-level", () => {
    [1, 2, 3, 4].forEach((L) => {
        const a = T.xrParseMeta(ialOf(OLD_META));
        const b = T.xrParseMeta(ialOf(NEW_META));
        assert.equal(T.xrChainKeyFromMeta(a, L), T.xrChainKeyFromMeta(b, L),
            "L=" + L + " 新旧属性算出的范围键必须一致");
    });
});
t("metaSlit/same-prefix-and-target-level", () => {
    const a = T.xrParseMeta(ialOf(OLD_META));
    const b = T.xrParseMeta(ialOf(NEW_META));
    assert.equal(T.xrScopePrefix(a.rootNum, 3), T.xrScopePrefix(b.rootNum, 3));
    assert.equal(T.xrLevelForDoc({ meta: a }, 3, { T: 2 }),
                 T.xrLevelForDoc({ meta: b }, 3, { T: 2 }), "按 target 覆盖层级不受影响");
});
t("metaSlit/bad-value-still-null", () => {
    assert.equal(T.xrParseMeta('{: custom-doc-num-meta="not-json"}'), null);
    assert.equal(T.xrParseMeta(""), null);
});

/* ---------- v1.2.11：当前层级空 → 自动放宽，窗口照常弹 ---------- */
// 复现样例：文档「第1章 前言」rootNum 只有 "1.1" 两段，记住的却是第 3 级
const shallowRows = [
    row("图 1-1", M(BK, "1.1")),        // 本文档的题注（旧版因此弹 toast 不建窗口）
    row("第2章图", M(BK, "1.2.3")),    // 同一第 1 级链的其它章节
    row("别处图", M(PC, "1.2.3.7")),   // 另一个笔记本
];
const keysFor = (meta) => {
    const m = new Map();
    [0, 1, 2, 3].forEach((L) => m.set(L, L > 0 ? T.xrChainKeyFromMeta(meta, L) : ""));
    return m;
};
const LST = [0, 1, 2, 3];
t("repro/level3-key-empty-level2-has-caption", () => {
    const k = keysFor(M(BK, "1.1"));
    assert.equal(k.get(3), "", "rootNum 只有 2 段，第 3 级链键算不出");
    assert.equal(T.xrPickerRowsInLevel(shallowRows, k.get(3), 3).length, 0);
    const got = T.xrPickerRowsInLevel(shallowRows, k.get(2), 2).map((x) => x.name);
    assert.deepStrictEqual(got, ["图 1-1"], "升到第 2 级就能看到本文档的图 1-1");
});
t("autoWiden/3-empty-falls-to-2", () => {
    const r = T.xrPickerFirstNonEmptyLevel(shallowRows, keysFor(M(BK, "1.1")), LST, 3, false);
    assert.deepStrictEqual(r, { level: 2, found: true });
    assert.equal(T.xrPickerRowsInLevel(shallowRows, keysFor(M(BK, "1.1")).get(2), 2).length, 1);
});
t("autoWiden/never-auto-cross-notebook", () => {
    // 所有 1..3 级链键都算不出，只有 0 级（跨笔记本）有内容
    const r = T.xrPickerFirstNonEmptyLevel(shallowRows, keysFor(null), LST, 3, false);
    assert.deepStrictEqual(r, { level: 1, found: false }, "不许偷偷跳到 0 级");
    const r2 = T.xrPickerFirstNonEmptyLevel(shallowRows, keysFor(null), LST, 3, true);
    assert.deepStrictEqual(r2, { level: 0, found: true }, "显式允许时才可进 0 级");
});
t("autoWiden/user-chosen-level0-is-kept", () => {
    const r = T.xrPickerFirstNonEmptyLevel(shallowRows, keysFor(M(BK, "1.1")), LST, 0, false);
    assert.deepStrictEqual(r, { level: 0, found: true });
});
t("autoWiden/only-wider-never-narrower", () => {
    const k = keysFor(M(BK, "1.1"));
    k.set(1, "");   // 第 1 级链键故意算不出，但第 2 级有内容 —— 也不许往「更窄」跳
    const r = T.xrPickerFirstNonEmptyLevel(shallowRows, k, LST, 1, false);
    assert.deepStrictEqual(r, { level: 1, found: false });
});
t("autoWiden/all-empty-stays-widest-allowed", () => {
    const r = T.xrPickerFirstNonEmptyLevel([], keysFor(M(BK, "1.1")), LST, 3, false);
    assert.deepStrictEqual(r, { level: 1, found: false });
});
t("autoWiden/start-out-of-list-falls-back", () => {
    const r = T.xrPickerFirstNonEmptyLevel(shallowRows, keysFor(M(BK, "1.1")), LST, 9, false);
    assert.deepStrictEqual(r, { level: 2, found: true });
});
t("autoWiden/level1-can-cross-chapters", () => {
    const k = keysFor(M(BK, "1.1"));
    const got = T.xrPickerRowsInLevel(shallowRows, k.get(1), 1).map((x) => x.name);
    assert.deepStrictEqual(got.sort(), ["图 1-1", "第2章图"], "1 级仍锁在同一 rootID，不跨笔记本");
});

/* ---------- v1.2.19：无 custom-doc-num-meta → 单文档模式 ---------- */
t("bookDoc/meta-shapes", () => {
    assert.equal(T.xrDocInBook(null), false);
    assert.equal(T.xrDocInBook({}), false);
    assert.equal(T.xrDocInBook({ rootID: "R", rootNum: "" }), false);
    assert.equal(T.xrDocInBook({ rootID: "R", rootNum: "bad" }), false);
    assert.equal(T.xrDocInBook({ rootID: "R", rootNum: "1.1.1" }), true);
    assert.equal(T.xrDocInBook({ rootID: "R", rootNum: "2" }), true);
});
t("bookDoc/no-meta-rows-filtered-empty", () => {
    // 真机样本：国家自然科学基金 20261031215351-0g2tzju，17 条题注，docMeta 全 null
    const rows = [row("图 1", null), row("表 1", null), row("式 1", null)];
    assert.equal(T.xrPickerRowsInLevel(rows, "", 1).length, 0, "旧路径：空链键 → 一条都不剩");
    assert.equal(T.xrPickerRowsInLevel(rows, "", 2).length, 0);
});
t("bookDoc/with-meta-still-scope", () => {
    const rows = [row("图 1-1", M(BK, "1.1")), row("别处图", M(PC, "1.2.3.7"))];
    assert.equal(T.xrPickerRowsInLevel(rows, T.xrChainKeyFromMeta(M(BK, "1.1"), 1), 1).length, 1);
});
t("bookDoc/single-doc-plan-keeps-all-captions", () => {
    // 单文档分支走 buildPlan：题注全在、连续编号从 1 起（不带任何章节前缀）
    const blocks = [
        { id: "b1", type: "p", markdown: "图 1 甲", ial: '{: custom-xref="fig" name="图 1"}' },
        { id: "b2", type: "p", markdown: "表 1 乙", ial: '{: custom-xref="tab" name="表 1"}' },
        { id: "b3", type: "m", markdown: "$$ a \\tag{1} $$", ial: '{: custom-xref="eq" name="式 1"}' },
    ];
    const s = Object.assign({}, T.DEFAULTS, { scopeEnabled: true, scopeMode: "bydoc" });
    const r = T.buildPlan(blocks, s);
    assert.deepStrictEqual(r.plan.map((p) => p.name), ["图 1", "表 1", "式 1"]);
});

/* ---------- v1.2.20：编号口径按“文档是否在书里”分流 ---------- */
t("mode/standalone-keeps-chapter", () => {
    const s = { scopeEnabled: true, scopeMode: "bydoc", mode: "chapter", scopePrefixLevel: 2 };
    const d = T.xrPlanSettingsForDoc(s, null);
    assert.equal(d.inBook, false);
    assert.equal(d.scopeRound, false);
    assert.equal(d.planSettings.mode, "chapter");
});
t("mode/book-bydoc-forces-continuous-and-prefix", () => {
    const s = { scopeEnabled: true, scopeMode: "bydoc", mode: "chapter", scopePrefixLevel: 2 };
    const d = T.xrPlanSettingsForDoc(s, { rootNum: "2.4" });
    assert.equal(d.inBook, true);
    assert.equal(d.scopeRound, false);
    assert.equal(d.planSettings.mode, "continuous");
    assert.equal(d.planSettings.__scopePrefix, "4");
});
t("mode/book-bydoc-level-too-deep-no-prefix", () => {
    const s = { scopeEnabled: true, scopeMode: "bydoc", mode: "chapter", scopePrefixLevel: 4 };
    const d = T.xrPlanSettingsForDoc(s, { rootNum: "4.2" });
    assert.equal(d.planSettings.mode, "continuous");
    assert.equal(d.planSettings.__scopeNoPrefix, true);
    assert.equal(d.planSettings.__scopePrefix, undefined);
});
t("mode/real-book-override-keeps-4-1", () => {
    // 真机设置：scopePrefixLevel=3，该书籍 target 覆盖为 2；文档 rootNum 2.4
    const s = {
        scopeEnabled: true, scopeMode: "bydoc", mode: "chapter",
        scopePrefixLevel: 3, scopePrefixLevelByTarget: { "20260924192547-rlifat5": 2 }
    };
    const meta = { rootNum: "2.4", targetId: "20260924192547-rlifat5" };
    const dec = T.xrPlanSettingsForDoc(s, meta);
    assert.equal(dec.planSettings.mode, "continuous");
    assert.equal(dec.planSettings.__scopePrefix, "4");
    const blocks = [
        { id: "h1", type: "h", subtype: "h1", markdown: "# 第4章" },
        { id: "t1", type: "p", markdown: "表 1-1 甲", ial: '{: custom-xref="tab" name="表 1-1"}' },
    ];
    const r = T.buildPlan(blocks, dec.planSettings);
    assert.deepStrictEqual(r.plan.map((p) => p.name), ["表 4-1"]);
});
t("mode/book-continuous-goes-scope-round", () => {
    const s = { scopeEnabled: true, scopeMode: "continuous", mode: "chapter" };
    const d = T.xrPlanSettingsForDoc(s, { rootNum: "4.2" });
    assert.equal(d.scopeRound, true);
    assert.equal(d.planSettings.mode, "continuous");
});
t("mode/scope-off-keeps-chapter", () => {
    const s = { scopeEnabled: false, scopeMode: "bydoc", mode: "chapter" };
    const d = T.xrPlanSettingsForDoc(s, { rootNum: "4.2" });
    assert.equal(d.inBook, false);
    assert.equal(d.planSettings.mode, "chapter");
});
t("mode/book-plan-ignores-chapter", () => {
    const s = { scopeEnabled: true, scopeMode: "bydoc", mode: "chapter", scopePrefixLevel: 1 };
    const dec = T.xrPlanSettingsForDoc(s, { rootNum: "4" });
    const blocks = [
        { id: "h1", type: "h", subtype: "h1", markdown: "# 第一章" },
        { id: "b1", type: "p", markdown: "图 1-1 甲", ial: '{: custom-xref="fig" name="图 1-1"}' },
    ];
    const r = T.buildPlan(blocks, dec.planSettings);
    assert.deepStrictEqual(r.plan.map((p) => p.name), ["图 4-1"]);
});

console.log("\n合计 " + pass + " PASS / " + fail + " FAIL");
process.exit(fail ? 1 : 0);
