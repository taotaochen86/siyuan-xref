"use strict";
/* v1.2.21 块右键菜单离线单测。
 * 用法：node test/block_menu.test.js
 * 只测纯函数 / DOM 规整，不连思源、不写库。
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
const path = require("path");
const T = require(path.join(__dirname, "..", "index.js")).__test;

let pass = 0, fail = 0;
function t(name, fn) {
    try { fn(); pass++; console.log("PASS " + name); }
    catch (e) { fail++; console.log("FAIL " + name + " :: " + (e && e.message)); }
}

/** 极简 DOM：只实现 domBlockMeta / blockPlainText 用到的几个方法 */
function fakeEl(id, dt, text, hasImg) {
    const clone = {
        textContent: text,
        querySelectorAll: () => (hasImg ? [{ remove() {} }] : []),
    };
    return {
        tagName: "DIV",
        dataset: {},
        textContent: text,
        classList: { contains: () => false },
        getAttribute(k) {
            if (k === "data-node-id") return id;
            if (k === "data-type") return dt;
            return null;
        },
        querySelector(sel) {
            return hasImg && String(sel).indexOf('data-type="img') >= 0 ? {} : null;
        },
        querySelectorAll: () => [],
        closest: () => null,
        cloneNode: () => clone,
    };
}

// 1. 普通段落：仍是 para，两个题注项
t("menu/plain-paragraph-para", () => {
    const r = T.captionMenu([{ id: "p1", type: "p", img: false }]);
    assert.equal(r.ok, true);
    assert.equal(r.mode, "para");
    assert.equal(r.items.length, 2);
});

// 2. 标题：只给引用，不给题注
t("menu/heading-ref-only", () => {
    const r = T.captionMenu([{ id: "h1", type: "h" }]);
    assert.equal(r.ok, false);
    assert.equal(r.mode, "ref");
    assert.equal(r.reason, "type:h");
    assert.equal(r.items.length, 0);
});

// 3. 列表项：只给引用
t("menu/list-item-ref-only", () => {
    const r = T.captionMenu([{ id: "i1", type: "i" }]);
    assert.equal(r.ok, false);
    assert.equal(r.mode, "ref");
    assert.equal(r.reason, "type:i");
});

// 4. 文字夹图（v1.2.21 核心）：只给引用，不再整段当图片
t("menu/mixed-img-paragraph-ref-only", () => {
    const r = T.captionMenu([{ id: "p2", type: "p", img: false, mixedImg: true }]);
    assert.equal(r.ok, false);
    assert.equal(r.mode, "ref");
    assert.equal(r.reason, "mixedimg");
});

// 5. 纯图片段落：仍走题注，不误判成文字
t("menu/pure-image-caption", () => {
    const r = T.captionMenu([{ id: "img1", type: "p", img: true }]);
    assert.equal(r.ok, true);
    assert.equal(r.mode, "media");
    assert.equal(r.items[0].key, "add");
});

// 6. 表格单元格：仍只给引用
t("menu/table-cell-ref-only", () => {
    const r = T.captionMenu([{ id: "cell1", type: "p", img: false, tbl: true }]);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "table");
});

// 7. 公式块：仍拦住
t("menu/math-blocked", () => {
    const r = T.captionMenu([{ id: "m1", type: "m" }]);
    assert.equal(r.ok, false);
    assert.equal(r.mode, "none");
    assert.equal(r.reason, "type:m");
});

// 8. domBlockMeta：文字 + 空图 = mixedImg，img 必须为 false
t("meta/text-plus-empty-img-mixed", () => {
    const m = T.domBlockMeta(fakeEl("20261126162932-wmq1jd5", "NodeParagraph", "撒的发生", true));
    assert.equal(m.type, "p");
    assert.equal(m.img, false);
    assert.equal(m.mixedImg, true);
});

// 9. domBlockMeta：只有图（正文只有零宽字符）= 图片块
t("meta/image-only", () => {
    const m = T.domBlockMeta(fakeEl("img2", "NodeParagraph", "\u200b", true));
    assert.equal(m.type, "p");
    assert.equal(m.img, true);
    assert.equal(m.mixedImg, undefined);
});

// 10. domBlockMeta：普通段落不受影响
t("meta/plain-paragraph", () => {
    const m = T.domBlockMeta(fakeEl("p3", "NodeParagraph", "普通文字", false));
    assert.equal(m.type, "p");
    assert.equal(m.img, false);
    assert.equal(m.mixedImg, undefined);
});

// 11. domBlockMeta：标题映射成 h
t("meta/heading", () => {
    const m = T.domBlockMeta(fakeEl("h2", "NodeHeading", "第一章", false));
    assert.equal(m.type, "h");
    assert.equal(m.img, false);
});

console.log("\n" + pass + " PASS, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
