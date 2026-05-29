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
| `bottom` | `#tools_bottom` | Bottom status bar |

**Open state** (side panel expanded): adds class `.open` to `.svg_editor`, changing column 5 from `15px` to `220px`.

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

### `#svgcanvas` — SVG Paper/Artboard
```css
#svgcanvas {
  display: inline-block;
  background: var(--canvas-bg-color);   /* = --paper-bg (the white artboard) */
  box-shadow: var(--paper-shadow);
  border: 1px solid var(--paper-border);
  border-radius: var(--paper-radius);   /* 4px */
}
```

### `#tools_top` — Top Toolbar
```css
#tools_top {
  grid-area: top;
  display: flex; flex-direction: row; flex-wrap: wrap;
  align-items: center; align-content: flex-start;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-border);
  min-height: 56px;  /* var(--top-toolbar-min-height) */
  padding: 0 10px;
  gap: 6px;
  z-index: 5;
}
/* Groups inside top toolbar (e.g. #history_panel, #editor_panel) */
#history_panel, #editor_panel {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 4px;
  background: var(--group-bg);
  border: 1px solid var(--group-border);
  border-radius: 10px;
}
#history_panel { margin-left: auto; } /* pushes to right edge */
```

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

### `#tools_bottom` — Bottom Status Bar
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

### `.sidepanel_section` — Right side-panel sections
Shared style for context-aware sections inside `#sidepanel_content` (General, Text, Shadow, Color Shift):
```css
.sidepanel_section,
#color_shift_panel,
#shadow_panel {
  padding: 12px 15px 10px;
  margin-top: 10px;
  border-top: 1px solid var(--chrome-border);
  color: var(--fg);
  user-select: none;
}
.sidepanel_section_label,
#color_shift_label {
  font-weight: 600; font-size: 12px;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 8px;
}
.sidepanel_section_grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 6px; align-items: center;
}
```
Each section sets `style.display: 'none'` until its trigger selection is active.

### Wireframe Mode
```css
#workarea.wireframe #svgcontent * {
  fill: none; stroke: #000; stroke-width: 1px;
  opacity: 1; filter: none;
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

### `se-spin-input` ([seSpinInput.js](../src/editor/components/seSpinInput.js))

```
Wrapper (.wrap): height 36px, inline-flex, align-items center
  background: var(--group-bg)
  border: 1px solid var(--group-border)
  border-radius: 10px
  padding: 0 8px; gap: 5px

Icon wrapper: 18px × 18px, flex-shrink: 0

Label: font-size 12px, font-weight 500, color: var(--muted)

Input (elix-number-spin-box inner):
  background: var(--field-bg)
  border: 1px solid var(--field-border)
  border-radius: 7px; height: 26px
  font-size: 12.5px; font-weight: 500
  color: var(--fg)
```

### `se-input` ([seInput.js](../src/editor/components/seInput.js))

Same tray structure as `se-spin-input`. Inner `elix-input` mirrors the field styling (field-bg, field-border, same font).

### `se-select` ([seSelect.js](../src/editor/components/seSelect.js))

Same tray structure. Inner `<select>`:
```
background: var(--field-bg); color: var(--fg)
border: 1px solid var(--field-border); border-radius: 7px
height: 26px; font-size: 12.5px; font-weight: 500
appearance: none  (custom arrow via CSS)
```

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

Icons are injected by `src/editor/components/svgIconLoader.js` which fetches, normalises, and caches each SVG file.
