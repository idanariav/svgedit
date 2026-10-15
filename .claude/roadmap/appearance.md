# Appearance features (effects, corners, brushes, blend, width, dashes, colour): follow-ups

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).

## Recolor Artwork (`core/recolor.js`, `ext-recolor`, `se-recolor-dialog`): follow-ups from T2.11

Done: `tool_recolor` (Edit group, Effects tab button) opens a dialog of rows "current → new" for the selection's solid
colours (fills, strokes, `style`, gradient stops, filter flood colours), with the five row methods, 21 harmony rules,
reduce to N (Lab k-means), a hue turn and keep white / black / grays; live preview in an undo transaction, one undo step on
OK, clone-on-write for gradients and filters something unselected also uses.

- **RGB only.** VectorCraft's colour models (CMYK, Gray, Lab keys), *Limit to Library* (snap to a swatch set with CIEDE2000)
  and the randomizers (shuffle, random saturation / brightness) are not ported; Library needs a swatch store first.
- **Per-row method and the Color Guide variation grid** (`harmony.rs` `Guide`, `variation`, `move_on_wheel`, the
  five-colour themes) are not ported: one method for all rows, no wheel.
- **Only plain opaque colours are collected:** `#hex`, `rgb()` and the 20 basic names. `rgba()` with alpha, `hsl()`, other
  named colours and `currentColor` are left as they are (the editor writes hex). An element with **no fill attribute**
  (SVG's implicit black) is not counted, so "recolor black" misses it.
- **Not reached:** `<use>` / symbol content, patterns, markers, masks and clip paths, art / pattern brush tiles, and the
  `se:` live-effect parameters that hold colours (the shadow / outline / glow filters are covered through their flood colours).
- **Selection only.** With nothing selected the command is disabled; VectorCraft recolors the whole document then.
- **The preview costs a snapshot per edit** (`beginTransaction` diffs O(elements)); fine to a few thousand elements, a very
  large selection will lag on the hue slider (debounce it if it shows).
- **Overlap with Color Shift** (relative H/S/L/T deltas per element) is left as is: Color Shift is a live slider on the
  selection, Recolor is a palette-level edit; merging them would need Recolor to remember a snapshot.
- Modal dialog (the canvas cannot be panned while it is open) and not in the tablet shell; the native colour input is driven by
  synthetic events in the e2e tests, so the OS picker itself is untested.

## Live effects (`se:fx`): follow-ups from T1.0 / T1.1

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
- **Per-corner UI is the Corners tool** (`ext-corner-tool`, `tool_corners`): widgets, drag to round, Alt-click to cycle the kind, click / Shift-click to pick corners, Radius and Kind on the options bar. The Design-tab panel still edits every corner. Not ported from VectorCraft's `corners.rs`:
  - **Widgets inside the Selection and Direct Selection tools.** VectorCraft shows them there; here the tool is a mode of its own (the select mode is the legacy `event.js` path), so you switch to it. "Selected anchors in pathedit limit the corners the panel edits" is not done either: pathedit still shows the *cut* anchors and drops the attrs when `d` is edited, so editing the source in pathedit needs its own design.
  - **Double-click for a Corners dialog**, the "Hide Corner Widget for angles greater than" preference and the red outline of corners at their largest radius while dragging.
  - **Only the element's own transform** maps the widgets (as in the Width and Distort tools); a shape inside a transformed group that was entered misplaces them.
  - **A drag sets one radius for every targeted corner** (the dragged corner's), as VectorCraft does; corners that had different radii are levelled. Per-corner radii come from picking corners first.
  - **In the tablet shell's More tools flyout**, with Radius / Kind / *Pick several* in the options strip: the Kind choice does what Alt-click does (set a kind, where Alt-click cycles it) and *Pick several* is Shift for good; Shift and Alt still work with a keyboard.
  - **Corner widgets are circles for every kind**; the kind is read off the options bar or the shape.
- **Corner cuts are SVG arcs.** Exact, but anything that only understands M/L/C (boolean ops, Round Corners effect on an already-cut path) goes through `parseAnchors`' arc→cubic conversion. Not a problem today because `se:orig-d` and `se:fx-d` are exclusive.
- **Rect `rx`/`ry` are dropped** when a rect is first cut (the panel shows `rx` as the starting radius, but a rect with different `rx`/`ry` loses the elliptical rounding).
- Stacks with a width stroke (not with live effects); see "The live stack".

## Art and pattern brushes (`core/art-brush.js`, `core/art-brush-canvas.js`, `ext-art-brush`): follow-ups from T2.14

Done: art brush (one copy of the art stretched along the path: stretch / proportional, width %, direction, flips) and pattern brush (the side tile repeated along each straight run: stretch / add space / approximate, size, spacing, flips); a brush library in the drawing's `<defs>`; a brushed path is a group (hidden spine, hidden artwork copy, generated art) that renders anywhere; Apply / options / Expand / Release are undo steps; the art follows the spine when it is edited (and when that is undone); the `ext-art-brush` Design-tab section and the `brush_*` commands. Remaining:
- **VectorCraft's pattern corner / start / end tiles** are not ported (the geometry already splits the path into runs at corners; the library holds one artwork per brush). Also not ported: *between guides* art scaling, scatter and calligraphic / bristle brushes (the Brush tool `ext-brush` stays the nib brush), and **colorization** (tints / hue shift to the stroke colour): the art keeps its own colours.
- **Brushes are copied, not linked.** Choosing a brush copies its artwork into the path's group; changing or deleting the library entry does not touch paths already brushed (they keep a working copy, so copy / paste and other documents work). An "update strokes from this brush" action would need the group to remember which brush it came from.
- **Art is bent as a polyline**, thinned to the corners it needs (0.01 units): long strokes still carry many points. Fitting cubics (`bezier-fit.js`) would shrink them and keep them smooth at high zoom.
- **Editing the path** is through the invisible spine: the Edit path button (or entering the group and selecting the spine) opens the node editor; the generated art is rewritten on every change of the spine. That rewrite is not an undo step of its own: undo of the spine edit regenerates (or restores the earlier paths if this session made them). A drawing opened and then edited with no selection first has no record of its art and rewrites it once, textually different (same shape).
- **Select inside the group** and the generated paths can be edited or deleted by hand; the next regeneration overwrites them, and a group that lost its spine / art simply stops being a brush (`getArtBrushGroup` returns null).
- **Stroke width of the original path is not used**: the art is as big as it was drawn (× width %); a brushed path's own stroke paint is kept on the hidden spine only. One brush per path; no brush on top of live effects, corners or a width stroke.
- **Only plain shapes** (path, line, polyline, polygon, rect, ellipse, circle) are artwork or spines; text, images and groups' non-shape members are skipped.

## Blend (`core/blend.js`, `core/blend-canvas.js`, `ext-blend`): follow-ups from T2.13

Done: blends of two or more key shapes (path, line, polyline, polygon, rect, ellipse, circle) as a group of keys and generated steps (`se:blend`, `se:blend-key`, `se:blend-steps`); anchor-by-anchor path matching (subpaths paired in order, a missing one grows out of a point, equal anchor counts by splitting the longest segments, same winding, the start anchor that twists least); fill and stroke in OKLab, opacities / stroke width / miter limit / dashes as numbers, caps / joins / fill rule switching halfway; spacing by step count, by distance or "smooth colour"; the Blend tool (click a shape, then another or a blend), Make / Expand / Release commands, the Design-tab section; the steps follow a key when it changes (and when that is undone); a **spine** (`se:blend-spine`, path data in the group's coordinates): Replace spine (a blend and a path selected together: the keys move onto the path, evenly spread by arc length, the steps are centred on their points of it, `distance` spacing counts along it, the path is used up), Reverse spine, Detach spine (the path comes back, the blend goes straight), Align to path (checkbox / `blend_align_path`), the spine pinned to the keys (`se:blend-pins`), commands `blend_replace_spine` / `_reverse_spine` / `_detach_spine`, `blend-spine.svg` (a spine from before pins), `blend-align.svg` and `blend-pinned.svg` in the round-trip corpus. It is the first tool with an options bar (`options()/setOption()` on the tool, `panels/toolOptionsBar.js`). Remaining:
- **Align to Path** (`se:blend-align`) is a rotation of the keys, not an evaluated copy: the first key is the reference and keeps its orientation (VectorCraft turns every shape to the spine's direction, so there the first key would turn too), the others get a `matrix(…)` transform about their box centre, undone when the option is switched off. A key turned by hand while aligned is turned back by the same amount on un-align (the delta is relative), but moving a key off the spine and aligning again re-centres it where it stood, not on the spine. A turned key is a rect/ellipse with a single `matrix(…)` transform (never `recalculateDimensions`: it zeroes the size of a rect given a rotation matrix), so later edits of it treat it as any rotated shape. Not done: a choice of reference (first key / perpendicular to the path), a per-blend angle offset.
- **The spine is pinned to the keys, one way** (`se:blend-pins`, an anchor index per key): a moved or resized key drags its anchor (handles with it) to its centre, and the steps ride the reshaped spine, but the spine's other anchors cannot be edited (no node editor on it: Detach spine, edit the path, Replace spine again, which re-spreads the keys evenly). The held spine is re-derived on every refresh and is not recorded in history, like the steps (an undo of the key move puts it back; moves under 0.05 are ignored so a loaded drawing is not rewritten). Not pinned: a **closed** spine, a spine with no pins (drawn before pins), pins that no longer fit the keys (a key was added: `makeBlend` drops them): those spread the keys evenly. With **Align to path** on, a dragged key keeps the turn it had (the spine's direction at its anchor changes, so the steps near it are slightly off until Align is toggled off and on).
- **Only the first subpath of the spine path is used**, a closed one as an open run from its start back to it, and Replace spine always puts the keys *evenly* along it (afterwards a key can be dragged anywhere; no numeric choice of where each sits).
- **Keys are shapes only.** Groups (children paired in stacking order), text, images and compound paths are not keys; gradients and patterns switch halfway instead of resampling stops; a solid colour against `none` switches halfway rather than fading.
- **No start-anchor choice.** VectorCraft's tool lets a click on an anchor choose where an open path starts (`starts`); here closed shapes pick the start that twists least and open paths run first-to-first.
- **No live drag preview.** Steps are rewritten when a key's edit ends (mouse-up), not while it moves. Dragging a key inside the group (enter it, select the key) is the way to edit one; there is no key picker on the blend itself.
- **Steps are generated content.** Anything added to or edited inside a `se:blend-steps` group is overwritten by the next regeneration; a group that lost a part (or whose parts no longer alternate key / steps / key) simply stops being a blend. The command sweep does not target generated paths for that reason.
- **The step count is capped at 200 per pair** (every step is a DOM element, and each transaction snapshots the drawing).
- **The options bar shows the selected blend's values, else the defaults new blends start with;** defaults live in memory (a reload resets them).
- **Tool hooks.** The Blend tool, the Magic Wand and the Smooth tool have `options()` so far.

## The live stack (`core/live-stack.js`): follow-ups from item 15

Done: corners → effects → width as one chain with a root source and mirrored later sources; corners + width and effects + width on one element, every change one undo step, the transform bake, stale detection (`d` edited outside drops the whole stack), the `se-stack` invariant, a round-trip fixture (`live-stack.svg`). Remaining:
- **Corners + effects stay exclusive** (the Round Corners effect covers the use, and cut corners are SVG arcs that effects would first convert). The model takes it as one more entry in `ALLOWED`; the work is the arc → cubic hand-off and a per-corner UI that edits the root.
- **Scribble + width stay exclusive** (Scribble paints its own stroke, which collides with the width stage's paint). A stroke-output effect would need to hand its width and paint to the width stage.
- **Arrowhead alignment + width/effects stays exclusive**: markers sit on the vertices of the element's `d`, so a filled outline would carry them on its outline. Real support means drawing the heads as separate elements.
- **The width stage is last**: width cannot sit under effects ("roughen the outline"); that is Illustrator's Expand-then-effect, which Expand already gives.
- **Mirrors cost size**: a three-stage element carries `orig-d`, `fx-d`, `taper-d` and `d`.
- **Node editing a stacked element** edits `d` (the outline), so the stack is dropped on the next selection, as for each feature alone. Editing the root in pathedit needs its own design.
- **Stale detection is tolerance based**: the saver's rounding adds up along a long path, so the tolerance grows with `sqrt(anchors)` (0.1 + 0.01·√n). A very small outside edit to a dense stacked path can go unnoticed and be regenerated over.
- **Preview** of an effect over a width stroke runs the whole chain on the clone on every param tick (a dense outline makes that heavier).

## Width profiles and the Width tool (`core/width-profile.js`, `core/width-outline.js`, `ext-width-tool`): follow-ups from T2.6

Done: `se:width-profile="t:l:r;…"` (width factors per side along the path) on a tapered-stroke element; the outline is the `width_outline` port (corner joins by the stroke's `stroke-linejoin`/`-miterlimit`, caps by `stroke-linecap`, closed paths as two loops, steps); the Width tool (`tool_width`, mode `width`): hover diamond, drag outward adds a point (both sides, Alt = the side being dragged), drag a diamond slides it, drag a side handle widens it, click selects, Delete removes (one undo step each); six presets in the taper popover (`applyWidthProfile`). A legacy `se:taper` drawing renders exactly as before; a profile wins over it and keeps `se:taper` as its two end widths so dash-fit, style copy and the taper popover still see a taper. Remaining:
- **Not in v1 from VectorCraft's tool:** the numeric editor for a point (double-click), selecting and dragging several points, Alt-dragging a diamond to copy a point, dropping a point on another to make a step (a discontinuous profile renders and round-trips, there is just no gesture to make one), compound paths.
- **One subpath.** A path of several pieces is not offered (as for taper); VectorCraft runs the profile along each.
- **Entering the tool does not select a stroke.** It works on the selection, or the stroke under the press (which it then selects).
- **Output is a polygon** (`M/L/Z`, flattened to 0.1 units), not fitted cubics like the legacy taper's `simplify` — larger in the file for a long curved stroke, and not meant to be node-edited (its source is the centerline). Fitting each side with `fitCubics` between corners would shrink it.
- **Stacking.** A profiled stroke can sit on top of live effects or corner radius (see "The live stack"); it is still exclusive with arrowhead alignment (a tipped line loses its alignment when profiled).
- **Fixed-width cap** at a zero-width end: a round cap there is a point; VectorCraft's blend of the two sides is what is ported.
- **A transform bake** (move / resize) rewrites the centerline and the width; the profile's `t` is the fraction of arc length, so a non-uniform scale shifts points slightly along the path.
- The Delete key goes to the tool through the shortcut dispatcher as well as the canvas listener (`toolKeyDown` is idempotent per event): any tool with a `keyDown` now wins over the global shortcut.

## Arrowhead alignment (`core/arrow-align.js`): follow-ups from T2.4

Done: the Markers panel's **Head position** picker (Centered on the end = the old behaviour / Tip on the end / Tip past the end). A head newly picked for a start or end marker is Tip; existing drawings stay centred until the picker is used. Tip trims the stroke by the head's inset (`se:arrow-pts` / `se:arrow-d` keep the real geometry, re-trimmed when the stroke width, the marker or the connector changes). Remaining:
- **Only heads at the start and end, only on a line, polyline or one open path.** A polygon, a closed path or a path of several pieces keeps centred heads (the picker is disabled). Mid markers are never aligned.
- **Heads with no tip stay centred** (box, circle, star, slashes, X): there is no tip to put on the end, and the stroke ends in the middle of them as before.
- **For solid heads Extend equals the old centred head** (the inset is half the head); it differs only for hollow heads and the open arrow. Both are offered because Extend needs no trimming and keeps the line's length.
- **A head pointing into the line** (a triangle at the start, a left arrow at the end) puts its tip on the end and trims nothing: the head sits beyond the line, pointing at it.
- **Marker box clipping.** The head's tip is where the marker's 100×100 box ends, so the tip is the clipped edge (slightly blunt, as the old heads were), not a mitred point. Heads were not redrawn.
- **Node editing a tipped path** edits the trimmed geometry; the source no longer matches, so on the next change the element becomes Extend on what it has (same picture, the head stays put). The same happens to an undo that restores only the geometry. Entering path edit on a tipped path could instead untrim first and re-trim on leave.
- **Stroke width scaling.** A resize does not scale the stroke width (as elsewhere), so the head keeps its size and the trim follows.
- **Copies.** Clone and paste duplicate an element's markers inside the copy's own undo step (core clones the referenced `<defs>`); `ext-markers` only gives an element a marker of its own when it still shares one with a non-mirror element, and that creation is still outside the undo history. Mirror twins share their source's markers on purpose.
- Not done from the plan: a custom-geometry head table for hand-made markers, the connector's legacy polyline offsets for heads that are not extension-made (they keep `stroke width × 5`).

## Fitted dashes (`core/dash-fit.js`): follow-ups from T2.5 (v1)

Done: the Dash row's Fit toggle fits the pattern of a line, circle, ellipse, rectangle, polygon, polyline or one-piece path to a whole number of periods per run, a dash centred on each end of an open stroke and round each corner. Remaining:
- **Corners are fitted side by side, as one explicit `stroke-dasharray`** (not the plan's group of sibling paths, which would have restructured the DOM): every run between two corners gets a whole number of periods and a dash is bent round each corner, so the join is drawn. The list adds up to the outline's length, so it is not periodic: a long outline with a short pattern is refused (`MAX_DASH_ENTRIES`, 4,000 entries) and the file carries the whole list. Rectangles (square corners), polygons, polylines and any one-piece path with corners; a rounded rect is one smooth run. Corner lengths are the 20-sample `cubicLength`, exact for straight sides; along a long curve between corners the dashes can drift a fraction of a pixel from the browser's own arc length. The start corner of a closed shape is one dash through `stroke-dashoffset`, which Chromium draws joined (not checked in other browsers).
- **The fit is not live.** `stroke-dasharray` is computed once; resizing, node editing or remapping the path leaves the old fit, which is a little off until Fit is pressed twice (off, on) or a dash style is picked again. `se:dash-fit` keeps the nominal pattern so a refit never compounds, but nothing triggers it. Auto-refit on `changed` would add a second, unrecorded write to the same gesture, or a second undo step; it needs a way to fold an attribute change into the command that was just recorded.
- **Round and square caps lengthen each dash** by the stroke width, which the fit ignores (it fits the pattern, not the painted marks). A dot pattern with round caps still centres its dots.
- **A `stroke-dashoffset` the user had set is replaced** by the fit and not restored when the fit is turned off.
- **Copy style** copies `stroke-dasharray` but not the offset or the marker, so a fitted source gives its target the stretched pattern without the fit.
- The Dash select shows blank for a pattern that is not one of its five presets (including every fitted one); only the Fit button shows that something is fitted.

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
