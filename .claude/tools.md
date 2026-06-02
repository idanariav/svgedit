# SVGedit User-Facing Tools

> **How to use this doc:** Look up tools by panel location. Each entry shows the element ID (for JS code lookup), purpose, and keyboard shortcut. Extension-provided tools are in a separate section at the bottom.

---

## Left Panel — Drawing Tools (`src/editor/panels/LeftPanel.html`)

The left panel is a vertical column of tool buttons. Some are "flying buttons" (`se-flying-button`) with multiple sub-tool variants selectable from a flyout.

| ID | Tool | Shortcut | Notes |
|----|------|----------|-------|
| `tool_select` | Select / pointer | S | Select, move, resize existing elements. With 2+ elements selected a single union box + 8 grips appears (rotate grip hidden); dragging any grip applies a **uniform group scale** about the opposite corner/edge — every shape keeps its aspect and relative position. See `select.js` `showGroupSelector` and `event.js` `resizeGroup`. |
| `tool_zoom` | Zoom | Z | Zoom in/out; double-click to fit content |
| `tool_fhpath` | Freehand pencil | Q | Draw freehand path |
| `tool_line` | Line | L | Draw straight line |
| `tool_path` | Bezier path | P | Point-by-point path creation |
| `tool_rect` *(flying)* | Rectangle | R | Also contains Square and Freehand Rect sub-tools |
| `tool_square` | Square | — | Sub-tool of rect flyout |
| `tool_fhrect` | Freehand rectangle | — | Sub-tool of rect flyout |
| `tool_ellipse` *(flying)* | Ellipse | E | Also contains Circle and Freehand Ellipse sub-tools |
| `tool_circle` | Circle | — | Sub-tool of ellipse flyout |
| `tool_fhellipse` | Freehand ellipse | — | Sub-tool of ellipse flyout |
| `tool_text` | Text | T | Add/edit text elements |
| `tool_image` | Image | — | Insert image elements |

**Extensions add (in order):**
- `tool_shapelib` — Shape Library (ext-shapes) — position 9
- `tool_star` / `tool_polygon` — Polystar flyout (ext-polystar)
- `tool_cutter` — Cutter/knife tool (ext-cutter) — position 11, after polystar
- `tool_curvature` — Curvature tool (ext-curvature) — position 12, after cutter
- `ext-panning` — Pan/hand tool (ext-panning) — after zoom tool

---

## Top Panel — Quick Actions (`src/editor/panels/TopPanel.html`)

The top panel is a horizontal flex bar of rounded **trays** (shared `.quick_tray`
style, matching `#editor_panel`/`#history_panel`/`#zoom_panel`). It holds only
selection-agnostic *quick actions* — shape attributes, text styling, stroke and
combine ops now live in the Right Side Panel tabs. Trays are shown/hidden by the same
class-based logic in `TopPanel.js` `updateContextPanel`.

> Layout: title (left) → view tray → `#theme_panel` → `.path_node_panel` →
> `#history_panel` (`margin-left:auto` pushes it + everything after to the right) →
> object/arrange trays → `#zoom_panel` (far right).

### Always-visible

| ID | Tool | Shortcut | Notes |
|----|------|----------|-------|
| `tool_source` | Edit SVG source | U | In `#editor_panel` (view tray) |
| `tool_wireframe` | Wireframe mode | F | In `#editor_panel` (view tray) |
| `tool_canvas_settings` *(`<se-canvas-settings>`)* | Canvas resize popover | — | In `#editor_panel`. Opens a popover with W/H spin-inputs, size presets (2-col grid), and Apply/Reset. Each preset shows ratio + size — aspect presets `4:5 (800:1000)` / `5:4 (1000:800)` / `16:9 (1000:563)` / `1:1 (1000:1000)` (base 1000px) plus the predefined `4:3` sizes moved out of Document Properties (`640:480`…`1600:1200`). Talks to `svgCanvas.setResolution`/`getResolution` directly via the global `svgEditor` |
| `grid_settings` *(`<se-grid-settings>`)* | Grid settings popover | — | Injected into `#editor_panel` by ext-grid. Show/snap toggles, shape select (square/isometric/triangle/1pt/2pt perspective), grid color, snapping step |
| *(theme)* | Light/dark toggle | — | Injected into `#theme_panel` by ext-theme-toggle |
| `tool_undo` | Undo | Ctrl+Z | `#history_panel`; disabled until history exists |
| `tool_redo` | Redo | Ctrl+Y | `#history_panel`; disabled until undo exists |
| `zoom` *(`<se-zoom>`)* | Zoom dropdown | — | In `#zoom_panel`. 25/50/100/200/400/1000%, Fit to Canvas/Selection/Layer/All. **Moved here from the bottom panel**; its `change` listener is bound in `TopPanel.init` (delegates to `bottomPanel.changeZoom`) |

### Single-element selected (`.selected_panel` tray)

One consolidated `.quick_tray` pill holds all object actions:

| ID | Tool | Shortcut |
|----|------|----------|
| `tool_clone` | Clone element | D |
| `tool_delete` | Delete element | Delete / Backspace |
| `tool_arrange` *(list)* | Arrange / z-order (see below) | — |
| `tool_flip_h` | Flip horizontal | — |
| `tool_flip_v` | Flip vertical | — |
| `tool_position` *(list)* | Align to page | — (L/C/R/T/M/B + distribute H/V) |

### Multiple elements selected (`.multiselected_panel` tray)

One consolidated `.quick_tray` pill:

| ID | Tool | Shortcut |
|----|------|----------|
| `tool_clone_multi` | Clone all | C |
| `tool_delete_multi` | Delete all | Delete / Backspace |
| `tool_group_elements` | Group | G |
| `tool_arrange_multi` *(list)* | Arrange / z-order (incl. Switch Layers) | — |
| `tool_align_multi` *(list)* | Align edges/centers + distribute H/V | — |
| `tool_align_relative` *(select)* | Alignment reference | selected / largest / smallest / page |

### Arrange / z-order dropdown (`tool_arrange` / `tool_arrange_multi`)

An `se-list` dropdown with a **fixed** trigger icon (`move_top.svg`; static-icon
mode of `se-list`, enabled by setting `src` on the `<se-list>` itself). One copy
lives in each selection tray (single = `tool_arrange`, multi = `tool_arrange_multi`,
following the `tool_clone`/`tool_clone_multi` convention). Both dispatch a `change`
event handled by `TopPanel.clickArrange`:

| Item value | Action | Canvas call | Shortcut |
|------------|--------|-------------|----------|
| `front` | Bring to Front | `moveToTopSelectedElement()` | Ctrl+Shift+] |
| `forward` | Bring Forward (one step) | `moveUpDownSelected('Up')` | — |
| `backward` | Send Backward (one step) | `moveUpDownSelected('Down')` | — |
| `back` | Send to Back | `moveToBottomSelectedElement()` | Ctrl+Shift+[ |
| `switch` *(`arrange_switch`, multi list only)* | Switch Layers (reverse z-order of 2) | `switchSelectedZorder()` | — |

The single-element list omits the switch item; in the multi list `arrange_switch`
is shown only when **exactly two** elements are selected. The move actions operate
on the primary selected element.

### Align dropdown (`tool_align_multi`)

Multi-selection align is a single `se-list` dropdown (fixed `align.svg` face) with
items `l/c/r/t/m/b/dh/dv`; its `change` is handled by `TopPanel.clickAlignMulti`
→ `clickAlign` → `alignSelectedElements(value, tool_align_relative.value)`.
(Single-element `tool_position` is the analogous align-to-page dropdown.)

### Group / link selected (`.g_panel` tray)

| ID | Tool | Shortcut |
|----|------|----------|
| `tool_ungroup` | Ungroup | — |

### Path Node Editing Tools (`.path_node_panel`, shown in pathedit mode)

Stays in the top bar (it is a transient mode toolbar, not a property).

| ID | Control |
|----|---------|
| `tool_node_link` | Link/unlink control points |
| `path_node_x` / `path_node_y` | Node X / Y coordinate |
| `seg_type` | Segment type: Straight (4) / Curve (6) |
| `tool_node_clone` | Clone node |
| `tool_node_delete` | Delete node |
| `tool_openclose_path` | Toggle open / closed path |
| `tool_add_subpath` | Add sub-path |

---

## Bottom Panel — Colors (`src/editor/panels/BottomPanel.html`)

Pure color controls only. Stroke geometry, opacity and zoom moved out (see above + the
Design tab below).

| ID | Control | Notes |
|----|---------|-------|
| `fill_color` | Fill color swatch | Opens color picker; shows `none` swatch for no fill |
| `stroke_color` | Stroke color swatch | Same picker |
| `bg_color` | Background color | Sets canvas background — paints both the document rect (for export) and the surrounding `#svgcanvas` surface for a uniform look |
| `palette` | Color palette | Quick color swatches |

---

## Right Side Panel — Properties (`src/editor/panels/RightPanel.html`)

Tabbed (`#sidepanel_tabs`): **Design · Text · Effects · Layers**. `RightPanel.js`
`activateTab(name)` toggles `.active` on the tab buttons and `.sidepanel_tabpanel`
containers (`#tab_design`/`#tab_text`/`#tab_effects`/`#tab_layers`).
`autoSelectTab(elem, multi)` (called at the end of `updateContextPanel`) switches to
**Text** for text selections and back to **Design** for others. Sections inside tabs
keep their original contextual classes (`rect_panel`, `text_panel`, `selected_panel`,
`multiselected_panel`, …) so the existing show/hide logic is unchanged; an inactive tab
container simply hides everything inside it.

### Design tab (`#tab_design`)

| Section (class/id) | Shown when | Controls |
|--------------------|-----------|----------|
| `#sidepanel_general` | single element | `elem_id`, `elem_class`, `angle` (rotation −180…180°), `selected_x`, `selected_y` (x/y hidden for line/circle/ellipse/polygon/arc) |
| `.rect_panel` | `<rect>` | `rect_width`, `rect_height`, `rect_rx` |
| `.image_panel` | `<image>` | `image_width`, `image_height`, `image_url` |
| `.circle_panel` | `<circle>` (or circle-arc path) | `circle_cx`, `circle_cy`, `circle_r`, `circle_arc` |
| `.ellipse_panel` | `<ellipse>` | `ellipse_cx`, `ellipse_cy`, `ellipse_rx`, `ellipse_ry` |
| `.line_panel` | `<line>` | `line_x1`, `line_y1`, `line_x2`, `line_y2` |
| Stroke & Opacity *(always shown in tab)* | always | `stroke_width` (0–99), `opacity` (0–100%), `stroke_style` (dash), `stroke_linejoin`, `stroke_linecap`. **Moved from bottom panel**; `change` listeners bound in `TopPanel.init` (delegate to `bottomPanel` handlers) |
| `#marker_panel` "Markers" | single line/polyline/path/polygon | `start_marker_list_opts`, `mid_marker_list_opts`, `end_marker_list_opts` (None / arrows / triangle / diamond / open-V / box / circle / star / X / slashes, open + filled). Injected by ext-markers right after Stroke & Opacity; visibility self-managed via its `selectedChanged`, independent of `updateContextPanel` |
| `.selected_panel` "Object" | single element | `tool_topath`, `tool_path_offset` (`<se-offset-settings>` popover → `svgCanvas.offsetPath(delta)`), `tool_stroke_to_path` (→ `svgCanvas.strokeToPath()`), `tool_reorient`, `tool_make_link`; nested `.container_panel` (`g_title`), `.use_panel` (`tool_unlink_use`), `.a_panel` (`link_url`) |
| `.multiselected_panel` "Combine" | 2+ elements | `tool_bool_union/intersect/subtract/exclude/divide`, `tool_clip_set`, `tool_mask_set`, `tool_make_link_multi` (boolean ops & clip/mask require exactly 2; `divide` produces two separate path pieces) |

### Text tab (`#tab_text`)

| Section | Shown when | Controls |
|---------|-----------|----------|
| `.text_panel` "Text Style" | `<text>` (or all-text multi) | `tool_bold` (B), `tool_italic` (I), `tool_text_decoration_underline/linethrough/overline`, `tool_font_family` (`<se-font-select>`, Google-style search + per-font previews; ext-fonts appends downloaded fonts), `tool_font_library` (`<se-font-library>`, Google Fonts browser + embed-on-export), `font_size` (1–1000), `tool_text_anchor` (start/middle/end) |
| `#sidepanel_text` "Spacing & Shape" | `<text>` (or all-text multi) | `tool_letter_spacing`, `tool_word_spacing`, `tool_text_length` (`textLength`), `tool_length_adjust`, `tool_perspective_x/y` |

### Effects tab (`#tab_effects`)

| Section | Shown when | Controls |
|---------|-----------|----------|
| `.selected_panel` "Blur" | single element | `blur` (0–100, ×10 internally) |
| `#clipmask_panel` | element has `clip-path`/`mask` | `clipmask_feather` (−50…50; +soft edge / −rim; applying to a hard clip auto-converts to a mask), `clipmask_release` |
| `#shadow_panel` | injected by ext-shadow | see ext-shadow below |
| `#color_shift_panel` | injected by ext-color-shift | see ext-color-shift below |

ext-shadow and ext-color-shift now inject into `#tab_effects` (falling back to
`#sidepanel_content`).

---

## Layers Panel — Layers tab (`#tab_layers` in `src/editor/panels/RightPanel.html`)

| ID | Control |
|----|---------|
| `layer_new` | Create new layer |
| `layer_delete` | Delete current layer |
| `layer_rename` | Rename current layer |
| `layer_up` | Move layer up in stack |
| `layer_down` | Move layer down in stack |
| `layer_moreopts` | More options menu |
| *(layer list)* | Layer rows with visibility toggle + name |
| `selLayerNames` | Move selected elements to another layer |

---

## Main Menu (`src/editor/MainMenu.js`)

| ID | Item | Shortcut |
|----|------|----------|
| `tool_export` | Export (PNG / JPG / WebP / PDF) | — |
| `tool_editor_prefs` | Editor Preferences | — |

---

## Extension-Provided Tools

### ext-polystar — Star & Polygon (`extensions/ext-polystar/`)
Flying button (left panel):
- **Star tool** (`tool_star`): Context panel shows Points / Pointy (pointiness) / Shift (radial shift). All three fields live-rebuild the selected star's `points` via the shared `applyStarAttr`/`buildStarPoints` helpers (not just on next draw); `buildStarPoints` excludes the closing duplicate vertices when finding the centroid so live edits don't drift the shape. Labels are kept short and fields width-capped (58px, see css-rules) so the panel stays on one toolbar row down to ~1250px wide.
- **Polygon tool** (`tool_polygon`): Context panel shows Sides count

### ext-shapes — Shape Library (`extensions/ext-shapes/`)
- **Shape Library** (`tool_shapelib`): Opens modal with categorized pre-made SVG shapes

### ext-connector — Connector Lines (`extensions/ext-connector/`)
- Adds a connector drawing mode for creating auto-updating diagram connector lines between objects
- **Connector context panel** (`#connector_panel`, injected into the Design tab, shown via `showPanel` only when a single connector is selected) with three `se-button`s:
  - **Straight** (`connroute_straight`) / **Elbow** (`connroute_elbow`): routing mode toggle. Mode is stored on the connector as the `se:conn_mode` attribute (`'straight'` default | `'elbow'`). All geometry flows through `routeConnector`/`computeConnectorPoints`: straight = 3-point collinear polyline; elbow = 4-point orthogonal "Z" route attaching at the facing box sides (note: elbow carries two interior vertices, so `marker-mid` renders at both bends).
  - **Leader** (`connleader`, `applyLeaderPreset`): one-click callout preset — thins the stroke to 1 and places a small filled dot (`mcircle`) at the target end by reusing the ext-markers picker (dispatches `change` on `#end_marker_list_opts`).
  - ⚠️ Panel button IDs must **not** start with `conn_` — that prefix is reserved for connector elements (`[id^="conn_"]`).

### ext-grid — Grid Settings (`extensions/ext-grid/`)
- **Grid settings** (`grid_settings`, `<se-grid-settings>`): popover with show-grid + snap-to-grid toggles, grid **shape** select, grid color, and snapping step. Replaces the old `view_grid` toggle button.
- Shapes: `square` (canvas→PNG `<pattern>` tile, zoom-adjusted), plus `isometric`, `triangle`, `perspective1`, `perspective2` (drawn as `<line>`s into `#gridLines` over the canvas extent; redrawn on zoom and on canvas resize via `svgEditor.updateGrid`).
- Snapping is shape-aware (`snapPointToGrid` in `utilities.js`): square/perspective snap per-axis; isometric/triangle snap to lattice nodes. The line-grid spacing is `step·sin(60°)` so visible intersections coincide with snap nodes.
- Settings persist via the `grid_*` prefs (see `ConfigObj.seedGridConfigFromPrefs`).

### ext-markers — Line Markers (`extensions/ext-markers/`)
- Injects the **Markers** section (`#marker_panel`) into the right-panel **Design tab**, right after Stroke & Opacity (falls back to `#tools_top` if the tab is missing). Three `se-list` pickers — **Start**, **Mid**, **End** — for a single selected line/polyline/path/polygon
- Marker options: None, Left Arrow, Right Arrow, Triangle, Diamond, Open Arrow (V), Box, Circle, Star, X, and Forward/Reverse/Vertical Slash. Filled shapes (arrows, triangle, diamond, box, circle, star) also have open `_o` variants. Open-stroke types (`openarrow`, slashes, `xmark`) are forced `fill:none` via the `strokeOnly` set so SVG doesn't auto-close them.
- Marker geometry is defined in the `markerTypes` map (100×100 box, forward = +x); each type needs a matching icon in `src/editor/images/<id>.svg`
- Panel show/hide is self-managed in the extension's `selectedChanged` (`showPanel`), independent of `updateContextPanel`

### ext-cutter — Knife/Cut Tool (`extensions/ext-cutter/`)
- **Cutter** (`tool_cutter`): Drag a straight line across shapes to split them along that line; affects selected shapes only (or all shapes if nothing selected)

### ext-curvature — Curvature Tool (`extensions/ext-curvature/`)
- **Curvature** (`tool_curvature`): Click to place anchor points; smooth curves are auto-computed. Shift+click for a sharp corner anchor. Double-click (or Escape) to finalize open; click near start to close the path.
- **Curve mode selector** (`curvature_mode`, a `se-select` in the `#curvature_panel` tray): chooses the smoothing math — **Catmull-Rom** (default, interpolating — passes through every click), **B-spline** (approximating cage; clamped to the first/last click; dependency-free), or **Spiro** (clothoid/curvature-continuous via the `spiro` npm package). The tray shows only while the tool is active and the choice persists via the `curvatureMode` pref. Builders live in `ext-curvature.js` (`buildCatmullRom` / `buildBSpline` / `buildSpiro`), dispatched by `buildPathD`.

### ext-panning — Pan Tool (`extensions/ext-panning/`)
- Hand/pan tool added to left panel after zoom; activates canvas panning mode

### ext-overview_window — Mini Map (`extensions/ext-overview_window/`)
- Mini canvas preview (`overviewMiniView`) in side panel; draggable viewport indicator

### ext-opensave — File I/O (`extensions/ext-opensave/`)
- Open SVG, Save SVG, Clear canvas, Import image (drag-drop supported), Append SVG

### ext-storage — Auto-save (`extensions/ext-storage/`)
- Silently persists drawing to `localStorage`; prompts on reload to restore session

### ext-theme-toggle — Theme Switch (`extensions/ext-theme-toggle/`)
- Button to toggle light ↔ dark theme (wraps `themeUtil.applyTheme()`)

### ext-color-shift — Color Shift (`extensions/ext-color-shift/`)
- Adds a "Color Shift" section to the right side panel (below the Layers section, inside `#sidepanel_content`)
- Controls: **H** (`color_shift_h`, −180 to 180°), **S** (`color_shift_s`, ±100), **L** (`color_shift_l`, ±100), **T** (`color_shift_t`, ±100 — positive = more transparent), **Fill** / **Stroke** checkboxes (`color_shift_fill` / `color_shift_stroke`, both on by default), **Reset** button (`color_shift_reset`)
- Each input commit shifts the selection by a *relative delta* against a per-selection snapshot (captured on every `selectedChanged` and on Reset). Snapshot lives in a `WeakMap` keyed by element node so multi-select with mismatched starting colours still shifts each element correctly
- Writes `fill`, `stroke`, `fill-opacity`, `stroke-opacity` attributes; uses `BatchCommand + ChangeElementCommand` so each input commit is one undo step
- Empty-state hint is shown when nothing paintable is selected (skips `<g>`, `<svg>`, `<defs>`)

### ext-shadow — Drop Shadow (`extensions/ext-shadow/`)
- Adds a "Shadow" section to the right side panel (`#shadow_panel`, inside `#sidepanel_content`)
- Shown for any single selected element (all shape types)
- Controls: **Angle ∠** (`shadow_angle`, 0–359°, clockwise from 12 o'clock), **Length L** (`shadow_length`, 0–500 px stretch), **Blur** (`shadow_blur`), **Opacity** (`shadow_opacity`), **Color** (`shadow_color`), **Remove** button (`shadow_remove`)
- Angle + Length are the UI representation; internally converted to `dx`/`dy` on `feDropShadow`. Existing SVG files with raw `dx`/`dy` load and display correctly.
- Clock reference: 90°=3 o'clock, 150°=5 o'clock, 180°=6 o'clock (straight down), 240°=8 o'clock, 300°=10 o'clock
- Sunset/long-shadow recipe: Angle ~180°, Length 100–300, Blur 1–3
- Creates a `<filter id="{elemId}_shadow" filterUnits="userSpaceOnUse">` with a single `<feDropShadow>` in `<defs>`; filter region is computed from `getBBox()` + padding so long shadows are never clipped
- **Limitation:** SVG's `filter` attribute can only reference one `<filter>`. Applying shadow saves any existing filter URL and restores it on removal — shadow and blur cannot coexist simultaneously. If the element is resized after shadow is applied, re-apply the shadow to refresh the filter region.

### ext-fonts — Custom Fonts (`extensions/ext-fonts/`)
- Adds the `<se-font-library>` button (`tool_font_library`) to the text panel, beside the font-family select
- Opens a Google Fonts browser popover (search + category chips: Handwriting / Sans-serif / Serif / Display / Monospace) from a bundled static catalog (`google-fonts-catalog.json`, the full ~1,934-family list generated from Google's `fonts.google.com/metadata/fonts`) — browsing/searching needs no network
- Font names preview in their own typeface: as rows scroll into view an `IntersectionObserver` lazily injects a `text=`-subsetted Google Fonts `<link>` (a few KB, just the name's glyphs) into `document.head`. Needs network for the preview; offline, names stay in the UI font until downloaded
- Picking a font: `fontStore.ensureFont()` fetches the WOFF2 once via the Google Fonts CSS2 API, stores it in IndexedDB (`svgedit-fonts` DB), registers it with `document.fonts` (live canvas render) and the canvas font registry (`svgCanvas.setEncodableFont`). After the one-time download it works fully offline
- On startup ext-fonts calls `restoreAll()` to re-register every cached font and re-add it to the `tool_font_family` dropdown
- **Embed-on-export:** `core/svg-exec.js` `embedUsedFonts()` injects a `<style>` with one base64 `@font-face` per *used* font into `<defs>` (gated on `getSvgOptionApply()`, mirrors the image-embed path). Family names are emitted **unquoted** with no `format()` so the payload has no XML-special chars and survives serialization. The `<style>` is removed right after serialization (live doc untouched). Fonts not referenced by any text are not embedded
- `fontStore.js` is imported **only** by `seFontLibrary.js` so it stays a single bundled module instance; `ext-fonts.js` is DOM-only and reaches it via the element's `restoreCachedFonts()` method

---

## Keyboard Shortcut Reference

| Key | Tool / Action |
|-----|--------------|
| S | Select tool |
| Z | Zoom tool |
| Q | Freehand pencil |
| L | Line |
| P | Path |
| R | Rectangle |
| E | Ellipse |
| T | Text |
| F | Wireframe mode |
| U | Edit SVG source |
| D | Clone element |
| C | Clone (multi-select) |
| G | Group elements |
| B | Bold (text) |
| I | Italic (text) |
| Delete / Backspace | Delete selected |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+Shift+] | Bring to front |
| Ctrl+Shift+[ | Send to back |
