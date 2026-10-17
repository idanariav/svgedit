# UI / UX polish

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).


*The UI sections below came out of a UI/UX review (2026-10-07: screenshots at 1440×900, 1024×700 and 800×600, light, dark and tablet modes, plus the live hotkey registry). Obsidian-only findings are in `../obsidian-svgedit-plugin/.claude/techdebt.md`.*

### Toolbars: left column folds into "…" automatically

Done: narrow-pane work (top bar two-tier collapse + "⋯" tray, tablet command bar shedding by
container width, palette keeps a 14px swatch minimum and scrolls) and, in a short pane, the left
column's last tools fold into "Additional tools" (`toolAutoFold.ts`) and return when there is room;
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
control (`isFocusControl` in `Hotkeys.ts`) they move focus normally. The Shapes flyout (`tools_shapes`) and the Shape library (`tool_shapelib`) register with the hotkey manager like `se-button`s, so both can be bound (no default keys). Nothing further planned.

### Side panel and top bar: remaining polish

Done: panel opens once on the first selection in a pane ≥1100px wide (a manual toggle is
remembered, `sidePanelManual` pref); Path actions carry captions (`data-caption`); the
theme toggle is no longer a default extension (Preferences has theme). The six top-bar toggles (frame,
wireframe, canvas settings, grid, smart snap, layer view) stay icon-only with tooltips (decided: labels
don't fit the tight bar). Nothing further planned.

### Tool cursors

Done: `toolCursors.ts` `cursorForMode(mode)` — a mode has a cursor when `images/cursors/<mode>_cursor.svg` exists (32px, white
halo for the dark canvas; the file names its hotspot in `data-hotspot="x y"`). The cursor *replaces* the pointer: tools with a
working tip are drawn as the tool with its tip at the hotspot (Pencil `fhpath`, Pen `path`, Curvature, Brush, Smooth, Eyedropper,
Cutter); shape and effect tools are a crosshair (hotspot at its centre) with a small glyph of the tool beside it (rect/square/ellipse/
circle/polygon/star, line, arc, spiral, rect/polar grid, shape builder, gradient, distort, corners, width, blend, shaper). Zoom, shape
library, puppet warp and repeat-pick-center keep a crosshair, text its I-beam, pan a hand; Measure's `ToolDef.cursor` is a crosshair.
Cursors by position: a tool says what the pointer is over with `svgCanvas.setCursorHint(hint)` (a short name, `null` for none; a mode
change clears it; the `cursorHint` event fires on change). The editor turns the hint into a cursor (`toolCursors.ts`): `grab`,
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
