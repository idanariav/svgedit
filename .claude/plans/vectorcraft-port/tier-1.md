# Tier 1 — high value, mostly self-contained math

Read [README.md](README.md) first (rules, porting conventions, type mapping).
VectorCraft paths below are relative to `/Users/idanariav/GitProjects/vectorcraft/`.
svgedit paths are relative to this repo.

Order: **T1.0 → T1.1 → T1.2**, then T1.3–T1.7 in any order (they are
independent of each other and of T1.0). T1.7 (Glow) is the cheapest item in
this tier and a good first task.

---

## T1.0 — Live-effect foundation (`se:fx` stack)

### Goal
One shared, re-editable "live effect" mechanism for path-geometry effects, so
T1.1 (seven effects), T1.2 (warp) and T2.7 (free distort) each become a pure
function plus a dialog entry, instead of seven more copies of the
taper/corner-radius plumbing.

### What to build
New core module `packages/svgcanvas/core/live-effects.js` (init it from
`packages/svgcanvas/svgcanvas.js` with `runGuardedInit(this, 'liveEffects', …)`
next to `taperStrokeInit`), plus a small anchor model
`packages/svgcanvas/core/anchor-path.js`.

**`anchor-path.js`** — pure, DOM-free:
- `parseAnchors(d) → [{ closed, anchors: [{ p, hIn, hOut }] }]` (absolute
  coords; line segments get `hIn/hOut` equal to the anchor; quadratic and
  arc segments converted to cubics — normalize with `svgpath` (already a
  dependency: `.abs().unarc().unshort()`), then elevate each remaining `Q`
  to a cubic yourself (`c1 = p0 + 2/3·(q − p0)`, `c2 = p3 + 2/3·(q − p3)`);
  `svgpath` has no quadratic→cubic conversion).
- `anchorsToD(subpaths) → string` (emit `L` when both facing handles are
  retracted, else `C`; closed subpaths emit the explicit closing segment
  **and** `Z` — see techdebt.md "Closed subpaths must carry an explicit
  closing lineto").
- `segCubic(sp, i)` (a straight segment returns handles at 1/3 and 2/3 — the
  port of `seg_cubic` in `crates/effects/src/util.rs`), `evalCubic`,
  `splitCubic(c, t0, t1)`, `normalAt(c, t)`.
- `mapNonlinear(subpaths, maxPiece, f)` — port of `map_nonlinear` in
  `crates/doc/src/live.rs` (≈ line 401). Splits each segment into
  `clamp(ceil(polyLen/maxPiece), 1, 64)` pieces and maps every control
  point. This is the workhorse for Twist, Warp and Free Distort.
- `catmullRom(pts, closed, tension)` and `seededNoise(seed, a, b, c) ∈ [-1,1]`
  (32-bit hash; see README type mapping).

**`live-effects.js`**:
- Attributes: `se:fx` (the effect stack) and `se:fx-d` (source geometry,
  absolute, normalized with `toAbsolutePathData` from `paper-utils.js`).
- `se:fx` format: `name(key=val,key=val);name(…)` — applied left to right.
  Write a parser + serializer with round-trip tests; reject unknown effect
  names and non-finite numbers (keep the param's default instead, as
  VectorCraft's `num()` does).
- Registry: `registerLiveEffect(name, { apply(subpaths, bbox, params) → subpaths, defaults, label })`.
  T1.1/T1.2 register into it.
- `canApplyLiveEffect(elem)`: `path`, `rect`, `ellipse`, `circle`, `line`,
  `polyline`, `polygon`, **and** star/polygon from ext-polystar (they're
  `<polygon>`s). Not `text`, `image`, `use`, `g` in v1 (text would need glyph
  outlining, which the browser can't give us without a font parser).
  Non-path shapes are swapped for an equivalent `<path>` in the same
  `BatchCommand` (reuse `convertToPath` in `core/path-utils.js`; see how
  `applyTaperStroke` swaps line/polyline).
- `applyLiveEffects(stack)` / `removeLiveEffects()` / `getLiveEffects()` on
  `svgCanvas`, each one undo step (`BatchCommand` + `ChangeElementCommand`,
  same shape as `applyTaperStroke`). Bounding box for effects = bbox of the
  **source** subpaths (compute from anchors + handles, or `getBBox()` of a
  temp path), not of the current `d`.
- `registerGeometryRemap('se:fx-d', remapFxSource)`: transform the stored
  source with the baked affine, then regenerate `d` (mirror
  `remapTaperSource`). Size-relative params (`relative=true`) need no
  rescaling; absolute ones (`size` in px) do **not** rescale either —
  document that choice.
- "Expand" (`expandLiveEffects()`): drop `se:fx`/`se:fx-d`, keep `d`.

**Interaction rules (v1):**
- Mutually exclusive with `se:taper-d` and `se:orig-d` (corner radius):
  `canApplyLiveEffect` returns false when either is present, and
  `canTaperStroke`/`canRoundCorners` must return false when `se:fx-d` is
  present. Add a techdebt entry for stacking them later.
- Node editing an fx path (pathedit) makes the source stale → follow the
  corner-radius `reconcile()` rule: on `selectedChanged`, if `d` ≠
  regenerate(`se:fx-d`, `se:fx`), drop both attributes.

**UI:** new extension `src/editor/extensions/ext-live-effects/` (add to
`defaultExtensions` in `ConfigObj.js`). Injects a section **"Effects ›
Distort"** into the right panel's Effects tab (`#tab_effects`, same injection
style as ext-shadow), showing the current stack as rows (name, ✎ edit,
✕ remove) and an "Add effect" `se-list`. Editing opens a popover/dialog with
the effect's params and **live preview** (preview without an undo step,
commit on Apply, revert on Cancel — copy the session-baseline pattern of
`previewSmoothPath`/`commitSmoothPath`/`cancelSmoothPath` in
`core/path-simplify.js` and `<se-smooth-path-settings>`). Add an "Expand"
button. Locale strings via the extension's `locale/en.js`.

### Tests
- `tests/unit/anchor-path.test.js`: parse→emit round trip for M/L/C/Q/A/Z,
  closed subpath keeps explicit closing segment, `mapNonlinear` with identity
  `f` returns geometry equal within 1e-9, with an affine `f` equals the
  affine transform.
- `tests/unit/live-effects.test.js`: `se:fx` parse/serialize round trip,
  invalid input ignored, apply/remove/expand as single undo steps (undo
  restores exact prior attrs), remap keeps source in sync after a move and a
  scale (mirror `tests/unit/coords.test.js` style), mutual exclusion with
  taper/corner-radius, reconcile drops stale attrs.
- Round-trip fixture `tests/e2e/fixtures/roundtrip/live-effects.svg` with a
  two-effect stack.

### Docs
`architecture.md` (core module table + directory tree), `file-map.md`,
`extensions.md` (new extension), `attributes.md` (`se:fx`, `se:fx-d`),
`tools.md` (Effects tab section).

### Acceptance
- Applying any registered effect to a rect produces a `<path>` with
  `se:fx`/`se:fx-d`; undo restores the rect exactly.
- Moving/scaling the element and then editing a param keeps the shape where
  it was (no "teleport").
- Save → reload → edit param works.

Effort: M (≈1–1.5 days).

---

## T1.1 — Distort & Transform effects

### Goal
Register these effects into T1.0: **Roughen, Zig Zag, Pucker & Bloat, Twist,
Tweak, Round Corners, Scribble**. (Transform-with-copies from `distort.rs`
overlaps ext-repeat — skip it.)

### VectorCraft source
- `crates/effects/src/distort.rs` (232 lines): `roughen`, `zig_zag`,
  `pucker_bloat`, `twist`, `tweak`. Read the whole file — it's short.
- `crates/effects/src/stylize.rs`: `round_corners`, `scribble`.
- Helpers in `crates/effects/src/util.rs`: `num`, `flag`, `smooth_points`,
  `noise`, `seed`, `mean_size`, `seg_cubic`, `catmull_rom`, `normal_at`.
- Effect dialogs' parameter names/defaults: grep `"roughen"`, `"zigZag"`
  etc. in `crates/engine/src/cmd/effectcmd.rs` and `crates/effects/src/lib.rs`.

### Params and defaults (from the Rust)
| Effect | Params |
|---|---|
| roughen | `size=5`, `relative=true` (size is % of mean bbox side), `detail=10` (points per inch → use 96 px/in), `points=smooth|corner`, `seed=0` |
| zigZag | `size=10`, `relative=false`, `ridges=4` (extra points per segment), `points=smooth|corner` |
| puckerBloat | `amount` ∈ [-200, 200] (%) — negative puckers |
| twist | `angle` (degrees, clamped ±3600) |
| tweak | `h=10`, `v=10`, `relative=true`, `anchors=true`, `in=true`, `out=true`, `seed` |
| roundCorners | `radius` |
| scribble | `angle=30`, `overlap=0`, `strokeWidth=3`, `curviness=5`, `spacing=5`, `variation=0.5`, `seed` |

### Porting notes / pitfalls
- **Seed:** default `seed=0` makes every roughened object identical in
  jitter pattern. When the user *adds* Roughen/Tweak/Scribble from the UI,
  store a random seed in params so each object differs, and expose a
  "Randomize" button. Re-editing keeps the stored seed (deterministic).
- **Point budget:** Roughen clamps to 2000 points per segment; also cap the
  total points per element (e.g. 20k) to keep the DOM responsive.
- **Pucker & Bloat** first gives straight segments 1/3-handles, then moves
  anchors toward the centre and handles away — port faithfully, the order
  matters.
- **Scribble** returns a *filled outline* of the hatch line (kurbo
  `stroke()`). In svgedit: generate the zig-zag centerline, then either
  (a) render it as a stroked path (`fill=none`, `stroke=<original fill>`,
  `stroke-width=strokeWidth`) — simplest, recommended for v1 — or
  (b) outline it with `core/path-offset.js` `strokeToPath`. With (a) the
  effect must also record and swap paint (store the original
  `fill`/`stroke`/`stroke-width` in `se:fx-style`, like `se:taper-style`).
  Scanline intersections assume a closed fill area — disable Scribble for
  open paths.
- **Round Corners** (effect) is distinct from Live Corners (T1.3): it rounds
  every handle-less corner with a fixed-radius cubic approximation. Keep it;
  it works on any path.
- **Twist** uses `diag(bbox)/2` as the falloff radius and picks a piece size
  that shrinks with angle — keep that formula, otherwise large twists look
  faceted.

### UI
Entries in the T1.0 "Add effect" list; one param form per effect (spin
inputs, `points` as a two-way toggle, Randomize for seeded effects).

### Tests
`tests/unit/live-effects-distort.test.js`, one `describe` per effect:
determinism for a fixed seed; output subpath count/closedness equals input;
Zig Zag on a 100×0 line with `ridges=4` produces 5 points per segment +
end, alternating ±size off the line; Pucker/Bloat with `amount=0` is identity;
Twist with `angle=0` is identity; Twist preserves points farther than the
falloff radius; Round Corners on a square produces 8 anchors and leaves
already-curved anchors alone; Scribble refuses open paths.

### Docs
`tools.md` (Effects tab), `attributes.md` (`se:fx-style` if used).

### Acceptance
Each effect previews live while editing params, commits as one undo step,
and survives save/reload with identical geometry.

Effort: M (≈1 day after T1.0).

---

## T1.2 — Warp (15 styles)

### Goal
Register a `warp` effect into T1.0 with styles **Arc, Arc Lower, Arc Upper,
Arch, Bulge, Shell Lower, Shell Upper, Flag, Wave, Fish, Rise, Fisheye,
Inflate, Squeeze, Twist**, plus `bend`, horizontal/vertical distortion and
horizontal/vertical orientation.

### VectorCraft source
- `crates/doc/src/live.rs`: `enum WarpStyle` (≈ line 278), `warp_point`
  (the per-style map on normalized coordinates in [-1, 1]², y down),
  `map_nonlinear`.
- `crates/effects/src/warp.rs` (34 lines): normalization into the bbox,
  orientation swap, piece size `diag/24`.

### Params
`style` (id strings exactly as `WarpStyle::from_id`: `arc`, `arcLower`,
`arcUpper`, `arch`, `bulge`, `shellLower`, `shellUpper`, `flag`, `wave`,
`fish`, `rise`, `fisheye`, `inflate`, `squeeze`, `twist`), `bend=50`
(−100…100 %), `horizontal=0`, `vertical=0` (−100…100 %),
`orientation=horizontal|vertical`.

### Porting notes / pitfalls
- `warp_point` is ~60 lines of closed-form math; port it verbatim into
  `packages/svgcanvas/core/warp.js` as a pure function and unit-test each
  style at the box centre and corners.
- **Arc** bends the centre line into a circular arc of equal length; at
  `|bend| < 1e-6` it must return the identity (division by `sweep`).
- Degenerate bboxes (a horizontal line has height 0) — the Rust uses
  `max(1e-9)`; a warp on a zero-height line still bends it via `x`, so keep
  that behaviour but guard NaN.
- Warp on **text** is out of scope (see T1.0). Show a hint in the UI
  ("Convert text to path first") rather than silently doing nothing.

### UI
Style picker with small preview icons (draw 15 new stroke icons, or use a
labelled `se-select` in v1), `bend` slider, two distortion sliders,
orientation toggle.

### Tests
`tests/unit/warp.test.js`: every style maps the centre (0,0) where the Rust
formula says; `bend=0` with no distortion is identity for every style (Arc
special-cases `|b| < 1e-6`; check each formula reduces to `(x, y)`); orientation swap equals warping
the transposed shape; output is finite for degenerate bboxes.

### Acceptance
A 200×80 rect warped with Arc 50% visibly arcs, re-editable, round-trips.

Effort: S–M (≈0.5 day after T1.0).

---

## T1.3 — Live Corners upgrade (per-corner radius and kind)

### Goal
Upgrade `ext-corner-radius` from "one radius, straight-only paths" to:
- a **radius per corner**, with **three kinds**: round, inverted round,
  chamfer;
- works on **any** path's corners where two straight sides meet (the path
  may contain curves elsewhere — today svgedit refuses the whole path if any
  segment is curved);
- also applies to `<rect>` (convert to path on first use) and polystar
  polygons.

### VectorCraft source
- `crates/geom/src/corners.rs` (283 lines incl. tests) — **port all of it.**
  `Corner::of` (which anchors qualify), `setback`, `max_radius`, `fitted`,
  `cut` (round / inverted round / chamfer cubic construction with
  `arc_handle`), `path_corners`, `cut_corners` (index bookkeeping incl. a
  closed subpath whose first corner is cut).
- `crates/geom/src/shapes.rs`: `CornerKind`, `rectangle_with_corners`,
  `max_corner_radius`, `fitted_corner_radius`.
- On-canvas widgets (optional phase 2): `crates/tools/src/corners.rs`
  (`radius_change` turns a drag along the bisector into a radius delta;
  Alt-click cycles kind).

### svgedit today
`packages/svgcanvas/core/corner-radius.js` (`se:orig-d`, `se:corner-radius`,
`parseStraightSubpaths`, `roundedPathD`, `canRoundCorners`,
`applyCornerRadius`, `remapCornerSource`) and
`src/editor/extensions/ext-corner-radius/ext-corner-radius.js` (single
`corner_radius_value` spin input, `reconcile()`).

### Data model (backward compatible)
- Keep `se:orig-d` (source) and `se:corner-radius`.
- `se:corner-radius` today is one number. Extend the grammar: a single
  number still means "all corners, round"; a list
  `r[:kind],r[:kind],…` indexed by `Corner.index` (anchor index across
  subpaths) sets per-corner values, kind ∈ `r|i|c` (default `r`).
- **Source must now allow curves**, so `se:orig-d` can no longer be
  restricted to `M/L/Z`. Parse it with `anchor-path.js` from T1.0 if T1.0 has
  landed; otherwise add a minimal anchor parser in `corner-radius.js` and
  migrate later (note it in techdebt).
- Existing saved drawings (single number, straight-only source) must render
  byte-identically after the upgrade — add a unit test with a fixture `d`
  produced by the current code. **Caveat:** the old fillet construction
  (`t = min(r/tan(θ/2), len/2)` with re-derived arc radius) and
  VectorCraft's (`fitted` radius capped at half the shorter side) agree for
  rectangles but may differ slightly at acute angles. If they differ,
  either keep the legacy function for the single-number format or accept
  the change and regenerate on load — decide, then record it in
  techdebt.md. Do not silently change saved geometry.

### UI
- Corners panel: keep the radius spin input (applies to all corners or to
  the selected corners) and add a kind selector (three icon buttons).
- Phase 2 (can be a follow-up): when a single path is selected and
  pathedit is active, selected anchors limit which corners the panel edits
  (`path.selected_pts`). On-canvas corner widgets are optional.

### Tests
Port the four Rust tests in `corners.rs` (star has 10 corners cut as
circles; radii stop at half the shorter side; ends/curves/smooth anchors are
not corners; kinds share end points and the inverted arc stays on the
circle). Add: legacy single-number drawing renders unchanged; remap after
scale keeps per-corner radii proportional; a rect becomes a path with
`se:orig-d` on first use.

### Docs
`tools.md` (Corners row), `attributes.md` (new `se:corner-radius` grammar).

Effort: M (≈1 day; +0.5–1 day for on-canvas widgets).

---

## T1.4 — Path edits: remove-anchor refit, Average, Join, Add Anchor Points

### Goal
1. **Delete node keeps the shape**: today `buildReconnectedPathData` in
   `packages/svgcanvas/core/path-actions.js` (≈ line 238) drops the node and
   keeps the neighbour's own command verbatim, so curves change shape (the
   doc comment admits it). Port VectorCraft's refit: the neighbours keep
   their handle *directions* and their facing handle lengths are refitted so
   one cubic follows the two old segments.
2. **Average** selected nodes (horizontal / vertical / both).
3. **Join**: two selected open paths → one (merge endpoints closer than a
   tolerance, else connect with a straight segment); one open path → close it.
4. **Add Anchor Points**: a new anchor at t=0.5 of every segment.

### VectorCraft source
- `crates/pathops/src/edit.rs`: `remove_anchor` (≈ line 234) with
  `golden_min`, `sample`, `start_tangent`, `end_tangent`; `average`
  (≈ 322); `join` (≈ 346); `add_anchor_points` (≈ 299).
- `crates/pathops/src/fit.rs` (232 lines): `fit_single_from` (least-squares
  cubic with fixed end tangents for given parameters `u`). This is the piece
  remove-anchor needs.

### Shared fit module
Create `packages/svgcanvas/core/bezier-fit.js` — port `fit.rs` (Schneider:
fit with fixed tangents, Newton reparameterisation, split at worst point).
Before porting, check whether npm `fit-curve` exposes what we need
(`fitCubic(points, leftTangent, rightTangent, error)` exists; remove-anchor
also needs a fit **for given parameters u** — if `fit-curve` doesn't expose
`generateBezier(points, params, tL, tR)`, port). T2.12 (centerline tracing)
reuses this module.

### svgedit integration
- Path model: `packages/svgcanvas/core/path.js` / `path-method.js` (`Path`,
  `segs`, `selected_pts`, `storeD()`, `endChanges(label)`), actions in
  `path-actions.js` (`deletePathNode`, `canDeleteNodes`).
- Replace the body of `buildReconnectedPathData` with: build anchors per
  subpath (T1.0's `anchor-path.js` if present), call the ported
  `removeAnchor` for each deleted index (highest index first so indices stay
  valid), emit `d`. Keep its contract: returns `''` when nothing renderable
  remains; closed stays closed; open stays open.
- Average/Add Anchors: new `pathActions.averageSelectedNodes(axis)` and
  `pathActions.addAnchorPoints()` (whole path), each `path.endChanges(...)`.
  Buttons in the top bar's `.path_node_panel` (`TopPanel.html`), plus
  keyless `Editor.shortcuts` entries so they show in Hotkey Manager /
  Command Search (see how `bool_union` entries are done in `tools.md`).
- Join: canvas-level `svgCanvas.joinSelectedPaths()` (select mode, 1–2 open
  paths selected; non-path shapes ineligible). Button in the Design tab
  "Path" cluster, shown only when eligible. Result keeps the **first**
  path's style and id; one `BatchCommand` (remove second path + change
  first).

### Pitfalls
- Deleting several adjacent nodes: refit sequentially (each removal sees the
  already-refitted neighbours) — that is what VectorCraft does via repeated
  `remove_anchor`.
- `golden_min` runs 40 iterations of a 33-point fit — fine per node, but
  don't call it in a mousemove.
- Two straight segments must become one straight segment (no handles).
- Keep `ensureExplicitClosingSegments()` (path-method.js) semantics: emitted
  closed subpaths carry the explicit closing lineto.

### Tests
- `tests/unit/path-actions.test.js` / new `path-refit.test.js`: deleting the
  midpoint of a quarter-circle that was split in two gives back a single
  cubic within 0.5px of the original arc (sample 20 points); deleting a
  corner between two lines gives one line; closed/open preserved; deleting
  all but one point drops the element (existing behaviour).
- Average: three nodes → same y (horizontal), same x, same point.
- Join: endpoints within tolerance merge into one anchor; else a connecting
  `L`; single open path closes; closed inputs pass through.
- Update any existing test that asserted the old "keep neighbour command
  verbatim" behaviour, and update the doc comment + `tools.md`
  "Delete-node semantics" paragraph.

Effort: M (≈1–1.5 days).

---

## T1.5 — Shape tools: Spiral, Arc, Rectangular Grid, Polar Grid

### Goal
Four new drag tools in the left panel's shapes flyout (`tools_shapes`), with
VectorCraft's modifiers: **Shift** = equal axes, **Alt** = from centre (arc,
grids), **Space held** moves the shape being drawn, **↑/↓** change spiral
segments / grid rows / concentric dividers, **←/→** change grid columns /
radial dividers while dragging. A click without a drag opens an options
popover (size + counts).

### VectorCraft source
- `crates/geom/src/shapes.rs`: `spiral` (≈ line 144), `arc` (≈ 128),
  `rectangular_grid` (≈ 168), `polar_grid` (≈ 186).
- `crates/tools/src/draw2/family.rs` (296 lines): the drag state machine and
  key handling.

### Porting notes / pitfalls
- **Arc bug upstream:** `arc()` computes `k = KAPPA * (1 + slope * 0.0)`, so
  its `slope` parameter is ignored. Implement slope properly (slope ∈ [-1,1]
  scales the handle toward/away from the corner → concave/convex) instead of
  copying the no-op; note the divergence in the module header.
- Spiral is built outward then reversed so it starts at the centre end —
  keep that, it matters for node editing and taper direction.
- Grids are **several** paths. Insert them as a `<g>` (one undo step) so the
  grid moves as one; frame rect optional.

### svgedit integration
- Follow `ext-polystar` exactly (`src/editor/extensions/ext-polystar/ext-polystar.js`):
  buttons appended into `$id('tools_shapes')`, `setMode('spiral'|…)`,
  `mouseDown`/`mouseMove`/`mouseUp` hooks returning `{ started: true }` /
  `{ keep, element }`. New extension `ext-shape-family` (add to
  `defaultExtensions`).
- Arrow keys / Space during the drag: use the `keyDown` extension hook
  (`core/extension-hooks.js`), return `{ preventDefault: true }` only while
  a drag of these modes is in progress. Space-to-move: on keydown record the
  pointer offset, on mousemove translate the shape's anchor point instead of
  resizing; release resumes resizing.
- Lock mode (double-click tool) must work like other shape tools — check
  `LeftPanel.lockTool` and the `event.js` `mouseUpEvent` reset gating.
- Store params as `se:shape="spiral(decay=80,segments=10)"` etc. so a later
  options popover can regenerate (optional v1; at minimum emit clean paths).

### Tests
Unit: generators (spiral anchor count = segments+1, starts at centre end;
polar grid has `concentric` ellipses + `radial` lines; rect grid line counts;
arc slope 0 equals a quarter ellipse within tolerance). Extension: mode
switch, keyDown changes counts mid-drag, click-without-drag opens the
popover. e2e: draw each via the canvas API (CLAUDE.md "Creating / selecting
elements programmatically") and assert DOM output.

### Docs
`tools.md` (shapes flyout row + extension section), `extensions.md`, new
icons registered in `src/editor/images/`.

Effort: M (≈1 day).

---

## T1.6 — Shaper tool (rough stroke → clean shape)

### Goal
A freehand tool: draw a rough rectangle/ellipse/triangle/polygon/line and it
becomes a clean, editable native shape; a zig-zag scribble over objects
deletes them. Strong fit for pen/tablet users (the tablet shell).

### VectorCraft source
- `crates/geom/src/recognize.rs` (601 lines incl. tests) — `recognize(pts)
  → Recognized::{Line, Rectangle{rect, rotation}, Ellipse{rect, rotation},
  Polygon{center, radius, sides, rotation}, Scribble(rect)}`. Port the whole
  file including its tests. Key ideas: resample to 256 points by distance
  (removes speed bias), Douglas–Peucker with an explicit stack (no recursion
  on noisy strokes), corner count independent of the start point,
  edge/angle fit, bbox fill ratio, 45° rotation steps for rects/ellipses,
  90° for hexagons, triangles point up or down, squares/circles snap within
  10%, scribble = several direction reversals.
- `crates/engine/src/cmd/shaper.rs` (771) — how a result becomes objects;
  **skip "Shaper Groups"** (live compound results) in v1.

### svgedit integration
- New extension `ext-shaper` with mode `'shaper'`. Capture points like the
  pencil (`event-shape-draw.js` `fhpath` cases use an EMA stabiliser and a
  polyline). Simplest: own `mouseDown/Move/Up` hooks drawing a temporary
  preview polyline in the overlay, then on mouseUp call the ported
  `recognize()`.
- Output mapping: Rectangle → `<rect>` with `transform="rotate(...)"` when
  rotation ≠ 0; Ellipse → `<ellipse>` (+rotate); Polygon → `<polygon>`
  (emit points; if ext-polystar's attribute format allows, emit a polystar
  so its panel can edit sides); Line → `<line>` (so ext-connector binding
  still works). Use `svgCanvas.addSVGElementsFromJson` with `curStyles: true`.
- Scribble: delete elements whose bbox intersects the scribble's rect **and**
  that the stroke actually crosses (use `getIntersectionList`-style check or
  per-element bbox+path hit test). One `BatchCommand` for all removals.
- Unrecognised stroke: discard (VectorCraft does nothing) — show nothing,
  don't create a freehand path.
- Pitfall from research: thin rectangles lose corners with speed-based
  detection — the distance resampling in the port already avoids that; keep
  the Rust tests that cover uneven rectangles and mid-edge starts.

### Tests
Port the Rust tests verbatim as vitest (they use synthetic point lists).
Add extension tests: mode, output element types, scribble deletes only the
crossed elements, one undo step each.

### Docs
`tools.md` (left panel + extension section), `extensions.md`, icon.

Effort: M (≈1–1.5 days).

---

## T1.7 — Outer Glow, Inner Glow (and Feather)

### Goal
Soft glow effects in the Effects tab, coexisting with the existing drop
shadow and outline/halo:
- **Outer Glow:** a blurred, coloured copy of the shape's silhouette painted
  *under* it. Settings: blur (0 = off), colour, opacity.
- **Inner Glow:** a blurred colour painted *inside* the shape, either from
  the **edge** inward or from the **centre** outward, clipped to the shape.
  Settings: blur (0 = off), colour, opacity, source (edge | centre).
- **Feather** (optional second phase): softens the object's own edges
  inward over a radius.

They work on every element type with a filter, **including text**, so neon
headings are possible. svgedit has nothing comparable today; ext-outline's
halo is a hard-edged `feMorphology` dilate.

### VectorCraft source
- `crates/svg/src/export.rs` `open_filters` (≈ lines 1488–1590). It writes
  each effect as a small standard filter; port these chains:
  - Outer glow: `feGaussianBlur(in=SourceAlpha, σ) → feFlood(color, opacity)
    → feComposite(in2=glow, operator=in) → feMerge[paint, SourceGraphic]`.
  - Inner glow, edge: `feComponentTransfer(in=SourceAlpha,
    feFuncA type=table tableValues="1 0")` (inverted alpha) `→
    feGaussianBlur(σ)`; centre: `feGaussianBlur(in=SourceAlpha, σ)`. Then
    `feFlood → feComposite(in2=glow, in) → feComposite(in2=SourceAlpha, in)
    → feMerge[SourceGraphic, paint]` (on top of the shape).
  - Feather: `feGaussianBlur(in=SourceAlpha, σ) → feComposite(SourceGraphic
    in soft) → feComposite(in SourceAlpha)`.
- `crates/effects/src/raster.rs`: parameter defaults (blur 5, opacity 75%,
  outer glow yellow, inner glow white) and reach: **σ = blur / 2**, and the
  effect extends **1.5 × blur** past the shape (`RasterFx::outset`).
- VectorCraft defaults glows to the *screen* blend mode, but an SVG filter
  can't blend with what's behind the element, so its own SVG export
  composites normally. Do the same; don't try to emulate screen.

### svgedit integration
- **Composer:** extend `src/editor/extensions/fx-filter.js`
  (`createFxComposer` → `readEffects`, `buildFilter`, `writeEffects`,
  `setRegion`). The spec gains
  `glow: { outer: {blur,color,opacity} | null, inner: {blur,color,opacity,source} | null }`
  (and `feather: {radius} | null` in phase 2).
- **Chain order** when several effects are active: outline block (→
  `fx_outlined`), outer glow computed from the outlined alpha and merged
  *under* it, inner glow merged *over* the base shape, then the existing
  `feDropShadow` last (so it keeps `in` = the merged result). The shadow is
  then cast by the object plus its glow, which is acceptable; document it.
- **Backward compatibility (must keep):** a shadow-only or outline-only
  filter must stay byte-identical to what the composer emits today (its
  module header promises this, and existing drawings depend on it). Only add
  `color-interpolation-filters="sRGB"` to the `<filter>` when a glow or
  feather is present (it changes blur falloff, so don't add it to existing
  filters).
- **Recognising effects on read (pitfall):** `readEffects` finds the
  outline with `filter.querySelector('feFlood')`, i.e. the *first* flood in
  the filter. With a glow present that may be the glow's flood. Give every
  glow primitive a distinct `result` (`fx_oglow_*`, `fx_iglow_*`;
  `result` is already allowed by the sanitizer on these primitives) and make
  every lookup select by `result` (the outline's flood is `result="fx_flood"`),
  never by first-of-type. Add a test with outline + outer glow + inner glow
  that reads all three back.
- **Blur slider pitfall:** `SvgCanvas#getBlur` (`packages/svgcanvas/svgcanvas.js`
  ≈ line 1460) falls back to *any* `feGaussianBlur` in the referenced filter,
  so a glow's blur would show up as the element's Blur value, and
  `core/blur-event.js` would then edit the composer's filter. Make the
  fallback ignore composer-owned filters (ids ending in `_fx` or the legacy
  `_shadow`) or blur primitives whose `result` starts with `fx_`. Test:
  `getBlur(glowOnlyElem) === 0`. Note the existing limitation (from
  `tools.md` "Filter coexistence"): composer effects still can't coexist
  with Blur; don't try to fix that here.
- **Region:** in `setRegion`, pad by
  `max(outlinePad, shadowPad, 1.5 × outerGlow.blur)` (inner glow and feather
  need no extra room).
- **sanitize.js:** every primitive and attribute used is already allowed
  (`feComponentTransfer`, `feFuncA` `type`/`tableValues`, `feFlood`,
  `feComposite`, `feGaussianBlur`, `feMerge`/`feMergeNode`, filter
  `color-interpolation-filters`). Verify with a round-trip test.
- **UI:** new extension `ext-glow` (add to `defaultExtensions` in
  `ConfigObj.js`), injecting `#glow_panel` into `#tab_effects` after
  `#outline_panel`, copying ext-outline's structure
  (`src/editor/extensions/ext-outline/ext-outline.js`): an *Outer glow* row
  (Blur, Opacity, Color swatch) and an *Inner glow* row (Blur, Opacity,
  Color, Edge/Centre toggle), plus Remove. Same on/off convention as the
  others: **blur 0 = no glow**. Shown for any single selected element.
  Refresh the filter region on move like ext-shadow does (`mouseUp`,
  `elementChanged`, `selectedChanged`).
- **Style presets:** expose `svgEditor.glowApi = { read(elem), apply(elem, params, batchCmd) }`
  and add a glow row to `<se-class-select>`'s capture checklist
  (`src/editor/components/seClassSelect.js`, see how `shadowApi` and
  `outlineApi` are used ≈ lines 402–526).
- Locale strings in `ext-glow/locale/en.js`.

### Tests
- Extend the composer tests (find them with `grep -rl createFxComposer tests/`):
  glow-only filter structure; outline + outer glow + inner glow round-trip
  through `readEffects`; shadow-only and outline-only output unchanged
  (byte-for-byte snapshot taken before the change); removing all effects
  restores a pre-existing foreign filter; region padding.
- `getBlur` returns 0 for a glow-only element.
- Extension test for `ext-glow` (panel visibility, blur 0 removes, one undo
  step per change).
- Round-trip fixture `tests/e2e/fixtures/roundtrip/glow.svg` (a text and a
  path with outer + inner glow, one also with a shadow).

### Docs
`tools.md` (Effects tab table, new ext-glow section, update "Filter
coexistence"), `extensions.md` (ext-glow, `glowApi`), `file-map.md`.

### Acceptance
Outer and inner glow show on a path and on text, can be combined with shadow
and outline on the same element, each is editable independently after
save/reload, and the Blur slider shows 0 for a glow-only element.

Effort: S–M (≈1 day; +0.5 day for Feather).
