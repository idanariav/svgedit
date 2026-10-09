# Tier 3 — small UX wins and nice-to-haves

Read [README.md](README.md) first. These are independent; any order. Each is
small enough to plan inline, but still needs unit tests and doc updates.

---

## T3.1 — Scrubby labels + wheel stepping on numeric fields

### Goal
- Drag a numeric field's **label** left/right to change the value: one step
  per 2 px of drag; **Shift** ×10, **Ctrl/Cmd** ×0.1; ↔ cursor over the
  label; the whole drag is **one undo step**; **Escape** during the drag
  restores the original value. A plain click on the label focuses the field.
  The text box itself never scrubs.
- Mouse wheel over a **focused** field steps it (same modifiers); an
  unfocused field leaves the wheel to page scrolling.
- A preference to turn scrubbing off (default on).

### VectorCraft reference
Behaviour described in `ROADMAP.md` ("Scrubby labels (#400)" and "#485" wheel
stepping). Implementation is egui-specific, so port the behaviour only.

### svgedit integration
- `src/editor/components/seSpinInput.js` (423 lines) — the shadow DOM has a
  `.top-label` (`<label>`, shown only when `[label]` is set) and spin
  buttons. Add pointer handlers on `.top-label` with
  `setPointerCapture`; respect `min`/`max`/`step`; round to the field's
  precision.
- **Undo:** today each `change` event becomes its own history entry in the
  handlers. Emit `input` events during the drag (live preview) and a single
  `change` on release — check every consumer that listens only to `change`
  still updates on release, and that consumers that apply on `input` don't
  create one undo step per tick (grep `addEventListener('input'` on spin
  inputs). If a consumer can't be made single-step, wrap with
  `svgCanvas.undoMgr.beginUndoableChange`/`finishUndoableChange` ❓.
- Pref: `ConfigObj.js` (e.g. `scrubNumericFields`), toggle in
  `editorPreferencesDialog.js`.
- Tablet shell: disable scrubbing on touch pointers (conflicts with scrolling).

### Tests
Extend `tests/unit/components/` spin-input tests: drag of +20 px with
step 1 → +10; Shift → +100; Escape restores; clamped to max; one `change`
event per drag; wheel only when focused.

Effort: S.

---

## T3.2 — Measure tool

### Goal
Drag between two points to read **distance, angle, dX, dY** (Shift
constrains to 45°); the readout stays until the next drag; the document is
never changed. Endpoints snap (uses T2.1 targets when available).

### VectorCraft source
`crates/tools/src/xform/measure.rs` (108 lines).

### svgedit integration
Extension `ext-measure`, mode `'measure'`, overlay line + label in
`svgroot` (not exported); units via `core/units.js` and the `baseUnit` pref
(`ConfigObj.js`). Position: left panel after the eyedropper, or the
"Additional tools" overflow bucket by default ❓.

### Tests
Unit: distance/angle math, unit conversion, Shift constraint. Extension:
mode switch leaves the document unchanged (no history entries).

Effort: S.

---

## T3.3 — Transform Each

### Goal
A dialog applying **scale (H/V %), move (H/V), rotate (°), reflect X/Y** to
**each** selected object about **its own** reference point (9-point
locator), with a "Random" option (each value randomized between 0 and the
entered value) and Copy (apply to duplicates). One undo step.

### VectorCraft source
`transformEach` in `crates/engine/src/cmd/menucmds.rs` (the command and its
params).

### svgedit integration
- Canvas method `svgCanvas.transformEach(params)` in
  `packages/svgcanvas/core/selected-elem.js` next to `flipSelectedElements`
  (≈ line 925). Copy its per-element `BatchCommand` structure, but note that
  flip **deliberately skips** `recalculateDimensions` (read its comment ≈
  line 971: decomposing rotation/scale would relocate the element). Decide
  per operation: move/scale should bake into geometry via
  `recalculateDimensions` (so live-geometry sources remap — see the
  drag-consolidation tail in `event-select.js`), rotation should stay a
  `rotate()` transform like the rotate grip does.
- Dialog: native `<dialog>` component (see `seAlertDialog.js` family and
  `syncDialogTheme`). Entry: Design tab Object cluster for multi-selection
  and a keyless `Editor.shortcuts` entry (Command Search).
- Live geometry elements (taper, corner radius, `se:fx`) stay in sync only
  if the bake goes through `remapElement` → geometry remap registry; add a
  test proving it for a tapered path.

### Tests
Unit: each element rotates about its own centre (not the selection's);
reference point corners; Random is deterministic with a seeded RNG in tests;
one undo step; tapered path stays in sync.

Effort: S–M.

---

## T3.4 — Split Into Grid

### Goal
Select a rectangle (or any shape — use its bbox) → dialog with rows, columns,
gutter (and optionally explicit cell height/width) → replace it with
`rows × cols` rects filling the bbox, same style. Handy for layout
grids, tables, comic panels.

### VectorCraft source
`crates/pathops/src/edit.rs` `split_into_grid(rect, rows, cols, gutter)`
(≈ line 427; row-major, top-left first).

### svgedit integration
`svgCanvas.splitIntoGrid({rows, cols, gutter})` in a core module (or in
`segment.js`'s neighbourhood — ext-segment already divides shapes; check
whether the popover can host a "Grid of rects" mode instead of a new
button ❓). Rotated rects: apply the grid in the rect's local space and keep
its `transform`. Result grouped in a `<g>` ❓ (recommended: yes, so it moves
as one; ungroup available).

### Tests
Unit: cell sizes `(W − (cols−1)·gutter)/cols`; ids unique; style copied;
original removed; one undo step; rotated rect keeps rotation.

Effort: S.

---

## T3.5 — Area text with wrapping

### Goal
Drag a box with the Text tool to create **area text**: text wraps to the box
width; resizing the box re-wraps; optional vertical alignment. Point text
(click) stays as today.

### VectorCraft reference
`crates/text/src/layout.rs` (line breaking for point/area/on-path type) —
read for behaviour only. VectorCraft shapes text with its own font engine;
in the browser, measure with `CanvasRenderingContext2D.measureText` (same
font string as the element) or `getComputedTextLength()` on a temporary
`<tspan>`.

### svgedit integration
- Multiline text already exists: rows are absolutely positioned `<tspan>`s
  produced by `setMultilineText` / `getTextWithNewlines` in
  `packages/svgcanvas/core/dom-utils.js`; caret logic in
  `core/text-actions.js` is row-aware.
- Store the wrap width as `se:wrap-width` (and the box height as
  `se:wrap-height` if vertical alignment is supported). Keep the user's
  newlines as hard breaks; soft breaks are recomputed and **not** stored as
  `\n` (so `getTextWithNewlines` must distinguish them — mark soft-break
  tspans with `se:soft="1"`).
- Re-wrap triggers: text edit, font family/size/letter-spacing change, box
  resize (resize handles on a wrapped text change `se:wrap-width` instead of
  scaling the glyphs — needs a branch in `event-resize.js` ❓), web-font load
  (ext-fonts) — fonts loading after first layout change the measurements.
- Export: the output is plain SVG text with tspans, so it renders anywhere
  (no SVG2 `inline-size`, which browsers support unevenly).
- Out of scope: hyphenation, justification, text threading.

### Pitfalls
- Measurement must use the **rendered** font; if a web font isn't loaded
  yet, re-wrap on `document.fonts` `loadingdone`.
- CJK text has no spaces — break between any characters for CJK ranges.
- `text-anchor` middle/end with wrapped rows: rows share `x`, so alignment
  keeps working (same as current multiline).

### Tests
Unit: wrap algorithm with a stub measurer (greedy break at spaces, long
words broken, hard newlines kept, CJK breaks); round trip
`getTextWithNewlines` excludes soft breaks. e2e: type into area text,
resize box, row count changes.

Effort: M–L.

---

## T3.6 — Layers panel: cheap extras

Independent of T2.17 (object rows); do these first if T2.17 is far off.

### Goal
- **Alt-click an eye** hides every *other* layer; Alt-click again (when the
  others are all hidden) shows them all. **Alt-click a lock** does the same
  with locking.
- **Drag down the eye or lock column** to set every row it passes to the
  same state as the first row, in **one undo step** for visibility (locking
  is a non-undoable meta change today — keep it that way).
- **Drag layer rows to reorder** (keep the existing up/down buttons).
- **Comment layer as tracing template:** an option on comment layers to
  also dim and lock them, so a reference image can sit under the drawing
  without being exported or accidentally selected.

### VectorCraft source
`crates/ui-egui/src/panels/layers.rs` header comment (eye/lock column
gestures), `crates/engine/src/cmd/layerpanel.rs` (`hideOthers`,
`showAll`, `lockOthers`, `unlockAll`, `template`).

### svgedit integration
- Rows are built in `src/editor/panels/RightPanel.js` `populateLayers()`
  (≈ line 386); visibility goes through `setLayerVisibility` in
  `core/layer-ops.js`, which records a `ChangeElementCommand` per layer
  (≈ line 208) — wrap several in one `BatchCommand` for Alt-click and
  column drags. Locking: `setLayerLocked`/`getLayerLocked`.
- Reorder: `setCurrentLayerPosition(newPos)` (`layer-ops.js` ≈ line 170)
  already moves a layer; drive it from HTML5 drag-and-drop or pointer events
  on the rows (pointer events work better with the tablet shell).
- Comment/template: comment layers already exist (`se:comment`,
  `Layer#setCommentLayer` in `core/layer.js`; callers exclude them from
  export). Add the dim + lock option; reuse ext-layer_view's dimming
  approach (inline style, never the persisted `opacity` attribute — see its
  header comment) so dimming doesn't change saved output.
- Interaction with ext-layer_view's Focus mode, which snapshots and restores
  locks: Alt-click lock while Focus mode is on must not leave locks in a
  wrong state after Focus mode exits. Test it.

### Tests
e2e in `tests/e2e/layers-panel.spec.js`: Alt-click eye hides others and the
second Alt-click restores; one undo reverts the Alt-click; column drag sets
three rows in one undo step; drag reorder changes stacking order; template
comment layer is dimmed, unselectable and absent from export.

Effort: S–M.

---

## T3.7 — Pencil continues a selected path + visible smoothing settings

Works best after T2.15 (new pencil fit), but doesn't strictly need it.

### Goal
- With an open path selected, starting a pencil stroke near one of its ends
  **continues that path** (the new stroke is appended, not a new element);
  ending the stroke near the path's other end **closes** it.
- Make the pencil's smoothing settings visible: **Stabilization** (the
  existing `pencilStabilization`, 0–1, today config-only) and **Fidelity**
  (T2.15's `pencilFidelity`, or the current simplify tolerance until then).

### VectorCraft source
The `extend` branch of `freehand` in `crates/engine/src/cmd/draw2.rs`
(≈ lines 499–545): find the last open subpath, reverse it when continuing
from its start, snap the stroke's first point to the path end, fit the new
points, join handles at the seam, close when the stroke ends within
`max(4 × fidelity, 6)` of the path's first anchor, reverse back.
Gesture: `crates/tools/src/draw2/gesture.rs` ("starting near an end of a
selected open path continues it").

### svgedit integration
- Pencil capture and commit: `fhpath` cases in
  `packages/svgcanvas/core/event-shape-draw.js` (mousedown ≈ line 77,
  mousemove ≈ 351, mouseup ≈ 408; commit calls `simplifyFreehand` ≈ 429).
  On mousedown, if exactly one open `<path>` is selected and the press is
  within a screen-px tolerance of an end, remember `{ path, atStart }`; on
  mouseup, fit the stroke and splice it onto that path as one
  `ChangeElementCommand` instead of inserting a new element.
- Exclude paths with live geometry (`se:taper-d`, `se:orig-d`, `se:fx-d`),
  as in T2.3. Reuse T2.3's endpoint hit test if it has landed.
- Show a "continue" cursor when hovering a continuable end with the pencil.
- Settings UI ❓: double-click on a tool button already means **lock mode**
  (`LeftPanel.js`, `LOCKABLE_TOOL_IDS`), so VectorCraft's "double-click opens
  Tool Options" can't be copied. Options: a small popover in the Design tab
  while the pencil is active, or rows in Preferences. Recommended: the
  Preferences dialog (`dialogs/editorPreferencesDialog.js`), since these
  are set once and rarely changed.

### Tests
e2e: draw an open path with the pencil, keep it selected, draw again from
its end → still one `<path>`, more anchors, one undo step; ending near the
start closes it; a stroke starting away from the ends makes a new path.
Unit: settings persist through `ConfigObj` prefs.

Effort: S–M.
