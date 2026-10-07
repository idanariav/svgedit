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

## Fork identity: plugin can silently build against upstream svgedit

This fork is still `svgedit@7.4.1` (`package.json`), the same name and
version as upstream's npm release. The plugin's
`scripts/fetch-svgedit-dist.mjs` falls back to `npm install svgedit@7.4.1`
when no sibling `../svgedit` checkout exists (fresh clone, CI). It also
runs on every `npm install` via `prepare`. That fallback bundles the
*upstream* editor (no host bridge, frame labels, taper, …) with no error.
Related: `repository`/`bugs`/`homepage`, the README badges, and
`CHANGES.md` (stops at 7.4.1) all describe upstream, and the
`npmpublish*.yml` workflows would try to publish `svgedit`. Fix: give the
fork its own identity (scoped name, or a `7.4.1-milani.N` version), consume
it via a GitHub release asset or a commit-pinned git dependency, delete the
publish workflows, and make the plugin's fallback fail loudly (that half
lives in `../obsidian-svgedit-plugin`). Medium: it touches the release
workflow in both repos.

## `units.js` is still a module-level singleton

Despite `3348e5a3` ("closing the last module-singleton hazard"),
`elementContainer_` and `typeMap_` in `core/units.js` are still
module-level, and `init()` overwrites them per canvas. With two drawings
open, unit conversion (`convertToNum` for `%`, `getRoundDigits`,
`getElement(id)`) uses the most recently constructed canvas, including one
already destroyed after its pane closed. Smaller shared state of the same
kind: `touch.js` `pinching`, `draw.js` `randIds`. Fix: make them
per-instance like the other core modules, and add a unit test that
constructs two canvases, destroys one, and converts units on the other.
Small.

## Document/window listeners that survive `Editor.destroy()`

`destroy()` aborts `listenerAbort`, but some global listeners never pass
its signal: `ext-cutter.js:196` (keydown), `seZoom.js:201`,
`seFlyingButton.js:32`, `seToolOverflow.js:33-36`, and `seList.js:329`.
Only 7 of 32 components implement `disconnectedCallback`. Every closed
Obsidian tab leaves handlers behind that keep the dead editor's DOM in
memory. Fix: components add listeners in `connectedCallback` and remove
them in `disconnectedCallback` (or use a per-element AbortController);
extensions get a `signal` in their `init` context. Add a test that mounts
and destroys N editors and checks that the document listener count stays
flat. Small to medium, spread across many files.

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

## `setSvgString` is not transactional

`svg-exec.js` removes the old `#svgcontent` and swaps in the new document
(~line 588) *before* running the repair passes, `identifyLayers`, and
the id/size fixups. An exception after that point returns `false` but
leaves a half-processed document on the canvas. Not observed in practice.
Truncated files are rejected safely: Chromium's DOMParser returns an
`<html>` root, which fails the namespace check. Fix: fully process the
parsed document off-canvas, then swap it in. Pair this with a round-trip
test over a corpus of real Milani-style drawings (frames, taper, corner
radius, shadows, text-on-path): load → save → load should stop changing
after one pass. Today round-trip assertions exist only per feature. Medium.

## No type checking; `svgcanvas.d.ts` has drifted; no explicit host API

`tsconfig.json` exists but no script runs it, and it's set to
`module: commonjs`. The hand-written `packages/svgcanvas/svgcanvas.d.ts`
(last touched 2026-07-10) is missing `setAllLayersMode`, `zoomAtPoint`,
`getDebugSnapshot`, `setDebugEventSink`, `offsetPath`, `shapeBuilder`, and
more. The plugin types `Editor` as `unknown` and reaches into internals
(`svgCanvas`, `configObj`, `$svgEditor`, `svgCanvas.modeEvent`). Fix:
define an explicit host API on `Editor`, enable `checkJs` for that surface
first, generate `.d.ts` from the JSDoc
(`tsc --declaration --emitDeclarationOnly`), and ship it in `dist/`.
Medium.

## Extension hooks are untyped strings; `keyDown` is never dispatched

Hooks are plain string names dispatched through `runExtensions`, and
nothing checks that a hook an extension implements actually exists.
`keyDown` is implemented but never dispatched (`ext-puppet-warp.js:604`
says so in a comment), so extensions work around it with raw
`window`/`document` key listeners. Fix: keep a typed list of hook names
with payload typedefs, warn when an extension registers an unknown hook,
and either dispatch `keyDown` through `HotkeyManager` or remove it.
Small to medium.

## Oversized modules

Files over ~1,500 lines: `Editor.js` (1,874), `seShapeLibrary.js` (1,870),
`selected-elem.js` (1,818), `svg-exec.js` (1,690), `elem-get-set.js`
(1,623), `draw.js` (1,576: the `Drawing` class plus the shape-creation
functions), `TopPanel.js` (1,529), and `EditorStartup.js` (1,483). Split
them where `architecture.md` already describes the boundaries, e.g.
EditorStartup's paste/clipboard handling into its own module, and
seShapeLibrary into store/view/menu. Do this only after the lint re-indent
entry above lands. Large; do it opportunistically, one file at a time.

## Logging bypasses `common/logger.js` and the host debug sink

There are 65 raw `console.*` calls in `src/editor` and `packages/svgcanvas`,
alongside the central logger and `Editor.setDebugLogger()`. 8 `catch`
blocks contain only a comment. Route these through the logger, and let the
host set its level and sink, so warnings from users' sessions reach the
plugin's debug log. Small.

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

## Repo hygiene (upstream leftovers, stale config)

- `test-results/.last-run.json` is committed, and `test-results/` isn't
  gitignored.
- vitest `coverage.include` is a hand-picked list of 14 files, one of
  which (`core/utilities.js`) doesn't exist. Use globs.
- Two coverage systems: nyc (`nyc.config.js`) and `vite-plugin-istanbul`
  for e2e, plus v8 for unit tests.
- Dead config: `babel.config.json` (Babel isn't installed), `lgtm.yml`
  (that service shut down in 2022), `composer.json`, `netlify.toml`,
  `FUNDING.yml`, and the cypress entries in `.gitignore`.
- CI uses `actions/checkout@v3`/`setup-node@v3` on Node 20 (end of life
  April 2026). Move to v4 and Node 22/24.
- `packages/svgcanvas` has `"prebuild": "standard . && npm i"`, so building
  runs `npm install` as a side effect.
- `scripts/check-dom-scope.mjs`'s header comment points to a techdebt entry
  ("Multi-instance wrong owning editor leaks") that no longer exists.

Each is small. Batch them into one cleanup commit.
