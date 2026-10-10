# Roadmap

Guidelines and planned work that are **not scheduled** but should shape future development.
Read it at the start of a task: if the task touches an area below, apply the guideline or fold the
item in; otherwise leave it. `techdebt.md` is the other half (compromises and known hazards):
a roadmap item is something we *want*, a techdebt item is something we *owe*.

When you finish an item, delete it (git history keeps the record). When you defer a feature,
add it here; when you take a shortcut, add it to `techdebt.md`.

## Tier 0 follow-ups (VectorCraft port)

Not started; none has a consumer yet unless noted.

- **Tool hooks `cursor()` and `options()/setOption()`** from the tool-contract plan. Implement with the first
  tool that needs a custom cursor or a tool-options bar (shape-family's "no custom cursor" is the likely first).
  `wantsHover` exists and is used by the cutter.
- **Live-effects preview on transactions.** `live-effects.js` still hides the original and shows a throwaway
  clone (`data-se-ephemeral`). A transaction-based preview would mutate and re-select the real element on every
  param tick and rebuild the effects panel mid-edit, so it needs a lighter "apply without re-select" path first.
  Other hand-rolled previews: ext-curvature, ext-cutter (both already ephemeral).
- **Precise `enabled` on commands.** Most commands are still "always" (what the buttons were). Gate them on selection
  type (path, text, group, ≥2 shapes, …), with a reason string; the command sweep and `list()` get more truthful and
  the tooltips explain themselves. Do it per area when touching its panel.
- **Puppet warp on `registerTool`.** Needs a way for a gesture to cancel without dooming an enclosing session
  transaction (see `techdebt.md`, "Tool contract (compromises)"). Worth it only if a second session-style tool
  appears (e.g. a mesh/lattice tool); then give the registry a session concept instead of special-casing.
- **Lazy transaction snapshot** (targeted at the elements a caller declares) if anything ever needs a transaction
  per pointer-move.
- **Plugin side:** expose `editor.commands.list()/run()` as Obsidian palette entries and hotkeys. Tracked in the
  plugin repo (`../obsidian-svgedit-plugin/.claude/techdebt.md`, "Expose the editor's command registry…").

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

## Missing translations: extension-injected strings

When an entry is missing, i18next returns the key, so `t('key') || 'Fallback'` never falls
back. `tests/unit/locale-keys.test.js` fails if a literal `t('ns.key')` isn't in
`lang.en.js`; static panel labels go through `panelI18n.js` (`panel.<slug>`, also
`data-caption`). Remaining: labels some extensions inject (Brush, Markers, …) and a
handful of component strings are still English. A `parseMissingKeyHandler` isn't an
option while components pass literal English as `title` (they rely on the key coming back).
Only the English locale exists today. Small.

## UI / UX polish

*The UI sections below came out of a UI/UX review (2026-10-07: screenshots at 1440×900, 1024×700 and 800×600, light, dark and tablet modes, plus the live hotkey registry). Obsidian-only findings are in `../obsidian-svgedit-plugin/.claude/techdebt.md`.*

### Toolbars: left column doesn't fold into "…" automatically

Narrow-pane work is done (top bar two-tier collapse + "⋯" tray, tablet command bar
shedding by container width, palette keeps a 14px swatch minimum and scrolls). What's
left: tools in the left column scroll (with "Additional tools" pinned) rather than
moving into `…` when the pane is short. Moving them automatically must not persist the
temporary split as the user's saved order. Covered by `tests/e2e/top-bar-layout.spec.js`.
Small.

### Keyboard shortcuts

Done: Tab/Shift+Tab cycle, `V` select, Duplicate `D`, platform-formatted tooltips, default
keys for Image (M), Brush (W), Cutter (C), Curvature (Y), Puppet warp (X). Tab / Shift+Tab
cycle the drawing's elements only when the canvas has the keyboard; on a focused toolbar
control (`isFocusControl` in `Hotkeys.js`) they move focus normally. Remaining:
- The Shapes flyout and Shape library are not `se-button`s, so they can't take a
  `shortcut` attribute yet (`seFlyingButton`/`seShapeLibrary` don't register with the
  hotkey manager). Small.

### Side panel and top bar: remaining polish

Done: panel opens once on the first selection in a pane ≥1100px wide (a manual toggle is
remembered, `sidePanelManual` pref); Path actions carry captions (`data-caption`); the
theme toggle is no longer a default extension (Preferences has theme). Remaining:
- The six top-bar toggles (frame, wireframe, canvas settings, grid, smart snap, layer view)
  are icon-only with tooltips; visible labels don't fit the tight bar.
- Join/Cap icons are solid glyphs; Brush settings is a lone gear. Small.

### Icons and palette

Done: solid silhouettes are outlined at load (`OUTLINE_ICONS`), curated default palette
plus a "colours in this drawing" row, larger selection handles on coarse pointers,
tooltips shortened to the name. Remaining:
- The Cutter icon (a marker over a dotted line) doesn't suggest cutting — a redraw.
- Shapes shows doubled lines where its artwork has holes.
- The "none" swatch is still faint in the dark theme. Small.
