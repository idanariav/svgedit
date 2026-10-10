# Tech Debt

Running log of compromises, known hazards and "do it properly later" items surfaced
during work sessions. This is a reference backlog of **debt** (shortcuts taken, bugs
not yet reproduced, limits to know about) — nothing here should be picked up unless
explicitly requested. Feature work, planned follow-ups and standing guidelines live in
[`roadmap.md`](roadmap.md) instead.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

## Ghost path-node grips after leaving path-edit (unreproduced)

An Obsidian-plugin log (2026-09-28) showed 4 `pathpointgrip_*` still
`display:inline` in select mode, belonging to no selected path. Every exit
route tried in a browser (setMode, click empty/other shape, Escape, tool
buttons, undo) hides them correctly, so the trigger is unknown. The debug
snapshot now includes `pathEditing.mode`, flags any visible grip outside
`path`/`pathedit` as stale, and records grip x/y; freehand closes log a
`path-draw-commit` event. Next time it shows up, the log should identify the
sequence. Don't add speculative hide-all calls before then.

## Closed subpaths must carry an explicit closing lineto

The node editor (`Path#init`, `opencloseSubPath`, delete-node) models a closed
subpath as `M A … L(back to A) Z`; the closing lineto is A's only grip. Do
**not** "dedupe" it away (that was tried and removed every drawn path's start
node grip). `ensureExplicitClosingSegments()` in `path-method.js` repairs
`Z`-only subpaths (external SVGs, or saved by the reverted change) whenever a
path enters the editor; other absolute-path shapes it doesn't cover
(relative segments, `H`/`V`) are left as-is.

## Remaining `window.svgEditor` consumers

Components and dialogs now resolve their editor with `domScope.ownerEditor(this)`
(module helpers take an explicit `editor` argument) and `check-dom-scope.mjs`
rejects new `window.svgEditor` reads / `/* globals svgEditor */` headers. Still
on the global by design or not yet migrated: `ownerEditor()`'s last-resort
fallback (unattached elements, e.g. a constructor running before connect, or a
dialog appended to `document.body`), hosts and e2e tests that read
`window.svgEditor`, `EditorStartup`'s repointing on interaction (kept for
those), and `window.seAlert`/`seConfirm`/`sePrompt`/`seSelect`, which create
standalone dialogs and don't touch an editor. Constructor-time reads such as
`this.imgPath = ownerEditor(this).configObj…` still fall back to the global
when the element isn't attached yet; they're harmless as long as `imgPath` is
the same for every editor on the page. Small.

## Tier 0 follow-ups (VectorCraft port, 2026-10-10)

Status (2026-10-10): T0.1-T0.6 are implemented and committed (layering guard, undo transactions, command
registry, drawing invariants + command sweep + property tests, tool contract, automation API). Every panel,
main-menu and extension button is a real command; every standalone drawing tool is on `registerTool`. Planned
follow-up work (tool hooks, live-effects preview, precise `enabled`, puppet-warp port) is in `roadmap.md`.
What is recorded here is what was found on the way and the compromises that remain.

**Bugs the sweep / property tests found (all fixed; one action left for the vault)**
- **Unused `<defs>` purged by `getSvgString()` weren't restored by undo.** Undo of a delete restored
  the gradient the shape used but not the gradient it inherits from (`href` chain), and undo of a plain
  attribute change (fill back to a gradient) restored nothing. `restoreRefElements` now follows `href`
  and recurses into restored defs, and a `ChangeElementCommand` undo/redo calls it
  (`tests/unit/defs-purge-undo.test.js`). The purge itself is still a live-DOM side effect of saving.
- **NaN tspans in saved drawings.** Undoing/redoing *any* attribute change on a `<text>` with tspans
  wrote `x="NaN" y="NaN"` into them (`undo.js`). Prevention is fixed and tested; already-saved drawings
  are repaired in the files. Done 2026-10-10: Obsidian_Vault and Documents/test_vault scanned (found none).
- **Deleting / Stroke-to-Path / Offset on a path left the `<textPath>` that runs along it dangling.**
  `releaseTextOnPath` (`text-path.js`) now turns that text into plain text in the same undo step
  (`tests/unit/text-path-rail-removal.test.js`).
- **Object-to-Path lost the element's fill, stroke and opacity** whenever it differed from the editor's
  current shape style (`convertToPath` copied the global style; the old TODO). It now copies the
  element's own attributes. This was also the "ext-mirror redo" bug: the twin re-synced from the
  style-less path. The sweep's `KNOWN_ISSUES` is empty again.
- `data-se-ephemeral` nodes (a live-effects preview clone) are no longer serialised.
- Layer lock / dim (`tool_layerView`) is not an undo step (documented in `draw.js`), so the sweep excludes it.
- Fixed on the way (all "ChangeElementCommand constructed before the mutation" — redo re-applied the old
  value and left dangling refs): `fx-filter.js` `writeEffects` (glow / outline / shadow removal), `clip-mask.js`
  `releaseClipMask`, `text-attrs.js` text-decoration toggles. Also: `paste` before the first right-click threw
  (`getLastClickPoint` on `null`), `ext-mirror` threw on a source replaced by Object-to-Path, move / delete /
  cut didn't record `se:*` source attributes (now `atomic`).

**Hand-built `BatchCommand`s (audited 2026-10-10)** — 60 `new BatchCommand` sites in 34 files, all ~50
`new ChangeElementCommand(...)` sites read for the one real hazard (command built *before* its mutation, so
redo re-applies the old value): none left, the three that were wrong are fixed. The rest build precise commands
and already give one undo step. The command sweep (redo must reproduce the edit) catches a regression; keep it
green. Converting more of them is a roadmap guideline, not debt.

**Transactions (known limits)**
- Cost is O(elements) at begin and at commit/cancel (≈14 ms at begin, ≈22 ms at commit for 5,000 elements). Fine
  for gestures; a caller wrapping something that runs per pointer-move needs a lazy/targeted snapshot first.
- `undo.js`'s `<text>` x/y tspan shift still applies only when the command carries x/y; a transaction that moves a
  text and its tspans drops the tspans' x/y so they are not shifted twice (tested). A transaction that changes the
  text's x and independently its tspans' x by a different amount would undo wrongly.
- Layer lock / dim (`tool_layerView`) is not an undo step (documented in `draw.js`), so the sweep excludes it.
- The unused-`<defs>` purge is still a live-DOM side effect of saving (`getSvgString()`); undo now restores what it
  removed (`restoreRefElements`).
- A transaction held across gestures (puppet-warp's session) swallows the undo steps of anything that runs while it is
  open; nothing in that tool's flow does today (the selection is cleared).

**Tool contract (compromises)**
- `ext-puppet-warp` keeps its legacy mouse hooks: the registry opens a nested transaction per gesture and a cancelled
  gesture (tool switch mid-drag, window blur) dooms the outer session transaction, silently discarding the whole warp
  while the tool still shows its pins. Its undo is the session transaction (`tests/e2e/puppet-warp-session.spec.js`).
- `ext-connector` augments the built-in line and select modes (not a tool). `glow`/`outline`/`shadow`/`repeat` only
  refresh on mouseup (not tools). Built-in modes (select/path/text/resize/rotate/zoom/shape) stay in `event.js`.
- Behaviour changes in the ported tools: with grid snapping on the dragged end snaps too (legacy hooks snapped only
  the start point); polystar's size was wrong at zoom != 100% and is fixed; `cancelTool` now includes `curvature`.
- A hotkey on a disabled command is inert and does not `preventDefault` (before, the button's own guard swallowed it
  but the key was still prevented).

**Tests / tooling**
- Property tests use `fast-check` directly (`tests/unit/properties/`, seed with `FC_SEED=…`). vitest is on 4.1, so
  `@fast-check/vitest` (`it.prop`) would install now; it adds nothing the `fc.assert` + `params()` helper lacks, so it isn't.
- The e2e `afterEach` invariant check can be opted out per test with
  `test.info().annotations.push({ type: 'allow-corrupt-drawing', description: '…' })`; none do today. The
  `closed-subpath` rule from the plan was not implemented on purpose (the node editor repairs `Z`-only
  subpaths itself; it is not corruption) and a layer without `<title>` is not flagged (external SVGs have them).
- `tests/e2e/unit/*` (the browser harness) was failing on HEAD: `anchor-path.js`'s bare `import 'svgpath'`
  was unresolvable in the harness page. Fixed by bundling it (`copy-static.mjs`) and mapping it in
  `unit-harness.html`. `check-dom-scope` was also failing on HEAD (`ext-path-edit.js`); fixed.

- Fixed on the way: `EditorStartup` read only the last extension's answer to the `keyDown` hook (`runExtensions` without `returnArray` keeps the last result), so another extension's `undefined` could cancel an earlier `preventDefault` (e.g. curvature's Escape); it now collects all answers. The editor's Space `keyup` also unconditionally reset the mode to the previous one (a bare Space tap in any drawing tool switched to Select); it now only does so when Space had armed pan.

Drawing repair: `scripts/repair-drawings.mjs` ran over `GitProjects/Obsidian_Vault` and `Documents/test_vault`
(2026-10-10): 54 notes/exports had stacked `translate()` runs, 1 had `undefined` text in `<defs>`, none had NaN tspans;
all 55 verified to load identically. The two load-time sanitizers it replaced are gone from the editor (a
`stacked-translate` rule joined `stray-text-in-defs` in `checkDrawing`). `REPAIRS` is empty again;
`git log -- scripts/repair-drawings.mjs` has the three entries as templates.

## Oversized modules (remaining)

All eight files that were over ~1,500 lines are now under it (Editor.js 1,451,
seShapeLibrary.js 1,358, svg-exec.js 1,249, draw.js 1,209, selected-elem.js
1,172, TopPanel.js 1,161, elem-get-set.js 1,110, EditorStartup.js 1,092), by
moving cohesive blocks into `addToShapeLibrary.js`, `editorShortcuts.js`,
`seShapeLibrary.css.js`/`.data.js`, `core/svg-defs.js`,
`core/layer-ops.js`, `core/text-attrs.js`, `core/group-ops.js` and
`panels/topPanelContext.js`. What's left is still big in one place each:
`EditorStartup.init()` (~770 lines of listener wiring), `SeShapeLibrary` (one
~1,300-line class: store/view/menu not separated), `Drawing` in `draw.js`
(~880 lines), and `TopPanel.init()`. Split those only with a concrete reason.

## Dialog colours: deliberate hard-coded hex

Every dialog follows the editor's light/dark theme (`svgedit.css` lists each dialog tag in its
light and dark token blocks; each calls `syncDialogTheme()` on open;
`tests/unit/dialog-theme-tokens.test.js` guards it). `syncDialogTheme()` also copies the
resolved design tokens (`DIALOG_TOKENS` in `themeUtil.js`) from the owning `.svg_editor`, so a
host that overrides tokens there reaches the dialogs too — a token added to the design set
must be added to that list. The ~50 remaining hard-coded hex values in components/dialogs are
deliberate: text on accent buttons, colour-picker maths, danger red, grid default. The
`--cp-*` / `--pd-*` modal tokens are intentional named component tokens.

## Markers made for a copy are not in the undo history

`ext-markers` gives every element its own marker in `<defs>` (`mkr_<pos>_<id>`, so colour follows the
element). When an element carrying such markers is copied (clone, paste, mirror copy, transform again),
`updateReferences` creates the copy's markers from the `changed` event, after the copy's command is
recorded, and `changeSelectedAttribute` records the `marker-*` change as a separate step. Undoing the
copy therefore leaves the new marker behind and needs a second undo for the attribute. Found by the
command sweep on `arrow-align.svg` (listed in its `KNOWN_ISSUES`; the old `markers.svg` fixture has
markers without `se_type`, which the extension ignores). The fix is to make the marker part of the
copy's own command — either create it before the copy's command is recorded, or let the undo manager
amend the last command (only safe once the order of `changed` and `addCommandToHistory` is the same
for every copying command). Delete the sweep entry when done.

## Repo hygiene leftovers

- Two coverage systems remain: nyc (`nyc.config.js`, used by
  `scripts/run-e2e.mjs` to merge e2e + vitest coverage), `vite-plugin-istanbul`
  for e2e, and v8 for unit tests. Consolidating means reworking the merge step.
