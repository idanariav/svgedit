# SVGedit Editable Attributes per Object Type

> **How to use this doc:** Find the SVG element type you're working with and see which panel controls appear and which SVG attributes they map to. "Common attributes" (fill, stroke, opacity, etc.) apply to all shapes — see the Common section at the bottom.

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

## `<rect data-frame>` — Frame (export region)

A frame is an ordinary `<rect>` tagged `data-frame="1"` (drawn with the top-panel
`tool_frame`). It marks a region for partial export; it's never part of an exported
image (stripped in `core/svg-exec.js`) but **is** saved in the document.

**Panel class:** `.frame_panel` (shown in addition to the normal `.rect_panel`).

| Control ID | Maps to DOM | Notes |
|------------|-------------|-------|
| `frame_name` | `<title>` child | Export-region label (default `Frame N`). Wired in `EditorStartup.js` to `svgCanvas.setGroupTitle()` (same `<title>`+undo mechanism as group labels) — **not** `attrChanger`. Populates the export dialog's region picker |

`updateContextPanel` shows `.frame_panel` when `tagName === 'rect' && elem.hasAttribute('data-frame')`. Width/height/radius still come from the shared `.rect_panel`. Plus [common attributes](#common-attributes-all-shapes).

---

## `<circle>` — Circle

**Panel class:** `.circle_panel` (split across two `<div>`s)

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `circle_cx` | `cx` | `cx` | Center X |
| `circle_cy` | `cy` | `cy` | Center Y |
| `circle_r` | `r` | `r` | Radius |
| `circle_arc` | _(none — custom handler)_ | _(see below)_ | Arc span in degrees, 1–360 (default 360) |

`circle_arc` is handled by `changeCircleArc` → `svgCanvas.setCircleArc()` in [elem-get-set.js](../packages/svgcanvas/core/elem-get-set.js). It does **not** use `attrChanger`. When arc < 360 the element is converted to a `<path data-arc>` (see below).

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** (position expressed as cx/cy).

---

## `<path data-arc>` — Circle Arc (partial circle / pie sector)

When a circle's arc is set below 360°, the `<circle>` is replaced by a `<path>` that stores the circle geometry in `data-*` attributes and renders a symmetric pie-sector shape (pacman / half-circle / wedge).

**Panel class:** `.circle_panel` — same panel as `<circle>`, populated from `data-*` attributes.

| Control ID | Maps to DOM | Notes |
|------------|-------------|-------|
| `circle_cx` | `data-cx` | Center X; `attrChanger` routes to `setCircleArcAttr` |
| `circle_cy` | `data-cy` | Center Y; `attrChanger` routes to `setCircleArcAttr` |
| `circle_r` | `data-r` | Radius; `attrChanger` routes to `setCircleArcAttr` |
| `circle_arc` | `data-arc` | Arc degrees; handled by `changeCircleArc` / `setCircleArc` |

The `d` attribute is computed by `computeCircleArcPathD(cx, cy, r, arc)` (symmetric pie sector, mouth centred at 3-o'clock). Setting arc back to 360 converts the `<path>` back to a `<circle>`.

**No x/y panel** (position expressed via cx/cy). **No "reorient path"** button (arc paths are not freehand paths). Can still be rotated/styled like any other element.

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
| `#text` *(hidden input)* | text | text content | Not shown in UI (offscreen via `#text` in svgedit.css); the text-edit key buffer wired by `textActions.setInputElem`. Lives at the **editor root** (`editorTemplate.html`), not inside a panel, so it stays focusable when a panel is hidden — e.g. tablet mode (`#tools_top` is `display:none`, and `focus()` on a `display:none` subtree is a no-op) |

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
| `elem_class` | `class` | **`<se-class-select>`** style-preset picker (not free text). Scope-filtered dropdown of saved classes + save/update popover + delete. Picking a class **stamps the preset's captured attributes inline** onto the selection (one undo step) and tags `class="<name>"`. Does **not** go through `attrChanger` — see `seClassSelect.js` / `classLibrary.js` |
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

Clone, Delete, Group, Hyperlink, Align L/C/R/T/M/B, Distribute H/V, Boolean ops (Union / Intersect / Subtract), **Set Clip / Set Mask** (`tool_clip_set` / `tool_mask_set` — require exactly 2 selected)

### Clip / Mask (`clip-path`, `mask` attributes)

| Control ID | SVG Attribute | Notes |
|------------|---------------|-------|
| `tool_clip_set` | `clip-path` on the **top** shape; **bottom** shape cloned into a `<clipPath>` in `<defs>` (bottom stays visible) | Exactly 2 selected; top panel; see `core/clip-mask.js` |
| `tool_mask_set` | `mask` on the **top** shape; white-luminance clone of the **bottom** shape in a `<mask>` in `<defs>` | Exactly 2 selected; top panel |
| `clipmask_feather` | `data-feather` on the element + inline `filter:blur()` on the mask silhouette (negative also sets a white stroke band + grey fill) | Right panel `#clipmask_panel`; −50…50; auto-converts a clip to a mask |
| `clipmask_release` | removes `clip-path`/`mask` and discards the clone definition | Right panel `#clipmask_panel`; section hidden unless the element has a `clip-path`/`mask` attr |

These are **action buttons**, not `attrChanger`-driven inputs — they call `svgCanvas.setClip()` / `setMask()` / `releaseClipMask()` directly.

---

## How Attribute Changes Are Applied

All shape-specific spin/input controls carry a `data-attr` attribute on the element.
The `attrChanger` function in `TopPanel.js` (~line 641):
1. Reads `data-attr` from the fired input
2. Validates the value with `isValidUnit()`
3. Converts units if the canvas is not in px mode
4. Calls `svgCanvas.changeSelectedAttribute(attr, value)`

The `changeSelectedAttribute` method in `packages/svgcanvas/core/elem-get-set.js` applies the change to the live SVG DOM and records it in undo history.

**Exception — `elem_class`:** the class control is the `<se-class-select>`
component, which is intentionally **not** bound to `attrChanger`. Applying a class
builds its own `BatchCommand` of `ChangeElementCommand`s (one undo step) to stamp
the preset's saved attributes plus the `class` token, then refreshes the panels
via `topPanel.update()` + `updateContextPanel()`. Storage/catalog logic lives in
`src/editor/classLibrary.js`.
