#!/usr/bin/env bash
# 发版前体检：把「上次踩过的坑」变成硬性拦截。
# 用法：bash scripts/preflight.sh
# 通过后会重新生成 package.zip，可直接接 scripts/release.sh。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
sec()  { printf '\n\033[1m【%s】\033[0m\n' "$1"; }

# ──────────────────────────────────────────── 1. 清单字段
sec "1. plugin.json 字段与占位符"
if ! node - <<'NODE'
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("plugin.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
let fail = 0;
const ok = (m) => console.log("  \x1b[32m✓\x1b[0m " + m);
const bad = (m) => { fail++; console.log("  \x1b[31m✗\x1b[0m " + m); };

// 1.1 必需字段
let miss = 0;
for (const k of ["name", "author", "url", "version", "minAppVersion", "icon", "readme", "displayName", "description"]) {
    if (!p[k] || (typeof p[k] === "string" && !p[k].trim())) { bad("缺字段: " + k); miss++; }
}
if (!(p.displayName || {}).default) { bad("displayName.default 缺失（集市必填）"); miss++; }
if (!(p.description || {}).default) { bad("description.default 缺失（集市必填）"); miss++; }
if (!miss) ok("必需字段齐全");

// 1.2 占位符 —— 上次就是 OWNER 没替换，详情页两个链接全 404
const raw = fs.readFileSync("plugin.json", "utf8");
const holes = ["OWNER", "YOUR_", "your-name", "TODO", "FIXME", "example.com", "<username>", "xxxx"];
const hit = holes.filter((h) => raw.includes(h));
if (hit.length) bad("仍有占位符: " + hit.join(", "));
else ok("无占位符残留");

// 1.3 url 必须等于真实仓库地址（集市详情页「包名」「作者」链接都只从 url 推导）
const repo = String((pkg.repository && (pkg.repository.url || pkg.repository)) || "")
    .replace(/^.*github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
const expect = "https://github.com/" + repo;
if (p.url !== expect) bad("url 与仓库不一致\n      当前: " + p.url + "\n      应为: " + expect);
else ok("url 与仓库一致 → " + p.url);
console.log("  \x1b[36m→\x1b[0m 集市详情页将生成的链接：");
console.log("       包名  " + p.url);
console.log("       作者  https://github.com/" + repo.split("/")[0]);

// 1.4 版本号两处必须一致
if (p.version !== pkg.version) bad("版本不一致: plugin.json=" + p.version + " / package.json=" + pkg.version);
else ok("版本号一致 → " + p.version);

// 1.5 语言键必须 BCP 47（zh-CN，不是 zh_CN）
const badKeys = [];
for (const field of ["displayName", "description", "readme"]) {
    for (const k of Object.keys(p[field] || {})) {
        if (k === "default") continue;
        if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(k)) badKeys.push(field + "." + k);
    }
}
if (badKeys.length) bad("语言键不是 BCP 47: " + badKeys.join(", "));
else ok("语言键符合 BCP 47");

// 1.6 清单里点名的文件必须真实存在
let refMiss = 0;
const refs = new Set([p.icon]);
Object.values(p.readme || {}).forEach((v) => refs.add(v));
for (const f of refs) if (!f || !fs.existsSync(f)) { bad("引用的文件不存在: " + f); refMiss++; }
if (!refMiss) ok("icon / readme 引用文件均存在");

if ((p.readme || {}).default !== "README_en.md") {
    console.log("  \x1b[33m!\x1b[0m readme.default 不是 README_en.md（集市建议默认英文）");
}
process.exit(fail ? 1 : 0);
NODE
then fail=$((fail + 1)); fi

# ──────────────────────────────────────────── 2. 文件
sec "2. 集市所需文件"
for f in index.js index.css plugin.json icon.png README.md README_en.md LICENSE package.json; do
    if [ -s "$f" ]; then ok "$f"; else bad "缺文件或为空: $f"; fi
done
if node --check index.js 2>/dev/null; then ok "index.js 语法通过"; else bad "index.js 语法错误"; fi

# ──────────────────────────────────────────── 3. 打包校验
sec "3. 打包并校验 package.zip"
if bash scripts/build.sh >/dev/null 2>&1; then ok "build.sh 执行成功"; else bad "build.sh 失败"; fi

if ! node - <<'NODE'
const fs = require("fs");
const { execSync } = require("child_process");
let fail = 0;
const ok = (m) => console.log("  \x1b[32m✓\x1b[0m " + m);
const bad = (m) => { fail++; console.log("  \x1b[31m✗\x1b[0m " + m); };

if (!fs.existsSync("package.zip")) { bad("package.zip 未生成"); process.exit(1); }
const list = execSync("unzip -Z1 package.zip", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const stray = list.filter((n) => n.includes("/") && !n.startsWith("assets/"));
if (stray.length) bad("zip 内文件套了目录（必须全在根层）: " + stray.join(", "));
else ok("zip 内主文件全在根层，assets/ 为配图目录（共 " + list.length + " 个）");

if (!list.includes("plugin.json")) { bad("zip 内没有 plugin.json"); process.exit(1); }

const p = JSON.parse(fs.readFileSync("plugin.json", "utf8"));
const z = JSON.parse(execSync("unzip -p package.zip plugin.json", { encoding: "utf8" }));
if (z.version !== p.version) bad("zip 内版本 " + z.version + " ≠ 工作区 " + p.version);
else ok("zip 内版本一致 → " + z.version);
if (z.url !== p.url) bad("zip 内 url 与工作区不一致: " + z.url);
else ok("zip 内 url 一致 → " + z.url);
if (/OWNER|YOUR_|TODO|example\.com/.test(JSON.stringify(z))) bad("zip 内清单仍有占位符");
else ok("zip 内清单无占位符");

// 集市会把 README 当正文渲染。这里只认「URL 形态」的占位符：
// 正常文档里为提醒开发者而写的 `OWNER` 字样不算错。
let readmeBad = 0;
for (const f of ["README.md", "README_en.md"]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8")
        .match(/github\.com\/(OWNER|YOUR_[A-Z_]+|your-name)|YOUR_GITHUB[A-Z_]*|<OWNER>/g);
    if (m) { bad(f + " 里有 URL 占位符: " + [...new Set(m)].join(", ")); readmeBad++; }
}
if (!readmeBad) ok("README 无 URL 占位符");
process.exit(fail ? 1 : 0);
NODE
then fail=$((fail + 1)); fi

# ──────────────────────────────────────────── 4. git
sec "4. git 状态"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    warn "工作区有未提交改动：Release 基于已推送的 main，未提交内容不会进包"
    git status --short | sed 's/^/     /'
else
    ok "工作区干净"
fi
if [ -n "$(git remote -v 2>/dev/null)" ]; then ok "已配置远端"; else warn "未配置 git 远端"; fi

# ──────────────────────────────────────────── 汇总
echo
if [ "$fail" -gt 0 ]; then
    printf '\033[31m体检未通过：%d 项问题，修完再发版。\033[0m\n' "$fail"
    exit 1
fi
printf '\033[32m体检通过，可以发版：\033[0m GH_TOKEN=ghp_xxx bash scripts/release.sh\n'
