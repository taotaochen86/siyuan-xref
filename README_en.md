# Figure & Equation Xref (siyuan-xref)

Renumbers **figures, tables and equations** in the current document and keeps every cross-reference in sync.

## Automatic or manual

**Automatic by default.** About 1.5 seconds after you stop typing a caption, the plugin renumbers and refreshes references — silently, no dialogs.

Three guards keep it out of your way while typing:

1. If the caret sits inside a block that needs rewriting, the plugin waits only when **that block was edited within the last 4 seconds**; a caret merely resting there does not block the run.
2. Changes made by the plugin itself open a short quiet window, so it never feeds on its own writes.
3. Nothing pops up on success; errors go to the console, prefixed `[siyuan-xref]`.

To turn it off completely, uncheck **Auto renumber** in the settings and trigger the run with `/xrefnum` instead.

## Usage

Type `/` in the editor, then one of:

| Trigger | What it does |
|---|---|
| `/xref` `/交叉引用` `/图ref` | Lists figures, tables and equations in this document; pick with ↑↓, press Enter to insert a live reference |
| `/xrefnum` `/重排编号` `/图表编号` | Renumbers the whole document right away and refreshes existing references |

Settings live under **Settings → Marketplace → Downloaded → Figure & Equation Xref → Settings**.

## Hotkeys

| Action | Default | Where to change |
|---|---|---|
| Insert cross-reference | `Ctrl+Alt+R` | Plugin settings → Custom hotkeys → click the field, press the combination |
| Renumber now | `Ctrl+Alt+N` | Same panel, second row |
| Undo last renumber | `Ctrl+Alt+Z` | Same panel, third row |
| Redo | `Ctrl+Alt+Y` | Same panel, fourth row |

- A combination **must include Ctrl / Alt / ⌘** — single keys are rejected on purpose so typing never triggers them. `Backspace` clears, `Esc` cancels.
- Both actions are also registered as **native commands**, so they show up under **Settings → Hotkeys → Plugin**. Setting the same key in both places still runs the action only once (400 ms de-duplication).
- Hotkeys are ignored inside inputs, search boxes, settings panels and the plugin's own picker, and while an IME is composing.

## Undo and redo

**Why not `Ctrl+Z`**: SiYuan's undo stack only records edits initiated by the editor itself. The plugin writes through `/api/block/updateBlock`, an HTTP endpoint SiYuan does not treat as an editing action, so **plugin writes never enter the stack**. Pressing `Ctrl+Z` undoes your own typing, not the plugin's rewrite — that is the real reason it felt like "nothing happened".

So the plugin keeps its own stack:

| | |
|---|---|
| What is stored | per run: which blocks changed, each block's before/after DOM, and the old values of `name` / `custom-xref` / `style` |
| Depth | **10 runs** by default, adjustable 1–50 in settings |
| Where | memory + `data/storage/petal/siyuan-xref/undo-stack.json`, survives a restart |
| Keys | `Ctrl+Alt+Z` back one run, `Ctrl+Alt+Y` forward one |

- Only blocks the plugin touched are rolled back. If you manually edited one of them in between, undo restores the older value — mind the timing
- **Deleted blocks are rebuilt** (new in 1.0.2): SiYuan's `insertBlock` keeps the `data-node-id` written into the DOM, so the rebuilt block has the *exact same ID* as before deletion and every `((blockID "anchor"))` pointing at it reconnects automatically. `name` / `custom-xref` / centering / tint are restored too
- A rebuilt block lands at the end of its original parent (super blocks and lists included), so you may want to drag it back to its old position
- Blocks that never went through a renumber are not in the stack, so undo cannot rescue them (use SiYuan's own `Ctrl+Z`)
- Undo does not re-trigger an automatic run (2.5 s quiet window)

## What it recognises

- Block attribute `custom-xref = fig | tab | eq` → classified by attribute (most reliable)
- Equation blocks → always `eq`
- Paragraphs starting with `图 N` / `表 N` / `Figure N` / `Table N` → figure or table
- A paragraph saying `式 N …` is **not** numbered; equation numbers live in `\tag`

## Three rules that keep it sane

1. **Write captions as their own paragraph**: `图 2 稻田水位示意`. A table block cannot hold a number itself. Renumbering also centres that paragraph and gives it a faint tint.
2. **Put equation numbers in `\tag`**: `$$ … \tag{2} $$`. The plugin maintains it.
3. **Quote references with double quotes**: `((block-id "图 2"))`. Single quotes mean "dynamic anchor text" and get expanded to the full block content when exporting to Word/PDF — an equation reference would dump raw LaTeX into your document.

## Settings

| Option | Default | Notes |
|---|---|---|
| Numbering mode | Continuous | Continuous (图 1, 图 2) or per chapter (图 1-1, 图 2-1, switching at the shallowest heading level) |
| Labels | 图 / 表 / 式 | Caption prefixes; can be changed to Figure / Table / Eq |
| Refresh references while renumbering | On | Off = only numbers change, existing references are left alone |
| Auto renumber | On | Fires ~1.5 s after you stop typing; never writes into the block holding the caret |
| Dead references | **Leave untouched** | See below. The "convert" mode waits 10 s before burning |
| Undo depth | 10 | How many runs the plugin's own undo stack keeps (1–50) |
| Restore dead references | — | Button: rewrites burnt references back to `((blockID))` |
| Centre captions | On | Figure/table caption paragraphs are centred (equation blocks are already centred) |
| Caption tint | Light | None / faint / light / light blue, semi-transparent so it works in dark themes too |
| Custom hotkeys | Ctrl+Alt+R / Ctrl+Alt+N | See above |
| Diagnostic log | Off | **Troubleshooting only**: hooks global network calls and writes `ws-log.json`. Leave it off, it costs performance |

## After you delete a figure, table or equation

Numbers shift automatically within a few seconds and references follow. But SiYuan turns the reference into an orphan: the `((id "图 2"))` target is gone, leaving a stray `图 2` that keeps raising "block not found" and collides with the new numbering.

**Since 1.0.2 the default is "leave untouched"**: the reference is not modified at all — no red, no strikethrough. Delete a figure by mistake, press `Ctrl+Alt+Z`, and the plugin **rebuilds the deleted block with its original ID**, so the reference reconnects by itself. That is the real fix for "deleted a table, every reference broke, unrecoverable".

This release also fixes dead-reference *detection*: SiYuan keeps the row in the `blocks` table for another 2–4 seconds after a block is deleted, and the old code decided liveness from that table — so right after a deletion it always reported "no dead references". 1.0.2 verifies liveness through the real-time endpoints `checkBlockExist` / `getBlockDOM` (measured: `false` within 0 ms of a delete), and drops leftover "ghost rows" from the collection result so they no longer hold on to numbering slots.

- Why the red marking was dropped: it is a runtime CSS class — SiYuan drops it on every re-render and the plugin re-adds it, which reads as "the plugin broke my reference" (two reports on the day 1.0.1 shipped). Switch back to **Mark only** if you want the hint.

```
after deleting the old 式 1, then undoing the deletion
  式 1  y = A×sin(x)          ← block is back
  见 式 2                      ← numbering synced
  见 式 1 (red)                ← reference still there and clickable
```

- If you really want it gone, switch **Dead references → Convert to red struck-through text**. That mode **waits 10 seconds** (`deadGrace`) before burning, so an undo within 10 s still saves it. Once burnt, the block ID is gone.
- Every conversion is logged to `data/storage/petal/siyuan-xref/dead-fix-log.json` (last 60). The **"Restore in this document"** button in settings rewrites them back to `((blockID "anchor"))`, skipping targets that no longer exist.

## How it writes blocks (and why formulas survive)

Block attributes (`name`, `style`, `custom-xref`, your own colours…) live on the **root node of the block's HTML**. Writing with `/api/block/updateBlock` and `dataType: "markdown"` **rebuilds the block from markdown and drops those attributes**. With `dataType: "dom"` they are preserved, so the plugin fetches the current block DOM, converts the new markdown to a block DOM, moves only the content node into the old root node, and writes back with `dataType: "dom"`.

An equation's body is stored on the root node's `data-content` attribute, not in child nodes. Equations therefore take a dedicated path: fetch the block DOM, replace only the `\tag{…}` inside `data-content`, write back unchanged. **No Lute pass, no rebuild, no touching child nodes** — the formula body cannot be overwritten.

Three safety nets:

- **Empty equations are not numbered.** Otherwise you get `$$\n\tag{1-4}\n$$` blocks that carry nothing but a number, get rewritten every run and can never recover. SiYuan does not even index them, so they vanish from search and the outline.
- **The whole run is skipped while a formula editor has focus.**
- **Length check before writing**: if the new content is more than 40 % shorter than the old one, the fetch is considered partial and the write is abandoned.

## Why an automatic run sometimes did nothing (fixed in v0.9.1)

The `blocks` table lags behind: writing a block takes 0.6–2 s (sometimes more) before SQL can see it. That caused three bugs:

| Symptom | Cause | Now |
|---|---|---|
| Type "Figure 3 …" and nothing ever happens | The new block is not in `blocks` yet, so it never entered the collected snapshot and the plan was empty — the run returned silently | The snapshot is validated against the **top-level blocks actually on the page**; missing ones trigger a wait and re-collect, and if they are still missing the run defers and **retries** |
| One protected block made the rest renumber anyway | Only the protected block was skipped, everything else was written — producing states like two "Figure 3"s | If any block that must change is inside the protection window, the **whole run is deferred** (numbering must stay consistent) and retried |
| After opening the equation editor or simply typing, it never numbered again | Giving up had no follow-up, so the document was stuck on manual runs forever | Deferrals are logged as `giveup:<reason>` in `err-log.json` and retried up to 4 times |

The old "am I editing an equation" check looked for a CSS class `.protyle-math` that **does not exist in SiYuan** (zero references in the whole bundle). It now looks for a visible, focused CodeMirror editor — equations, code and HTML blocks all use CodeMirror; the WYSIWYG prose does not.

## Performance (v0.9.0)

| Metric | Before | Now |
|---|---|---|
| Blocks in a long document | SiYuan SQL returns **64 rows by default** and truncates silently, so captions past the 64th block were never numbered | Every query uses `limit -1`; a 348-block document is handled in full |
| Collecting the block list | One `getChildBlocks` call per block — **349 round trips / 1.5 s** for 348 blocks | One SQL query plus one `getDoc` for ordering: **~0.33 s, 2 round trips** |
| Global network probe | Hooked `window.fetch` unconditionally, cloning every response | **Off by default**, only installed when Diagnostic log is on |
| Concurrency | Auto and manual runs could write the same block | `_running` guard |

Block order comes from one `getDoc` call: the order in which `data-node-id` appears in the page HTML is document order. Verified against the recursive `getChildBlocks` walk on 68 real documents (2–348 blocks) — **identical every time**; if `getDoc` fails, the plugin falls back to the old path.

## Known limitations

- Works on the currently open document only; it does not span documents
- Table blocks carry no number of their own; the caption paragraph above or below does
- Renumbering rewrites block content, so extra entries appear in block history (rollback is possible there)
- **SiYuan's `Ctrl+Z` cannot undo plugin rewrites.** The plugin writes via `/api/block/updateBlock` (HTTP); SiYuan's undo stack only records editor-initiated operations, so API writes never enter it. Use `Ctrl+Alt+Z` instead (see "Undo and redo")
- Plugin undo only rolls back blocks the plugin touched; manual edits made to those blocks in between are reverted too
- Older versions defaulted to "convert to text", which burnt the `((blockID))` irretrievably. 1.0.2 defaults to "leave untouched"; anything already burnt can be recovered with the "Restore in this document" button
- Undo only covers blocks the plugin itself rewrote
- A rebuilt block lands at the end of its original parent; drag it back if the exact position matters
- While the caret rests in a block that needs rewriting, the plugin waits — so "the number did not change while I was typing" is expected; move the caret and it applies
- The plugin waits roughly 3 seconds after the last edit (`EDIT_GRACE`): a freshly typed block is not indexed yet and writing too early risks corrupting it. If that window is still not enough, the run gives up and retries automatically instead of silently doing nothing
- Whenever an automatic run defers (equation editor open, still typing, index not caught up), it writes `giveup:<reason>` to `data/storage/petal/siyuan-xref/err-log.json` so you can see why nothing happened

## License

MIT
