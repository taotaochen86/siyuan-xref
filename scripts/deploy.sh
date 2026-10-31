#!/usr/bin/env bash
# 本地开发用：打包后直接解到思源插件目录，省得每次手动复制。
# 用法：npm run deploy   （或 bash scripts/deploy.sh /path/to/siyuan/data/plugins）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
bash scripts/build.sh >/dev/null

DEST="${1:-$HOME/SiYuan/data/plugins/siyuan-xref}"
[ -d "$(dirname "$DEST")" ] || { echo "找不到插件目录：$(dirname "$DEST")" >&2; exit 1; }

mkdir -p "$DEST"
rm -rf "$DEST"/*
unzip -qo package.zip -d "$DEST"
echo "已部署到 $DEST"
ls -1 "$DEST"
echo
echo "记得在 设置 → 集市 → 已下载 里把插件关一下再打开，渲染层才会加载新代码。"
