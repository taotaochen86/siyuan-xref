"use strict";
/* v1.1.0 多文档范围重排：纯函数离线单测。
 * 用法：node test/scope_core.test.js
 * 不连思源、不写任何文件；只 mock siyuan 模块后加载 index.js 的 __test 导出。
 */
const Module = require("module");
const orig = Module._load;
Module._load = function (req) {
    if (req === "siyuan") {
        return {
            Plugin: class {}, Setting: class {},
            showMessage: () => {}, fetchSyncPost: () => Promise.resolve({}),
        };
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
const A = "20260101010101-aaaaaaa";
const B = "20260101010101-bbbbbbb";
const C = "20260101010101-ccccccc";
const OUT = "20260101010101-zzzzzzz";
const blk = (id, md, opt) => Object.assign({ id, type: "p", subtype: "", markdown: md, ial: "" }, opt || {});
const cap = (id, md, kind) => blk(id, md, { ial: 'custom-xref="' + (kind || "fig") + '"' });

// 旧用例按「完整链」口径；v1.1.6 真实默认 scopePrefixLevel=2 由下面新用例覆盖
const S = Object.assign({}, T.DEFAULTS,
    { figLabel: "", tabLabel: "", eqLabel: "", scopePrefixLevel: 0 });

/* ---------- 1. 范围来源解析 ---------- */
t("resolve/docnum", () => {
    const r = T.xrScopeResolve({ scopeSource: "docnum", scopeTargets: [{ id: "X" }], scopeExcluded: [] },
        { targets: [{ type: "doc", id: "A" }], excluded: [{ id: "B", mode: "self" }] });
    assert.equal(r.source, "docnum");
    assert.equal(r.targets[0].id, "A");
    assert.equal(r.excluded.length, 1);
    assert.equal(r.degraded, false);
});
t("resolve/custom", () => {
    const r = T.xrScopeResolve({ scopeSource: "custom", scopeTargets: [{ id: "X" }], scopeExcluded: [] },
        { targets: [{ id: "A" }], excluded: [] });
    assert.equal(r.source, "custom");
    assert.equal(r.targets[0].id, "X");
});
t("resolve/degrade-when-docnum-missing", () => {
    const r = T.xrScopeResolve({ scopeSource: "docnum", scopeTargets: [{ id: "X" }], scopeExcluded: [] }, null);
    assert.equal(r.degraded, true);
    assert.equal(r.source, "custom");
    assert.equal(r.targets[0].id, "X");
});

/* ---------- 2. 文档号前缀 ---------- */
t("docTag/always-seq-no-collision", () => {
    assert.equal(T.xrScopeDocTag({ num: "3" }, 0), "1");
    assert.equal(T.xrScopeDocTag({ num: "1.1" }, 4), "5");
    assert.equal(T.xrScopeDocTag({}, 1), "2");
});
t("docTag/unique-across-docs", () => {
    const pd = [
        { doc: { id: "d1", num: "1" }, blocks: [cap(A, "图 1 甲")] },
        { doc: { id: "d2", num: "1" }, blocks: [cap(B, "图 1 乙")] },
    ];
    const names = T.xrBuildScopePlan(pd, S, "bydoc").plan.map((p) => p.name);
    assert.deepEqual(names, ["图 1-1", "图 2-1"]);
    assert.equal(new Set(names).size, names.length);
});

/* ---------- 3. 全局 anchor ---------- */
t("anchor/global-map", () => {
    const a = T.xrScopeAnchor([{ id: A, name: "图 1" }, { id: B, name: "图 2" }]);
    assert.equal(a[A], "图 1");
    assert.equal(a[B], "图 2");
});

/* ---------- 4. 引用只刷范围内 ---------- */
t("refs/refresh-static-double-quote", () => {
    const anchor = {}; anchor[A] = "图 7";
    const r = T.xrScopeRefs([blk(C, "见 ((" + A + ' "图 1")) 所示', { docId: "d1" })], anchor);
    assert.equal(r.length, 1);
    assert.ok(r[0].next.indexOf("((" + A + ' "图 7"))') >= 0);
    assert.equal(r[0].docId, "d1");
});
t("refs/single-quote-becomes-static", () => {
    const anchor = {}; anchor[A] = "图 7";
    const r = T.xrScopeRefs([blk(C, "见 ((" + A + " '图 1'))", { docId: "d1" })], anchor);
    assert.equal(r.length, 1);
    assert.ok(r[0].next.indexOf("((" + A + ' "图 7"))') >= 0);
});
t("refs/outside-target-untouched", () => {
    const anchor = {}; anchor[A] = "图 7";
    const r = T.xrScopeRefs([blk(C, "见 ((" + OUT + ' "别动"))', { docId: "d1" })], anchor);
    assert.equal(r.length, 0);
});
t("refs/mixed-only-in-scope-changed", () => {
    const anchor = {}; anchor[A] = "图 7";
    const md = "见 ((" + A + ' "图 1")) 和 ((' + OUT + ' "别动"))';
    const r = T.xrScopeRefs([blk(C, md, { docId: "d1" })], anchor);
    assert.equal(r.length, 1);
    assert.ok(r[0].next.indexOf("((" + A + ' "图 7"))') >= 0);
    assert.ok(r[0].next.indexOf("((" + OUT + ' "别动"))') >= 0);
});
t("refs/already-correct-noop", () => {
    const anchor = {}; anchor[A] = "图 7";
    const r = T.xrScopeRefs([blk(C, "见 ((" + A + ' "图 7"))', { docId: "d1" })], anchor);
    assert.equal(r.length, 0);
});

/* ---------- 5. 结构事件按 box 过滤 ---------- */
const CFG = { targets: [{ type: "notebook", id: "box1" }, { type: "doc", id: "doc1", box: "box2" }] };
t("event/hit-notebook", () => assert.equal(T.xrScopeShouldRun(CFG, "create", { box: { id: "box1" } }), true));
t("event/hit-doc-box", () => assert.equal(T.xrScopeShouldRun(CFG, "create", { box: { id: "box2" } }), true));
t("event/miss", () => assert.equal(T.xrScopeShouldRun(CFG, "create", { box: { id: "box9" } }), false));
t("event/not-structural", () => assert.equal(T.xrScopeShouldRun(CFG, "transactions", {}), false));
t("event/unsure-falls-back-full", () => assert.equal(T.xrScopeShouldRun(CFG, "moveDoc", {}), true));
t("event/sort-by-notebook", () => assert.equal(T.xrScopeShouldRun(CFG, "filetreeSortChanged", { notebook: "box1" }), true));
t("event/empty-targets", () => assert.equal(T.xrScopeShouldRun({ targets: [] }, "create", { box: { id: "box1" } }), false));
t("event/doc-without-box-is-unsure", () => assert.equal(
    T.xrScopeShouldRun({ targets: [{ type: "doc", id: "d" }] }, "create", { box: { id: "box9" } }), true));

/* ---------- 6. 范围计划：两档编号口径 ---------- */
const perDoc = [
    { doc: { id: "doc1", num: "1.1" }, blocks: [
        cap(A, "图 1 甲图"), cap(B, "图 2 乙图"),
        blk("20260101010101-h111111", "# 第一节", { type: "h", subtype: "h1" }),
    ] },
    { doc: { id: "doc2", num: "" }, blocks: [
        cap(C, "图 1 丙图"),
        blk("20260101010101-h222222", "# 第二节", { type: "h", subtype: "h1" }),
    ] },
];
t("plan/continuous-across-docs", () => {
    const r = T.xrBuildScopePlan(perDoc, S, "continuous");
    assert.deepEqual(r.plan.map((p) => p.name), ["图 1", "图 2", "图 3"]);
    assert.deepEqual(r.plan.map((p) => p.docId), ["doc1", "doc1", "doc2"]);
    assert.equal(r.allBlocks.length, 5);
});
t("plan/bydoc-prefix", () => {
    const r = T.xrBuildScopePlan(perDoc, S, "bydoc");
    assert.deepEqual(r.plan.map((p) => p.name), ["图 1-1", "图 1-2", "图 2-1"]);
    assert.deepEqual(r.plan.map((p) => p.seq), ["1-1", "1-2", "2-1"]);
});
t("plan/bydoc-ignores-local-doc-num", () => {
    const pd = [{ doc: { id: "docX", num: "5" }, blocks: [cap(A, "图 1 甲")] }];
    assert.equal(T.xrBuildScopePlan(pd, S, "bydoc").plan[0].name, "图 1-1");
});
t("plan/old-prefix-stripped", () => {
    const r = T.xrBuildScopePlan([{ doc: { id: "d" }, blocks: [cap(A, "图 3-1 旧文字")] }], S, "bydoc");
    assert.equal(r.plan[0].newMd, "图 1-1 旧文字");
});
t("plan/heading-stack-resets-per-doc", () => {
    const r = T.xrBuildScopePlan(perDoc, S, "continuous");
    assert.equal(r.sections.length, 2);
    assert.equal(r.sections[0].docId, "doc1");
    assert.equal(r.sections[1].docId, "doc2");
    assert.ok(r.sections[1].path.indexOf("20260101010101-h111111") < 0);
});
t("plan/equation-seq-only", () => {
    const pd = [{ doc: { id: "d" }, blocks: [
        blk(A, "$$ a+b \\tag{9} $$", { type: "m" }),
    ] }];
    const r = T.xrBuildScopePlan(pd, Object.assign({}, S, { eqLabel: "式" }), "continuous");
    assert.equal(r.plan.length, 1);
    assert.equal(r.plan[0].kind, "eq");
    assert.equal(r.plan[0].seq, "1");
    assert.equal(r.plan[0].newMd, null);   // eq 走 updateMathTag，不重建块
});
t("plan/empty-equation-flagged", () => {
    const pd = [{ doc: { id: "d" }, blocks: [blk(A, "$$ $$", { type: "m" })] }];
    assert.equal(T.xrBuildScopePlan(pd, S, "continuous").plan[0].emptyEq, true);
});

/* ---------- 6.5 v1.1.1：元数据属性与多段章节号 ---------- */
const META_IAL = '{: title="【1】氮循环" custom-doc-num-meta="&#123;&quot;rootID&quot;:&quot;R&quot;,&quot;rootNum&quot;:&quot;1.1.1&quot;,&quot;CustomNum&quot;:&quot;1&quot;,&quot;CurrentNum&quot;:1&#125;"}';
t("meta/decode-ial", () => {
    assert.equal(T.xrDecodeIalText("&#123;&quot;rootNum&quot;:&quot;1.1.1&quot;&#125;"),
        '{"rootNum":"1.1.1"}');
});
t("meta/parse-ial", () => {
    assert.deepEqual(T.xrParseMeta(META_IAL),
        { rootID: "R", rootNum: "1.1.1", CustomNum: "1", CurrentNum: 1 });
});
t("meta/parse-missing-or-broken", () => {
    assert.equal(T.xrParseMeta('{: custom-doc-num="1"}'), null);
    assert.equal(T.xrParseMeta('{: custom-doc-num-meta="oops"}'), null);
});
t("docTag/uses-rootNum-when-bydoc", () => {
    assert.equal(T.xrScopeDocTag({ meta: { rootNum: "1.1.1" } }, 5, "bydoc"), "1.1.1");
    assert.equal(T.xrScopeDocTag({ meta: { rootNum: "1.1.1" } }, 5, "continuous"), "6");
    assert.equal(T.xrScopeDocTag({ meta: { rootNum: "bad" } }, 5, "bydoc"), "");
});
t("plan/bydoc-multi-segment-prefix", () => {
    const pd = [{ doc: { id: "d", meta: { rootNum: "1.1.1" } }, blocks: [cap(A, "图 1 甲")] }];
    assert.equal(T.xrBuildScopePlan(pd, S, "bydoc").plan[0].name, "图 1.1.1-1");
});
t("plan/multi-segment-stripped-no-accumulate", () => {
    const pd = [{ doc: { id: "d", meta: { rootNum: "1.1.1" } },
        blocks: [cap(A, "图 1.1.1-2 旧文字")] }];
    const r1 = T.xrBuildScopePlan(pd, S, "bydoc");
    assert.equal(r1.plan[0].newMd, "图 1.1.1-1 旧文字");
    // 用上一轮输出再跑一次，编号必须收敛，不能叠加成「图 1.1.1-1 图 1.1.1-1 旧文字」
    const pd2 = [{ doc: pd[0].doc, blocks: [cap(A, r1.plan[0].newMd)] }];
    assert.equal(T.xrBuildScopePlan(pd2, S, "bydoc").plan[0].newMd, "图 1.1.1-1 旧文字");
});
t("isAutoCaptionName/multi-segment", () => {
    assert.equal(T.isAutoCaptionName("图 1.1.1-1", S), true);
    assert.equal(T.isAutoCaptionName("图 1-1", S), true);
    assert.equal(T.isAutoCaptionName("我自己的图", S), false);
});
t("NUM_HEAD/legacy-forms-still-match", () => {
    ["图 1 xxx", "图 1-1 xxx", "图 1.1 xxx", "表 2 xxx"].forEach((s) => {
        assert.equal(T.NUM_HEAD.test(s), true, s);
    });
});

/* ---------- 6.6 v1.1.2：增量缓存与引用锚 ---------- */
t("refs/anchors-for-dom-patch", () => {
    const anchor = {}; anchor[A] = "图 1.4.1-1";
    const r = T.xrScopeRefs([blk(C, "见 ((" + A + ' "图 1"))')], anchor);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].anchors, { [A]: "图 1.4.1-1" });
});
t("pickNeed/document-level-event-no-rescan", () => {
    const docs = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
    const cache = new Map(docs.map((d) => [d.id, { doc: d, blocks: [] }]));
    const r = T.xrScopePickNeed(docs, cache, new Set());
    assert.equal(r.need.length, 0, "拖动/删除/改名不该重扫文档内部");
    assert.equal(r.reuse.size, 3);
});
t("pickNeed/in-doc-edit-rescans-only-one", () => {
    const docs = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
    const cache = new Map(docs.map((d) => [d.id, { doc: d, blocks: [] }]));
    const r = T.xrScopePickNeed(docs, cache, new Set(["d2"]));
    assert.deepEqual(r.need.map((d) => d.id), ["d2"]);
    assert.equal(r.reuse.size, 2);
});
t("pickNeed/new-doc-rescans-only-new", () => {
    const docs = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
    const cache = new Map([["d1", { blocks: [] }], ["d2", { blocks: [] }]]);
    const r = T.xrScopePickNeed(docs, cache, new Set());
    assert.deepEqual(r.need.map((d) => d.id), ["d3"]);
});
t("pickNeed/no-dirty-means-full", () => {
    const docs = [{ id: "d1" }, { id: "d2" }];
    const cache = new Map(docs.map((d) => [d.id, { blocks: [] }]));
    const r = T.xrScopePickNeed(docs, cache, null);
    assert.equal(r.need.length, 2);
    assert.equal(r.reuse.size, 0);
});
t("plan/tagOk-for-eq", () => {
    const md = "$$ a+b \\tag{1.4.1-1} $$";
    const pd = [{ doc: { id: "d", meta: { rootNum: "1.4.1" } },
        blocks: [blk(A, md, { type: "m", ial: 'custom-xref="eq"' })] }];
    const r = T.xrBuildScopePlan(pd, S, "bydoc");
    assert.equal(r.plan[0].kind, "eq");
    assert.equal(r.plan[0].tagOk, true, "已是目标号，不该再报要改");
    const pd2 = [{ doc: pd[0].doc,
        blocks: [blk(A, "$$ a+b \\tag{9-9} $$", { type: "m", ial: 'custom-xref="eq"' })] }];
    assert.equal(T.xrBuildScopePlan(pd2, S, "bydoc").plan[0].tagOk, false);
});

t("plan/number-only-caption-no-trailing-space", () => {
    const pd = [{ doc: { id: "d" }, blocks: [cap(A, "图 2-1")] }];
    const r1 = T.xrBuildScopePlan(pd, S, "continuous");
    assert.equal(r1.plan[0].newMd, "图 1");
    // 幂等：用上一轮输出再跑一次，编号不叠加、也不再报要改
    const pd2 = [{ doc: pd[0].doc, blocks: [cap(A, r1.plan[0].newMd)] }];
    assert.equal(T.xrBuildScopePlan(pd2, S, "continuous").plan[0].newMd, "图 1");
});

/* ---------- 6.7 v1.1.4：单文档轮也用本文档章节号 ---------- */
t("buildPlan/scope-prefix-for-single-doc", () => {
    const s = Object.assign({}, S, { mode: "chapter", __scopePrefix: "2.1.2.3" });
    const bs = [cap(A, "图 1-1 阿萨德"),
        blk(B, "$$ y=x^2 $$", { type: "m", ial: 'custom-xref="eq"' })];
    const r = T.buildPlan(bs, s);
    assert.equal(r.plan[0].name, "图 2.1.2.3-1");
    assert.equal(r.plan[1].name, "式 2.1.2.3-1");
});
t("buildPlan/without-prefix-keeps-legacy-chapter", () => {
    const s = Object.assign({}, S, { mode: "chapter" });
    assert.equal(T.buildPlan([cap(A, "图 1-1 甲")], s).plan[0].name, "图 1-1");
});

/* ---------- 6.8 v1.1.5：插入面板范围化 ---------- */
t("filterPickerRows/by-docTitle", () => {
    const rows = [
        { name: "图 2.1.1.6-1", oldMd: "图 2.1.1.6-1 甲", kind: "fig", hPath: "", docTitle: "1.6 测试" },
        { name: "图 2.1.2.3-1", oldMd: "图 2.1.2.3-1 乙", kind: "fig", hPath: "", docTitle: "2.3 AAAAA" },
    ];
    assert.equal(T.filterPickerRows(rows, { q: "AAAAA" }).length, 1);
    assert.equal(T.filterPickerRows(rows, { q: "2.1.1.6" }).length, 1);
    assert.equal(T.filterPickerRows(rows, { kind: "fig" }).length, 2);
    assert.equal(T.filterPickerRows([{ name: "图 1", oldMd: "x", kind: "fig" }], { q: "旧文档" }).length, 0);
});

/* ---------- 6.9 v1.1.6：章节前缀层级 ---------- */
t("prefix/level-0-full-chain", () => {
    assert.equal(T.xrScopePrefix("2.1.2.3", 0), "2.1.2.3");
});
t("prefix/level-n", () => {
    assert.equal(T.xrScopePrefix("2.1.2.3", 1), "2");
    assert.equal(T.xrScopePrefix("2.1.2.3", 2), "1");
    assert.equal(T.xrScopePrefix("2.1.2.3", 3), "2");
    assert.equal(T.xrScopePrefix("2.1.2.3", 4), "3");
});
t("prefix/level-beyond-parts-empty", () => {
    assert.equal(T.xrScopePrefix("1.2.3", 4), "");
    assert.equal(T.xrScopePrefix("1.2.3", 5), "");
    assert.equal(T.xrScopePrefix("bad", 2), "");
});
t("plan/bydoc-level2-gives-1-1", () => {
    const s = Object.assign({}, S, { scopePrefixLevel: 2 });
    const pd = [{ doc: { id: "d", meta: { rootNum: "2.1.2.3" } }, blocks: [cap(A, "图 9-9 甲")] }];
    assert.equal(T.xrBuildScopePlan(pd, s, "bydoc").plan[0].name, "图 1-1");
});
t("plan/bydoc-level-beyond-no-prefix", () => {
    const s = Object.assign({}, S, { scopePrefixLevel: 4 });
    const pd = [{ doc: { id: "d", meta: { rootNum: "1.2.3" } }, blocks: [cap(A, "图 9-9 甲")] }];
    const p = T.xrBuildScopePlan(pd, s, "bydoc").plan[0];
    assert.equal(p.name, "图 1");
    assert.equal(p.newMd, "图 1 甲");
});
t("buildPlan/scopeNoPrefix-overrides-chapter", () => {
    const s = Object.assign({}, S, { mode: "chapter", __scopeNoPrefix: true });
    assert.equal(T.buildPlan([cap(A, "图 1-1 甲")], s).plan[0].name, "图 1");
});

/* ---------- 6.10 范围来源解析 ---------- */
t("resolve/docnum-follows-config", () => {
    const s = { scopeSource: "docnum" };
    const a = T.xrScopeResolve(s, { targets: [{ id: "t1" }], excluded: [{ id: "e1" }] });
    const b = T.xrScopeResolve(s, { targets: [{ id: "t2" }], excluded: [] });
    assert.equal(a.source, "docnum");
    assert.deepEqual(a.targets, [{ id: "t1" }]);
    assert.deepEqual(b.targets, [{ id: "t2" }], "编号插件改范围应自动跟随");
    assert.deepEqual(b.excluded, []);
});
t("resolve/custom-and-degraded", () => {
    const s = { scopeSource: "custom", scopeTargets: [{ id: "x" }], scopeExcluded: [] };
    assert.equal(T.xrScopeResolve(s, null).source, "custom");
    assert.equal(T.xrScopeResolve({ scopeSource: "docnum" }, null).degraded, true);
});

/* ---------- 6.11 v1.1.8：窗口按当前第 N 级章节自动收窄 ---------- */
t("levelChain/basic", () => {
    assert.equal(T.xrLevelChain("2.1.2.3", 3), "2.1.2");
    assert.equal(T.xrLevelChain("2.1.2.3", 2), "2.1");
    assert.equal(T.xrLevelChain("2.1.2.3", 4), "2.1.2.3");
    assert.equal(T.xrLevelChain("2.1.2.3", 0), "");
    assert.equal(T.xrLevelChain("1.2.3", 4), "");
    assert.equal(T.xrLevelChain("bad", 3), "");
});
t("docsInChain/only-current-chapter", () => {
    const docs = [
        { id: "a", meta: { rootID: "R", rootNum: "2.1.1.6" } },
        { id: "b", meta: { rootID: "R", rootNum: "2.1.2" } },
        { id: "c", meta: { rootID: "R", rootNum: "2.1.2.3" } },
        { id: "d", meta: { rootID: "R", rootNum: "2.1.2.4" } },
        { id: "e" },
    ];
    assert.deepEqual(T.xrDocsInChain(docs, "R|2.1.2", 3).map((d) => d.id), ["b", "c", "d"]);
    assert.deepEqual(T.xrDocsInChain(docs, "R|2.1.1", 3).map((d) => d.id), ["a"]);
    assert.equal(T.xrDocsInChain(docs, "", 3).length, 5, "key 为空不收窄");
});
t("chainKey/from-meta", () => {
    assert.equal(T.xrChainKeyFromMeta({ rootID: "R", rootNum: "1.2.3.7" }, 3), "R|1.2.3");
    assert.equal(T.xrChainKeyFromMeta({ rootID: "R", rootNum: "1.2.3" }, 0), "");
    assert.equal(T.xrChainKeyFromMeta({ rootID: "R", rootNum: "1.2" }, 3), "");
    assert.equal(T.xrChainKeyFromMeta(null, 3), "");
});
t("docsInChain/same-chain-different-rootID", () => {
    const docs = [
        { id: "x1", meta: { rootID: "RA", rootNum: "1.2.3.7" } },
        { id: "x2", meta: { rootID: "RA", rootNum: "1.2.3.8" } },
        { id: "y1", meta: { rootID: "RB", rootNum: "1.2.3" } },
        { id: "y2", meta: { rootID: "RB", rootNum: "1.2.3.1" } },
    ];
    assert.deepEqual(T.xrDocsInChain(docs, "RA|1.2.3", 3).map((d) => d.id), ["x1", "x2"]);
    assert.deepEqual(T.xrDocsInChain(docs, "RB|1.2.3", 3).map((d) => d.id), ["y1", "y2"]);
});

/* ---------- 6.12 v1.2.0：按编号范围配置覆盖层级 ---------- */
t("levelForDoc/global-default", () => {
    assert.equal(T.xrLevelForDoc({ meta: { targetId: "T1", rootNum: "2.1.2.3" } }, 3, {}), 3);
    assert.equal(T.xrLevelForDoc({ meta: { rootNum: "2.1.2.3" } }, 3, { T1: 2 }), 3, "无 targetId 用全局");
});
t("levelForDoc/per-target-override", () => {
    const ov = { T1: 2, T2: 0 };
    assert.equal(T.xrLevelForDoc({ meta: { targetId: "T1", rootNum: "2.1.2.3" } }, 3, ov), 2);
    assert.equal(T.xrLevelForDoc({ meta: { targetId: "T2", rootNum: "2.1.2.3" } }, 3, ov), 0);
    assert.equal(T.xrLevelForDoc({ meta: { targetId: "T3", rootNum: "2.1.2.3" } }, 3, ov), 3);
    assert.equal(T.xrLevelForDoc({ meta: { targetId: "T1" } }, 3, { T1: -1 }), 3, "非法值回退全局");
});
t("plan/per-target-level", () => {
    const s = Object.assign({}, S, { scopePrefixLevel: 3, scopePrefixLevelByTarget: { T1: 2 } });
    const pd = [
        { doc: { id: "d1", meta: { rootID: "R", targetId: "T1", rootNum: "2.1.2.3" } },
            blocks: [cap(A, "图 9-9 甲")] },
        { doc: { id: "d2", meta: { rootID: "R", targetId: "T2", rootNum: "2.1.2.4" } },
            blocks: [cap(B, "图 9-9 乙")] },
    ];
    assert.deepEqual(T.xrBuildScopePlan(pd, s, "bydoc").plan.map((p) => p.name),
        ["图 1-1", "图 2-1"]);
});
t("docsInChain/per-target-override", () => {
    const docs = [
        { id: "a", meta: { rootID: "R", targetId: "T1", rootNum: "2.1.2.3" } },
        { id: "b", meta: { rootID: "R", targetId: "T2", rootNum: "2.1.2.4" } },
    ];
    assert.deepEqual(T.xrDocsInChain(docs, "R|2.1", 3, { T1: 2 }).map((d) => d.id), ["a"]);
    assert.deepEqual(T.xrDocsInChain(docs, "R|2.1.2", 3, { T1: 2 }).map((d) => d.id), ["b"]);
});

/* ---------- 6.13 v1.2.5：窗口收窄层级 = n-1 ---------- */
t("pickerLevel/n-minus-1", () => {
    assert.equal(T.xrPickerLevel(3), 2);
    assert.equal(T.xrPickerLevel(2), 1);
    assert.equal(T.xrPickerLevel(1), 1);
    assert.equal(T.xrPickerLevel(0), 0);
    assert.equal(T.xrPickerLevel(undefined), 0);
});
t("pickerOverrides/n-minus-1", () => {
    assert.deepEqual(T.xrPickerOverrides({ A: 3, B: 1, C: 0 }), { A: 2, B: 1, C: 0 });
    assert.deepEqual(T.xrPickerOverrides({}), {});
});
t("pickerLevel/cross-chapter-in-same-parent", () => {
    const lvl = T.xrPickerLevel(3);
    const k = (rn) => T.xrChainKeyFromMeta({ rootID: "R", rootNum: rn }, lvl);
    assert.equal(k("1.2.4.1"), k("1.2.3.7"), "第4章 4.1 与第3章 3.7 同属父链 1.2");
    assert.notEqual(k("1.2.4.1"), k("1.1.3.7"));
});

/* ---------- 7. 并发工具（异步，见 main） ---------- */
async function main() {
    const items = [0, 1, 2, 3, 4, 5];
    const out = await T.xrMapLimit(items, 3, async (x) => {
        await new Promise((r) => setTimeout(r, (6 - x) * 3));
        return x * 2;
    });
    try { assert.deepEqual(out, [0, 2, 4, 6, 8, 10]); pass++; console.log("PASS mapLimit/order-stable-async"); }
    catch (e) { fail++; console.log("FAIL mapLimit/order-stable-async :: " + e.message); }
    console.log("\n合计 " + pass + " PASS / " + fail + " FAIL");
    process.exit(fail ? 1 : 0);
}
main();
