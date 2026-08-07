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

## `<path data-arc>` — Arc (partial circle/ellipse / pie sector)

When a **circle's or ellipse's** arc is set below 360°, the `<circle>`/`<ellipse>`
is replaced by a `<path>` that stores the geometry in `data-*` attributes and
renders a symmetric pie-sector shape (pacman / half-disc / wedge). A single
unified code path covers both shapes — a circle is just the `rx === ry` case.

**Panel class:** `.circle_panel` (when `data-rx === data-ry`) or `.ellipse_panel`
(otherwise) — the same panels as `<circle>`/`<ellipse>`, populated from `data-*`
attributes. `TopPanel.updateContextPanel` picks the panel by comparing the radii.

| Control ID | Maps to DOM | Notes |
|------------|-------------|-------|
| `circle_cx` / `ellipse_cx` | `data-cx` | Center X; `attrChanger` routes to `setCircleArcAttr` |
| `circle_cy` / `ellipse_cy` | `data-cy` | Center Y; `attrChanger` routes to `setCircleArcAttr` |
| `circle_r` | `data-rx` + `data-ry` | Radius (circular arc); an `r` edit sets both radii |
| `ellipse_rx` | `data-rx` | Horizontal radius; routes to `setCircleArcAttr` |
| `ellipse_ry` | `data-ry` | Vertical radius; routes to `setCircleArcAttr` |
| `circle_arc` / `ellipse_arc` | `data-arc` | Arc degrees; both wired to `changeCircleArc` / `setCircleArc` |

The `d` attribute is computed by `computeArcPathD(cx, cy, rx, ry, arc)` (symmetric
pie sector, mouth centred at 3-o'clock; uses SVG's elliptical-arc command with
independent radii). Setting arc back to 360 converts the `<path>` back to a
`<circle>` when `rx === ry`, else to an `<ellipse>`. Legacy arc paths that stored
a single `data-r` are read with `data-r` as a fallback for both radii.

**No x/y panel** (position expressed via cx/cy). Can still be rotated/styled like any other element.

---

## `<ellipse>` — Ellipse

**Panel class:** `.ellipse_panel` (split across two `<div>`s)

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `ellipse_cx` | `cx` | `cx` | Center X |
| `ellipse_cy` | `cy` | `cy` | Center Y |
| `ellipse_rx` | `rx` | `rx` | Horizontal radius |
| `ellipse_ry` | `ry` | `ry` | Vertical radius |
| `ellipse_arc` | _(none — custom handler)_ | _(see below)_ | Arc span in degrees, 1–360 (default 360) |

`ellipse_arc` is wired to the same `changeCircleArc` → `svgCanvas.setCircleArc()` handler as `circle_arc`. When arc < 360 the `<ellipse>` is converted to a `<path data-arc>` (see [Arc](#path-data-arc--arc-partial-circleellipse--pie-sector)).

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
| `tool_text_anchor` | list | `text-anchor` | start / middle / end — **labelled left/center/right** (row alignment); aligns multiline rows since each row `<tspan>` shares the text's `x` |
| `tool_letter_spacing` | spin | `letter-spacing` | 0–100, step 1 |
| `tool_word_spacing` | spin | `word-spacing` | 0–1000, step 1 |
| `tool_text_length` | spin | `textLength` | 0–1000 |
| `tool_length_adjust` | select | `lengthAdjust` | `spacing` / `spacingAndGlyphs` |
| `tool_perspective_x` | spin | custom transform | −80 to 80, step 1 |
| `tool_perspective_y` | spin | custom transform | −80 to 80, step 1 |
| `#text` *(hidden textarea)* | textarea | text content (multiline) | Not shown in UI (offscreen via `#text` in svgedit.css); the text-edit key buffer wired by `textActions.setInputElem`. A **`<textarea>`** (was an `<input>`) so it holds newlines: **Shift+Enter** = new row, **plain Enter** = commit/exit (keydown handler in `EditorStartup.js`). Multiline content renders as one `<tspan>` per row via `setMultilineText`; reads via `getTextWithNewlines` (both in `core/dom-utils.js`). Lives at the **editor root** (`editorTemplate.html`), not inside a panel, so it stays focusable when a panel is hidden — e.g. tablet mode (`#tools_top` is `display:none`, and `focus()` on a `display:none` subtree is a no-op) |

Plus [common attributes](#common-attributes-all-shapes). **No x/y panel** (text position handled internally).

---

## `<image>` — Embedded Image

**Panel class:** `.image_panel` (split across two `<div>`s)

| Control ID | `data-attr` | SVG Attribute | Notes |
|------------|-------------|---------------|-------|
| `image_width` | `width` | `width` | px |
| `image_height` | `height` | `height` | px |
| `image_url` | `image_url` | `href` / `xlink:href` | URL text input |
| `tool_trace_image` | — | — | **Convert to editable SVG** button — vectorizes the raster into editable `<path>`s via `imagetracerjs` (`dialogs/traceImage.js` + `se-trace-dialog`); not an attribute editor |

Plus [common attributes](#common-attributes-all-shapes) including **x/y position**.

---

## `<path>` — Path

In **normal select mode**, the path shows common attributes only (no dedicated panel).

In **pathedit mode** (double-click a path), the `.path_node_panel` appears:

| Control ID | `data-attr` | Notes |
|------------|-------------|-------|
| `seg_type` | — | Segment type: Straight (value=4) / Curve (value=6) |
| `tool_node_link` | — | Link/unlink bezier control handles |
| `tool_node_clone` | — | Clone the selected node |
| `tool_node_delete` | — | Delete the selected node |
| `tool_openclose_path` | — | Toggle open/closed subpath |
| `tool_add_subpath` | — | Add a new sub-path |

`tool_add_subpath` also sets `fill-rule="evenodd"` on the path the first time
it's turned on (see `PathActions.addSubPath` in
`packages/svgcanvas/core/path-actions.js`) — under the default `nonzero`
rule, a subpath drawn with the same winding as the outer contour renders
with its own boundary invisible (paint-order:stroke lets the fill repaint
over it) instead of as a hole.

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
`src/editor/classLibrary.js`. A preset may also carry a `shadow` block
(`{angle,length,blur,opacity,color}`) captured/re-applied via `svgEditor.shadowApi`
(from ext-shadow) — a drop shadow can't be stamped as a flat attribute, so it is
rebuilt per-element into the same undo batch on apply.

**Exception — custom palette swatches (`se-palette` / `BottomPanel.handlePalette`):**
a plain palette swatch has no alpha channel. Clicking one only changes
`fill`/`stroke` via `svgCanvas.setColor(type, val)` — it deliberately leaves
`fill-opacity`/`stroke-opacity` untouched rather than forcing them back to `1`.

### Live position/dimension readout while dragging (move/resize)

While a select-mode move or resize drag is in progress, the geometry only
exists as a temporary `transform` on the element — real x/y/width/height/etc.
attributes aren't baked until mouseup (`recalculateDimensions`). To keep the
General/Dimensions panel fields tracking the drag instead of showing the
pre-drag values, `packages/svgcanvas/core/event.js`'s `mouseMoveEvent` stashes
the live delta/scale on the canvas instance right before firing the
`'transition'` event: `svgCanvas.dragLiveMoveDelta = {dx, dy}` (`'select'`
case) or `svgCanvas.dragLiveResizeBox = {left, top, width, height, tx, ty, sx,
sy}` (`'resize'` case, same anchor/scale values used to build the temporary
translate-scale-translate transform). `Editor.js`'s `elementTransition` reads
these (mirroring the existing `'rotate'` case) and calls
`TopPanel.updateLiveMove(elem, dx, dy)` / `TopPanel.updateLiveResize(elem,
box)`, which write directly into the relevant fields (not a full
`updateContextPanel()` — those would re-read the still-unbaked attributes and
show stale values).

`recalculateDimensions` (`packages/svgcanvas/core/recalculate.js`) has a
`default:`-case guard that bails out (returns `null`, leaving the transform
in place) when the tlist is a lone matrix+rotation (2 items) — this is
intentional (rotation must stay a separate transform). It used to *also*
bail out for a lone plain matrix (1 item, no rotation) — which is exactly
what a consolidated drag-move's temporary translate turns into — silently
leaving a `transform="matrix(...)"` on the element forever with `x`/`y`
never updated. That single-item disjunct was removed; only the 2-item
matrix+rotation combo still returns early. `event.js`'s `mouseUpEvent` also
now fires `'changed'` after every committed move (previously only after
resize), so `updateContextPanel()` refreshes with the newly baked values
once the drag ends.

Panel values are rounded to 1 decimal (`round1` helper in `TopPanel.js`, same
convention as `font_size`) since resize/scale math can produce long float
tails (e.g. `200.00000596046448`) — display only, not the underlying SVG
attribute precision.
