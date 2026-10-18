# Drawing and path tools: follow-ups

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).

## Measure tool (`core/measure.js`, `ext-measure`): follow-ups from T3.2

Done: `tool_measure` (mode `measure`, `registerTool`, button after the Eyedropper, no shortcut): drag to read distance, angle (counter-clockwise, as on paper), Δx and Δy in the editor's base unit; the end points snap like the drawing tools' (`snap: true`); Shift constrains to 45° steps; the readout (cyan line, end dots, label box) stays until the next press, Escape or leaving the tool (and is redrawn at the new zoom, via the extension `zoomChanged` hook); the drawing is never changed and nothing is recorded. Remaining:
- **The start point only snaps with `snap: true`'s targets** (the hover ring shows before the press, as in "Snapping while drawing"); no measuring of an object's own size on click, no persistent rulers or multiple measurements.
- **The unit comes from Editor Options `baseUnit`;** there is no unit switch on the tool, and areas / perimeters are not measured.
- In the tablet shell's More tools flyout; no keyboard shortcut.

## Distort tool (`core/distort.js`, `ext-distort-tool`): follow-ups from T2.7

Done: `freeDistort` (bilinear) and `perspective` (projective, Heckbert's square-to-quad) live effects on eight unit-box corner params; the Distort tool (`tool_distort`, mode `distort`): four grips on the selected shape's source box, drag one (Shift = one axis) for one undo step, Free / Perspective on the options bar (converts a distorted selection), a press on another shape selects it. The effect stacks with the others (the corners edit the first distort entry; the unit box is the source box, whatever comes before it). Remaining:
- **Shapes only, no groups.** A group (or text, image, compound selection) is skipped; the plan's alternative was an effect per child. Distorting several selected shapes with one set of corners (their common box) is not offered either.
- **Perspective is the free-corner homography.** VectorCraft's "Perspective" *mode* is a drag constraint (the corner and its partner move symmetrically) on top of the bilinear effect; here each corner is free and the map is truly projective, so a quad that stops being convex is refused while dragging (the last valid corner stays) and falls back to bilinear if it arrives from the panel's numbers.
- **No snapping** to other objects or guides (`snap: true` on the tool def needs the corner to follow the pointer by an offset, not jump to it; with grid snapping on, the grid is used). No measurement label.
- **A corner jumps to the pointer** by up to the grab radius (10 px) on the first move; the grab offset is not kept.
- **Reset** is the ✕ on the effect's row in the Effects panel; there is no double-click-a-grip or Enter-to-reset gesture.
- **In the tablet shell's More tools flyout** (touch only: the Shift constraint is not available there).
- A pathological stack (a distort entry before another effect that changes the anchor count a lot) can hit `MAX_FX_ANCHORS`; the drag then stops updating, it does not corrupt the shape.

## Gradient tool (`core/gradient-edit.js`, `ext-gradient-tool`): follow-ups from T2.8

Done: `tool_gradient` (mode `gradient`): an annotator on the selected shape's linear or radial gradient — start handle (moves the whole gradient), end handle (length and angle, Shift = 45° steps; a radial's radius), stop chips (move, drag off to delete, Alt-drag to copy, double-click for the colour dialog, Delete, click the bar to add), a radial's extent and focal dot; Fill / Stroke on the options bar. `objectBoundingBox` and `userSpaceOnUse` units, `gradientTransform`, the element's and its groups' transforms and `href`-inherited stops are honoured; only the geometry attributes and stops are written. A gradient another element (or gradient) uses is copied first, so editing one shape never recolours another. Remaining:
- **Creation is on plain shapes with a box.** A press-and-drag on a shape whose chosen paint (Fill / Stroke) is a plain colour or none gives it a gradient (`createGradient`; written through the model, one undo step): linear along the drag, or, with *New: Radial* on the options bar, radial centred on the press with the drag as its radius in box units (so an elongated shape gets an elliptical one, as the tool's own radius handle does); a click the default left-to-right (radial: centred, radius ½). The kind is per session, not remembered. None for a pattern paint, a group, or a shape with no width or height (a horizontal line: `objectBoundingBox` units need a box). The stops are the shape's colour then white (black when the colour is light, white to black for no paint), not VectorCraft's fixed White-Black default.
- **A radial gradient has no rotate / aspect handles.** VectorCraft's aspect and rotate zones need `gradientTransform` rewritten; here the ellipse is whatever the units and transform make it (a bounding-box radial on a non-square shape is already an ellipse). The end handle sets `r` from its distance to the centre, so with a rotated `gradientTransform` the handle can slide off the pointer.
- **A linear gradient's bar sits where its attributes put it.** The default `x1=0 y1=0 x2=1 y2=0` is the shape's top edge (the gradient is constant along y, so it looks the same mid-shape); drag the start handle to move it.
- **The editor normalises user-space gradients on load** (`convertGradients` turns a `userSpaceOnUse` gradient referenced by a `fill` / `stroke` attribute into box units and drops its `gradientTransform`), so they rarely reach the tool. It handles them anyway (unit-tested, and e2e by switching the units after load).
- **No midpoint diamonds** (SVG has no midpoints), no spread-method UI, no stop-opacity beyond what the colour dialog's alpha sets; a stop dragged past a neighbour swaps places in the DOM (SVG would clamp it).
- **No snapping** (to anchors, boxes, guides or the grid) (the tool has its static cursor); the handle follows the pointer with the grab offset kept.
- **Single element, plain shapes and text only** (path, rect, ellipse, circle, line, polyline, polygon, text). A group, or several selected shapes with one shared gradient, is not edited; shapes in a taper / width stack keep their gradient on the generated outline and are treated like any path.
- **In the tablet shell's More tools flyout.**
- A freshly double-clicked stop opens the *modal* colour dialog (Apply / Cancel); the popover mode used by the swatches needs an anchor element, which a canvas chip does not have.

## Curvature tool (`ext-curvature`): checked against VectorCraft, nothing to port

VectorCraft replaced its Catmull-Rom Curvature spline with a circle-through-three-points rule (Oct 2026). Ours is a Spiro (G2)
solve with Catmull-Rom only as the failure fallback, and for three points Spiro already draws that same circle, so the J / U
overshoot that motivated the change is not ours. One real difference is left, and it is a taste call: upstream shortens the
handles of a smooth point whose turn is tighter than 30° (`TIGHT_TURN`) so a narrow V comes to a point, where Spiro rounds it
through the full circle. Revisit only if narrow V's look wrong in use.

## Shaper (ext-shaper): follow-ups from T1.6

Done: line / rectangle / ellipse / regular polygon recognition, scribble-to-delete, one undo step per stroke (`core/shape-recognize.js`, `ext-shaper`). Remaining:
- **In the tablet shell's More tools flyout** (`TabletShell.ts` `MORE_TOOLS`).
- **Shaper Groups** (VectorCraft's live compound results that re-recognise when a stroke is added) are deliberately skipped; results are plain shapes.
- **Polygons are plain `<polygon>`s**, not polystar polygons. Making them editable with the polystar sides field means teaching `ext-polystar` to keep an orientation instead of rebuilding from angle 0.
- **Returns to Select after a created shape**, like every drawing tool (Alt at release or tool lock keeps it). A Shaper-specific "stay in the tool" preference would suit sketching several shapes in a row.
- **Scribble hit-testing is sample-based** (`strokeTouches`): spacing is ≥ 0.5 document units and at most 2,000 samples, so a hairline crossed by a very long scribble at very low zoom can be missed. Text and images are tested by their bounding box.
- No options bar (waits for the `options()` tool hook).

## Pencil and Smooth Path fit (`core/path-fit.js`): follow-ups from T2.15

Done: the pencil commit and Smooth Path run on the corner-keeping fit (no paper.js left in `path-simplify.js`); Smooth Path is offered on any plain path. Remaining:
- **Corners are turns of more than about 84°** (`CORNER_COS = 0.1`; it was 100°, which rounded a right-angle elbow to `pencilFidelity`). The window that measures the turn (`CORNER_REACH`, 6 tolerances) is why a smooth curve tighter than about 6 units of radius reads as a corner; both are tuning, not structure. The 84° threshold is judged on synthetic strokes only (right angles, a radius-60 quarter circle, a radius-12 circle): try it on real pen strokes and raise it if gentle hand-drawn bends start growing corners.
- **The editor's own stabiliser** (`pencilStabilization`, an EMA) and B-spline capture round a corner before the fit sees it; the fit recovers the vertex from the two legs, but a tight hairpin loses a little more than a gentle turn. Lowering the stabilisation keeps corners truer.
- **`pencilFidelity` is in screen pixels** (the fit gets `fidelity / zoom`; the same as user units at 100%), so a stroke fits the same way at any zoom. The preferences field says so ("px").
- **Closed pencil strokes:** a stroke whose last point lands within 2 × fidelity of its first, and that encloses some area (not an out-and-back line), is committed as a closed path (`fitFreehand(pts, tol, { closeLoops: true })`; the seam is smooth unless it turns more than a corner). Only the plain pencil commit asks for it: continuing a path (`continueFreehand`) and centerline tracing still get open results, so a traced ring is two ends, not a closed path. Fill stays `none`. The stabiliser's lag applies (the last captured point trails the pointer), so end the loop with a short pause on the start.
- `simplifyWith` has no "straight lines only" mode (VectorCraft's Convert to Straight Lines); add it with the first caller.

## Pen continue / join (`core/pen-continue.js`): follow-ups from T2.3

Done: pressing an open path's end with the Pen carries it on (the same element, one undo step); pressing another open path's end while drawing joins them. Remaining:
- **A ring and a cursor mark the end.** The `pen_end_hint` ring in the selector layer shows the end; the cursor (`path_continue`, or `path_join` while drawing) says whether a press carries on or joins.
- **Only single-subpath open paths that are children of the current layer** are offered (of the current layer or the entered group; no `se:taper-d` / `se:orig-d` / `se:fx-d`, which would desync from their source). A path with its own `transform` is offered where it appears: `findPenEnd` hands back the end and the anchors mapped through that transform, the gesture works in the layer's space, and `localD` maps the result back through the inverse when it is written (the transform stays on the element). Hover and the ring use the container's matrix (an entered group's, else the layer's). A path in a group that is *not* entered draws a new path instead: offering it would mean mapping through every group above it and writing into another parent.
- **Path ends behind other shapes still win**: the nearest end within 6 screen px is used, whatever is on top of it. Alt starts a new path instead; there is no option to turn the behaviour off.
- A press on the carried-on path's *other* end closes it (the pen's existing close-on-first-point rule); its other old points do nothing, unlike a brand-new drawing where the second point also closes.
- The throwaway drawing is still the pen's half-opacity temp element; the original is hidden (`display="none"`) while it stands in, and restored by `clear()` if the tool changes mid-gesture.

## Centerline tracing (`dialogs/traceCenterline.ts`): follow-ups from T2.12

Done: **Line art (centerlines)** in Convert to editable SVG traces thin strokes as stroked open (or closed) paths with their width and colour. Remaining:
- **Wide areas are skipped, not traced.** A component whose widest point is over 12 px is treated as a filled area and left out, so a drawing with a solid block shows only its lines; run the Line art / Color style as well for the fills. VectorCraft handles both in one pass. A line that touches a wide area is in the same component, so it is skipped with it. The width limit (`maxWidth`) and the other thresholds (`minLength`, `minSpur`, `tolerance`) are options of the module but not in the dialog.
- **No Web Worker.** A dense 2000 × 2000 test drawing took about 1.6 s end to end with no single stage over ~650 ms; the pipeline yields to the event loop between stages (and between thinning passes and every ~50 ms of fitting) instead, so the UI stays responsive. A worker would need an inlined worker in the single bundle the plugin re-bundles; revisit if a huge scan still feels stuck.
- **Even stroke widths** are measured from ink area over run length (so accurate), but the width limit test uses the distance transform, which reads an even width one pixel narrow.
- **Ink is chosen by a global Otsu threshold**: uneven lighting or a coloured ground can merge ink with paper. No adaptive threshold, no choice of ink colour.
- **Zhang-Suen can erase a 2 × 2 blob** (an isolated dot) and rounds the ends of lines by about a pixel; a staircase cleanup runs afterwards. Corners are kept by `fitFreehand`'s own corner finder, tuned for pen strokes at a tolerance of one pixel.
- Each run is its own `<path>`; touching strokes are not merged, and colour is one per run (the middle of the stroke, not the anti-aliased fringe).

## Pencil continue and settings (`pen-continue.js` `extendWith`): follow-ups from T3.7

Done: a pencil stroke that starts on an end of the single selected open path extends it (one `Continue path` step) or closes it; Stabilisation and Fidelity are in Editor Preferences. Remaining:
- **The seam is tangent-continuous when the stroke sets off roughly the way the path arrives** (within the corner angle): `fitFreehand` takes `startDirection` (`endDirection(end)` in `pen-continue.js`) and the first handle lies on the old leg. A stroke that sets off at more than about 100° to it keeps a corner. Only the new stroke's handle moves; the old path's last handle is left as it was.
- **Only the selected path, a child of the current layer or entered group** (a `transform` of its own is fine, as for the Pen), same limits as the Pen (see "Pen continue / join"). With the pencil tool armed the selection has to be made first, then the tool picked (the selection survives the switch).
- **The ring** marks the end like the Pen's, and the cursor turns into `fhpath_continue`.
- **Closing is judged on the stroke's last captured point**, which trails the pointer (stabiliser and spline capture): finish with a short pause, or lower the stabilisation. The closing distance is `max(4 × fidelity, 6 screen px)`.
- **Preferences are plain number fields** (stabilisation %, fidelity in user units), not a popover on the tool; double-click on a tool button means lock mode, so VectorCraft's "double-click opens Tool Options" is not available.
- Stroke continued from a path's start comes back running the way the path ran; a path that gets closed keeps the stroke's direction.

## Smooth tool (ext-smooth-tool): follow-ups from T2.16

Done: the brush smooths the anchors it passes over, live, in one undo step. Remaining:
- **Anchors, not segments, are what the brush reaches**: a long segment the drag crosses between two anchors outside the radius is left alone (already smooth enough to have no anchors there). Sampling along segments would let a brush over a sparse curve pull in its neighbours.
- **The neighbouring unmarked anchors keep their handle directions**, so a fit that has to leave an anchor at a steep angle (a jittery stroke right at the edge of the brush) keeps some wiggle there: the edge of the brush is smoothed less than the middle. Freeing the end tangents would smooth more but break the join.
- **A closed path whose first anchor is smoothed starts at a different anchor afterwards** (it is opened at the first unmarked anchor), which moves the dash pattern's phase.
- **Targets are the selected paths, else the one under the press**: pressing a few pixels beside a thin path with nothing selected does nothing (no nearest-path search).
- **Radius and Tolerance are on the options bar** (screen px, stored as the `smooth_radius` / `smooth_tolerance` preferences; defaults 18 and 2.5). VectorCraft defaults to a 12 pt radius and 2.5 pt fidelity; 18 px is a guess for a mouse, so judge it by hand and a tablet may want a smaller one.
- In the tablet shell's More tools flyout; the options strip draws Radius and Tolerance there too.

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
- **Hover shows the snap before the press** (`svgCanvas.drawSnap.hoverDrawSnap`, called from the mouse-move branch with no button
  down, for the built-in drawing modes and any tool with `snap: true`): the same ring / guide lines, its own target cache
  (rebuilt when the mode or the undo history changes), cleared on leaving the canvas or the snapping modes. A change that
  is not an undo step (a layer shown / hidden, a live preview) leaves the cache stale until the next one. Not on touch
  (no hover). A `wantsHover` tool with `snap: true` gets the snapped point in its own hover too (`toolHover`); none
  combines the two yet (Measure is `snap` only); the cutter / pen rubber band are the candidates.
- **Tools that did not opt in** (`snap: true`): brush, shaper and eyedropper (free-hand or sampling tools, where a snapped point has no meaning). Curvature, the cutter and shape library placement opted in once they used `x` / `y` throughout; the target collection skips `data-se-ephemeral` nodes, so a tool's own preview is never a target (curvature's earlier anchors are not targets either, its own hit-test handles closing).
- **Not inside a group context** (the children's boxes are in the group's local space; same limit as object-to-object snapping), and targets are only the top level of each layer: shapes nested in closed groups contribute their group's box.
- **The pen's own earlier anchors are targets** (targets are collected on each press, and the path being drawn is part of the drawing then), so a click near one lands exactly on it. Not checked beyond that; if the in-progress segment ever turns out to snap to itself, exclude the pen's element in `event.js`'s `snapDraw` call.
- No equal-spacing or angle-from-last-point hints while drawing (VectorCraft has neither either); Shift still constrains angle/ratio after snapping.

## Shape-family tools (ext-shape-family): follow-ups from T1.5

Done: Spiral, Arc, Rectangular Grid and Polar Grid drag tools with Shift / Alt / Space / arrow-key modifiers and a click-for-options popover. Remaining:
- **Shapes are plain paths / groups, not re-editable.** VectorCraft keeps no parameters either, but the plan floated `se:shape="spiral(decay=80,segments=10)"` so the popover could regenerate a selected shape; not stored. Changing a count means redrawing (undo, then arrow keys while dragging).
- **No measurement label while drawing** (VectorCraft shows one next to the snapped corner). Snapping itself is done (T2.1).
- **In the tablet shell's Shapes flyout** (`TabletShell.ts` `SHAPES`, shown when `ext-shape-family` is loaded).
- **No keyboard shortcuts** (their cursors are the static arrow-plus-glyph ones).
- **Alt held at release keeps the tool** — core `mouseUpEvent` skips `setMode('select')` when `evt.altKey` is set for every shape tool; with Alt now meaning "from the centre" for arc/grids, releasing the mouse before Alt leaves the tool active (the shape is still selected). Pre-existing core rule, only more visible here.
