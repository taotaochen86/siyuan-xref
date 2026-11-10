"use strict";
/**
 * siyuan-xref —— 思源笔记 图/表/公式 自动编号 + 交叉引用
 * 手写 CommonJS 插件，无需构建。依赖 siyuan 3.7+ 的 protyleSlash / addCommand / fetchSyncPost。
 */
const { Plugin, Setting, showMessage, fetchSyncPost } = require("siyuan");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ==================== 界面语言（10 种，跟随思源） ====================
 * 思源把界面语言放在 window.siyuan.config.lang，可选值见 conf/appearance/langs/（22 种）。
 * 插件不另设开关（用户 2026-11-01 定：只跟随思源）。内置 10 种：
 *   zh-CN→zh  zh-TW→zhTW  en→en  ja→ja  ko→ko  de→de  fr→fr  es→es  ru→ru  pt-BR→ptBR
 * 其余 12 种（ar he hi id it nl pl sk sr th tr uk）一律退英文 —— 英文覆盖最广，
 * 看英文也比看中文有用。新增语种只要往 UI_TEXT 加一块、往 LANG_MAP 加一行即可，
 * 缺 key 时自动回退（中文系退 zh，其余退 en），不会再漏文案。
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
        "cmd.scope": "重排范围内全部文档",
        "slash.scope.text": "重排范围编号", "slash.scope.meta": "多文档交叉引用",

        // 多文档范围重排（v1.1.0）
        "set.scope.levelByTarget": "按范围配置覆盖层级（JSON）",
        "set.scope.levelByTarget.desc": "给不同范围单独指定层级。留空则沿用上面的设置。",
        "set.scope.level": "章节前缀层级",
        "set.scope.level.desc": "编号带几层章节号。全带 2.1.2-1；只带第 1 层 1-1。",
        "set.scope.level.all": "全部（完整链）",
        "set.scope.level.n": "第 {0} 级",
        "set.scope.on": "启用范围重排", "set.scope.on.desc": "关闭后只处理当前文档，不跨文档编号。",
        "set.scope.source": "范围来源", "set.scope.source.desc": "选来源：跟「树文联动编号」插件，或自己指定范围。插件：https://github.com/taotaochen86/tree-doc-numbering",
        "set.scope.source.docnum": "跟随树文联动编号", "set.scope.source.custom": "本插件自定义范围",
        "set.scope.mode": "范围编号口径", "set.scope.mode.desc": "全书连续：整本书从图 1 排到图 N；按文档前缀：每篇单独起号，如「图 1-1」。",
        "set.scope.mode.continuous": "全书连续", "set.scope.mode.bydoc": "按文档前缀",
        "set.scope.events": "结构事件自动重排", "set.scope.events.desc": "文档增删改名或调顺序后，自动重排一次（停手 3 秒）。",
        "set.scope.pickerAuto": "交叉引用窗口默认按上一级范围",
        "set.scope.pickerAuto.desc": "打开引用窗口时默认列出上一级范围的图表公式，方便跨章引用；窗口顶部可随时改。",
        "set.scope.custom": "自定义范围（JSON）", "set.scope.custom.desc": "格式 {\"targets\":[{\"type\":\"doc\",\"id\":\"...\"}],\"excluded\":[]}；可点「从树文联动编号导入」自动填。",
        "set.scope.import": "从树文联动编号导入",
        "set.scope.import.ok": "已导入 {0} 个范围、{1} 条排除",
        "set.scope.import.fail": "没找到树文联动编号插件，或它还没加载",
        "msg.scope.none": "范围为空：请先在设置里选范围来源或导入范围",
        "msg.scope.dry": "范围预检：{0} 篇文档 / 将改 {1} 处题注、{2} 处引用（未写入）",
        "msg.scope.done": "范围重排完成：{0} 篇文档 / 改 {1} 处题注、{2} 处引用",
        "msg.scope.busy": "范围重排正在进行，请稍后再试",
        "msg.scope.readfail": "范围采集失败，整批未写入：{0}",
        "msg.scope.limit": "范围含 {0} 篇文档，超过安全上限，已中止",
        "msg.scope.nodn": "树文联动编号插件未加载，已退回自定义范围",

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

        // 设置面板：分组标题（装饰用，拿不到容器就不显示）
        "picker.allScope": "全部范围（跨章节）",
        "picker.allInLevel": "当前范围（全部章节）",
        "picker.levelN": "第 {0} 级范围",
        "picker.level0": "第 0 级 · 跨所有笔记本",
        "picker.levelTip": "交叉引用范围层级：级数越小范围越大。第 3 级只本章，第 2 级可引用同篇其它章节，第 1 级可跨篇，第 0 级跨所有笔记本。类型按钮、层级、章节三项会记住上次选择；搜索框每次打开清空。",
        "set.grp.scope": "范围设置", "set.grp.items": "{0} 项",
        "set.grp.single": "单页模式（通用设置）",
        "set.grp.book": "书籍多页模式（范围设置）",
        "set.grp.num": "编号",
        "set.grp.trigger": "触发与引用",
        "set.grp.look": "题注外观",
        "set.grp.keys": "快捷键",
        "set.grp.adv": "高级",

        // 设置面板：描述一律压到一到两行 —— 右侧被控件占着，长句会被压出遮挡
        "set.mode.title": "编号模式",
        "set.mode.desc": "全文连续（图 1、图 2）或按标题分章（图 1-1、图 2-1）",
        "set.mode.continuous": "全文连续", "set.mode.chapter": "按章编号",
        "set.labels.title": "图 / 表 / 式 标签",
        "set.labels.desc": "题注前缀文字，可填 Figure / Table / Eq",
        "set.refs.title": "重排时同步刷新引用",
        "set.refs.desc": "重排时正文里的「图 2」等引用文字一起更新；关闭后只改编号。",
        "set.auto.title": "自动重排",
        "set.auto.desc": "停手 1.5 秒后自动重排；刚编辑过的块会等一下再改。",
        "set.dead.title": "失效引用怎么处理",
        "set.dead.desc": "指向已删块的引用怎么处理。默认不动手，按 Ctrl+Alt+Z 重建块后自动接回",
        "set.dead.off": "不处理，保持原样（推荐）",
        "set.dead.mark": "仅标红，保留引用",
        "set.dead.text": "转成红色删除线文本（不可逆）",
        "set.center.title": "题注居中",
        "set.center.desc": "把「图 N …」「表 N …」题注段落设为居中",
        "set.bg.title": "题注底色",
        "set.bg.desc": "给题注加一层淡底色，暗色主题下也看得清；自己设过的不改",
        "set.bg.none": "无底色", "set.bg.faint": "极浅", "set.bg.light": "浅（默认）", "set.bg.blue": "浅蓝",
        "set.keys.title": "自定义快捷键",
        "set.keys.desc": "点输入框后直接按组合键（须带 Ctrl / Alt / ⌘）；Backspace 清空",
        "set.keys.insert": "插入交叉引用", "set.keys.renumber": "重排编号",
        "set.keys.undo": "撤销上次重排", "set.keys.redo": "重做",
        "set.keys.unset": "未设置", "set.keys.press": "请按组合键…", "set.keys.tip": "点击后按下组合键",
        "set.undo.title": "撤销步数",
        "set.undo.desc": "插件自带的撤销栈保留几轮（1~50）；思源 Ctrl+Z 撤不到插件写入",
        "set.restore.title": "还原失效引用",
        "set.restore.desc": "把转成普通文字的引用改回可点击引用；目标已删的跳过。",
        "set.restore.btn": "还原当前文档", "set.restore.busy": "还原中…",
        "set.debug.title": "诊断日志（排查用）",
        "set.debug.desc": "只在排查问题时开，长期开会拖慢思源",

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
        "picker.title": "插入交叉引用", "picker.scope": "范围",
        "picker.ph": "搜索编号或题注，↑↓ 选择，回车插入，Esc 关闭",
        "picker.empty": "没有匹配项",
        "picker.autoWiden": "当前范围没有题注，已自动放宽到{0}",
        "picker.widenNone": "当前范围没有题注，可手动切到「第 0 级 · 跨所有笔记本」",
        "picker.emptyScopeOff": "本文档没有题注，可在设置里开启范围模式引用其它文档",
        "picker.typeEmptyHint": "点「全部」可看到被类型筛选挡住的 {0} 条题注",
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
        "cmd.scope": "Renumber all docs in scope",
        "slash.scope.text": "Renumber scope", "slash.scope.meta": "multi-document xref",

        "set.scope.levelByTarget": "Per-scope level overrides (JSON)",
        "set.scope.levelByTarget.desc": "Key = doc-numbering target id (targets[].id, stored as custom-doc-num-meta.targetId); value = which level to use (0 = full chain). Targets not listed use the global level above. e.g. {\"20230217164836-id29ja1\": 2}.",
        "set.scope.level": "Chapter prefix level",
        "set.scope.level.desc": "Which level of rootNum to use as the by-document prefix: All = full chain (2.1.2.3); level 2 = take 1 -> Figure 1-1. If the level does not exist (1.2.3 at level 4), no level prefix is shown.",
        "set.scope.level.all": "All (full chain)",
        "set.scope.level.n": "Level {0}",
        "set.scope.on": "Enable scope renumbering", "set.scope.on.desc": "Off = behaviour identical to 1.0.11 (current document only).",
        "set.scope.source": "Scope source", "set.scope.source.desc": "Follow the doc-numbering plugin's targets/excluded, or use this plugin's own list.",
        "set.scope.source.docnum": "Follow doc-numbering plugin", "set.scope.source.custom": "Custom scope in this plugin",
        "set.scope.mode": "Scope numbering", "set.scope.mode.desc": "Continuous: Figure 1..N across all docs; By document: Figure <selected level of rootNum>-<n>, where rootNum comes from the document custom-doc-num-meta attribute. Pick the level below; falls back to the document-tree index when absent.",
        "set.scope.mode.continuous": "Continuous", "set.scope.mode.bydoc": "By document prefix",
        "set.scope.events": "Auto renumber on structural events", "set.scope.events.desc": "Filter create/move/rename/sort by box; fall back to full scope when unsure. 3s debounce, serialised.",
        "set.scope.pickerAuto": "Default picker scope to parent level",
        "set.scope.pickerAuto.desc": "On: picker defaults to one level above the chapter prefix level (prefix level 3 -> scope level 2, so captions in sibling chapters are available). Off: defaults to the current level (this chapter only). Level dropdown: 3 = this chapter, 2 = sibling chapters, 1 = across parts, 0 = across all notebooks. Levels 1+ are locked to the same top root and the same first N segments of the numbering chain; level 0 is the only cross-notebook option and must be picked explicitly. Type chips, level and chapter selections are remembered; the search box is cleared on every open. Affects the picker list only, not scope renumbering.",
        "set.scope.custom": "Custom scope (JSON)", "set.scope.custom.desc": "{\"targets\":[{\"type\":\"doc\",\"id\":\"...\"}],\"excluded\":[]}; or import from the doc-numbering plugin.",
        "set.scope.import": "Import from doc-numbering plugin",
        "set.scope.import.ok": "Imported {0} targets, {1} exclusions",
        "set.scope.import.fail": "Doc-numbering plugin not loaded",
        "msg.scope.none": "Empty scope: choose a source or import one in settings",
        "msg.scope.dry": "Scope dry-run: {0} docs / {1} captions, {2} references would change (nothing written)",
        "msg.scope.done": "Scope renumbered: {0} docs / {1} captions, {2} references",
        "msg.scope.busy": "Scope renumbering is already running",
        "msg.scope.readfail": "Scope collection failed, nothing was written: {0}",
        "msg.scope.limit": "Scope has {0} docs, over the safety limit, aborted",
        "msg.scope.nodn": "Doc-numbering plugin not loaded, falling back to custom scope",

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

        "picker.allScope": "All scope (cross-chapter)",
        "picker.allInLevel": "Current scope (all chapters)",
        "picker.levelN": "Level {0} scope",
        "picker.level0": "Level 0 · all notebooks",
        "picker.levelTip": "Cross-reference scope level: smaller = wider. Level 3 = this chapter, level 2 = sibling chapters in the same part, level 1 = across parts, level 0 = across all notebooks. Type chips, level and chapter selections are remembered; the search box is cleared on every open.",
        "set.grp.scope": "Scope", "set.grp.items": "{0} items",
        "set.grp.single": "Single Page (general)",
        "set.grp.book": "Book / Multi-page (scope)",
        "set.grp.num": "Numbering",
        "set.grp.trigger": "Trigger & references",
        "set.grp.look": "Caption look",
        "set.grp.keys": "Hotkeys",
        "set.grp.adv": "Advanced",

        "set.mode.title": "Numbering mode",
        "set.mode.desc": "Continuous through the document (Figure 1, 2) or restart at every heading (Figure 1-1)",
        "set.mode.continuous": "Continuous", "set.mode.chapter": "Per chapter",
        "set.labels.title": "Figure / table / equation labels",
        "set.labels.desc": "Text written in front of each number, e.g. Figure / Table / Eq",
        "set.refs.title": "Refresh references when renumbering",
        "set.refs.desc": "Also rewrites ((block id \"old anchor\")); off = change numbers only",
        "set.auto.title": "Auto renumber",
        "set.auto.desc": "Renumbers 1.5 s after you stop typing; never writes into the block holding the caret",
        "set.dead.title": "Broken references",
        "set.dead.desc": "References to deleted blocks. Default is to leave them alone — Ctrl+Alt+Z rebuilds the block and reconnects them",
        "set.dead.off": "Leave alone (recommended)",
        "set.dead.mark": "Mark red, keep the reference",
        "set.dead.text": "Convert to red strikethrough text (irreversible)",
        "set.center.title": "Centre captions",
        "set.center.desc": "Centres every figure / table caption paragraph while renumbering",
        "set.bg.title": "Caption tint",
        "set.bg.desc": "A light tint behind caption paragraphs; captions you tinted yourself are left alone",
        "set.bg.none": "None", "set.bg.faint": "Very faint", "set.bg.light": "Light (default)", "set.bg.blue": "Pale blue",
        "set.keys.title": "Custom hotkeys",
        "set.keys.desc": "Click a field and press the combination (Ctrl / Alt / ⌘ required); Backspace clears it",
        "set.keys.insert": "Insert reference", "set.keys.renumber": "Renumber",
        "set.keys.undo": "Undo renumber", "set.keys.redo": "Redo",
        "set.keys.unset": "not set", "set.keys.press": "press keys…", "set.keys.tip": "Click, then press the keys",
        "set.undo.title": "Undo depth",
        "set.undo.desc": "How many renumber runs stay undoable (1-50); SiYuan Ctrl+Z cannot undo API writes",
        "set.restore.title": "Restore broken references",
        "set.restore.desc": "Turns references burned into plain text back into ((block id \"anchor\")); missing targets are skipped",
        "set.restore.btn": "Restore this document", "set.restore.busy": "Restoring…",
        "set.debug.title": "Diagnostic log (troubleshooting)",
        "set.debug.desc": "Only while troubleshooting — it slows SiYuan down",

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

        "picker.title": "Insert cross-reference", "picker.scope": "Scope",
        "picker.ph": "Search by number or caption · ↑↓ to choose · Enter to insert · Esc to close",
        "picker.empty": "No matches",
        "picker.autoWiden": "No captions at this level — auto-widened to {0}",
        "picker.widenNone": "No captions in this scope — switch to Level 0 (all notebooks) manually",
        "picker.emptyScopeOff": "No captions in this document — enable scope mode in settings to reference other documents",
        "picker.typeEmptyHint": "Click All to reveal {0} caption(s) hidden by the type filter",
        "picker.all": "All",
        "picker.allSec": "All sections",
        "picker.secTip": "Show only the figures / tables / equations under one heading (sub-headings included)",
        "picker.secNone": "(no heading)",
        "picker.noAnchor": "siyuan-xref: cannot locate this paragraph, nothing was inserted. Put the caret in the target paragraph and retry",
        "picker.noSlash": "siyuan-xref: cannot locate where /xref was typed, insertion cancelled. Put the caret in the target paragraph and retry",
    },
    zhTW: {
        // 繁體中文（思源 zh-TW）
        "label.fig": "圖", "label.tab": "表",
        "label.eq": "式", "dead.text": "失效引用",
        "slash.xref.text": "交叉引用", "slash.xref.meta": "圖 / 表 / 式",
        "slash.num.text": "重排圖表編號", "slash.num.meta": "同步更新引用",
        "cmd.insert": "插入交叉引用", "cmd.renumber": "重排圖表編號",
        "cmd.undo": "復原上次重排", "cmd.redo": "重做重排",
        "menu.setFig": "設為圖題註", "menu.setTab": "設為表題註",
        "menu.clear": "取消圖表題註", "menu.add": "在{0}新增{1}題註",
        "menu.useNext": "把{0}段落設為{1}題註", "menu.ref": "插入交叉引用…",
        "menu.where.below": "下方", "menu.where.above": "上方",
        "menu.word.fig": "圖", "menu.word.tab": "表",
        "noun.image": "圖片", "noun.table": "表格",
        "hint.table": "圖表題註：表格儲存格內不支援，請右鍵表格本身或表格上方的題註段落", "hint.mixed": "圖表題註：請選取同類區塊（段落，或單張圖／單一表格）",
        "hint.math": "圖表題註：公式區塊會自動編號，不用設題註", "hint.default": "圖表題註：請右鍵圖片／表格本身，或圖下方（表上方）的題註段落",
        "set.grp.single": "單頁模式（通用設定）",
        "set.grp.book": "書籍多頁模式（範圍設定）",
        "set.grp.num": "編號",
        "set.grp.trigger": "觸發與引用",
        "set.grp.look": "題註外觀",
        "set.grp.keys": "快速鍵",
        "set.grp.adv": "進階",
        "set.mode.title": "編號模式", "set.mode.desc": "全文連續（圖 1、圖 2）或依一級標題分章（圖 1-1、圖 2-1）",
        "set.mode.continuous": "全文連續", "set.mode.chapter": "依章編號",
        "set.labels.title": "圖／表／式 標籤", "set.labels.desc": "題註前置文字，例如填 Figure / Table / Eq",
        "set.refs.title": "重排時同步更新引用", "set.refs.desc": "把 ((區塊ID \"舊錨文字\")) 全部改成新編號。關閉後只改編號不動引用",
        "set.auto.title": "自動重排", "set.auto.desc": "寫完題註停手 1.5 秒後自動重排編號並更新引用。不會寫入游標所在的區塊，避免打斷輸入",
        "set.dead.title": "失效引用如何處理", "set.dead.desc": "指向已刪區塊、或指向「已取消題註」的區塊的引用。預設「不處理」：引用原樣留著，刪區塊後按 Ctrl+Alt+Z 能把區塊重建回來、引用自動接回；「僅標紅」會在正文裡塗紅加刪除線（看起來像內容被改壞）；「轉成文字」會讓引用徹底失效、無法還原，還會等 10 秒才動作",
        "set.dead.off": "不處理，保持原樣（建議）", "set.dead.mark": "僅標紅，保留引用",
        "set.dead.text": "轉成紅色刪除線文字（不可逆）", "set.center.title": "題註置中",
        "set.center.desc": "重排時把「圖 N …」「表 N …」題註段落設為置中", "set.bg.title": "題註底色",
        "set.bg.desc": "給「圖 N …」「表 N …」題註加一層很淡的底色，暗色主題下也看得清；自己設過底色的不會被改", "set.bg.none": "無底色",
        "set.bg.faint": "極淺", "set.bg.light": "淺（預設）",
        "set.bg.blue": "淺藍", "set.keys.title": "自訂快速鍵",
        "set.keys.desc": "點一下輸入框，再按下想用的組合鍵（必須帶 Ctrl / Alt / ⌘）。Backspace 清空，Esc 取消。同時也會出現在「設定 → 快速鍵 → 外掛」裡，兩處改都行", "set.keys.insert": "插入交叉引用",
        "set.keys.renumber": "重排編號", "set.keys.undo": "復原上次重排",
        "set.keys.redo": "重做", "set.keys.unset": "未設定",
        "set.keys.press": "請按組合鍵…", "set.keys.tip": "點擊後按下組合鍵",
        "set.undo.title": "復原步數", "set.undo.desc": "外掛自己記多少輪重排可以復原（1~50）。思源的 Ctrl+Z 復原不到外掛寫入，所以單獨記一份",
        "set.restore.title": "還原失效引用", "set.restore.desc": "把以前被「轉成文字」燒掉的引用改回 ((區塊ID \"錨\"))。目標區塊已刪除的會自動跳過",
        "set.restore.btn": "還原目前文件", "set.restore.busy": "還原中…",
        "set.debug.title": "診斷記錄（排查用）", "set.debug.desc": "開啟後會攔截全域網路請求並寫 ws-log.json / err-log.json。只在排查問題時開，平時請關閉，會拖慢思源",
        "msg.loadErr": "siyuan-xref 載入異常：{0}（詳見 data/storage/petal/siyuan-xref/err-log.json）", "msg.error": "siyuan-xref 出錯：{0}",
        "msg.noDoc": "siyuan-xref：未取得目前文件", "msg.busy": "siyuan-xref：重排一直沒結束，本次操作未執行，請稍後重試",
        "msg.renumbering": "siyuan-xref：正在重排，請稍候再試", "msg.setDone": "已設為{0}題註{1}",
        "msg.nBlocks": " {0} 處", "msg.attrWritten": "siyuan-xref：屬性已寫入，編號稍後自動補上（{0} 處）",
        "msg.addFail": "siyuan-xref：沒能在圖／表旁邊插入題註段落，請重試", "msg.addPending": "siyuan-xref：題註段落已插入，編號稍後自動補上",
        "msg.addDone": "已在{0}新增{1}題註{2}，可直接補寫說明", "msg.notIndexed": "siyuan-xref：這個區塊還沒進索引，請稍後重試",
        "msg.wrongSide": "siyuan-xref：題註不在{0}{1}，而在另一側。請直接右鍵那個題註段落，選「取消圖表題註」", "msg.noNeighbor": "siyuan-xref：找不到該{0}{1}緊鄰的題註段落，請右鍵題註段落本身取消",
        "msg.cancelled": "已取消題註{0}{1}", "msg.cancelWrap": "（{0}）",
        "msg.cancel.none": "本來就沒有編號前置", "msg.cancel.names": "已清除區塊命名 {0} 處",
        "msg.cancel.stuck": "{0} 處的編號前置沒能去除，請手動刪掉那行前置後重試", "msg.cancel.orphan": "另有 {0} 處引用仍寫著原編號",
        "msg.sep": "，", "msg.settingsSaved": "siyuan-xref：設定已儲存",
        "msg.noTargets": "siyuan-xref：本文件沒辨識到圖／表／公式", "msg.emptyEq": "siyuan-xref：有 {0} 個公式區塊內容為空（只剩 \\tag），請檢查公式是否遺失",
        "msg.renumbered": "siyuan-xref：已重排 {0} 項，更新引用 {1} 處", "msg.burned": "，另把 {0} 處失效引用轉成紅色刪除線文字",
        "msg.deadGrace": "，發現 {0} 處失效引用（{1} 秒後仍未恢復才轉文字）", "msg.deadFound": "，發現 {0} 處失效引用",
        "msg.deadPainted": "siyuan-xref：{0} 處交叉引用已失效（指向已刪的區塊，或該區塊已取消題註），已在正文裡標紅", "msg.noUndo": "siyuan-xref：沒有可復原的重排記錄",
        "msg.undoDone": "siyuan-xref：已復原 {0} 那輪重排（{1} 處{2}{3}），還剩 {4} 步可復原", "msg.undoRebuilt": "，重建了 {0} 個已被刪除的區塊",
        "msg.undoMiss": "，{0} 處區塊已不存在", "msg.noRedo": "siyuan-xref：沒有可重做的重排記錄",
        "msg.redoDone": "siyuan-xref：已重做，復原堆疊 {0} 步{1}", "msg.redoRebuilt": "（重建 {0} 區塊）",
        "msg.noArchive": "siyuan-xref：沒有可還原的記錄（dead-fix-log.json 為空）", "msg.noDocDead": "siyuan-xref：目前文件沒有失效引用記錄",
        "msg.restored": "siyuan-xref：還原 {0} 處引用（{1} 個區塊）{2}", "msg.restoreMiss": "；{0} 個區塊找不到或目標區塊已刪",
        "msg.readFail": "siyuan-xref 讀取失敗：{0}", "msg.insertFail": "插入失敗：{0}",
        "picker.title": "插入交叉引用", "picker.ph": "搜尋編號或題註，↑↓ 選擇，Enter 插入，Esc 關閉",
        "picker.empty": "沒有符合項目", "picker.all": "全部",
        "picker.allSec": "全部章節", "picker.secTip": "只看某個標題下的圖／表／式（含它的子標題）",
        "picker.secNone": "（無標題）", "picker.noAnchor": "siyuan-xref：定位不到這個段落，引用未插入。請把游標放到目標段落再試",
        "picker.noSlash": "siyuan-xref：定位不到 /xref 所在位置，已取消插入。請把游標放到目標段落再試",
    },
    ja: {
        // 日本語（思源 ja）
        "label.fig": "図", "label.tab": "表",
        "label.eq": "式", "dead.text": "リンク切れ参照",
        "slash.xref.text": "相互参照", "slash.xref.meta": "図 / 表 / 式",
        "slash.num.text": "図表番号を振り直す", "slash.num.meta": "参照も同時に更新",
        "cmd.insert": "相互参照を挿入", "cmd.renumber": "図表番号を振り直す",
        "cmd.undo": "前回の振り直しを元に戻す", "cmd.redo": "振り直しをやり直す",
        "menu.setFig": "図のキャプションに設定", "menu.setTab": "表のキャプションに設定",
        "menu.clear": "キャプションを解除", "menu.add": "{0}に{1}のキャプションを追加",
        "menu.useNext": "{0}の段落を{1}のキャプションにする", "menu.ref": "相互参照を挿入…",
        "menu.where.below": "下", "menu.where.above": "上",
        "menu.word.fig": "図", "menu.word.tab": "表",
        "noun.image": "画像", "noun.table": "表",
        "hint.table": "キャプション：表のセル内では使えません。表そのもの、または表の上のキャプション段落を右クリックしてください", "hint.mixed": "キャプション：同じ種類のブロックを選んでください（段落、または画像 1 枚 / 表 1 つ）",
        "hint.math": "キャプション：数式ブロックは自動で番号が付くので、キャプションは不要です", "hint.default": "キャプション：画像 / 表そのもの、または図の下（表の上）のキャプション段落を右クリックしてください",
        "set.grp.single": "単一ドキュメント（共通設定）",
        "set.grp.book": "書籍・複数ドキュメント（範囲設定）",
        "set.grp.num": "番号",
        "set.grp.trigger": "トリガーと参照",
        "set.grp.look": "キャプションの外観",
        "set.grp.keys": "ショートカット",
        "set.grp.adv": "詳細設定",
        "set.mode.title": "番号の付け方", "set.mode.desc": "文書全体で連番（図 1、図 2）または最上位の見出しごとに振り直す（図 1-1、図 2-1）",
        "set.mode.continuous": "全体で連番", "set.mode.chapter": "見出しごと",
        "set.labels.title": "図 / 表 / 式 のラベル", "set.labels.desc": "番号の前に付ける文字。例：Figure / Table / Eq",
        "set.refs.title": "振り直し時に参照も更新", "set.refs.desc": "((ブロックID \"旧アンカー\")) をすべて新しい番号に書き換えます。オフにすると番号だけ変わり、参照はそのままです",
        "set.auto.title": "自動で振り直す", "set.auto.desc": "入力が止まって 1.5 秒後に番号を振り直し、参照も更新します。カーソルのあるブロックには書き込まないので、入力の邪魔をしません",
        "set.dead.title": "リンク切れ参照の扱い", "set.dead.desc": "削除済みブロック、またはキャプションを解除したブロックを指す参照です。既定の「何もしない」では参照はそのまま残り、ブロックを削除しても Ctrl+Alt+Z で元の ID のまま復元でき、参照もつながります。「赤くマーク」は本文に赤い取り消し線を引きます（内容が壊れたように見えます）。「テキストに変換」は参照が完全に失われ元に戻せず、実行まで 10 秒待ちます",
        "set.dead.off": "何もしない（推奨）", "set.dead.mark": "赤くマークし、参照は残す",
        "set.dead.text": "赤い取り消し線テキストに変換（元に戻せません）", "set.center.title": "キャプションを中央揃え",
        "set.center.desc": "振り直し時に「図 N …」「表 N …」のキャプション段落を中央揃えにします", "set.bg.title": "キャプションの背景色",
        "set.bg.desc": "「図 N …」「表 N …」のキャプションに薄い背景色を付けます。ダークテーマでも読みやすくなります。自分で背景色を設定したものは変更しません", "set.bg.none": "なし",
        "set.bg.faint": "ごく薄く", "set.bg.light": "薄く（既定）",
        "set.bg.blue": "薄い青", "set.keys.title": "ショートカットのカスタマイズ",
        "set.keys.desc": "入力欄をクリックしてから使いたいキーの組み合わせを押してください（Ctrl / Alt / ⌘ が必要）。Backspace で消去、Esc でキャンセル。設定 → キーマップ → プラグインにも同じ項目があり、どちらで変更しても構いません", "set.keys.insert": "相互参照を挿入",
        "set.keys.renumber": "番号を振り直す", "set.keys.undo": "前回の振り直しを元に戻す",
        "set.keys.redo": "やり直す", "set.keys.unset": "未設定",
        "set.keys.press": "キーを押してください…", "set.keys.tip": "クリックしてキーを押す",
        "set.undo.title": "元に戻せる回数", "set.undo.desc": "振り直しを何回分まで戻せるか（1〜50）。SiYuan の Ctrl+Z はプラグインの書き込みを戻せないため、独自に記録します",
        "set.restore.title": "リンク切れ参照を復元", "set.restore.desc": "以前「テキストに変換」で失われた参照を ((ブロックID \"アンカー\")) に戻します。対象ブロックが削除済みのものは自動で飛ばします",
        "set.restore.btn": "この文書を復元", "set.restore.busy": "復元中…",
        "set.debug.title": "診断ログ（トラブルシューティング）", "set.debug.desc": "オンにするとすべてのネットワーク通信を記録し、ws-log.json / err-log.json に書き出します。調査時だけオンにしてください。SiYuan が遅くなります",
        "msg.loadErr": "siyuan-xref の読み込みに失敗しました：{0}（詳細は data/storage/petal/siyuan-xref/err-log.json）", "msg.error": "siyuan-xref エラー：{0}",
        "msg.noDoc": "siyuan-xref：現在の文書を取得できません", "msg.busy": "siyuan-xref：振り直しが終わらないため、今回は実行しませんでした。しばらくして再試行してください",
        "msg.renumbering": "siyuan-xref：振り直し中です。しばらくしてから再試行してください", "msg.setDone": "{0}のキャプションに設定しました{1}",
        "msg.nBlocks": "（{0} か所）", "msg.attrWritten": "siyuan-xref：属性を保存しました。番号はまもなく反映されます（{0} か所）",
        "msg.addFail": "siyuan-xref：図 / 表の隣にキャプション段落を挿入できませんでした。再試行してください", "msg.addPending": "siyuan-xref：キャプション段落を挿入しました。番号はまもなく反映されます",
        "msg.addDone": "{0}に{1}のキャプションを追加しました{2}。そのまま説明を書けます", "msg.notIndexed": "siyuan-xref：このブロックはまだインデックスされていません。しばらくして再試行してください",
        "msg.wrongSide": "siyuan-xref：キャプションは{0}の{1}ではなく反対側にあります。そのキャプション段落を右クリックして「キャプションを解除」を選んでください", "msg.noNeighbor": "siyuan-xref：この{0}の{1}に隣接するキャプション段落が見つかりません。キャプション段落自体を右クリックして解除してください",
        "msg.cancelled": "キャプションを解除しました{0}{1}", "msg.cancelWrap": "（{0}）",
        "msg.cancel.none": "番号の接頭辞はありませんでした", "msg.cancel.names": "ブロック名を {0} か所クリアしました",
        "msg.cancel.stuck": "{0} か所の番号接頭辞を削除できませんでした。その行を手動で消してから再試行してください", "msg.cancel.orphan": "他に {0} か所の参照が古い番号のままです",
        "msg.sep": "、", "msg.settingsSaved": "siyuan-xref：設定を保存しました",
        "msg.noTargets": "siyuan-xref：この文書には図 / 表 / 式が見つかりませんでした", "msg.emptyEq": "siyuan-xref：{0} 個の数式ブロックが空です（\\tag だけが残っています）。数式が失われていないか確認してください",
        "msg.renumbered": "siyuan-xref：{0} 件を振り直し、参照を {1} か所更新しました", "msg.burned": "、さらに {0} か所のリンク切れ参照を赤い取り消し線テキストに変換しました",
        "msg.deadGrace": "、{0} か所のリンク切れ参照を検出しました（{1} 秒後も復旧しない場合のみテキスト化）", "msg.deadFound": "、{0} か所のリンク切れ参照を検出しました",
        "msg.deadPainted": "siyuan-xref：{0} か所の相互参照がリンク切れです（対象ブロックが削除済み、またはキャプションが解除済み）。本文内で赤くマークしました", "msg.noUndo": "siyuan-xref：元に戻せる振り直し履歴がありません",
        "msg.undoDone": "siyuan-xref：{0} 回目の振り直しを元に戻しました（{1} か所{2}{3}）。残り {4} 回まで戻せます", "msg.undoRebuilt": "、削除済みのブロックを {0} 個復元しました",
        "msg.undoMiss": "、{0} か所のブロックは既に存在しません", "msg.noRedo": "siyuan-xref：やり直せる振り直し履歴がありません",
        "msg.redoDone": "siyuan-xref：やり直しました。履歴は {0} 回分{1}", "msg.redoRebuilt": "（{0} ブロックを復元）",
        "msg.noArchive": "siyuan-xref：復元できる記録がありません（dead-fix-log.json が空）", "msg.noDocDead": "siyuan-xref：この文書にはリンク切れ参照の記録がありません",
        "msg.restored": "siyuan-xref：{0} か所の参照を復元しました（{1} 個のブロック）{2}", "msg.restoreMiss": "、{0} 個のブロックが見つからないか対象が削除済みです",
        "msg.readFail": "siyuan-xref の読み込みに失敗しました：{0}", "msg.insertFail": "挿入に失敗しました：{0}",
        "picker.title": "相互参照を挿入", "picker.ph": "番号やキャプションで検索 · ↑↓ で選択 · Enter で挿入 · Esc で閉じる",
        "picker.empty": "該当なし", "picker.all": "すべて",
        "picker.allSec": "すべての見出し", "picker.secTip": "特定の見出しの下の図 / 表 / 式だけを表示します（子見出しを含む）",
        "picker.secNone": "（見出しなし）", "picker.noAnchor": "siyuan-xref：この段落を特定できず、参照を挿入しませんでした。対象の段落にカーソルを置いて再試行してください",
        "picker.noSlash": "siyuan-xref：/xref を入力した位置を特定できず、挿入を中止しました。対象の段落にカーソルを置いて再試行してください",
    },
    ko: {
        // 한국어（思源 ko）
        "label.fig": "그림", "label.tab": "표",
        "label.eq": "식", "dead.text": "끊긴 참조",
        "slash.xref.text": "상호 참조", "slash.xref.meta": "그림 / 표 / 식",
        "slash.num.text": "그림·표 번호 다시 매기기", "slash.num.meta": "참조도 함께 갱신",
        "cmd.insert": "상호 참조 삽입", "cmd.renumber": "그림·표 번호 다시 매기기",
        "cmd.undo": "마지막 번호 매기기 취소", "cmd.redo": "번호 매기기 다시 실행",
        "menu.setFig": "그림 캡션으로 지정", "menu.setTab": "표 캡션으로 지정",
        "menu.clear": "캡션 해제", "menu.add": "{0}에 {1} 캡션 추가",
        "menu.useNext": "{0} 단락을 {1} 캡션으로 지정", "menu.ref": "상호 참조 삽입…",
        "menu.where.below": "아래", "menu.where.above": "위",
        "menu.word.fig": "그림", "menu.word.tab": "표",
        "noun.image": "이미지", "noun.table": "표",
        "hint.table": "캡션: 표 셀 안에서는 지원하지 않습니다. 표 자체나 표 위의 캡션 단락을 마우스 오른쪽 버튼으로 클릭하세요", "hint.mixed": "캡션: 같은 종류의 블록을 선택하세요 (단락, 또는 이미지 한 장 / 표 하나)",
        "hint.math": "캡션: 수식 블록은 번호가 자동으로 매겨지므로 캡션이 필요하지 않습니다", "hint.default": "캡션: 이미지 / 표 자체, 또는 그림 아래(표 위)의 캡션 단락을 마우스 오른쪽 버튼으로 클릭하세요",
        "set.grp.single": "단일 문서 (공통 설정)",
        "set.grp.book": "책 / 여러 문서 (범위 설정)",
        "set.grp.num": "번호",
        "set.grp.trigger": "트리거와 참조",
        "set.grp.look": "캡션 모양",
        "set.grp.keys": "단축키",
        "set.grp.adv": "고급",
        "set.mode.title": "번호 매기기 방식", "set.mode.desc": "문서 전체 연속(그림 1, 그림 2) 또는 최상위 제목마다 새로 시작(그림 1-1, 그림 2-1)",
        "set.mode.continuous": "전체 연속", "set.mode.chapter": "장마다",
        "set.labels.title": "그림 / 표 / 식 라벨", "set.labels.desc": "번호 앞에 붙는 글자. 예: Figure / Table / Eq",
        "set.refs.title": "번호를 다시 매길 때 참조도 갱신", "set.refs.desc": "((블록ID \"이전 앵커\"))를 모두 새 번호로 바꿉니다. 끄면 번호만 바뀌고 참조는 그대로 둡니다",
        "set.auto.title": "자동 번호 매기기", "set.auto.desc": "입력을 멈추고 1.5초 후 번호를 다시 매기고 참조를 갱신합니다. 커서가 있는 블록에는 쓰지 않으므로 입력을 방해하지 않습니다",
        "set.dead.title": "끊긴 참조 처리", "set.dead.desc": "삭제된 블록이나 캡션을 해제한 블록을 가리키는 참조입니다. 기본값 「그대로 두기」는 참조를 그대로 남기고, 블록을 삭제해도 Ctrl+Alt+Z로 원래 ID 그대로 복원되어 참조가 다시 연결됩니다. 「빨갛게 표시」는 본문에 빨간 취소선을 그어 내용이 손상된 것처럼 보입니다. 「텍스트로 변환」은 참조가 완전히 끊겨 되돌릴 수 없고, 실행까지 10초를 기다립니다",
        "set.dead.off": "그대로 두기 (권장)", "set.dead.mark": "빨갛게 표시하고 참조 유지",
        "set.dead.text": "빨간 취소선 텍스트로 변환 (되돌릴 수 없음)", "set.center.title": "캡션 가운데 정렬",
        "set.center.desc": "번호를 다시 매길 때 「그림 N …」「표 N …」 캡션 단락을 가운데 정렬합니다", "set.bg.title": "캡션 배경색",
        "set.bg.desc": "「그림 N …」「표 N …」 캡션에 아주 옅은 배경색을 넣습니다. 어두운 테마에서도 잘 보입니다. 직접 배경색을 지정한 캡션은 건드리지 않습니다", "set.bg.none": "없음",
        "set.bg.faint": "아주 옅게", "set.bg.light": "옅게 (기본)",
        "set.bg.blue": "연한 파랑", "set.keys.title": "단축키 사용자 지정",
        "set.keys.desc": "입력란을 클릭한 뒤 원하는 키 조합을 누르세요 (Ctrl / Alt / ⌘ 필수). Backspace로 지우고 Esc로 취소합니다. 설정 → 단축키 → 플러그인에도 같은 항목이 있으며 어느 쪽에서 바꿔도 됩니다", "set.keys.insert": "상호 참조 삽입",
        "set.keys.renumber": "번호 다시 매기기", "set.keys.undo": "마지막 번호 매기기 취소",
        "set.keys.redo": "다시 실행", "set.keys.unset": "설정 안 됨",
        "set.keys.press": "키를 누르세요…", "set.keys.tip": "클릭한 뒤 키를 누르세요",
        "set.undo.title": "되돌리기 단계", "set.undo.desc": "번호 매기기를 몇 회까지 되돌릴 수 있는지 (1~50). SiYuan의 Ctrl+Z는 플러그인이 쓴 내용을 되돌리지 못하므로 따로 기록합니다",
        "set.restore.title": "끊긴 참조 복원", "set.restore.desc": "예전에 「텍스트로 변환」으로 끊긴 참조를 ((블록ID \"앵커\"))로 되돌립니다. 대상 블록이 삭제된 경우는 자동으로 건너뜁니다",
        "set.restore.btn": "이 문서 복원", "set.restore.busy": "복원 중…",
        "set.debug.title": "진단 로그 (문제 해결용)", "set.debug.desc": "켜면 모든 네트워크 요청을 가로채 ws-log.json / err-log.json에 기록합니다. 문제를 찾을 때만 켜세요. SiYuan이 느려집니다",
        "msg.loadErr": "siyuan-xref 로드 실패: {0} (자세한 내용은 data/storage/petal/siyuan-xref/err-log.json)", "msg.error": "siyuan-xref 오류: {0}",
        "msg.noDoc": "siyuan-xref: 현재 문서를 가져오지 못했습니다", "msg.busy": "siyuan-xref: 번호 매기기가 끝나지 않아 이번 작업을 실행하지 않았습니다. 잠시 후 다시 시도하세요",
        "msg.renumbering": "siyuan-xref: 번호를 매기는 중입니다. 잠시 후 다시 시도하세요", "msg.setDone": "{0} 캡션으로 지정했습니다{1}",
        "msg.nBlocks": " ({0}곳)", "msg.attrWritten": "siyuan-xref: 속성을 저장했습니다. 번호는 곧 반영됩니다 ({0}곳)",
        "msg.addFail": "siyuan-xref: 그림 / 표 옆에 캡션 단락을 넣지 못했습니다. 다시 시도하세요", "msg.addPending": "siyuan-xref: 캡션 단락을 넣었습니다. 번호는 곧 반영됩니다",
        "msg.addDone": "{0}에 {1} 캡션을 추가했습니다{2}. 바로 설명을 입력할 수 있습니다", "msg.notIndexed": "siyuan-xref: 이 블록은 아직 색인되지 않았습니다. 잠시 후 다시 시도하세요",
        "msg.wrongSide": "siyuan-xref: 캡션은 {0} {1}이 아니라 반대쪽에 있습니다. 그 캡션 단락을 마우스 오른쪽 버튼으로 클릭해 「캡션 해제」를 선택하세요", "msg.noNeighbor": "siyuan-xref: 이 {0} {1}에 붙어 있는 캡션 단락을 찾지 못했습니다. 캡션 단락 자체를 마우스 오른쪽 버튼으로 클릭해 해제하세요",
        "msg.cancelled": "캡션을 해제했습니다{0}{1}", "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "번호 접두사가 원래 없었습니다", "msg.cancel.names": "블록 이름 {0}곳을 지웠습니다",
        "msg.cancel.stuck": "{0}곳의 번호 접두사를 지우지 못했습니다. 그 줄을 직접 지운 뒤 다시 시도하세요", "msg.cancel.orphan": "참조 {0}곳이 아직 이전 번호를 표시하고 있습니다",
        "msg.sep": ", ", "msg.settingsSaved": "siyuan-xref: 설정을 저장했습니다",
        "msg.noTargets": "siyuan-xref: 이 문서에서 그림 / 표 / 수식을 찾지 못했습니다", "msg.emptyEq": "siyuan-xref: 수식 블록 {0}개가 비어 있습니다 (\\tag만 남음). 수식이 사라지지 않았는지 확인하세요",
        "msg.renumbered": "siyuan-xref: {0}개 항목의 번호를 다시 매기고 참조 {1}곳을 갱신했습니다", "msg.burned": ", 끊긴 참조 {0}곳을 빨간 취소선 텍스트로 변환했습니다",
        "msg.deadGrace": ", 끊긴 참조 {0}곳을 발견했습니다 ({1}초 후에도 복구되지 않으면 텍스트로 변환)", "msg.deadFound": ", 끊긴 참조 {0}곳을 발견했습니다",
        "msg.deadPainted": "siyuan-xref: 상호 참조 {0}곳이 끊겼습니다 (대상 블록이 삭제되었거나 캡션이 해제됨). 본문에 빨갛게 표시했습니다", "msg.noUndo": "siyuan-xref: 되돌릴 번호 매기기 기록이 없습니다",
        "msg.undoDone": "siyuan-xref: {0}번째 번호 매기기를 되돌렸습니다 ({1}곳{2}{3}). {4}단계 더 되돌릴 수 있습니다", "msg.undoRebuilt": ", 삭제된 블록 {0}개를 복원했습니다",
        "msg.undoMiss": ", 블록 {0}곳이 더 이상 존재하지 않습니다", "msg.noRedo": "siyuan-xref: 다시 실행할 번호 매기기 기록이 없습니다",
        "msg.redoDone": "siyuan-xref: 다시 실행했습니다. 되돌리기 기록 {0}단계{1}", "msg.redoRebuilt": " (블록 {0}개 복원)",
        "msg.noArchive": "siyuan-xref: 복원할 기록이 없습니다 (dead-fix-log.json이 비어 있음)", "msg.noDocDead": "siyuan-xref: 이 문서에는 끊긴 참조 기록이 없습니다",
        "msg.restored": "siyuan-xref: 참조 {0}곳을 복원했습니다 (블록 {1}개){2}", "msg.restoreMiss": "; 블록 {0}개를 찾을 수 없거나 대상이 삭제되었습니다",
        "msg.readFail": "siyuan-xref 읽기 실패: {0}", "msg.insertFail": "삽입 실패: {0}",
        "picker.title": "상호 참조 삽입", "picker.ph": "번호나 캡션으로 검색 · ↑↓ 선택 · Enter 삽입 · Esc 닫기",
        "picker.empty": "일치하는 항목 없음", "picker.all": "전체",
        "picker.allSec": "전체 제목", "picker.secTip": "특정 제목 아래의 그림 / 표 / 식만 표시합니다 (하위 제목 포함)",
        "picker.secNone": "(제목 없음)", "picker.noAnchor": "siyuan-xref: 이 단락을 찾지 못해 참조를 삽입하지 않았습니다. 대상 단락에 커서를 두고 다시 시도하세요",
        "picker.noSlash": "siyuan-xref: /xref를 입력한 위치를 찾지 못해 삽입을 취소했습니다. 대상 단락에 커서를 두고 다시 시도하세요",
    },
    de: {
        // Deutsch（思源 de）：合成词用「名词: …」/「… als Beschriftung」避免 Abbildungbeschriftung 这类拼写错误
        "label.fig": "Abb.", "label.tab": "Tab.",
        "label.eq": "Gl.", "dead.text": "defekter Verweis",
        "slash.xref.text": "Querverweis", "slash.xref.meta": "Abbildung / Tabelle / Gleichung",
        "slash.num.text": "Nummerierung neu vergeben", "slash.num.meta": "Verweise mit aktualisieren",
        "cmd.insert": "Querverweis einfügen", "cmd.renumber": "Nummerierung neu vergeben",
        "cmd.undo": "Letzte Nummerierung rückgängig", "cmd.redo": "Nummerierung wiederholen",
        "menu.setFig": "Als Abbildungsbeschriftung setzen", "menu.setTab": "Als Tabellenbeschriftung setzen",
        "menu.clear": "Beschriftung entfernen", "menu.add": "{1}: Beschriftung {0} hinzufügen",
        "menu.useNext": "Absatz {0} als Beschriftung für {1} verwenden", "menu.ref": "Querverweis einfügen…",
        "menu.where.below": "unterhalb", "menu.where.above": "oberhalb",
        "menu.word.fig": "Abbildung", "menu.word.tab": "Tabelle",
        "noun.image": "des Bildes", "noun.table": "der Tabelle",
        "hint.table": "Beschriftung: In Tabellenzellen nicht möglich – klicken Sie mit der rechten Maustaste auf die Tabelle selbst oder auf die Beschriftung oberhalb der Tabelle", "hint.mixed": "Beschriftung: Bitte Blöcke derselben Art auswählen (Absätze oder ein einzelnes Bild / eine einzelne Tabelle)",
        "hint.math": "Beschriftung: Gleichungsblöcke werden automatisch nummeriert, eine Beschriftung ist nicht nötig", "hint.default": "Beschriftung: Klicken Sie mit der rechten Maustaste auf das Bild / die Tabelle selbst oder auf den Beschriftungsabsatz unter einer Abbildung (über einer Tabelle)",
        "set.grp.single": "Einzeldokument (allgemein)",
        "set.grp.book": "Buch / mehrere Dokumente (Bereich)",
        "set.grp.num": "Nummerierung",
        "set.grp.trigger": "Auslöser & Verweise",
        "set.grp.look": "Beschriftungsstil",
        "set.grp.keys": "Tastenkürzel",
        "set.grp.adv": "Erweitert",
        "set.mode.title": "Nummerierungsmodus", "set.mode.desc": "Durchlaufend im ganzen Dokument (Abb. 1, Abb. 2) oder neu ab jeder Überschriftenebene (Abb. 1-1, Abb. 2-1)",
        "set.mode.continuous": "Durchlaufend", "set.mode.chapter": "Pro Kapitel",
        "set.labels.title": "Beschriftungstexte für Abbildung / Tabelle / Gleichung", "set.labels.desc": "Text vor der Nummer, z. B. Abb. / Tab. / Gl.",
        "set.refs.title": "Verweise beim Neuvergeben aktualisieren", "set.refs.desc": "Schreibt jedes ((Block-ID \"alter Anker\")) auf die neue Nummer um. Ausschalten ändert nur die Nummern und lässt Verweise unberührt.",
        "set.auto.title": "Automatisch neu nummerieren", "set.auto.desc": "Nummeriert 1,5 s nach dem letzten Tastendruck neu und aktualisiert die Verweise. Der Block mit dem Cursor wird nie beschrieben, damit die Eingabe nicht unterbrochen wird.",
        "set.dead.title": "Defekte Verweise", "set.dead.desc": "Ein Verweis auf einen gelöschten Block oder auf einen Block, dessen Beschriftung entfernt wurde. Standard „unverändert lassen“: der Verweis bleibt stehen, und Ctrl+Alt+Z baut den gelöschten Block mit seiner ursprünglichen ID wieder auf, sodass der Verweis wieder greift. „Rot markieren“ färbt ihn rot mit Durchstreichung, was leicht wie eine Beschädigung des Inhalts aussieht. „In Text umwandeln“ ist unwiderruflich und wartet 10 s vor der Ausführung.",
        "set.dead.off": "Unverändert lassen (empfohlen)", "set.dead.mark": "Rot markieren, Verweis behalten",
        "set.dead.text": "In roten durchgestrichenen Text umwandeln (unwiderruflich)", "set.center.title": "Beschriftungen zentrieren",
        "set.center.desc": "Zentriert beim Neuvergeben jeden Beschriftungsabsatz von Abbildung / Tabelle", "set.bg.title": "Hintergrund der Beschriftung",
        "set.bg.desc": "Legt einen sehr hellen Hintergrund hinter Beschriftungsabsätze; auch in dunklen Themes lesbar. Selbst gesetzte Hintergründe bleiben unverändert.", "set.bg.none": "Keiner",
        "set.bg.faint": "Sehr hell", "set.bg.light": "Hell (Standard)",
        "set.bg.blue": "Hellblau", "set.keys.title": "Eigene Tastenkürzel",
        "set.keys.desc": "Klicken Sie in ein Feld und drücken Sie die gewünschte Kombination (Ctrl / Alt / ⌘ erforderlich). Backspace löscht, Esc bricht ab. Dieselben Kürzel stehen auch unter Einstellungen → Tastenkürzel → Plugins; beide Stellen funktionieren.", "set.keys.insert": "Querverweis einfügen",
        "set.keys.renumber": "Neu nummerieren", "set.keys.undo": "Letzte Nummerierung rückgängig",
        "set.keys.redo": "Wiederholen", "set.keys.unset": "nicht gesetzt",
        "set.keys.press": "Tasten drücken…", "set.keys.tip": "Klicken, dann Tasten drücken",
        "set.undo.title": "Rückgängig-Tiefe", "set.undo.desc": "Wie viele Nummerierungsläufe rückgängig gemacht werden können (1–50). Das Ctrl+Z von SiYuan kann API-Schreibvorgänge nicht zurücknehmen, daher führt das Plugin einen eigenen Stapel.",
        "set.restore.title": "Defekte Verweise wiederherstellen", "set.restore.desc": "Wandelt Verweise, die zuvor in reinen Text umgewandelt wurden, wieder in ((Block-ID \"Anker\")) um. Blöcke ohne Ziel werden übersprungen.",
        "set.restore.btn": "Dieses Dokument wiederherstellen", "set.restore.busy": "Wird wiederhergestellt…",
        "set.debug.title": "Diagnoseprotokoll (Fehlersuche)", "set.debug.desc": "Fängt jede Netzwerkanfrage ab und schreibt ws-log.json / err-log.json. Nur zur Fehlersuche einschalten – es bremst SiYuan aus.",
        "msg.loadErr": "siyuan-xref konnte nicht geladen werden: {0} (siehe data/storage/petal/siyuan-xref/err-log.json)", "msg.error": "siyuan-xref-Fehler: {0}",
        "msg.noDoc": "siyuan-xref: kein aktuelles Dokument", "msg.busy": "siyuan-xref: die Nummerierung wurde nie fertig, es wurde nichts ausgeführt – bitte erneut versuchen",
        "msg.renumbering": "siyuan-xref: Nummerierung läuft, bitte warten", "msg.setDone": "{0} als Beschriftung gesetzt{1}",
        "msg.nBlocks": " ({0} Blöcke)", "msg.attrWritten": "siyuan-xref: Attribut gespeichert, die Nummern folgen gleich ({0})",
        "msg.addFail": "siyuan-xref: neben der Abbildung / Tabelle konnte kein Beschriftungsabsatz eingefügt werden, bitte erneut versuchen", "msg.addPending": "siyuan-xref: Beschriftungsabsatz eingefügt, die Nummern folgen gleich",
        "msg.addDone": "{1}: Beschriftung {0} hinzugefügt{2}", "msg.notIndexed": "siyuan-xref: dieser Block ist noch nicht indexiert, bitte erneut versuchen",
        "msg.wrongSide": "siyuan-xref: die Beschriftung steht auf der anderen Seite, nicht {1} der {0}. Klicken Sie mit der rechten Maustaste auf diesen Beschriftungsabsatz und wählen Sie „Beschriftung entfernen“", "msg.noNeighbor": "siyuan-xref: kein Beschriftungsabsatz direkt {1} ({0}). Klicken Sie mit der rechten Maustaste auf den Beschriftungsabsatz selbst",
        "msg.cancelled": "Beschriftung entfernt{0}{1}", "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "es gab keine führende Nummer", "msg.cancel.names": "{0} Blockname(n) gelöscht",
        "msg.cancel.stuck": "{0} führende Nummer(n) konnten nicht entfernt werden – löschen Sie das Präfix von Hand und versuchen Sie es erneut", "msg.cancel.orphan": "{0} Verweis(e) zeigen noch die alte Nummer",
        "msg.sep": ", ", "msg.settingsSaved": "siyuan-xref: Einstellungen gespeichert",
        "msg.noTargets": "siyuan-xref: in diesem Dokument wurden keine Abbildungen, Tabellen oder Gleichungen gefunden", "msg.emptyEq": "siyuan-xref: {0} Gleichungsblock/-blöcke sind leer (nur \\tag übrig) – prüfen Sie, ob die Formel verloren ging",
        "msg.renumbered": "siyuan-xref: {0} Beschriftung(en) neu nummeriert, {1} Verweis(e) aktualisiert", "msg.burned": ", {0} defekte Verweis(e) in roten durchgestrichenen Text umgewandelt",
        "msg.deadGrace": ", {0} defekte Verweis(e) gefunden (Umwandlung in Text erst nach {1} s)", "msg.deadFound": ", {0} defekte Verweis(e) gefunden",
        "msg.deadPainted": "siyuan-xref: {0} Querverweis(e) sind defekt (Ziel gelöscht oder Beschriftung entfernt) und im Dokument rot markiert", "msg.noUndo": "siyuan-xref: nichts rückgängig zu machen",
        "msg.undoDone": "siyuan-xref: Nummerierungslauf {0} rückgängig gemacht ({1} Änderung(en){2}{3}), {4} Schritt(e) übrig", "msg.undoRebuilt": ", {0} gelöschte Blöcke wiederhergestellt",
        "msg.undoMiss": ", {0} Block/Blöcke existieren nicht mehr", "msg.noRedo": "siyuan-xref: nichts zu wiederholen",
        "msg.redoDone": "siyuan-xref: wiederholt, Rückgängig-Stapel {0} Schritt(e){1}", "msg.redoRebuilt": " ({0} Block/Blöcke wiederhergestellt)",
        "msg.noArchive": "siyuan-xref: nichts wiederherzustellen (dead-fix-log.json ist leer)", "msg.noDocDead": "siyuan-xref: für dieses Dokument sind keine defekten Verweise erfasst",
        "msg.restored": "siyuan-xref: {0} Verweis(e) in {1} Block/Blöcken wiederhergestellt{2}", "msg.restoreMiss": "; {0} Block/Blöcke fehlen oder das Ziel wurde bereits gelöscht",
        "msg.readFail": "siyuan-xref: Lesen fehlgeschlagen: {0}", "msg.insertFail": "Einfügen fehlgeschlagen: {0}",
        "picker.title": "Querverweis einfügen", "picker.ph": "Nach Nummer oder Beschriftung suchen · ↑↓ auswählen · Enter einfügen · Esc schließen",
        "picker.empty": "Keine Treffer", "picker.all": "Alle",
        "picker.allSec": "Alle Überschriften", "picker.secTip": "Nur die Abbildungen / Tabellen / Gleichungen unter einer Überschrift zeigen (inkl. Unterüberschriften)",
        "picker.secNone": "(ohne Überschrift)", "picker.noAnchor": "siyuan-xref: dieser Absatz wurde nicht gefunden, nichts eingefügt. Setzen Sie den Cursor in den Zielabsatz und versuchen Sie es erneut",
        "picker.noSlash": "siyuan-xref: die Stelle von /xref wurde nicht gefunden, Einfügen abgebrochen. Setzen Sie den Cursor in den Zielabsatz und versuchen Sie es erneut",
    },
    fr: {
        // Français（思源 fr）
        "label.fig": "Fig.", "label.tab": "Tab.",
        "label.eq": "Éq.", "dead.text": "référence cassée",
        "slash.xref.text": "Référence croisée", "slash.xref.meta": "figure / tableau / équation",
        "slash.num.text": "Renuméroter les légendes", "slash.num.meta": "actualiser aussi les références",
        "cmd.insert": "Insérer une référence croisée", "cmd.renumber": "Renuméroter les légendes",
        "cmd.undo": "Annuler la dernière renumérotation", "cmd.redo": "Rétablir la renumérotation",
        "menu.setFig": "Définir comme légende de figure", "menu.setTab": "Définir comme légende de tableau",
        "menu.clear": "Supprimer la légende", "menu.add": "Ajouter une légende de {1} {0}",
        "menu.useNext": "Utiliser le paragraphe {0} comme légende de {1}", "menu.ref": "Insérer une référence croisée…",
        "menu.where.below": "en dessous", "menu.where.above": "au-dessus",
        "menu.word.fig": "figure", "menu.word.tab": "tableau",
        "noun.image": "de la figure", "noun.table": "du tableau",
        "hint.table": "Légendes : impossible dans une cellule de tableau — cliquez avec le bouton droit sur le tableau lui-même ou sur la légende au-dessus", "hint.mixed": "Légendes : sélectionnez des blocs de même type (paragraphes, ou une seule image / un seul tableau)",
        "hint.math": "Légendes : les blocs d'équation sont numérotés automatiquement, aucune légende n'est nécessaire", "hint.default": "Légendes : cliquez avec le bouton droit sur l'image / le tableau lui-même, ou sur le paragraphe de légende sous une figure (au-dessus d'un tableau)",
        "set.grp.single": "Document unique (général)",
        "set.grp.book": "Livre / multi-documents (portée)",
        "set.grp.num": "Numérotation",
        "set.grp.trigger": "Déclencheurs et références",
        "set.grp.look": "Apparence des légendes",
        "set.grp.keys": "Raccourcis",
        "set.grp.adv": "Avancé",
        "set.mode.title": "Mode de numérotation", "set.mode.desc": "Continu sur tout le document (Fig. 1, Fig. 2) ou redémarrage à chaque titre de premier niveau (Fig. 1-1, Fig. 2-1)",
        "set.mode.continuous": "Continu", "set.mode.chapter": "Par chapitre",
        "set.labels.title": "Libellés figure / tableau / équation", "set.labels.desc": "Texte placé devant chaque numéro, par ex. Fig. / Tab. / Éq.",
        "set.refs.title": "Actualiser les références lors de la renumérotation", "set.refs.desc": "Réécrit chaque ((id de bloc \"ancien ancrage\")) avec le nouveau numéro. Désactivez pour ne changer que les numéros et laisser les références intactes.",
        "set.auto.title": "Renumérotation automatique", "set.auto.desc": "Renumérote et actualise les références 1,5 s après la dernière frappe. Le bloc contenant le curseur n'est jamais écrit, la saisie n'est donc pas interrompue.",
        "set.dead.title": "Références cassées", "set.dead.desc": "Une référence vers un bloc supprimé, ou vers un bloc dont la légende a été supprimée. Par défaut « ne rien faire » : la référence reste en place, et Ctrl+Alt+Z reconstruit le bloc supprimé avec son identifiant d'origine, ce qui rétablit la référence. « Marquer en rouge » la colore en rouge avec un texte barré, ce qui peut faire croire à un contenu endommagé. « Convertir en texte » est irréversible et attend 10 s avant d'agir.",
        "set.dead.off": "Ne rien faire (recommandé)", "set.dead.mark": "Marquer en rouge, garder la référence",
        "set.dead.text": "Convertir en texte rouge barré (irréversible)", "set.center.title": "Centrer les légendes",
        "set.center.desc": "Centre chaque paragraphe de légende de figure / tableau lors de la renumérotation", "set.bg.title": "Fond des légendes",
        "set.bg.desc": "Ajoute un fond très clair derrière les paragraphes de légende ; reste lisible dans les thèmes sombres. Les fonds que vous avez définis vous-même ne sont pas modifiés.", "set.bg.none": "Aucun",
        "set.bg.faint": "Très clair", "set.bg.light": "Clair (par défaut)",
        "set.bg.blue": "Bleu pâle", "set.keys.title": "Raccourcis personnalisés",
        "set.keys.desc": "Cliquez dans un champ, puis appuyez sur la combinaison souhaitée (Ctrl / Alt / ⌘ requis). Retour arrière efface, Échap annule. Les mêmes raccourcis apparaissent dans Paramètres → Raccourcis → Plugins ; les deux endroits fonctionnent.", "set.keys.insert": "Insérer une référence",
        "set.keys.renumber": "Renuméroter", "set.keys.undo": "Annuler la dernière renumérotation",
        "set.keys.redo": "Rétablir", "set.keys.unset": "non défini",
        "set.keys.press": "appuyez sur les touches…", "set.keys.tip": "Cliquez, puis appuyez sur les touches",
        "set.undo.title": "Profondeur d'annulation", "set.undo.desc": "Nombre de renumérotations annulables (1–50). Le Ctrl+Z de SiYuan ne peut pas annuler les écritures de l'API, le plugin tient donc sa propre pile.",
        "set.restore.title": "Restaurer les références cassées", "set.restore.desc": "Reconvertit en ((id de bloc \"ancrage\")) les références qui avaient été converties en texte brut. Les blocs dont la cible n'existe plus sont ignorés.",
        "set.restore.btn": "Restaurer ce document", "set.restore.busy": "Restauration…",
        "set.debug.title": "Journal de diagnostic (dépannage)", "set.debug.desc": "Intercepte toutes les requêtes réseau et écrit ws-log.json / err-log.json. À activer uniquement pendant un dépannage — cela ralentit SiYuan.",
        "msg.loadErr": "échec du chargement de siyuan-xref : {0} (voir data/storage/petal/siyuan-xref/err-log.json)", "msg.error": "erreur siyuan-xref : {0}",
        "msg.noDoc": "siyuan-xref : aucun document courant", "msg.busy": "siyuan-xref : la renumérotation ne s'est jamais terminée, rien n'a été fait — veuillez réessayer",
        "msg.renumbering": "siyuan-xref : renumérotation en cours, veuillez patienter", "msg.setDone": "Défini comme légende de {0}{1}",
        "msg.nBlocks": " ({0} blocs)", "msg.attrWritten": "siyuan-xref : attribut enregistré, les numéros suivront bientôt ({0})",
        "msg.addFail": "siyuan-xref : impossible d'insérer un paragraphe de légende à côté de la figure / du tableau, veuillez réessayer", "msg.addPending": "siyuan-xref : paragraphe de légende inséré, les numéros suivront bientôt",
        "msg.addDone": "Légende de {1} ajoutée {0}{2} — vous pouvez saisir la description", "msg.notIndexed": "siyuan-xref : ce bloc n'est pas encore indexé, veuillez réessayer",
        "msg.wrongSide": "siyuan-xref : la légende se trouve de l'autre côté, pas {1} du {0}. Cliquez avec le bouton droit sur ce paragraphe de légende et choisissez « Supprimer la légende »", "msg.noNeighbor": "siyuan-xref : pas de paragraphe de légende juste {1} ({0}). Cliquez avec le bouton droit sur le paragraphe de légende lui-même pour le supprimer",
        "msg.cancelled": "Légende supprimée{0}{1}", "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "il n'y avait aucun numéro en tête", "msg.cancel.names": "{0} nom(s) de bloc effacé(s)",
        "msg.cancel.stuck": "{0} numéro(s) en tête n'ont pas pu être supprimés — supprimez ce préfixe à la main et réessayez", "msg.cancel.orphan": "{0} référence(s) affichent encore l'ancien numéro",
        "msg.sep": ", ", "msg.settingsSaved": "siyuan-xref : paramètres enregistrés",
        "msg.noTargets": "siyuan-xref : aucune figure, aucun tableau ni équation trouvé dans ce document", "msg.emptyEq": "siyuan-xref : {0} bloc(s) d'équation sont vides (seul \\tag reste) — vérifiez si la formule a été perdue",
        "msg.renumbered": "siyuan-xref : {0} légende(s) renumérotée(s), {1} référence(s) actualisée(s)", "msg.burned": ", {0} référence(s) cassée(s) convertie(s) en texte rouge barré",
        "msg.deadGrace": ", {0} référence(s) cassée(s) trouvée(s) (conversion en texte seulement après {1} s)", "msg.deadFound": ", {0} référence(s) cassée(s) trouvée(s)",
        "msg.deadPainted": "siyuan-xref : {0} référence(s) croisée(s) sont cassées (cible supprimée ou légende retirée) et sont marquées en rouge dans le document", "msg.noUndo": "siyuan-xref : rien à annuler",
        "msg.undoDone": "siyuan-xref : renumérotation {0} annulée ({1} modification(s){2}{3}), {4} étape(s) restante(s)", "msg.undoRebuilt": ", {0} bloc(s) supprimé(s) reconstruit(s)",
        "msg.undoMiss": ", {0} bloc(s) n'existent plus", "msg.noRedo": "siyuan-xref : rien à rétablir",
        "msg.redoDone": "siyuan-xref : rétabli, pile d'annulation {0} étape(s){1}", "msg.redoRebuilt": " ({0} bloc(s) reconstruit(s))",
        "msg.noArchive": "siyuan-xref : rien à restaurer (dead-fix-log.json est vide)", "msg.noDocDead": "siyuan-xref : aucune référence cassée enregistrée pour ce document",
        "msg.restored": "siyuan-xref : {0} référence(s) restaurée(s) dans {1} bloc(s){2}", "msg.restoreMiss": " ; {0} bloc(s) introuvable(s) ou cible déjà supprimée",
        "msg.readFail": "échec de lecture de siyuan-xref : {0}", "msg.insertFail": "échec de l'insertion : {0}",
        "picker.title": "Insérer une référence croisée", "picker.ph": "Rechercher par numéro ou légende · ↑↓ pour choisir · Entrée pour insérer · Échap pour fermer",
        "picker.empty": "Aucun résultat", "picker.all": "Tout",
        "picker.allSec": "Toutes les sections", "picker.secTip": "N'afficher que les figures / tableaux / équations sous un titre donné (sous-titres inclus)",
        "picker.secNone": "(sans titre)", "picker.noAnchor": "siyuan-xref : ce paragraphe est introuvable, rien n'a été inséré. Placez le curseur dans le paragraphe cible et réessayez",
        "picker.noSlash": "siyuan-xref : impossible de localiser l'emplacement de /xref, insertion annulée. Placez le curseur dans le paragraphe cible et réessayez",
    },
    es: {
        // Español（思源 es）
        "label.fig": "Fig.", "label.tab": "Tab.",
        "label.eq": "Ec.", "dead.text": "referencia rota",
        "slash.xref.text": "Referencia cruzada", "slash.xref.meta": "figura / tabla / ecuación",
        "slash.num.text": "Renumerar leyendas", "slash.num.meta": "actualizar también las referencias",
        "cmd.insert": "Insertar referencia cruzada", "cmd.renumber": "Renumerar leyendas",
        "cmd.undo": "Deshacer la última renumeración", "cmd.redo": "Rehacer la renumeración",
        "menu.setFig": "Establecer como leyenda de figura", "menu.setTab": "Establecer como leyenda de tabla",
        "menu.clear": "Quitar leyenda", "menu.add": "Añadir una leyenda de {1} {0}",
        "menu.useNext": "Usar el párrafo {0} como leyenda de {1}", "menu.ref": "Insertar referencia cruzada…",
        "menu.where.below": "debajo", "menu.where.above": "encima",
        "menu.word.fig": "figura", "menu.word.tab": "tabla",
        "noun.image": "imagen", "noun.table": "tabla",
        "hint.table": "Leyendas: no disponible dentro de una celda de tabla — haz clic derecho sobre la tabla o sobre la leyenda situada encima", "hint.mixed": "Leyendas: selecciona bloques del mismo tipo (párrafos, o una sola imagen / una sola tabla)",
        "hint.math": "Leyendas: los bloques de ecuación se numeran automáticamente, no necesitan leyenda", "hint.default": "Leyendas: haz clic derecho sobre la imagen / tabla, o sobre el párrafo de leyenda debajo de una figura (encima de una tabla)",
        "set.grp.single": "Documento único (general)",
        "set.grp.book": "Libro / multipágina (ámbito)",
        "set.grp.num": "Numeración",
        "set.grp.trigger": "Disparadores y referencias",
        "set.grp.look": "Aspecto de las leyendas",
        "set.grp.keys": "Atajos",
        "set.grp.adv": "Avanzado",
        "set.mode.title": "Modo de numeración", "set.mode.desc": "Continuo en todo el documento (Fig. 1, Fig. 2) o reiniciando en cada título de primer nivel (Fig. 1-1, Fig. 2-1)",
        "set.mode.continuous": "Continuo", "set.mode.chapter": "Por capítulo",
        "set.labels.title": "Etiquetas de figura / tabla / ecuación", "set.labels.desc": "Texto que se escribe delante de cada número, p. ej. Fig. / Tab. / Ec.",
        "set.refs.title": "Actualizar referencias al renumerar", "set.refs.desc": "Reescribe cada ((id de bloque \"ancla antigua\")) con el nuevo número. Desactívalo para cambiar solo los números y dejar las referencias intactas.",
        "set.auto.title": "Renumeración automática", "set.auto.desc": "Renumera y actualiza las referencias 1,5 s después de dejar de escribir. Nunca escribe en el bloque donde está el cursor, así que no interrumpe la escritura.",
        "set.dead.title": "Referencias rotas", "set.dead.desc": "Una referencia que apunta a un bloque eliminado, o a un bloque cuya leyenda se ha quitado. Por defecto «no hacer nada»: la referencia se queda como está y Ctrl+Alt+Z reconstruye el bloque eliminado con su ID original, con lo que la referencia vuelve a conectar. «Marcar en rojo» la pinta en rojo con tachado, lo que se confunde fácilmente con contenido dañado. «Convertir en texto» es irreversible y espera 10 s antes de actuar.",
        "set.dead.off": "No hacer nada (recomendado)", "set.dead.mark": "Marcar en rojo, mantener la referencia",
        "set.dead.text": "Convertir en texto rojo tachado (irreversible)", "set.center.title": "Centrar leyendas",
        "set.center.desc": "Centra cada párrafo de leyenda de figura / tabla al renumerar", "set.bg.title": "Fondo de la leyenda",
        "set.bg.desc": "Añade un fondo muy claro detrás de los párrafos de leyenda; sigue siendo legible en temas oscuros. Los fondos que hayas puesto tú mismo no se modifican.", "set.bg.none": "Ninguno",
        "set.bg.faint": "Muy claro", "set.bg.light": "Claro (predeterminado)",
        "set.bg.blue": "Azul pálido", "set.keys.title": "Atajos personalizados",
        "set.keys.desc": "Haz clic en un campo y pulsa la combinación que quieras (se requiere Ctrl / Alt / ⌘). Retroceso borra, Esc cancela. Los mismos atajos aparecen en Ajustes → Atajos → Complementos; funciona en cualquiera de los dos sitios.", "set.keys.insert": "Insertar referencia",
        "set.keys.renumber": "Renumerar", "set.keys.undo": "Deshacer la última renumeración",
        "set.keys.redo": "Rehacer", "set.keys.unset": "sin definir",
        "set.keys.press": "pulsa las teclas…", "set.keys.tip": "Haz clic y pulsa las teclas",
        "set.undo.title": "Profundidad de deshacer", "set.undo.desc": "Cuántas renumeraciones se pueden deshacer (1–50). El Ctrl+Z de SiYuan no puede deshacer lo que escribe el complemento, por eso este guarda su propia pila.",
        "set.restore.title": "Restaurar referencias rotas", "set.restore.desc": "Vuelve a convertir en ((id de bloque \"ancla\")) las referencias que antes se convirtieron en texto plano. Los bloques cuyo destino ya no existe se omiten.",
        "set.restore.btn": "Restaurar este documento", "set.restore.busy": "Restaurando…",
        "set.debug.title": "Registro de diagnóstico (solución de problemas)", "set.debug.desc": "Intercepta todas las peticiones de red y escribe ws-log.json / err-log.json. Actívalo solo mientras solucionas un problema: ralentiza SiYuan.",
        "msg.loadErr": "siyuan-xref no se pudo cargar: {0} (consulta data/storage/petal/siyuan-xref/err-log.json)", "msg.error": "error de siyuan-xref: {0}",
        "msg.noDoc": "siyuan-xref: no hay documento actual", "msg.busy": "siyuan-xref: la renumeración nunca terminó, no se hizo nada — inténtalo de nuevo",
        "msg.renumbering": "siyuan-xref: renumeración en curso, espera por favor", "msg.setDone": "Establecido como leyenda de {0}{1}",
        "msg.nBlocks": " ({0} bloques)", "msg.attrWritten": "siyuan-xref: atributo guardado, los números se añadirán en breve ({0})",
        "msg.addFail": "siyuan-xref: no se pudo insertar un párrafo de leyenda junto a la figura / tabla, inténtalo de nuevo", "msg.addPending": "siyuan-xref: párrafo de leyenda insertado, los números se añadirán en breve",
        "msg.addDone": "Leyenda de {1} añadida {0}{2} — ya puedes escribir la descripción", "msg.notIndexed": "siyuan-xref: este bloque aún no está indexado, inténtalo de nuevo",
        "msg.wrongSide": "siyuan-xref: la leyenda está en el otro lado, no {1} de la {0}. Haz clic derecho sobre ese párrafo de leyenda y elige «Quitar leyenda»", "msg.noNeighbor": "siyuan-xref: no hay ningún párrafo de leyenda justo {1} ({0}). Haz clic derecho sobre el propio párrafo de leyenda para quitarla",
        "msg.cancelled": "Leyenda quitada{0}{1}", "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "no había ningún número delante", "msg.cancel.names": "{0} nombre(s) de bloque borrado(s)",
        "msg.cancel.stuck": "no se pudieron quitar {0} número(s) del principio — borra ese prefijo a mano y vuelve a intentarlo", "msg.cancel.orphan": "{0} referencia(s) siguen mostrando el número antiguo",
        "msg.sep": ", ", "msg.settingsSaved": "siyuan-xref: ajustes guardados",
        "msg.noTargets": "siyuan-xref: no se encontraron figuras, tablas ni ecuaciones en este documento", "msg.emptyEq": "siyuan-xref: {0} bloque(s) de ecuación están vacíos (solo queda \\tag) — comprueba si se perdió la fórmula",
        "msg.renumbered": "siyuan-xref: {0} leyenda(s) renumerada(s), {1} referencia(s) actualizada(s)", "msg.burned": ", {0} referencia(s) rota(s) convertida(s) en texto rojo tachado",
        "msg.deadGrace": ", {0} referencia(s) rota(s) encontrada(s) (se convierten a texto solo tras {1} s)", "msg.deadFound": ", {0} referencia(s) rota(s) encontrada(s)",
        "msg.deadPainted": "siyuan-xref: {0} referencia(s) cruzada(s) están rotas (destino eliminado o leyenda quitada) y se han marcado en rojo en el documento", "msg.noUndo": "siyuan-xref: no hay nada que deshacer",
        "msg.undoDone": "siyuan-xref: deshecha la renumeración {0} ({1} cambio(s){2}{3}), quedan {4} paso(s)", "msg.undoRebuilt": ", se reconstruyeron {0} bloque(s) eliminado(s)",
        "msg.undoMiss": ", {0} bloque(s) ya no existen", "msg.noRedo": "siyuan-xref: no hay nada que rehacer",
        "msg.redoDone": "siyuan-xref: rehecho, pila de deshacer {0} paso(s){1}", "msg.redoRebuilt": " ({0} bloque(s) reconstruido(s))",
        "msg.noArchive": "siyuan-xref: no hay nada que restaurar (dead-fix-log.json está vacío)", "msg.noDocDead": "siyuan-xref: no hay referencias rotas registradas para este documento",
        "msg.restored": "siyuan-xref: restauradas {0} referencia(s) en {1} bloque(s){2}", "msg.restoreMiss": "; {0} bloque(s) no encontrados o destino ya eliminado",
        "msg.readFail": "error de lectura de siyuan-xref: {0}", "msg.insertFail": "error al insertar: {0}",
        "picker.title": "Insertar referencia cruzada", "picker.ph": "Busca por número o leyenda · ↑↓ para elegir · Intro para insertar · Esc para cerrar",
        "picker.empty": "Sin resultados", "picker.all": "Todo",
        "picker.allSec": "Todas las secciones", "picker.secTip": "Mostrar solo las figuras / tablas / ecuaciones bajo un título (incluidos los subtítulos)",
        "picker.secNone": "(sin título)", "picker.noAnchor": "siyuan-xref: no se encuentra este párrafo, no se insertó nada. Coloca el cursor en el párrafo de destino y vuelve a intentarlo",
        "picker.noSlash": "siyuan-xref: no se encuentra dónde se escribió /xref, inserción cancelada. Coloca el cursor en el párrafo de destino y vuelve a intentarlo",
    },
    ru: {
        // Русский（思源 ru）
        "label.fig": "Рис.", "label.tab": "Табл.",
        "label.eq": "Форм.", "dead.text": "битая ссылка",
        "slash.xref.text": "Перекрёстная ссылка", "slash.xref.meta": "рисунок / таблица / формула",
        "slash.num.text": "Перенумеровать подписи", "slash.num.meta": "обновить и ссылки",
        "cmd.insert": "Вставить перекрёстную ссылку", "cmd.renumber": "Перенумеровать подписи",
        "cmd.undo": "Отменить последнюю нумерацию", "cmd.redo": "Повторить нумерацию",
        "menu.setFig": "Сделать подписью рисунка", "menu.setTab": "Сделать подписью таблицы",
        "menu.clear": "Убрать подпись", "menu.add": "Добавить подпись {1} {0}",
        "menu.useNext": "Использовать абзац {0} как подпись {1}", "menu.ref": "Вставить перекрёстную ссылку…",
        "menu.where.below": "ниже", "menu.where.above": "выше",
        "menu.word.fig": "рисунка", "menu.word.tab": "таблицы",
        "noun.image": "изображения", "noun.table": "таблицы",
        "hint.table": "Подписи: внутри ячейки таблицы недоступно — щёлкните правой кнопкой по самой таблице или по подписи над ней", "hint.mixed": "Подписи: выберите блоки одного типа (абзацы или одно изображение / одну таблицу)",
        "hint.math": "Подписи: блоки формул нумеруются автоматически, подпись не нужна", "hint.default": "Подписи: щёлкните правой кнопкой по изображению / таблице или по абзацу подписи под рисунком (над таблицей)",
        "set.grp.single": "Один документ (общие)",
        "set.grp.book": "Книга / несколько документов (диапазон)",
        "set.grp.num": "Нумерация",
        "set.grp.trigger": "Триггеры и ссылки",
        "set.grp.look": "Вид подписей",
        "set.grp.keys": "Горячие клавиши",
        "set.grp.adv": "Дополнительно",
        "set.mode.title": "Режим нумерации", "set.mode.desc": "Сквозная по всему документу (Рис. 1, Рис. 2) или с нового раздела на каждом заголовке первого уровня (Рис. 1-1, Рис. 2-1)",
        "set.mode.continuous": "Сквозная", "set.mode.chapter": "По разделам",
        "set.labels.title": "Метки рисунка / таблицы / формулы", "set.labels.desc": "Текст перед номером, например Рис. / Табл. / Форм.",
        "set.refs.title": "Обновлять ссылки при перенумерации", "set.refs.desc": "Переписывает каждую ((ID блока \"старый якорь\")) на новый номер. Выключите, чтобы менять только номера и не трогать ссылки.",
        "set.auto.title": "Автоматическая перенумерация", "set.auto.desc": "Перенумеровывает и обновляет ссылки через 1,5 с после остановки ввода. Блок с курсором никогда не изменяется, поэтому ввод не прерывается.",
        "set.dead.title": "Битые ссылки", "set.dead.desc": "Ссылка на удалённый блок или на блок, у которого убрана подпись. По умолчанию «не трогать»: ссылка остаётся как есть, а Ctrl+Alt+Z восстанавливает удалённый блок с прежним ID, и ссылка снова работает. «Только пометить красным» рисует красный зачёркнутый текст, что легко принять за повреждение содержимого. «Превратить в текст» необратимо и ждёт 10 с перед выполнением.",
        "set.dead.off": "Не трогать (рекомендуется)", "set.dead.mark": "Пометить красным, ссылку сохранить",
        "set.dead.text": "Превратить в красный зачёркнутый текст (необратимо)", "set.center.title": "Выравнивать подписи по центру",
        "set.center.desc": "При перенумерации выравнивает абзацы подписей рисунков и таблиц по центру", "set.bg.title": "Фон подписи",
        "set.bg.desc": "Добавляет очень светлый фон под абзацы подписей; читается и в тёмных темах. Свой фон, заданный вручную, не меняется.", "set.bg.none": "Нет",
        "set.bg.faint": "Очень светлый", "set.bg.light": "Светлый (по умолчанию)",
        "set.bg.blue": "Бледно-голубой", "set.keys.title": "Свои сочетания клавиш",
        "set.keys.desc": "Щёлкните по полю и нажмите нужное сочетание (обязательно с Ctrl / Alt / ⌘). Backspace очищает, Esc отменяет. Эти же сочетания есть в Настройки → Сочетания клавиш → Плагины; менять можно в любом месте.", "set.keys.insert": "Вставить ссылку",
        "set.keys.renumber": "Перенумеровать", "set.keys.undo": "Отменить последнюю нумерацию",
        "set.keys.redo": "Повторить", "set.keys.unset": "не задано",
        "set.keys.press": "нажмите сочетание…", "set.keys.tip": "Щёлкните и нажмите сочетание",
        "set.undo.title": "Глубина отмены", "set.undo.desc": "Сколько прогонов нумерации можно отменить (1–50). Ctrl+Z в SiYuan не отменяет записи плагина, поэтому он ведёт свой стек.",
        "set.restore.title": "Восстановить битые ссылки", "set.restore.desc": "Превращает ссылки, ранее превращённые в обычный текст, обратно в ((ID блока \"якорь\")). Блоки, чья цель уже удалена, пропускаются.",
        "set.restore.btn": "Восстановить этот документ", "set.restore.busy": "Восстановление…",
        "set.debug.title": "Журнал диагностики (для поиска проблем)", "set.debug.desc": "Перехватывает все сетевые запросы и пишет ws-log.json / err-log.json. Включайте только для поиска проблем — это замедляет SiYuan.",
        "msg.loadErr": "siyuan-xref не удалось загрузить: {0} (см. data/storage/petal/siyuan-xref/err-log.json)", "msg.error": "ошибка siyuan-xref: {0}",
        "msg.noDoc": "siyuan-xref: нет текущего документа", "msg.busy": "siyuan-xref: нумерация так и не завершилась, ничего не выполнено — попробуйте ещё раз",
        "msg.renumbering": "siyuan-xref: идёт перенумерация, подождите", "msg.setDone": "Подпись {0} установлена{1}",
        "msg.nBlocks": " ({0} шт.)", "msg.attrWritten": "siyuan-xref: атрибут записан, номера появятся чуть позже ({0})",
        "msg.addFail": "siyuan-xref: не удалось вставить абзац подписи рядом с рисунком / таблицей, попробуйте ещё раз", "msg.addPending": "siyuan-xref: абзац подписи вставлен, номера появятся чуть позже",
        "msg.addDone": "Подпись {1} добавлена {0}{2} — можно сразу писать описание", "msg.notIndexed": "siyuan-xref: этот блок ещё не проиндексирован, попробуйте позже",
        "msg.wrongSide": "siyuan-xref: подпись находится с другой стороны, не {1} {0}. Щёлкните правой кнопкой по этому абзацу подписи и выберите «Убрать подпись»", "msg.noNeighbor": "siyuan-xref: рядом с {0} ({1}) нет абзаца подписи. Щёлкните правой кнопкой по самому абзацу подписи, чтобы убрать её",
        "msg.cancelled": "Подпись убрана{0}{1}", "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "номера в начале не было", "msg.cancel.names": "Очищено названий блоков: {0}",
        "msg.cancel.stuck": "Не удалось убрать номера в начале: {0} — удалите этот префикс вручную и повторите", "msg.cancel.orphan": "Ещё {0} ссылок показывают старый номер",
        "msg.sep": ", ", "msg.settingsSaved": "siyuan-xref: настройки сохранены",
        "msg.noTargets": "siyuan-xref: в этом документе не найдено рисунков, таблиц или формул", "msg.emptyEq": "siyuan-xref: {0} блок(ов) формул пусты (остался только \\tag) — проверьте, не потерялась ли формула",
        "msg.renumbered": "siyuan-xref: перенумеровано подписей: {0}, обновлено ссылок: {1}", "msg.burned": ", {0} битых ссылок превращено в красный зачёркнутый текст",
        "msg.deadGrace": ", найдено битых ссылок: {0} (в текст превращаются только через {1} с)", "msg.deadFound": ", найдено битых ссылок: {0}",
        "msg.deadPainted": "siyuan-xref: {0} перекрёстных ссылок битые (цель удалена или подпись убрана) и помечены красным в документе", "msg.noUndo": "siyuan-xref: нечего отменять",
        "msg.undoDone": "siyuan-xref: отменён прогон нумерации {0} (изменений: {1}{2}{3}), осталось шагов: {4}", "msg.undoRebuilt": ", восстановлено удалённых блоков: {0}",
        "msg.undoMiss": ", блоков больше не существует: {0}", "msg.noRedo": "siyuan-xref: нечего повторять",
        "msg.redoDone": "siyuan-xref: повторено, стек отмены: {0} шаг(ов){1}", "msg.redoRebuilt": " (восстановлено блоков: {0})",
        "msg.noArchive": "siyuan-xref: нечего восстанавливать (dead-fix-log.json пуст)", "msg.noDocDead": "siyuan-xref: для этого документа нет записей о битых ссылках",
        "msg.restored": "siyuan-xref: восстановлено ссылок: {0} (в {1} блоках){2}", "msg.restoreMiss": "; не найдено блоков или цель уже удалена: {0}",
        "msg.readFail": "siyuan-xref: ошибка чтения: {0}", "msg.insertFail": "Ошибка вставки: {0}",
        "picker.title": "Вставить перекрёстную ссылку", "picker.ph": "Поиск по номеру или подписи · ↑↓ — выбор · Enter — вставить · Esc — закрыть",
        "picker.empty": "Нет совпадений", "picker.all": "Все",
        "picker.allSec": "Все разделы", "picker.secTip": "Показывать только рисунки / таблицы / формулы под одним заголовком (включая подзаголовки)",
        "picker.secNone": "(без заголовка)", "picker.noAnchor": "siyuan-xref: не удалось найти этот абзац, ничего не вставлено. Поставьте курсор в нужный абзац и повторите",
        "picker.noSlash": "siyuan-xref: не удалось найти место ввода /xref, вставка отменена. Поставьте курсор в нужный абзац и повторите",
    },
    ptBR: {
        // Português do Brasil（思源 pt-BR）
        "label.fig": "Fig.", "label.tab": "Tab.",
        "label.eq": "Eq.", "dead.text": "referência quebrada",
        "slash.xref.text": "Referência cruzada", "slash.xref.meta": "figura / tabela / equação",
        "slash.num.text": "Renumerar legendas", "slash.num.meta": "atualizar também as referências",
        "cmd.insert": "Inserir referência cruzada", "cmd.renumber": "Renumerar legendas",
        "cmd.undo": "Desfazer a última renumeração", "cmd.redo": "Refazer a renumeração",
        "menu.setFig": "Definir como legenda de figura", "menu.setTab": "Definir como legenda de tabela",
        "menu.clear": "Remover legenda", "menu.add": "Adicionar uma legenda de {1} {0}",
        "menu.useNext": "Usar o parágrafo {0} como legenda de {1}", "menu.ref": "Inserir referência cruzada…",
        "menu.where.below": "abaixo", "menu.where.above": "acima",
        "menu.word.fig": "figura", "menu.word.tab": "tabela",
        "noun.image": "imagem", "noun.table": "tabela",
        "hint.table": "Legendas: não disponível dentro de uma célula de tabela — clique com o botão direito na própria tabela ou na legenda acima dela", "hint.mixed": "Legendas: selecione blocos do mesmo tipo (parágrafos, ou uma única imagem / uma única tabela)",
        "hint.math": "Legendas: blocos de equação são numerados automaticamente, não precisam de legenda", "hint.default": "Legendas: clique com o botão direito na imagem / tabela, ou no parágrafo de legenda abaixo de uma figura (acima de uma tabela)",
        "set.grp.single": "Documento único (geral)",
        "set.grp.book": "Livro / vários documentos (escopo)",
        "set.grp.num": "Numeração",
        "set.grp.trigger": "Gatilhos e referências",
        "set.grp.look": "Aparência das legendas",
        "set.grp.keys": "Atalhos",
        "set.grp.adv": "Avançado",
        "set.mode.title": "Modo de numeração", "set.mode.desc": "Contínuo no documento inteiro (Fig. 1, Fig. 2) ou reiniciando a cada título de primeiro nível (Fig. 1-1, Fig. 2-1)",
        "set.mode.continuous": "Contínuo", "set.mode.chapter": "Por capítulo",
        "set.labels.title": "Rótulos de figura / tabela / equação", "set.labels.desc": "Texto colocado antes de cada número, por exemplo Fig. / Tab. / Eq.",
        "set.refs.title": "Atualizar referências ao renumerar", "set.refs.desc": "Reescreve cada ((id do bloco \"âncora antiga\")) com o novo número. Desative para mudar apenas os números e deixar as referências intactas.",
        "set.auto.title": "Renumeração automática", "set.auto.desc": "Renumera e atualiza as referências 1,5 s depois de parar de digitar. Nunca grava no bloco em que está o cursor, então a digitação não é interrompida.",
        "set.dead.title": "Referências quebradas", "set.dead.desc": "Uma referência que aponta para um bloco excluído ou para um bloco cuja legenda foi removida. O padrão \"não fazer nada\": a referência fica como está e Ctrl+Alt+Z reconstrói o bloco excluído com o ID original, religando a referência. \"Marcar em vermelho\" pinta de vermelho com tachado, o que é fácil de confundir com conteúdo danificado. \"Converter em texto\" é irreversível e espera 10 s antes de agir.",
        "set.dead.off": "Não fazer nada (recomendado)", "set.dead.mark": "Marcar em vermelho, manter a referência",
        "set.dead.text": "Converter em texto vermelho tachado (irreversível)", "set.center.title": "Centralizar legendas",
        "set.center.desc": "Centraliza cada parágrafo de legenda de figura / tabela ao renumerar", "set.bg.title": "Fundo da legenda",
        "set.bg.desc": "Adiciona um fundo bem claro atrás dos parágrafos de legenda; continua legível em temas escuros. Fundos que você mesmo definiu não são alterados.", "set.bg.none": "Nenhum",
        "set.bg.faint": "Muito claro", "set.bg.light": "Claro (padrão)",
        "set.bg.blue": "Azul-claro", "set.keys.title": "Atalhos personalizados",
        "set.keys.desc": "Clique em um campo e pressione a combinação desejada (Ctrl / Alt / ⌘ obrigatório). Backspace limpa, Esc cancela. Os mesmos atalhos aparecem em Configurações → Atalhos → Plugins; dá para alterar nos dois lugares.", "set.keys.insert": "Inserir referência",
        "set.keys.renumber": "Renumerar", "set.keys.undo": "Desfazer a última renumeração",
        "set.keys.redo": "Refazer", "set.keys.unset": "não definido",
        "set.keys.press": "pressione as teclas…", "set.keys.tip": "Clique e pressione as teclas",
        "set.undo.title": "Profundidade de desfazer", "set.undo.desc": "Quantas renumerações podem ser desfeitas (1–50). O Ctrl+Z do SiYuan não desfaz o que o plugin grava, por isso ele mantém a própria pilha.",
        "set.restore.title": "Restaurar referências quebradas", "set.restore.desc": "Converte de volta em ((id do bloco \"âncora\")) as referências que foram transformadas em texto puro. Blocos cujo destino não existe mais são ignorados.",
        "set.restore.btn": "Restaurar este documento", "set.restore.busy": "Restaurando…",
        "set.debug.title": "Registro de diagnóstico (solução de problemas)", "set.debug.desc": "Intercepta todas as requisições de rede e grava ws-log.json / err-log.json. Ative só durante a investigação de problemas — deixa o SiYuan mais lento.",
        "msg.loadErr": "falha ao carregar o siyuan-xref: {0} (veja data/storage/petal/siyuan-xref/err-log.json)", "msg.error": "erro do siyuan-xref: {0}",
        "msg.noDoc": "siyuan-xref: nenhum documento atual", "msg.busy": "siyuan-xref: a renumeração nunca terminou, nada foi feito — tente novamente",
        "msg.renumbering": "siyuan-xref: renumeração em andamento, aguarde", "msg.setDone": "Definido como legenda de {0}{1}",
        "msg.nBlocks": " ({0} blocos)", "msg.attrWritten": "siyuan-xref: atributo salvo, os números virão em seguida ({0})",
        "msg.addFail": "siyuan-xref: não foi possível inserir um parágrafo de legenda ao lado da figura / tabela, tente novamente", "msg.addPending": "siyuan-xref: parágrafo de legenda inserido, os números virão em seguida",
        "msg.addDone": "Legenda de {1} adicionada {0}{2} — você já pode escrever a descrição", "msg.notIndexed": "siyuan-xref: este bloco ainda não está indexado, tente novamente",
        "msg.wrongSide": "siyuan-xref: a legenda está do outro lado, não {1} da {0}. Clique com o botão direito nesse parágrafo de legenda e escolha \"Remover legenda\"", "msg.noNeighbor": "siyuan-xref: nenhum parágrafo de legenda logo {1} ({0}). Clique com o botão direito no próprio parágrafo de legenda para removê-la",
        "msg.cancelled": "Legenda removida{0}{1}", "msg.cancelWrap": " ({0})",
        "msg.cancel.none": "não havia número no início", "msg.cancel.names": "{0} nome(s) de bloco apagado(s)",
        "msg.cancel.stuck": "não foi possível remover {0} número(s) do início — apague esse prefixo à mão e tente novamente", "msg.cancel.orphan": "{0} referência(s) ainda mostram o número antigo",
        "msg.sep": ", ", "msg.settingsSaved": "siyuan-xref: configurações salvas",
        "msg.noTargets": "siyuan-xref: nenhuma figura, tabela ou equação encontrada neste documento", "msg.emptyEq": "siyuan-xref: {0} bloco(s) de equação estão vazios (só sobrou \\tag) — verifique se a fórmula foi perdida",
        "msg.renumbered": "siyuan-xref: {0} legenda(s) renumerada(s), {1} referência(s) atualizada(s)", "msg.burned": ", {0} referência(s) quebrada(s) convertida(s) em texto vermelho tachado",
        "msg.deadGrace": ", {0} referência(s) quebrada(s) encontrada(s) (convertidas em texto só após {1} s)", "msg.deadFound": ", {0} referência(s) quebrada(s) encontrada(s)",
        "msg.deadPainted": "siyuan-xref: {0} referência(s) cruzada(s) estão quebradas (destino excluído ou legenda removida) e foram marcadas em vermelho no documento", "msg.noUndo": "siyuan-xref: nada para desfazer",
        "msg.undoDone": "siyuan-xref: renumeração {0} desfeita ({1} alteração(ões){2}{3}), restam {4} passo(s)", "msg.undoRebuilt": ", {0} bloco(s) excluído(s) reconstruído(s)",
        "msg.undoMiss": ", {0} bloco(s) não existem mais", "msg.noRedo": "siyuan-xref: nada para refazer",
        "msg.redoDone": "siyuan-xref: refeito, pilha de desfazer {0} passo(s){1}", "msg.redoRebuilt": " ({0} bloco(s) reconstruído(s))",
        "msg.noArchive": "siyuan-xref: nada para restaurar (dead-fix-log.json está vazio)", "msg.noDocDead": "siyuan-xref: não há referências quebradas registradas para este documento",
        "msg.restored": "siyuan-xref: {0} referência(s) restaurada(s) em {1} bloco(s){2}", "msg.restoreMiss": "; {0} bloco(s) não encontrados ou destino já excluído",
        "msg.readFail": "falha de leitura do siyuan-xref: {0}", "msg.insertFail": "falha na inserção: {0}",
        "picker.title": "Inserir referência cruzada", "picker.ph": "Busque por número ou legenda · ↑↓ para escolher · Enter para inserir · Esc para fechar",
        "picker.empty": "Nenhum resultado", "picker.all": "Tudo",
        "picker.allSec": "Todas as seções", "picker.secTip": "Mostrar apenas as figuras / tabelas / equações sob um título (incluindo subtítulos)",
        "picker.secNone": "(sem título)", "picker.noAnchor": "siyuan-xref: não foi possível localizar este parágrafo, nada foi inserido. Coloque o cursor no parágrafo de destino e tente novamente",
        "picker.noSlash": "siyuan-xref: não foi possível localizar onde /xref foi digitado, inserção cancelada. Coloque o cursor no parágrafo de destino e tente novamente",
    },
};

/** 思源 lang → 内部代号。键统一小写、下划线换成连字符后再查（zh_CN / zh-CN 都能命中） */
const LANG_MAP = {
    "zh-cn": "zh", "zh-tw": "zhTW", "zh-hk": "zhTW", "zh-hant": "zhTW", "zh-cht": "zhTW",
    zh: "zh",                                        // 任何 zh-* 兜不住的一律简体，别掉到英文
    en: "en",
    ja: "ja", ko: "ko",
    de: "de", fr: "fr", es: "es", ru: "ru", "pt-br": "ptBR", pt: "ptBR",
};

/** 当前界面语言：zh | zhTW | en | ja | ko | de | fr | es | ru | ptBR。由 setUiLang 在 boot 时按思源语言设定 */
let UI_LANG = "zh";

function detectUiLang() {
    try {
        if (typeof window === "undefined") return "zh";   // 离线测试：保持中文，旧断言不受影响
        const raw = String((window.siyuan && window.siyuan.config && window.siyuan.config.lang) || "");
        if (!raw) return "zh";
        const l = raw.replace(/_/g, "-").toLowerCase();
        if (LANG_MAP[l]) return LANG_MAP[l];
        const base = l.split("-")[0];                    // es-ES → es，pt-PT → pt
        if (LANG_MAP[base]) return LANG_MAP[base];
        return "en";                                     // 其余 12 种语种退英文
    } catch (e) { return "zh"; }
}

function setUiLang(v) {
    UI_LANG = UI_TEXT[v] ? v : "zh";                     // 只认 UI_TEXT 里真有的块，传错不炸
    return UI_LANG;
}

/** 取界面文案，{0} {1} 依次代入参数；缺 key 时按语言回退，最后退回 key 本身 */
function tr(key) {
    let s = (UI_TEXT[UI_LANG] || UI_TEXT.zh)[key];
    if (s === undefined) {
        // 中文系（zh / zhTW）缺 key 退简体；其余语种退英文——别让德语用户看到中文
        s = (UI_LANG === "zh" || UI_LANG === "zhTW") ? UI_TEXT.zh[key] : UI_TEXT.en[key];
    }
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

    /* v1.1.0 多文档范围重排。默认全关：不启用时本插件行为与 1.0.11 逐字节一致。
     * 范围来源可切（docnum=跟随子文档编号插件 / custom=本插件自己的 targets+excluded）；
     * 编号口径可切（continuous 全书连号 / bydoc 按文档前缀）；引用只刷范围内。 */
    scopeEnabled: false,
    scopeSource: "docnum",
    scopeMode: "continuous",
    scopeAutoEvents: true,
    scopeTargets: [],
    scopeExcluded: [],
    /* v1.1.8：交叉引用窗口按当前第 N 级章节自动收窄（层级由 scopePrefixLevel 决定）。
     * 只收窄窗口列表，不改范围重排的范围；关掉则列出全范围题注。 */
    scopePickerAuto: true,
    scopeConcurrency: 20,
    scopeMaxDocs: 500,
    /* v1.1.6：bydoc 前缀取 rootNum 的第几级（1-based）；0 = 整条链。
     * 用户口径：rootNum "2.1.2.3" 取第 2 级 → "1" → 图 1-1。 */
    scopePrefixLevel: 2,
    /* v1.2.0：按编号插件范围配置覆盖层级。键 = targets[].id（即 meta.targetId），
     * 值 = 该范围取第几级；未列出的范围用 scopePrefixLevel。 */
    scopePrefixLevelByTarget: {},
    /* v1.2.9：插入面板红框内三个筛选控件的状态，跨次打开保留。
     * pickerLevel=-1 表示「没存过，走默认」；0 是合法值（跨所有笔记本）。
     * 搜索框不存（红框外）：每次打开都该是空的，免得上次搜的词挡住列表。 */
    pickerType: "",
    pickerLevel: -1,
    pickerSec: "",
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

/* v1.2.13 加速：applyPlan 期间把逐块写入排队，最后一次批量提交。
   getBlockDOM 命中「已排队」的块时返回目标 DOM，保证撤销记账拿到写入后的值。 */
let XR_BATCH = null;

async function flushBlockBatch(batch) {
    if (!batch || !batch.blocks.length) return;
    const saved = XR_BATCH;
    XR_BATCH = null;                       // 防回退写入被自己再次拦截
    try {
        try {
            await retry(() => api("/api/block/batchUpdateBlock", { blocks: batch.blocks }));
            return;
        } catch (e) { await logErr("batchUpdateBlock", e); }
        // 批量失败自动回退逐条，保证最终一致
        for (const b of batch.blocks) {
            try { await retry(() => api("/api/block/updateBlock",
                { id: b.id, dataType: b.dataType, data: b.data })); }
            catch (e) { await logErr("batchUpdateBlock/fallback", e); }
        }
    } finally { XR_BATCH = saved; }
}

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
    if (XR_BATCH) {
        if (path === "/api/block/updateBlock") {
            XR_BATCH.blocks.push({ id: pl.id, dataType: pl.dataType, data: pl.data });
            XR_BATCH.pending.set(pl.id, pl.data);
            callNote(path + "[queued]", { id: pl.id });
            return null;
        }
        if (path === "/api/block/getBlockDOM") {
            if (XR_BATCH.pending.has(pl.id)) return { dom: XR_BATCH.pending.get(pl.id) };
            if (XR_BATCH.doms && XR_BATCH.doms[pl.id] !== undefined)
                return { dom: XR_BATCH.doms[pl.id] };
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

/** 批量核实存活：一次 checkBlocksExist；接口异常时回退原来的逐个实时判据。 */
async function aliveMap(ids) {
    const out = {};
    if (!ids || !ids.length) return out;
    try {
        const r = await api("/api/block/checkBlocksExist", { ids: ids });
        if (r && typeof r === "object") {
            ids.forEach((id) => { out[id] = (r[id] === true) ? true : (r[id] === false ? false : null); });
            return out;
        }
    } catch (e) { await logErr("aliveMap/batch", e); }
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

/* ==================== 题注前缀词表（10 种界面语言） ====================
 * 只用于「段首 + 标签 + 空格 + 数字」这种形态，所以不会碰正文里的普通句子。
 * 长词必须排在短词前面（Figure 先于 Fig、Abbildung 先于 Abb），否则只匹配到前半截。
 * 词表里不带末尾的点号 —— 正则统一用 \.? 兜住 Fig. / Abb. / Рис. / Табл.
 * 用户设置里自定义的标签（figLabel 等）另走 captionLabelList，不在此表。
 */
const FIG_WORDS = ["Figure", "figure", "Abbildung", "abbildung", "Рисунок", "рисунок",
    "Figura", "figura", "图", "圖", "図", "그림", "Fig", "fig", "Abb", "abb", "Рис", "рис", "Img", "img"];
const TAB_WORDS = ["Table", "table", "Tabelle", "tabelle", "Таблица", "таблица",
    "Tableau", "tableau", "Tabla", "tabla", "Tabela", "tabela", "表", "표",
    "Tab", "tab", "Табл", "табл", "Tbl", "tbl"];
const EQ_WORDS = ["Equation", "equation", "Gleichung", "gleichung", "Формула", "формула",
    "Ecuación", "ecuación", "Equação", "equação", "式", "식",
    "Eq", "eq", "Gl", "gl", "Éq", "Éq", "Ec", "ec", "Форм", "форм"];

const FIG_SET = new Set(FIG_WORDS);
const TAB_SET = new Set(TAB_WORDS);
const EQ_SET = new Set(EQ_WORDS);

/** 正则转义（别和 HTML 转义的 esc 混用） */
const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 段首编号前缀。式子不参与（公式块按 type==="m" 判，段首写「式 1」不该被当题注） */
const NUM_HEAD = new RegExp(
    "^\\s*(" + FIG_WORDS.concat(TAB_WORDS).map(escRe).join("|") + ")\\.?\\s*(\\d+(?:[-.]\\d+)*)\\s*");

/** 前缀词 → fig / tab；不在表里返回 null */
function prefixKind(word) {
    if (FIG_SET.has(word)) return "fig";
    if (TAB_SET.has(word)) return "tab";
    return null;
}

/** 归类：只认 custom-xref 属性与公式块（m）。
 *  v1.2.2 起不再按正文前缀「图 3 …」猜题注（原「文字自动识别」功能已删除）。 */
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
    return null;   // v1.2.2：只认属性 / 公式块，不再按正文前缀猜测
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
        if (q && (x.name + " " + (x.oldMd || "") + " " + (x.docTitle || "")).toLowerCase().indexOf(q) < 0) return false;
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
        /* v1.1.4：范围功能开启且本文档有章节号时，单文档轮也用章节号前缀；
         * v1.1.6：层级不够时 __scopeNoPrefix，只留连续序号。 */
        const seq = s.__scopeNoPrefix
            ? String(counters[kind])
            : (s.__scopePrefix
                ? s.__scopePrefix + "-" + counters[kind]
                : (s.mode === "chapter" ? chapter + "-" + counters[kind] : String(counters[kind])));
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

/* ==================== v1.1.0 多文档范围重排 ====================
 * ① 现有 renumber()/buildPlan() 一行不改，单文档自动重排行为与 1.0.11 完全一致；
 * ② 范围轮只在 scopeEnabled=true 时被显式命令或结构事件触发；
 * ③ 任一文档采集失败 → 整批抛错、一个字都不写（避免半本新号半本旧号）；
 * ④ 引用只刷范围内：anchor 只收范围内题注，引用块只取范围内文档；
 * ⑤ 静态引用恒为 ((id "锚文本"))，插入 DOM 恒为 data-subtype="s"。
 */

const XR_REF_RE = /\(\((\d{14}-[0-9a-z]{7})\s+(["'])(.*?)\2\)\)/g;
const XR_SCOPE_CMDS = {
    create: 1, removeDoc: 1, removeDocByID: 1, rename: 1,
    filetreeSortChanged: 1, moveDoc: 1, moveDocs: 1, refreshFiletree: 1,
};

/** 有上限并发；结果按输入下标归位，顺序不依赖响应先后。 */
async function xrMapLimit(items, limit, worker) {
    const out = new Array(items.length);
    let cursor = 0;
    const n = Math.max(1, Math.min(limit || 1, items.length || 1));
    async function runner() {
        for (;;) {
            const i = cursor++;
            if (i >= items.length) return;
            out[i] = await worker(items[i], i);
        }
    }
    const runners = [];
    for (let i = 0; i < n; i++) runners.push(runner());
    await Promise.all(runners);
    return out;
}

/** 纯函数：范围来源解析。docnum 优先；编号插件不在时降级到 custom 并标记 degraded。 */
function xrScopeResolve(settings, dnCfg) {
    const s = settings || {};
    const custom = () => ({
        source: "custom",
        targets: Array.isArray(s.scopeTargets) ? s.scopeTargets : [],
        excluded: Array.isArray(s.scopeExcluded) ? s.scopeExcluded : [],
        degraded: false,
    });
    if (s.scopeSource === "custom") return custom();
    if (dnCfg && Array.isArray(dnCfg.targets)) {
        return {
            source: "docnum",
            targets: dnCfg.targets,
            excluded: Array.isArray(dnCfg.excluded) ? dnCfg.excluded : [],
            degraded: false,
        };
    }
    const c = custom();
    c.degraded = true;
    return c;
}

/** 纯函数 v1.2.5：窗口默认收窄层级 = 编号前缀层级 - 1。
 *  编号按第 n 级显示，引用范围按第 n-1 级父链，同父级下的兄弟章节即可互相引用。
 *  n<=0（完整链）时仍为 0 = 不收窄。 */
function xrPickerLevel(level) {
    const n = Number(level) || 0;
    return n <= 0 ? 0 : Math.max(1, n - 1);
}
function xrPickerOverrides(overrides) {
    const out = {};
    Object.keys(overrides || {}).forEach((k) => { out[k] = xrPickerLevel(overrides[k]); });
    return out;
}

/** 纯函数 v1.2.0：该文档用第几级 —— 按 meta.targetId 查覆盖表，没有则用全局层级。 */
function xrLevelForDoc(doc, globalLevel, overrides) {
    const m = doc && doc.meta;
    const tid = m && m.targetId;
    if (tid && overrides && Object.prototype.hasOwnProperty.call(overrides, String(tid))) {
        const v = Number(overrides[String(tid)]);
        if (Number.isFinite(v) && v >= 0) return Math.floor(v);
    }
    const g = Number(globalLevel);
    return Number.isFinite(g) && g >= 0 ? Math.floor(g) : 0;
}

/** 纯函数：取 rootNum 的前 N 级链（当前第 N 级文档）。
 *  level<=0 / 数据无效 / 层级不够 → 空串 = 不收窄。 */
function xrLevelChain(rootNum, level) {
    const s = String(rootNum || "");
    const n = Number(level) || 0;
    if (n <= 0 || !/^\d+(?:\.\d+)*$/.test(s)) return "";
    const parts = s.split(".");
    if (parts.length < n) return "";
    return parts.slice(0, n).join(".");
}

/** 纯函数：章节范围键 = rootID | 前 N 级链（v1.1.9）。
 *  不同范围根（笔记本 / 顶级文档）的编号各自从 1 开始，只比链会把两棵树的
 *  `1.2.3` 混成同一章节，窗口因此混入别的章节的题注。 */
function xrChainKeyFromMeta(meta, level) {
    const chain = xrLevelChain(meta && meta.rootNum, level);
    if (!chain) return "";
    return String((meta && meta.rootID) || "") + "|" + chain;
}
function xrDocChainKey(doc, level) {
    return xrChainKeyFromMeta(doc && doc.meta, level);
}

/** 纯函数：只保留属于同一第 N 级链、且同一范围根的文档（该级文档自身 + 全部后代）。
 *  key 由 xrChainKeyFromMeta 生成；为空 = 不收窄。 */
function xrDocsInChain(docs, key, level, overrides) {
    if (!key) return (docs || []).slice();
    return (docs || []).filter((d) =>
        xrDocChainKey(d, xrLevelForDoc(d, level, overrides)) === key);
}

/** v1.2.8：窗口「范围层级」过滤。
 *  文档属性 custom-doc-num-meta 已带 rootID / rootNum / targetId，
 *  范围键 = rootID | rootNum 前 L 段；不同范围根（笔记本 / top 目录）天然隔离。
 *  curKey 为空（当前文档无编号、或层级不够）→ 返回空数组，绝不回退「全部范围」。
 *  v1.2.9：L=0 = 跨所有笔记本（全范围），用户主动选的最宽一档。 */
function xrPickerRowsInLevel(rows, curKey, level) {
    if (Number(level) <= 0) return (rows || []).slice();
    if (!curKey) return [];
    return (rows || []).filter((x) =>
        xrChainKeyFromMeta(x && x.docMeta, level) === curKey);
}
/** v1.2.9：窗口可选层级 = 0..章节前缀层级。
 *  0 级 = 跨所有笔记本；1 级 = 可跨篇（同 top 目录）；
 *  n-1 级（默认）= 可跨章（同篇）；n 级 = 只本章。 */
function xrPickerLevelList(prefixLevel) {
    const n = Math.max(1, Number(prefixLevel) || 1);
    const out = [0];
    for (let L = 1; L <= n; L++) out.push(L);
    return out;
}
function xrPickerDefaultLevel(prefixLevel, autoOn) {
    const list = xrPickerLevelList(prefixLevel);
    const n = list[list.length - 1] || 1;
    return autoOn === false ? n : Math.max(1, n - 1);
}
/** v1.2.9：记住的层级要落在当前可选列表里，否则回退默认。
 *  saved 用 -1 表示「没存过」。0 是合法值，不能用 || 判断。 */
function xrPickerSavedLevel(saved, list, fallback) {
    const v = Number(saved);
    if (Number.isFinite(v) && v >= 0 && list.indexOf(v) >= 0) return v;
    return Number(fallback) || 0;
}
/** v1.2.9：记住的章节筛选只在本次面板真的存在时才恢复。 */
function xrPickerSavedSec(saved, secIds) {
    const s = String(saved || "");
    if (!s) return "";
    return secIds && secIds.indexOf(s) >= 0 ? s : "";
}

/** v1.2.11：当前层级一条题注都没有时，从当前档往「更宽」的档逐级试探，
 *  返回第一个真的有题注的层级。级数越小范围越大（3 本章 → 2 跨章 → 1 跨篇）。
 *  典型场景：文档 rootNum 只有 2 段（"1.1"），却记住了第 3 级 → 链键算不出 →
 *  旧版直接弹 toast 不建窗口；升到第 2 级就能看到本文档的「图 1-1」。
 *  默认 **不自动进 0 级**（跨所有笔记本必须用户主动选，避免偷偷跨笔记本）。
 *  allowZero=true 时才把 0 级也纳入自动试探。
 *  返回 {level, found}：全空时 found=false，level 停在可自动到达的最宽一档。 */
function xrPickerFirstNonEmptyLevel(rows, keys, list, start, allowZero) {
    const arr = (list || []).map(Number)
        .filter((L) => Number.isFinite(L) && L >= 0).sort((a, b) => a - b);
    if (!arr.length) return { level: 0, found: false };
    let s = Number(start);
    if (arr.indexOf(s) < 0) s = arr[arr.length - 1];
    // 从当前档开始，按级数递减（范围变宽）逐个试；s=0 是用户主动选的，原样保留
    const cand = arr.filter((L) => L <= s && (allowZero === true || L > 0 || s === 0))
        .reverse();
    if (!cand.length) cand.push(s);
    let last = cand[0];
    for (const L of cand) {
        last = L;
        const key = keys && typeof keys.get === "function" ? (keys.get(L) || "") : "";
        if (xrPickerRowsInLevel(rows, key, L).length) return { level: L, found: true };
    }
    return { level: last, found: false };
}


/** 纯函数：从 rootNum 取指定层级的前缀。
 *  level<=0 → 整条链（v1.1.5 行为）；level=N → 第 N 段；
 *  层级不够深（"1.2.3" 选第 4 级）→ 返回空串 = 不显示层级前缀。
 *  例 "2.1.2.3" level=2 → "1"。 */
function xrScopePrefix(rootNum, level) {
    const s = String(rootNum || "");
    if (!/^\d+(?:\.\d+)*$/.test(s)) return "";
    const parts = s.split(".");
    const n = Number(level) || 0;
    if (n <= 0) return s;
    if (n > parts.length) return "";
    return parts[n - 1];
}

/** 纯函数：按文档前缀口径取章节号。
 *  有 meta 时按 scopePrefixLevel 取一段（取不到 = 空串，不显示前缀）；
 *  完全没有 meta 时回退范围内文档树序号。 */
function xrScopeDocTag(doc, index, mode, level) {
    const m = doc && doc.meta;
    if (mode === "bydoc" && m && m.rootNum) return xrScopePrefix(m.rootNum, level);
    return String(index + 1);
}

/** 纯函数：全局 anchor（范围内全部题注 id → 新锚文本）。 */
function xrScopeAnchor(plan) {
    const a = {};
    for (const p of (plan || [])) a[p.id] = p.name;
    return a;
}

/** 纯函数：只刷范围内引用。返回 [{id,next,old,docId}]；范围外引用一个字都不动。 */
function xrScopeRefs(allBlocks, anchor) {
    const refs = [];
    const RE = new RegExp(XR_REF_RE.source, "g");
    for (const b of (allBlocks || [])) {
        const md = b.markdown || "";
        if (md.indexOf("((") < 0) continue;
        let changed = false;
        const anchors = {};
        RE.lastIndex = 0;
        const next = md.replace(RE, (whole, bid, q, old) => {
            if (!anchor[bid]) return whole;
            if (q === '"' && anchor[bid] === old) return whole;
            changed = true;
            anchors[bid] = anchor[bid];   // v1.1.2：给 DOM 直改路径用
            return "((" + bid + ' "' + anchor[bid] + '"))';
        });
        if (changed) refs.push({ id: b.id, next: next, old: md.slice(0, 60),
            docId: b.docId, anchors: anchors });
    }
    return refs;
}

/** 纯函数：结构事件是否该触发范围轮。判不准（无 box / doc 范围缺 box）一律全量。 */
function xrScopeShouldRun(cfg, cmd, data) {
    if (!XR_SCOPE_CMDS[cmd]) return false;
    const ts = (cfg && cfg.targets) || [];
    if (!ts.length) return false;
    if (ts.some((t) => t && (t.type || "doc") === "doc" && !t.box)) return true;
    const d = data || {};
    let box = "";
    if (cmd === "filetreeSortChanged") box = String(d.notebook || "");
    else if (cmd === "create") box = String((d.box && d.box.id) || "");
    else if (cmd === "rename") box = typeof d.box === "string" ? d.box : String((d.box && d.box.id) || "");
    else return true;
    if (!box) return true;
    return ts.some((t) => t && (t.type === "notebook" ? String(t.id) === box : String(t.box || "") === box));
}

/** SQL 的 blocks.ial 把 JSON 存成 HTML 实体（&#123; / &quot; / &#125;），读回来要反转义。 */
function xrDecodeIalText(s) {
    return String(s == null ? "" : s)
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
/** 纯函数：从 ial 解析 custom-doc-num-meta；缺失 / 坏值返回 null。 */
function xrParseMeta(ial) {
    const m = /custom-doc-num-meta="([^"]*)"/.exec(String(ial || ""));
    if (!m) return null;
    try {
        const o = JSON.parse(xrDecodeIalText(m[1]));
        return o && typeof o === "object" ? o : null;
    } catch (e) { return null; }
}
/** 一次 SQL（按 root_id 分批，避免 IN 过长）拿范围内插件真正会用到的块，含文档块自身的 ial。
 *  v1.2.15：实测 40 篇文档，全量 1013 块/29ms → 过滤后 257 块/7.5ms。
 *  只取题注(custom-xref)、公式(m)、标题(h)、含引用的块；异常或空结果退回全量。 */
async function xrScopeSqlBlocks(ids, batch) {
    const n = batch || 40;
    const out = [];
    for (let k = 0; k < ids.length; k += n) {
        const ch = ids.slice(k, k + n);
        const inl = ch.map((id) => "'" + String(id).replace(/'/g, "''") + "'").join(",");
        const base = "SELECT id, root_id, type, subtype, parent_id, markdown, ial, sort "
            + "FROM blocks WHERE root_id IN (" + inl + ") ";
        let rs;
        try {
            rs = await sql(base + "AND (ial LIKE '%custom-xref%' OR type = 'm' OR type = 'h' "
                + "OR markdown LIKE '%((%') LIMIT -1");
        } catch (e) { await logErr("xrScopeSqlBlocks/filter", e); }
        if (!rs || !rs.length) {
            rs = await sql(base + "LIMIT -1");
        }
        (rs || []).forEach((r) => out.push(r));
    }
    return out;
}

/** v1.1.2：内核的文档块顺序接口，只返回块 id 数组，不拉整篇 HTML。
 *  实测 3/3 篇与 getDoc 的 DOM 顺序完全一致（blocks.sort 判错的两篇也一致）。 */
async function orderFromDocOrders(docId) {
    const r = await api("/api/block/getDocBlocksOrders", { id: docId });
    const d = r && r.data;
    if (!Array.isArray(d)) throw new Error("getDocBlocksOrders 未返回数组");
    return d.filter((x) => typeof x === "string" && x);
}

/** v1.1.2：只改引用节点的锚文本，不经过 Lute 重建块。
 *  updateContent 的 hasRefNode 防呆会在「Lute 把 ((id "锚")) 当字面文本」时跳过写入，
 *  导致引用永远刷不过来。这里直接改 DOM 里 [data-type="block-ref"] 的 textContent，
 *  data-id / data-subtype="s" 等结构属性一个都不动。 */
async function updateRefAnchors(id, anchors, rec) {
    if (typeof DOMParser === "undefined") return false;
    const cur = await api("/api/block/getBlockDOM", { id: id });
    const dom = cur && cur.dom;
    if (!dom) return false;
    const doc = new DOMParser().parseFromString(dom, "text/html");
    let changed = false;
    doc.querySelectorAll('[data-type="block-ref"]').forEach((el) => {
        const bid = el.getAttribute("data-id") || "";
        const want = anchors && anchors[bid];
        if (!want) return;
        if ((el.textContent || "").trim() !== want) {
            el.textContent = want;
            changed = true;
        }
    });
    if (!changed) return true;
    const root = doc.body.firstElementChild;
    const next = root ? root.outerHTML : "";
    if (!next) return false;
    await retry(() => api("/api/block/updateBlock", { id: id, dataType: "dom", data: next }));
    if (rec) rec.items.push({ id: id, before: dom, after: next });
    return true;
}

/** 纯函数：决定本轮哪些文档要重扫、哪些直接复用缓存。
 *  dirty=null 表示全量；文档级事件（cache 命中且未标脏）不重扫；
 *  新加入的文档（cache 里没有）必须采一次。 */
function xrScopePickNeed(docs, cache, dirty) {
    const need = [];
    const reuse = new Map();
    (docs || []).forEach((d) => {
        const hit = cache && cache.get(d.id);
        const isDirty = !dirty || dirty.has(d.id);
        if (!isDirty && hit) reuse.set(d.id, hit.blocks);
        else need.push(d);
    });
    return { need: need, reuse: reuse };
}

/**
 * 范围轮采集：一次 SQL 拿范围内全部块内容 + 并发 getDocBlocksOrders 拿文档内真实顺序。
 * blocks.sort 实测不等于 DOM 顺序（3 篇里 2 篇题注顺序错），不能拿来编号；
 * 但块内容可以一次 SQL 取回，不必逐篇再查 SQL。
 * 任一文档顺序读取失败 → 整批抛错，调用方整批不写。
 */
async function xrScopeCollectDocs(docs, opt) {
    const o = opt || {};
    const cache = o.cache || null;
    const dirty = o.dirty instanceof Set ? o.dirty : null;   // null = 全量重扫
    /* v1.1.2 增量：文档级结构事件（拖动 / 删除 / 新建 / 改名）不改文档内部块顺序，
     * 未标脏的文档直接复用上次缓存；只有文档内插/删/改标题才需要重扫那一篇。 */
    const picked = xrScopePickNeed(docs, cache, dirty);
    const need = picked.need;
    const reuse = picked.reuse;
    const rows = need.length
        ? await xrScopeSqlBlocks(need.map((d) => d.id), o.sqlBatch || 40)
        : [];
    const byDoc = new Map();
    const metaOf = new Map();
    rows.forEach((r) => {
        if (r.type === "d") { metaOf.set(r.id, xrParseMeta(r.ial)); return; }
        if (!byDoc.has(r.root_id)) byDoc.set(r.root_id, []);
        byDoc.get(r.root_id).push(r);
    });
    // 自定义范围来源没有 meta：从同一次 SQL 的文档块 ial 回填，零额外请求
    docs.forEach((d) => { if (!d.meta && metaOf.has(d.id)) d.meta = metaOf.get(d.id); });
    const errors = [];
    const fresh = new Map();
    await xrMapLimit(need, o.concurrency || 20, async (d) => {
        try {
            let order = [];
            try { order = await orderFromDocOrders(d.id); }   // 内核顺序接口，响应最轻
            catch (e) { order = await orderFromDoc(d.id); }   // 旧内核回退 getDoc
            const list = byDoc.get(d.id) || [];
            const map = new Map(list.map((b) => [b.id, b]));
            const blocks = [];
            const got = new Set();
            for (const id of order) {
                const b = map.get(id);
                if (b && !got.has(id)) { got.add(id); blocks.push(b); }
            }
            for (const b of list) {
                if (!got.has(b.id)) { got.add(b.id); b.stale = true; blocks.push(b); }
            }
            blocks.forEach((b) => { b.docId = d.id; });
            fresh.set(d.id, { doc: d, blocks: blocks });
        } catch (e) {
            errors.push(d.id + "：" + ((e && e.message) || e));
        }
    });
    if (errors.length) {
        throw new Error("范围采集失败 " + errors.length + " 篇：" + errors.slice(0, 3).join("；"));
    }
    const result = docs.map((d) => {
        if (reuse.has(d.id)) return { doc: d, blocks: reuse.get(d.id) };
        return fresh.get(d.id) || { doc: d, blocks: [] };
    });
    result.rescanned = need.length;   // 供范围轮统计「实际重扫了几篇」
    return result;
}

/** 按文档分段生成范围计划；复用 classify / stripNumber / captionBgOf，结构与 buildPlan 一致。 */
function xrBuildScopePlan(perDoc, settings, mode) {
    const s = settings || {};
    const labelOf = { fig: s.figLabel || tr("label.fig"), tab: s.tabLabel || tr("label.tab"),
        eq: s.eqLabel || tr("label.eq") };
    const counters = { fig: 0, tab: 0, eq: 0 };
    const plan = [];
    const sections = [];
    const allBlocks = [];
    (perDoc || []).forEach((pd, di) => {
        const local = { fig: 0, tab: 0, eq: 0 };
        const hStack = [];
        const docTag = xrScopeDocTag(pd.doc, di, mode,
            xrLevelForDoc(pd.doc, s.scopePrefixLevel, s.scopePrefixLevelByTarget));
        for (const b of (pd.blocks || [])) {
            b.docId = pd.doc.id;
            allBlocks.push(b);
            if (b.type === "h" && b.subtype) {
                const lv = parseInt(String(b.subtype).slice(1), 10) || 1;
                while (hStack.length && hStack[hStack.length - 1].lv >= lv) hStack.pop();
                hStack.push({ id: b.id, lv: lv, text: headingText(b.markdown) });
                sections.push({ id: b.id, lv: lv, text: headingText(b.markdown), docId: pd.doc.id,
                    path: hStack.map((x) => x.id).join("/") });
                continue;
            }
            const kind = classify(b, s);
            if (!kind) continue;
            counters[kind] += 1;
            local[kind] += 1;
            // v1.1.6：选的层级超出实际层数 → docTag 为空 → 不显示层级前缀，只留连续序号
            const seq = mode === "bydoc"
                ? (docTag ? docTag + "-" + local[kind] : String(counters[kind]))
                : String(counters[kind]);
            const name = labelOf[kind] + " " + seq;
            const body = stripNumber(kind, b.markdown || "");
            const flat = String(body).replace(/[\s{}]/g, "").split(String.fromCharCode(92)).join("");
            const emptyEq = kind === "eq" && !flat;
            // eq 走 applyPlan 的 updateMathTag(p.seq)，不需要 newMd；t 块同样只改属性。
            // 只有编号没有正文时不补尾随空格——思源存盘会吃掉它，否则每轮都判「要改」。
            const newMd = (kind === "eq" || b.type === "t") ? null
                : (body ? name + " " + body : name);
            // tagOk：当前 \tag 已是目标号，dryRun / 写回都不必再算这一项（避免恒报「要改」）
            const tagOk = kind === "eq" && String(b.markdown || "").indexOf("tag{" + seq + "}") >= 0;
            const top = hStack.length ? hStack[hStack.length - 1] : null;
            plan.push({ id: b.id, docId: pd.doc.id, type: b.type, kind: kind, seq: seq,
                name: name, newMd: newMd, emptyEq: emptyEq, tagOk: tagOk,
                oldMd: (b.markdown || "").slice(0, 60), curMd: b.markdown || "", ial: b.ial || "",
                hPath: hStack.map((x) => x.id).join("/"), hLv: top ? top.lv : 0,
                hText: top ? top.text : "",
                center: s.centerCaption !== false && (kind === "fig" || kind === "tab"),
                bg: (kind === "fig" || kind === "tab") ? captionBgOf(s) : "" });
        }
    });
    return { plan: plan, sections: sections, allBlocks: allBlocks };
}

/** SQL 字符串转义（范围里都是思源自己给的 id / box / path，仍需防单引号）。 */
function xrSqlEsc(s) {
    return String(s == null ? "" : s).replace(/'/g, "''");
}

/** 自定义范围 → 有序文档清单。doc 范围含全部子文档（path 前缀），notebook 范围含整本。
 *  顺序按 (box, path)：不保证等于文档树拖拽顺序，要精确顺序请用「跟随子文档编号插件」来源。 */
async function xrScopeDocsCustom(cfg) {
    const ids = new Map();
    for (const t of ((cfg && cfg.targets) || [])) {
        if (!t || !t.id) continue;
        let rows = [];
        if ((t.type || "doc") === "notebook") {
            rows = (await sql("SELECT id, box, path, content FROM blocks WHERE type='d' AND box='"
                + xrSqlEsc(t.id) + "' LIMIT 3000")) || [];
        } else {
            const one = (await sql("SELECT id, box, path, content FROM blocks WHERE id='"
                + xrSqlEsc(t.id) + "' LIMIT 1")) || [];
            if (one.length) {
                rows = rows.concat(one);
                const base = xrSqlEsc(String(one[0].path || "").replace(/\.sy$/, ""));
                rows = rows.concat((await sql("SELECT id, box, path, content FROM blocks WHERE type='d' AND box='"
                    + xrSqlEsc(one[0].box) + "' AND path LIKE '" + base + "/%' LIMIT 3000")) || []);
            }
        }
        rows.forEach((r) => {
            if (!r || !r.id || ids.has(r.id)) return;
            ids.set(r.id, { id: r.id, box: r.box, path: r.path, title: r.content || "", num: "", pad: 0 });
        });
    }
    const drop = new Set();
    for (const e of ((cfg && cfg.excluded) || [])) {
        if (!e || !e.id) continue;
        drop.add(e.id);
        if (e.mode !== "subtree") continue;
        try {
            const one = (await sql("SELECT box, path FROM blocks WHERE id='" + xrSqlEsc(e.id) + "' LIMIT 1")) || [];
            if (!one.length) continue;
            const base = xrSqlEsc(String(one[0].path || "").replace(/\.sy$/, ""));
            const subs = (await sql("SELECT id FROM blocks WHERE type='d' AND box='" + xrSqlEsc(one[0].box)
                + "' AND path LIKE '" + base + "/%' LIMIT 3000")) || [];
            subs.forEach((r) => drop.add(r.id));
        } catch (err) { /* 排除项取不到就只剔自身 */ }
    }
    const out = Array.from(ids.values()).filter((d) => !drop.has(d.id));
    out.sort((a, b) => String(a.box).localeCompare(String(b.box))
        || String(a.path).localeCompare(String(b.path)));
    return out;
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
    // 10 种界面语言的内置标签都认：用户中途换语言、或文档是别人给的，都不能漏认
    push(tr("label.fig")); push(tr("label.tab")); push(tr("label.eq"));
    // 词表里的带点写法和不带点写法都要进（块名里存的是「Abb. 2」这种完整标签）
    [].concat(FIG_WORDS, TAB_WORDS, EQ_WORDS).forEach((w) => { push(w); push(w + "."); });
    // 长标签优先，否则「Equation 3」会先被「Eq」匹配掉一半
    return out.sort((a, b) => b.length - a.length);
}

function isAutoCaptionName(name, s) {
    const v = String(name || "").trim();
    if (!v) return false;
    const labs = captionLabelList(s).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp("^(?:" + labs.join("|") + ")\\s+\\d+(?:[-.]\\d+)*$").test(v);
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

async function applyPlan(plan, refs, skip, protyle, rec, opt) {
    const prevBatch = XR_BATCH;
    const batch = { blocks: [], pending: new Map(), doms: {} };
    XR_BATCH = batch;
    try {
    const miss = skip || new Set();
    // 一次 getBlockDOMs 预取全部待改块，替代逐块 getBlockDOM
    try {
        const ids = Array.from(new Set([].concat(
            (plan || []).map((p) => p.id), (refs || []).map((r) => r.id)))).filter(Boolean);
        if (ids.length) batch.doms = (await api("/api/block/getBlockDOMs", { ids: ids })) || {};
    } catch (e) { await logErr("applyPlan/getBlockDOMs", e); }
    // v1.1.0 范围轮可传 {gap} 压缩块间等待；不传时下面四个间隔与 1.0.11 逐字一致。
    const gap = (opt && Number.isFinite(opt.gap)) ? opt.gap : null;
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
            await sleep(gap == null ? 10 : Math.min(gap, 20));
            continue;
        }
        // 内容没变就不写：避免每轮自动重排都重写全文、刷一堆历史记录
        if (p.newMd && p.newMd !== p.curMd) {
            if (looksLossy(p.curMd, p.newMd)) { lossy += 1; continue; }
            const ok = await updateContent(p.id, p.newMd, protyle, rec);
            if (!ok) wiped.add(p.id);
            await sleep(gap == null ? 10 : Math.min(gap, 20));
        }
    }
    for (const r of refs) {
        if (miss.has(r.id)) continue;
        /* v1.1.2：范围轮的引用刷新走 DOM 直改，绕开 Lute 重建丢引用节点的防呆。
         * 单文档 buildPlan 产生的 refs 没有 anchors，仍旧走原来的 updateContent。 */
        if (r.anchors && Object.keys(r.anchors).length) {
            /* 统一由这里记撤销：updateRefAnchors 只负责改 DOM，不自己写 rec。 */
            try {
                const before = await api("/api/block/getBlockDOM", { id: r.id });
                await updateRefAnchors(r.id, r.anchors, null);
                const after = await api("/api/block/getBlockDOM", { id: r.id });
                if (rec && before && before.dom && after && after.dom && before.dom !== after.dom) {
                    rec.items.push({ id: r.id, before: before.dom, after: after.dom });
                }
            } catch (e) { await logErr("applyPlan/ref-anchors", e); }
            await sleep(gap == null ? 10 : Math.min(gap, 20));
            continue;
        }
        if (looksLossy(r.old || "", r.next || "")) { lossy += 1; continue; }
        const ok = await updateContent(r.id, r.next, protyle, rec);
        if (!ok) wiped.add(r.id);
        await sleep(gap == null ? 10 : Math.min(gap, 20));
    }
    // 第二轮：补属性（一次 batchSetBlockAttrs 提交，失败自动回退逐条）。
    const attrOps = [];
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
        attrOps.push({ id: p.id, attrs: attrs });
        if (rec) rec.attrs.push({ id: p.id, before: old, after: attrs });
    }
    // v1.2.14 修复：必须先提交块内容，再写属性。
    // 批量 DOM 来自 getBlockDOMs 预取旧快照（不含本轮新算的 name/style），
    // 若放在属性之后提交，会把刚写好的 name / custom-xref / style 整块覆盖掉。
    await flushBlockBatch(batch);
    batch.blocks.length = 0;
    if (attrOps.length) {
        try {
            await retry(() => api("/api/attr/batchSetBlockAttrs", { blockAttrs: attrOps }));
        } catch (e) {
            await logErr("applyPlan/batchAttrs", e);
            for (const a of attrOps) {
                try { await retry(() => api("/api/attr/setBlockAttrs", { id: a.id, attrs: a.attrs })); }
                catch (e2) { await logErr("applyPlan/attr-fallback", e2); }
            }
        }
    }
    } finally {
        XR_BATCH = prevBatch;
        if (batch.blocks.length) await flushBlockBatch(batch);  // 异常兜底，正常路径已提交
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

/** v1.2.16：修「在文字后面插入引用变成纯文本」。
 *  思源把行内插入的 block-ref span 降级成 data-type="text"（带 white-space:normal IAL）；
 *  实测把整块 DOM 用 updateBlock(dom) 写回能保留 ((id "锚"))，这里据此把降级节点换回来。
 *  只在检测到降级时写一次；单独块插入正常时直接返回，不产生额外写入。 */
async function fixInlineRef(blockId, refId, name) {
    if (!blockId || !refId || !name) return;
    try {
        await sleep(250);
        const cur = await api("/api/block/getBlockDOM", { id: blockId });
        const dom = cur && cur.dom;
        if (!dom) return;
        if (dom.indexOf('data-type="block-ref"') >= 0 &&
            dom.indexOf('data-id="' + refId + '"') >= 0) return;   // 本来就是真引用
        const re = /<span data-type="text"[^>]*>([^<]*)<\/span>/g;
        let hit = null, m;
        while ((m = re.exec(dom))) { if (m[1] === name) { hit = m; break; } }
        if (!hit) return;
        const good = '<span data-type="block-ref" data-subtype="s" data-id="' + refId + '">'
            + name + "</span>";
        const next = dom.slice(0, hit.index) + good + dom.slice(hit.index + hit[0].length);
        await retry(() => api("/api/block/updateBlock", { id: blockId, dataType: "dom", data: next }));
    } catch (e) { await logErr("fixInlineRef", e); }
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
            {
                id: "xref-scope",
                filter: ["xrefscope", "重排范围", "范围重排", "scope"],
                html: '<div class="b3-list-item__first"><span class="b3-list-item__text">' + esc(tr("slash.scope.text")) + "</span>" +
                    '<span class="b3-list-item__meta">' + esc(tr("slash.scope.meta")) + "</span></div>",
                showInLite: true,
                callback: () => {
                    this.renumberScope().catch((e) => { logErr("slash:xrefscope", e); });
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
            this.addCommand({
                langKey: "xrefScope",
                langText: tr("cmd.scope"),
                hotkey: "",
                editorCallback: () => { this.fire("scope", null, null); },
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
        /* v1.1.0 多文档范围重排设置。默认全关，不启用时不改变 1.0.11 的任何行为。 */
        this.setting.addItem({
            title: tr("set.scope.on"),
            description: tr("set.scope.on.desc"),
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = !!this.settings.scopeEnabled;
                inp.addEventListener("change", () => {
                    this.settings.scopeEnabled = inp.checked; this.saveSettings();
                });
                return inp;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.source"),
            description: tr("set.scope.source.desc"),
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [["docnum", tr("set.scope.source.docnum")],
                    ["custom", tr("set.scope.source.custom")]].forEach(([v, tt]) => {
                    const o = document.createElement("option");
                    o.value = v; o.textContent = tt;
                    if (this.settings.scopeSource === v) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => {
                    this.settings.scopeSource = sel.value; this.saveSettings();
                });
                return sel;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.mode"),
            description: tr("set.scope.mode.desc"),
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [["continuous", tr("set.scope.mode.continuous")],
                    ["bydoc", tr("set.scope.mode.bydoc")]].forEach(([v, tt]) => {
                    const o = document.createElement("option");
                    o.value = v; o.textContent = tt;
                    if (this.settings.scopeMode === v) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => {
                    this.settings.scopeMode = sel.value; this.saveSettings();
                });
                return sel;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.level"),
            description: tr("set.scope.level.desc"),
            createActionElement: () => {
                const sel = document.createElement("select");
                sel.className = "b3-select fn__size200";
                [[0, tr("set.scope.level.all")]].concat(
                    [1, 2, 3, 4, 5, 6].map((n) => [n, tr("set.scope.level.n", n)])
                ).forEach(([v, t]) => {
                    const o = document.createElement("option");
                    o.value = String(v); o.textContent = t;
                    if (Number(this.settings.scopePrefixLevel || 0) === v) o.selected = true;
                    sel.appendChild(o);
                });
                sel.addEventListener("change", () => {
                    this.settings.scopePrefixLevel = Number(sel.value) || 0;
                    this.saveSettings();
                    if (this._scopeCache) this._scopeCache.clear();
                });
                return sel;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.levelByTarget"),
            description: tr("set.scope.levelByTarget.desc"),
            createActionElement: () => {
                const ta = document.createElement("textarea");
                ta.className = "b3-text-field";
                ta.rows = 4;
                ta.style.cssText = "width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;";
                ta.value = JSON.stringify(this.settings.scopePrefixLevelByTarget || {}, null, 2);
                ta.addEventListener("change", () => {
                    try {
                        const obj = JSON.parse(ta.value || "{}");
                        this.settings.scopePrefixLevelByTarget =
                            (obj && typeof obj === "object" && !Array.isArray(obj)) ? obj : {};
                        this.saveSettings();
                        if (this._scopeCache) this._scopeCache.clear();
                    } catch (err) {
                        showMessage(tr("msg.error", "JSON parse failed"), 5000, "error");
                    }
                });
                return ta;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.events"),
            description: tr("set.scope.events.desc"),
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.scopeAutoEvents !== false;
                inp.addEventListener("change", () => {
                    this.settings.scopeAutoEvents = inp.checked; this.saveSettings();
                });
                return inp;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.custom"),
            description: tr("set.scope.custom.desc"),
            createActionElement: () => {
                const box = document.createElement("div");
                box.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;";
                const ta = document.createElement("textarea");
                ta.className = "b3-text-field";
                ta.rows = 4;
                ta.style.cssText = "width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;";
                ta.value = JSON.stringify({ targets: this.settings.scopeTargets || [],
                    excluded: this.settings.scopeExcluded || [] }, null, 2);
                ta.addEventListener("change", () => {
                    try {
                        const obj = JSON.parse(ta.value || "{}");
                        this.settings.scopeTargets = Array.isArray(obj.targets) ? obj.targets : [];
                        this.settings.scopeExcluded = Array.isArray(obj.excluded) ? obj.excluded : [];
                        this.saveSettings();
                    } catch (err) {
                        showMessage(tr("msg.error", "JSON parse failed"), 5000, "error");
                    }
                });
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline fn__size200";
                btn.textContent = tr("set.scope.import");
                btn.addEventListener("click", async () => {
                    if (await this.importScopeFromDocnum()) {
                        ta.value = JSON.stringify({ targets: this.settings.scopeTargets,
                            excluded: this.settings.scopeExcluded }, null, 2);
                    }
                });
                box.appendChild(ta);
                box.appendChild(btn);
                return box;
            },
        });
        this.setting.addItem({
            title: tr("set.scope.pickerAuto"),
            description: tr("set.scope.pickerAuto.desc"),
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = this.settings.scopePickerAuto !== false;
                inp.addEventListener("change", () => {
                    this.settings.scopePickerAuto = inp.checked;
                    this.saveSettings();
                });
                return inp;
            },
        });
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
                // 三个标签并排：思源的 .b3-text-field 是块级元素，不给 flex 会竖着堆成一列
                const box = document.createElement("div");
                box.style.display = "flex";
                box.style.gap = "6px";
                [["figLabel", tr("label.fig")], ["tabLabel", tr("label.tab")],
                    ["eqLabel", tr("label.eq")]].forEach(([k, ph]) => {
                    const inp = document.createElement("input");
                    inp.className = "b3-text-field";
                    inp.placeholder = ph;
                    inp.value = this.settings[k];
                    inp.style.width = "62px";
                    inp.style.textAlign = "center";
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
                    tip.style.width = "86px";
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
                inp.className = "b3-text-field";
                inp.style.width = "90px";
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

        this.watchSettingPanel();

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
            if (!d) return;
            /* v1.1.0 范围轮：结构事件按 box 过滤命中才触发，判不准退回全量；
             * 3s 防抖 + renumberScope 内的串行排队锁；默认 scopeEnabled=false 不生效。 */
            if (d.cmd !== "transactions" && this.settings.scopeEnabled
                && this.settings.scopeAutoEvents && Date.now() >= (this._quietUntil || 0)) {
                (async () => {
                    try {
                        const cfg = await this.resolveScope();
                        if (!xrScopeShouldRun(cfg, d.cmd, d.data)) return;
                        clearTimeout(this._scopeTimer);
                        this._scopeTimer = setTimeout(() => {
                            this.renumberScope({ auto: true, silent: true })
                                .catch((err) => logErr("scope:auto", err));
                        }, 3000);
                    } catch (err) { logErr("scope:event", err); }
                })();
            }
            if (d.cmd !== "transactions") return;
            if (Date.now() < (this._quietUntil || 0)) return; // 自己刚写完，别自激
            /* v1.1.2：文档内编辑只弄脏当前这一篇；其它文档的块顺序缓存不动。 */
            if (this.settings.scopeEnabled) {
                try {
                    const p = this.currentProtyle();
                    const id = p ? getDocId(p) : docIdFromDom();
                    if (id) (this._scopeDirty = this._scopeDirty || new Set()).add(id);
                } catch (e) { /* 拿不到文档 id 就不标，下次全量兜底 */ }
            }
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
        } else if (act === "scope") {
            this.renumberScope().catch((e) => { logErr("hotkey:scope", e); });
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
    /**
     * 设置面板装饰：加分组标题 + 专属 class。
     * Setting 实例不暴露容器（3.8.9 实测 this.setting.element 是 undefined），改成等 #settings 出现再处理；
     * 只动「文案里含本插件设置项」的那一个面板，别的插件设置面板不会被碰。
     */
    watchSettingPanel() {
        if (this._settingWatch) return;
        this._settingWatch = true;
        let last = 0;
        const deco = () => {
            const now = Date.now();
            if (now - last < 400) return;
            last = now;
            // 找本插件第一项（启用范围重排），跳过被 fn__none 藏起来的设置页
            let mine = null, fallback = null;
            for (const l of document.querySelectorAll(".b3-label")) {
                if ((l.textContent || "").indexOf(tr("set.scope.on")) < 0) continue;
                if (!fallback) fallback = l;
                if (l.getBoundingClientRect().height) { mine = l; break; }
            }
            mine = mine || fallback;   // 面板未激活时也能装饰，用户切过来即可看到
            if (!mine) return;
            // v1.2.4：容器必须是「直接装 label 的那一层」(通常是 .b3-dialog__content)。
            // 用 .b3-dialog__body 会把分组 append 到空内容区之后 → 顶部一大块空白、无法滚动。
            const parent = mine.parentElement;
            if (!parent || parent.dataset.xrDeco === "3") return;
            const rows = Array.prototype.slice.call(parent.querySelectorAll(".b3-label"));
            if (rows.length < 15 || rows.length > 24) return;   // 数量对不上 = 容器抓错
            parent.dataset.xrDeco = "3";
            parent.classList.add("xr-setting");
            const marker = document.createComment("xr-setting-groups");
            parent.insertBefore(marker, rows[0]);   // 记住原第一项的位置
            const groups = [
                // 2026-11-10：单页/通用 11 项在前，书籍多页/范围 8 项收进默认折叠区
                { label: tr("set.grp.single"), idx: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], open: true },
                { label: tr("set.grp.book"),   idx: [0, 1, 2, 3, 4, 5, 6, 7],                   open: false },
            ];
            groups.forEach((g) => {
                const d = document.createElement("details");
                d.className = "xr-set-group";
                if (g.open) d.open = true;
                const sm = document.createElement("summary");
                const t = document.createElement("span");
                t.className = "xr-set-group-t"; t.textContent = g.label;
                const n = document.createElement("span");
                n.className = "xr-set-group-n"; n.textContent = tr("set.grp.items", g.idx.length);
                sm.appendChild(t); sm.appendChild(n);
                d.appendChild(sm);
                const body = document.createElement("div");
                body.className = "xr-set-group-b";
                g.idx.forEach((i) => { if (rows[i]) body.appendChild(rows[i]); });
                d.appendChild(body);
                parent.insertBefore(d, marker);   // 放回原位置，不产生空白
            });
            marker.remove();
        };
        const mo = new MutationObserver(deco);
        mo.observe(document.body, { childList: true, subtree: true });
        this._settingObserver = mo;
    }

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
        // 备用前缀走 10 语言词表：用户换了界面语言、或文档是别人用别的语言写的，都要认得出题注
        const alt = (kind === "fig" ? FIG_WORDS : TAB_WORDS).map(escRe).join("|");
        return new RegExp("^\\s*(" + esc + "|" + alt + ")\\.?\\s*\\d");
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
    /** v1.2.9：插入面板筛选状态静默落盘（不弹「已保存」打扰用户），防抖 250ms。 */
    savePickerState() {
        clearTimeout(this._pickerSaveTimer);
        this._pickerSaveTimer = setTimeout(() => {
            try { this.saveData("settings.json", this.settings); } catch (e) { /* 落盘失败不影响使用 */ }
        }, 250);
    }

    /**
     * opts.auto  自动模式：绝不写入光标所在的块（打断输入），等光标离开再排
     * opts.silent 成功不弹提示（自动模式用）
     */
    /** 解析范围配置：可切「跟随编号插件」/「本插件自定义」。 */
    async resolveScope() {
        let dnCfg = null;
        try {
            const dn = globalThis.__siyuanDocNumTest;
            if (dn && typeof dn.getConfig === "function") dnCfg = await dn.getConfig();
        } catch (e) { /* 编号插件不在 / 没加载好 → 降级 */ }
        return xrScopeResolve(this.settings, dnCfg);
    }

    /** 设置面板「从编号插件导入」：把它的 targets/excluded 复制成本插件自定义范围。 */
    async importScopeFromDocnum() {
        try {
            const dn = globalThis.__siyuanDocNumTest;
            if (!dn || typeof dn.getConfig !== "function") throw new Error("docnum plugin missing");
            const cfg = await dn.getConfig();
            this.settings.scopeTargets = Array.isArray(cfg.targets) ? cfg.targets.slice() : [];
            this.settings.scopeExcluded = Array.isArray(cfg.excluded) ? cfg.excluded.slice() : [];
            this.settings.scopeSource = "custom";
            this.saveSettings();
            showMessage(tr("set.scope.import.ok", this.settings.scopeTargets.length,
                this.settings.scopeExcluded.length), 6000);
            return true;
        } catch (e) {
            showMessage(tr("set.scope.import.fail"), 6000, "error");
            return false;
        }
    }

    /** 范围 → 有序文档清单。docnum 来源走编号插件的 rangeDocIdsOrdered()（文档树顺序）。 */
    async resolveScopeDocs(cfg) {
        let docs = null;
        if (cfg && cfg.source === "docnum") {
            try {
                const dn = globalThis.__siyuanDocNumTest;
                if (dn && typeof dn.rangeDocIdsOrdered === "function") {
                    docs = await dn.rangeDocIdsOrdered();
                }
            } catch (e) { /* 旧版编号插件没有这个接口 → 退回 custom */ }
        }
        if (!docs) docs = await xrScopeDocsCustom(cfg);
        /* v1.1.3：custom 来源（或旧版编号插件）返回的 docs 没有 meta。
         * 一次 batchGetBlockAttrs 把 custom-doc-num-meta 补齐，保证 bydoc 前缀
         * 永远取 rootNum；否则会退化成文档树序号，把已有章节号改坏。 */
        const missing = docs.filter((d) => !d.meta).map((d) => d.id);
        for (let i = 0; i < missing.length; i += 100) {
            const chunk = missing.slice(i, i + 100);
            try {
                const r = await api("/api/attr/batchGetBlockAttrs", { ids: chunk });
                // api() 已经返回 r.data，这里直接用，不能再取 .data
                const data = r || {};
                docs.forEach((d) => {
                    if (d.meta) return;
                    const a = data[d.id];
                    const raw = a && a["custom-doc-num-meta"];
                    if (!raw) return;
                    try { d.meta = JSON.parse(String(raw)); } catch (e) { /* 坏值当没有 */ }
                });
            } catch (e) { /* 读不到就回退文档树序号 */ }
        }
        return docs;
    }

    /**
     * v1.1.0 范围内多文档重排。与单文档 renumber() 完全独立：
     *  - 串行排队锁；任一文档采集失败整批不写；
     *  - dryRun 只算不写（真机零写入验证入口）；
     *  - 引用只刷范围内；撤销记录按块带 doc，可整批回放。
     */
    /** v1.1.6：读当前文档的 custom-doc-num-meta，按 scopePrefixLevel 取章节前缀。
     *  一次 batchGetBlockAttrs，只读本文档；返回 undefined = 无 meta（保持原口径），
     *  返回 "" = 层级不够、不显示前缀。 */
    async currentScopePrefix(docId) {
        if (!docId) return undefined;
        try {
            const r = await api("/api/attr/batchGetBlockAttrs", { ids: [docId] });
            const a = r && r[docId];
            const raw = a && a["custom-doc-num-meta"];
            if (!raw) return undefined;
            const m = JSON.parse(String(raw));
            return xrScopePrefix(m && m.rootNum,
                xrLevelForDoc({ meta: m }, this.settings.scopePrefixLevel,
                    this.settings.scopePrefixLevelByTarget));
        } catch (e) { return undefined; }
    }

    /** v1.1.8：取当前文档所属的第 N 级章节链，用于自动收窄交叉引用窗口。
     *  当前文档已有 meta → 直接取 rootNum 前 N 段；还没编号（新建文档）→
     *  沿 path 找到第 N 级祖先，读它的 rootNum。取不到返回空串 = 不收窄。 */
    async currentLevelChain(docId, level, overrides) {
        const n = Number(level) || 0;
        if (!docId || n <= 0) return "";
        const escId = (x) => String(x).replace(/'/g, "''");
        try {
            const rows = await sql("SELECT id, path, ial FROM blocks WHERE id='" + escId(docId) + "' LIMIT 1");
            const row = rows && rows[0];
            if (!row) return "";
            let meta = xrParseMeta(row.ial);
            if (!meta || !meta.rootNum) {
                // v1.2.7：新建文档常没 meta；沿 path 由近到远找任意有编号的祖先
                const seg = String(row.path || "").replace(/^\/+/, "").split("/")
                    .map((x) => String(x).replace(/\.sy$/, "")).filter(Boolean);
                const ancIds = seg.slice(0, -1).reverse().filter((x) => x !== docId);
                if (ancIds.length) {
                    const inl = ancIds.map((x) => "'" + escId(x) + "'").join(",");
                    const ars = await sql("SELECT id, ial FROM blocks WHERE id IN (" + inl + ") LIMIT -1");
                    const byAnc = new Map((ars || []).map((r) => [r.id, r]));
                    for (const aid of ancIds) {
                        const m = xrParseMeta(byAnc.get(aid) && byAnc.get(aid).ial);
                        if (m && m.rootNum) { meta = m; break; }
                    }
                }
            }
            // v1.2.0：该文档所属 target 可有专属层级
            const nEff = xrLevelForDoc({ meta: meta }, n, overrides);
            // v1.1.9：键里带 rootID，区分不同范围根下同名的 1.2.3
            return xrChainKeyFromMeta(meta, nEff);
        } catch (e) { return ""; }
    }

    async renumberScope(opts) {
        const o = opts || {};
        const s = this.settings;
        if (!s.scopeEnabled && !o.force) {
            if (!o.silent) showMessage(tr("msg.scope.none"), 4000);
            return { ok: false, why: "disabled" };
        }
        if (this._scopeRunningPromise) {
            try { await this._scopeRunningPromise; } catch (e) { /* 上一轮失败不影响本轮 */ }
            if (o.auto) return { ok: false, why: "busy" };
            if (!o.silent) showMessage(tr("msg.scope.busy"), 3000);
        }
        let release;
        const lock = new Promise((r) => { release = r; });
        this._scopeRunningPromise = lock;
        try {
            const cfg = await this.resolveScope();
            if (cfg.degraded && !o.silent) showMessage(tr("msg.scope.nodn"), 4000);
            const docs = await this.resolveScopeDocs(cfg);
            if (!docs.length) {
                if (!o.silent) showMessage(tr("msg.scope.none"), 4000);
                return { ok: false, why: "empty" };
            }
            const cap = Math.max(1, parseInt(s.scopeMaxDocs, 10) || 500);
            if (docs.length > cap) {
                if (!o.silent) showMessage(tr("msg.scope.limit", docs.length), 8000, "error");
                return { ok: false, why: "over-limit", docs: docs.length };
            }
            /* v1.1.2 增量缓存：文档级事件只换文档列表，文档内块顺序缓存不动；
             * 只有标脏的文档（插/删/改标题、或上轮写回过）才重扫。 */
            this._scopeCache = this._scopeCache || new Map();
            this._scopeCacheDocs = this._scopeCacheDocs || [];
            this._scopeDirty = this._scopeDirty || new Set();
            this._scopeTagWritten = this._scopeTagWritten || new Map();
            const idsNow = docs.map((d) => d.id);
            // 文档列表变化（拖动 / 新建 / 删除 / 改名）只换顺序，不改文档内部块顺序：
            // 缓存按 id 命中即复用，只有新加入的文档才需采集，因此不算 full。
            const full = o.full === true || !this._scopeCache.size;
            const dirty = full ? null : new Set(this._scopeDirty);
            const perDoc = await xrScopeCollectDocs(docs, {
                concurrency: s.scopeConcurrency || 20,
                cache: full ? null : this._scopeCache,
                dirty: dirty,
            });
            const keep = new Set(idsNow);
            Array.from(this._scopeCache.keys()).forEach((k) => { if (!keep.has(k)) this._scopeCache.delete(k); });
            (full ? perDoc : perDoc.filter((pd) => dirty.has(pd.doc.id)))
                .forEach((pd) => this._scopeCache.set(pd.doc.id, { doc: pd.doc, blocks: pd.blocks }));
            this._scopeCacheDocs = idsNow.slice();
            this._scopeDirty.clear();
            const rescanned = Number(perDoc.rescanned) || (full ? docs.length : 0);
            const built = xrBuildScopePlan(perDoc, s, s.scopeMode);
            /* updateMathTag 改的是 DOM 的 data-content，SQL 的 blocks.markdown 里 \tag 不同步，
             * 只按 markdown 判 tagOk 会恒报「公式要改」。用上轮实际写入的 seq 兜住。 */
            built.plan.forEach((p) => {
                if (p.kind === "eq" && this._scopeTagWritten.get(p.id) === p.seq) p.tagOk = true;
            });
            const anchor = xrScopeAnchor(built.plan);
            const refs = s.refreshRefs === false ? [] : xrScopeRefs(built.allBlocks, anchor);
            // 只把「真的要改」的块交给写回；空公式不编号、eq 用 tagOk 判定，避免恒报要改
            const plan = built.plan.filter((p) => {
                if (p.emptyEq) return false;
                return p.kind === "eq" ? !p.tagOk : (p.newMd && p.newMd !== p.curMd);
            });
            const preview = {
                ok: true, dryRun: !!o.dryRun, docs: docs.length,
                plan: plan.length, refs: refs.length,
                source: cfg.source, mode: s.scopeMode,
                blocks: built.allBlocks.length, captions: built.plan.length,
                full: full, rescanned: rescanned, cached: docs.length - rescanned,
                names: built.plan.slice(0, 8).map((p) => p.name),
                docIds: docs.map((d) => d.id),
            };
            if (o.dryRun) {
                if (!o.silent) showMessage(tr("msg.scope.dry", docs.length, plan.length, refs.length), 7000);
                return preview;                    // 零写入
            }
            if (!plan.length && !refs.length) return Object.assign(preview, { changed: 0 });
            // getLute() 有 window.Lute 全局兜底：没有打开文档时仍走 DOM 路径、不会清 IAL。
            // 只有连全局 Lute 都没有才中止（那是真会退化成 markdown 兜底的形态）。
            if (!this._lastProtyle && !(typeof window !== "undefined" && window.Lute)) {
                throw new Error("没有可用的编辑器实例与全局 Lute，已中止写回（markdown 兜底会清空题注属性）");
            }
            const gap = 30;
            this._quietUntil = Date.now() + Math.min(4000 + (plan.length + refs.length) * (gap + 60), 20000);
            const rec = { doc: getDocId(this._lastProtyle) || "", scope: true,
                t: Date.now(), items: [], attrs: [], docs: docs.map((d) => d.id) };
            await applyPlan(plan, refs, new Set(), this._lastProtyle, rec, { gap: gap });
            const docOf = new Map(), parentOf = new Map();
            built.allBlocks.forEach((b) => {
                docOf.set(b.id, b.docId);
                parentOf.set(b.id, b.parent_id || b.docId);
            });
            rec.items.forEach((it) => {
                it.doc = docOf.get(it.id) || "";
                it.pid = parentOf.get(it.id) || it.doc;
            });
            this.pushUndo(rec);
            // 写回过的文档标脏：下次范围轮只重扫这几篇，其余缓存不动
            plan.forEach((p) => {
                if (p.docId) this._scopeDirty.add(p.docId);
                if (p.kind === "eq") this._scopeTagWritten.set(p.id, p.seq);
            });
            refs.forEach((r) => { if (r.docId) this._scopeDirty.add(r.docId); });
            if (!o.silent) showMessage(tr("msg.scope.done", docs.length, plan.length, refs.length), 7000);
            return Object.assign(preview, { changed: plan.length + refs.length });
        } catch (e) {
            await logErr("renumberScope", e);
            if (!o.silent) showMessage(tr("msg.scope.readfail", (e && e.message) || e), 9000, "error");
            return { ok: false, error: String((e && e.message) || e) };
        } finally {
            if (this._scopeRunningPromise === lock) this._scopeRunningPromise = null;
            release();
            this._quietUntil = Math.max(this._quietUntil || 0, Date.now() + 2500);
        }
    }

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
            /* v1.1.4：范围功能开启时，单文档自动重排也按本文档章节号编号。
             * 只读当前文档的一个属性，不扫范围、不影响其它文档。 */
            let planSettings = this.settings;
            if (this.settings.scopeEnabled && this.settings.scopeMode === "bydoc") {
                const prefix = await this.currentScopePrefix(docId);
                if (prefix === "") {
                    planSettings = Object.assign({}, this.settings, { __scopeNoPrefix: true });
                } else if (prefix) {
                    planSettings = Object.assign({}, this.settings, { __scopePrefix: prefix });
                }
            }
            const r = buildPlan(blocks, planSettings, burnable, excl);
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
                    if (await rebuildBlock(it.after || dom, it.id, it.pid || it.doc || rec.doc, a ? a.after : null)) rebuilt++;
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
        /* v1.1.2：撤销改了块内容，范围轮缓存必须失效，否则会拿旧快照判定。 */
        if (this._scopeCache) this._scopeCache.clear();
        if (this._scopeDirty) this._scopeDirty.clear();
        if (this._scopeTagWritten) this._scopeTagWritten.clear();
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
        /* v1.1.2：重做同样改块内容，范围轮缓存失效。 */
        if (this._scopeCache) this._scopeCache.clear();
        if (this._scopeDirty) this._scopeDirty.clear();
        if (this._scopeTagWritten) this._scopeTagWritten.clear();
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

    /** v1.2.17：picker 候选快速取数 —— 一次 attributes 自连接拿题注块 id / 类型 / 块名 / 所属文档。
     *  不扫全量块、不逐篇取文档顺序；查不到或块名全空返回 null，由调用方回退原链路。 */

    /**
     * 弹窗候选：一条 SQL 从 attributes 拿齐全库题注 + 文档编号元数据 + 文档名 + 正文。
     * v1.2.18（用户 2026-11-10）：弹窗不需要枚举文档树，不再调编号插件 rangeDocIdsOrdered()。
     * 实测 6.49ms / 87 行；name 87/87 格式统一为「图 1-1 / 表 1-1 / 式 1-1」。
     */
    async pickerAllRows() {
        const rows = await sql("SELECT a.block_id AS id, a.root_id AS docId, "
            + "a.value AS kind, n.value AS name, m.value AS meta, "
            + "d.content AS docTitle, b.markdown AS md "
            + "FROM attributes a "
            + "LEFT JOIN attributes n ON n.block_id = a.block_id AND n.name = 'name' "
            + "LEFT JOIN attributes m ON m.block_id = a.root_id AND m.name = 'custom-doc-num-meta' "
            + "LEFT JOIN blocks d ON d.id = a.root_id AND d.type = 'd' "
            + "LEFT JOIN blocks b ON b.id = a.block_id "
            + "WHERE a.name = 'custom-xref' LIMIT -1");
        if (!rows || !rows.length) return null;
        const out = rows.filter((r) => r.id && r.name).map((r) => {
            let meta = null;
            try { meta = r.meta ? JSON.parse(String(r.meta)) : null; }
            catch (e) { meta = null; }
            const md = r.md || "";
            return {
                id: r.id, docId: r.docId, kind: r.kind, name: r.name,
                docMeta: meta, docTitle: r.docTitle || "", chapterLabel: r.docTitle || "",
                curMd: md, oldMd: md.slice(0, 60),
                hPath: "", hLv: 0, hText: "", seq: 0,
            };
        });
        // numeric:true 保证「图 3-2」排在「图 3-10」前（纯字典序会反过来）
        out.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined,
            { numeric: true }) || String(a.docId).localeCompare(String(b.docId)));
        return out.length ? out : null;
    }

    /** 当前文档的编号元数据：一次 SQL，必要时沿 path 再查一次祖先；各层级链键本地算。 */
    async pickerChainMeta(docId) {
        if (!docId) return null;
        const escId = (x) => String(x).replace(/'/g, "''");
        try {
            const rows = await sql("SELECT id, path, ial FROM blocks WHERE id='"
                + escId(docId) + "' LIMIT 1");
            const row = rows && rows[0];
            if (!row) return null;
            let meta = xrParseMeta(row.ial);
            if (!meta || !meta.rootNum) {
                const seg = String(row.path || "").replace(/^\/+/, "").split("/")
                    .map((x) => String(x).replace(/\.sy$/, "")).filter(Boolean);
                const ancIds = seg.slice(0, -1).reverse().filter((x) => x !== docId);
                if (ancIds.length) {
                    const inl = ancIds.map((x) => "'" + escId(x) + "'").join(",");
                    const ars = await sql("SELECT id, ial FROM blocks WHERE id IN ("
                        + inl + ") LIMIT -1");
                    const byAnc = new Map((ars || []).map((r) => [r.id, r]));
                    for (const aid of ancIds) {
                        const m = xrParseMeta(byAnc.get(aid) && byAnc.get(aid).ial);
                        if (m && m.rootNum) { meta = m; break; }
                    }
                }
            }
            return meta || null;
        } catch (e) { return null; }
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
        let scopeMode = false;
        let defaultChapter = "";
        let allRows = [];                 // v1.2.8：全范围题注，切层级时重新过滤
        let levelList = [];               // v1.2.8：可选范围层级 1..n
        let levelKeys = new Map();        // v1.2.8：L -> 当前文档在该层级的范围键
        let curLevel = 0;
        let rebuildRows = null;           // v1.2.8：切层级时重算 rows / sections
        let widenNote = "";               // v1.2.11：空范围自动放宽的说明，显示在头部副标题
        try {
            if (this.settings.scopeEnabled) {
                /* v1.2.8：窗口范围 = 当前文档所在「第 L 级链」（rootID | rootNum 前 L 段）。
                 * L 默认 = 章节前缀层级 - 1（同篇内可跨章）；想跨篇就切到 1 级目录。
                 * 层级信息直接取文档属性 custom-doc-num-meta 的 rootID / rootNum，
                 * 不再额外推算。超出该链的题注在 rows 层就被砍掉，窗口没有「全部范围」
                 * 放行口，也不跨笔记本 / 不跨 top 目录。 */
                /* v1.2.18 弹窗提速：弹窗不需要枚举文档树。
                 * 一条 attributes SQL 拿齐全库题注 + 文档编号元数据 + 文档名 + 正文，
                 * 不再调 resolveScope() / resolveScopeDocs() / 编号插件 rangeDocIdsOrdered()。
                 * SQL 异常或空结果才回退原完整链路，行为与改前一致。 */
                let docs = [];
                let planRows = null;
                try { planRows = await this.pickerAllRows(); }
                catch (e) { await logErr("openPicker/fast", e); }
                if (!planRows || !planRows.length) {
                    const cfg = await this.resolveScope();
                    docs = await this.resolveScopeDocs(cfg);
                    this._scopeCache = this._scopeCache || new Map();
                    const perDoc = await xrScopeCollectDocs(docs, {
                        concurrency: this.settings.scopeConcurrency || 20,
                        cache: this._scopeCache,
                        dirty: this._scopeDirty || null,
                    });
                    perDoc.forEach((pd) => this._scopeCache.set(pd.doc.id,
                        { doc: pd.doc, blocks: pd.blocks }));
                    const built = xrBuildScopePlan(perDoc, this.settings, this.settings.scopeMode);
                    planRows = built.plan;
                }
                const titles = new Map(docs.map((d) => [d.id, d.title || ""]));
                const byId = new Map(docs.map((d) => [d.id, d]));
                const pLevel = xrPickerLevel(this.settings.scopePrefixLevel);
                const pOv = xrPickerOverrides(this.settings.scopePrefixLevelByTarget || {});
                allRows = planRows.map((p) => {
                    const d = byId.get(p.docId) || { meta: p.docMeta, title: p.docTitle };
                    const meta = p.docMeta || d.meta || null;
                    const ck = xrChainKeyFromMeta(meta, xrLevelForDoc(d, pLevel, pOv));
                    return Object.assign({}, p, {
                        docTitle: p.docTitle || titles.get(p.docId) || "",
                        chapterLabel: p.chapterLabel || d.title || "",
                        chapterKey: ck,
                        hPath: ck,
                        docMeta: meta,
                    });
                });
                levelList = xrPickerLevelList(this.settings.scopePrefixLevel);
                // v1.2.9：记住的层级优先；没存过（-1）才走默认。0 是合法值，不能用 || 判断。
                curLevel = xrPickerSavedLevel(this.settings.pickerLevel, levelList,
                    xrPickerDefaultLevel(this.settings.scopePrefixLevel,
                        this.settings.scopePickerAuto !== false));
                // 当前文档编号元数据只查一次，各层级链键本地算（原来每级各一次 SQL）
                const curMeta = await this.pickerChainMeta(docId);
                if (levelList.length) {
                    for (const L of levelList) {
                        levelKeys.set(L, L > 0 ? xrChainKeyFromMeta(curMeta, L) : "");
                    }
                }
                rebuildRows = () => {
                    if (curLevel > 0) {
                        /* 硬过滤：只留与当前文档同一 rootID、同一前 L 段链的题注。
                         * key 取不到（当前文档没编号）→ 空列表，绝不回退全范围。 */
                        rows = xrPickerRowsInLevel(allRows, levelKeys.get(curLevel) || "", curLevel);
                        rows.forEach((x) => {
                            x.chapterKey = xrChainKeyFromMeta(x.docMeta, curLevel);
                            x.hPath = x.chapterKey;
                        });
                    } else {
                        // v1.2.9：L=0 = 跨所有笔记本（全范围）。分组键按文档自身第
                        // (n-1) 级链算，章节下拉仍能逐章节筛，但不再砍掉别的笔记本。
                        rows = allRows.slice();
                        rows.forEach((x) => {
                            x.chapterKey = xrChainKeyFromMeta(x.docMeta, pLevel) || x.docId;
                            x.hPath = x.chapterKey;
                        });
                    }
                    const chapters = new Map();
                    rows.forEach((x) => {
                        if (x.chapterKey && !chapters.has(x.chapterKey)) {
                            chapters.set(x.chapterKey, x.chapterLabel);
                        }
                    });
                    sections = Array.from(chapters.entries())
                        .map(([id, text]) => ({ id: id, lv: 1, text: text }))
                        .sort((x, y) => String(x.text).localeCompare(String(y.text)));
                };
                rebuildRows();
                /* v1.2.11：当前层级一条题注都没有 → 自动往更宽的一级试探，窗口照常弹。
                 * 典型复现：文档 rootNum 只有 "1.1" 两段，却记住了第 3 级，链键算不出 →
                 * rows 为空；升到第 2 级就能看到本文档的「图 1-1」。
                 * 只自动到 1 级，绝不自动跨到 0 级（跨笔记本必须用户主动选）。
                 * 自动放宽只影响本次面板，不写回 settings.pickerLevel，不污染记住的选择。 */
                if (!rows.length && levelList.length) {
                    const widened = xrPickerFirstNonEmptyLevel(
                        allRows, levelKeys, levelList, curLevel, false);
                    if (widened.level !== curLevel) {
                        curLevel = widened.level;
                        rebuildRows();
                    }
                    // 放宽后仍一条都没有 → 别谎报「已找到」，明确引导手动切 0 级
                    widenNote = widened.found
                        ? tr("picker.autoWiden", curLevel === 0
                            ? tr("picker.level0") : tr("picker.levelN", curLevel))
                        : tr("picker.widenNone");
                }
                defaultChapter = "";   // 层级已硬过滤，章节下拉默认「当前范围全部」
                scopeMode = true;
            } else {
                // 用 collectFresh 而不是 collectBlocks：面板刚打开时，用户可能刚写完一个题注，
                // blocks 表索引还没跟上（实测 0.6~2s）→ 采不到它，面板里就少一条。
                const fresh = await collectFresh(docId, protyle);
                const built = buildPlan(fresh.blocks, this.settings);
                rows = built.plan;
                sections = built.sections || [];
            }
        } catch (e) {
            await logErr("openPicker:collect", e);
            showMessage(tr("msg.readFail", e && e.message ? e.message : e), 8000, "error");
            return;
        }
        /* v1.2.11：本文档 / 当前层级没识别到图/表/公式时**也照常弹窗**。
         * 旧版在这里弹一句「本文档没识别到图/表/公式」就退出，用户连切换范围层级的
         * 机会都没有 —— 但当前层级空常常只是链太深，往上升一级就有题注了。
         * 空列表由 render() 里的「没有匹配项」占位承接，↑↓ / Enter 都有空值保护。 */
        if (!rows.length && !scopeMode) widenNote = tr("picker.emptyScopeOff");

        const mask = document.createElement("div");
        mask.className = "xr-mask";
        const panel = document.createElement("div");
        panel.className = "xr-panel";

        // 头部：图标 + 标题 + 当前筛选与条数。和思源 Dialog 的标题栏同一套观感（细边框、6px 圆角）
        const head = document.createElement("div");
        head.className = "xr-head";
        const headIco = document.createElement("div");
        headIco.className = "xr-ico";
        headIco.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M10.2 13.6a4.6 4.6 0 0 0 6.5 0l3-3a4.6 4.6 0 0 0-6.5-6.5l-1.6 1.6"/>' +
            '<path d="M13.8 10.4a4.6 4.6 0 0 0-6.5 0l-3 3a4.6 4.6 0 0 0 6.5 6.5l1.6-1.6"/></svg>';
        const headTx = document.createElement("div");
        headTx.className = "xr-headtx";
        const headTitle = document.createElement("b");
        headTitle.textContent = tr("picker.title") + (scopeMode ? " · " + tr("picker.scope") : "");
        const headSub = document.createElement("span");
        headSub.className = "xr-sub";
        headTx.appendChild(headTitle);
        headTx.appendChild(headSub);
        head.appendChild(headIco);
        head.appendChild(headTx);

        // 搜索框：图标 + 无边框输入，聚焦时整条描边亮起来（跟思源输入框的习惯一致）
        const search = document.createElement("div");
        search.className = "xr-search";
        const searchIco = document.createElement("span");
        searchIco.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/>' +
            '<path d="M20 20l-3.6-3.6"/></svg>';
        const input = document.createElement("input");
        input.className = "xr-input";
        input.placeholder = tr("picker.ph");
        search.appendChild(searchIco);
        search.appendChild(input);
        // 筛选条：左边是类型（全部 / 图 / 表 / 式），右边是「只看某一节」的章节下拉。
        // 图表公式几十上百条时，光靠打字搜编号太慢（用户 2026-11-01 提）。
        const tools = document.createElement("div");
        tools.className = "xr-tools";
        const chipBox = document.createElement("div");
        chipBox.className = "xr-chips";
        const secSel = document.createElement("select");
        secSel.className = "b3-select xr-sec";
        secSel.title = tr("picker.secTip");
        // v1.2.8：范围层级下拉。级数越小范围越大（1 级 = 可跨篇），
        // 每一级都严格锁在「同一 rootID + 同一前 L 段链」内。
        const levelSel = document.createElement("select");
        levelSel.className = "b3-select xr-sec xr-level";
        levelSel.title = tr("picker.levelTip");
        tools.appendChild(chipBox);
        tools.appendChild(levelSel);
        tools.appendChild(secSel);
        const list = document.createElement("div");
        list.className = "xr-list";
        // 底栏只放键位符号 + 条数，不做翻译，10 种语言下都不会串
        const foot = document.createElement("div");
        foot.className = "xr-foot";
        foot.innerHTML = "<span><kbd>↑</kbd><kbd>↓</kbd></span>" +
            "<span><kbd>Enter</kbd></span><span><kbd>Esc</kbd></span>";
        const footCount = document.createElement("span");
        footCount.className = "xr-count";
        foot.appendChild(footCount);
        panel.appendChild(head);
        panel.appendChild(search);
        panel.appendChild(tools);
        panel.appendChild(list);
        panel.appendChild(foot);
        mask.appendChild(panel);
        document.body.appendChild(mask);
        input.focus();

        // 公式行要渲染成真公式（用户 2026-11-01 反馈：别显示 $$ y=1-sin(x) \tag{2-1} $$ 这种源码）
        // v1.2.18：加载 KaTeX 移出关键路径 —— 先出窗口，再异步加载、只重绘一次列表。
        // 没有公式候选时完全不加载，省掉最多 1.2s 的轮询等待。
        let renderMath = null;
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
            // 题注原文开头就是编号（「图 1-1 …」），左边胶囊已经显示过了，这里切掉，避免一行两个「图 1-1」
            let txt = String(x.oldMd || "").replace(/\n/g, " ").trim();
            if (x.name && txt.indexOf(x.name) === 0) txt = txt.slice(x.name.length).trim();
            return esc(txt.slice(0, 60)) || "—";
        };
        // ── 筛选：类型（图/表/式） + 所属标题 ────────────────────────────
        // v1.2.9：三个筛选控件（类型按钮 / 层级下拉 / 章节下拉）记住上次选择。
        // 搜索框不在其中：每次打开都清空，免得上次的词把列表挡空。
        const savedType = ["", "fig", "tab", "eq"].indexOf(this.settings.pickerType) >= 0
            ? this.settings.pickerType : "";
        let typeFilter = savedType;
        let secFilter = "";   // paintSections 之后按可选项校验再恢复
        const savedSecWanted = String(this.settings.pickerSec || "");
        let items = [];
        let cur = 0;
        /** 章节 + 搜索词都满足的项（不含类型判断）——chip 上的计数用它 */
        const baseRows = () => filterPickerRows(rows, { secId: secFilter, q: input.value });
        const applyFilter = () => {
            const r = filterPickerRows(rows,
                { kind: typeFilter, secId: secFilter, q: input.value });
            // v1.2.18：按思源内置 name（「图 3-1 / 表 3-1 / 式 3-1」）自然序排，
            // numeric:true 保证「图 3-2」在「图 3-10」前；编号已含章节号，天然分组。
            if (scopeMode) r.sort((a, b) =>
                String(a.name || "").localeCompare(String(b.name || ""), undefined,
                    { numeric: true }) ||
                String(a.docId || "").localeCompare(String(b.docId || "")));
            return r;
        };

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
                this.settings.pickerType = typeFilter;
                this.savePickerState();
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

        // 章节下拉：只列「真的有图/表/式」的标题，免得长文档里一整屏都是空节。
        // v1.2.8：切范围层级后要重建，抽成函数。
        const paintSections = () => {
            const secIds = new Set();
            rows.forEach((x) => { if (x.hPath) x.hPath.split("/").forEach((id) => secIds.add(id)); });
            secSel.innerHTML = "";
            const optAll = document.createElement("option");
            optAll.value = "";
            // 「全部」只指当前范围层级内的全部章节，绝不代表跨范围
            optAll.textContent = scopeMode ? tr("picker.allInLevel") : tr("picker.allSec");
            secSel.appendChild(optAll);
            let secCount = 0;
            sections.forEach((sec) => {
                if (!secIds.has(sec.id)) return;
                const opt = document.createElement("option");
                opt.value = sec.id;
                // H2 缩进两格 → 一眼看出层级，跟思源大纲的缩进习惯一致
                opt.textContent = scopeMode
                    ? (sec.text || tr("picker.secNone"))
                    : "H" + sec.lv + " " + new Array(Math.max(0, sec.lv)).join("\u3000") +
                        (sec.text || tr("picker.secNone"));
                secSel.appendChild(opt);
                secCount += 1;
            });
            // 整篇一个标题都没有（纯图片集 / 单节文档）：藏起来，别白占一行
            secSel.style.display = secCount ? "" : "none";
            secSel.value = "";
        };
        paintSections();
        // v1.2.9：恢复上次选的章节（只在该章节这次真的存在时），否则保持「当前范围全部」
        const secIdsNow = Array.prototype.slice.call(secSel.options).map((o) => o.value);
        secFilter = xrPickerSavedSec(savedSecWanted, secIdsNow);
        if (secFilter) secSel.value = secFilter;
        this.settings.pickerSec = secFilter;
        secSel.addEventListener("change", () => {
            secFilter = secSel.value;
            this.settings.pickerSec = secFilter;
            this.savePickerState();
            refresh();
        });
        // 下拉会把焦点抢走，选完还给输入框，否则 ↑↓ / Enter 全失效
        secSel.addEventListener("blur", () => { try { input.focus(); } catch (e) { /* 忽略 */ } });

        // v1.2.9 范围层级下拉：0 = 跨所有笔记本；1..n 每级锁 rootID | 前 L 段链。
        // 级数越小范围越大；0 是唯一能跨笔记本的一档（用户主动选）。
        if (scopeMode && levelList.length) {
            levelList.forEach((L) => {
                const opt = document.createElement("option");
                opt.value = String(L);
                const n = xrPickerRowsInLevel(allRows, levelKeys.get(L) || "", L).length;
                opt.textContent = (L === 0 ? tr("picker.level0") : tr("picker.levelN", L)) + " · " + n;
                if (L === curLevel) opt.selected = true;
                levelSel.appendChild(opt);
            });
            levelSel.addEventListener("change", () => {
                curLevel = Number(levelSel.value) || 0;   // 0 是合法值，不能 || curLevel
                widenNote = "";   // v1.2.11：用户已手动选档，自动放宽的说明作废
                if (rebuildRows) rebuildRows();
                secFilter = "";
                paintSections();
                this.settings.pickerLevel = curLevel;
                this.settings.pickerSec = "";
                this.savePickerState();
                refresh();
            });
            levelSel.addEventListener("blur", () => { try { input.focus(); } catch (e) { /* 忽略 */ } });
        } else {
            levelSel.style.display = "none";
        }

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
                /* v1.2.10：去掉单独占一行的文档名分组标题（列表显乱），
                 * 文档名改到本行最右侧；范围模式才显示（单文档模式只有一篇，显示无意义）。 */
                const docName = scopeMode
                    ? String(x.chapterLabel || x.docTitle || "").trim() : "";
                const it = document.createElement("div");
                it.className = "xr-item" + (i === cur ? " xr-cur" : "");
                it.innerHTML = '<span class="xr-name">' + esc(x.name) + "</span>" +
                    '<span class="xr-preview">' + previewOf(x) + "</span>" +
                    (docName ? '<span class="xr-doc" title="' + esc(docName) + '">' +
                        esc(docName) + "</span>" : "");
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
            // v1.2.16：在已有文字后面插入时，思源会把 <span data-type="block-ref">
            // 降级成 <span data-type="text" style="white-space: normal">（纯文本）。
            // 插完自检，降级就用整块 dom 写回修正（实测整块 DOM 写入能保留 ((id "锚"))）。
            fixInlineRef(anchorId, x.id, x.name);

        };
        const onKey = (ev) => {
            // 章节/层级下拉自己要用方向键，别在这里截走
            if (ev.target === secSel || ev.target === levelSel) return;
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
            // 头部副标题 + 底栏计数：筛选条件一变就跟着走，一眼知道「现在是哪一类、多少条」
            const label = typeFilter ? tr("label." + typeFilter) : tr("picker.all");
            const secNow = secSel.selectedOptions && secSel.selectedOptions[0];
            // v1.2.11：记住的类型把结果全筛掉时，明确告诉用户「点全部就能看到」，
            // 但不擅自改掉他记住的选择（状态持久化仍生效）。
            const hidden = (!items.length && typeFilter) ? baseRows().length : 0;
            const typeHint = hidden > 0 ? tr("picker.typeEmptyHint", hidden) : "";
            headSub.textContent = ((secFilter && secNow)
                ? label + " · " + secNow.textContent.trim() : label) +
                (widenNote ? " · " + widenNote : "") +
                (typeHint ? " · " + typeHint : "");
            footCount.textContent = String(items.length);
        };
        input.addEventListener("input", refresh);
        mask.addEventListener("mousedown", (ev) => { if (ev.target === mask) close(); });
        refresh();   // 先同步出窗口，不让 KaTeX 挡住

        // v1.2.18：窗口已可见，再慢慢渲染公式；完成后只重绘一次列表。
        if (rows.some((x) => x.kind === "eq") || allRows.some((x) => x.kind === "eq")) {
            ensureMathRenderer().then((fn) => {
                if (!fn || !document.body.contains(mask)) return;
                renderMath = fn;
                render();
            }).catch(() => { /* 渲染不出来就保持 LaTeX 源码 */ });
        }
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
    ialValue: ialValue, restoreDeadInMd: restoreDeadInMd, countRestored: countRestored,
    prefixKind: prefixKind, NUM_HEAD: NUM_HEAD, captionLabelList: captionLabelList,
    // v1.1.0 多文档范围重排纯函数（离线可测）
    xrScopeResolve: xrScopeResolve, xrScopeDocTag: xrScopeDocTag,
    xrScopeAnchor: xrScopeAnchor, xrScopeRefs: xrScopeRefs,
    xrScopeShouldRun: xrScopeShouldRun, xrBuildScopePlan: xrBuildScopePlan,
    xrMapLimit: xrMapLimit, XR_REF_RE: XR_REF_RE,
    xrDecodeIalText: xrDecodeIalText, xrParseMeta: xrParseMeta,
    xrScopePrefix: xrScopePrefix,
    xrLevelChain: xrLevelChain, xrDocsInChain: xrDocsInChain,
    xrChainKeyFromMeta: xrChainKeyFromMeta, xrDocChainKey: xrDocChainKey,
    xrLevelForDoc: xrLevelForDoc, xrPickerLevel: xrPickerLevel,
    xrPickerOverrides: xrPickerOverrides,
    xrPickerRowsInLevel: xrPickerRowsInLevel, xrPickerLevelList: xrPickerLevelList,
    xrPickerDefaultLevel: xrPickerDefaultLevel,
    xrPickerSavedLevel: xrPickerSavedLevel, xrPickerSavedSec: xrPickerSavedSec,
    xrPickerFirstNonEmptyLevel: xrPickerFirstNonEmptyLevel,
    xrScopeSqlBlocks: xrScopeSqlBlocks, xrScopeCollectDocs: xrScopeCollectDocs,
    xrScopePickNeed: xrScopePickNeed, orderFromDocOrders: orderFromDocOrders,
    updateRefAnchors: updateRefAnchors, isAutoCaptionName: isAutoCaptionName };
module.exports = SiYuanXref;
