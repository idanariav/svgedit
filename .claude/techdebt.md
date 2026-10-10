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

## Round-trip corpus: keep adding drawings

`tests/e2e/roundtrip.spec.js` loads/saves/loads every drawing in
`tests/e2e/fixtures/roundtrip/` and asserts the output stabilises after one
pass. Covered: frames, corner radius, taper, shadow/outline, text-on-path,
groups/layers/gradients, markers, clip-path/mask, `<use>`/symbols, embedded
images, repeat (radial + grid), mirror and puppet-warp. Corner-radius and taper
predate the `xmlns:se` fix and double as legacy-file coverage. Not covered:
repeat's *path* mode, and real drawings from the plugin. Each new corruption bug
should add the file that exhibited it. Small per fixture.

## `svgcanvas.d.ts` is hand-written and incomplete; no explicit host API

`npm run typecheck` (part of `pretest`) compiles `packages/svgcanvas/svgcanvas.d.ts`
via `packages/svgcanvas/tsconfig.json`, which catches broken re-exports (it found a
stale `sanitizeSvg` export). `tests/unit/svgcanvas-dts-drift.test.js` compares a live
`SvgCanvas` instance with the d.ts class and fails on any runtime member that is
neither declared nor listed on `InternalMembers` (`svgcanvas-internal.d.ts`: ~217
names typed `any` and tagged `@internal` — state accessors and module plumbing
that nothing in the editor or extensions calls). Promote a member to the public
API by declaring it properly and deleting it from `InternalMembers`. Runtime-attached members now live in `packages/svgcanvas/svgcanvas-members.d.ts`
(`AttachedMembers`): `svgcanvas.d.ts` merges it into the class, and `svgcanvas.js`
extends it through a JSDoc cast on its base class (augmenting the JS module
doesn't work — TS ignores `declare module` merges into a JS-declared class).
`svgcanvas.js` carries `// @ts-check` and is part of `npm run typecheck` (strict,
but `noImplicitAny`/`strictNullChecks` off — turning those on gives ~150 errors
there; tighten per file). 32 of the 73 `core/`+`common/` modules now carry it too (all
those that type-checked with no, or only trivial, errors; JSDoc `{Float}`/`{Integer}`
became `{number}`). The other 41 each have 2–14 errors, mostly `ChildNode`/`Element`
vs `SVGGraphicsElement` casts and Paper.js item types — add the pragma to them one at a
time, declaring what they attach in `AttachedMembers` as you go.

The host API is `src/editor/hostApi.d.ts` (`EditorHostApi`, `HostCanvas`),
typechecked against `Editor` by `npm run typecheck` and copied to
`dist/editor/hostApi.d.ts`; the plugin consumes it.
Also open: generate the `svgcanvas.d.ts` from JSDoc instead of hand-writing it,
and the root `tsconfig.json` is `module: commonjs` and unused by any script. Medium.

## Convert `packages/svgcanvas` core modules to TypeScript

Raised 2026-10-09 while comparing svgedit with VectorCraft (Rust): most of
the bugs this file records (`undefined` appended into `<defs>`, wrong
element types, stale attribute names) are ones a strict compiler catches. Not started
because nobody asked for it yet. The editor stays JavaScript; the goal is
type safety in the canvas engine, not a rewrite.

**Where things stand (updated 2026-10-10):** the modules added by Tier 0
(`transaction.js`, `tool-registry.js`, `drawing-invariants.js`) plus
`common/logger.js` are `// @ts-check` **and strict-clean** — the first three are listed in
`packages/svgcanvas/tsconfig.strict.json` (`logger.js` is pulled in through their imports) (`noImplicitAny` +
`strictNullChecks`), part of `npm run typecheck`; add a file there once it
passes (that is step 2 below, done for these four). Editor-layer Tier 0
modules (`commands.js`, `coreCommands.js`, `automation.js`,
`components/commandBinding.js`) are `// @ts-check` too, checked through
`src/editor/tsconfig.hostapi.json`. Everything else: 34 of the ~76 `core/` +
`common/` modules carry `// @ts-check` (JSDoc types), checked with
`noImplicitAny` and `strictNullChecks` **off**
(`packages/svgcanvas/tsconfig.json`). Decision so far: strict JSDoc, no `.ts`
files (no toolchain change). Public types live in the hand-written
`svgcanvas.d.ts` / `svgcanvas-members.d.ts` / `svgcanvas-internal.d.ts`,
kept honest by `tests/unit/svgcanvas-dts-drift.test.js`. The entry above
covers finishing that `@ts-check` rollout.

**Decide first ❓ — `.ts` files or strict JSDoc?** Both give the same checks.
Strict JSDoc (`checkJs`, as Svelte does) needs no toolchain change; `.ts`
files are terser and let `tsc --emitDeclarationOnly` generate the d.ts.
Either way, do steps 1–2 first, since they pay off immediately and are
needed by both.

1. **Finish `@ts-check`** on the remaining 42 modules (entry above).
2. **Tighten per file:** turn on `noImplicitAny` and `strictNullChecks`
   (globally they give ~150 errors in `svgcanvas.js` alone, so use a
   per-file opt-in, e.g. a second tsconfig listing the files already clean).
3. **Only if `.ts` was chosen — toolchain:**
   - Vite and Vitest already transpile `.ts` (no type checking at build
     time; `npm run typecheck` stays the gate).
   - Lint: `standard` doesn't lint TypeScript. Switch to `ts-standard` or
     ESLint with `typescript-eslint` + the standard config, so `.js` and
     `.ts` follow one style. This is the main cost.
   - e2e coverage (`vite-plugin-istanbul` + nyc in `scripts/run-e2e.mjs`):
     check that `.ts` files still map back to source.
   - The canvas wires its modules together with `runGuardedInit` and
     members attached at runtime (`AttachedMembers`); type that pattern
     through an interface rather than rewriting it.
4. **Convert leaf modules first** (no or few imports, pure math): `math.js`,
   `units.js`, `namespaces.js`, `se-namespace.js`, `proportions.js`,
   `geometry-remap-registry.js`, `common/util.js`. Then upward through the
   import graph; `svgcanvas.js` last. One module per commit, tests green
   after each.
5. **Generate the declarations** from source and delete the hand-written
   d.ts files (and probably the drift test, or point it at the generated
   output). This also closes the "generate `svgcanvas.d.ts`" item above.

**Don't break:** the published package shape (`main: dist/svgcanvas.js`,
`types: svgcanvas.d.ts`), `src/editor/hostApi.d.ts`, which the Obsidian
plugin consumes, and the self-contained `dist/editor/Editor.js` bundle. The
plugin only sees built JS, so it is unaffected as long as those hold.

**New code meanwhile:** modules added by the VectorCraft port plans
(`.claude/plans/vectorcraft-port/`, e.g. `anchor-path.js`,
`live-effects.js`, `bezier-fit.js`) should start with `// @ts-check` and
full JSDoc types (or as `.ts` if the decision above has been made), so they
don't add to this backlog.

Effort: large in total (69+ files) but small per module; risky only in the
toolchain step.

## Tier 0 follow-ups (VectorCraft port, 2026-10-10)

Done in Tier 0: layering guard, undo transactions (+ `BatchCommand` coalescing), command
registry (pilot), drawing invariants + command sweep + property tests, tool contract (pilot:
ext-shape-family), automation API. What it deliberately left, and what it found:

**Bugs the sweep / property tests found and that are NOT fixed**
- **`getSvgString()` purges unused `<defs>` as a side effect** (`svg-exec.js` ≈ line 47, the
  `removeUnusedDefElems` loop), and that purge is not an undo step. Delete the only user of a
  gradient/filter, autosave (or save) → undo → the shape comes back with `fill="url(#gone)"`.
  Fix: record the purge, or only purge on export. High (silent data loss with autosave).
- **NaN tspans in saved drawings.** Before this work, undoing/redoing *any* attribute change on a
  `<text>` with tspans wrote `x="NaN" y="NaN"` into them (`undo.js` computed `undefined - undefined`).
  Prevention is fixed and tested, and `sanitizeLegacyNaNTspans()` (`legacy-repairs.js`, called from
  `setSvgString()` and `svgCanvasToString()`, `tests/unit/legacy-repairs.test.js`) drops NaN x/y/dx/dy from
  tspans so they inherit from their `<text>` (the original positions are not recoverable). **Fixed.**
- **Deleting a path leaves the `<textPath>` that runs along it dangling** (`dangling-ref`), as does
  Stroke-to-Path. Known issue in `tests/e2e/command-sweep.spec.js` (`KNOWN_ISSUES`).
- **ext-mirror:** redo of Object-to-Path on a mirrored shape re-syncs the twin from a style-less path
  (also in `KNOWN_ISSUES`). Not caused by the batch coalescing (verified with it disabled).
- Layer lock / dim (`tool_layerView`) is not an undo step (documented in `draw.js`), so the sweep excludes it.
- Fixed on the way (all "ChangeElementCommand constructed before the mutation" — redo re-applied the old
  value and left dangling refs): `fx-filter.js` `writeEffects` (glow / outline / shadow removal), `clip-mask.js`
  `releaseClipMask`, `text-attrs.js` text-decoration toggles. Also: `paste` before the first right-click threw
  (`getLastClickPoint` on `null`), `ext-mirror` threw on a source replaced by Object-to-Path, move / delete /
  cut didn't record `se:*` source attributes (now `atomic`).

**Migrate hand-built undo to `transact()`** — 60 `new BatchCommand` call sites in 34 files remain
(`grep -rn "new BatchCommand"`). Do it opportunistically when touching a file; the pattern to look for is a
`ChangeElementCommand` built before its mutation. `live-effects.js` apply/remove/expand, `text-attrs.js`
decoration toggles and ext-shape-family are done. Also: other buttons/shortcuts that the sweep shows are
fine today but would be safer `atomic` (it is opt-in per command, `editorShortcuts.js` / `coreCommands.js`).

**Transactions**
- Cost is O(elements) at begin and at commit/cancel (≈14 ms at begin, ≈22 ms at commit for 5,000 elements). Fine for gestures; if a
  future caller wraps something that runs per pointer-move, add a lazy/targeted snapshot.
- `live-effects.js` *preview* still uses the hidden-original + throwaway-clone design (clone marked
  `data-se-ephemeral`). A transaction-based preview would mutate and re-select the real element on every
  param tick and rebuild the effects panel mid-edit. Other hand-rolled previews: ext-curvature, ext-cutter.
- `undo.js`'s `<text>` x/y tspan shift still applies only when the command carries x/y; a transaction that
  moves a text and its tspans drops the tspans' x/y so they are not shifted twice (tested). A transaction
  that changes the text's x and independently its tspans' x by a different amount would undo wrongly.

**Command registry**
- Only the pilot commands are real commands; every other button/menu item is an *adapter*. Migrate button
  by button (`command="…"`), moving its enable/disable logic out of `topPanelContext.js` into `enabled`.
  The button's `title` does not yet show the disabled reason (`list()` / `isEnabled()` do).
- `INTERACTIVE_IDS` (`Hotkeys.js`) is a static list found by the sweep; a new dialog-opening button must be
  added (or registered as a real command with `interactive: true`).
- A hotkey on a disabled command is now inert and does not `preventDefault` (before, the button's own
  guard swallowed it but the key was still prevented). `tool_clone` and `tool_clone_multi` share the default
  key `D`; rebinding one leaves the other on it.
- Plugin-side: expose `editor.commands.list()/run()` as Obsidian palette entries / hotkeys (plugin repo work,
  see its techdebt).

**Tool contract**
- Only ext-shape-family is ported. ext-polystar has no tests; write characterisation tests before porting it.
  `cursor()` and `options()/setOption()` from the plan are not implemented (no consumer yet); hover is
  implemented (`wantsHover`) but has no pilot. Built-in modes (select/path/text/resize/rotate/zoom/shape) stay
  in `event.js`.
- Behaviour change in the ported tools: with grid snapping on, the dragged end now snaps too (the legacy
  hooks snapped only the start point).

**Tests / tooling**
- `@fast-check/vitest` (0.5.0) needs vitest ≥ 4.1; the repo is on 4.0.16, so only `fast-check` is installed
  (`tests/unit/properties/`, seed with `FC_SEED=…`). Install the vitest integration after the vitest upgrade.
- The e2e `afterEach` invariant check can be opted out per test with
  `test.info().annotations.push({ type: 'allow-corrupt-drawing', description: '…' })`; none do today. The
  `closed-subpath` rule from the plan was not implemented on purpose (the node editor repairs `Z`-only
  subpaths itself; it is not corruption) and a layer without `<title>` is not flagged (external SVGs have them).
- `tests/e2e/unit/*` (the browser harness) was failing on HEAD: `anchor-path.js`'s bare `import 'svgpath'`
  was unresolvable in the harness page. Fixed by bundling it (`copy-static.mjs`) and mapping it in
  `unit-harness.html`. `check-dom-scope` was also failing on HEAD (`ext-path-edit.js`); fixed.

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

## Dialog colours: deliberate hard-coded hex

Every dialog follows the editor's light/dark theme (`svgedit.css` lists each dialog tag in its
light and dark token blocks; each calls `syncDialogTheme()` on open;
`tests/unit/dialog-theme-tokens.test.js` guards it). `syncDialogTheme()` also copies the
resolved design tokens (`DIALOG_TOKENS` in `themeUtil.js`) from the owning `.svg_editor`, so a
host that overrides tokens there reaches the dialogs too — a token added to the design set
must be added to that list. The ~50 remaining hard-coded hex values in components/dialogs are
deliberate: text on accent buttons, colour-picker maths, danger red, grid default. The
`--cp-*` / `--pd-*` modal tokens are intentional named component tokens.

## Repo hygiene leftovers

- Two coverage systems remain: nyc (`nyc.config.js`, used by
  `scripts/run-e2e.mjs` to merge e2e + vitest coverage), `vite-plugin-istanbul`
  for e2e, and v8 for unit tests. Consolidating means reworking the merge step.

---

The entries below came out of a UI/UX review (2026-10-07). It used screenshots
of the dev server at 1440×900, 1024×700 and 800×600, in light, dark and tablet
modes, plus the live hotkey registry. They are listed most severe first.
Obsidian-only findings are in `../obsidian-svgedit-plugin/.claude/techdebt.md`.

## Toolbars: left column doesn't fold into "…" automatically

Narrow-pane work is done (top bar two-tier collapse + "⋯" tray, tablet command bar
shedding by container width, palette keeps a 14px swatch minimum and scrolls). What's
left: tools in the left column scroll (with "Additional tools" pinned) rather than
moving into `…` when the pane is short. Moving them automatically must not persist the
temporary split as the user's saved order. Covered by `tests/e2e/top-bar-layout.spec.js`.
Small.

## Live effects (`se:fx`): follow-ups from T1.0 / T1.1

- **No stacking with taper / corner radius.** v1 makes `se:fx-d` mutually
  exclusive with `se:taper-d` and `se:orig-d` (`canApplyLiveEffect`,
  `canTaperStroke`, `canRoundCorners`). Letting them stack means defining an
  order (corners → effects → taper?) and a single source-of-truth attribute;
  not attempted. Size M.
- **Param labels aren't localized.** `ext-live-effects` builds its param form
  from each effect's `defaults` keys and humanizes them (`dx` → "Dx"); only the
  effect `label` and the panel chrome are translatable. Add per-effect
  `labels` to the registry when a second locale needs them.
- **Scribble is a stroked centerline, not an outlined shape.** The effect
  returns the hatch line and the registry paints it as a stroke
  (`strokeOutput` + `se:fx-style`), so the element is no longer a *filled*
  shape while it is applied; "Expand" keeps the stroke paint. Outlining it
  with `core/path-offset.js` `strokeToPath` would give a real fill, but that
  path depends on paper/clipper (not unit-testable under jsdom). The hatch
  stroke-width is also not rescaled when the element is scaled.
- **Distort effect defaults differ slightly from VectorCraft.** Zig Zag
  defaults to `points=corner` (Illustrator's default; VectorCraft's missing-key
  default is smooth), and Pucker & Bloat / Twist default to a visible
  amount (30 / 50°) so a freshly added effect does something.
- **Warp on a flat box borrows the other axis.** VectorCraft clamps a
  zero-height box to 1e-9, so warping a straight horizontal line moves it by
  ~1e-9 px; `core/warp.js` uses the other axis' half-size instead so Arc on a
  line visibly bends it. Warp on text is out of scope (no glyph outlines).
- **Preview selection box.** While previewing, the original element is hidden
  and a clone shows the result, so the selection box keeps the *original's*
  bbox until Apply. Cosmetic.

## Missing translations: extension-injected strings

When an entry is missing, i18next returns the key, so `t('key') || 'Fallback'` never falls
back. `tests/unit/locale-keys.test.js` fails if a literal `t('ns.key')` isn't in
`lang.en.js`; static panel labels go through `panelI18n.js` (`panel.<slug>`, also
`data-caption`). Remaining: labels some extensions inject (Brush, Markers, …) and a
handful of component strings are still English. A `parseMissingKeyHandler` isn't an
option while components pass literal English as `title` (they rely on the key coming back).
Only the English locale exists today. Small.

## Keyboard shortcuts

Done: Tab/Shift+Tab cycle, `V` select, Duplicate `D`, platform-formatted tooltips, default
keys for Image (M), Brush (W), Cutter (C), Curvature (Y), Puppet warp (X). Tab / Shift+Tab
cycle the drawing's elements only when the canvas has the keyboard; on a focused toolbar
control (`isFocusControl` in `Hotkeys.js`) they move focus normally. Remaining:
- The Shapes flyout and Shape library are not `se-button`s, so they can't take a
  `shortcut` attribute yet (`seFlyingButton`/`seShapeLibrary` don't register with the
  hotkey manager). Small.

## Side panel and top bar: remaining polish

Done: panel opens once on the first selection in a pane ≥1100px wide (a manual toggle is
remembered, `sidePanelManual` pref); Path actions carry captions (`data-caption`); the
theme toggle is no longer a default extension (Preferences has theme). Remaining:
- The six top-bar toggles (frame, wireframe, canvas settings, grid, smart snap, layer view)
  are icon-only with tooltips; visible labels don't fit the tight bar.
- Join/Cap icons are solid glyphs; Brush settings is a lone gear. Small.

## Icons and palette

Done: solid silhouettes are outlined at load (`OUTLINE_ICONS`), curated default palette
plus a "colours in this drawing" row, larger selection handles on coarse pointers,
tooltips shortened to the name. Remaining:
- The Cutter icon (a marker over a dotted line) doesn't suggest cutting — a redraw.
- Shapes shows doubled lines where its artwork has holes.
- The "none" swatch is still faint in the dark theme. Small.

## Live Corners (`se:corner-radius`): follow-ups from T1.3

Done: per-corner radius + kind (round / inverted / chamfer) on any path's straight-sided corners, rects and polygons convert to a path on first use; the single-number format renders exactly as before (the arc construction was kept, not VectorCraft's cubic approximation, so saved drawings do not move — verified byte-identical against the old implementation on 3,200 random shapes). Remaining:
- **No per-corner UI.** The panel edits every corner; per-corner values only come from the attribute / `applyCornerRadius(r, {kind, corners})`. VectorCraft's on-canvas widgets (`crates/tools/src/corners.rs`: drag to change radius, Alt-click cycles kind) and "selected anchors in pathedit limit the corners the panel edits" are not ported. Pathedit still shows the *cut* anchors and drops the attrs when `d` is edited, so editing the source in pathedit needs its own design.
- **Corner cuts are SVG arcs.** Exact, but anything that only understands M/L/C (boolean ops, Round Corners effect on an already-cut path) goes through `parseAnchors`' arc→cubic conversion. Not a problem today because `se:orig-d` and `se:fx-d` are exclusive.
- **Rect `rx`/`ry` are dropped** when a rect is first cut (the panel shows `rx` as the starting radius, but a rect with different `rx`/`ry` loses the elliptical rounding).
- **No stacking with live effects / taper** (same limit as the live-effects entry above).

## Glow (`fx-filter.js` / ext-glow): follow-ups from T1.7

Done: outer and inner (edge / centre) glow and feather in the shared composer, on any element incl. text; shadow-only and outline-only filters are byte-identical to before. Remaining:
- **Feather is a hard-radius feather only**: it fades by the shape's own blurred alpha, so very thin shapes (thin strokes, small text) fade almost entirely at large radii. No separate feather shape / gradient control.
- **Glow cannot coexist with the Blur slider** (same limit as shadow / outline: a foreign filter is saved and restored, the blur filter is a separate `{id}_blur`).
- **The shadow is cast by shape + outer glow** (it is fed from the newest merge). Deliberate, matches the plan; a shadow of the bare shape would need the shadow placed before the glow blocks.
- Fixed on the way: the composer built `RemoveElementCommand(existing, existing.parentNode)` (parent passed as `oldNextSibling`), so undoing any shadow / outline edit that replaced or removed the filter threw; it now passes `(existing, existing.nextSibling, existing.parentNode)`.


## Shape-family tools (ext-shape-family): follow-ups from T1.5

Done: Spiral, Arc, Rectangular Grid and Polar Grid drag tools with Shift / Alt / Space / arrow-key modifiers and a click-for-options popover. Remaining:
- **Shapes are plain paths / groups, not re-editable.** VectorCraft keeps no parameters either, but the plan floated `se:shape="spiral(decay=80,segments=10)"` so the popover could regenerate a selected shape; not stored. Changing a count means redrawing (undo, then arrow keys while dragging).
- **No smart-guide snapping while drawing** (VectorCraft snaps the start and the dragged corner, and shows a measurement label) — that is T2.1.
- **Not in the tablet shell** (`TabletShell.js` `SHAPES`): the four tools are only in the desktop shapes flyout.
- **No keyboard shortcuts / no custom cursor** (they use the plain crosshair).
- **Alt held at release keeps the tool** — core `mouseUpEvent` skips `setMode('select')` when `evt.altKey` is set for every shape tool; with Alt now meaning "from the centre" for arc/grids, releasing the mouse before Alt leaves the tool active (the shape is still selected). Pre-existing core rule, only more visible here.
- Fixed on the way: `EditorStartup` read only the last extension's answer to the `keyDown` hook (`runExtensions` without `returnArray` keeps the last result), so another extension's `undefined` could cancel an earlier `preventDefault` (e.g. curvature's Escape); it now collects all answers. The editor's Space `keyup` also unconditionally reset the mode to the previous one (a bare Space tap in any drawing tool switched to Select); it now only does so when Space had armed pan.
