# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

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

---

The entries below came out of a whole-repo code review (2026-10-07). None
were started at the time; they are listed in suggested order. Baseline then:
1,631 unit tests passing, lint failing, e2e not run.

## `units.js` is still a module-level singleton

Despite `3348e5a3` ("closing the last module-singleton hazard"),
`elementContainer_` and `typeMap_` in `core/units.js` are still
module-level, and `init()` overwrites them per canvas. With two drawings
open, unit conversion (`convertToNum` for `%`, `getRoundDigits`,
`getElement(id)`) uses the most recently constructed canvas, including one
already destroyed after its pane closed. Smaller shared state of the same
kind: `draw.js` `randIds`. (`touch.js` pinch state is already per-canvas.) Fix: make them
per-instance like the other core modules, and add a unit test that
constructs two canvases, destroys one, and converts units on the other.
Small.

## Implicit `window.svgEditor` global (multi-instance)

74 files read the bare global `svgEditor` (`/* globals svgEditor */`).
`EditorStartup.js` repoints it on every pointerdown/focusin as a
workaround. That covers synchronous handlers, but not code that runs later
(timers, awaited dialogs, promise continuations) after the user switches
panes: that code acts on the wrong drawing, or a closed one.
`window.seAlert`/`seConfirm`/`sePrompt`/`seSelect` are the same pattern.
Fix: resolve the owning editor through `domScope.closestRoot(this)` mapped
to the editor instance in components, and through the extension `S`
context in extensions. Migrate gradually, with a `check-dom-scope.mjs`-style
guard that rejects new bare `svgEditor.` references. Large: touches ~74
files, so do it incrementally.

## `setSvgString` has no round-trip corpus test

A failure after the document swap now rolls back to the previous drawing
(`restorePreviousDocument()` in `svg-exec.js`), rather than processing the
parsed document fully off-canvas — that would mean reworking every pass that
reads `svgCanvas.getSvgContent()`. Still open: a round-trip test over a corpus
of real Milani-style drawings (frames, taper, corner radius, shadows,
text-on-path): load → save → load should stop changing after one pass. Today
round-trip assertions exist only per feature. Medium.

## No type checking; `svgcanvas.d.ts` is hand-written; no explicit host API

`tsconfig.json` exists but no script runs it, and it's set to
`module: commonjs`. `packages/svgcanvas/svgcanvas.d.ts` is still hand-written:
the members known to be missing (`setAllLayersMode`, `zoomAtPoint`,
`insertSvgFragment`, `offsetPath`, `shapeBuilder`, `setDebugEventSink`,
`getDebugSnapshot`, `runExtensions`, …) were added and a dead re-export of a
non-existent `core/utilities.js` removed, but nothing stops it drifting again,
and it still lacks `setLogSink`-style newer APIs and most of the canvas surface.
The plugin types `Editor` as `unknown`-ish and reaches into internals
(`svgCanvas`, `configObj`, `$svgEditor`, `svgCanvas.modeEvent`). Fix: define an
explicit host API on `Editor`, enable `checkJs` for that surface first, generate
`.d.ts` from the JSDoc (`tsc --declaration --emitDeclarationOnly`), and ship it
in `dist/`. Medium.

## Extension hook payloads are still untyped

Hook names are now registered in `core/extension-hooks.js` (typos warn, and
`keyDown` is dispatched from `EditorStartup.js`'s keydown listener). Still
open: typedefs for each hook's payload, and migrating `ext-puppet-warp`'s raw
window `keydown` listener to the `keyDown` hook. Small.

## Oversized modules

Files over ~1,500 lines: `Editor.js` (1,874), `seShapeLibrary.js` (1,870),
`selected-elem.js` (1,818), `svg-exec.js` (1,690), `elem-get-set.js`
(1,623), `draw.js` (1,576: the `Drawing` class plus the shape-creation
functions), `TopPanel.js` (1,529), and `EditorStartup.js` (1,483). Split
them where `architecture.md` already describes the boundaries, e.g.
EditorStartup's paste/clipboard handling into its own module, and
seShapeLibrary into store/view/menu. Do this only after the lint re-indent
entry above lands. Large; do it opportunistically, one file at a time.

## Remaining logging gaps

`console.error`/`console.warn` now go through `common/logger.js` everywhere
(a unit test enforces it) and reach a host via `Editor.setLogSink(sink, level)`.
Not done: the `catch` blocks that only hold a comment (`bbox-utils.js`,
`coords.js`, `json.js`, `ColorDialog.js`) are intentional fallbacks and stay
silent; `console.log/info/debug` calls are untouched. The plugin still needs to
call `setLogSink` (that half lives in `../obsidian-svgedit-plugin`). Small.

## Dialogs with private colour variables / hard-coded colours

Five files define their own light/dark design tokens instead of inheriting
from `svgedit.css`: `ColorDialog.css.js`, `PaletteDialog.css.js`,
`seTextPromptDialog.html`, `imageImportDialog.html`, and `seTraceDialog.html`.
Component and dialog styles also contain about 76 hard-coded hex colours,
and the legacy alias variables are still used 25 times. Theme overrides
from the host don't reach these dialogs. Fix: delete the local palettes
(custom properties already pass into shadow DOM), replace the hex values
with tokens, then migrate off the aliases and drop them. Medium, mostly
visual QA.

## Repo hygiene leftovers

- Two coverage systems remain: nyc (`nyc.config.js`, used by
  `scripts/run-e2e.mjs` to merge e2e + vitest coverage), `vite-plugin-istanbul`
  for e2e, and v8 for unit tests. Consolidating means reworking the merge step.
- `npmpublish*.yml` workflows still target upstream's `svgedit` package; they
  go away with the "Fork identity" entry above.
