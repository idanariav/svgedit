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
12. ~~**T2.5 Dashes fitted** (v1)~~ done (v2, corners, below) and 13. ~~**T2.4 Arrowheads**~~ done (follow-ups, below).
14. ~~**T2.6 Width profiles + Width tool**~~ done (follow-ups, below).
15. ~~**Live effects / corner radius / taper stacking**~~ done (corners + width, effects + width; follow-ups in
    "The live stack", below; design in [`plans/live-stack.md`](plans/live-stack.md)).
16. ~~**T2.14 Art / pattern brushes**~~ done (follow-ups, below), then 17. ~~**T2.13 Blend tool**~~ done (follow-ups,
    below; it built `options()/setOption()`, the first tool with a real options bar).

**Phase 5 — on-canvas editors (session-style tools)**
18. ~~**T2.7 Free / Perspective Distort**~~ done (follow-ups, below). It needed only part of the Tier 0 follow-ups it
    was meant to build: the gesture's own transaction is its undo step (one step per drag), so (b), a session concept for
    puppet-warp, was skipped; (a), the lighter apply, exists as `applyLiveEffectsTo`; moving the Effects *panel's* preview
    onto transactions was not done (see "Tier 0 follow-ups").
19. ~~**T2.8 On-canvas gradient editor**~~ done (follow-ups, below); it needed no session concept either (one undo
    step per gesture), and the Width, Distort and Gradient tools each draw their own handles, so no shared handle
    infrastructure came out of it. The **corner-radius widgets** deferred from T1.3 were then built the same way, as a
    tool with its own overlay (`ext-corner-tool`; follow-ups under "Live Corners").
20. ~~**T2.11 Recolor Artwork**~~ done (follow-ups, below): a dialog, not a tool; it previews inside a transaction held
    across the dialog's edits (cancel + re-begin per edit), so it needed no session concept either.

**Phase 6 — panels and text**
21. ~~**T2.17 Layers panel: object rows**~~ done (follow-ups, below) → 22. ~~**T3.6 Layers extras**~~ done (follow-ups, below).
23. ~~**T3.5 Area text**~~ done (follow-ups, below); the text commands' `enabled` pass was already in place (bold, italic, decorations, text on path / release), and the new `tool_text_area` has it.
24. ~~**T3.3 Transform Each**, **T3.4 Split Into Grid**, **T3.2 Measure tool**~~ done (follow-ups, below). The Measure tool
    was the first consumer of the tool contract's `cursor` (a static CSS cursor) and `keepOverlays` (a readout that outlives its gesture).

**Phase 6 is done: every item of the sequence is built.** What is left is the background tracks and the follow-ups below.

**Background tracks (no phase)**
- **Typing:** stay on strict JSDoc (no `.ts`, no toolchain change). Every svgcanvas core module is `@ts-check`ed and strict, and so is
  `svgcanvas.js`. What is left is opportunistic: when you touch a `core/` module's `init`, type its `canvas` parameter as the real class
  (see "Typing the `init` modules"). Generating the d.ts from source was looked at and dropped (2026-10-13, same section).
- **Plugin command access** (plugin repo): done 2026-10-12 (plugin 1.0.48) — one "Run editor command…" palette picker over
  `commands.list()` plus `plugin.editorCommands(view?)` for a future CLI / MCP bridge; no per-command palette entries, by decision.
  Open: the picker doesn't ask for a command's `params` yet (plugin `.claude/techdebt.md`).
- **UI/UX polish** (the six icon-only top-bar toggles stay icon-only by decision; left-column fold, flyout shortcuts, Cutter icon and "none" swatch are done): one batched pass
  after Phase 2, or opportunistically when a feature touches that toolbar.
- **Round-trip corpus, `checkDrawing` rules, command sweep:** every phase adds its fixtures and keeps the sweep green. The sweep picks one element per kind (tag + which `se:` features it carries), then runs the commands that need several shapes on two and on up to four of them together; it compares numbers at the saver's 2-decimal precision and skips the file-picker commands (`tool_save`, `tool_save_as`: they need a fresh user gesture). A feature that persists `se:` state needs a fixture saved by the real tool (the corpus covers connectors, fitted dashes, ruler guides, locked and comment layers, segments, tipped arrows…); `SWEEP=full` before closing a phase.

## Tier 0 follow-ups (VectorCraft port)

Not started. Each is scheduled with the first feature that needs it (see *Implementation order*); do not build them standalone.

- **Tool cursors by position** are done through `svgCanvas.setCursorHint` (see "Tool cursors"), not a `ToolDef.cursor()` by
  position; `ToolDef.cursor` (a CSS cursor, or a function of the context) is still applied on activate and removed on
  deactivate (Measure uses `crosshair`). Every drawing tool, old and new, now has a static cursor (`toolCursors.js`, below). `wantsHover` exists and is used by the cutter. (`options()/setOption()` was built with T2.13: the Blend tool; the
  editor draws the bar from the descriptors, `panels/toolOptionsBar.js`. Other tools opt in by adding `options()`;
  the Magic Wand has one too (Match, Tolerance), and so has the Smooth tool (Radius, Tolerance).)
- **Live-effects preview on transactions.** The apply-without-re-select path exists now (`applyLiveEffectsTo`, built
  for the Distort tool, which mutates the real element on every pointer move inside its gesture's transaction). What is
  left is the Effects *panel's* preview: `live-effects.js` still hides the original and shows a throwaway clone
  (`data-se-ephemeral`). Moving it onto a transaction means holding one open across the user's panel session (many
  param ticks, any other click or undo in between), which `techdebt.md` lists as a hazard, and the primitive → path
  swap re-selects, which the panel treats as "selection changed, cancel the edit". Do it only if the clone preview
  causes a real problem (a selection box that keeps the original's bbox is the known cosmetic one). Other hand-rolled
  previews: ext-curvature, ext-cutter (both already ephemeral).
- **Precise `enabled` on commands.** Done for everything with a selection, clipboard or layer precondition
  (`commandGates.js`: the shortcut table, the panel commands, paste, the layer buttons; path, text and Convert to Path
  had theirs earlier; crop Apply / Cancel follow `svgCanvas.isImageCropping()`, Remove glow / outline the selection's
  effects, `corner_kind_*` a shape with corners); new commands get a gate from day one. Left "always": the
  drawing-tool mode commands (switching tools is always allowed) and extension commands that register without a
  check. A hotkey on a gated command is inert and no longer
  `preventDefault`s: arrow keys scroll the canvas with nothing selected, Tab moves focus in an empty layer.
- **Puppet warp on `registerTool`.** Needs a way for a gesture to cancel without dooming an enclosing session
  transaction (see `techdebt.md`, "Tool contract (compromises)"). Worth it only if a second session-style tool
  appears; then give the registry a session concept instead of special-casing. *Scheduled:* T2.7 and T2.8 did not need it (one undo step per drag); the next candidate is T2.11, if it becomes a tool at all.
- **Lazy transaction snapshot** (targeted at the elements a caller declares) if anything ever needs a transaction
  per pointer-move. *Not scheduled:* no known consumer (T3.1's scrub is one transaction around a drag, which is cheap).
- **Plugin side:** expose `editor.commands.list()/run()` as Obsidian palette entries and hotkeys. Tracked in the
  plugin repo (`../obsidian-svgedit-plugin/.claude/techdebt.md`, "Expose the editor's command registry…"). *Scheduled:* a background track, best before Phase 3.

## Layout tools (`core/transform-each.js`, `core/split-grid.js`, `ext-layout-ops`, `se-params-dialog`): follow-ups from T3.3 / T3.4

Done: **Transform Each** (`tool_transform_each`, group Transform): scale H / V %, move, rotate, reflect X / Y about each object's own reference point (a 3 × 3 locator of its bounding box, in parent coordinates), Random (each amount a random fraction of the entered one, per object; a checked reflection hits about half) and Copy (works on duplicates); the result is left the way the editor's own resize leaves an element: the scale / reflection is baked into the geometry of a rect / ellipse / line / polyline / polygon / path (`recalculateDimensions`, so live sources — taper, corner radius, `se:fx` — follow through the remap hooks) and a rotation stays a `rotate(angle, cx, cy)` (`decompose`), so the rotation field reads it and repeated use does not pile up transforms. **Split Into Grid** (`tool_split_grid`): one plain shape → a group of rows × columns rects over its bounding box with a gutter, same look (live-feature `se:` / `data-` attributes are not copied), the shape's transform kept on the group. Both preview live inside an undo transaction (OK = one step, Cancel / Escape = nothing), shared form `se-params-dialog` (number / checkbox / select / origin fields), a Layout section in the Design tab. Remaining:
- **Skewing and unbakeable cases keep a `matrix()`:** a rotated element scaled unevenly along the parent's axes would need a skew, so it keeps one `matrix()` over its own transform (as Flip does; geometry untouched); a circle (would stay round), text, image, group, `use` and a clipped / masked element get `rotate(…)` plus one scale / translate `matrix()` instead of a bake. Baking those would need `recalculateDimensions` to stretch them exactly; a circle could become an ellipse first.
- **Scale bakes like a resize, so a stroke keeps its width** (a `matrix()` used to scale it along).
- **No Transform Each for groups' children as a unit,** and no "transform each" of a clipped / masked object's clip (the clip follows the element's transform, as for any transform).
- **Random is per amount, not per object seed:** the preview uses one seed per dialog so it does not jump; the committed amounts are those of the last preview. Reflect-when-random is a coin flip, not a fraction.
- **Split Into Grid takes plain shapes only** (rect, circle, ellipse, line, polyline, polygon, path; not groups, text or images) and splits the *bounding box*, not the outline: a circle becomes a grid of rects, not of clipped pieces. No explicit cell width / height (rows and columns only), no row / column sizes that differ, at most 2,500 cells.
- **A path's cells carry its fill / stroke but not its markers**, rounded corners are kept for rects only.
- Not in the tablet shell; the dialog is modal (the canvas cannot be panned while it is open).

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
- **The element's own transform only.** The grips and the pointer are mapped through the element's `transform`, not those of the groups above it (as in the Width tool); a shape inside a transformed group that is entered misplaces the grips.
- A pathological stack (a distort entry before another effect that changes the anchor count a lot) can hit `MAX_FX_ANCHORS`; the drag then stops updating, it does not corrupt the shape.

## Gradient tool (`core/gradient-edit.js`, `ext-gradient-tool`): follow-ups from T2.8

Done: `tool_gradient` (mode `gradient`): an annotator on the selected shape's linear or radial gradient — start handle (moves the whole gradient), end handle (length and angle, Shift = 45° steps; a radial's radius), stop chips (move, drag off to delete, Alt-drag to copy, double-click for the colour dialog, Delete, click the bar to add), a radial's extent and focal dot; Fill / Stroke on the options bar. `objectBoundingBox` and `userSpaceOnUse` units, `gradientTransform`, the element's and its groups' transforms and `href`-inherited stops are honoured; only the geometry attributes and stops are written. A gradient another element (or gradient) uses is copied first, so editing one shape never recolours another. Remaining:
- **No gradient creation.** A solid paint is not turned into a gradient by dragging across the shape (VectorCraft does); make the gradient in the colour picker first, then edit it here.
- **A radial gradient has no rotate / aspect handles.** VectorCraft's aspect and rotate zones need `gradientTransform` rewritten; here the ellipse is whatever the units and transform make it (a bounding-box radial on a non-square shape is already an ellipse). The end handle sets `r` from its distance to the centre, so with a rotated `gradientTransform` the handle can slide off the pointer.
- **A linear gradient's bar sits where its attributes put it.** The default `x1=0 y1=0 x2=1 y2=0` is the shape's top edge (the gradient is constant along y, so it looks the same mid-shape); drag the start handle to move it.
- **The editor normalises user-space gradients on load** (`convertGradients` turns a `userSpaceOnUse` gradient referenced by a `fill` / `stroke` attribute into box units and drops its `gradientTransform`), so they rarely reach the tool. It handles them anyway (unit-tested, and e2e by switching the units after load).
- **No midpoint diamonds** (SVG has no midpoints), no spread-method UI, no stop-opacity beyond what the colour dialog's alpha sets; a stop dragged past a neighbour swaps places in the DOM (SVG would clamp it).
- **No snapping** (to anchors, boxes, guides or the grid) (the tool has its static cursor); the handle follows the pointer with the grab offset kept.
- **Single element, plain shapes and text only** (path, rect, ellipse, circle, line, polyline, polygon, text). A group, or several selected shapes with one shared gradient, is not edited; shapes in a taper / width stack keep their gradient on the generated outline and are treated like any path.
- **In the tablet shell's More tools flyout.**
- A freshly double-clicked stop opens the *modal* colour dialog (Apply / Cancel); the popover mode used by the swatches needs an anchor element, which a canvas chip does not have.

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

## Layers panel object rows (`panels/layerTree.js`, `core/object-state.js`): follow-ups from T2.17

Done: a tree under each layer (objects and plain groups, front to back; layers open, groups closed), eye / lock / name per row, click / Shift-range / Cmd-toggle selection that enters the object's layer and group, double-click rename (`data-name`), drag to reorder or move into another layer or group (one undo step, position kept), Locate Object (`layer_locate`), locked objects refused by clicks, rubber bands and `addToSelection`, hidden ones by the rubber band. Remaining:
- **Capped, not virtualized.** A parent lists at most 200 children ("N more…" adds 200); measured at 5,000 objects in a layer: 200 rows, ≈ 23 ms to rebuild, ≈ 1 ms when nothing changed. Real windowing only if a drawing needs to scroll through thousands of rows.
- **Not in the tablet shell** (`TabletShell.js` has its own layers UI). **Keyboard access** is `panels/layerKeyboard.js`: the table is one tab stop (`role=treegrid`), an active row (`kbfocus`) moves with ↑ ↓ Home End, → ← open / close / go to the parent, Enter / Space select (Shift range, Ctrl / Cmd toggle), F2 rename, H / L eye and padlock, Alt+↑↓ reorder; handled keys stop at the table. Not done: Shift+arrow range only among siblings, no type-ahead, and the active row is a class (no `aria-activedescendant`), so a screen reader hears the table, not the row.
- **A locked object is not a click target at all**, so a press on it starts a rubber band instead of selecting what is under it (Illustrator picks the next object down). Lock / hide from the canvas are the commands `object_lock_selection` (mod+2), `object_hide_selection` (mod+3), `object_unlock_all` (mod+alt+2) and `object_show_all` (mod+alt+3) (`coreCommands.js`; the *all* pair is gated on `hasLockedObjects()` / `hasHiddenObjects()`, which walk the objects the panel lists, never a layer's own visibility).
- Object thumbnails: rows have none.
- **Moving between parents folds the parents' transforms into the object's own `transform`** (as one matrix). A `clip-path` / `mask` or a `userSpaceOnUse` gradient on the moved object is not compensated, and a rotation held as `rotate()` becomes part of the matrix.
- **Shift-range and Cmd-toggle work among siblings only** (the selection cannot span two parents); a row click in another parent starts a new selection.
- **The canvas selection opens its row** (its layer and groups) and scrolls it into view; Locate Object stays for a row hidden by the 200-row cap.
- **A generated group (blend, brushed path, repeat) is one row** and cannot be opened; its parts are edited by entering it on the canvas as before.
- **The layer context menu** (right-click in the list) acts on layers and also opens on object rows.
- The group-name field in `#objects_panel` (shown when a group is selected) stays; it duplicates the row rename.

## Layers panel gestures (`panels/layerGestures.js`): follow-ups from T3.6

Done: Alt-click an eye / padlock (others, or an object's siblings), drag down a column (one undo step for visibility), drag a layer row to reorder, tracing-template comment layers (`se:template`, `layer_template`, Alt-click the comment icon). Remaining:
- **Pointer only**: touch scrolls the panel instead of dragging; the tablet shell has its own layers UI without any of this. The keyboard route is Alt+↑↓ in the panel (see above); the Move Layer Up / Down buttons stay.
- **Alt-click skips comment layers** (their lock / eye are managed by hand, as in Focus mode); a layer *drag* down a column does include them. A column drag that spans object rows of several parents works, as one undo step for visibility and lock (layer locks included: `setLayersLocked` is a transaction; the single `setLayerLocked`, used by Focus mode and templates, is still outside the history).
- **Alt-click the eye in Focus mode** ends Focus mode (as any eye click does) and an Alt-click lock is re-derived by Focus mode at once; once it ends the locks are the ones saved on entry. Not changed.
- **Templates**: no UI beyond the Alt-click and the command (no context-menu entry, no dim level setting; `0.35` is a CSS rule in `svgedit.css`). Un-templating unlocks the layer even if it was locked before. Exports leave out *every* comment layer (`rasterExport`, per the `Layer#setCommentLayer` contract), not only templates; saving keeps them.
- Reordering rebuilds the layer rows (`populateLayers`, which clears the selection), as the Move Up / Down buttons do.

## Area text (`core/text-rows.js`, `core/text-wrap.js`): follow-ups from T3.5

Done: a drag with the Text tool draws a box (a click still places point text); the text wraps to it (`se:wrap-width`, optional `se:wrap-height` + `se:valign`); the rows the wrapping adds are soft (`se:soft="<n>"`, n = the spaces the break swallowed) and are never part of the content (`getTextWithNewlines`), so every consumer of the content string is unchanged. `x` / `y` stay the anchor and the first baseline, so moves, nudges and the position fields keep working; the box is derived from them (`getAreaBox`, which is also what `getBBox` returns for an area text: the selection box is the box, not the ink). Resizing a box (single, untransformed text) changes the box and re-wraps live, one undo step, the type keeps its size; font size and alignment changes keep the box where it is. A click on the empty part of a box selects it (`areaTextAtPoint`, only where the native hit-test found nothing), **Area text** button + vertical-align select in the Text tab, `tool_text_area` command, ArrowUp / ArrowDown and Home / End (plain or with Shift) move by drawn row, a re-wrap when a web font finishes loading, `checkDrawing` rule `area-text`, round-trip fixture `area-text.svg`. Remaining:
- **A rotated or otherwise transformed area text scales its type with the box** when resized (the legacy path, `coords.js` remap hooks scale `se:wrap-width` / `-height` with the font); the box-only resize needs the grips mapped through the element's transform. A group scale does the same, on purpose.
- **No overflow indicator, no auto-grow, no "fit box to text"**: a fixed-height box lets the text run out of it (and aligns to the top then); without a height the box is as tall as its rows.
- **Line breaking is greedy and simple:** break at spaces, inside a word wider than the box, and between any two CJK characters (no kinsoku, no hyphenation, no justification, no hanging punctuation); a break swallows the spaces it lands on, so a run of spaces at a wrap point is kept in the content, not drawn. Tabs are not special.
- **Measured with a hidden `<text>` probe** in the outer `<svg>` (computed font, letter and word spacing), so a font the browser substitutes is measured as drawn; under jsdom a character-count estimate stands in. `textLength` / `lengthAdjust` on an area text are not handled (they apply to each row).
- **One style per text** (as everywhere in this editor): no mixed styles inside a box, no text threading between boxes.
- **Point → area** takes the current width (+ 2) as the box width and keeps the rows as hard rows; **area → point** turns the rows as drawn into hard rows. The only way to get back the wrap is to convert again.
- **Not in the tablet shell**, no options bar; the box while dragging is the select tool's rubber band.
- The re-wrap on `document.fonts` `loadingdone` is not an undo step and does not refresh an open caret.

## Round-trip corpus: keep adding drawings

`tests/e2e/roundtrip.spec.js` loads/saves/loads every drawing in
`tests/e2e/fixtures/roundtrip/` and asserts the output stabilises after one
pass. Covered: frames, corner radius, taper, shadow/outline, text-on-path,
groups/layers/gradients, markers, clip-path/mask, `<use>`/symbols, embedded
images, repeat (radial + grid), mirror, puppet-warp, free/perspective distort and area text. Corner-radius and taper
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
`svgcanvas.js` carries `// @ts-check` and is part of `npm run typecheck` (strict
since 2026-10-13, see below). **All 107 `core/`+`common/` modules carry it** (2026-10-12: 72 added in three passes; JSDoc
`{Float}`/`{Integer}` became `{number}`, leftover `{PlainObject}`/`{GenericArray}` resolve through
`legacy-jsdoc-types.d.ts`, and `NS` is `as const` so `createElementNS(NS.SVG, 'g')` returns the right element type). A pragma is
checked by *both* configs, so a file the strict config reaches through an import must be strict-clean, and all of them are.
What is left is tightening, not coverage: `tsconfig.strict.json` (`noImplicitAny` + `strictNullChecks`) now covers **all 107**
`core/`+`common/` modules (2026-10-12; typing them turned up one real bug, `segment.js`'s `farthestPointFrom` measuring from a
`{cx, cy}` centre with `.x/.y`, which made a radial divider line stop at the first crossing instead of the farthest). `svgcanvas.js`
itself joined it on 2026-10-13 (147 errors: untyped accessor parameters, the `state` literal whose `[]`/`null` fields narrowed to `never`, and
a few null cases; the state is now the `CanvasState` / `StyleProps` / `BrushParams` typedefs at the top of the file, and a few
guards that were silent bugs got explicit handling: `flashStorage` no longer copies a missing clipboard as the string `"null"`,
`restoreRefElements` skips a malformed `url(`, and `getParents` is declared `Element[] | null` as it really is). The accepted stopgaps to shrink: `/** @type {any} */` at DOM-API
seams and on canvas-attached state whose class is built inside an `init` (the `Path` of `path-actions.js`/`path.js`, the `canvas`
parameter of every `init`). Most errors were untyped parameters and `null`-initialised variables; the rest nullable DOM links
(`parentNode`, `firstChild`) and the legacy `pathSegList` API.
Writing a module: a stale `@param` name that is not a parameter, or a `module:…` typedef name, is an error under the checker,
so write the real name.

The host API is `src/editor/hostApi.d.ts` (`EditorHostApi`, `HostCanvas`),
typechecked against `Editor` by `npm run typecheck` and copied to
`dist/editor/hostApi.d.ts`; the plugin consumes it.
Also open: the root `tsconfig.json` is `module: commonjs` and unused by any script. Medium.

## Typing the `init` modules (decided 2026-10-13: no d.ts generation)

Generating `svgcanvas.d.ts` (and deleting `svgcanvas-members.d.ts` / `svgcanvas-internal.d.ts`) was tried on three modules and
dropped. `tsc --declaration` works on `svgcanvas.js`, but the ~540 members the `core/*` `init`s attach (`canvas.foo = …`) cannot be
inferred, and deriving them as `ReturnType<typeof init>` is a type cycle (the class's base type would depend on `init`'s signature,
whose parameter is the class: TS2506 / TS2456). What it would take is a hand-written API `@typedef` plus `@returns` per module,
`init` returning it, `runGuardedInit` assigning it, and `svgcanvas.d.ts` split into an interface-only file (TS resolves
`./svgcanvas.js` to the sibling `.d.ts` first, so modules never see the source class): about 62 modules and a change to the
published types layout, for a generated file that is the weakest benefit. Not worth it; the d.ts files stay hand-written and the drift
test guards them. (Side note: the d.ts re-exports `NS`, `logger`, `math`, `units` and `dataStorage` by name, which the built entry
does not export; only the default export exists at runtime.)

What is worth having, without a deadline: **when you touch a module's `init`, type its `canvas` parameter as
`import('../svgcanvas.js').default`** instead of `any` or a `module:…` name (which resolves to `any`). Then
(1) `svgCanvas.foo = foo` is checked against the signature declared in `svgcanvas-members.d.ts`, so a mismatch fails `npm run
typecheck`, and (2) every `svgCanvas.method()` call inside the module is checked against the real class, which is how typing the
`core/` modules found the `segment.js` bug. 53 modules do it now (2026-10-15: 5 earlier, then two passes that typed the rest). The gesture state, `pathActions`' missing methods, the editor-set overlay hooks and a few `Config` flags are declared in `svgcanvas-members.d.ts` / `svgcanvas.d.ts`, and several declarations that disagreed with the runtime were corrected (`embedImage`, `groupSelectedElements`, `moveSelectedElements`, `getText`, the phantom `pathActions.selectNode`). Still on `any` or a hand-made context type (`EditorContext`, `pasteContext`…), on purpose or not tried: `bbox-utils`, `blur-event`, `dom-utils`, `draw`, `paste-elem`, `sanitize` (context-typed), and the `init = () => register…` modules (`distort`, `live-effects-distort`, `warp`), which take no canvas. Typing `canvas` precisely makes `getElement()` / `getRefElem()` results (`Element | null`) visible to the strict config; the fixes were casts where null cannot happen (it would have thrown before) and a few real guards. Beware when editing: a line starting with a cast `/** @type … */ (x)` after a line without a semicolon is parsed as a call (`standard` has no semicolons); assign to a local first. Expect new errors when a module is switched (members still typed `any` in `InternalMembers`,
members missing from the d.ts): fix them by declaring the member properly and deleting it from `InternalMembers`.

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
`src/editor/tsconfig.hostapi.json`. Everything else: all 107 `core/` +
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

1. ~~**Finish `@ts-check`**~~ done (entry above).
2. **Tighten per file:** turn on `noImplicitAny` and `strictNullChecks`
   (a second tsconfig, `tsconfig.strict.json`, lists the files already clean).
   **Done for all 107 `core/`+`common/` modules** (2026-10-12) **and for `svgcanvas.js`** (2026-10-13).
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
5. ~~**Generate the declarations** from source~~ dropped 2026-10-13: see "Typing the `init` modules" below. The hand-written d.ts
   files and the drift test stay.

**Don't break:** the published package shape (`main: dist/svgcanvas.js`,
`types: svgcanvas.d.ts`), `src/editor/hostApi.d.ts`, which the Obsidian
plugin consumes, and the self-contained `dist/editor/Editor.js` bundle. The
plugin only sees built JS, so it is unaffected as long as those hold.

**New code meanwhile:** modules added by the VectorCraft port plans
(`.claude/plans/vectorcraft-port/`, e.g. `anchor-path.js`,
`live-effects.js`, `bezier-fit.js`) should start with `// @ts-check` and
full JSDoc types (or as `.ts` if the decision above has been made), so they
don't add to this backlog.

Effort: the `@ts-check` rollout is done; what remains is large for strictness and the `.ts` question, but small per module; risky only in the
toolchain step.

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

## Shaper (ext-shaper): follow-ups from T1.6

Done: line / rectangle / ellipse / regular polygon recognition, scribble-to-delete, one undo step per stroke (`core/shape-recognize.js`, `ext-shaper`). Remaining:
- **In the tablet shell's More tools flyout** (`TabletShell.js` `MORE_TOOLS`).
- **Shaper Groups** (VectorCraft's live compound results that re-recognise when a stroke is added) are deliberately skipped; results are plain shapes.
- **Polygons are plain `<polygon>`s**, not polystar polygons. Making them editable with the polystar sides field means teaching `ext-polystar` to keep an orientation instead of rebuilding from angle 0.
- **Returns to Select after a created shape**, like every drawing tool (Alt at release or tool lock keeps it). A Shaper-specific "stay in the tool" preference would suit sketching several shapes in a row.
- **Scribble hit-testing is sample-based** (`strokeTouches`): spacing is ≥ 0.5 document units and at most 2,000 samples, so a hairline crossed by a very long scribble at very low zoom can be missed. Text and images are tested by their bounding box.
- No options bar (waits for the `options()` tool hook).

## Scrubby labels (`seSpinInput.js`): follow-ups from T3.1

Done: label scrubbing with modifiers, one undo step per drag, Escape, focused-wheel stepping, the preference. Remaining:
- **Other numeric fields**: only `<se-spin-input>` scrubs. Plain `<input type=number>` fields (a few dialogs) and `se-input` do not; the tablet shell's sheet fields never scrub (touch).
- **Wheel stepping is one undo step per notch** (like the arrow keys); coalescing a burst of notches is not done.
- A modifier pressed mid-drag changes the speed from then on (the value does not jump), but there is no on-screen hint of which multiplier is active.

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
- **Only plain, untransformed, single-subpath open paths in the current layer** are offered (no current group, no `transform`, no `se:taper-d` / `se:orig-d` / `se:fx-d`, which would desync from their source). A rotated or grouped path draws a new path instead. Mapping the press into the path's own space would lift the transform limit.
- **Path ends behind other shapes still win**: the nearest end within 6 screen px is used, whatever is on top of it. Alt starts a new path instead; there is no option to turn the behaviour off.
- A press on the carried-on path's *other* end closes it (the pen's existing close-on-first-point rule); its other old points do nothing, unlike a brand-new drawing where the second point also closes.
- The throwaway drawing is still the pen's half-opacity temp element; the original is hidden (`display="none"`) while it stands in, and restored by `clear()` if the tool changes mid-gesture.

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
- **The seam is tangent-continuous when the stroke sets off roughly the way the path arrives** (within the corner angle): `fitFreehand` takes `startDirection` (`endDirection(end)` in `pen-continue.js`) and the first handle lies on the old leg. A stroke that sets off at more than about 100° to it keeps a corner. Only the new stroke's handle moves; the old path's last handle is left as it was.
- **Only the selected path, plain and untransformed, in the current layer**, same limits as the Pen (see "Pen continue / join"). With the pencil tool armed the selection has to be made first, then the tool picked (the selection survives the switch).
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
- **Hover shows the snap before the press** (`svgCanvas.hoverDrawSnap`, called from the mouse-move branch with no button
  down, for the built-in drawing modes and any tool with `snap: true`): the same ring / guide lines, its own target cache
  (rebuilt when the mode or the undo history changes), cleared on leaving the canvas or the snapping modes. A change that
  is not an undo step (a layer shown / hidden, a live preview) leaves the cache stale until the next one. Not on touch
  (no hover). A `wantsHover` tool with `snap: true` gets the snapped point in its own hover too (`toolHover`); none
  combines the two yet (Measure is `snap` only); the cutter / pen rubber band are the candidates.
- **Tools that did not opt in** (`snap: true`): brush, shaper and eyedropper (free-hand or sampling tools, where a snapped point has no meaning). Curvature, the cutter and shape library placement opted in once they used `x` / `y` throughout; the target collection skips `data-se-ephemeral` nodes, so a tool's own preview is never a target (curvature's earlier anchors are not targets either, its own hit-test handles closing).
- **Not inside a group context** (the children's boxes are in the group's local space; same limit as object-to-object snapping), and targets are only the top level of each layer: shapes nested in closed groups contribute their group's box.
- **The pen's own earlier anchors are targets** (targets are collected on each press, and the path being drawn is part of the drawing then), so a click near one lands exactly on it. Not checked beyond that; if the in-progress segment ever turns out to snap to itself, exclude the pen's element in `event.js`'s `snapDraw` call.
- No equal-spacing or angle-from-last-point hints while drawing (VectorCraft has neither either); Shift still constrains angle/ratio after snapping.

## Select Same (`core/select-same.js`): follow-ups from T2.10

Done: fill / stroke / fill & stroke / stroke weight / opacity / type, a colour tolerance preference, keyless commands, and the **Magic Wand tool** (`ext-magic-wand`, `tool_wand`: click a shape to select what matches it, Shift adds, Alt subtracts, empty canvas clears; Match and Tolerance on its options bar, the tolerance being the same preference). Remaining:
- **The wand takes one criterion at a time** (Illustrator's panel ticks several at once: fill colour + stroke weight …); `fillstroke` is the only combination. Stroke weight and opacity have no tolerance (Illustrator's are in points / percent). The criterion lives in memory (a reload resets it to fill colour).
- **The wand's *Click* option (Select / Add / Subtract, in memory) stands in for Shift / Alt on touch**: Shift and Alt still win over it, and empty canvas clears only in Select. It is a select on the options bar (also in the tablet strip), not a toggle button next to the flyout. It has no keyboard shortcut (Illustrator's Y is the Curvature tool here).
- **The tolerance outside the wand is still a preference only**: the Select Same menu has no field next to it, so changing it there means opening Editor Preferences.
- **A click picks the top-level shape under the pointer** (the open group's child, else the layer's child); it does not select inside closed groups.
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
- **In the tablet shell's Shapes flyout** (`TabletShell.js` `SHAPES`, shown when `ext-shape-family` is loaded).
- **No keyboard shortcuts** (their cursors are the static arrow-plus-glyph ones).
- **Alt held at release keeps the tool** — core `mouseUpEvent` skips `setMode('select')` when `evt.altKey` is set for every shape tool; with Alt now meaning "from the centre" for arc/grids, releasing the mouse before Alt leaves the tool active (the shape is still selected). Pre-existing core rule, only more visible here.

## UI / UX polish

*The UI sections below came out of a UI/UX review (2026-10-07: screenshots at 1440×900, 1024×700 and 800×600, light, dark and tablet modes, plus the live hotkey registry). Obsidian-only findings are in `../obsidian-svgedit-plugin/.claude/techdebt.md`.*

### Toolbars: left column folds into "…" automatically

Done: narrow-pane work (top bar two-tier collapse + "⋯" tray, tablet command bar shedding by
container width, palette keeps a 14px swatch minimum and scrolls) and, in a short pane, the left
column's last tools fold into "Additional tools" (`toolAutoFold.js`) and return when there is room;
the saved order never records the fold. Covered by `tests/e2e/top-bar-layout.spec.js`,
`tests/e2e/tool-auto-fold.spec.js`, `tests/unit/toolAutoFold.test.js`. Remaining:
- Folding is strictly from the end of the main list: the user cannot say which tools matter most
  (they can reorder, so the tail is theirs to choose). The drawer button shows a count badge of the tools it holds.
- A folded tool the user drags *within* the drawer is still treated as folded (saved as main).
Small.

### Tablet shell: the newer tools

Done: a polish sweep (2026-10-13: the bar's width tiers moved up so Done is no longer clipped at 1161-1235px, the sheet's sliders no longer spill into the next column, the sheet wraps instead of running off a narrow pane, 32px slider targets and 44px swatches; `tablet-shell-layout.spec.js`), the tool options bar on touch (a strip under the command bar: Blend, Magic Wand, Corners), the Shapes flyout (now a grid, with the shape-family tools) and a **More tools** flyout (Shaper, Smooth, Width, Blend, Distort, Gradient, Corners, Measure, Magic Wand), a width tier at 800px to keep Undo / Redo on the bar at 768px. Remaining:
- **The options strip floats over the top of the canvas** (`#ts_tool_options`, 44px controls, centred under the command bar), covering the page's top edge while a tool with options is active; moving the canvas down for it would make the page jump on every tool change.
- **Modifier keys on touch** are replaced per tool by an option on its bar (the wand's *Click*, Measure's *45° steps*, the Corners tool's *Pick several*; the Corner choice stands in for Alt-click, and the options are in memory until reload). Other Shift / Alt gestures (e.g. the shape tools' Shift = equal axes, Alt = from the centre, the selection tool's) still have no touch substitute; a sticky modifier on the tablet bar would cover all of them at once.
- **Tools that need hover** (the Width tool's diamonds, the pen-end ring) show nothing on touch before the press.
- **Tool buttons are 46px above 980px, 38px down to 801px and 35px below** (under the 44px touch guideline in a narrow pane: the bar is full, with the menu button on the left reserving 130px); folding the freehand tools into one flyout, or a two-row bar in portrait, would give the room back.
- **The sheet's columns wrap in a narrow pane** (Object drops to a second line below about 900px; the dividers are hidden there). A swipeable single row, or collapsing Arrange into a flyout, would keep it one line.

### Keyboard shortcuts

Done: Tab/Shift+Tab cycle, `V` select, Duplicate `D`, platform-formatted tooltips, default
keys for Image (M), Brush (W), Cutter (C), Curvature (Y), Puppet warp (X). Tab / Shift+Tab
cycle the drawing's elements only when the canvas has the keyboard; on a focused toolbar
control (`isFocusControl` in `Hotkeys.js`) they move focus normally. The Shapes flyout (`tools_shapes`) and the Shape library (`tool_shapelib`) register with the hotkey manager like `se-button`s, so both can be bound (no default keys). Nothing further planned.

### Side panel and top bar: remaining polish

Done: panel opens once on the first selection in a pane ≥1100px wide (a manual toggle is
remembered, `sidePanelManual` pref); Path actions carry captions (`data-caption`); the
theme toggle is no longer a default extension (Preferences has theme). The six top-bar toggles (frame,
wireframe, canvas settings, grid, smart snap, layer view) stay icon-only with tooltips (decided: labels
don't fit the tight bar). Nothing further planned.

### Tool cursors

Done: `toolCursors.js` `cursorForMode(mode)` — a mode has a cursor when `images/cursors/<mode>_cursor.svg` exists (32px, white
halo for the dark canvas; the file names its hotspot in `data-hotspot="x y"`). The cursor *replaces* the pointer: tools with a
working tip are drawn as the tool with its tip at the hotspot (Pencil `fhpath`, Pen `path`, Curvature, Brush, Smooth, Eyedropper,
Cutter); shape and effect tools are a crosshair (hotspot at its centre) with a small glyph of the tool beside it (rect/square/ellipse/
circle/polygon/star, line, arc, spiral, rect/polar grid, shape builder, gradient, distort, corners, width, blend, shaper). Zoom, shape
library, puppet warp and repeat-pick-center keep a crosshair, text its I-beam, pan a hand; Measure's `ToolDef.cursor` is a crosshair.
Cursors by position: a tool says what the pointer is over with `svgCanvas.setCursorHint(hint)` (a short name, `null` for none; a mode
change clears it; the `cursorHint` event fires on change). The editor turns the hint into a cursor (`toolCursors.js`): `grab`,
`grabbing` and `pointer` are system cursors in every tool, anything else is `cursors/<mode>_<hint>_cursor.svg`, else the mode's own.
Used by: the Pen (`path_continue`: an open end a press would carry on; `path_join`: the same end while a drawing is under way), the
Pencil (`fhpath_continue`), the Width tool (`width_add` on the stroke, `grab` on a diamond, `grabbing` while dragging it, `pointer` on
a side handle), the Corners widgets and the Distort corner handles (`grab`, `grabbing` while dragging), the Gradient tool (`grab` on a
stop or handle, `gradient_add` on the bar where a press adds a stop, `grabbing` while dragging), Blend (`pointer` over a shape or
blend a click picks), Puppet warp (`grabbing` while a pin is dragged; the legacy hook has no hover, so no `grab` before the press),
and the select tool's move cursor (`select_move_cursor.svg`: `EditorStartup`'s select-mode mousemove sets `move` over a selectable
shape or inside the selection's box). Core never touches artwork (layering guard).
Remaining: Puppet warp's `grab` over a pin needs a hover hook in the legacy extension path; Shape builder (regions under the pointer)
and the Cutter / Smooth / Eyedropper have no hover hint; Image has no mode, so no cursor; cursors are not shown on touch (tablet) anyway.

### Icons and palette

Done: solid silhouettes are outlined at load (`OUTLINE_ICONS`), curated default palette
plus a "colours in this drawing" row, larger selection handles on coarse pointers,
tooltips shortened to the name and following a rebinding (`boundTooltipText`: `se-button` and `se-flyingbutton`; spin-input and explorer-button are not registered with the hotkey manager, so the authored `shortcut` is all they have), Brush settings carries its text next to the gear, the Cutter icon is a shape cut along its diagonal (two pieces with a gap; stroke-drawn, so no longer in `OUTLINE_ICONS`). Nothing further planned.

## Last priority: command-driven debug log and an LLM drawing CLI

Both come after everything above and every phase of the plans. They rest on the same fact: since the command registry, every
user-visible action is a documented command with a stable id, typed params, an `enabled` reason and one undo step, so what
happened in a session can be *named* rather than guessed from DOM snapshots.

1. **Command-based debug log.** The log the Obsidian plugin uses today (`DebugSnapshotLogger.js` polling
   `svgCanvas.getDebugSnapshot()` every 400 ms and forwarding changes to the host sink; plugin side `src/debug/`) records *state*, so a
   bug report says what the drawing looked like, not how it got there. Make it record *actions*: every `commands.run` / `tryRun`
   (id, params, outcome: ran / disabled with its reason / `badParams` / `internal` with the error), its source (hotkey, button,
   palette, automation, host), the undo-stack size before and after, a `checkDrawing()` result after each step, and the tool
   gestures (`registerTool` begin / commit / cancel). The registry is the one choke point, so the hook is a small `onRun`
   listener on `CommandRegistry`; the plugin sink keeps its format and gains an `action` event. Open questions to settle first:
   what to redact (text content, image data URIs, file paths), a size cap for the ring buffer, and whether the existing snapshot
   polling stays as a periodic checkpoint. A log that can replay (`automation` + `commands.run` over a starting SVG) would double
   as a bug-repro script and as a test fixture generator.
2. **A CLI for LLMs to work on drawings, including the ones embedded in Obsidian notes.** Follows the technical guidelines of the
   sibling tools (CLI-compatible package, local only, front-loaded reasoning): `svgedit-cli list` (commands with their params and
   enabled state, from `commands.list()`), `inspect` (what `automation.inspect()` returns: layers, selection, undo state, plus a
   compact structural summary of the drawing), `run <command> --param k=v` (through `commands.run`, so gates and undo behave as
   in the editor), `check` (`checkDrawing` findings), `read` / `write` for `.svg` files and for the drawings an Obsidian note
   holds (the plugin's `.md` drawings, raw or compressed, and embedded ones: the same reader `scripts/repair-drawings.mjs` already
   has), and JSON output on every verb. The engine needs a **headless host**: today `commands.run` needs the whole editor DOM, so
   the first piece of work is either running the editor in headless Chromium (Playwright is already a dependency, cheap but
   heavy) or splitting the canvas-level commands from the panel-level ones so the former run under jsdom. Decide that before
   anything else; start with the Playwright route. The plugin already exposes `editorCommands` for a future CLI / MCP bridge
   (see "Plugin command access" above), so an MCP server over the same verbs is the natural second front end.
