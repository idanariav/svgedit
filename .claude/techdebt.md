# Tech Debt

Running log of compromises, known hazards and "do it properly later" items surfaced
during work sessions. This is a reference backlog of **debt** (shortcuts taken, bugs
not yet reproduced, limits to know about) — nothing here should be picked up unless
explicitly requested. Feature work, planned follow-ups and standing guidelines live in
[`roadmap.md`](roadmap.md) instead.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

## getStrokedBBox's false / null

`getStrokedBBox` returns `false` for an empty list and `null` when every element is detached, but the canvas
types (`BBoxUtilsApi` in `core/bbox-utils.ts`) promise a box, because ~40 callers pass a non-empty list of attached elements and use the
result unchecked. `bbox-utils.ts` casts at the assignment. Making the type honest (`BBox | false | null`) gave 33 strict
errors in `event-rotate`, `event-select`, `selected-elem`…; the proper fix is a single contract (return `null` for both
and have callers guard, or throw on an empty list), done once with those callers.

## Ghost path-node grips after leaving path-edit (unreproduced)

An Obsidian-plugin log (2026-09-28) showed 4 `pathpointgrip_*` still
`display:inline` in select mode, belonging to no selected path. Every exit
route tried in a browser (setMode, click empty/other shape, Escape, tool
buttons, undo) hides them correctly, so the trigger is unknown. The debug
snapshot now includes `pathEditing.mode`, flags any visible grip outside
`path`/`pathedit` as stale, and records grip x/y; freehand closes log a
`path-draw-commit` event. Next time it shows up, the log should identify the
sequence. Since 2026-10-15 the log also records every key, pointer press / release, command, tool
gesture and history push in order (`.claude/debug-log.md`): when a `stale: true` grip appears, read the entries before it.
Don't add speculative hide-all calls before then.

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
- **Every `cmd.type()` branch of `undo.js` was dead code in the built editor.** `Command#type()` returned
  `constructor.name`, which the minifier renames (`ChangeElementCommand` → `Ao`), so after any undo/redo none of the
  side effects keyed on it ran in the shipped bundle (nor in the plugin): `identifyLayers`, `restoreRefElements`, the
  `<use>` data refresh, the text tspan shift. Source / unit tests were fine, which hid it. The class names are now
  pinned in `history.js` (`tests/unit/history-command-types.test.js`); the command sweep runs on the build, so it catches it.
  Fixing it exposed two latent bugs the dead code had been hiding: the tspan shift also wrote `x` / `y` onto a `<textPath>`
  child (moving then undoing a text on a path corrupted it), and a transform bake wrote the computed font size onto every
  tspan on each move (undo left it behind). Both fixed.
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
  value and left dangling refs): `fx-filter.ts` `writeEffects` (glow / outline / shadow removal), `clip-mask.js`
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
  `unit-harness.html`. `check-dom-scope` was also failing on HEAD (`ext-path-edit.ts`); fixed.

- Fixed on the way: `EditorStartup` read only the last extension's answer to the `keyDown` hook (`runExtensions` without `returnArray` keeps the last result), so another extension's `undefined` could cancel an earlier `preventDefault` (e.g. curvature's Escape); it now collects all answers. The editor's Space `keyup` also unconditionally reset the mode to the previous one (a bare Space tap in any drawing tool switched to Select); it now only does so when Space had armed pan.

Drawing repair: `scripts/repair-drawings.mjs` ran over `GitProjects/Obsidian_Vault` and `Documents/test_vault`
(2026-10-10): 54 notes/exports had stacked `translate()` runs, 1 had `undefined` text in `<defs>`, none had NaN tspans;
all 55 verified to load identically. The two load-time sanitizers it replaced are gone from the editor (a
`stacked-translate` rule joined `stray-text-in-defs` in `checkDrawing`). `REPAIRS` is empty again;
`git log -- scripts/repair-drawings.mjs` has the three entries as templates.

## Oversized modules (remaining)

All eight files that were over ~1,500 lines are now under it (Editor.ts 1,451,
seShapeLibrary.ts 1,358, svg-exec.js 1,249, draw.js 1,209, selected-elem.js
1,172, TopPanel.ts 1,161, elem-get-set.js 1,110, EditorStartup.ts 1,092), by
moving cohesive blocks into `addToShapeLibrary.ts`, `editorShortcuts.ts`,
`seShapeLibrary.css.js`/`.data.js`, `core/svg-defs.js`,
`core/layer-ops.js`, `core/text-attrs.js`, `core/group-ops.js` and
`panels/topPanelContext.ts`. What's left is still big in one place each:
`EditorStartup.init()` (~770 lines of listener wiring), `SeShapeLibrary` (one
~1,300-line class: store/view/menu not separated), `Drawing` in `draw.js`
(~880 lines), and `TopPanel.init()`. Split those only with a concrete reason.

## Dialog colours: deliberate hard-coded hex

Every dialog follows the editor's light/dark theme (`svgedit.css` lists each dialog tag in its
light and dark token blocks; each calls `syncDialogTheme()` on open;
`tests/unit/dialog-theme-tokens.test.js` guards it). `syncDialogTheme()` also copies the
resolved design tokens (`DIALOG_TOKENS` in `themeUtil.ts`) from the owning `.svg_editor`, so a
host that overrides tokens there reaches the dialogs too — a token added to the design set
must be added to that list. The ~50 remaining hard-coded hex values in components/dialogs are
deliberate: text on accent buttons, colour-picker maths, danger red, grid default. The
`--cp-*` / `--pd-*` modal tokens are intentional named component tokens.

## `path` in `path-actions.ts` is typed non-null (2026-10-17)

`let path = null as unknown as PathObject` in `path-actions.ts`: it is `null` outside a path-edit session and set by
`toEditMode()` before any handler reads it, and typing it `PathObject | null` put ~85 guards into the mouse handlers.
`svgCanvas.getPathObj()` is honest (`PathObject | null`). Make the handlers take the path from a `requirePath()` that
throws (or pass it in from the session) when `PathActions` is next reworked; the same applies to the `Path` / `Segment`
fields `cur_pt` and `dragctrl`, which only exist once a node is pressed.

## Latent faults the editor ratchet surfaced (2026-10-17)

Typing `Editor.ts`, `EditorStartup.ts` and `contextmenu.ts` strictly turned up code that is wrong today but not reachable
(or not noticed) in normal use. Fixed where the fix was a typing consequence; the rest is left for a deliberate change:

- **`ext-connector`'s marker block is dead.** `handleOneChangedElement` destructures `{ markerStart, markerMid, markerEnd }` from
  `elem.attributes`, but a `NamedNodeMap` is keyed by attribute *name* (`marker-start`), so all three are always `undefined` and the
  block (track marker presence for the endpoint offsets; turn a `<line>` with a mid-marker into a polyline) never runs. Typing it
  kept the behaviour (a cast, with a comment). Reading `marker-start`/`marker-mid`/`marker-end` would switch the feature on, which
  needs its own tests (and a look at `getOffset`, which already reads the attributes directly).
- **Extension context-menu items are never shown.** `contextmenu.ts` appends them to a `#cmenu_canvas` list that the
  template no longer has (the canvas menu is the `<se-cmenu_canvas-dialog>`); no built-in extension adds one. Either wire
  `add()` into the dialog or delete the registry.
