# SVGedit User-Facing Tools

> **How to use this doc:** Look up tools by panel location. Each entry shows the element ID (for JS code lookup), purpose, and keyboard shortcut. Extension-provided tools are in a separate section at the bottom.

_Last verified: 2026-05-28_ *(updated: ext-eyedropper removed from left panel; eyedropper now lives inside color picker dialogs)*

---

## Left Panel — Drawing Tools (`src/editor/panels/LeftPanel.html`)

The left panel is a vertical column of tool buttons. Some are "flying buttons" (`se-flying-button`) with multiple sub-tool variants selectable from a flyout.

| ID | Tool | Shortcut | Notes |
|----|------|----------|-------|
| `tool_select` | Select / pointer | S | Select, move, resize existing elements |
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

## Top Panel — Editing & Attribute Tools (`src/editor/panels/TopPanel.html`)

The top panel is a horizontal flex bar. Sections are shown/hidden based on what is selected.

### Always-visible

| ID | Tool | Shortcut | Notes |
|----|------|----------|-------|
| `tool_source` | Edit SVG source | U | Opens raw SVG code editor |
| `tool_wireframe` | Wireframe mode | F | Toggle outline-only rendering |
| `tool_undo` | Undo | Ctrl+Z | Disabled until history exists |
| `tool_redo` | Redo | Ctrl+Y | Disabled until undo exists |

### Single-element selected (`.selected_panel`)

| ID | Tool | Shortcut |
|----|------|----------|
| `tool_clone` | Clone element | D |
| `tool_delete` | Delete element | Delete / Backspace |
| `tool_move_top` | Bring to front | Ctrl+Shift+] |
| `tool_move_bottom` | Send to back | Ctrl+Shift+[ |
| `tool_topath` | Convert to path | — |
| `tool_reorient` | Reorient path | — |
| `tool_make_link` | Make hyperlink | — |
| `tool_flip_h` | Flip horizontal | — |
| `tool_flip_v` | Flip vertical | — |
| `elem_id` *(input)* | Element ID field | — |
| `elem_class` *(input)* | Element class field | — |
| `angle` *(spin)* | Rotation angle | — | −180 to 180°, step 5 |
| `blur` *(spin)* | Gaussian blur | — | 0–100, step 5 (×10 internally) |
| `tool_position` *(list)* | Align to page | — | L/C/R/T/M/B + distribute H/V |
| `selected_x` *(spin)* | X position | — | Hidden for line, path, text, group |
| `selected_y` *(spin)* | Y position | — | Hidden for line, path, text, group |

### Multiple elements selected (`.multiselected_panel`)

| ID | Tool | Shortcut |
|----|------|----------|
| `tool_clone_multi` | Clone all | C |
| `tool_delete_multi` | Delete all | Delete / Backspace |
| `tool_group_elements` | Group | G |
| `tool_make_link_multi` | Make hyperlink | — |
| `tool_align_left` | Align left edges | — |
| `tool_align_center` | Align centers H | — |
| `tool_align_right` | Align right edges | — |
| `tool_align_top` | Align top edges | — |
| `tool_align_middle` | Align centers V | — |
| `tool_align_bottom` | Align bottom edges | — |
| `tool_align_distrib_horiz` | Distribute horizontally | — |
| `tool_align_distrib_verti` | Distribute vertically | — |
| `tool_align_relative` *(select)* | Alignment reference | — | selected / largest / smallest / page |
| `tool_bool_union` | Boolean union | — | Merge shapes |
| `tool_bool_intersect` | Boolean intersect | — | Keep overlap only |
| `tool_bool_subtract` | Boolean subtract | — | Cut top from bottom |

### Shape-specific panels (shown when element of that type is selected)

| Panel class | Shape | Controls |
|-------------|-------|---------|
| `.rect_panel` | `<rect>` | `rect_width`, `rect_height`, `rect_rx` (corner radius) |
| `.image_panel` | `<image>` | `image_width`, `image_height`, `image_url` |
| `.circle_panel` | `<circle>` | `circle_cx`, `circle_cy`, `circle_r` |
| `.ellipse_panel` | `<ellipse>` | `ellipse_cx`, `ellipse_cy`, `ellipse_rx`, `ellipse_ry` |
| `.line_panel` | `<line>` | `line_x1`, `line_y1`, `line_x2`, `line_y2` |
| `.text_panel` | `<text>` | See Text Tools below |
| `.container_panel` | `<g>` + `<use>` | `g_title` (label) |
| `.use_panel` | `<use>` | `tool_unlink_use` |
| `.g_panel` | `<g>` | `tool_ungroup` |
| `.a_panel` | `<a>` | `link_url` (text input) |
| `.path_node_panel` | `<path>` (in pathedit mode) | Path node editing tools (see below) |

### Text Tools (`.text_panel`, shown when `<text>` is selected)

| ID | Control | Shortcut | Notes |
|----|---------|----------|-------|
| `tool_bold` | Bold | B | Toggles `font-weight` |
| `tool_italic` | Italic | I | Toggles `font-style` |
| `tool_text_decoration_underline` | Underline | — | |
| `tool_text_decoration_linethrough` | Strikethrough | — | |
| `tool_text_decoration_overline` | Overline | — | |
| `tool_font_family` *(select)* | Font family | — | Serif, Sans-serif, Cursive, Fantasy, Monospace, Courier, Helvetica, Times |
| `font_size` *(spin)* | Font size | — | 1–1000px, step 1 |
| `tool_text_anchor` *(list)* | Text alignment | — | start / middle / end |
| `tool_letter_spacing` *(spin)* | Letter spacing | — | 0–100, step 1 |
| `tool_word_spacing` *(spin)* | Word spacing | — | 0–1000, step 1 |
| `tool_text_length` *(spin)* | Text length | — | 0–1000 (sets `textLength` attr) |
| `tool_length_adjust` *(select)* | Length adjust | — | spacing / spacingAndGlyphs |
| `tool_perspective_x` *(spin)* | Perspective X | — | −80 to 80, step 1 |
| `tool_perspective_y` *(spin)* | Perspective Y | — | −80 to 80, step 1 |

### Path Node Editing Tools (`.path_node_panel`, shown in pathedit mode)

| ID | Control |
|----|---------|
| `tool_node_link` | Link/unlink control points |
| `path_node_x` | Node X coordinate |
| `path_node_y` | Node Y coordinate |
| `seg_type` | Segment type: Straight (4) / Curve (6) |
| `tool_node_clone` | Clone node |
| `tool_node_delete` | Delete node |
| `tool_openclose_path` | Toggle open / closed path |
| `tool_add_subpath` | Add sub-path |

---

## Bottom Panel — Paint & Zoom (`src/editor/panels/BottomPanel.html`)

| ID | Control | Notes |
|----|---------|-------|
| `zoom` | Zoom dropdown | 25%, 50%, 100%, 200%, 400%, 1000%, Fit to Canvas, Fit to Selection, Fit to Layer, Fit to All |
| `fill_color` | Fill color swatch | Opens color picker; shows `none` swatch for no fill |
| `stroke_color` | Stroke color swatch | Same picker |
| `bg_color` | Background color | Sets canvas background |
| `palette` | Color palette | Quick color swatches |
| `stroke_width` *(spin)* | Stroke width | 0–99; Shift+click steps by 0.1 |
| `stroke_style` *(select)* | Stroke dash pattern | Solid, Dotted, Dashed, Dash-dot, Dash-dot-dot |
| `stroke_linejoin` *(list)* | Line join | Miter / Round / Bevel |
| `stroke_linecap` *(list)* | Line cap | Butt / Round / Square |
| `opacity` *(spin)* | Element opacity | 0–100%, step 5 |

---

## Layers Panel (`src/editor/panels/LayersPanel.html`)

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
| `tool_docprops` | Document Properties | Shift+D |
| `tool_editor_prefs` | Editor Preferences | — |
| `tool_editor_homepage` | SVG-Edit homepage link | — |

---

## Extension-Provided Tools

### ext-polystar — Star & Polygon (`extensions/ext-polystar/`)
Flying button (left panel):
- **Star tool** (`tool_star`): Context panel shows Points count, Radius Multiplier, Radial Shift
- **Polygon tool** (`tool_polygon`): Context panel shows Sides count

### ext-shapes — Shape Library (`extensions/ext-shapes/`)
- **Shape Library** (`tool_shapelib`): Opens modal with categorized pre-made SVG shapes

### ext-connector — Connector Lines (`extensions/ext-connector/`)
- Adds a connector drawing mode for creating auto-updating diagram connector lines between objects

### ext-grid — Grid Toggle (`extensions/ext-grid/`)
- **Toggle Grid** (`view_grid`): Show/hide a snapping grid overlay; resolution auto-adjusts with zoom

### ext-markers — Line Markers (`extensions/ext-markers/`)
- Context panel on lines/polylines/paths/polygons: **Marker Start**, **Marker Middle**, **Marker End**
- Marker options: None, Left Arrow, Right Arrow, Box, Circle (all with open/filled variants)

### ext-cutter — Knife/Cut Tool (`extensions/ext-cutter/`)
- **Cutter** (`tool_cutter`): Drag a straight line across shapes to split them along that line; affects selected shapes only (or all shapes if nothing selected)

### ext-curvature — Curvature Tool (`extensions/ext-curvature/`)
- **Curvature** (`tool_curvature`): Click to place anchor points; smooth Bézier curves are auto-computed via Catmull-Rom. Double-click for a corner point. Click near start to close path. Escape to finalize open.

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

### ext-shadow — Drop Shadow (`extensions/ext-shadow/`)
- Context panel shown for any single selected element (all shape types)
- Controls: **Angle ∠** (`shadow_angle`, 0–359°, clockwise from 12 o'clock), **Length L** (`shadow_length`, 0–500 px stretch), **Blur** (`shadow_blur`), **Opacity** (`shadow_opacity`), **Color** (`shadow_color`), **Remove** button (`shadow_remove`)
- Angle + Length are the UI representation; internally converted to `dx`/`dy` on `feDropShadow`. Existing SVG files with raw `dx`/`dy` load and display correctly.
- Clock reference: 90°=3 o'clock, 150°=5 o'clock, 180°=6 o'clock (straight down), 240°=8 o'clock, 300°=10 o'clock
- Sunset/long-shadow recipe: Angle ~180°, Length 100–300, Blur 1–3
- Creates a `<filter id="{elemId}_shadow" filterUnits="userSpaceOnUse">` with a single `<feDropShadow>` in `<defs>`; filter region is computed from `getBBox()` + padding so long shadows are never clipped
- **Limitation:** SVG's `filter` attribute can only reference one `<filter>`. Applying shadow saves any existing filter URL and restores it on removal — shadow and blur cannot coexist simultaneously. If the element is resized after shadow is applied, re-apply the shadow to refresh the filter region.

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
| Shift+D | Document Properties |
