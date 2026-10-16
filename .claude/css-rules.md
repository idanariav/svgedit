# SVGedit CSS Rules & Hierarchy

> **How to use this doc:** Start with the Design Tokens to find variable names, then Grid Layout to understand positioning, then the selector rules and component sections. The values live in the CSS (`svgedit.css`, the components), not here: this doc says what each token and rule is for and the traps in them. All shadow DOM CSS lives in the component `.js` files, not in `svgedit.css`.

**Primary CSS file:** [src/editor/svgedit.css](../src/editor/svgedit.css)
**Component CSS:** embedded in each `src/editor/components/*.js` as a template string

---

## Design Tokens (CSS Custom Properties)

Theme variables are defined on `:root, .svg_editor, .svg_editor.theme-light` and overridden by `.svg_editor.theme-dark`. Keep `:root,` directly before `.svg_editor`: the Obsidian plugin strips it with a regex to scope the variables.

**Dialogs.** Every dialog (`se-color-dialog`, `se-palette-dialog`, `se-text-prompt-dialog`, `se-image-import-dialog`, `se-trace-dialog`, `se-recolor-dialog`, `se-edit-prefs-dialog`, `se-export-dialog`, `se-svg-source-editor-dialog`, `se-img-prop-dialog`, `se-plain-alert-dialog` (alert / confirm / select / prompt), `se-cmenu_canvas-dialog`, `se-cmenu-layers`, `se-hotkey-dialog`, `se-favorites-dialog`, `se-command-search-dialog`) is mounted next to `.svg_editor`, not inside it. So its tag is listed in the same two token blocks (`se-x-dialog` for light, `se-x-dialog.theme-dark` for dark), and it calls `syncDialogTheme(this)` (`themeUtil.js`) every time it opens, which copies the owning editor's theme onto the host as `theme-dark` / `theme-light`. Dialogs must **not** redefine the shared tokens locally; only dialog-specific `--cp-*` / `--pd-*` tokens live in their own styles. A new dialog needs its tag in both blocks, `syncDialogTheme` on open and, for form-style dialogs, `dialogSkin('#its_card')` from `dialogs/dialogSkin.css.js`; `tests/unit/dialog-theme-tokens.test.js` fails if the tag is missing. A `<dialog>` needs its own frame reset (`padding: 0; background: transparent; border: none`) when the card inside is the visible surface, since `::part(frame)` does nothing on a native `<dialog>`.

| Group | Tokens | Purpose |
|-------|--------|---------|
| Surfaces | `--app-bg`, `--chrome-bg`, `--chrome-border`, `--canvas-bg` | Outermost background; toolbar / panel background and border; the workarea outside the paper |
| Paper | `--ruler-bg`, `--paper-bg`, `--paper-border`, `--paper-radius`, `--paper-shadow`, `--paper-shadow-filter` | Ruler strip; the artboard's fill, border, radius and shadow (`--paper-shadow-filter` is the `drop-shadow()` equivalent, since filters have no spread, applied to `#canvasBackground`) |
| Text | `--fg`, `--muted` | Primary text; secondary labels |
| Icons | `--icon`, `--icon-hover`, `--icon-hover-bg`, `--icon-active-bg` | Default and hover icon colour; button hover and mousedown backgrounds |
| Accent | `--accent`, `--accent-soft`, `--accent-border`, `--active-shadow` | Active / selected colour (blue in light, amber in dark), its button tint, border and glow |
| Fields | `--field-bg`, `--field-border`, `--field-border-h`, `--accent-ring` | Input background, border, hover border, focus ring (`focus-within` box-shadow) |
| Groups | `--section-rule`, `--group-bg`, `--group-border` | Divider between right-panel sections and layer rows; control-group tray |
| Swatches | `--swatch-bg/border/border-hover`, `--none-slash` | Paint swatches; the red slash of the palette's "none" swatch |
| Internal | `--cp-*`, `--sl-*` | Colour-picker modal; shape-library modal |
| Misc | `--ui-font`, `--top-toolbar-min-height`, `--global-se-spin-input-width`, `--scrollbar-thumb` | UI font stack; top toolbar row height; default spin-input width; thin scrollbar |

Icons drawn as solid silhouettes are converted to outlines at load time by `OUTLINE_ICONS` in `components/svgIconLoader.js` (`vector-effect: non-scaling-stroke`, so large-viewBox artwork keeps the same 1.6 px line as the native outline icons). Add a file name to that set instead of redrawing the SVG.

## Retired Aliases

The legacy alias variables (`--main-bg-color`, `--text-color`, `--border-color`, `--dropdown-bg`, `--hover-highlight`, `--icon-bg-color-hover`, `--link-color`, `--orange-color`, `--workarea-bg`, `--ruler-color`, `--bevel-light`, …) no longer exist; `--workarea-bg` is `--canvas-bg`, `--ruler-color` is `--ruler-bg`, `--bevel-light` is `--chrome-border`. `tests/unit/dialog-theme-tokens.test.js` fails if one is referenced again. **Always use the canonical tokens.**

---

## Grid Layout (`.svg_editor`)

The editor root is a **CSS Grid** (4 rows × 5 columns; sizes in `svgedit.css`) with the areas:

```
"main  main    main    top    top"
"left  corner  rulerX  rulerX side"
"left  rulerY  workarea workarea side"
"left  bottom  bottom  bottom bottom"
```

| Grid area | Element | Description |
|-----------|---------|-------------|
| `main` | `#main_button` | Brand pill / menu button |
| `top` | `#tools_top` | Horizontal top toolbar |
| `left` | `#tools_left` | Vertical left tool sidebar |
| `corner` | *(ruler corner)* | Empty corner where the rulers meet |
| `rulerX` / `rulerY` | `#rulers .ruler_x` / `.ruler_y` | Rulers |
| `workarea` | `#workarea` | Canvas scroll area |
| `side` | `#sidepanels` | Right side panel (collapsible) |
| `bottom` | `#tools_bottom` | Bottom colour bar |

**Open state** (side panel expanded): `.open` on `.svg_editor` widens column 5 from 15 px to 220 px.

**Empty-canvas watermark.** `#canvas_watermark` is an absolutely positioned, `pointer-events: none` overlay inside `#svgcanvas` (centred, `opacity: 0.07`) with the full-colour brand `logo.svg`. It gets `.visible` only while the drawing has no objects, toggled by `Editor.updateCanvasWatermark()` (on `changed` / `afterClear` and at startup).

**Layer Focus badge.** `#layer_focus_badge` is a `pointer-events: none` pill showing the active layer name in Layer Focus mode (ext-layer_view). It is a **sibling** of `#workarea` in the same `grid-area: workarea` cell, not a child of the scroll container, so it stays pinned to the viewport top instead of scrolling with the canvas. Shown via `.visible`.

**Tablet mode** (touch-first shell) adds `.ui-tablet` to `.svg_editor` (`uiMode.js`). All tablet styling is in [tablet.css](../src/editor/tablet.css), `@import`ed at the top of `svgedit.css` and **entirely scoped under `.svg_editor.ui-tablet`**: colours inherit from the tokens, only geometry and visibility change. It collapses the grid so `#workarea` fills the shell, hides `#tools_top` / `#tools_left` / `#sidepanels` / `#tools_bottom` and the rulers, floats `#main_button` top-left, and shows the `.tablet-shell` overlay (`.ts-topbar` command bar + `.ts-sheet` bottom sheet, built by `panels/TabletShell.js`). The desktop and tablet shells are mutually exclusive (`.svg_editor:not(.ui-tablet) .tablet-shell` is hidden). Touch sizing tokens (`--hit`, `--hit-sm`, `--r-md/lg/pill`) are defined on the `.ui-tablet` root. The embedded `<se-shape-library>` button is sized through `--sl-tool-size` / `--sl-tool-icon-size` / `--sl-tool-radius` (they inherit through the shadow boundary); the select cursor icon gets a small `translate(2px, 1px)` (`.ts-tool-select svg`) so its top-left-weighted shape reads as centred in the active circle.

**Tablet narrow panes.** `.tablet-shell` is a size container (`container-type: inline-size`); `@container` rules at the end of the command-bar section hide the zoom row, slim the tool buttons, hide Done and slim them again so Undo / Redo stay on screen, and drop the bottom sheet's column dividers where its columns wrap. Each tier sits a little *above* the width where the bar would overflow, and `top-bar-layout.spec.js` checks a dense list of widths (the bar once overflowed in bands just above 1160 px and 900 px while the three widths first tested passed): when a button is added to the bar, re-measure and move the tiers. Add tiers there, **not as viewport `@media`** (hosts embed the editor in panes).

The **bottom sheet** (`.ts-sheet`) keeps its columns in a wrapping flex row, so in a narrow pane the last column drops to a second line; its 34 px top band holds the kind label and the close button. A range input has an intrinsic width: `.te-range` needs `min-width: 0` or its value label spills into the next column, and the input itself is 32 px tall (the track is drawn inside) so the finger's target is the input, not the track. Touch targets: swatches and flyout rows 44 px, command-bar tool buttons 46 px (38 / 35 px in the narrow tiers). `tests/e2e/tablet-shell-layout.spec.js` guards it.

> **Tablet icon sizing uses `!important`.** `svgIconLoader.js` stamps an inline `style="width:100%;height:100%"` on every injected `<svg>`. Chromium resolves the percentage against the button box, but the iOS / Android WebView (Obsidian mobile) collapses it to a near-zero intrinsic size. Every tablet icon-size rule (`.tbtn svg`, `.ts-toolgroup .tbtn svg`, `.tbtn.sm svg`, `.menu-item .mi-ic svg`, `.lib-cell svg`) therefore uses `!important`, so the explicit pixel size beats the inline style everywhere. The embedded shape-library button does not need it (it sizes via `--sl-tool-icon-size`).

---

## Key Selector Rules

### `#workarea` — canvas container
`grid-area: workarea`, `background: var(--canvas-bg)` (the workarea, not the paper), `overflow: auto`, padded around the paper.

### `#svgcanvas` / `#canvasBackground` — scroll area vs. document page
`#svgcanvas` is the over-sized scroll / pan area (size = `max(workarea, contentW·zoom·canvas_expansion)`), **not** the document page, so it must stay transparent. The "paper" lives on `#canvasBackground`, the SVG element sized to the document that scales with zoom (`filter: var(--paper-shadow-filter)`; its `> rect` is the page border: `stroke: var(--paper-border)`, `vector-effect: non-scaling-stroke` so it stays 1 px at any zoom). Putting the paper styling on `#svgcanvas` makes the white page look fixed-size while objects scale, so they appear to spill off the page.

### `#tools_top` — top toolbar
A single row (`flex-wrap: nowrap`, `overflow-x: auto`): children keep their natural width (`flex-shrink: 0`) and the bar scrolls horizontally instead of squishing or wrapping. Quick-action clusters share one rounded **tray** look (`#editor_panel`, `#history_panel`, `#zoom_panel`, `.quick_tray`: `--group-bg` / `--group-border`). `#top_end` wraps `#history_panel` + `#zoom_panel` with `margin-left: auto; position: sticky; right: 0`, pinning Undo / Redo and zoom to the right edge. `#star_panel` / `#polygon_panel` spin-inputs are capped to 58 px: at the default ~184 px the three polystar fields would wrap the toolbar to a second row.

Contextual trays carry their selection classes (`.selected_panel`, `.multiselected_panel`, `.g_panel`, `.path_node_panel`) plus `.quick_tray` and start `display: none`; `TopPanel.js` `displayTool()` / `hideTool()` toggle them. One consolidated tray per selection context (`.selected_panel` for one element, `.multiselected_panel` for many) holds all object actions. `.selected_panel` and `.multiselected_panel` are **shared** with RightPanel sections, so one `displayTool()` call toggles both the top tray and the matching side-panel section.

> **Gotcha:** `displayTool(name)` / `hideTool(name)` select by CSS **class** (`.${name}`), not `id`. A per-button element (e.g. `#tool_topath`) needs a matching `class="tool_topath"` on top of its `id`, or the toggle is a silent no-op. If the element already has `class="span2"`, append to that list.

> **Gotcha:** `se-button`'s `disabled` sets `pointer-events: none` on the *inner shadow div* only, which does **not** block clicks on the host (the hit test skips the div and resolves to the host), so an external listener (e.g. through `$click`) still fires. `seButton.js` therefore adds a capture-phase click guard on the host that calls `stopImmediatePropagation()` when disabled; any rewrite must keep it. Code that disables a button **must** set `.disabled = true` (or the `disabled` attribute), never `classList.add('disabled')` on the host, which has no effect from outside the shadow root.

### `#tools_left` — left tool sidebar
A column flex container (`overflow-y: scroll; scrollbar-width: none`). The drag-to-reorder indicators (`.se-dragging`, `.se-drop-before`, `.se-drop-after`, `[draggable]:hover`) apply wherever the tool lives (main row or the overflow popover), since the classes are set on the light-DOM tool element. A tool's key badge is `::after` on the host with `content: attr(data-shortcut)` (set by `toolShortcutBadges.js`; `--muted` on a `--chrome-bg` pill, `--accent` while pressed, absolute at the bottom right). See `tools.md` for the behaviour.

### `#tools_bottom` — bottom colour bar
Colour controls only (`fill_color`, `stroke_color`, `bg_color`, `palette`); a single scrolling row.

### `#main_button` / `#main_menu` — brand pill and menu
The brand button's label lives inside `se-menu`'s own shadow DOM (`components/seMenu.js`, a plain custom element using the native Popover API for its dropdown), which global CSS cannot pierce: to restyle the button, edit the `#popupToggle` style block in that file (it is deliberately `transparent` so the brand button blends into the toolbar). The `#main_icon`, `#logo` and `#main_button .dropdown` rules in `svgedit.css` are **dead** for that reason; `#main_button` (the light-DOM container) only contributes the bottom and right `--chrome-border` separators. `#main_menu` is a 230 px card (`--chrome-bg`, `--chrome-border`, `--main-menu-shadow`) with `li` rows hovering to `--icon-hover-bg`.

### Right-panel tabs and sections
The right panel is tabbed (Design / Text / Effects / Layers). `#sidepanel_tabs` is sticky at the top of the scrolling `#sidepanel_content`; the active `.sidepanel_tab` uses the accent colour with an underline drawn by `::after`; `.sidepanel_tabpanel` is hidden unless `.active`. Helper classes: `.sidepanel_btn_row` (a wrapping row of buttons inside a section), `.sidepanel_btn_group` (a labelled button cluster, e.g. Object: Path / Select & Link; a hairline divider before every cluster after the first), `.sidepanel_text_font`.

`.sidepanel_section` is the shared style for context-aware sections (General, Dimensions, Stroke & Opacity, Object, Combine, Font, Spacing & Shape, Blur, Clip & Mask, Shadow, Color Shift): padding, a `--section-rule` top divider (the first section in a tab drops it), `user-select: none`. Its label (`.sidepanel_section_label`) is 11 px / 700 uppercase `--muted`; `.sub_label` heads a sub-block and `.sidepanel_subsection` spaces sub-blocks. Fields sit in a **two-column grid** (`.sidepanel_section_grid`) where each field stretches to fill its cell (the `se-*` components stack a small uppercase label over one bordered field, which is what makes the columns align); `.span2` makes a field fill the full row (ID, Class). Each section sets `style.display: 'none'` until its trigger selection is active. `ext-live-effects` adds a "Distort" section (`.sidepanel_section` + `.ext-live-effects-*` rules in `svgedit.css`, all on the primary tokens).

### Layer-row cells (`#layerlist`)
Each `tr.layer` has icon cells before the name: visibility (`td.layervis`, hidden via `td.layerinvis * { display: none }`), lock (`td.layerlock`: muted when unlocked, `--accent` with `.locked`; the icon swaps between `lock_open.svg` and `lock.svg` in `RightPanel.populateLayers`' `renderLockIcon`) and the preview (`td.layerpreview` with `.layerpreview-thumb`, a 28×20 inline `<svg>` of one `<use>` of the layer's own group; how it mirrors live and why the group gets an id is in `tools.md` › Layers Panel).

### Wireframe mode
`#workarea.wireframe #svgcontent *` forces `fill: none`, a 1 px black stroke, full opacity and no filter.

### No-fill shapes are outline-only for selection
Shapes inherit `pointer-events: all` from the layer `<g>` (`packages/svgcanvas/core/layer.js`), so a `fill="none"` shape would capture clicks across its whole interior. `#svgcontent [fill="none"] { pointer-events: stroke }` restores SVG's expected behaviour: only the stroke is hit-testable and the empty interior is click-through. It keys on the `fill` **attribute** (the form svgedit's colour tools write), so it self-applies and reverts as the fill changes and also covers imported SVGs using `fill="none"`.

---

## Shadow DOM Component CSS

These styles live **inside** each component file and are scoped to the shadow DOM; they can be changed from outside only through CSS custom properties (and `color`, below).

### `se-button` ([seButton.js](../src/editor/components/seButton.js))
A 40 px square (`size="small"`: 30 px) icon button with a 10 px radius and a transparent border. Hover uses `--icon-hover-bg` / `--icon-hover`. `.pressed` (active) uses `--accent-soft` background, `--accent` colour, `--accent-border` and `--active-shadow`, all `!important`. `.locked` (tool lock mode) stacks on `.pressed` with a 2 px accent outline (`se-flyingbutton` mirrors it via `.overall.locked .menu-button`). `.disabled` is 0.35 opacity with `pointer-events: none` (see the disabled gotcha above).

**Icons** are inline SVG (fetched and cached by `svgIconLoader.js`). Because they use `stroke="currentColor"`, the `color:` property recolours them with no CSS filter. From outside a shadow boundary: `se-button { color: var(--icon) }` and `se-button[pressed] { color: var(--accent) }`.

### `se-spin-input` ([seSpinInput.js](../src/editor/components/seSpinInput.js))
The host is `display: flex; flex-direction: column; align-items: stretch`, so the component **fills its grid cell**: a small uppercase `.top-label` (shown only when `label` is set) above one bordered `.field` (34 px, `--field-bg` / `--field-border`, 8 px radius; hover → `--field-border-h`; `focus-within` → `--accent` border + `--accent-ring`). The `src` icon is only a fallback leading glyph when there is **no** `label` (`:host([src]:not([label]))`). A plain native `<input>` is transparent and fills the field; `.spin-buttons` is a right-edge column of two `.spin-btn`s.

- **Hold-repeat:** the ▲ / ▼ buttons step on `mousedown`, then **auto-repeat while held** (400 ms delay, then every 60 ms; stops on any `mouseup`, on reaching min / max, or on disconnect). Every tick fires `change`, so a long hold on an undoable field (e.g. stroke width) records one undo step per tick. Touch has no hold-repeat (mouse events are synthesized only on tap).
- **Scrubby labels:** dragging the `.top-label` (pointer-captured; a 3 px threshold separates click from drag) changes the value, one step per 2 px (**Shift** ×10, **Ctrl/Cmd** ×0.1, which keeps one more decimal than the step), clamped to min / max, `ew-resize` cursor (`.scrubbable`, set on pointerenter from the preference). Every tick fires `change` (live preview), but the drag runs inside `svgCanvas.beginTransaction('Change value')`, so it commits as **one undo step** (a field without a canvas, e.g. in a dialog, just fires the changes); **Escape** cancels, restores the field and refreshes the panels. A plain click on the label focuses the field; touch pointers and the text box never scrub. The **mouse wheel** over a *focused* field steps it with the same modifiers (one `change` per notch); an unfocused field leaves the wheel to the page. Preference `scrub_numeric_fields` (default on; Editor Preferences, `config.scrub_fields`).
- **Arc quick-pick chips** (`svgedit.css`): `.arc_field` (flex column) wraps the arc `se-spin-input` and a `.arc_presets` row of `.arc_preset` buttons (22 px, `--field-bg` / `--field-border`, hover → accent).

### `se-input`, `se-select` ([seInput.js](../src/editor/components/seInput.js), [seSelect.js](../src/editor/components/seSelect.js))
The same single-field + stacked-label treatment as `se-spin-input` (`.top-label` + `.field`, same hover and `focus-within` states). The native `<input>` / `<select>` is transparent and fills the field; `se-select` is `appearance: none` with a built-in `.chev` chevron at the right edge. A `src` icon is a leading glyph only when there is no `label`.

### `se-font-select` ([seFontSelect.js](../src/editor/components/seFontSelect.js))
The same `--group-bg` tray as `se-select`, but the control is a custom `.trigger` button (field background and border, the current font rendered in its own face) opening a fixed-position `.fl-popover` in the same visual language as `se-font-library`: a `--chrome-bg` card, a `.fl-search` box and a scrollable `.fl-list` whose `.fl-item-preview` rows use their option's `font-family`. The active row uses `--accent-soft` / `--accent-border` with an accent check. Theme is synced by toggling `theme-dark` / `theme-light` on the host.

### `se-list` ([seList.js](../src/editor/components/seList.js))
A 28 px icon trigger (`.select-container`, transparent, hover → `--icon-hover-bg`) and a `position: fixed` dropdown (`.options-container`: `--chrome-bg` card with `--chrome-border`, 10 px radius, `z-index: 100`, a flex column).

---

## Theme Switching

The editor applies the theme by toggling classes on `.svg_editor`: use the canonical helper `applyTheme(theme, rootEl)` (`src/editor/themeUtil.js`, `theme` = `'light' | 'dark'`), or from a host (the Obsidian plugin) toggle `theme-dark` / `theme-light` directly on the element. The user preference is `localStorage` `svg-edit-theme`.

## Icon Recolouring Rules

All toolbar SVG icons in `src/editor/images/` use `stroke="currentColor" fill="none"`, so they respond to the CSS `color` property and need no `filter`. **Do not use `filter: var(--icon-filter)`: that pattern is retired.** Recolour from outside a component with `se-button { color: var(--icon) }` / `se-button[pressed] { color: var(--accent) }`.

Icons are injected by `src/editor/components/svgIconLoader.js`, which normalises and caches each SVG. The source comes from the **inlined** registry `src/editor/images/iconRegistry.js` (bundled at build time); `fetch()` is only a fallback for `data:` URIs or icons absent from the registry.

> **Stylesheet loading:** `svgedit.css` (which `@import`s `tablet.css`) is **not** loaded via `<link>`. It is imported as a string (`./svgedit.css?inline`) and injected once as `<style data-svgedit-css>` by `EditorStartup.injectSvgeditStyles()`, so the editor needs no runtime CSS file.
