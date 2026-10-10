# Roadmap

Guidelines and planned work that are **not scheduled** but should shape future development.
Read it at the start of a task: if the task touches an area below, apply the guideline or fold the
item in; otherwise leave it. `techdebt.md` is the other half (compromises and known hazards):
a roadmap item is something we *want*, a techdebt item is something we *owe*.

When you finish an item, delete it (git history keeps the record). When you defer a feature,
add it here; when you take a shortcut, add it to `techdebt.md`.

## Implementation order

One sequence for the VectorCraft port plans (`plans/vectorcraft-port/tier-1|2|3.md`) **and** the roadmap items
below. It supersedes the ID order on the plans' status board. Tier 0 and all of Tier 1 are done.
Rules used: dependencies and shared modules first; quick wins before large items; a roadmap item is scheduled
with the first feature that needs it (never as a standalone task, so nothing gets built without a consumer);
small items (S) fill gaps between large ones.

**Phase 1 — done** (items 1–4: T1.6 Shaper, T2.9 Copy style, T3.1 Scrubby labels, T2.10 Select Same). Item numbers below are stable references, so they start at 5.

**Phase 2 — done** (items 5–6: T2.1 Snapping while drawing, T2.2 Ruler guides). Item numbers below stay as they were.

**Phase 3 — done** (items 7–11: T2.15 Corner-keeping simplify, T2.3 Pen continues / joins, T2.16 Smooth tool, T3.7 Pencil continues, T2.12 Centerline tracing; the path commands got their precise `enabled` with it).

**Phase 4 — stroke and appearance**
12. ~~**T2.5 Dashes fitted** (v1)~~ done (v2, corners, below) and 13. **T2.4 Arrowheads** — a small stroke feature, no deps.
14. **T2.6 Width profiles + Width tool** (L) — generalises taper.
15. **Live effects / corner radius / taper stacking** (roadmap, "Live effects" section) — design it *after* T2.6, because
    width profiles change the single-source-of-truth question (`se:taper-d` vs. the new profile).
16. **T2.14 Art / pattern brushes** (no dependency on width profiles; it reuses T1.0's `mapNonlinear`; grouped here as the
    other "appearance follows the path" feature), then 17. **T2.13 Blend tool** — build `options()/setOption()` with
    Blend (steps/spacing), the first tool with a real options bar.

**Phase 5 — on-canvas editors (session-style tools)**
18. **T2.7 Free / Perspective Distort** — on-canvas handles with a live preview of effect params, so it is the first
    real consumer of two Tier 0 follow-ups, done *with* it: (a) the lighter "apply without re-select" path, then
    **live-effects preview moves onto transactions**; (b) if its design keeps the mode open across several handle drags
    as one undo step (the plan says one step per mouseup, in which case skip this), the registry gets a **session
    concept and puppet-warp moves onto `registerTool`**. Otherwise puppet-warp waits for the next session-style tool
    (T2.8 or T2.11 are candidates).
19. **T2.8 On-canvas gradient editor**; the **corner-radius widgets** deferred from T1.3 reuse the same handle
    infrastructure. 20. **T2.11 Recolor Artwork** (M–L).

**Phase 6 — panels and text**
21. **T2.17 Layers panel: object rows** (L) → 22. **T3.6 Layers extras**.
23. **T3.5 Area text** (M–L) — do the text-command `enabled` pass with it.
24. **T3.3 Transform Each**, **T3.4 Split Into Grid**, **T3.2 Measure tool** — S; slot them between large items
    (Measure is the first consumer for `cursor()`).

**Background tracks (no phase)**
- **Typing:** stay on strict JSDoc (no `.ts`, no toolchain change). Finish the remaining `@ts-check` modules in
  small batches whenever a phase touches them; once most are checked, generate the declarations from source and delete
  the hand-written d.ts files (see the TypeScript section). Do not start a dedicated conversion project.
- **Plugin command palette** (plugin repo): independent and high leverage, since every command added in the phases above
  appears there for free. Best done before Phase 3, whenever the plugin is next touched.
- **UI/UX polish** (toolbars folding, shortcuts for the flyouts, the cutter icon, faint "none" swatch): one batched pass
  after Phase 2, or opportunistically when a feature touches that toolbar.
- **Translations:** wait until a second locale is wanted; the guideline (all new strings via `t()`) keeps the cost down.
- **Round-trip corpus, `checkDrawing` rules, command sweep:** every phase adds its fixtures and keeps the sweep green.

## Tier 0 follow-ups (VectorCraft port)

Not started. Each is scheduled with the first feature that needs it (see *Implementation order*); do not build them standalone.

- **Tool hooks `cursor()` and `options()/setOption()`** from the tool-contract plan. Implement with the first
  tool that needs a custom cursor or a tool-options bar (shape-family's "no custom cursor" is the likely first).
  `wantsHover` exists and is used by the cutter. *Scheduled:* `options()` with T2.13 (Phase 4). `cursor()` was planned
  for T2.2 but the ruler guides did not need it: their grab lines carry a CSS resize cursor of their own, so it
  waits for the first tool that has to change the cursor over the plain canvas (T3.2 Measure is the likely one).
- **Live-effects preview on transactions.** `live-effects.js` still hides the original and shows a throwaway
  clone (`data-se-ephemeral`). A transaction-based preview would mutate and re-select the real element on every
  param tick and rebuild the effects panel mid-edit, so it needs a lighter "apply without re-select" path first.
  Other hand-rolled previews: ext-curvature, ext-cutter (both already ephemeral). *Scheduled:* with T2.7 (Phase 5).
- **Precise `enabled` on commands.** Most commands are still "always" (what the buttons were). Gate them on selection
  type (path, text, group, ≥2 shapes, …), with a reason string; the command sweep and `list()` get more truthful and
  the tooltips explain themselves. Done for the path commands (node tray, Convert to Path, Stroke to Path, Join/Close, the keyless `path_*` entries); *Scheduled:* text in Phase 6; new commands get it from day one.
- **Puppet warp on `registerTool`.** Needs a way for a gesture to cancel without dooming an enclosing session
  transaction (see `techdebt.md`, "Tool contract (compromises)"). Worth it only if a second session-style tool
  appears; then give the registry a session concept instead of special-casing. *Scheduled:* with T2.7 if its design needs it, else with the next session-style tool (T2.8 / T2.11).
- **Lazy transaction snapshot** (targeted at the elements a caller declares) if anything ever needs a transaction
  per pointer-move. *Not scheduled:* no known consumer (T3.1's scrub is one transaction around a drag, which is cheap).
- **Plugin side:** expose `editor.commands.list()/run()` as Obsidian palette entries and hotkeys. Tracked in the
  plugin repo (`../obsidian-svgedit-plugin/.claude/techdebt.md`, "Expose the editor's command registry…"). *Scheduled:* a background track, best before Phase 3.

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

## Shaper (ext-shaper): follow-ups from T1.6

Done: line / rectangle / ellipse / regular polygon recognition, scribble-to-delete, one undo step per stroke (`core/shape-recognize.js`, `ext-shaper`). Remaining:
- **Not in the tablet shell** (`TabletShell.js` `TOOLS`), though pen/tablet users are the target. A ninth button overflows the command bar at 768px (`tests/e2e/top-bar-layout.spec.js` "tablet command bar fits"); add the button together with another width tier in `tablet.css` (or fold the freehand tools into one flyout). Small.
- **Shaper Groups** (VectorCraft's live compound results that re-recognise when a stroke is added) are deliberately skipped; results are plain shapes.
- **Polygons are plain `<polygon>`s**, not polystar polygons. Making them editable with the polystar sides field means teaching `ext-polystar` to keep an orientation instead of rebuilding from angle 0.
- **Returns to Select after a created shape**, like every drawing tool (Alt at release or tool lock keeps it). A Shaper-specific "stay in the tool" preference would suit sketching several shapes in a row.
- **Scribble hit-testing is sample-based** (`strokeTouches`): spacing is ≥ 0.5 document units and at most 2,000 samples, so a hairline crossed by a very long scribble at very low zoom can be missed. Text and images are tested by their bounding box.
- No custom cursor and no options bar (waits for the `cursor()` / `options()` tool hooks).

## Scrubby labels (`seSpinInput.js`): follow-ups from T3.1

Done: label scrubbing with modifiers, one undo step per drag, Escape, focused-wheel stepping, the preference. Remaining:
- **Other numeric fields**: only `<se-spin-input>` scrubs. Plain `<input type=number>` fields (a few dialogs) and `se-input` do not; the tablet shell's sheet fields never scrub (touch).
- **Wheel stepping is one undo step per notch** (like the arrow keys); coalescing a burst of notches is not done.
- A modifier pressed mid-drag changes the speed from then on (the value does not jump), but there is no on-screen hint of which multiplier is active.

## Pencil and Smooth Path fit (`core/path-fit.js`): follow-ups from T2.15

Done: the pencil commit and Smooth Path run on the corner-keeping fit (no paper.js left in `path-simplify.js`); Smooth Path is offered on any plain path. Remaining:
- **Corners are only turns of more than about 100°** (VectorCraft's threshold), so a 90° elbow (an L, a rectangle corner) is held to `pencilFidelity` rather than kept razor sharp. The window that measures the turn (`CORNER_REACH`, 6 tolerances) is also why a smooth curve tighter than about 6 units of radius reads as a corner. Both are tuning, not structure; judge them on real pen strokes and adjust.
- **The editor's own stabiliser** (`pencilStabilization`, an EMA) and B-spline capture round a corner before the fit sees it; the fit recovers the vertex from the two legs, but a tight hairpin loses a little more than a gentle turn. Lowering the stabilisation keeps corners truer.
- **`pencilFidelity` is in user units, not screen pixels**: drawing zoomed in commits as coarsely (in screen terms) as a stroke drawn zoomed out. Dividing by the zoom would make the pencil zoom-independent; not done, to keep the commit what it was.
- **Closed pencil strokes** (a loop closed onto its start) are not recognised as closed; the fit is always an open path. VectorCraft's `closed` flag was not ported.
- `simplifyWith` has no "straight lines only" mode (VectorCraft's Convert to Straight Lines); add it with the first caller.

## Pen continue / join (`core/pen-continue.js`): follow-ups from T2.3

Done: pressing an open path's end with the Pen carries it on (the same element, one undo step); pressing another open path's end while drawing joins them. Remaining:
- **A ring marks the end, not a cursor.** The plan asked for "continue" and "join" cursors; a `pen_end_hint` ring in the selector layer shows the same thing, and says nothing about continue vs join. Distinct cursor icons would need a tool-level `cursor()` hook (see "Tool hooks").
- **Only plain, untransformed, single-subpath open paths in the current layer** are offered (no current group, no `transform`, no `se:taper-d` / `se:orig-d` / `se:fx-d`, which would desync from their source). A rotated or grouped path draws a new path instead. Mapping the press into the path's own space would lift the transform limit.
- **Path ends behind other shapes still win**: the nearest end within 6 screen px is used, whatever is on top of it. Alt starts a new path instead; there is no option to turn the behaviour off.
- A press on the carried-on path's *other* end closes it (the pen's existing close-on-first-point rule); its other old points do nothing, unlike a brand-new drawing where the second point also closes.
- The throwaway drawing is still the pen's half-opacity temp element; the original is hidden (`display="none"`) while it stands in, and restored by `clear()` if the tool changes mid-gesture.

## Fitted dashes (`core/dash-fit.js`): follow-ups from T2.5 (v1)

Done: the Dash row's Fit toggle fits the pattern of a line, circle, ellipse or corner-less one-piece path to a whole number of periods, a dash centred on each end of an open stroke. Remaining:
- **v2: corners.** A rectangle, polygon or any path with corners is refused ("needs a path without corners"), which is most of what people dash. The plan's option (a), one sibling path per run inside a `<g se:dash-fit>`, was not started: it restructures the DOM (selection, undo, node editing, markers all see a group), so it deserves its own design. A cheaper partial win is a closed shape whose sides are all the same length (a square, a regular polygon): one pattern fits every side if it holds a whole number of periods per side.
- **The fit is not live.** `stroke-dasharray` is computed once; resizing, node editing or remapping the path leaves the old fit, which is a little off until Fit is pressed twice (off, on) or a dash style is picked again. `se:dash-fit` keeps the nominal pattern so a refit never compounds, but nothing triggers it. Auto-refit on `changed` would add a second, unrecorded write to the same gesture, or a second undo step; it needs a way to fold an attribute change into the command that was just recorded.
- **Round and square caps lengthen each dash** by the stroke width, which the fit ignores (it fits the pattern, not the painted marks). A dot pattern with round caps still centres its dots.
- **A `stroke-dashoffset` the user had set is replaced** by the fit and not restored when the fit is turned off.
- **Copy style** copies `stroke-dasharray` but not the offset or the marker, so a fitted source gives its target the stretched pattern without the fit.
- The Dash select shows blank for a pattern that is not one of its five presets (including every fitted one); only the Fit button shows that something is fitted.

## Centerline tracing (`dialogs/traceCenterline.js`): follow-ups from T2.12

Done: **Line art (centerlines)** in Convert to editable SVG traces thin strokes as stroked open (or closed) paths with their width and colour. Remaining:
- **Wide areas are skipped, not traced.** A component whose widest point is over 12 px is treated as a filled area and left out, so a drawing with a solid block shows only its lines; run the Line art / Color style as well for the fills. VectorCraft handles both in one pass. A line that touches a wide area is in the same component, so it is skipped with it. The width limit (`maxWidth`) and the other thresholds (`minLength`, `minSpur`, `tolerance`) are options of the module but not in the dialog.
- **No Web Worker.** A dense 2000 × 2000 test drawing took about 1.6 s end to end with no single stage over ~650 ms; the pipeline yields to the event loop between stages (and between thinning passes and every ~50 ms of fitting) instead, so the UI stays responsive. A worker would need an inlined worker in the single bundle the plugin re-bundles; revisit if a huge scan still feels stuck.
- **Even stroke widths** are measured from ink area over run length (so accurate), but the width limit test uses the distance transform, which reads an even width one pixel narrow.
- **Ink is chosen by a global Otsu threshold**: uneven lighting or a coloured ground can merge ink with paper. No adaptive threshold, no choice of ink colour.
- **Zhang-Suen can erase a 2 × 2 blob** (an isolated dot) and rounds the ends of lines by about a pixel; a staircase cleanup runs afterwards. Corners are kept by `fitFreehand`'s own corner finder, tuned for pen strokes at a tolerance of one pixel.
- Each run is its own `<path>`; touching strokes are not merged, and colour is one per run (the middle of the stroke, not the anti-aliased fringe).

## Pencil continue and settings (`pen-continue.js` `extendWith`): follow-ups from T3.7

Done: a pencil stroke that starts on an end of the single selected open path extends it (one `Continue path` step) or closes it; Stabilisation and Fidelity are in Editor Preferences. Remaining:
- **The seam is not tangent-continuous.** The stroke is fitted on its own and its first anchor merged into the path's end, so the old path's last handle and the new first handle can differ. VectorCraft refits with the old end tangent fixed; `fitFreehand` has no start-tangent option yet. A stroke that sets off in the path's direction is visually fine.
- **Only the selected path, plain and untransformed, in the current layer**, same limits as the Pen (see "Pen continue / join"). With the pencil tool armed the selection has to be made first, then the tool picked (the selection survives the switch).
- **The ring** marks the end like the Pen's; there is no distinct cursor.
- **Closing is judged on the stroke's last captured point**, which trails the pointer (stabiliser and spline capture): finish with a short pause, or lower the stabilisation. The closing distance is `max(4 × fidelity, 6 screen px)`.
- **Preferences are plain number fields** (stabilisation %, fidelity in user units), not a popover on the tool; double-click on a tool button means lock mode, so VectorCraft's "double-click opens Tool Options" is not available.
- Stroke continued from a path's start comes back running the way the path ran; a path that gets closed keeps the stroke's direction.

## Smooth tool (ext-smooth-tool): follow-ups from T2.16

Done: the brush smooths the anchors it passes over, live, in one undo step. Remaining:
- **Anchors, not segments, are what the brush reaches**: a long segment the drag crosses between two anchors outside the radius is left alone (already smooth enough to have no anchors there). Sampling along segments would let a brush over a sparse curve pull in its neighbours.
- **The neighbouring unmarked anchors keep their handle directions**, so a fit that has to leave an anchor at a steep angle (a jittery stroke right at the edge of the brush) keeps some wiggle there: the edge of the brush is smoothed less than the middle. Freeing the end tangents would smooth more but break the join.
- **A closed path whose first anchor is smoothed starts at a different anchor afterwards** (it is opened at the first unmarked anchor), which moves the dash pattern's phase.
- **Targets are the selected paths, else the one under the press**: pressing a few pixels beside a thin path with nothing selected does nothing (no nearest-path search).
- **No options UI**: the radius (18 px) and tolerance (2.5 px) are constants. VectorCraft defaults to a 12 pt radius and 2.5 pt fidelity; the radius here is 18 px, a guess for a mouse, so judge it by hand and a tablet may want a smaller one.
- Not in the tablet shell (same reason as the Shaper: the command bar is full at 768 px).

## Ruler guides (`core/guides.js`, ext-ruler-guides): follow-ups from T2.2

Done: guides dragged out of both rulers, moved (Alt copies), deleted by dragging back onto the ruler, Escape cancels, saved as `se:guides` on the root with undo, shown/hidden/locked/cleared by commands, snapped to by drawing tools and by select-mode moves. Remaining:
- **No toolbar buttons or menu entries for show / lock / clear**: they are registry commands only (`guides_toggle_show` mod+;, `guides_toggle_lock`, `guides_clear`), reachable from Command Search, the Hotkey Manager and Favorites. The top bar is full; a place in the grid popover or the main menu's View group is the likely home.
- **A guide's own position snaps to whole units** (or the grid), not to objects or ruler ticks (VectorCraft: Shift snaps to ticks, otherwise grid / smart targets).
- **Guides need the rulers to be created** (rulers are a preference, off by default in some hosts); existing guides still show and snap without them.
- **Mouse only**: touch and pen go through `core/touch.js`'s synthetic mouse events at the canvas, not at the rulers, so the tablet shell cannot make or move guides.
- **Angled guides and guide layers/colours** (Illustrator's) are not planned; one cyan colour for all.
- The guides are saved in the drawing file, so an Obsidian note keeps them; the plugin's rendered image ignores them. Whether a host wants them stripped on export is for the host to decide (`svgCanvas.setGuides({})`).

## Snapping while drawing (`core/draw-snap.js`): follow-ups from T2.1

Done: rect / ellipse / line / frame / image / text corners, pen anchors, shape-family and polystar points snap to anchors, box corners / midpoints / centres, edge lines and the page, with guides. Remaining:
- **No guides while hovering before the press**: the pointer prelude ignores moves with no button down, so a snap is only shown from the press on. Hover snapping needs a per-move target cache that survives mouse-ups (and the cutter/pen rubber band as consumers).
- **Tools that did not opt in** (`snap: true`): curvature (its anchors use `rawX`), shape library placement, cutter, brush, shaper and eyedropper. Curvature and the shape library mix `x` and `rawX` per event; fixing that is the work.
- **Not inside a group context** (the children's boxes are in the group's local space; same limit as object-to-object snapping), and targets are only the top level of each layer: shapes nested in closed groups contribute their group's box.
- **The pen's own earlier anchors are targets** (targets are collected on each press, and the path being drawn is part of the drawing then), so a click near one lands exactly on it. Not checked beyond that; if the in-progress segment ever turns out to snap to itself, exclude the pen's element in `event.js`'s `snapDraw` call.
- No equal-spacing or angle-from-last-point hints while drawing (VectorCraft has neither either); Shift still constrains angle/ratio after snapping.

## Select Same (`core/select-same.js`): follow-ups from T2.10

Done: fill / stroke / fill & stroke / stroke weight / opacity / type, a colour tolerance preference, keyless commands. Remaining:
- **Magic Wand tool** (the plan's optional part: click an object to select similar, Shift adds, Alt subtracts) is not built. It would be a `registerTool` tool calling `selectSameAs('fillstroke', …)`; the criteria, tolerance and commands are in place.
- **Tolerance is a preference, not a control next to the menu**, so changing it means opening Editor Preferences. A small field in the Select & Link cluster (or on the wand's options bar, once `options()` exists) would be quicker.
- Only the **top level of each layer (or the open group)** is scanned; shapes nested inside closed groups are not matched. Gradient and pattern fills only match by identical reference. Weight ignores `vector-effect` and transforms (a scaled shape reports its attribute value).

## Eyedropper Copy style (`styleCopy.js`): follow-ups from T2.9

Done: **Apply style to selection** / **Apply selection's style to this** on the eyedropper menu. Remaining:
- **Pixel sampling** (VectorCraft's Shift-click colour from the rendered canvas) is not done: it needs rasterising the drawing, and CORS-tainted images break it. Only on request.
- **Tapered targets are skipped silently**, since writing `fill`/`stroke` would break the taper; no message tells the user. Copying into a taper means updating `se:taper-style` and `fill` together.
- **Filters other than shadow / outline / glow / feather** (the Blur slider's `{id}_blur`, imported filters) are not copied.
- **Not a registry command**: the actions need a clicked source, so they live on the menu only; there is no keyless palette entry or hotkey for them.

## Glow (`fx-filter.js` / ext-glow): follow-ups from T1.7

Done: outer and inner (edge / centre) glow and feather in the shared composer, on any element incl. text; shadow-only and outline-only filters are byte-identical to before. Remaining:
- **Feather is a hard-radius feather only**: it fades by the shape's own blurred alpha, so very thin shapes (thin strokes, small text) fade almost entirely at large radii. No separate feather shape / gradient control.
- **Glow cannot coexist with the Blur slider** (same limit as shadow / outline: a foreign filter is saved and restored, the blur filter is a separate `{id}_blur`).
- **The shadow is cast by shape + outer glow** (it is fed from the newest merge). Deliberate, matches the plan; a shadow of the bare shape would need the shadow placed before the glow blocks.
- Fixed on the way: the composer built `RemoveElementCommand(existing, existing.parentNode)` (parent passed as `oldNextSibling`), so undoing any shadow / outline edit that replaced or removed the filter threw; it now passes `(existing, existing.nextSibling, existing.parentNode)`.

## Shape-family tools (ext-shape-family): follow-ups from T1.5

Done: Spiral, Arc, Rectangular Grid and Polar Grid drag tools with Shift / Alt / Space / arrow-key modifiers and a click-for-options popover. Remaining:
- **Shapes are plain paths / groups, not re-editable.** VectorCraft keeps no parameters either, but the plan floated `se:shape="spiral(decay=80,segments=10)"` so the popover could regenerate a selected shape; not stored. Changing a count means redrawing (undo, then arrow keys while dragging).
- **No measurement label while drawing** (VectorCraft shows one next to the snapped corner). Snapping itself is done (T2.1).
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
