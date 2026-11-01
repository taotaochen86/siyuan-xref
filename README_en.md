# Figure, Table & Equation Cross-Reference (siyuan-xref) v1.0.3

**Chinese**: [README.md](./README.md) ｜ Install: SiYuan → Settings → Marketplace → Plugins → search "图表公式交叉引用" or `xref`

---

## 1 One-sentence summary

**It adds what SiYuan is missing: automatic numbering for figures, tables and equations, plus cross-references that follow the numbers wherever they move — so you never hand-type a number, and never search the whole document again after inserting one figure.**

Three things it does for you:

1. You type only the caption text (`rice paddy water level`); the number (`Figure 2`) is written in by the plugin, in document order.
2. You write "see Figure 2" in the body; the plugin keeps it as a **live reference bound to a block ID**, so when Figure 2 becomes Figure 3 the reference changes by itself.
3. When you delete, edit or undo something, the numbering is re-flowed as a whole and the references are refreshed — you do not have to remember where you referenced anything.

---

## 2 Main features

### 2.1 Automatic numbering (figures / tables / equations)

| Object | Where the number lives | How the plugin maintains it |
|---|---|---|
| Figure | Start of a standalone paragraph: `Figure 2 rice paddy water level` | Rewrites the leading number; the rest of the text is untouched |
| Table | Start of a standalone paragraph: `Table 1-1 experimental design` | Same |
| Equation | Inside the formula: `\tag{2}` | Replaces only the `\tag{…}` within `data-content`; the formula never goes through Lute and the block is never rebuilt |

- **Two numbering modes**: continuous across the document (Figure 1, 2, 3) or per chapter (switching at the shallowest heading level, Figure 1-1, 2-1).
- **Labels are configurable**: default 图 / 表 / 式, changeable to `Figure` / `Table` / `Eq` or anything else; the numbering logic is unchanged.
- **Automatic trigger**: a run is scheduled about 1.5 s after you stop typing and usually lands within 1–3 s, silently.
- **Manual trigger**: `Ctrl+Alt+N` or `/xrefnum`, any time, whole document.

### 2.2 Cross-references that follow the numbers

- `/xref` (or `Ctrl+Alt+R`) opens a list of every figure, table and equation in the document; type a number or caption keyword to filter, pick with ↑↓, press Enter to insert.
- What gets inserted is a **block reference** `((blockID "Figure 2"))`, not plain text — so it is clickable, and SiYuan counts it in backlinks.
- If the anchor text is stale at renumber time, the plugin rewrites "Figure 2" to "Figure 3" inside `((blockID "…"))`; the target block is unchanged.
- Multiple references in one paragraph and nested references are all refreshed; references stored in other documents are never touched (this document only).

### 2.3 One-click caption from the block menu (new in 1.0.3)

No need to remember `custom-xref="fig"` — right-click a paragraph and use the block menu:

| Menu item | Appears when | What it does |
|---|---|---|
| Set as figure caption | paragraph block | Writes `custom-xref="fig"`, numbers it as "Figure N" immediately, centres it and applies the tint |
| Set as table caption | paragraph block | Same, numbered as "Table N" |
| Clear caption | the paragraph **is already** a caption (has the attribute, or starts with "图 N") | Drops the attribute, the block name and the tint, strips the leading number, and shifts the following numbers up |

- **Immediate**: the right-click path takes the fast route (measured 620 ms); only the text-detection path waits 1–3 s for the index.
- **Multi-select works**: mark several paragraphs as figure (or table) captions in one go.
- **No stacking**: clicking "Set as figure caption" on a paragraph that already starts with "图 3" replaces the prefix instead of producing "图 4 图 3 …".
- SiYuan forces plugin menu items into the **"Plugin ›" submenu** (see [3.10](#310-plugin-menu-items-are-forced-into-a-plugin--submenu)); open "Plugin" and they are there.

### 2.4 Figures and tables: the caption goes in the right place

A figure or a table **cannot be its own caption block** — writing a number into an image block yields broken text like `图 1 ![img](…)`, and writing into a table block destroys the table. So right-clicking an image or a table offers "create the caption paragraph next to it":

| Right-click target | Menu item | Where the caption lands |
|---|---|---|
| Image | Add figure caption below | A new empty paragraph **below** the image (figure captions go under the figure) |
| Table | Add table caption above | A new empty paragraph **above** the table |
| Image / table | Turn the paragraph below (above) into a figure (table) caption | The neighbour already holds plain text — convert it in place, no new block |
| Image / table | Clear caption | Appears when the neighbour is already a caption; cleans everything in one go |

- **Inside table cells nothing appears at all** (including images inside a cell). Writing a number into a cell damages the table, so the entry point refuses and shows a grey hint.
- Equation blocks, code blocks and list blocks are refused too, each with its own grey hint ("equation blocks are numbered automatically, no caption needed"), so it never looks like the plugin is broken.

### 2.5 Undo / redo / rebuild deleted blocks

- **Why not `Ctrl+Z`**: the plugin writes through `/api/block/updateBlock`, and SiYuan's undo stack only records editor-initiated operations — **API writes never enter it** (see [3.5](#35-siyuans-ctrlz-cannot-undo-api-writes)). So the plugin keeps its own stack.
- `Ctrl+Alt+Z` steps back one run, `Ctrl+Alt+Y` steps forward; **10 runs** are kept by default (1–50 in settings), persisted in `undo-stack.json`, so **undo still works after restarting SiYuan**.
- **Deleted blocks are rebuilt with their original ID**: SiYuan's `insertBlock` preserves a `data-node-id` hard-coded in the DOM (measured in 1.0.2), so after deleting a figure, table or equation by mistake, `Ctrl+Alt+Z` brings the block back with the **exact same ID** and every `((blockID "Figure 2"))` pointing at it reconnects and stays clickable.

### 2.6 Dead references (default since 1.0.2: hands off)

| Mode | Behaviour |
|---|---|
| Leave untouched (**default**) | The reference is not modified at all and not painted red. Delete something by mistake, press `Ctrl+Alt+Z`, the block comes back |
| Mark only | Adds a red struck-through style to dead references as a hint; the reference itself is unchanged |
| Convert to red struck-through text (irreversible) | Burns `((blockID "Figure 2"))` down to plain text "Figure 2", **after waiting 10 s** so an undo can still save it |

- **References to a block whose caption was cleared** follow the same rule: clearing a caption puts references to it into dead-reference handling automatically, so no fake references to ordinary paragraphs are left behind.
- The decision is **derived from data, never from a state table**: set the caption back and the red mark disappears by itself, old leftovers included.
- References burnt by an older version can be restored with the **"Restore in this document"** button in settings (targets that no longer exist are skipped).

### 2.7 Caption layout

- **Centring**: figure and table caption paragraphs get `text-align: center` (equation blocks are already centred). Optional.
- **Tint**: a very faint semi-transparent background that works in dark themes. Four levels: none / faint / light (default) / light blue. A tint you set yourself is never overwritten.
- **Clearing a caption removes the tint the plugin added** but **keeps centring** (it may be your own setting, and it is needed when switching a paragraph between figure and table).

### 2.8 Long documents and stability

- Measured on a real 348-block document: one collection pass takes **2 round trips / ~0.33 s** (the old path took 349 round trips / 1.5 s).
- Every SQL query uses `limit -1`, so nothing is silently truncated at SiYuan's default 64 rows.
- Automatic and manual runs are mutually exclusive (`_running`), so they never write the same block at once.
- The global network probe is **off by default** and only installed when Diagnostic log is enabled (it costs performance).

---

## 3 What SiYuan problems this fixes

This section is the reason the plugin exists. Every item was measured, not guessed.

### 3.1 Reference anchor text is a hard-coded string

SiYuan **does not maintain reference text**: the "Figure 2" inside `((id "Figure 2"))` is a static string written at insertion time. Changing the target block's `name` does not update existing references — not across documents, not across devices, not on export. So once "Figure 2" becomes "Figure 3" because something was inserted before it, every "Figure 2" in the body becomes an orphan that collides with the new numbering and reads like a duplicate.

→ **What the plugin does**: while renumbering, it finds every reference pointing at those blocks via SQL and rewrites the anchor text, so a reference always shows the block's current number. This is the core value of the plugin.

### 3.2 The `blocks` table lags 0.6–2 s behind (sometimes more)

After `updateBlock` returns, SQL needs 0.6–2 s to see the change; a freshly inserted block may not be in the table at all. Any logic that "writes, then immediately reads, then decides what to write" will compute the wrong answer.

→ **What the plugin does**: it never decides from a SQL snapshot alone. The snapshot is validated against the top-level block IDs actually present in `protyle.wysiwyg.element`; missing blocks trigger a wait and re-collect. The right-click caption path skips the index entirely and confirms the attribute through `getBlockAttrs` (measured ≈0 ms) before renumbering. **That is why right-clicking takes 620 ms while text detection takes 1–3 s** — the difference is deliberate.

### 3.3 Deleted blocks leave a 2–4 s ghost in SQL

The `blocks` table keeps a deleted block for another 2–4 s. Deciding liveness from it gives you two wrong answers: right after a delete it always reports "no dead references", and a moment later it reports a pile of them. Worse, ghost rows still hold numbering slots and cause skipped numbers.

→ **What the plugin does**: liveness is decided by the real-time endpoint `/api/block/checkBlockExist` (measured: returns `false` within **0 ms** of a delete), with `getBlockDOM` (error text contains `block not found`) as fallback and SQL only as a last resort. When liveness cannot be decided it returns `null` and everything is treated as **alive** — false negatives are acceptable, false positives burn user content. Collected ghost blocks are tagged `stale` and re-verified through the real-time endpoint before being dropped.

### 3.4 SQL returns 64 rows by default and truncates silently

`/api/query/sql` returns at most 64 rows by default, and the rest is dropped without an error (`truncated: true`). That is how the old version silently skipped every caption in the second half of a long document.

→ **What the plugin does**: every statement writes `limit -1` explicitly; 348 blocks were verified to come back in full.

### 3.5 SiYuan's `Ctrl+Z` cannot undo API writes

SiYuan's undo stack only records edits initiated by the editor itself. The plugin writes through an HTTP endpoint, which never enters the stack — so `Ctrl+Z` only undoes your own typing, never the plugin's rewrite. That is not a bug but an architectural gap, and it is the real reason the old version felt like "the hotkey did nothing".

→ **What the plugin does**: it keeps its own undo stack: which blocks changed per run, each block's before/after DOM, and the previous values of `name` / `custom-xref` / `style`, persisted across restarts.

### 3.6 Writing with `markdown` mode wipes block attributes

Block attributes (`name`, `style`, `custom-xref`, your own `memo`, colours…) all live on the **root node** of the block's HTML. `updateBlock` with `dataType: "markdown"` rebuilds the whole block from markdown and **throws every root attribute away**.

→ **What the plugin does**: it always writes back with `dataType: "dom"` — fetch the current block DOM (with all its attributes), move the new content into the old root node, keep the root node as is, write back (see [9.1](#91-why-blocks-must-be-written-in-dom-mode)).

### 3.7 Equation bodies live in `data-content`, so rebuilding a block loses them

An equation's body is stored in the `data-content` attribute of the block's root node, **not in child nodes**. Any regular "fetch HTML → rework → write back" approach either loses the formula body or leaves a block that contains nothing but a number.

→ **What the plugin does**: equations take a dedicated path that replaces only the `\tag{…}` inside `data-content` and writes the block back unchanged — **no Lute pass, no rebuild, no touching child nodes**. Plus three safety nets: empty equations are never numbered, the whole run is skipped while a formula editor has focus, and a length check aborts the write if the new content is more than 40 % shorter than the old one (a sign of a partial fetch).

### 3.8 A table block cannot hold a number

Table blocks are `NodeTable` structures; writing a number into one destroys the table. SiYuan's native image caption covers images only, and there is no equivalent for tables.

→ **What the plugin does**: table captions always live in a **separate adjacent paragraph** (above the table). That paragraph can be centred, tinted, linked, styled, and it exports as ordinary text.

### 3.9 Single-quoted anchor text explodes on export

`((blockID 'Figure 2'))` (single quotes) is "dynamic anchor text": when exporting to Word / PDF it is replaced with the **full text of the target block** — an equation reference instantly turns into a long LaTeX dump.

→ **What the plugin does**: references are always inserted with **double quotes** (static anchor text), and this is stated as one of the three writing rules (see [5.5](#55-three-writing-rules-that-keep-it-sane)).

### 3.10 Plugin menu items are forced into a "Plugin ›" submenu

Before emitting `click-blockicon` / `open-menu-content`, SiYuan's app layer swaps `detail.menu` for a fresh `subMenu` and, once the event handlers return, attaches that whole subMenu as the **bottom-most "Plugin ›" item of the main menu**. So **anything added through `detail.menu.addItem` is doomed to the submenu**; tweaking `index`, adding separators or moving the DOM afterwards all fail (moving it also breaks the MenuItem host, so the menu no longer closes on click).

→ **What the plugin does**: instead of fighting the app layer, it takes the main menu instance (`window.siyuan.menus.menu`) and adds items at its root level, then moves them to the top. What you get: right-click → **top** of the menu is "Set as figure caption / Set as table caption", and the menu closes normally. This is the workable route found on 3.8.9 after reading `common.*.js`.

---

## 4 Pros and cons: SiYuan's own features and existing plugins

### 4.1 SiYuan's native mechanisms

| Capability | Pros | Limits |
|---|---|---|
| Image caption (the description attached to an image block) | Native, zero config, travels with the image | **Images only**; tables and equations have no equivalent; the caption cannot contain block references or links; export formatting is not controllable |
| Block reference `((id "anchor"))` | Two-way links, clickable, counted in backlinks | The anchor text is a **static string** and does not follow renumbering (3.1); single quotes break exports (3.9) |
| In-document SQL / API | Powerful and programmable | Index lag, 64-row truncation, ghost rows — naive use computes the wrong answer (3.2–3.4) |
| SiYuan `Ctrl+Z` | Covers in-editor operations | **Does not cover plugin / API writes** (3.5) |

**Conclusion**: SiYuan lays excellent groundwork with block-level references, but **never extends it to academic numbering** — numbers that stay continuous, stay stable across edits, and propagate to every reference at once. Those three things are unmanaged natively.

### 4.2 Document-styling / cross-reference plugins in the marketplace

The marketplace already has mature "document styling / typography enhancement" plugins (for example `document-styler`, whose public description lists automatic heading numbering plus figure and table cross-references). Their approach differs from this plugin:

| Dimension | Styling-oriented plugins (the common approach) | This plugin (siyuan-xref) |
|---|---|---|
| Entry point | Mostly **CSS / styling plus structural conventions**; one plugin bundles layout, heading numbering, captions and cross-references | Does **numbering and referencing only**, but all the way down |
| Structural requirement | Usually requires the figure/table and its caption to form a **super block** to be recognised (to avoid false positives) | No super block needed; recognised through **block attributes + adjacent paragraphs**, so existing layout stays as it is |
| Where the number is written | Mostly presentation-level numbering rendered by CSS | **Written into the text and into `\tag`** — real characters, so numbers survive Word / PDF export, copy-paste and third-party tools |
| Update timing | Implementation-dependent; public notes have mentioned occasional delays | Automatic run after typing + manual run + fast right-click path; every deferral is logged and retried |
| Undo | Typically none (native undo cannot reach API writes either) | Own 10-run undo stack, and **deleted blocks are rebuilt with their original ID** |
| Caption position | Determined by the structure | Figure caption below, table caption above (academic convention); disabled inside table cells |
| Trade-off | One-stop: several problems solved by one plugin | **Numbering and referencing only**; heading numbering and typography need other plugins; captions must be standalone paragraphs |

**Where this plugin sits**: if what you want is "one paper or report where Figure 1, Table 1 and Eq. (1) are consistent throughout, body references follow automatically, and the numbers are still there after export", that is its only goal. If you want a full typography regime or automatic heading numbering, it is not a replacement — use it alongside a styling plugin.

### 4.3 Strengths and costs of this plugin

**Strengths**

1. Numbers are **real text**, not CSS rendering — they survive export, copy and third-party reads.
2. References are **block references**: clickable, backlink-aware, with anchor text that keeps itself in sync.
3. **Zero migration** for existing documents: no super blocks to add, no layout to change; recognition uses attributes plus adjacent paragraphs.
4. **Mistakes are recoverable**: undo stack plus rebuild-by-original-ID, and references reconnect by themselves.
5. Every failure path leaves a trace (`giveup:<reason>` in `err-log.json`); nothing fails silently.

**Costs**

1. Captions must be **standalone paragraphs** (a table block cannot hold a number, see [3.8](#38-a-table-block-cannot-hold-a-number)).
2. Plugin writes create **block history entries** (rollback is possible in document history).
3. Undo only covers blocks the plugin touched; manual edits made to them in between are reverted too.
4. You have to follow three writing rules ([5.5](#55-three-writing-rules-that-keep-it-sane)), otherwise the numbering will get messy.

---

## 5 Dependencies and configuration

### 5.1 Runtime requirements

| Item | Requirement |
|---|---|
| SiYuan | **3.7.0 or newer** (`minAppVersion`); developed and verified on 3.8.9 (Windows) |
| Backend | Any (`backends: all`: local kernel / cloud / self-hosted) |
| Frontend | Fully supported on desktop; on mobile, automatic numbering and manual renumbering work, right-click menu interactions follow SiYuan's own behaviour |
| Third-party dependencies | **None.** A hand-written CommonJS plugin: no build step, no npm packages, no network calls, no data leaves your machine |
| Account / network | Not required |

### 5.2 Kernel endpoints used

| Endpoint | Purpose |
|---|---|
| `/api/query/sql` | Collect block lists, caption attributes and reference locations (always with `limit -1`) |
| `/api/filetree/getDoc` | Fetch the whole document HTML once; the order of `data-node-id` occurrences defines document order |
| `/api/block/getBlockDOM` | Fetch block DOM (the basis for writing back in dom mode) |
| `/api/block/updateBlock` | Write block content back (**always `dataType: "dom"`**) |
| `/api/block/insertBlock` | Create caption paragraphs / rebuild deleted blocks with their original ID on undo |
| `/api/block/checkBlockExist` | Real-time liveness check (returns false within 0 ms of a delete) |
| `/api/block/getBlockKramdown` | Fallback content read |
| `/api/attr/getBlockAttrs` · `/api/attr/setBlockAttrs` | Read / write `custom-xref`, `name`, `style` |
| `/api/block/getChildBlocks` | Fallback ordering (when `getDoc` fails entirely) |

Plugin-side capabilities: `protyleSlash` (slash triggers), `addCommand` (native commands, rebindable under Settings → Hotkeys → Plugin), `fetchSyncPost`, `eventBus` (`ws-main` transaction events drive the automatic run).

### 5.3 Where data lives

All under `workspace/data/storage/petal/siyuan-xref/`:

| File | Content |
|---|---|
| `settings.json` | Plugin settings |
| `undo-stack.json` | Undo stack (10 runs by default, persists across restarts) |
| `dead-fix-log.json` | Records of references burnt by "convert to text" (last 60, used by "Restore") |
| `err-log.json` | Errors and deferral reasons (`giveup:<reason>`); check here when "nothing was numbered" |
| `load-check.json` | Load self-check (`loadedAt` later than the `index.js` mtime means the new code really ran) |
| `ws-log.json` | Only produced while Diagnostic log is enabled |
| `trace/` | Diagnostic traces |

### 5.4 Settings reference

Settings live under **Settings → Marketplace → Downloaded → Figure, Table & Equation Cross-Reference → Settings**.

| Option | Default | Notes |
|---|---|---|
| Numbering mode | Continuous | Continuous across the document (Figure 1, 2) or per chapter (Figure 1-1, 2-1, switching at the shallowest heading level) |
| Labels | 图 / 表 / 式 | Caption prefixes; can be set to `Figure` / `Table` / `Eq` |
| Refresh references while renumbering | On | Off = only numbers change, existing references are left alone |
| Auto renumber | On | Fires about 1.5 s after you stop typing; never writes into the block holding the caret |
| Text auto-detection | On | Paragraphs starting with "图 3 …" / "表 2 …" are treated as captions. Turn it off to **trust only right-clicked captions**, so an ordinary sentence like "图 3 中可以看出" is never numbered. Right-clicked captions are unaffected by this switch and apply immediately |
| Dead references | Leave untouched | Leave untouched (recommended) / Mark only / Convert to red struck-through text (irreversible, waits 10 s) |
| Centre captions | On | Figure/table caption paragraphs are centred automatically |
| Caption tint | Light | None / faint / light / light blue (semi-transparent, works in dark themes) |
| Custom hotkeys | Ctrl+Alt+R / N / Z / Y | Four fields: insert reference, renumber, undo, redo. Click a field and press the combination; `Backspace` clears, `Esc` cancels |
| Undo depth | 10 | How many runs the undo stack keeps (1–50) |
| Restore dead references | — | Button: rewrites burnt references back to `((blockID "anchor"))`, skipping targets that no longer exist |
| Diagnostic log | Off | **Troubleshooting only.** Hooks global network calls and writes `ws-log.json`; leaving it on costs performance |

### 5.5 Three writing rules that keep it sane

1. **Write captions as standalone paragraphs**: `Figure 2 rice paddy water level`. A table block cannot hold a number. Renumbering also centres that line and tints it.
2. **Put equation numbers in `\tag`**: `$$ … \tag{2} $$`, maintained automatically; empty equations are never numbered.
3. **Use double quotes in references**: `((blockID "Figure 2"))`. Never single quotes — single quotes mean dynamic anchor text and expand to the block's full content on Word / PDF export (an equation becomes a LaTeX dump), see [3.9](#39-single-quoted-anchor-text-explodes-on-export).

---

## 6 Triggers and hotkeys

### 6.1 Slash triggers

Type `/` in the editor, then any of:

| Trigger (any one) | What it does |
|---|---|
| `/xref` `/交叉引用` `/图ref` `/tref` | Opens the figure / table / equation list: search → ↑↓ → Enter to insert a reference |
| `/xrefnum` `/重排编号` `/图表编号` | Renumbers the whole document right away and refreshes references |

### 6.2 Hotkeys

| Action | Default | Notes |
|---|---|---|
| Insert cross-reference | `Ctrl+Alt+R` | Same as `/xref` |
| Renumber now | `Ctrl+Alt+N` | Same as `/xrefnum` |
| Undo last renumber | `Ctrl+Alt+Z` | The plugin's own undo stack (SiYuan's `Ctrl+Z` cannot undo API writes) |
| Redo | `Ctrl+Alt+Y` | Pairs with undo |

- All four can be re-recorded in **plugin settings → Custom hotkeys**; the change applies immediately and is written to `settings.json`.
- The same actions are also registered as **native commands**, so they appear under **Settings → Hotkeys → Plugin → Figure, Table & Equation Cross-Reference**. Setting the same key in both places still runs the action only once (400 ms de-duplication).

### 6.3 Block right-click menu

Right-click a paragraph / image / table → the top of the menu:

| Target | Menu items |
|---|---|
| Ordinary paragraph | Set as figure caption ／ Set as table caption |
| Paragraph that already is a caption | The two above + Clear caption |
| Image | Add figure caption below ／ Turn the paragraph below into a figure caption ／ Clear caption |
| Table | Add table caption above ／ Turn the paragraph above into a table caption ／ Clear caption |
| Anywhere inside a table cell (including images in a cell) | **No caption menu at all**, only a grey hint |
| Equation block / code block | No menu; grey hint "equation blocks are numbered automatically, no caption needed" |

### 6.4 Hotkey caveats

- A combination **must include Ctrl / Alt / ⌘** (single keys are rejected on purpose so typing never triggers them).
- Hotkeys are ignored in inputs, search boxes, the settings panel and the reference picker — they never steal your typing.
- They are ignored while an IME is composing.
- `Ctrl+Alt+Z` equals "undo" in some editors; SiYuan's undo is `Ctrl+Z`, so there is no conflict. If another plugin also claims `Ctrl+Alt+Z`, rebind one of them in settings.

---

## 7 Usage and step-by-step instructions

### 7.1 Install and enable

1. SiYuan → Settings → Marketplace → Plugins, search "图表公式交叉引用" or `xref`, click Install.
2. Under **Settings → Marketplace → Downloaded**, make sure **siyuan-xref is enabled**.
3. Open any document and type `/xref`; seeing the "交叉引用" entry means it loaded.
4. If the entry is missing: toggle the plugin off and on; if that fails, check `load-check.json` and `err-log.json` under `data/storage/petal/siyuan-xref/`.

> ⚠️ If behaviour does not change after an update, toggle siyuan-xref **off and on again** under Settings → Marketplace → Downloaded. In some environments SiYuan's enable endpoint returns success without reloading the frontend; this is the fastest way to tell.

### 7.2 Add a figure caption (recommended path)

1. Right-click the image → click **"Add figure caption below"** at the top of the menu.
2. An empty paragraph appears below the image; click into it (or the caret is already there).
3. Type only the caption text — **do not type "Figure 1" yourself**, e.g. `rice paddy water level`.
4. After 1.5–3 s the plugin writes `图 1 rice paddy water level`, centred and tinted.

> To reuse text you already wrote next to the image: right-click the image → "Turn the paragraph below into a figure caption"; it converts in place without creating a block.

### 7.3 Add a table caption

1. Right-click the table → **"Add table caption above"**.
2. An empty paragraph appears above the table; type the caption text (again, without typing "Table 1").
3. It becomes `表 1 experimental design`, centred and tinted.

> Table captions above, figure captions below — the academic convention; the plugin hard-codes the difference so you do not have to remember it.

### 7.4 Number an equation

1. Insert an equation block and write the body: `y = A \sin(x)`.
2. Put the number in `\tag`: `\tag{1}` (the plugin adds it if missing).
3. An equation block **needs no caption paragraph**; the number lives in `\tag`. A body paragraph starting with "式 N …" is not numbered (to avoid double counting).
4. Empty equations are never numbered — a guard against blocks that contain nothing but a number.

### 7.5 Insert a cross-reference

1. Put the caret where the reference should go.
2. Type `/xref` and press Enter, or press `Ctrl+Alt+R`.
3. Filter by number or caption keyword (e.g. type `2` or `water`).
4. ↑↓ to select, Enter to insert, `Esc` to close.
5. The result is `((blockID "Figure 2"))`, displayed as a clickable "Figure 2".

### 7.6 Clear a caption

1. Right-click the caption paragraph (or the image / table it belongs to) → **"Clear caption"**.
2. The plugin then: drops `custom-xref` → clears the block name (only when it is an automatic "图 N" name; a name you chose yourself is kept) → removes the tint it added → strips the leading number.
3. Following numbers shift up; references to it are handled according to the "Dead references" setting (leave untouched by default).

> Order matters: attributes must be cleared before the prefix is stripped. The other way round, the write-back DOM brings the attributes back — number gone, attribute still there.

### 7.7 Recover a deleted figure / table / equation

1. Do not edit anything else first.
2. Press `Ctrl+Alt+Z` (plugin undo).
3. The deleted block is rebuilt with its **original ID**, with `name` / `custom-xref` / centring / tint restored; body references reconnect immediately.
4. It lands at the **end of its original parent**, so you may need to drag it back inside that container.

### 7.8 Per-chapter numbering (Figure 1-1)

1. Settings → Numbering mode → **per chapter**.
2. Chapters switch at the **shallowest heading level** in the document: if it only uses `##`, chapters break at `##`; if it uses both `#` and `##`, they break at `#`.
3. Existing "Figure 1" becomes "Figure 1-1" on the next run, and references are refreshed.

### 7.9 Switch to English labels (Figure / Table / Eq)

1. Settings → "图 / 表 / 式 标签": enter `Figure` / `Table` / `Eq`.
2. The next run rewrites both the body prefixes and the reference anchor text.
3. Existing captions need no change — recognition is based on the "label + number" pattern.

### 7.10 Fully manual mode

1. Turn **Auto renumber** off in settings.
2. Press `Ctrl+Alt+N` or run `/xrefnum` when you want it.
3. Manual runs respect the same protection windows (typing in an equation / code editor gets "try again later"), so they never corrupt the block you are editing.

### 7.11 Upgrading from older versions

- 1.0.1 → 1.0.2: the default for "Dead references" changed from "convert to text" to "leave untouched"; the plugin **migrates your setting once** if you never changed it, and burnt references can be recovered with "Restore in this document".
- 1.0.2 → 1.0.3: adds the figure/table right-click captions and the "Text auto-detection" switch; no migration needed.
- If behaviour does not change after upgrading, toggle the plugin off and on (see [7.1](#71-install-and-enable)).

---

## 8 Known gaps

Listed honestly — do not expect what it cannot do.

### 8.1 Functional boundaries

1. **Current document only**, no cross-document numbering. Book-wide consistency (e.g. "Figure 1-1 across the whole book") is out of scope.
2. **Captions must be standalone paragraphs.** A table block cannot hold a number, and SiYuan's native image caption (the description inside an image block) does not participate in this plugin's numbering.
3. **`\tag` only.** Any other way of writing an equation number by hand (e.g. `\qquad (1)`) is neither recognised nor maintained.
4. **No sub-figure / sub-table numbering** (Figure 1(a), 1(b)), and no automatic list of figures or tables.
5. **The settings panel is Chinese only.** All features work for English users, but the option labels are in Chinese — a known shortfall; i18n is planned.

### 8.2 Known risks and caveats

1. **Undo only rolls back blocks the plugin touched.** If you edited one of them in between, undo restores the older value — mind the timing.
2. **A block that never went through a renumber is not in the undo stack**, so it cannot be rescued that way (use SiYuan's own `Ctrl+Z`).
3. **A rebuilt block lands at the end of its original parent**; drag it back if the exact position matters.
4. **The plugin waits while the caret rests in a block that needs rewriting**, so "the number did not change while I was writing" is expected; move the caret and it applies.
5. **Renumbering rewrites block content**, so extra entries appear in block history (rollback is possible there).
6. **"Convert to text" is irreversible.** Once burnt the block ID is gone; only "Restore in this document" can bring it back from the log (the target block must still exist).
7. **Text detection can over-match.** An ordinary sentence like "图 3 中可以看出…" will be treated as a caption. Two ways out: confirm captions via right-click, or turn "Text auto-detection" off and trust attributes only.
8. **The menu lives in the "Plugin ›" submenu** (a hard limitation of SiYuan's app layer, see [3.10](#310-plugin-menu-items-are-forced-into-a-plugin--submenu)). The plugin moves the items to the top of that submenu but cannot bypass the grouping entirely.
9. **Mobile**: automatic numbering and manual renumbering work; right-click block menus behave as SiYuan itself does and may not appear.

### 8.3 Troubleshooting and logs

Under `workspace/data/storage/petal/siyuan-xref/`:

| Symptom | Which file |
|---|---|
| Nothing gets numbered | `giveup:<reason>` in `err-log.json` (`busy` still typing / `cm` formula editor focused / `stale` index not caught up / `empty` nothing recognised) |
| Plugin installed but silent | Whether `loadedAt` in `load-check.json` is later than the `index.js` mtime |
| Need the full call chain | Enable Diagnostic log, reproduce, then read `ws-log.json` / `trace/` (**turn it off afterwards**) |

---

## 9 Implementation notes (appendix)

### 9.1 Why blocks must be written in DOM mode

```
old: <div data-node-id="A" name="Figure 1" style="text-align:center;"> … </div>
new: <div data-node-id="?" data-type="NodeParagraph"> Figure 2 … </div>
        ↓ move only the content nodes, keep the old root node
written: <div data-node-id="A" name="Figure 1" style="text-align:center;"> Figure 2 … </div>
```

`markdown` mode rebuilds the block from markdown and drops root attributes; `dom` mode preserves them. Markdown mode is only used as a fallback when Lute is unavailable, and attributes are re-applied afterwards. Attribute changes (`custom-xref` / `name` / `style`) must happen **before** `updateBlock(dom)`, otherwise the write-back DOM overwrites them (and lands later).

### 9.2 The equation path and its three safety nets

1. Fetch the block's current DOM;
2. Replace only the `\tag{…}` inside `data-content`;
3. Write it back unchanged — **no Lute, no rebuild, no touching child nodes**.

Safety nets: empty equations are never numbered; the whole run is skipped while a formula editor (a visible, focused `.cm-editor`) has focus; and the write is abandoned if the new content is more than 40 % shorter than the old one.

> One related trap: the class `.protyle-math` **does not exist in SiYuan** (zero hits in a full-text search of 3.8.9). "Am I editing a formula or code right now" can only be answered by "is there a visible, focused CodeMirror editor" — the WYSIWYG prose area is not CodeMirror.

### 9.3 Collection performance

| Item | Old approach | Now |
|---|---|---|
| Block list | Recursive `getChildBlocks`, one call per block: 348 blocks → 349 round trips / ~1.5 s | One SQL query + one `getDoc` for ordering: **2 round trips / ~0.33 s** |
| Row count | SQL silently truncated at 64 rows | Always `limit -1` |
| Ordering basis | Recursive walk | Order of `data-node-id` occurrences in the HTML (DFS pre-order); verified against the recursive result on 68 real documents (2–348 blocks) with identical output |

### 9.4 The three guards around automatic runs

1. **The block holding the caret**: the run waits only if that block was edited within `EDIT_GRACE` (3 s); a caret merely resting there does not block it.
2. **Quiet window after its own writes**: 2.5–12 s, so the run never feeds on itself.
3. **Whole-run consistency**: if any block that must change is inside a protection window, the **entire run is deferred** (skipping the protected block and writing the rest would produce duplicate numbers) and retried up to 4 times; every deferral writes `giveup:<reason>` to `err-log.json`.

---

## 10 Build and release (developers)

### 10.1 Fields to update before every release

| Item | Location | Notes |
|---|---|---|
| `version` | `plugin.json` **and** `package.json` | Both must change; `preflight` rejects a mismatch |
| `url` | `plugin.json` | Must be the real repository URL, **never an `OWNER` placeholder** |
| `description` | `plugin.json`, both `default` and `zh-CN` | Describe the new capabilities in both languages |
| `displayName` / `keywords` | `plugin.json` | Add keywords for new features |
| `readme` targets | `README.md` / `README_en.md` | The marketplace renders them as the detail page |
| `minAppVersion` | `plugin.json` | Must be a SiYuan version that actually exists |

`url` is critical: the marketplace detail page derives the **package link from `repoURL`** and the **author link from the owner segment of `repoURL`**; the `author` field only supplies display text. An `OWNER` placeholder makes both links 404.

### 10.2 Release steps

```bash
bash scripts/preflight.sh                                # placeholders / url / version / zip layout
git add -A && git commit -m "release: vX.Y.Z" && git push origin main
GH_TOKEN=ghp_xxx bash scripts/release.sh [notes.md]      # runs preflight again internally
bash scripts/deploy.sh                                   # local reinstall check
```

Other commands: `npm run check` (syntax + manifest), `npm run build` (produces `package.zip` with files at the zip root, no nested folder).

The marketplace only consumes `package.zip` from the GitHub **Latest Release**. The first listing requires a PR to `siyuan-note/bazaar` adding one line to `plugins.txt`; **after that, bump `version` and publish a new Release** — the index refreshes within one to three hours.

---

## 11 License

MIT
