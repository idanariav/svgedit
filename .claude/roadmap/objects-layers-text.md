# Objects, layers, layout and text: follow-ups

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).

## Layout tools (`core/transform-each.js`, `core/split-grid.js`, `ext-layout-ops`, `se-params-dialog`): follow-ups from T3.3 / T3.4

Done: **Transform Each** (`tool_transform_each`, group Transform): scale H / V %, move, rotate, reflect X / Y about each object's own reference point (a 3 × 3 locator of its bounding box, in parent coordinates), Random (each amount a random fraction of the entered one, per object; a checked reflection hits about half) and Copy (works on duplicates); the result is left the way the editor's own resize leaves an element: the scale / reflection is baked into the geometry of a rect / ellipse / line / polyline / polygon / path (`recalculateDimensions`, so live sources — taper, corner radius, `se:fx` — follow through the remap hooks) and a rotation stays a `rotate(angle, cx, cy)` (`decompose`), so the rotation field reads it and repeated use does not pile up transforms. **Split Into Grid** (`tool_split_grid`): one plain shape → a group of rows × columns rects over its bounding box with a gutter, same look (live-feature `se:` / `data-` attributes are not copied), the shape's transform kept on the group. Both preview live inside an undo transaction (OK = one step, Cancel / Escape = nothing), shared form `se-params-dialog` (number / checkbox / select / origin fields), a Layout section in the Design tab. Remaining:
- **Skewing and unbakeable cases keep a `matrix()`:** a rotated element scaled unevenly along the parent's axes would need a skew, so it keeps one `matrix()` over its own transform (as Flip does; geometry untouched); a circle (would stay round), text, image, group, `use` and a clipped / masked element get `rotate(…)` plus one scale / translate `matrix()` instead of a bake. Baking those would need `recalculateDimensions` to stretch them exactly; a circle could become an ellipse first.
- **Scale bakes like a resize, so a stroke keeps its width** (a `matrix()` used to scale it along).
- **No Transform Each for groups' children as a unit,** and no "transform each" of a clipped / masked object's clip (the clip follows the element's transform, as for any transform).
- **Random is per amount, not per object seed:** the preview uses one seed per dialog so it does not jump; the committed amounts are those of the last preview. Reflect-when-random is a coin flip, not a fraction.
- **Split Into Grid takes plain shapes only** (rect, circle, ellipse, line, polyline, polygon, path; not groups, text or images) and splits the *bounding box*, not the outline: a circle becomes a grid of rects, not of clipped pieces. No explicit cell width / height (rows and columns only), no row / column sizes that differ, at most 2,500 cells.
- **A path's cells carry its fill / stroke but not its markers**, rounded corners are kept for rects only.
- Not in the tablet shell; the dialog is modal (the canvas cannot be panned while it is open).

## Layers panel object rows (`panels/layerTree.ts`, `core/object-state.js`): follow-ups from T2.17

Done: a tree under each layer (objects and plain groups, front to back; layers open, groups closed), eye / lock / name per row, click / Shift-range / Cmd-toggle selection that enters the object's layer and group, double-click rename (`data-name`), drag to reorder or move into another layer or group (one undo step, position kept), Locate Object (`layer_locate`), locked objects refused by clicks, rubber bands and `addToSelection`, hidden ones by the rubber band. Remaining:
- **Capped, not virtualized.** A parent lists at most 200 children ("N more…" adds 200); measured at 5,000 objects in a layer: 200 rows, ≈ 23 ms to rebuild, ≈ 1 ms when nothing changed. Real windowing only if a drawing needs to scroll through thousands of rows.
- **Not in the tablet shell** (`TabletShell.ts` has its own layers UI). **Keyboard access** is `panels/layerKeyboard.ts`: the table is one tab stop (`role=treegrid`), an active row (`kbfocus`) moves with ↑ ↓ Home End, → ← open / close / go to the parent, Enter / Space select (Shift range, Ctrl / Cmd toggle), F2 rename, H / L eye and padlock, Alt+↑↓ reorder; handled keys stop at the table. Not done: Shift+arrow range only among siblings, no type-ahead, and the active row is a class (no `aria-activedescendant`), so a screen reader hears the table, not the row.
- **A locked object is not a click target at all**, so a press on it starts a rubber band instead of selecting what is under it (Illustrator picks the next object down). Lock / hide from the canvas are the commands `object_lock_selection` (mod+2), `object_hide_selection` (mod+3), `object_unlock_all` (mod+alt+2) and `object_show_all` (mod+alt+3) (`coreCommands.ts`; the *all* pair is gated on `hasLockedObjects()` / `hasHiddenObjects()`, which walk the objects the panel lists, never a layer's own visibility).
- Object thumbnails: rows have none.
- **Moving between parents folds the parents' transforms into the object's own `transform`** (as one matrix). A `clip-path` / `mask` or a `userSpaceOnUse` gradient on the moved object is not compensated, and a rotation held as `rotate()` becomes part of the matrix.
- **Shift-range and Cmd-toggle work among siblings only** (the selection cannot span two parents); a row click in another parent starts a new selection.
- **The canvas selection opens its row** (its layer and groups) and scrolls it into view; Locate Object stays for a row hidden by the 200-row cap.
- **A generated group (blend, brushed path, repeat) is one row** and cannot be opened; its parts are edited by entering it on the canvas as before.
- **The layer context menu** (right-click in the list) acts on layers and also opens on object rows.
- The group-name field in `#objects_panel` (shown when a group is selected) stays; it duplicates the row rename.

## Layers panel gestures (`panels/layerGestures.ts`): follow-ups from T3.6

Done: Alt-click an eye / padlock (others, or an object's siblings), drag down a column (one undo step for visibility), drag a layer row to reorder, tracing-template comment layers (`se:template`, `layer_template`, Alt-click the comment icon). Remaining:
- **Pointer only**: touch scrolls the panel instead of dragging; the tablet shell has its own layers UI without any of this. The keyboard route is Alt+↑↓ in the panel (see above); the Move Layer Up / Down buttons stay.
- **Alt-click skips comment layers** (their lock / eye are managed by hand, as in Focus mode); a layer *drag* down a column does include them. A column drag that spans object rows of several parents works, as one undo step for visibility and lock (layer locks included: `setLayersLocked` is a transaction; the single `setLayerLocked`, used by Focus mode and templates, is still outside the history).
- **Alt-click the eye in Focus mode** ends Focus mode (as any eye click does) and an Alt-click lock is re-derived by Focus mode at once; once it ends the locks are the ones saved on entry. Not changed.
- **Templates**: no UI beyond the Alt-click and the command (no context-menu entry, no dim level setting; `0.35` is a CSS rule in `svgedit.css`). Un-templating unlocks the layer even if it was locked before. Exports leave out *every* comment layer (`rasterExport`, per the `Layer#setCommentLayer` contract), not only templates; saving keeps them.
- Reordering rebuilds the layer rows (`populateLayers`, which clears the selection), as the Move Up / Down buttons do.

## Area text (`core/text-rows.js`, `core/text-wrap.ts`): follow-ups from T3.5

Done: a drag with the Text tool draws a box (a click still places point text); the text wraps to it (`se:wrap-width`, optional `se:wrap-height` + `se:valign`); the rows the wrapping adds are soft (`se:soft="<n>"`, n = the spaces the break swallowed) and are never part of the content (`getTextWithNewlines`), so every consumer of the content string is unchanged. `x` / `y` stay the anchor and the first baseline, so moves, nudges and the position fields keep working; the box is derived from them (`getAreaBox`, which is also what `getBBox` returns for an area text: the selection box is the box, not the ink). Resizing a box (single, untransformed text) changes the box and re-wraps live, one undo step, the type keeps its size; font size and alignment changes keep the box where it is. A click on the empty part of a box selects it (`areaTextAtPoint`, only where the native hit-test found nothing), **Area text** button + vertical-align select in the Text tab, `tool_text_area` command, ArrowUp / ArrowDown and Home / End (plain or with Shift) move by drawn row, a re-wrap when a web font finishes loading, `checkDrawing` rule `area-text`, round-trip fixture `area-text.svg`. Remaining:
- **A rotated or otherwise transformed area text scales its type with the box** when resized (the legacy path, `coords.js` remap hooks scale `se:wrap-width` / `-height` with the font); the box-only resize needs the grips mapped through the element's transform. A group scale does the same, on purpose.
- **No overflow indicator, no auto-grow, no "fit box to text"**: a fixed-height box lets the text run out of it (and aligns to the top then); without a height the box is as tall as its rows.
- **Line breaking is greedy and simple:** break at spaces, inside a word wider than the box, and between any two CJK characters (no kinsoku, no hyphenation, no justification, no hanging punctuation); a break swallows the spaces it lands on, so a run of spaces at a wrap point is kept in the content, not drawn. Tabs are not special.
- **Measured with a hidden `<text>` probe** in the outer `<svg>` (computed font, letter and word spacing), so a font the browser substitutes is measured as drawn; under jsdom a character-count estimate stands in. `textLength` / `lengthAdjust` on an area text are not handled (they apply to each row).
- **One style per text** (as everywhere in this editor): no mixed styles inside a box, no text threading between boxes.
- **Point → area** takes the current width (+ 2) as the box width and keeps the rows as hard rows; **area → point** turns the rows as drawn into hard rows. The only way to get back the wrap is to convert again.
- **Not in the tablet shell**, no options bar; the box while dragging is the select tool's rubber band.
- The re-wrap on `document.fonts` `loadingdone` is not an undo step and does not refresh an open caret.

## Scrubby labels (`seSpinInput.js`): follow-ups from T3.1

Done: label scrubbing with modifiers, one undo step per drag, Escape, focused-wheel stepping, the preference. Remaining:
- **Other numeric fields**: only `<se-spin-input>` scrubs. Plain `<input type=number>` fields (a few dialogs) and `se-input` do not; the tablet shell's sheet fields never scrub (touch).
- **Wheel stepping is one undo step per notch** (like the arrow keys); coalescing a burst of notches is not done.
- A modifier pressed mid-drag changes the speed from then on (the value does not jump), but there is no on-screen hint of which multiplier is active.

## Select Same (`core/select-same.js`): follow-ups from T2.10

Done: fill / stroke / fill & stroke / stroke weight / opacity / type, a colour tolerance preference, keyless commands, and the **Magic Wand tool** (`ext-magic-wand`, `tool_wand`: click a shape to select what matches it, Shift adds, Alt subtracts, empty canvas clears; Match and Tolerance on its options bar, the tolerance being the same preference). Remaining:
- **The wand takes one criterion at a time** (Illustrator's panel ticks several at once: fill colour + stroke weight …); `fillstroke` is the only combination. Stroke weight and opacity have no tolerance (Illustrator's are in points / percent). The criterion lives in memory (a reload resets it to fill colour).
- **The wand's *Click* option (Select / Add / Subtract, in memory) stands in for Shift / Alt on touch**: Shift and Alt still win over it, and empty canvas clears only in Select. It is a select on the options bar (also in the tablet strip), not a toggle button next to the flyout. It has no keyboard shortcut (Illustrator's Y is the Curvature tool here).
- **The tolerance outside the wand is still a preference only**: the Select Same menu has no field next to it, so changing it there means opening Editor Preferences.
- **A click picks the top-level shape under the pointer** (the open group's child, else the layer's child); it does not select inside closed groups.
- Only the **top level of each layer (or the open group)** is scanned; shapes nested inside closed groups are not matched. Gradient and pattern fills only match by identical reference. Weight ignores `vector-effect` and transforms (a scaled shape reports its attribute value).
