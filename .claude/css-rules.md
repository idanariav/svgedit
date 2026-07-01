# SVGedit CSS Rules & Hierarchy

> **How to use this doc:** Start with the Design Tokens table to find variable names, then Grid Layout to understand positioning, then the Component CSS sections to style individual UI elements. All shadow DOM CSS lives in the component `.js` files, not in `svgedit.css`.

**Primary CSS file:** [src/editor/svgedit.css](../src/editor/svgedit.css)
**Component CSS:** embedded in each `src/editor/components/*.js` as a template string

---

## Design Tokens (CSS Custom Properties)

Theme variables are defined on `:root, .svg_editor, .svg_editor.theme-light` and overridden by `.svg_editor.theme-dark`.

### Surface Colors

| Variable | Light value | Dark value | Purpose |
|----------|-------------|------------|---------|
| `--app-bg` | `#F4F5F7` | `#16181D` | Outermost application background |
| `--chrome-bg` | `#FFFFFF` | `#1E2026` | Toolbar / panel background |
| `--chrome-border` | `#E6E8EC` | `#2C2F37` | Toolbar / panel border |
| `--canvas-bg` | `#F8F9FB` | `#0F1115` | Workarea (outside the SVG paper) |
| `--ruler-bg` | `#FFFFFF` | `#1A1C22` | Ruler strip background |
| `--paper-bg` | `#FFFFFF` | `#FAFAF8` | SVG artboard/paper background |
| `--paper-border` | `#DCDFE5` | `#1A1C22` | SVG artboard border |
| `--paper-radius` | `4px` | `4px` | SVG artboard corner radius |
| `--paper-shadow` | multi-layer drop shadow | darker shadow | Box shadow on SVG paper |
| `--paper-shadow-filter` | `drop-shadow()` chain | darker | Page shadow via CSS `filter` on `#canvasBackground` |

### Text Colors

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--fg` | `#1B1F24` | `#ECEEF2` | Primary text / foreground |
| `--muted` | `#6B7280` | `#9098A5` | Secondary / muted labels |

### Icon States

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--icon` | `#4B5563` | `#B7BDC8` | Default icon color |
| `--icon-hover` | `#0F172A` | `#FFFFFF` | Icon color on hover |
| `--icon-hover-bg` | `#EEF1F5` | `#2A2D35` | Button hover background |
| `--icon-active-bg` | `#E2E6EC` | `#353944` | Button active/mousedown background |

### Accent (Active / Selected State)

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--accent` | `#2962FF` (blue) | `#F6B23A` (amber) | Active/selected color |
| `--accent-soft` | `#E8EFFF` | `#3A2E18` | Active button background tint |
| `--accent-border` | `#C7D7FF` | `#5A4422` | Active button border |
| `--active-shadow` | blue glow | amber glow | Active button box-shadow |

### Input Fields & Groups

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--field-bg` | `#FFFFFF` | `#14161A` | Input field background |
| `--field-border` | `#DDE1E7` | `#2C2F37` | Input field border |
| `--field-border-h` | `#C8CDD6` | `#3C4150` | Input field border on hover |
| `--accent-ring` | `rgba(41,98,255,0.16)` | `rgba(246,178,58,0.20)` | Field focus ring (focus-within box-shadow) |
| `--section-rule` | `#EEF0F3` | `#23262E` | Light divider between right-panel sections / layer rows |
| `--group-bg` | `#F6F7F9` | `#181A20` | Control-group tray background |
| `--group-border` | `#E6E8EC` | `#2C2F37` | Control-group tray border |

### Swatches & Color Picker

| Variable | Purpose |
|----------|---------|
| `--swatch-bg/border/border-hover` | Paint swatch appearance |
| `--cp-*` | Color picker modal internal tokens (modal-bg, head-bg, stage-bg, etc.) |
| `--sl-*` | Shape library modal internal tokens |

### Misc / UI

| Variable | Purpose |
|----------|---------|
| `--ui-font` | `'Inter', -apple-system, system-ui, sans-serif` |
| `--top-toolbar-min-height` | `56px` — top toolbar row height |
| `--global-se-spin-input-width` | `82px` — default spin input width |
| `--scrollbar-thumb` | Thin scrollbar color |

---

## Legacy Aliases

These are defined in both themes and map to the canonical tokens. Existing components may still use them.

| Legacy variable | Maps to |
|-----------------|---------|
| `--main-bg-color` | `--chrome-bg` |
| `--text-color` | `--fg` |
| `--border-color` | `--chrome-border` |
| `--canvas-bg-color` | `--paper-bg` *(the SVG artboard, not the workarea)* |
| `--workarea-bg` | `--canvas-bg` |
| `--input-color` | `--field-bg` |
| `--dropdown-bg` | `--chrome-bg` |
| `--dropdown-pressed-bg` | `--icon-hover-bg` |
| `--hover-highlight` | `--icon-hover-bg` |
| `--icon-bg-color-hover` | `--icon-hover-bg` |
| `--layer-bg` | `--chrome-bg` |
| `--layer-selected-bg` | `--accent-soft` |
| `--link-color` | `--accent` |
| `--orange-color` | `--accent` |

**Rule:** For new code, always use the canonical token. Legacy aliases exist only for backward compatibility.

---

## Grid Layout (`.svg_editor`)

The editor root is a **CSS Grid** with 4 rows × 5 columns.

```css
.svg_editor {
  display: grid;
  grid-template-rows: minmax(56px, auto) 15px 1fr 40px;
  grid-template-columns: 56px 15px 50px 1fr 15px;
  grid-template-areas:
    "main  main    main    top    top"
    "left  corner  rulerX  rulerX side"
    "left  rulerY  workarea workarea side"
    "left  bottom  bottom  bottom bottom";
}
```

| Grid area | Element | Description |
|-----------|---------|-------------|
| `main` | `#main_button` | Brand pill / hamburger menu button (spans full width) |
| `top` | `#tools_top` | Horizontal top toolbar |
| `left` | `#tools_left` | Vertical left tool sidebar |
| `corner` | *(ruler corner)* | Empty corner where rulers meet |
| `rulerX` | `#rulers .ruler_x` | Horizontal ruler |
| `rulerY` | `#rulers .ruler_y` | Vertical ruler |
| `workarea` | `#workarea` | Canvas scroll area |
| `side` | `#sidepanels` | Right side panel (layers, overview; collapsible) |

**Empty-canvas watermark** — `#canvas_watermark` is an absolutely-positioned,
`pointer-events:none` overlay inside `#svgcanvas` (centered, `opacity:0.07`) whose
background image is the full-color brand `logo.svg`. Hidden by default; gets the
`.visible` class only while the drawing has no objects. Toggled by
`Editor.updateCanvasWatermark()` (called on `changed`/`afterClear` and at startup).
| `bottom` | `#tools_bottom` | Bottom status bar |

**Open state** (side panel expanded): adds class `.open` to `.svg_editor`, changing column 5 from `15px` to `220px`.

**Tablet mode** (touch-first shell): adds class `.ui-tablet` to `.svg_editor`
(via `uiMode.js`). All tablet styling lives in [src/editor/tablet.css](../src/editor/tablet.css),
`@import`ed at the top of `svgedit.css` and **entirely scoped under
`.svg_editor.ui-tablet`** — colors inherit from the tokens above; only geometry +
visibility change. It collapses the grid (`grid-template-rows: 0 0 1fr 0;
grid-template-columns: 0 0 0 1fr 0`) so `#workarea` fills the shell, `display:none`s
`#tools_top/#tools_left/#sidepanels/#tools_bottom` (+ rulers), floats `#main_button`
top-left, and renders the `.tablet-shell` overlay (`.ts-topbar` command bar +
`.ts-sheet` bottom sheet, both built by `panels/TabletShell.js`). The desktop and
tablet shells are mutually exclusive — `.svg_editor:not(.ui-tablet) .tablet-shell`
is hidden. Touch sizing tokens (`--hit: 56px`, `--hit-sm: 46px`, `--r-md/lg/pill`)
are defined on the `.ui-tablet` root. The embedded `<se-shape-library>` button is
sized to the touch toolgroup via the component's `--sl-tool-size` /
`--sl-tool-icon-size` / `--sl-tool-radius` custom properties (defaults 40/22/10px
in `seShapeLibrary.js`; these inherit through the shadow boundary). The select
cursor icon gets a small `translate(2px,1px)` nudge (`.ts-tool-select svg`) so its
top-left-weighted shape reads as centred in the active blue circle.

> **Tablet icon sizing uses `!important`.** `svgIconLoader.js` stamps an inline
> `style="width:100%;height:100%"` on every injected `<svg>`. Chromium resolves
> that percentage against the button box, but the iOS/Android WebView (Obsidian
> mobile) collapses it to a near-zero intrinsic size — icons render tiny. Every
> tablet icon-size rule (`.tbtn svg`, `.ts-toolgroup .tbtn svg`, `.tbtn.sm svg`,
> `.menu-item .mi-ic svg`, `.lib-cell svg`) therefore uses `!important` so the
> explicit pixel size beats the inline style on all platforms. The embedded
> shape-library button does **not** need this (it sizes via `--sl-tool-icon-size`,
> not the injected inline style) — which is why it was the only icon that rendered
> correctly before the fix.

---

## Key Selector Rules

### `#workarea` — Canvas Container
```css
#workarea {
  grid-area: workarea;
  background-color: var(--canvas-bg);   /* workarea, not paper */
  overflow: auto;
  text-align: center;
  padding: 56px 80px 80px 56px;         /* space around SVG paper */
}
```

### `#svgcanvas` / `#canvasBackground` — scroll area vs. document page
`#svgcanvas` is the over-sized scroll/pan area (size = `max(workarea, contentW·zoom·canvas_expansion)`), **not** the document page — so it must stay transparent. The "paper" appearance lives on `#canvasBackground`, the SVG element sized to the document that scales with zoom. Putting the paper styling on `#svgcanvas` makes the white page appear fixed-size while objects scale (they then look like they spill off the page).
```css
#svgcanvas { background: transparent; }      /* just the scroll/pan container */

#canvasBackground { filter: var(--paper-shadow-filter); }   /* page drop shadow */
#canvasBackground > rect {                   /* the page border */
  stroke: var(--paper-border);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;         /* stays 1px at any zoom */
}
```
`--paper-shadow-filter` is the `drop-shadow()` equivalent of `--paper-shadow` (filters have no spread param), defined per theme.

### `#tools_top` — Top Toolbar
```css
#tools_top {
  grid-area: top;
  display: flex; flex-direction: row; flex-wrap: nowrap;
  align-items: center;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-border);
  min-height: 56px;  /* var(--top-toolbar-min-height) */
  padding: 0 10px;
  gap: 6px;
  z-index: 5;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; /* single row; scroll on overflow */
}
/* Children keep natural width (flex-shrink:0) and don't wrap internally, so the
   bar scrolls horizontally instead of squishing or wrapping to a second row. */
#tools_top > * { flex-shrink: 0; flex-wrap: nowrap; }
/* Rounded "tray" groups in the top toolbar — shared visual language for all
   quick-action clusters (view / history / object / arrange / zoom / path-node) */
#editor_panel, #history_panel, #zoom_panel, .quick_tray {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 4px;
  background: var(--group-bg);
  border: 1px solid var(--group-border);
  border-radius: 10px;
}
#history_panel { margin-left: auto; } /* pushes it + everything after to the right */

/* Polystar context fields: elix' spin-box defaults to ~184px, so the star
   panel's three fields would wrap the toolbar to a second row. Cap them. */
#star_panel se-spin-input,
#polygon_panel se-spin-input { width: 58px; } /* short labels keep panel ~178px */
```

Contextual trays carry their selection classes (`.selected_panel`,
`.multiselected_panel`, `.g_panel`, `.path_node_panel`) plus `.quick_tray`, and
start with inline `display:none`; `TopPanel.js` `displayTool()`/`hideTool()` toggle
them (`#tools_top > *` provides the `display:flex` fallback when shown). Each
selection context uses a single consolidated tray (`.selected_panel` for one
element, `.multiselected_panel` for many) holding all object actions — clone /
delete / group / arrange / flip / align. Note `.selected_panel` and
`.multiselected_panel` are **shared** with RightPanel sections, so the same
`displayTool()` call toggles both the top tray and the matching side-panel section.

### `#tools_left` — Left Tool Sidebar
```css
#tools_left {
  grid-area: left;
  display: flex; flex-direction: column;
  align-items: center;
  padding: 10px 0; gap: 4px;
  background: var(--chrome-bg);
  border-right: 1px solid var(--chrome-border);
  overflow-y: scroll; scrollbar-width: none; /* hidden scrollbar */
}
```

### `#tools_bottom` — Bottom Color Bar
Holds only the color controls (`fill_color`, `stroke_color`, `bg_color`, `palette`).
```css
#tools_bottom {
  grid-area: bottom;
  display: flex; align-items: center;
  height: 56px; gap: 8px; padding: 0 14px;
  background: var(--chrome-bg);
  border-top: 1px solid var(--chrome-border);
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: thin;
}
```

### `#main_button` — Brand Pill / Menu
```css
#main_button {
  grid-area: main;
  display: inline-flex; align-items: center;
  padding: 0 10px;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-border);
  border-right: 1px solid var(--chrome-border);
}
#main_icon {                          /* inner styled pill */
  height: 36px; border-radius: 10px;
  background: var(--brand-bg);
  border: 1px solid var(--brand-border);
  color: var(--brand-fg);
}
#main_icon:hover { background: var(--brand-bg-hover); }
```

> ⚠️ The `#main_icon`, `#logo`, `#main_button .dropdown` rules above are **dead** —
> the brand button's label lives inside the `se-menu` → elix-menu-button shadow
> DOM, which global CSS cannot pierce. The button's actual border/background is
> injected by `components/sePlainBorderButton.js` (the elix toggle's
> `[part~="button"]`). It is deliberately `transparent`/`transparent` so the brand
> button blends into the toolbar; edit *that* file to restyle it, not the rules
> above. `#main_button` (the light-DOM container) only contributes the
> bottom + right `--chrome-border` panel separators.

### `#main_menu` — Dropdown Menu
```css
#main_menu {
  position: relative; z-index: 12;
  background: var(--chrome-bg); color: var(--fg);
  width: 230px; padding: 6px;
  border: 1px solid var(--chrome-border); border-radius: 10px;
  box-shadow: 0 4px 16px -2px var(--main-menu-shadow);
}
#main_menu li { border-radius: 7px; padding: 7px 10px; cursor: pointer; }
#main_menu li:hover { background: var(--icon-hover-bg); }
```

### Right-panel tabs (`#sidepanel_tabs` / `.sidepanel_tabpanel`)
The right panel is tabbed (Design / Text / Effects / Layers). The tab bar is sticky at
the top of the scrolling `#sidepanel_content`; the active tab uses the accent color with
an underline drawn by `::after`. Tab panels are hidden unless `.active`.
```css
#sidepanel_tabs { display: flex; gap: 2px; padding: 6px 8px 0;
  position: sticky; top: 0; background: var(--chrome-bg);
  border-bottom: 1px solid var(--section-rule); z-index: 1; }
.sidepanel_tab { flex: 1; border: none; background: transparent;
  color: var(--muted); font: 600 12.5px var(--ui-font);
  border-radius: 7px 7px 0 0; padding: 9px 4px 11px; cursor: pointer; position: relative; }
.sidepanel_tab:hover { color: var(--fg); background: var(--icon-hover-bg); }
.sidepanel_tab.active { color: var(--accent); }
.sidepanel_tab.active::after { content: ""; position: absolute;
  left: 8px; right: 8px; bottom: -1px; height: 2px; background: var(--accent); }
.sidepanel_tabpanel { display: none; padding: 2px 0 10px; }
.sidepanel_tabpanel.active { display: block; }
/* horizontal button rows inside sections (Object / Combine / Joins & caps) */
.sidepanel_btn_row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.sidepanel_text_font { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
```

### `.sidepanel_section` — Right side-panel sections ("Direction A" layout)
Shared style for context-aware sections inside the tab panels (General, Dimensions,
Stroke & Opacity, Object, Combine, Font, Spacing & Shape, Blur, Clip & Mask, Shadow,
Color Shift). Sections are divided by a light `--section-rule`; the first section in a
tab drops its top rule. Fields are laid out in a **two-column grid where each field
stretches to fill its cell** (the `se-*` components stack a small uppercase label above
a single bordered field — see component CSS below), which is what makes the columns
align. Use `.span2` on a field to make it fill the full row (e.g. ID / Class).
```css
.sidepanel_section, #color_shift_panel, #shadow_panel {
  padding: 14px 16px; margin: 0;
  border-top: 1px solid var(--section-rule); color: var(--fg); user-select: none;
}
.sidepanel_tabpanel > .sidepanel_section:first-child { border-top: none; }
.sidepanel_section_label, #color_shift_label {
  font: 700 11px var(--ui-font); letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 12px; white-space: nowrap;
}
.sidepanel_section_grid, .color_shift_grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 10px; align-items: start;
}
.sidepanel_section_grid .span2 { grid-column: 1 / -1; }      /* full-row field */
.sub_label { font: 600 10px var(--ui-font); letter-spacing: 0.05em;   /* sub-block header */
  text-transform: uppercase; color: var(--muted); margin: 0 0 5px 2px; }
.sidepanel_subsection { margin-top: 12px; }                  /* spacing between sub-blocks */
```
Each section sets `style.display: 'none'` until its trigger selection is active.

### Layer-row cells (`#layerlist`)
Each `tr.layer` has icon cells before the name. The visibility cell (`td.layervis`,
hidden via `td.layerinvis * { display:none }`) and the **lock cell**:
```css
#layerlist td.layerlock { width: 22px; padding-left: 4px; text-align: center; }
#layerlist td.layerlock * { display: block; color: var(--muted); }          /* unlocked */
#layerlist td.layerlock:hover * { color: var(--icon-hover, var(--fg)); }
#layerlist td.layerlock.locked * { color: var(--accent); }                   /* locked */
```
The icon itself differs by state — `lock_open.svg` when unlocked (muted, signals it's
clickable), `lock.svg` when locked (accent). `RightPanel.populateLayers` picks the icon
and swaps it on click via its `renderLockIcon` helper.

### Wireframe Mode
```css
#workarea.wireframe #svgcontent * {
  fill: none; stroke: #000; stroke-width: 1px;
  opacity: 1; filter: none;
}
```

### No-fill shapes are outline-only for selection
Shapes inherit `pointer-events: all` from the layer `<g>` (set in
`packages/svgcanvas/core/layer.js`), so by default a `fill="none"` shape captures
clicks across its whole interior. This rule restores SVG's expected behavior for
no-fill shapes: only the stroke is hit-testable, and the empty interior is
click-through to whatever lies behind. It keys on the `fill` **attribute** (the
form svgedit's color tools write), so it self-applies/reverts as fill changes and
also covers imported SVGs using `fill="none"`.
```css
#svgcontent [fill="none"] {
  pointer-events: stroke;
}
```

---

## Shadow DOM Component CSS

These styles live **inside** each component file and are scoped to the shadow DOM. They cannot be overridden from the outside except via CSS custom properties.

### `se-button` ([seButton.js](../src/editor/components/seButton.js))

```
Host:  display: inline-flex
Inner div (.button-wrapper):
  width: 40px; height: 40px
  display: flex; align-items: center; justify-content: center
  border: 1px solid transparent
  border-radius: 10px
  background: transparent
  color: var(--icon, #4B5563)
  transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s

Hover:
  background: var(--icon-hover-bg, #EEF1F5)
  color: var(--icon-hover, #0F172A)

.pressed (active/selected):
  background: var(--accent-soft, #E8EFFF) !important
  color: var(--accent, #2962FF) !important
  border-color: var(--accent-border, #C7D7FF) !important
  box-shadow: var(--active-shadow)

.locked (tool lock mode — stacks on .pressed):
  outline: 2px solid var(--accent, #2962FF)
  outline-offset: -2px
  (se-flyingbutton mirrors this via .overall.locked .menu-button)

.disabled:
  opacity: 0.35
  pointer-events: none

size="small" variant:
  width: 30px; height: 30px; border-radius: 7px
```

**Icon rendering:** Icons are inline SVG (fetched by `svgIconLoader.js`). Because SVGs use `stroke="currentColor"`, the `color:` property controls icon color — no CSS filter needed.

To style a button from outside a shadow boundary:
```css
se-button { color: var(--icon); }
se-button[pressed] { color: var(--accent); }
```

### `se-spin-input` ([seSpinInput.js](../src/editor/components/seSpinInput.js)) — "Direction A"

The host is `display: flex; flex-direction: column; align-items: stretch` so the
component **fills its grid cell**. A small uppercase `.top-label` (shown only when the
`label` attribute is set) stacks above a single bordered `.field`. The `src` icon is now
only a fallback leading glyph shown when **no** `label` is set (`:host([src]:not([label]))`).
```
:host: flex column, align-items stretch, min-width 0
.top-label: 10px/600 uppercase, var(--muted), display:none until [label] set
.field: height 34px, flex row, background var(--field-bg),
        border 1px var(--field-border), border-radius 8px, overflow hidden
.field:hover  → border-color var(--field-border-h)
.field:focus-within → border var(--accent) + box-shadow 0 0 0 3px var(--accent-ring)
.icon-wrap: 30px wide leading glyph, shown only via :host([src]:not([label]))
elix-number-spin-box: transparent, flex:1; spin buttons are a right-edge stepper
  (::part(spin-button) with a left border, hover → accent)
```

### `se-input` ([seInput.js](../src/editor/components/seInput.js))

Same single-field + stacked-label treatment as `se-spin-input` (`:host` stretches,
`.top-label` + `.field`, same hover/focus-within states). Inner `elix-input` is
transparent and fills the field.

### `se-select` ([seSelect.js](../src/editor/components/seSelect.js))

Same single-field + stacked-label treatment. The native `<select>` is transparent,
`appearance: none`, and fills the field; a built-in `.chev` SVG chevron sits at the
right edge. `src` icon is a fallback leading glyph only when no `label` is set.

### `se-font-select` ([seFontSelect.js](../src/editor/components/seFontSelect.js))

Same `group-bg` tray as `se-select`, but the inner control is a custom `.trigger`
button (field-bg/field-border, current font rendered in its own face) that opens a
fixed-position `.fl-popover`. The popover reuses the **same visual language as
`se-font-library`**: `chrome-bg`/`chrome-border` card, a `.fl-search` input box,
and a scrollable `.fl-list` where each `.fl-item-preview` is styled with its
option's `font-family` (per-font preview). Active row uses `accent-soft` /
`accent-border` with an `accent`-colored check. Theme is synced by toggling
`theme-dark`/`theme-light` on the host (matches `se-font-library`).

### `se-list` ([seList.js](../src/editor/components/seList.js))

```
Trigger (.select-container): 28px × 28px
  border: 1px solid transparent; border-radius: 7px
  background: transparent; color: var(--icon)
  transition: background/color 0.12s; cursor: pointer

Hover:
  background: var(--icon-hover-bg); color: var(--icon-hover)

Dropdown (.options-container): position: fixed
  background: var(--chrome-bg); border: 1px solid var(--chrome-border)
  border-radius: 10px; padding: 6px
  box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12)
  z-index: 100; display: flex; flex-direction: column; gap: 2px
```

---

## Theme Switching

The editor applies theme by toggling classes on `.svg_editor`:

```js
// Canonical helper (src/editor/themeUtil.js)
applyTheme(theme, rootEl)  // theme = 'light' | 'dark'

// Direct class toggle (host environments / Obsidian plugin)
editorEl.classList.toggle('theme-dark', isDark)
editorEl.classList.toggle('theme-light', !isDark)
```

User pref is stored in `localStorage` as `svg-edit-theme`.

---

## Icon Recoloring Rules

All toolbar SVG icons in `src/editor/images/` use `stroke="currentColor" fill="none"`.

They respond to the CSS `color` property, so no `filter` is needed. **Do not use `filter: var(--icon-filter)` — that pattern is retired.**

```css
/* Correct way to recolor from outside a component */
se-button         { color: var(--icon); }
se-button[pressed]{ color: var(--accent); }

/* Never do this */
se-button img { filter: var(--icon-filter); }  /* ❌ retired */
```

Icons are injected by `src/editor/components/svgIconLoader.js`, which normalises and caches each SVG. The SVG source is resolved from the **inlined** registry in `src/editor/images/iconRegistry.js` (bundled at build time); `fetch()` is only a fallback for `data:` URIs or icons absent from the registry.

> **Stylesheet loading:** `svgedit.css` (which `@import`s `tablet.css`) is **not** loaded via `<link>`. It is imported as a string (`./svgedit.css?inline`) and injected once as `<style data-svgedit-css>` by `EditorStartup.injectSvgeditStyles()`, so the editor needs no runtime CSS file.
