# SVGedit File Map

> **How to use this doc:** Quick lookup table — find a concern, jump to the file. Line numbers reference points of interest within large files.

---

## Editor (UI Layer) — `src/editor/`

| File | Purpose |
|------|---------|
| `Editor.js` | Main class extending EditorStartup; top-level event handlers, menu callbacks, alignment, groups, exports (~37KB) |
| `EditorStartup.js` | Async `init()` sequence: config → i18n → DOM → SvgCanvas → panels → extensions (~27KB) |
| `ConfigObj.js` | `pref(key)`, `setConfig(obj)`, localStorage persistence (~24KB) |
| `MainMenu.js` | Export, Preferences (~5KB) |
| `Rulers.js` | Canvas ruler rendering and tick marks |
| `themeUtil.js` | `applyTheme(theme, rootEl)` — canonical theme helper |
| `classLibrary.js` | Global class/style-preset store (localStorage `svg-edit-class-library`): `getClasses`/`getClassesForScope`/`getClass`/`saveClass`/`deleteClass`, `elementScope`, `attrCatalog`. Backs `<se-class-select>` |
| `locale.js` | i18next setup, language detection, locale file loading |
| `contextmenu.js` | Right-click context menu setup and handlers |
| `svgedit.css` | All CSS: variables, grid layout, panel/toolbar rules (~750+ lines) |
| `index.html` | Dev + ES-module build entry point |
| `iife-index.html` | Self-contained IIFE build entry |
| `xdomain-index.html` | Cross-domain iframe mode entry |

---

## Panels — `src/editor/panels/`

| File | Purpose |
|------|---------|
| `TopPanel.js` | Quick-action handlers + `updateContextPanel` (shows/hides trays & tab sections); binds relocated zoom/stroke/opacity listeners; `attrChanger()` |
| `TopPanel.html` | Quick-actions bar markup (view/history/object/arrange/zoom trays + path-node panel) |
| `LeftPanel.js` | Drawing tool button handlers; mode switching |
| `LeftPanel.html` | Left sidebar tool buttons |
| `BottomPanel.js` | Color-picker handlers + zoom/stroke/opacity handler methods (listeners bound in TopPanel) |
| `BottomPanel.html` | Bottom "Colors" bar markup (fill/stroke/bg pickers + palette) |
| `RightPanel.js` | Tabbed properties panel: `activateTab`/`autoSelectTab` + layer ops |
| `RightPanel.html` | Right panel markup: tab bar + Design/Text/Effects/Layers tab contents |

---

## Custom Components — `src/editor/components/`

| File | Custom element | Purpose |
|------|---------------|---------|
| `seButton.js` | `<se-button>` | Icon button with pressed/disabled states |
| `seFlyingButton.js` | `<se-flying-button>` | Button with sub-tool flyout |
| `seColorPicker.js` | `<se-color-picker>` | Color selection modal |
| `seSelect.js` | `<se-select>` | Styled `<select>` dropdown |
| `seFontSelect.js` | `<se-font-select>` | Google-style font-family picker: themed popover with a search box and per-font previews (each option rendered in its own typeface). Drop-in replacement for the old `<se-select>` font dropdown — same `value`/`addOption`/`change`/`src`/`options`/`values` interface. Powers `tool_font_family` |
| `seList.js` | `<se-list>` | Icon-based dropdown list |
| `seListItem.js` | `<se-list-item>` | Item inside `<se-list>` |
| `seSpinInput.js` | `<se-spin-input>` | Numeric input with icon/label/spinner |
| `seInput.js` | `<se-input>` | Text input with icon/label |
| `seClassSelect.js` | `<se-class-select>` | Class/style-preset picker for `#elem_class`: scope-filtered dropdown of saved classes + "+"/trash buttons + save/update popover (name, scope, attribute checklist). Applying a class stamps its captured attributes onto the selection as one undo step. Backed by `../classLibrary.js` |
| `seZoom.js` | `<se-zoom>` | Zoom percentage selector |
| `seCanvasSettings.js` | `<se-canvas-settings>` | Canvas-resize popover (W/H inputs + ratio/size presets + Apply/Reset) |
| `seGridSettings.js` | `<se-grid-settings>` | Grid-settings popover (show/snap toggles, shape select, color, step); injected into `#editor_panel` by ext-grid |
| `seOffsetSettings.js` | `<se-offset-settings>` | Path offset/inset popover (distance input + outset/inset toggle + Apply → `svgCanvas.offsetPath`) |
| `sePalette.js` | `<se-palette>` | Color palette swatch grid |
| `seShapeLibrary.js` | `<se-shape-library>` | Shape library modal (48KB) |
| `seFontLibrary.js` | `<se-font-library>` | Google Fonts browser popover (search + category chips, lazy in-font previews via `text=` subset). Picks a font → downloads it once via `fontStore.js`, dispatches `font-pick`. Sole importer of `fontStore.js` (keeps it single-instance) |
| `PaintBox.js` | `<se-paint-box>` | Fill/stroke paint control |
| `svgIconLoader.js` | *(utility)* | Fetches, normalises, and caches SVG icons for inline injection |

---

## Dialogs — `src/editor/dialogs/`

| File | Purpose |
|------|---------|
| `imagePropertiesDialog.js` | Modal for image element properties |
| `editorPreferencesDialog.js` | Editor preferences modal (language, units, rulers; grid settings moved to the grid-settings popover) |
| `exportDialog.js` | Export dialog (PNG/JPG/WebP/PDF options) |
| `imageImportDialog.js` | **Insert image** dialog (`se-image-import-dialog`) — file upload + URL, self-themed shadow DOM |
| `insertImage.js` | `insertImageFromHref(href)` — shared helper that inserts a centered image at natural size (used by the import dialog and ext-opensave) |
| `svgSourceDialog.js` | View/edit raw SVG source |
| `seAlertDialog.js` | Alert dialog (OK only) |
| `seConfirmDialog.js` | Confirm dialog (OK / Cancel) |
| `sePromptDialog.js` | Prompt dialog (text input) |
| `se-elix/` | Elix accessibility library (ARIA-compliant dialog base) |

---

## Extensions — `src/editor/extensions/`

| Folder | Adds |
|--------|------|
| `ext-connector/` | Connector/arrow lines between objects; straight/elbow routing + leader-line preset (`#connector_panel`) |
| `ext-eyedropper/` | Eyedropper color-pick tool |
| `ext-grid/` | Grid overlay + snap |
| `ext-helloworld/` | Minimal example template |
| `ext-layer_view/` | Layer visualization |
| `ext-markers/` | Arrow/marker decorators |
| `ext-opensave/` | File open/save/import/append |
| `ext-overview_window/` | Mini canvas preview |
| `ext-panning/` | Pan/hand tool |
| `ext-polystar/` | Star and polygon tools |
| `ext-shapes/` | Pre-made shape library |
| `ext-storage/` | localStorage auto-save |
| `ext-theme-toggle/` | Light/dark theme button |
| `ext-shadow/` | Drop shadow filter via `<feDropShadow>` — offset X/Y, blur, opacity, color |
| `ext-cutter/` | Cutter (knife) tool — drag a straight line to split selected shapes into two pieces |
| `ext-color-shift/` | Right side-panel section: H/S/L/T relative-delta inputs + Fill/Stroke toggles to shift selection colours |
| `ext-fonts/` | Custom font support: `ext-fonts.js` (DOM glue), `fontStore.js` (IndexedDB cache + `FontFace` registration + Google Fonts download), `google-fonts-catalog.json` (full ~1,934-family static catalog, regenerable from Google's metadata endpoint). Fonts embed as base64 `@font-face` in `<defs>` on export |

---

## SVG Canvas Engine — `packages/svgcanvas/`

| File | Purpose |
|------|---------|
| `svgcanvas.js` | `SvgCanvas` class — aggregates all core modules (~36KB) |
| `core/draw.js` | Shape creation primitives |
| `core/event.js` | All mouse/touch event bindings (~53KB) |
| `core/selected-elem.js` | Move, resize, flip selected elements |
| `core/selection.js` | Selection list management |
| `core/select.js` | Rubber-band selector + resize handles UI |
| `core/path.js` | Path state and node data |
| `core/path-actions.js` | Add/delete/move path nodes |
| `core/elem-get-set.js` | `changeSelectedAttribute()` and attribute I/O |
| `core/history.js` | Undo/redo stack |
| `core/undo.js` | Change recording |
| `core/coords.js` | Coordinate transform + remapping |
| `core/recalculate.js` | Post-change dimension/transform recalc |
| `core/utilities.js` | Large shared utilities (~45KB) |
| `core/paint.js` | Fill, stroke, color management |
| `core/sanitize.js` | SVG security sanitization |
| `core/text-actions.js` | Text cursor/selection editing |
| `core/layer.js` | Layer CRUD |
| `core/boolean-ops.js` | Union, intersect, subtract, exclude (XOR), divide (split bottom by top into separate pieces) |
| `core/path-offset.js` | `offsetPath(delta)` (outset/inset) + `strokeToPath()` via clipper-lib polygon offsetting (paper.js flattening) |
| `core/clip-mask.js` | Set/release/feather clip path & mask — `setClip()`, `setMask()`, `releaseClipMask()`, `setFeather()`/`getFeather()` (bottom of 2 selected is cloned into `<defs>` as the silhouette; top shape gets the `clip-path`/`mask`; both stay visible). Signed feather: +soft edge / −strong rim; auto-converts a clip to a mask |
| `core/cutter.js` | Half-plane intersection cut algorithm — `cutShapes(x1,y1,x2,y2)` |
| `core/json.js` | JSON import/export |
| `core/units.js` | Unit conversion (px↔em↔cm…) |
| `core/math.js` | Transform matrix math |
| `core/paste-elem.js` | Paste handler |
| `core/copy-elem.js` | Copy handler |
| `core/clear.js` | Clear canvas |
| `core/touch.js` | Mobile touch event support |
| `core/blur-event.js` | Blur filter UI helpers |
| `core/dataStorage.js` | Internal element data store |
| `core/namespaces.js` | SVG/XML namespace constants |
| `common/browser.js` | Browser detection utilities |
| `common/util.js` | Common utility functions |
| `common/logger.js` | Logging helpers |

---

## Icons — `src/editor/images/`

All toolbar icons are stroke-based SVGs using `stroke="currentColor" fill="none"`.
They recolor automatically via CSS `color:` property — no filter needed.

Key icon naming: `{action}.svg` e.g. `undo.svg`, `align_left.svg`, `bold.svg`, `c_radius.svg`, `frame.svg` (Frame export-region tool)

---

## Documentation — `docs/`

| Path | Audience | Purpose |
|------|----------|---------|
| `docs/tutorials/` | Developers | API/config reference (CanvasAPI, EditorAPI, Events, etc.) + `tutorials.json` manifest |
| `docs/user-tutorials/` | End users | Short promo-style how-to guides, one per tool/feature (Use case / Relevant for / How to test it / Related properties); `README.md` is the index |

---

## Config & Build

| File | Purpose |
|------|---------|
| `vite.config.mjs` | Vite build config (ES + IIFE outputs, plugins, entry points) |
| `package.json` | Scripts: `build`, `start` (dev server :8000), `build-docs` |
| `packages/svgcanvas/package.json` | svgcanvas workspace package |
| `CLAUDE.md` | This repo's coding guidelines for AI agents |
| `.claude/` | Agent documentation (this folder) |
