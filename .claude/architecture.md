# SVGedit Architecture

> **How to use this doc:** Start with the Directory Tree to orient yourself, then jump to Initialization Flow to understand startup order, or Subsystems table for module responsibilities. When modifying canvas logic, see the SvgCanvas Core Modules table.

---

## Directory Tree

```
svgedit/
├── src/editor/                    # Main editor application (UI layer)
│   ├── Editor.js                  # Main class (extends EditorStartup) — menus, events, top-level handlers
│   ├── EditorStartup.js           # Async init sequence — panels, canvas, extensions, i18n
│   ├── ConfigObj.js               # Configuration + localStorage preferences
│   ├── MainMenu.js                # File-menu operations (export, doc props, prefs)
│   ├── Rulers.js                  # Canvas ruler rendering
│   ├── themeUtil.js               # applyTheme() helper — canonical way to switch light/dark
│   ├── locale.js                  # i18next setup and language loading
│   ├── contextmenu.js             # Right-click context menu
│   │
│   ├── panels/                    # 4 UI panels (each has .js + .html)
│   │   ├── TopPanel.js/.html      # Horizontal toolbar — all shape + text attribute panels
│   │   ├── LeftPanel.js/.html     # Vertical tool sidebar — drawing/selection tools
│   │   ├── BottomPanel.js/.html   # Status bar — fill/stroke/opacity/zoom
│   │   └── RightPanel.js/.html    # Right side panel host: Layers + General/Text/Shadow/Color Shift sections
│   │
│   ├── components/                # Custom HTML elements (shadow DOM, reusable)
│   │   ├── seButton.js            # Clickable icon button
│   │   ├── seFlyingButton.js      # Button with sub-tool variants (flyout)
│   │   ├── seColorPicker.js       # Color selection modal
│   │   ├── seSelect.js            # Custom styled <select>
│   │   ├── seList.js + seListItem.js  # Icon-based list/dropdown
│   │   ├── seSpinInput.js         # Numeric spin input with icon/label
│   │   ├── seInput.js             # Text input with icon/label
│   │   ├── seZoom.js              # Zoom percentage control
│   │   ├── sePalette.js           # Color palette swatch grid
│   │   ├── seShapeLibrary.js      # Shape-library modal/popover (large: 48KB)
│   │   ├── PaintBox.js            # Fill/stroke paint control
│   │   └── svgIconLoader.js       # Shared utility: fetches + inlines SVG icons
│   │
│   ├── dialogs/                   # Modal dialogs (custom elements, Elix-based)
│   │   ├── imagePropertiesDialog.js
│   │   ├── editorPreferencesDialog.js
│   │   ├── exportDialog.js
│   │   ├── svgSourceDialog.js
│   │   ├── seAlertDialog.js / seConfirmDialog.js / sePromptDialog.js
│   │   └── se-elix/               # Elix accessibility library (ARIA dialogs)
│   │
│   ├── extensions/                # Optional plugin modules (see extensions.md)
│   │   ├── ext-connector/         # Connector/arrow tool for diagrams
│   │   ├── ext-eyedropper/        # Pick color/style from canvas element
│   │   ├── ext-grid/              # Grid overlay + snap-to-grid
│   │   ├── ext-helloworld/        # Example/template extension
│   │   ├── ext-layer_view/        # Layer visualization
│   │   ├── ext-markers/           # Arrow/marker decorators on lines
│   │   ├── ext-opensave/          # File open / save / import dialogs
│   │   ├── ext-overview_window/   # Mini canvas preview window
│   │   ├── ext-panning/           # Pan tool (hand) for mobile/touch
│   │   ├── ext-polystar/          # Star and polygon drawing tools
│   │   ├── ext-shapes/            # Pre-made shape library (clipart)
│   │   ├── ext-storage/           # Auto-save to browser localStorage
│   │   └── ext-theme-toggle/      # Light/dark theme toggle button
│   │
│   ├── images/                    # SVG toolbar icons (source of truth; dist/ is generated)
│   ├── locale/                    # i18n JSON translation files
│   ├── svgedit.css                # Main stylesheet — CSS variables + grid layout
│   └── tests/                     # Unit tests
│
├── packages/svgcanvas/            # Core drawing engine (separate npm workspace)
│   ├── svgcanvas.js               # SvgCanvas class (aggregates all core modules)
│   ├── core/                      # 34 single-responsibility modules (see table below)
│   └── common/                    # Shared utilities (browser.js, util.js, logger.js)
│
└── vite.config.mjs                # Build configuration (Vite)
```

---

## Key Subsystems

| Subsystem | File(s) | Responsibility |
|-----------|---------|----------------|
| **Editor** | `Editor.js` | Top-level orchestration: menus, event routing, alignment, groups, exports |
| **EditorStartup** | `EditorStartup.js` | Async init: load config → i18n → DOM → SvgCanvas → panels → extensions |
| **SvgCanvas** | `packages/svgcanvas/svgcanvas.js` + `core/` | All SVG creation, selection, transforms, undo/redo, path editing |
| **ConfigObj** | `ConfigObj.js` | Settings storage, `pref(key)`, `setConfig(obj)`, localStorage persistence |
| **TopPanel** | `panels/TopPanel.js/.html` | Shape attribute panels, text tools, alignment, boolean ops, path node editing |
| **LeftPanel** | `panels/LeftPanel.js/.html` | Drawing tool buttons (select, rect, circle, path, text, etc.) |
| **BottomPanel** | `panels/BottomPanel.js/.html` | Fill/stroke colors, stroke width/style/cap/join, opacity, zoom |
| **RightPanel** | `panels/RightPanel.js/.html` | Hosts the right side panel (`#sidepanel_content`): Layers tool + context-aware sections (General, Text, Shadow, Color Shift) injected here |
| **MainMenu** | `MainMenu.js` | Export, Document Properties, Preferences, Homepage links |
| **Components** | `components/*.js` | Reusable shadow-DOM web elements (buttons, inputs, selects, color pickers) |
| **Dialogs** | `dialogs/*.js` | Modal dialogs (export, prefs, image props, SVG source, alerts) |
| **Extensions** | `extensions/ext-*/` | Plugin system — adds tools, UI, and canvas behaviors |

---

## Initialization Flow

```
src/editor/index.html
  └─→ import Editor.js
        └─→ new Editor(containerEl)       // EditorStartup.constructor()
              └─→ editor.init()           // EditorStartup.init()  [async]
                    ├── configObj.load()             // load prefs from localStorage
                    ├── putLocale()                  // load i18n translations
                    ├── import all components + dialogs  // register custom elements
                    ├── render editorTemplate        // insert full DOM structure
                    ├── new SvgCanvas(svgcanvasEl)   // create drawing engine
                    ├── leftPanel.init()
                    ├── bottomPanel.init()
                    ├── topPanel.init()
                    ├── rightPanel.init()
                    ├── mainMenu.init()
                    ├── bind svgCanvas events:
                    │     selected   → selectedChanged()   // update attribute panels
                    │     changed    → elementChanged()    // update coordinates
                    │     zoomed     → zoomChanged()
                    │     exported   → exportHandler()
                    │     ... (15+ events)
                    ├── readySignal()                // fire 'svgEditorReady' event
                    ├── dynamically import each extension
                    └── setBackground()
```

---

## SvgCanvas Core Modules (`packages/svgcanvas/core/`)

| Module | Purpose |
|--------|---------|
| `draw.js` | Shape creation primitives (rect, circle, ellipse, text, line, path…) |
| `event.js` | All mouse/touch event bindings + custom event dispatch (~53KB) |
| `selected-elem.js` | Manipulate selected element(s): move, resize, flip |
| `selection.js` | Selection list management |
| `select.js` | Selector UI object (rubber-band, resize handles) |
| `path.js` | Path element state and node data |
| `path-actions.js` | Path editing operations (add/delete/move nodes) |
| `path-method.js` | Path utility methods |
| `svg-exec.js` | Execute high-level SVG operations |
| `elem-get-set.js` | `changeSelectedAttribute()` and attribute getters/setters |
| `history.js` | Undo/redo stack data structures |
| `undo.js` | Recording changes into history |
| `coords.js` | Coordinate transforms + remapping between spaces |
| `recalculate.js` | Recalculate dimensions/transforms after changes |
| `utilities.js` | Large shared utilities (~45KB) |
| `paint.js` | Fill, stroke, and color management |
| `sanitize.js` | SVG sanitization for security |
| `text-actions.js` | Text element editing (cursor, selection) |
| `layer.js` | Layer CRUD (add, delete, rename, reorder) |
| `boolean-ops.js` | Union, intersect, subtract operations |
| `json.js` | JSON import/export of SVG data |
| `units.js` | Unit conversion (px, em, cm, mm, in…) |
| `math.js` | Transform matrix operations |
| `paste-elem.js` | Paste operation handler |
| `copy-elem.js` | Copy element to clipboard |
| `clear.js` | Clear canvas |
| `touch.js` | Mobile touch event support |
| `blur-event.js` | Gaussian blur filter UI helpers |
| `dataStorage.js` | Internal element data storage |
| `namespaces.js` | SVG/XML namespace constants |

---

## Extension Plugin Lifecycle

1. Host sets `setConfig({ extensions: ['ext-polystar', 'ext-grid', ...] })`
2. `EditorStartup` dynamically imports each: `import('./extensions/ext-name/ext-name.js')`
3. Each extension default-exports `{ name: 'ext-name', init(S) { ... } }`
4. `init(S)` receives a context object `S` with `svgCanvas`, `editor`, `addLangData`, etc.
5. Extension can: add buttons to panels, register new `mode` handlers, listen for canvas events, inject UI HTML

See [extensions.md](extensions.md) for the full extension reference.

---

## Build Pipeline

```
npm run build
  ├── builds packages/svgcanvas  → dist/svgcanvas.js
  └── builds src/editor          → dist/editor/
        ├── Editor.js            (ES module — for npm consumers)
        ├── iife-Editor.js       (self-contained bundle — for <script> tag)
        └── assets/              (CSS, icons, locale files)

npm start           → Vite dev server on http://localhost:8000
npm run build-docs  → JSDoc HTML docs
```

Entry points: `src/editor/index.html` (dev + ES build) · `iife-index.html` (IIFE build) · `xdomain-index.html` (cross-domain iframe mode)

---

## Event Flow Example: Draw a Rectangle

```
1. User clicks Rectangle button in LeftPanel
2. LeftPanel calls editor.setMode('rect')
3. Editor.setMode() → svgCanvas.setMode('rect')
4. SvgCanvas stores currentMode = 'rect', fires modeChange event
5. Editor.modeListener() updates LeftPanel button states
6. User drags on canvas
7. SvgCanvas event.js handles mousedown/mousemove/mouseup
8. draw.js creates <rect> element in SVG DOM
9. SvgCanvas fires 'changed' event
10. Editor.elementChanged() → updates BottomPanel coordinates
11. SvgCanvas fires 'selected' event with new element
12. Editor.selectedChanged() → TopPanel shows rect_panel, updates attribute inputs
13. RightPanel updates to show new element in active layer
```
