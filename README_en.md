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

- A combination **must include Ctrl / Alt / ⌘** — single keys are rejected on purpose so typing never triggers them. `Backspace` clears, `Esc` cancels.
- Both actions are also registered as **native commands**, so they show up under **Settings → Hotkeys → Plugin**. Setting the same key in both places still runs the action only once (400 ms de-duplication).
- Hotkeys are ignored inside inputs, search boxes, settings panels and the plugin's own picker, and while an IME is composing.

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
| Dead references | Convert to red struck-through text | See below |
| Centre captions | On | Figure/table caption paragraphs are centred (equation blocks are already centred) |
| Caption tint | Light | None / faint / light / light blue, semi-transparent so it works in dark themes too |
| Custom hotkeys | Ctrl+Alt+R / Ctrl+Alt+N | See above |
| Diagnostic log | Off | **Troubleshooting only**: hooks global network calls and writes `ws-log.json`. Leave it off, it costs performance |

## After you delete a figure, table or equation

Numbers shift automatically within a few seconds and references follow. But SiYuan turns the reference into an orphan: the `((id "图 2"))` target is gone, leaving a stray `图 2` that keeps raising "block not found" and collides with the new numbering.

Since v0.5.0 the default is to **convert it to plain text while keeping it visible as red + strikethrough** (`~~…~~` plus `color:var(--b3-font-color1)`, which normalises into a single `<span data-type="s" style="color:…">`):

```
after deleting the old 式 1
  式 1  y = A×sin(x)          ← the former 式 2 moved up, numbering normal
  见 式 2                      ← reference to the former 式 3, updated
  见 ~~式 1~~ (red)            ← pointed at a deleted block, now plain text, no more errors
```

- Converting to text **loses the reference link** — that is exactly why the error disappears. The original markdown is kept in `data/storage/petal/siyuan-xref/dead-fix-log.json` (last 60 entries) in case you want to restore it by hand.
- If you would rather keep the link, switch the setting to **Mark only**: it still turns red with a strikethrough but the reference survives, and it comes back if you undo the deletion.

## How it writes blocks (and why formulas survive)

Block attributes (`name`, `style`, `custom-xref`, your own colours…) live on the **root node of the block's HTML**. Writing with `/api/block/updateBlock` and `dataType: "markdown"` **rebuilds the block from markdown and drops those attributes**. With `dataType: "dom"` they are preserved, so the plugin fetches the current block DOM, converts the new markdown to a block DOM, moves only the content node into the old root node, and writes back with `dataType: "dom"`.

An equation's body is stored on the root node's `data-content` attribute, not in child nodes. Equations therefore take a dedicated path: fetch the block DOM, replace only the `\tag{…}` inside `data-content`, write back unchanged. **No Lute pass, no rebuild, no touching child nodes** — the formula body cannot be overwritten.

Three safety nets:

- **Empty equations are not numbered.** Otherwise you get `$$\n\tag{1-4}\n$$` blocks that carry nothing but a number, get rewritten every run and can never recover. SiYuan does not even index them, so they vanish from search and the outline.
- **The whole run is skipped while a formula editor has focus.**
- **Length check before writing**: if the new content is more than 40 % shorter than the old one, the fetch is considered partial and the write is abandoned.

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
- Automatic rewrites land on the undo stack: pressing `Ctrl+Z` right after typing may undo the plugin's change instead of your input. Turn auto off if that bothers you
- While the caret rests in a block that needs rewriting, the plugin waits — so "the number did not change while I was typing" is expected; move the caret and it applies
- The plugin waits roughly 8 seconds after the last edit (`EDIT_GRACE`): a freshly typed block is not indexed yet, and writing too early risks corrupting it

## License

MIT
