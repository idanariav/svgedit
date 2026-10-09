# Tier 2 — clear value, more integration work

Read [README.md](README.md) first. VectorCraft paths are relative to
`/Users/idanariav/GitProjects/vectorcraft/`. Each item here has more UI or
data-model surface than Tier 1, so **write a short sub-plan and get the
user's OK on the open questions marked ❓ before coding.**

Suggested order: T2.1 → T2.2 → T2.3 → T2.15 → T2.17 → T2.4 → T2.6 → T2.12 →
T2.16 → T2.9 → T2.10 → T2.7 → T2.8 → T2.11 → T2.5 → T2.13 → T2.14.

---

## T2.1 — Snapping while drawing

### Goal
Points placed by drawing tools snap to other objects' anchors, bbox edges
and centres (with the smart-guide lines shown), not only to the grid. Today
`packages/svgcanvas/core/event-shape-draw.js` only does grid snapping
(`gridSnapping`, ≈ lines 265 and 305) and `snapToAngle`; smart guides apply
to select-mode moves only (`core/smart-guides.js` →
`event-select.js`), and path-node alignment is informational only
(`core/path-node-guides.js`).

### VectorCraft source
`crates/tools/src/guides.rs` (1432 lines) — the `DrawSnap` part: targets
gathered **once per gesture** (per document state), sorted per axis, and each
pointer move looks up the few near the pointer by **bisection**. Point
targets (anchors, centres) beat line targets (edges in line with the art).
Also `crates/geom/src/snap.rs` (`closest`, `snap_to_grid`).

### svgedit integration
- Extend `core/smart-guides.js` with `collectPointTargets(svgCanvas, exclude)`
  (anchors of visible paths/polygons + bbox corners/edge midpoints/centres;
  cap the anchor count, e.g. 20k, and fall back to bbox-only beyond it) and
  `snapPoint(pt, targets, tol)` returning `{ x, y, guides }`.
- Apply in **one place** that all drawing modes pass through — the
  `event.js` mouseDown/mouseMove prelude where `start_x`/`mouse_x` are
  computed — so extension tools (polystar, T1.5 shape family, ext-shaper
  start point, ext-curvature) get snapped coordinates for free. Order: when
  grid snapping is on, grid wins (VectorCraft does the same); otherwise smart
  snap if `smartSnapping` is on.
- Render guides via the existing `#smartGuides` overlay (ext-smart-guides).
- Pen (`path` mode) anchors: snap in `path-actions.js` mouseDown/mouseMove
  for new points.
- Tolerance in **screen** px (divide by zoom).

### Tests
Unit: `snapPoint` picks nearest anchor within tolerance, prefers point over
line targets, no snap outside tolerance, grid wins when both on. e2e: draw a
rect starting 3px off another rect's corner → its x/y equal the corner.

Effort: M.

---

## T2.2 — Ruler guides

### Goal
Drag from a ruler to create a horizontal/vertical guide; drag a guide to move
it (Alt copies); drag it back onto the ruler to delete; guides are snap
targets (T2.1 and select-mode moves); View toggles: show/hide, lock.

### VectorCraft source
`crates/tools/src/rulerguide.rs` (524 lines): `NewGuide`, `GuideEdit`,
`GuideSnap` (Shift snaps to ruler ticks, else whole px / grid / smart
targets).

### svgedit integration
- Rulers: `src/editor/Rulers.js` (canvas-drawn rulers in `#ruler_x`/`#ruler_y`).
  Add pointerdown on the ruler elements → enter a guide-drag gesture.
- Storage ❓ — recommended: a single attribute on the root `<svg>`
  (`se:guides="v:120;h:300.5"`); `se:` attrs bypass sanitize. **Verify** that
  a root-level `se:` attribute survives `setSvgString()` →
  `svgCanvasToString()` (write the round-trip test first). Alternative:
  `<metadata>` child. Inkscape uses `sodipodi:guide` elements — don't adopt
  that namespace.
- Rendering: an overlay group in `svgroot` (not in `svgcontent`, so it isn't
  exported), like `#smartGuides`; redraw on zoom/scroll (`zoomChanged`,
  `canvasUpdated` hooks).
- Undo: guide add/move/delete are `ChangeElementCommand`s on the root's
  `se:guides` attribute.
- Snapping: feed guide positions into `collectSnapTargets` (select moves) and
  T2.1's point targets.

### Tests
Unit: guides attr parse/serialize, snap to guide. e2e: create guide by
dispatching pointer events on `#ruler_x`, reload drawing, guide persists;
export output contains no guide graphics.

Effort: M.

---

## T2.3 — Pen continues and joins open paths

### Goal
With the Pen (`path` mode): clicking an endpoint of an existing open path
continues that path; while drawing, clicking an endpoint of another open
path joins the two into one. VectorCraft shipped this as fix #776
(`crates/tools/src/pen.rs`, commit `bd8fa795`). Read that commit's diff.

### svgedit integration
`packages/svgcanvas/core/path-actions.js` `mouseDown` in `path` mode
(≈ line 388; `#currentPath`, `#newPoint`). Hit-test path endpoints within a
screen-px tolerance (reuse the endpoint helper from T1.4's join, or the
`first/last anchor` logic in `crates/pathops/src/edit.rs` ≈ line 450).
Continuing from the **start** of a path requires reversing it first. The
result is one undo step. Show a distinct cursor over a continuable endpoint
(VectorCraft: "continue" and "join" cursors) — add icons to
`src/editor/images/`.

### Pitfalls
- Paths with `se:taper-d`, `se:orig-d`, `se:fx-d` (live geometry): continuing
  them would desync the source — exclude them, or drop the live attrs first
  with a confirmation.
- Lock mode re-arms `path` after commit — keep that working.

### Tests
e2e (real mouse, see CLAUDE.md coordinate mapping): draw an open path, then
click its last point with the Pen and add two points → one `<path>` with
n+2 anchors. Join two open paths → one element, other removed, one undo.

Effort: M.

---

## T2.4 — Arrowheads with tip-on-end alignment

### Problem today
`src/editor/extensions/ext-markers/ext-markers.js` builds markers with
`viewBox 0 0 100 100`, `refX=50` (≈ line 131): the **centre** of the head
sits on the endpoint, so the line overshoots the drawn end and pokes through
hollow heads. SVG can't clip a stroke under a marker (the `marker-knockout`
properties are draft-only; see README research notes).

### VectorCraft source
`crates/effects/src/stroke/arrow.rs` (407 lines). A head of weight
`hw = strokeWidth × scale` fits a `4·hw` box; each kind has an **inset** (how
far from the tip the stroke must end): halfway into solid heads, in the back
wall of hollow ones, at the chevron's inner corner. Two alignments:
**Tip** (tip on the endpoint, stroke shortened by the inset) and **Extend**
(stroke keeps its length, tip sits inset past the end).

### Plan
1. Re-author marker geometry so `refX` is the **tip** (and record each
   kind's inset in the marker table).
2. "Tip" alignment = trim the drawn geometry by the inset at each end that
   has a head. Recommended implementation: live attribute, same pattern as
   taper — store the untrimmed source (`se:arrow-d` for paths/polylines;
   `se:arrow-pts="x1,y1,x2,y2"` for `<line>`) and regenerate the trimmed
   geometry. Register a geometry remap. Trim by arc length (paper.js
   `Path.splitAt` / `getLocationAt`).
3. ❓ "Extend" alignment needs no trimming (tip past the end) — offer both or
   only Tip?

### Pitfalls
- **ext-connector** rewrites `<line>` `x1/y1/x2/y2` when bound shapes move
  (`ext-connector.js` ≈ lines 514–521). It must write the **source** attrs
  and re-trim, or bound arrows will drift. This is the main risk — read
  ext-connector fully before starting.
- Node editing a trimmed path: reconcile (drop the source) like
  corner-radius, or edit the source — decide and document.
- Stroke width changes alter the inset → regenerate on `elementChanged`.

### Tests
Unit: trim length per marker kind; source regenerated after move/scale;
connector-bound line keeps its head tip on the bound shape's edge after the
shape moves (e2e). Round-trip fixture with tipped arrows.

Effort: M–L.

---

## T2.5 — Dashes fitted to corners and path ends

### Goal
A "fit to corners" dash option: every run between corners and path ends
holds a whole number of dash periods, stretched/squeezed to fit, so a dash
is centred on every corner and on both ends of an open path.

### VectorCraft source
`crates/effects/src/stroke/dash.rs` (332 lines): `dash()` with
`align_corners`; zero-length dashes as dots (`Dot`, `dot_outline`).

### Approach ❓
One `stroke-dasharray` applies to the whole element, so per-run fitting
needs either (a) splitting the path into one sibling path per run inside a
`<g se:dash-fit>` (each with its own dasharray/offset), or (b) baking dashes
to geometry. Recommended: **v1** = single-run fit only (a closed path with
no corners, or an open path without corners): adjust the dasharray so the
total length holds a whole number of periods and set `stroke-dashoffset` to
start mid-dash — no DOM restructuring. **v2** = option (a). Store the user's
nominal pattern in `se:dash-fit` so it can be recomputed on remap/resize.

### Tests
Unit: fitted pattern length × n equals path length; dash centred at ends.

Effort: S (v1), M (v2).

---

## T2.6 — Width profiles + Width tool (generalizes taper)

### Goal
Variable stroke width with width points anywhere along the path (asymmetric
left/right), edited on canvas with a Width tool: hover shows a width
diamond, drag outward to create/edit a point, drag along the path to slide
it, Alt for one side only, Delete removes selected points, double-click
opens a numeric editor. Presets (taper start/end, spindle…) in the existing
taper popover.

### VectorCraft source
- `crates/effects/src/stroke/width.rs` (367): `width_outline` — flatten,
  offset left/right by `width/2·factor(t)` along the normal, outer-side joins
  per stroke join, caps (round cap blends the two side widths), closed
  subpaths become two opposite-orientation loops filled non-zero.
- `crates/tools/src/distort/width.rs` (702): the tool's gestures.
- Profile data: grep `WidthProfile` in `crates/doc/src`.

### svgedit integration
- Generalize `packages/svgcanvas/core/taper-stroke.js`. **Backward
  compatibility is mandatory:** existing drawings carry `se:taper="s,e"`; keep
  reading it (it is a 3-point profile: (0,s), (0.5,1), (1,e) on the existing
  quadratic curve `profile()`), and keep `brush-stroke.js`, which imports
  `profile`, working.
- New attr `se:width-profile="t:l:r;t:l:r;…"` (t ∈ [0,1], l/r = side width
  factors). When present it takes precedence over `se:taper`.
- Outline builder: replace the sample-and-`simplify(0.4)` approach with the
  port of `width_outline` (handles joins at corners and closed subpaths,
  which the current builder rejects). Keep `fill-rule="nonzero"`.
- Width tool: new mode `'width'` in a new extension `ext-width-tool` with an
  overlay of width diamonds; hit-test via paper.js `getNearestLocation` on
  the `se:taper-d` centerline.

### Pitfalls (research)
Offset self-intersection at corners sharper than the stroke and curves
tighter than the half-width → bow-ties. VectorCraft avoids visible artefacts
by joining only on the outer side and filling non-zero; port that rather
than trying to clean the polygon.

### Tests
Unit: legacy `se:taper` drawing renders unchanged (fixture from the current
code); profile with constant 1 equals a normal stroke outline within
tolerance; closed path produces two loops; remap scales widths. e2e: Width
tool drag creates a point.

Effort: L (≈3–4 days).

---

## T2.7 — Free Distort / Perspective Distort (on-canvas)

### Goal
Drag the four corners of a selection's box to distort it — free (bilinear)
or perspective (projective). Applies to paths/shapes (and groups by
distorting each child).

### VectorCraft source
- `crates/effects/src/distort.rs` `free_distort` (bilinear map of the bbox
  onto four corners given in unit-box coordinates, via `map_nonlinear`).
- `crates/geom/src/projective.rs` (186): `Homography` (from four point pairs,
  `apply`, `inverse`) for the perspective mode.
- `crates/tools/src/xform/free.rs` (461): handle interaction.

### svgedit integration
- Register `freeDistort(corners=…)` and `perspective(corners=…)` live effects
  in T1.0 (`corners` = 8 numbers in unit-box coords).
- On-canvas handles: a mode `'distort'` (button in the Design tab Object
  cluster) showing four grips over the selection; drag updates the effect
  params with live preview, mouseup commits one undo step. Don't reuse
  `SelectorManager` grips (they mean resize); draw own overlay like
  `core/image-crop.js` does.
- Perspective of a cubic isn't a cubic → `mapNonlinear` subdivision handles
  it (tolerance via piece size `diag/16`, as the Rust uses).
- Groups ❓: v1 paths/shapes only, or wrap in the effect per child?

### Tests
Unit: identity corners = identity; homography maps the 4 corners exactly;
bilinear and projective agree for affine corner sets.

Effort: M.

---

## T2.8 — On-canvas gradient editor

### Goal
With a gradient-filled (or stroked) element selected, a Gradient tool shows
an annotator: start handle, end handle (length/angle), stop markers on the
bar (drag to move, drag off to delete, click bar to add, double-click to edit
colour), radial: extent ellipse + focal point.

### VectorCraft source
`crates/tools/src/xform/gradient.rs` (928) — interaction model and snapping
(Shift constrains to 45°).

### svgedit integration
- Gradients live in `<defs>` and are referenced as `url(#id)`
  (`core/paint.js`, `core/svg-defs.js`). Edit `x1,y1,x2,y2` (linear) or
  `cx,cy,r,fx,fy` (radial) and `<stop offset>`s via `ChangeElementCommand`
  on the gradient element.
- **Units:** handle both `gradientUnits="objectBoundingBox"` (default —
  coords are fractions of the bbox) and `userSpaceOnUse`, plus
  `gradientTransform`, plus the element's own `transform`. Convert to
  screen space through all of them; convert back on drag.
- **Shared gradients:** if another element references the same gradient,
  clone-on-write (new id, repoint this element) before editing — otherwise
  editing one object recolours others. Also respect `href`-inherited stops
  (a gradient may get its stops from another via `xlink:href`).
- Colour edit opens the existing colour picker (`se-colorpicker` →
  `se-color-dialog`) for the stop.
- Mode `'gradient'` + overlay group in `svgroot`; extension `ext-gradient-tool`.

### Tests
Unit: bbox↔user-space conversion round trip with a rotated element;
clone-on-write when shared. e2e: drag end handle changes `x2`.

Effort: L.

---

## T2.9 — Eyedropper "Copy style" action

### Context — read first
`src/editor/extensions/ext-eyedropper/ext-eyedropper.js` was **deliberately
narrowed** to sample fill only and show an action menu ("does not stamp a
whole style … the way the tool historically did" — see its header comment).
Do not revert that. Instead add actions to the existing menu
(`components/eyedropper/EyedropperActionMenu.js`).

### Goal
New menu actions:
- **"Apply style to selection"** — copies fill, stroke, stroke-width,
  dasharray, linecap/linejoin, opacity, fill/stroke-opacity, filter
  (shadow/outline), markers, and for text font-family/size/weight/style from
  the clicked element onto the current selection (one undo step).
- **"Apply selection's style to this"** (VectorCraft's Alt-click reverse).
- ❓ Pixel sampling (VectorCraft Shift-click) needs rasterizing the canvas;
  CORS-tainted images break it. Skip unless the user wants it.

### VectorCraft source
`crates/tools/src/xform/eyedropper.rs` (behaviour), `appearance.copyFrom` in
`crates/engine/src/cmd/appearance.rs` (what counts as appearance).

### Pitfalls
Gradient/pattern fills (`url(#id)`) — copy the reference, not the defs
entry; filters from ext-shadow/ext-outline are per-element `<filter>`s —
clone them (see "Referenced `<defs>` travel with a copy" in
`architecture.md`). Elements with `se:taper` have their visible colour in
`fill` — read paint from `se:taper-style` instead.

### Tests
Extend `tests/unit/ext-eyedropper.test.js`: style copied, gradient ref
copied, filter cloned with new id, one undo step.

Effort: S–M.

---

## T2.10 — Magic Wand / Select Same with tolerance

### Goal
Extend `selectSameAs` (`packages/svgcanvas/core/selected-elem.js` ≈ line 525;
today fill / stroke / type, exact match) with: **stroke weight**,
**opacity**, **fill & stroke**, and a **colour tolerance** (ΔE in OKLab;
`culori` is already a dependency, `src/editor/palette/oklchColor.js` has
helpers). Optional Magic Wand tool: click an object → select similar, Shift
adds, Alt subtracts.

### VectorCraft source
`crates/engine/src/cmd/select.rs` (`select.same.*` commands, `same_paint`
with tint tolerance), `crates/tools/src/xform/wand.rs`.

### svgedit integration
Add criteria to the `tool_select_same` `se-list` (Design tab "Select & Link"
cluster), keyless `Editor.shortcuts` entries for each, and a tolerance
setting (pref, default 0 = exact). Taper paths: compare their fill as stroke
colour (see T2.9 pitfall).

### Tests
Unit per criterion; tolerance 0 equals current behaviour exactly (regression
guard for existing tests).

Effort: S.

---

## T2.11 — Recolor Artwork + harmony rules

### Goal
A dialog listing every distinct colour used by the selection (fills,
strokes, gradient stops, shadow/outline filter colours) as rows "current →
new"; edit any row, or apply a harmony rule / hue shift to all; options to
preserve white/black/grays; reduce to N colours (cluster in Lab). One undo
step.

### VectorCraft source
- `crates/color/src/recolor.rs` (586): colour identity keys, preserve rules,
  methods mapping a row to its new colour, reduction by clustering in Lab.
- `crates/color/src/harmony.rs` (507): `Harmony` rules (`tones()`, `apply`,
  `theme`), Color Guide variations.

### svgedit integration
- Overlaps existing features — read first: `ext-color-shift` (relative
  H/S/L/T deltas), `src/editor/palette/` (OKLCH palette generator),
  `documentColors` (see `tests/unit/documentColors.test.js`). Reuse the
  colour-collection code if `documentColors` already walks the document.
- New dialog `se-recolor-dialog` (native `<dialog>`, see `SePlainAlertDialog`
  base and `syncDialogTheme()`); entry in Design tab or Main Menu ❓.
- Gradients shared with unselected elements: clone-on-write (see T2.8).

### Tests
Unit: collection finds colours in fills/strokes/stops; mapping applies;
preserve-black/white; reduction to N; one undo step.

Effort: M–L.

---

## T2.12 — Centerline tracing

### Goal
Add a "Line art (centerlines)" mode to **Convert to editable SVG**
(`tool_trace_image`, `src/editor/dialogs/traceImage.js` +
`seTraceDialog.js`): thin strokes of a scanned/photographed drawing become
**stroked open paths** (with their mean width) instead of filled outlines.
imagetracerjs only produces outlines.

### VectorCraft source
`crates/trace/src/centerline.rs` (379) — pipeline (see its header):
1. chamfer 3-4 distance transform;
2. 8-connected components whose max width ≤ stroke width are lines;
3. Zhang–Suen thinning (topology-preserving, keeps 2-px lines) + staircase
   cleanup;
4. skeleton graph: runs between ends/junctions, junction pixels merged,
   short spurs pruned, runs re-joined across 2-way junctions;
5. fit each polyline (`fit::fit_polyline`) — use T1.4's `bezier-fit.js`;
   stroke width = pixel count / length.

### svgedit integration
- Pure module `src/editor/dialogs/traceCenterline.js` taking `ImageData` +
  options; binarize first (Otsu threshold or the dialog's existing
  palette step — reuse whatever imagetracerjs preprocessing is cheap).
- Wider-than-threshold areas: either hand them to imagetracerjs as fills
  (VectorCraft does both in one pass) or ignore in v1 ❓.
- Run in a Web Worker if a 2000×2000 image blocks the UI > 200 ms
  (measure first).
- Same CORS guard as the existing tracer (`traceImage.js` line ≈ 74).

### Tests
Unit with synthetic `ImageData`: a 3-px horizontal bar → one open path of
the bar's length with width ≈ 3; an "X" → 4 runs meeting at one junction
(or 2 joined runs); a ring → one closed path; noise spurs pruned.

Effort: L (≈2–3 days).

---

## T2.13 — Blend tool

### Goal
Select two shapes → create N intermediate steps morphing geometry, fill,
stroke, stroke width and opacity. Re-editable (steps count), keys stay
editable and steps regenerate when a key changes.

### VectorCraft source
- `crates/doc/src/blend.rs` (1158) — matching: subpaths paired in order
  (missing one grows out of a point), **resampled to equal anchor counts**,
  closed ones turned to the same winding and to a start point that avoids
  twisting; paint interpolation (gradients' stops resampled), switch-halfway
  for non-interpolable attributes.
- Blend section of `crates/doc/src/live.rs` (spine handling — skip spines in
  v1).
- `crates/tools/src/meshblend.rs` (tool clicks).

### svgedit integration
- Data model, following ext-repeat's source/copy pattern
  (`src/editor/extensions/ext-repeat/ext-repeat.js`, `se:repeat-source`,
  `se:repeat-copy`): wrap in `<g se:blend="steps=5">`; the two keys keep
  their elements (tagged `se:blend-key`), generated steps tagged
  `se:blend-step` and inserted between them in z-order.
- Regenerate on `elementChanged` for a key; ids may change on paste —
  handle `IDsUpdated`.
- Colour interpolation in OKLab via culori (perceptually even), not sRGB ❓
  (VectorCraft interpolates in the document's colour model).
- Expand: drop the attrs, keep the steps.

### Tests
Unit: anchor-count resampling equalizes; step k geometry at t=k/(n+1)
between keys; colours interpolate; regenerate after key move; expand.

Effort: L.

---

## T2.14 — Art / pattern brushes (art bent along a path)

### Goal
Apply artwork (a shape-library item or a selected group) along a path:
**Art brush** stretches it along the whole length; **Pattern brush** tiles
it. Re-editable; the path stays editable and the art regenerates.

### VectorCraft source
- `crates/brush/src/warp.rs` (352): art `(x, y)` → path point at arc length
  `s(x)` offset by `(y − centre)·cross` along the left normal; flatten +
  subdivide art first (`MAX_SEG = 1.5`, cap `MAX_SUB = 4000`) so straight
  edges bend.
- `crates/brush/src/lib.rs` (`ArtBrush`, `PatternBrush`, `ArtScale`,
  `PatternFit`), `stroke_pieces`.

### svgedit integration
- Art source: reference by id to a `<symbol>`/group in `<defs>`
  (`se:art-brush="#id;mode=stretch|tile;scale=1"` on the path) — keeps the
  file self-contained. Shape library integration: "Use as brush" action in
  `seShapeLibrary.js` inserts the item into defs.
- Generated art: a sibling `<g se:art-brush-out>` (paths inside) with the
  source path hidden (`display:none` but selectable through the group?) ❓ —
  decide how selection works; simplest v1: the group is the selectable
  object, double-click edits the spine path.
- Uses `mapNonlinear` from T1.0's `anchor-path.js` with an arc-length lookup
  table (paper.js `getLocationAt`).

### Tests
Unit: art x-range maps to path length; straight art edge on a curved path
gets subdivided; tile count = floor(length / tile width) with fit option.

Effort: L.

---

## T2.15 — Corner-keeping simplify (pencil commit + Smooth Path)

**Depends on T1.4** (`core/bezier-fit.js`).

### Problem today
`packages/svgcanvas/core/path-simplify.js` uses paper.js `simplify()` both
when a pencil stroke is committed (`simplifyFreehand`, called from
`event-shape-draw.js` ≈ line 429) and in the Smooth Path popover
(`smoothPathD` → flatten + `simplify`). paper's fit has no notion of
corners, so sharp turns get rounded off, and it can return *more* anchors
than it was given. That is why Smooth Path is restricted to pencil paths
(`data-freehand="1"`): on a hand-built path it distorts deliberate geometry.
Also, paper's tolerance is compared as a **squared** distance, so the current
numbers (`DEFAULT_TOLERANCE = 2.5`, strength → 1…25) aren't pixels.

### VectorCraft source
- `crates/pathops/src/edit.rs` `simplify_with` (≈ lines 46–104) with
  `SimplifyOptions { tolerance, corner_angle_deg, straight_lines }`,
  `no_worse` (keep the original subpath if the fit has more anchors), `rdp`
  (≈ line 106), `turn_deg`. Corners are anchors where the path turns by more
  than the threshold; each run between corners is sampled densely
  (`m = clamp(ceil(len / (tol/2)), 4, 256)` per segment) and refit with fixed
  end tangents; fits that are nearly straight become lines (`is_straight`).
- `crates/pathops/src/fit.rs`: `fit_cubics` (≈ line 30), `sample`
  (≈ 193), `start_tangent`/`end_tangent`, `is_straight` (≈ 178).
- Pencil commit: `fit_freehand` in `crates/engine/src/cmd/draw2.rs`
  (≈ line 456): drop samples closer than `0.3 × fidelity`; always end on the
  last sample; mark a point as a corner when the stroke turns by more than
  about 100° there (`dot / (|a||b|) < -0.2`); build a Catmull-Rom spline
  that keeps marked points sharp (`catmull_rom` in
  `crates/tools/src/draw2.rs` ≈ line 39); then `simplify_with(tolerance =
  fidelity, corner_angle_deg = 60)`. Default fidelity 1.5 pt (≈ 2 px).

### svgedit integration
- Put the ported `simplifyWith(d | subpaths, opts)` in
  `core/path-simplify.js` (or a new `core/path-fit.js` if that file grows
  too big), working on T1.0's anchor model if it exists.
- **Pencil:** replace the `path.simplify(tolerance)` call in
  `simplifyFreehand` with the `fit_freehand` port. Keep svgedit's own
  real-time stabiliser (`pencilStabilization`, EMA in
  `event-shape-draw.js`); VectorCraft has nothing equivalent and it helps.
  Config: add `pencilFidelity` (px, default 2) in `ConfigObj.js`; keep
  `pencilSimplify: false` (legacy every-3-points path) working; decide what
  to do with `pencilSimplifyTolerance` (paper units) — map it or deprecate
  it, and say which in `ConfigObj.js`'s JSDoc.
- **Smooth Path popover:** switch `smoothPathD` to `simplifyWith`, remap
  `strengthToTolerance` to real pixels (e.g. 0.25 → 8 px), and add a corner
  threshold (fixed 30–60° in v1, or a "Keep corners" toggle). ❓ Once
  corners survive, should Smooth Path be offered on **all** paths, not only
  pencil ones? Recommended: yes, after checking it on the round-trip corpus
  and a few hand-built paths; otherwise keep the `data-freehand` gate.
- **Other consumer:** puppet warp calls `svgCanvas.simplifyPathD` (the same
  `smoothPathD`) on dense warped polylines. Either keep the paper-based
  version under that name for it, or switch it too and update its tests
  (`tests/unit/ext-puppet-warp-*.test.js`).

### Tests
Update `tests/unit/path-simplify.test.js`: a freehand square (noisy 4-sided
stroke) keeps 4 corners; output never has more anchors than the input; the
largest deviation from the input (sampled) stays within tolerance; a straight
run becomes a single `L`; Smooth Path preview/commit/cancel keep their
one-undo-step and non-compounding behaviour. Add a pencil commit test that
asserts corners survive.

Effort: M (≈1 day after T1.4).

---

## T2.16 — Smooth tool (brush to smooth part of a path)

**Depends on T2.15.**

### Goal
A tool that smooths only the part of a path you drag over: anchors within a
radius of the drag are refit, the rest of the path is untouched. Because it
is local and deliberate it is safe on any path, not just pencil strokes.
Good for tablet use.

### VectorCraft source
`crates/engine/src/cmd/draw2.rs`: `smooth_region` (≈ line 949; `radius`
default 12 pt, `fidelity` default 2.5 pt), `smooth_subpath` (≈ 891;
closed paths are rotated so an untouched anchor comes first, then treated as
open; if every anchor is in range the whole closed path is simplified with a
179° corner threshold), `smooth_open` (≈ 922), `refit_run` (≈ 875). The
gesture is in `crates/tools/src/draw2/gesture.rs` (collect the drag polyline
as an overlay, run the command on release).

### svgedit integration
- Extension `ext-smooth-tool`, mode `'smooth'`, left-panel button (or the
  "Additional tools" overflow bucket by default ❓). Acts on the **selected**
  paths; with nothing selected, on the path under the cursor at press.
- Radius in **screen** px (divide by zoom) so it feels the same at any zoom.
  Show the drag as an overlay polyline in `svgroot`; apply on release as one
  `BatchCommand`. Optional: re-apply on every pointer move against a
  snapshot for live feedback (VectorCraft's Pencil does that; the Smooth
  tool doesn't).
- Skip live-geometry paths (`se:taper-d`, `se:orig-d`, `se:fx-d`) in v1.

### Tests
Unit: anchors outside the radius are unchanged bit-for-bit; anchors inside
are reduced/refit; closed-path rotation logic; whole-path-in-range case. e2e:
drag across part of a zig-zag path reduces its anchor count, one undo step.

Effort: M.

---

## T2.17 — Layers panel: object rows

### Goal
Turn the Layers tab from "one row per layer" into a tree: under each layer,
a row per object and group (groups expandable), so buried or overlapping
objects can be found and selected. Per row: eye (hide), lock, name, and a
selected-state highlight. Drag rows to reorder or move them into other
layers/groups. Plus **Locate Object** (scroll to and reveal the selected
object's row).

### VectorCraft source
`crates/ui-egui/src/panels/layers.rs` (1749 lines; the header comment is
the spec), `crates/engine/src/cmd/layer.rs`, `layerpanel.rs` (`layer.move`,
`layer.locate`, `layer.selectAll`). Port the behaviour, not the egui code.
Defaults worth copying: a document opens with only its top-level layers
expanded; only rows scrolled into view are laid out.

### What svgedit already has (build on it)
- `src/editor/panels/RightPanel.js` `populateLayers()` (≈ line 386) builds
  the layer table (`#layerlist`: eye `td.layervis`, lock `td.layerlock`,
  thumbnail `td.layerpreview`, name).
- **`updateObjectList(elem)`** (≈ line 586) and `#objects_panel` /
  `#objects_list` / `#group_name_input` in `RightPanel.html` (≈ line 340)
  already list the children of the *current group context* with click to
  select, and name groups via `data-name`. Generalize this into the per-layer
  tree rather than adding a second list; reuse `data-name` for object names.
- `getMouseTargetFromNode` / `getIntersectionListMethod` in
  `core/selection.js` (click and rubber-band hit testing),
  `Drawing.refreshLayerPointerEvents()` in `core/draw.js` (which layers are
  selectable).

### Design decisions
- **Hide an object:** set `display="none"`, the same mechanism as layer
  visibility (`Layer#setVisible` in `core/layer.js`), as a
  `ChangeElementCommand` (undoable). Check that hidden objects drop out of
  `getVisibleElements` and hit testing.
- **Lock an object:** a new `se:locked="true"` on the element (same
  attribute name layers use). Locked objects can't be selected on the canvas
  (click or rubber band) — enforce in `selection.js`. ❓ Can a locked object
  still be selected from its panel row? Recommended: no, like Illustrator;
  unlock first.
- **Clicking a row** selects that object (`selectOnly`) and makes its layer
  current (`setCurrentLayer`), as VectorCraft does; Shift-click adds a range,
  Ctrl/Cmd-click toggles. Objects in a group: select the child directly
  (enter the group context the same way double-click does).
- **Dragging rows:** reorder within a parent, or drop into another layer or
  group, as one `BatchCommand` of `MoveElementCommand`s
  (`core/history.js` ≈ line 190). Moving between parents must keep the
  object's on-screen position: compose the ancestors' transforms (see
  `core/group-detach.js`, which does this for paste/duplicate).
- **Sublayers are out of scope:** svgedit treats only the drawing root's
  direct `<g>` children as layers (`identifyLayers`); nested groups appear as
  expandable group rows instead.

### Pitfalls
- **`populateLayers()` calls `clearSelection()`** on every rebuild. The tree
  needs refreshing on `changed`/`selected`/`layersChanged`, so split it:
  keep `populateLayers` for structural changes, and add an incremental
  update (or a rebuild that preserves selection) for everything else.
- **Performance:** a drawing with thousands of elements must not rebuild
  thousands of DOM rows on every change. Render only expanded subtrees,
  throttle refreshes (e.g. `requestAnimationFrame`), and virtualize long
  lists. Measure with a 5,000-element drawing.
- Elements that aren't user objects must not get rows: `<title>`,
  `<defs>`, generated pieces (`se:repeat-copy`, `se:segment-line`,
  `se:blend-step` from T2.13) — show them under their source, or not at all.
- The tablet shell (`panels/TabletShell.js`) has its own layers UI; decide
  whether it gets the tree too (❓, probably later).

### Tests
Extend `tests/e2e/layers-panel.spec.js` (real DOM): rows appear for objects
and groups, click selects, eye hides (and undo restores), lock blocks canvas
selection, drag moves an object to another layer keeping its screen
position, Locate Object expands and scrolls to the row, selection survives a
panel refresh. Unit tests for the hit-test lock check and the move command.

### Docs
`tools.md` (Layers Panel section), `attributes.md` (`se:locked` on
elements, `data-name`), `architecture.md` (RightPanel description).

Effort: L (≈3–4 days).
