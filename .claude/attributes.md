# SVGedit Editable Attributes per Object Type

> **How to use this doc:** Find the SVG element type you're working with and see which panel controls appear and which SVG attributes they map to. "Common attributes" (fill, stroke, opacity, etc.) apply to all shapes — see the Common section at the bottom.

_Last verified: 2026-05-26_

**Code references:**
- Panel markup: [src/editor/panels/TopPanel.html](../src/editor/panels/TopPanel.html)
- Attribute change handler: [src/editor/panels/TopPanel.js](../src/editor/panels/TopPanel.js) ~line 641 (`attrChanger`)
- Paint / opacity: [src/editor/panels/BottomPanel.html](../src/editor/panels/BottomPanel.html)

---

## `<rect>` — Rectangle

**Panel class:** `.rect_panel`

| Control ID | `data-attr` | SVG Attribute | Range / Notes |
|------------|-------------|---------------|---------------|
| `rect_width` | `width` | `width` | Numeric, px |
| `rect_height` | `height` | `height` | Numeric, px |
| `rect_rx` | `Corner Radius` | `rx` | 0–1000, step 1 |

Plus [common attributes](#common-attributes-all-shapes) including **x/y position**.

---

## `<circle>` — Circle

**Panel class:** `.circle_panel` (split across two `<div>`s)

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `circle_cx` | `cx` | `cx` | Center X |
| `circle_cy` | `cy` | `cy` | Center Y |
| `circle_r` | `r` | `r` | Radius |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** (position expressed as cx/cy).

---

## `<ellipse>` — Ellipse

**Panel class:** `.ellipse_panel` (split across two `<div>`s)

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `ellipse_cx` | `cx` | `cx` | Center X |
| `ellipse_cy` | `cy` | `cy` | Center Y |
| `ellipse_rx` | `rx` | `rx` | Horizontal radius |
| `ellipse_ry` | `ry` | `ry` | Vertical radius |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** (position expressed as cx/cy).

---

## `<line>` — Line

**Panel class:** `.line_panel`

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `line_x1` | `x1` | `x1` | Start point X |
| `line_y1` | `y1` | `y1` | Start point Y |
| `line_x2` | `x2` | `x2` | End point X |
| `line_y2` | `y2` | `y2` | End point Y |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** (no position concept for lines).

**Extension:** `ext-markers` adds **Marker Start / Middle / End** dropdowns for arrowhead decorators.

---

## `<text>` — Text

**Panel class:** `.text_panel`

| Control ID | Type | SVG Attribute / Property | Range / Notes |
|------------|------|--------------------------|---------------|
| `tool_bold` | button (toggle) | `font-weight: bold` | `.pressed` = bold on |
| `tool_italic` | button (toggle) | `font-style: italic` | |
| `tool_text_decoration_underline` | button (toggle) | `text-decoration: underline` | |
| `tool_text_decoration_linethrough` | button (toggle) | `text-decoration: line-through` | |
| `tool_text_decoration_overline` | button (toggle) | `text-decoration: overline` | |
| `tool_font_family` | select | `font-family` | Serif, Sans-serif, Cursive, Fantasy, Monospace, Courier, Helvetica, Times |
| `font_size` | spin | `font-size` | 1–1000, step 1 |
| `tool_text_anchor` | list | `text-anchor` | start / middle / end |
| `tool_letter_spacing` | spin | `letter-spacing` | 0–100, step 1 |
| `tool_word_spacing` | spin | `word-spacing` | 0–1000, step 1 |
| `tool_text_length` | spin | `textLength` | 0–1000 |
| `tool_length_adjust` | select | `lengthAdjust` | `spacing` / `spacingAndGlyphs` |
| `tool_perspective_x` | spin | custom transform | −80 to 80, step 1 |
| `tool_perspective_y` | spin | custom transform | −80 to 80, step 1 |
| `#text` *(hidden input)* | text | text content | Not shown in UI; updated programmatically |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** (text position handled internally).

---

## `<image>` — Embedded Image

**Panel class:** `.image_panel` (split across two `<div>`s)

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `image_width` | `width` | `width` | px |
| `image_height` | `height` | `height` | px |
| `image_url` | `image_url` | `href` / `xlink:href` | URL text input |

Plus [common attributes](#common-attributes-all-shapes) including **x/y position**.

---

## `<path>` — Path

In **normal select mode**, the path shows common attributes only (no dedicated panel).

In **pathedit mode** (double-click a path), the `.path_node_panel` appears:

| Control ID | `data-attr` | Notes |
|------------|-------------|-------|
| `path_node_x` | `x` | Selected node X coordinate |
| `path_node_y` | `y` | Selected node Y coordinate |
| `seg_type` | — | Segment type: Straight (value=4) / Curve (value=6) |
| `tool_node_link` | — | Link/unlink bezier control handles |
| `tool_node_clone` | — | Clone the selected node |
| `tool_node_delete` | — | Delete the selected node |
| `tool_openclose_path` | — | Toggle open/closed subpath |
| `tool_add_subpath` | — | Add a new sub-path |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** in select mode.

---

## `<g>` — Group

**Panel classes:** `.container_panel` + `.g_panel`

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `g_title` | `title` | `<title>` child element | Group label |
| `tool_ungroup` | — | — | Dissolves the group |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel**.

---

## `<use>` — Use Reference (Symbol Instance)

**Panel classes:** `.container_panel` + `.use_panel`

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `g_title` | `title` | `<title>` child | Read-only label |
| `tool_unlink_use` | — | — | Makes a unique copy, breaks `<use>` link |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel**.

---

## `<a>` — Anchor / Hyperlink

**Panel class:** `.a_panel`

| Control ID | Attribute | Notes |
|------------|-----------|-------|
| `link_url` *(raw `<input>`)* | `href` | URL text field |

Plus [common attributes](#common-attributes-all-shapes).

---

## `<polyline>` and `<polygon>`

No dedicated panel — these shapes show only [common attributes](#common-attributes-all-shapes). **No x/y panel** (excluded in TopPanel.js ~line 235).

**Extension:** `ext-markers` adds Marker Start / Middle / End controls.

---

## Common Attributes (All Shapes)

These controls are always available when any element is selected.

### Top Panel (always visible when element selected)

| Control ID | SVG Attribute / Property | Range |
|------------|--------------------------|-------|
| `elem_id` | `id` | Free text |
| `elem_class` | `class` | Free text |
| `angle` | `transform: rotate(…)` | −180 to 180°, step 5 |
| `blur` | `filter: blur(…)` | 0–100, step 5 (multiplied ×10 to compute σ) |
| `tool_position` | `transform` | Align to page: L/C/R/T/M/B + distribute H/V |
| `selected_x` | `x` | Position X — **hidden for**: line, path, text, g, use, polyline, polygon |
| `selected_y` | `y` | Position Y — same exclusions as above |

### Bottom Panel (always visible)

| Control ID | SVG Attribute | Range / Notes |
|------------|---------------|---------------|
| `fill_color` | `fill` | Color picker (includes "none") |
| `stroke_color` | `stroke` | Color picker |
| `stroke_width` | `stroke-width` | 0–99, step 1; Shift+click = step 0.1 |
| `stroke_style` | `stroke-dasharray` | Solid / Dotted / Dashed / Dash-dot / Dash-dot-dot |
| `stroke_linejoin` | `stroke-linejoin` | Miter / Round / Bevel |
| `stroke_linecap` | `stroke-linecap` | Butt / Round / Square |
| `opacity` | `opacity` | 0–100%, step 5 |

### Multi-select (when ≥2 elements selected)

Clone, Delete, Group, Hyperlink, Align L/C/R/T/M/B, Distribute H/V, Boolean ops (Union / Intersect / Subtract)

---

## How Attribute Changes Are Applied

All shape-specific spin/input controls carry a `data-attr` attribute on the element.
The `attrChanger` function in `TopPanel.js` (~line 641):
1. Reads `data-attr` from the fired input
2. Validates the value with `isValidUnit()`
3. Converts units if the canvas is not in px mode
4. Calls `svgCanvas.changeSelectedAttribute(attr, value)`

The `changeSelectedAttribute` method in `packages/svgcanvas/core/elem-get-set.js` applies the change to the live SVG DOM and records it in undo history.
