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

## `units.js` legacy default instance

Production code now uses a per-canvas `svgCanvas.units` (`createUnits(canvas)`;
rounding digits, base unit, `%` size and id lookup all come from that canvas),
`draw.js`'s randomize-ids mode is per canvas (`svgCanvas.randIdsMode`), and the
unit table is a canvas-independent lazy cache. What remains is the legacy
`units.init(container)` + free functions (`shortFloat`, `convertToNum`, …),
a "last `init` wins" default instance kept for the static
`SvgCanvas.convertToNum`-style helpers handed to hosts and for tests/tools that
run one canvas. The editor no longer calls the statics. Remove them (and update
the ~10 tests that call `units.init(mock)`) once no host depends on them. Small.

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

## Round-trip corpus is small

`tests/e2e/roundtrip.spec.js` loads/saves/loads six generated drawings
(`tests/e2e/fixtures/roundtrip/`: frames, corner radius, taper, shadow/outline,
text-on-path, groups/layers) and asserts the output stabilises after one pass.
Two of them (corner-radius, taper) were saved before the `xmlns:se` fix and
double as legacy-file coverage. Missing: real drawings from the plugin (images,
markers/connectors, clip/mask, `<use>`/symbols, puppet-warp, mirror/repeat
stamps). Add fixtures as such drawings turn up; each new corruption bug should
add the file that exhibited it. Small per fixture.

## `svgcanvas.d.ts` is hand-written and incomplete; no explicit host API

`npm run typecheck` (part of `pretest`) compiles `packages/svgcanvas/svgcanvas.d.ts`
via `packages/svgcanvas/tsconfig.json`, which catches broken re-exports (it found a
stale `sanitizeSvg` export). `tests/unit/svgcanvas-dts-drift.test.js` compares a live
`SvgCanvas` instance with the d.ts class and fails on any new undeclared public
member; today's gap (~380 members) is the ratchet list
`tests/unit/svgcanvas-dts-known-gap.json` — declare members in the d.ts and delete
them from the list. Runtime-attached members now live in `packages/svgcanvas/svgcanvas-members.d.ts`
(`AttachedMembers`): `svgcanvas.d.ts` merges it into the class, and `svgcanvas.js`
extends it through a JSDoc cast on its base class (augmenting the JS module
doesn't work — TS ignores `declare module` merges into a JS-declared class).
`svgcanvas.js` carries `// @ts-check` and is part of `npm run typecheck` (strict,
but `noImplicitAny`/`strictNullChecks` off — turning those on gives ~150 errors
there; tighten per file). The other `core/*.js` modules are not checked yet:
add `// @ts-check` to them one at a time, declaring what they attach in
`AttachedMembers` as you go. Still open: the root `tsconfig.json` is `module: commonjs` and
unused by any script; the plugin types `Editor` as `unknown`-ish and reaches into
internals (`svgCanvas`, `configObj`, `$svgEditor`, `svgCanvas.modeEvent`). Fix:
define an explicit host API on `Editor`, enable `checkJs` for that surface first,
generate `.d.ts` from the JSDoc (`tsc --declaration --emitDeclarationOnly`), ship it
in `dist/`. Medium.

## Oversized modules (remaining)

All eight files that were over ~1,500 lines are now under it (Editor.js 1,451,
seShapeLibrary.js 1,358, svg-exec.js 1,249, draw.js 1,209, selected-elem.js
1,172, TopPanel.js 1,161, elem-get-set.js 1,110, EditorStartup.js 1,092), by
moving cohesive blocks into `addToShapeLibrary.js`, `editorShortcuts.js`,
`seShapeLibrary.css.js`/`.data.js`, `core/svg-defs.js`, `core/legacy-repairs.js`,
`core/layer-ops.js`, `core/text-attrs.js`, `core/group-ops.js` and
`panels/topPanelContext.js`. What's left is still big in one place each:
`EditorStartup.init()` (~770 lines of listener wiring), `SeShapeLibrary` (one
~1,300-line class: store/view/menu not separated), `Drawing` in `draw.js`
(~880 lines), and `TopPanel.init()`. Split those only with a concrete reason.

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
