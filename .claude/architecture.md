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
│   ├── MainMenu.js                # File-menu operations (export, doc props, prefs, hotkey manager, favorites)
│   ├── Hotkeys.js                 # HotkeyManager — central registry + dispatcher for all keyboard shortcuts
│   ├── favorites.js               # Quick-action favorites store (load/save/toggle; svg-edit-favorites)
│   ├── favoriteActions.js         # Catalog of favoritable actions (registry superset: triggers + value controls)
│   ├── Rulers.js                  # Canvas ruler rendering
│   ├── themeUtil.js               # applyTheme() helper — canonical way to switch light/dark
│   ├── userDataAdapter.js         # Registry for optional host storage adapter (palette + user shapes + hotkeys + favorites); localStorage fallback
│   ├── locale.js                  # i18next setup and language loading
│   ├── contextmenu.js             # Extension custom-handler hook for context-menu actions (see also dialogs/cmenuDialog.js — the canvas quick-action menu)
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
│   │   ├── seCanvasSettings.js    # Canvas-resize popover (W/H + presets + Apply/Reset) + Layouts section (canvasLayouts.js)
│   │   ├── sePalette.js           # Color palette swatch grid
│   │   ├── seShapeLibrary.js      # Shape-library modal/popover (large: 48KB)
│   │   ├── PaintBox.js            # Fill/stroke paint control
│   │   └── svgIconLoader.js       # Shared utility: fetches + inlines SVG icons
│   │
│   ├── dialogs/                   # Modal dialogs (custom elements, native <dialog>-based)
│   │   ├── imagePropertiesDialog.js
│   │   ├── editorPreferencesDialog.js
│   │   ├── exportDialog.js
│   │   ├── imageImportDialog.js     # Insert-image dialog (file upload + URL)
│   │   ├── insertImage.js           # insertImageFromHref() + insertSvgElements() helpers
│   │   ├── traceImage.js            # traceImageToSvg() — raster <image> → editable paths (imagetracerjs)
│   │   ├── seTraceDialog.js         # "Convert to editable SVG" options dialog (se-trace-dialog)
│   │   ├── svgSourceDialog.js
│   │   ├── SePlainAlertDialog.js     # native-<dialog> choice-prompt base class
│   │   ├── seAlertDialog.js / seConfirmDialog.js / sePromptDialog.js / seSelectDialog.js
│   │   └── seTextPromptDialog.js     # on-brand window.prompt replacement (window.sePrompt)
│   │
│   ├── extensions/                # Optional plugin modules (see extensions.md)
│   │   ├── ext-connector/         # Line-binding engine behind the Line tool (endpoint↔shape binding)
│   │   ├── ext-eyedropper/        # Pick color/style from canvas element
│   │   ├── ext-grid/              # Grid overlay + snap-to-grid
│   │   ├── ext-layer_view/        # Layer mode: Focus (isolate current layer) + All Layers (cross-layer select)
│   │   ├── ext-markers/           # Arrow/marker decorators on lines
│   │   ├── ext-opensave/          # File open / save / import dialogs
│   │   ├── ext-panning/           # Pan tool (hand) for mobile/touch
│   │   ├── ext-polystar/          # Star and polygon drawing tools
│   │   ├── ext-brush/             # Pressure-sensitive freehand brush (perfect-freehand)
│   │   ├── ext-curvature/         # Curvature tool — Spiro smooth curves
│   │   ├── ext-puppet-warp/       # Puppet warp — MLS rigid mesh deformation (mls.js)
│   │   ├── ext-proportion-markers/ # Wireframe-only edge proportion ticks
│   │   ├── ext-smart-guides/      # Smart alignment guide overlay + snap toggle
│   │   ├── ext-corner-radius/     # "Corners" panel — arc-fillet rounding
│   │   ├── ext-repeat/            # Radial/grid repeat (array) tool
│   │   ├── ext-mirror/            # Mirror drawing mode (API-only) + live linked symmetry
│   │   ├── ext-taper/             # Tapered-stroke popover (core/taper-stroke.js glue)
│   │   ├── ext-text-path/         # Text-on-path attach button + offset panel
│   │   ├── ext-shape-builder/     # Interactive paint-to-merge region mode
│   │   ├── ext-shapes/            # Pre-made shape library (clipart, incl. Accents)
│   │   ├── ext-fonts/             # Font catalog + Google Fonts loading for the Text tab
│   │   ├── ext-shadow/            # Drop shadow filter (feDropShadow)
│   │   ├── ext-outline/           # Second outline/halo color for line strokes (feMorphology)
│   │   ├── ext-cutter/            # Cutter (knife) tool — split shapes along a drawn line
│   │   ├── ext-color-shift/       # H/S/L/T relative color-delta panel
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
| **TopPanel** | `panels/TopPanel.js/.html` | "Quick actions" bar: view toggles, undo/redo, clone/delete, group/ungroup, layering, flip, align, zoom, path-node editing. Also **binds** the relocated zoom + stroke + opacity listeners (it inits last) |
| **LeftPanel** | `panels/LeftPanel.js/.html` | Drawing tool buttons (select, rect, circle, path, text, etc.) |
| **BottomPanel** | `panels/BottomPanel.js/.html` | "Colors" bar: fill/stroke/background color pickers + quick palette only |
| **RightPanel** | `panels/RightPanel.js/.html` | Tabbed properties panel (**Design / Text / Effects / Layers**). `activateTab`/`autoSelectTab` switch tabs; shape-dimension, stroke, text, blur, clip/mask, boolean, layers sections live in the tab containers; ext-shadow/ext-color-shift inject into `#tab_effects` |
| **TabletShell** | `panels/TabletShell.js/.html` + `tablet.css` + `uiMode.js` | Optional touch-first shell (command bar + contextual bottom sheet) layered over `#workarea`. A presentation layer only — every control calls an existing `svgCanvas.*`/`editor.*` method. Toggled from the SVG-Edit menu (`MainMenu.clickTabletMode` → `applyUiMode` + `tabletMode` pref); shown only while `.svg_editor` has the `ui-tablet` class. Hides the four desktop panels via CSS |
| **MainMenu** | `MainMenu.js` | Export, Preferences, Tablet mode, Hotkey Manager, Favorites |
| **HotkeyManager** | `Hotkeys.js` | Single registry + dispatcher for **all** keyboard shortcuts. Ingests `Editor.shortcuts` (editor-level, incl. curated keyless dropdown/context commands) and **every** `se-button` (pushed via `registerEl` on connect, bindable even with no default `shortcut`) + `se-menu-item[shortcut]`; installs one document keydown listener (replacing the old per-button + `setAll()` listeners); does conflict detection and per-user overrides (persisted via `userDataAdapter` `getHotkeys`/`setHotkeys` or localStorage `svg-edit-hotkeys`). Read by `se-hotkey-dialog`. Exposes `getAction(id)` for the favorites menu |
| **Favorites / quick-action menu** | `favorites.js`, `favoriteActions.js`, `dialogs/favoritesDialog.js`, `dialogs/cmenuDialog.js` | Canvas right-click menu rebuilt per-open from user-starred favorites. `favoriteActions.js` catalog = hotkey registry superset (triggers + paste + live value controls). `se-favorites-dialog` curates the list (star toggles); `se-cmenu_canvas-dialog` renders it. Persisted via `userDataAdapter` `getFavorites`/`setFavorites` or localStorage `svg-edit-favorites` |
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
                    ├── rightPanel.init()      // builds the tabbed side panel
                    ├── topPanel.init()        // LAST → can bind any control in any
                    │                          //   panel (e.g. zoom/stroke/opacity that
                    │                          //   physically live elsewhere)
                    ├── mainMenu.init()
                    ├── tabletShell.init()     // builds tablet command bar + sheet;
                    │                          //   binds its own selected/changed/zoomed
                    │                          //   handlers directly (svgCanvas.bind is
                    │                          //   backed by a native EventTarget, so this
                    │                          //   coexists with the binds registered below)
                    ├── bind svgCanvas events:
                    │     selected   → selectedChanged()   // update attribute panels
                    │     changed    → elementChanged()    // update coordinates
                    │     zoomed     → zoomChanged()
                    │     exported   → exportHandler()
                    │     ... (15+ events)
                    ├── readySignal()                // fire 'svgEditorReady' event
                    ├── resolve each extension from extensionRegistry.js (inlined)
                    └── setBackground()
```

---

## SvgCanvas Core Modules (`packages/svgcanvas/core/`)

| Module | Purpose |
|--------|---------|
| `draw.js` | Shape creation primitives (rect, circle, ellipse, text, line, path…); also the `Drawing` class (layer CRUD, current-layer tracking). `Drawing.refreshLayerPointerEvents()` is the single place layer `pointer-events` gets set — normally only `current_layer` is `'all'` (rest `'none'`, the base single-layer-selectable isolation), but `setAllLayersMode(bool)`/`getAllLayersMode()` (exported as `svgCanvas.setAllLayersMode`/`getAllLayersMode`) flips every layer to `'all'` so any layer's elements are selectable at once — used by `ext-layer_view`'s All Layers sub-mode |
| `event.js` | mouseDown/mouseMove/mouseUp orchestrators (shared prelude, hit-testing, dispatch to the `event-*.js` mode-family modules, epilogue) + custom event dispatch, `dblClickEvent`, `mouseOutEvent`, `DOMMouseScrollEvent`/`zoomAtPoint` |
| `event-group-context.js` | Group-local coordinate helpers shared across `event.js` and the select/shape-draw handlers (`toCurrentGroupLocalDelta`/`Point`, `isCreateInCurrentGroup`) |
| `event-select.js` | `select`/`multiselect` mode: drag-move w/ snapping, rubber-band multiselect, mouseUp transform-consolidation tail (shared via fallthrough with `resize`) |
| `event-resize.js` | `resize` mode: single-element + multi-element `resizeGroup` uniform scale |
| `event-rotate.js` | `rotate` mode: single-element + multi-element `rotateGroup` rigid rotate |
| `event-shape-draw.js` | Shape-creation modes (rect/circle/ellipse/line/text/image/frame/freehand…) |
| `event-path-edit.js` | `path`/`pathedit` mode — thin delegates onto `path-actions.js` |
| `event-text-edit.js` | `textedit` mode — thin delegates onto `text-actions.js` |
| `event-zoom.js` | `zoom` mode (marquee-zoom rubber band) |
| `selected-elem.js` | Manipulate selected element(s): move, resize, flip; z-order (`moveToTopSelectedElement`, `moveToBottomSelectedElement`, `moveUpDownSelected`, `switchSelectedZorder`) |
| `selection.js` | Selection list management; `updateGroupSelector()` toggles the multi-select group box. `getMouseTargetFromNode` (click hit-testing) and `getIntersectionListMethod` (rubber-band) both normally resolve/scope to the current layer only, but widen to any layer when `svgCanvas.getAllLayersMode()` is on (and no group-isolation context is active) |
| `select.js` | Selector UI object (rubber-band, resize handles); `SelectorManager.showGroupSelector(bbox, angle)`/`hideGroupSelector()` draw one union box + 8 resize grips **+ the rotate grip** around a multi-selection (the optional `angle` rotates the box+grips rigidly during a live group rotation) |
| `path.js` | Path element state and node data |
| `path-actions.js` | Path editing operations (add/delete/move nodes) |
| `path-method.js` | Path utility methods |
| `path-seg-shim.js` | Self-installing `pathSegList`/`createSVGPathSeg*`/`SVGPathSeg.PATHSEG_*` replacement, backed by the `svgpath` package (no browser API dependency — replaces the old `pathseg` polyfill) |
| `svg-exec.js` | Execute high-level SVG operations |
| `elem-get-set.js` | `changeSelectedAttribute()` and attribute getters/setters |
| `history.js` | Undo/redo stack data structures |
| `undo.js` | Recording changes into history |
| `coords.js` | Coordinate transforms + remapping between spaces |
| `recalculate.js` | Recalculate dimensions/transforms after changes |
| `dom-utils.js` | DOM/element manipulation, lookup, ids/refs, snapping, `$id`/`$qq`/`$qa` shortcuts |
| `bbox-utils.js` | Bounding-box computation (`getBBox`, `getBBoxWithTransform`, `getStrokedBBox`, `getVisibleElements`) |
| `path-utils.js` | Path `d`-attribute construction and element-to-path conversion |
| `encoding-utils.js` | String/XML/base64 encoding (`toXml`, `encode64`, `text2xml`, …) |
| `paint.js` | Fill, stroke, and color management |
| `sanitize.js` | SVG sanitization for security |
| `text-actions.js` | Text element editing (cursor, selection) |
| `layer.js` | Layer CRUD (add, delete, rename, reorder) |
| `paper-utils.js` | Shared paper.js helpers for the six geometry-tool modules below: `getPaperScope()` (one lazy singleton scope shared by all of them), `getStyleAttrs(elem, extraAttrs)`, `svgToPaper(elem, scope, {asCompoundPath, flatten})` (element → paper.Path/CompoundPath with its own transform applied) |
| `boolean-ops.js` | Union, intersect, subtract, exclude, divide (uses `paper-utils.js`) |
| `cutter.js` | Cutter/knife tool — half-plane intersection cut (uses `paper-utils.js`) |
| `segment.js` | **Segment** tool — divides a single shape into symmetric pieces via evenly-spaced dividing lines: radial (spokes from a center) or grid (parallel vertical/horizontal lines). Split mode cuts via paper.js `intersect()` against a generated wedge/strip polygon per piece (uses `paper-utils.js`); non-split mode clips the divider lines to the shape's true boundary via `getIntersections()` and wraps shape+lines in a `<g>`, re-editable via an `se:segment` attribute stamp |
| `path-offset.js` | `offsetPath(delta)` (outset/inset) + `strokeToPath()` via clipper-lib polygon offsetting (paper.js flattening via `paper-utils.js`) |
| `path-simplify.js` | paper.js curve fitting: `simplifyFreehand` (pencil commit) + `previewSmoothPath`/`commitSmoothPath`/`cancelSmoothPath` ("Smooth Path" popover, non-destructive session baseline so repeated strength adjustments never compound) (uses `paper-utils.js`'s shared scope) |
| `smart-guides.js` | Object-to-object snap math (`collectSnapTargets`/`snapMovingBBox`/`findEqualSpacing`); consumed by `event.js` select-move, rendered by ext-smart-guides |
| `corner-radius.js` | Attribute-driven corner fillets (`se:corner-radius`/`se:orig-d`); `remapCornerSource` keeps the source in sync from `coords.js` |
| `taper-stroke.js` | Tapered strokes (`se:taper`/`se:taper-d`/`se:taper-style`): stroked open path → filled variable-width outline via paper.js normal offsetting (`paper-utils.js`'s shared scope); `remapTaperSource` keeps the centerline in sync from `coords.js` |
| `image-crop.js` | Destructive re-encode crop for `<image>` elements — resamples the source pixels to just the cropped region via canvas `drawImage`, replacing `href`/`x`/`y`/`width`/`height` in one undo step; excludes vault-linked and transformed images. Own hand-rolled overlay/drag mechanics, not `select.js`'s `SelectorManager` |
| `load-image.js` | Shared `loadImage(href)` — `HTMLImageElement` loader with CORS handling, used by both `image-crop.js` and `dialogs/traceImage.js` |
| `text-path.js` | Text on path: attach/detach a `<textPath>` (href + xlink:href), rail auto-converted to `<path>`, `textPathOffset(pct)` for startOffset |
| `shape-builder.js` | Shape-builder region math (`svgCanvas.shapeBuilder`): planar arrangement via iterative paper.js booleans (uses `paper-utils.js`); merge/delete gestures as BatchCommands |
| `json.js` | JSON import/export of SVG data |
| `units.js` | Unit conversion (px, em, cm, mm, in…) |
| `math.js` | Transform matrix operations |
| `proportions.js` | Wireframe proportion-marker tiers (fractions/sizes/colors) + `proportionLines()`; shared by `event.js` snapping and `ext-proportion-markers` |
| `paste-elem.js` | Paste operation handler |
| `copy-elem.js` | Copy element to clipboard |
| `clear.js` | Clear canvas |
| `touch.js` | Mobile touch event support; tablet-mode two-finger pinch-to-zoom via `svgCanvas.zoomAtPoint` |
| `blur-event.js` | Gaussian blur filter UI helpers |
| `dataStorage.js` | Internal element data storage |
| `namespaces.js` | SVG/XML namespace constants |

---

## Extension Plugin Lifecycle

1. Host sets `setConfig({ extensions: ['ext-polystar', 'ext-grid', ...] })`
2. `EditorStartup` resolves each from the inlined `extensionRegistry.js` (eager
   glob — bundled into `Editor.js`, no runtime fetch from `extPath`)
3. Each extension default-exports `{ name: 'ext-name', init(S) { ... } }`
4. `init(S)` receives a context object `S` with `svgCanvas`, `editor`, `addLangData`, etc.
5. Extension can: add buttons to panels, register new `mode` handlers, listen for canvas events, inject UI HTML

See [extensions.md](extensions.md) for the full extension reference.

---

## Host data persistence (`userDataAdapter`)

By default the editor persists four pieces of user customization to its own
`localStorage`: the **custom palette** (`sePalette.js`, key
`svg-edit-custom-palette`), the **saved shape library** (`userShapes.js`, key
`svg-edit-user-shapes` — store is `{ categories, shapes, categoryLabels, hidden }`,
where `categoryLabels` holds display-name overrides and `hidden` holds non-destructively
hidden built-in category ids; see [tools.md](tools.md) "Library management"),
**hotkey overrides** (`Hotkeys.js`, key
`svg-edit-hotkeys`), and **quick-action favorites** (`favorites.js`, key
`svg-edit-favorites`).

An embedding host that wants this data in *its own* store (so it survives
updates / syncs) passes an adapter via `setConfig`:

```js
setConfig({ userDataAdapter: {
  getPalette (), setPalette (overrides),       // sync read / fire-and-forget write
  getUserShapes (), setUserShapes (store),
  getHotkeys (), setHotkeys (overrides),       // hotkey overrides { id: [keys] }
  getFavorites (), setFavorites (ids)          // quick-action favorites [id, …]
}})
```

`EditorStartup.init()` registers it once into the `userDataAdapter.js` module
registry **before** any component is constructed; `sePalette.js`,
`userShapes.js`, `Hotkeys.js`, and `favorites.js` resolve it via `getUserDataAdapter()`. Reads
are synchronous; writes receive the full current state on every edit. Each
method is independent and optional — a host can implement only some. When no
adapter (or method) is set, that data falls back to the localStorage behavior
above — standalone svgedit is unchanged.

### Live refresh across instances — `svgEditor.reloadUserData()`

When several editor instances share one backing store, a write by one instance
leaves the others showing their stale in-memory copy. The public method
`svgEditor.reloadUserData()` (on `Editor`, see `Editor.js`) re-reads **both**
stores from the adapter (or localStorage fallback) and re-renders the palette
and shape library **for that instance only** — the host calls it on every
*other* open instance after a write. It resolves both components through the
instance's own root (`this.$svgEditor`), never a document-wide query, and
no-ops safely when a component isn't mounted. Mechanics:

- **Palette** — `sePalette.js` exposes a public `reload()` that re-runs
  `loadOverrides()` + `renderSwatches()`.
- **Shape library** — dispatches the existing `user-shapes-updated` event on
  each `se-shape-library` element (desktop `#tool_shapelib` and the tablet
  shell's instance), driving `_reloadUserShapes()`.

---

## Build Pipeline

```
npm run build
  ├── builds packages/svgcanvas  → dist/svgcanvas.js
  └── builds src/editor          → dist/editor/
        ├── Editor.js            (self-contained ES module — all assets inlined)
        └── *.html               (entry pages; copy-static.mjs)

npm start           → Vite dev server on http://localhost:8000
npm run build-docs  → JSDoc HTML docs
```

Entry point: `src/editor/index.html` (dev + ES build) — this is the only build
entry; the IIFE (`iife-index.html`/`iife-Editor.js`) and cross-domain iframe
(`xdomain-index.html`) entries were dropped since the sole consumer (the
Obsidian plugin) imports the ES module directly. Sourcemaps are opt-in:
`SOURCEMAP=true npm run build` (default builds skip them — the plugin never
consumes maps, and they roughly triple `dist/` size).

### Self-contained bundle (no runtime asset folder)

`Editor.js` inlines **every** asset so a consumer (e.g. the Obsidian plugin's
esbuild) can bundle it into a single file with no `images/`/`extensions/`/CSS
folder and **no custom loaders**. The inlining mechanism is Vite's
`import.meta.glob({ eager: true })` / `?raw` / `?inline`, which Rollup resolves
statically:

| Asset | Inlined via | Entry point |
|---|---|---|
| Toolbar icons + cursors | `import.meta.glob('*.svg', '?raw')` | [`images/iconRegistry.js`](../src/editor/images/iconRegistry.js) → `svgIconLoader.js` |
| Extensions | `import.meta.glob('ext-*/ext-*.js', eager)` | [`extensions/extensionRegistry.js`](../src/editor/extensions/extensionRegistry.js) |
| Extension + UI locales | `import.meta.glob('locale/*.js', eager)` | each `ext-*.js`; `locale.js` |
| `svgedit.css` (+ tablet) | `import css from './svgedit.css?inline'` | `EditorStartup.injectSvgeditStyles()` |
| Shape library JSON | `import.meta.glob('shapelib/*.json', eager)` | `components/seShapeLibrary.js` |
| Google-fonts catalog | static JSON import | `components/seFontLibrary.js` |

Runtime `fetch()` survives only for genuinely external/dynamic content
(Google-fonts network downloads, user-supplied SVG URLs) and as guarded
fallbacks behind the inlined data.

---

## Host bridge (`window.svgEditHost`)

An **optional, feature-detected** global an embedding host (e.g. the Obsidian
plugin) may install so the editor can reach host-only resources. It is
deliberately host-agnostic — no Obsidian naming — so it respects the repo
boundary. When the global is absent, all dependent UI is hidden and standalone
svgedit is unchanged.

Methods (all optional, async):

| Method | Returns | Used by |
|---|---|---|
| `pickVaultImage()` | `{ dataUrl, link, locked?, editableSvg? } \| null` | Image dialog "Import from vault" |
| `pickVaultFile()` | `{ link } \| null` | "Add to Shape Library" link control |

**Locked vs. unlocked imports.** `pickVaultImage()` returns one of two shapes
that select how the drawing is inserted:

- **Embed (locked / raster / frame crop)** — `{ dataUrl, link, locked? }`. Goes
  through `insertImageFromHref` as a single `<image>`. `locked` additionally
  stamps `data-vault-locked` so the host re-bakes content from source.
- **Editable (whole-drawing unlocked)** — `{ dataUrl, link, editableSvg }` where
  `editableSvg` is the full `<svg>…</svg>` source. When that field is a
  non-empty string the editor inserts the drawing as **real, editable elements**
  via `insertSvgElements` (`dialogs/insertImage.js`): the source's drawable
  top-level elements go in as **individual, directly-selectable** elements in the
  current layer (NOT wrapped in one group — wrapping made multi-object drawings
  select as one giant group with grips in empty canvas and shapes unclickable);
  paint-server/defs content goes to the canvas `<defs>`. IDs are uniquified
  together, the import is centered on page and multi-selected (so it still moves
  as a unit right after import), and recorded as one undoable `BatchCommand`.
  `editable` implies unlocked, so `locked` is ignored and `data-vault-locked` is
  never set. `dataUrl` is still used for the dialog's preview thumbnail.

**Provenance stamping — `data-vault-link`.** All flows record the returned
`link` as a `data-vault-link` attribute on the inserted element(s):

- Image import → stamps the single `<image>` (`dialogs/insertImage.js`).
- Editable SVG import → stamps each inserted top-level element
  (`dialogs/insertImage.js`); the host's backlink reconciler dedupes by link
  value, so the repeats collapse to one backlink. Never re-baked.
- Shape insert → stamps the imported root **and every descendant**
  (`extensions/ext-shapes/ext-shapes.js`) so the link survives ungroup / partial
  deletion; it disappears only when the last stamped element is gone.

**System-clipboard paste (Ctrl/Cmd+V).** A single native `paste` listener in
`EditorStartup.js` (`this.pasteHandler`, registered with a remove-before-add
guard like `keydownHandler`) is the sole arbiter of paste; there is **no** `v`
keyboard shortcut in `Editor.js` anymore. The system clipboard decides the path:
internal copy mirrors its JSON array onto the clipboard
(`copySelectedElements` in `core/selected-elem.js` → `navigator.clipboard.writeText`)
so the handler can distinguish svgedit's own clipboard (a JSON array →
`pasteInCenter()` → `pasteElements`, reading `sessionStorage`) from an external
SVG document (`<svg>…</svg>` text, e.g. another editor's "Copy as SVG" → imported
via `importSvgString`, then `selectOnly` + `ungroupSelectedElement` to convert the
non-editable `<use>`/`<symbol>` reference into a real editable group, then centered).
Without the ungroup step the paste lands as one opaque, non-editable object. Editable
fields (`INPUT`/`TEXTAREA`/contentEditable) are skipped so their native paste
works. This single-arbiter design avoids double-pasting when both an internal copy
and external SVG are present.

`data-*` attributes round-trip through sanitize (explicit bypass in
`packages/svgcanvas/core/sanitize.js`) and `getSvgString()` serialization — the
same mechanism `data-frame` (frame export) relies on. The host reads the
attribute back from the serialized SVG on save; svgedit emits no events for it.

**Referenced `<defs>` travel with a copy.** A selection that uses gradients,
filters, markers, masks or clip-paths references them by `url(#id)` into the
canvas `<defs>` — those def elements are **not** selected, so a naive copy left
the references dangling when pasted into another drawing (and
`restoreRefElements` then appended a literal `"undefined"` text node into
`<defs>`, corrupting it). Both copy paths now collect the transitively
referenced defs via `getReferencedDefElements(elems)`
(`packages/svgcanvas/core/dom-utils.js`):
- **Clipboard copy/paste** — `copySelectedElements` tags each referenced def's
  JSON with `_defs:true` and prepends them to the clipboard array; `pasteElements`
  recreates `_defs` entries in `<defs>` **first** (so the shapes' refs resolve),
  with the existing id-remap keeping references consistent.
- **Shape library** — `_addSelectedToShapeLibrary` (`EditorStartup.js`) serializes
  the referenced defs into a leading `<defs>…</defs>` so the saved `svgContent` is
  self-contained; on insert, `ext-shapes.js` splits the defs off, imports both,
  and calls `remapElementIdsAndRefs([shape, ...defs], getNextId)` so repeated
  insertions get independent, collision-free ids.
- **Duplicate** — `cloneSelectedElements` (`core/selected-elem.js`) clones the
  referenced defs (`def.cloneNode(true)`) and remaps each duplicate's own
  `url(#…)`/`href` references onto the clones via `remapElementIdsAndRefs`,
  before `copyElem` builds the shape clones. Without this the duplicate shared
  the *same* `<filter>`/gradient/marker node as the original — most visibly
  with the drop-shadow effect, whose filter region is a bbox snapshot
  (`fx-filter.js`'s `setRegion`): a duplicate sharing the original's filter
  rendered clipped to the original's position/size until the original was
  touched again.

`restoreRefElements` (`svgcanvas.js`) only restores a missing ref when it was
actually tracked in `this.removedElements` (guards against the `append(undefined)`
corruption above).

**A cloned/pasted effect filter's ownership no longer depends on its id.**
`fx-filter.js`'s `isOurFilter` used to check `filter.id === \`${elem.id}_fx\`` —
true for a freshly-built filter, but broken the moment the filter gets a new id
that doesn't follow that convention (which duplicate's `remapElementIdsAndRefs`
and paste's `checkIDs` id-remap scheme both produce). `buildFilter` now stamps
a `data-fx="1"` marker on every filter it creates, and `isOurFilter` checks that
attribute first (falling back to the old id-suffix check for filters saved
before the marker existed). `svg-exec.js`'s `convertDropShadowFilters` — the
load-time region-repair pass — retrofits the marker onto legacy filters so a
loaded drawing self-heals without needing the id fallback going forward.

**Copy/paste & duplicate keep the source id prefix.** A copy preserves the
copied element's own id prefix instead of forcing the default `svg_` — e.g.
`ellipse_1` → `ellipse_2`, a renamed `foo_1` → `foo_2`, a `<g>` `svg_18` → `svg_19`.
Both paths derive the prefix by stripping the trailing digits of the source id
and call `Drawing.getNextIdWithPrefix(prefix)` (`core/draw.js`), which bumps the
shared `obj_num` counter until the id is unused (so no duplicate is produced; the
number follows the global counter, not literally source+1). Paste applies this in
`checkIDs` (`core/paste-elem.js`); duplicate applies it via the `copyElem(el, getNextId)`
closure (`core/copy-elem.js` now passes the source element to `getNextId`).

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
10. Editor.elementChanged() → updates position/size inputs (Right panel Design tab)
11. SvgCanvas fires 'selected' event with new element
12. Editor.selectedChanged() → updateContextPanel shows the rect_panel section in the
    Design tab + the top object/arrange trays; autoSelectTab keeps Design active
13. RightPanel updates to show new element in active layer
```

---

## Group editing (drill-in)

Groups are native `<g>` containers. Selection/editing follows an Excalidraw-style
*isolation* model on top of that DOM (it does **not** use flat `groupIds` metadata):

- **Single click** on any grouped element selects the **whole group** — `getMouseTarget`
  (`core/selection.js`) walks up to the `<g>` that is a direct child of the current layer
  when no group context is active. The walk-up itself is factored into
  `getMouseTargetFromNode(node)` (same file), so any raw DOM node — not just `evt.target`
  — can be resolved to its selectable element while honoring group isolation.
- **Proximity hit-testing for fill-less elements.** A `fill="none"` line/path is only
  hittable on its thin stroke, so the native hit-test usually misses it when it overlaps a
  filled shape. `findStrokeElementNearPoint` (`core/event.js`) samples `elementsFromPoint`
  in a small screen-space radius (`HIT_TOLERANCE`, 8px) around a select-mode click and
  prefers a nearby stroke-only element (resolved via `getMouseTargetFromNode`) over the
  filled shape under the exact pixel. Runs last in the `mouseDownEvent` select branch so it
  has final say; skipped for right-click and selector grips.
- **Selection bbox is a move handle.** When a select-mode click would otherwise hit empty
  canvas (`mouseTarget === svgRoot`, e.g. the hollow interior of a fill-less shape or the
  gap between a shape and its bbox edge) but lands inside the current selection's union bbox
  (`getStrokedBBoxDefaultVisible`), the `mouseDownEvent` select branch retargets to the
  selection so the drag moves it instead of starting a rubber-band. A click on a real
  element inside the bbox is left alone, so you can still select something within it.
- **Multi-selection rotation.** A 2+ element selection can be rotated, not just resized.
  `showGroupSelector` shows the rotate grip; dragging it enters `rotate` mode with
  `svgCanvas.groupRotateStart` (per-element start matrices) + `groupRotateCenter` (union
  center) captured in `mouseDownEvent`. `rotateGroup` (`core/event-rotate.js`, mirrors
  `resizeGroup` in `core/event-resize.js`) applies `R(angle, cx, cy)·startMatrix` to each
  element so the layout rotates rigidly. Undo
  is recorded by the existing `beginUndoableChange('transform', selectedElements)` /
  `finishUndoableChange()` pair (already multi-element aware); the group-rotate mouseUp skips
  `recalculateAllSelectedDimensions` (which would decompose the baked matrices) and refreshes
  the boxes via `updateGroupSelector`.
- **Double-click** (or **Ctrl/Cmd-click**) **drills into** the group: `setContext(group)`
  sets `currentGroup` (the analog of Excalidraw's `editingGroupId`), dims sibling content,
  and selects the clicked child. Both paths live in `core/event.js`
  (`dblClickEvent` and the Ctrl/Cmd branch in `mouseDownEvent`).
- **Non-destructive — never bakes.** Entering a *rotated/scaled* group keeps the group's
  transform on the `<g>`. Children are edited in the group's **local coordinate space**:
  pointer deltas are mapped through `toCurrentGroupLocalDelta` /
  `getMatrixToContent` (`core/math.js`), so a dragged child tracks the cursor 1:1 while the
  group transform stays intact. The old behavior pushed the group's rotation down onto every
  child (`pushGroupProperties`) and cleared the group transform — that is **gone** from the
  entry path (the move was also unrecorded, so the next undo removed the `<g>` and dissolved
  the group). `pushGroupProperty` itself is kept, used only by ungroup/import/menu paths.
- **Moving a child never re-parents it.** The drag only changes the child's own `transform`
  (consolidated/recorded as one `BatchCommand` in the `mouseUp` select-case), so group
  membership is preserved and undo/redo round-trips.
- **Exiting** a group context: a single click on empty canvas (or any element outside the
  current group) calls `leaveContext` — the `mouseDownEvent` select branch clears
  `currentGroup` whenever the click target is not the group or one of its descendants. Without
  this the editor stayed trapped in drill-in mode after moving a child, so every later click
  selected an individual child instead of the whole group — making the group *feel*
  destroyed even though the `<g>` was intact. Double-clicking outside also exits.
- **Duplicate/paste of a group member always detaches.** Unlike a drag (which
  never re-parents a child), `cloneSelectedElements` (Duplicate) and
  `pasteElements` while drilled into a group both produce an **independent,
  top-level** copy in the current layer rather than a new group member —
  copies are new content, not edits to the group's membership. Both call
  `getGroupDetachTarget` (`core/group-detach.js`), which walks up through
  however many nested `<g>`/`<a>` ancestors the source sits inside (the
  original's parent for duplicate, `currentGroup` for paste) up to the layer,
  and `applyGroupDetachTransform`, which bakes the accumulated ancestor
  matrix into the copy's own `transform` so it lands in the same visual spot
  it was copied from.
