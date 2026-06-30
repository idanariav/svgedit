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
│   ├── dialogs/                   # Modal dialogs (custom elements, Elix-based)
│   │   ├── imagePropertiesDialog.js
│   │   ├── editorPreferencesDialog.js
│   │   ├── exportDialog.js
│   │   ├── imageImportDialog.js     # Insert-image dialog (file upload + URL)
│   │   ├── insertImage.js           # insertImageFromHref() + insertSvgElements() helpers
│   │   ├── traceImage.js            # traceImageToSvg() — raster <image> → editable paths (imagetracerjs)
│   │   ├── seTraceDialog.js         # "Convert to editable SVG" options dialog (se-trace-dialog)
│   │   ├── svgSourceDialog.js
│   │   ├── seAlertDialog.js / seConfirmDialog.js / sePromptDialog.js
│   │   ├── seTextPromptDialog.js     # on-brand window.prompt replacement (window.sePrompt)
│   │   └── se-elix/               # Elix accessibility library (ARIA dialogs)
│   │
│   ├── extensions/                # Optional plugin modules (see extensions.md)
│   │   ├── ext-connector/         # Line-binding engine behind the Line tool (endpoint↔shape binding)
│   │   ├── ext-eyedropper/        # Pick color/style from canvas element
│   │   ├── ext-grid/              # Grid overlay + snap-to-grid
│   │   ├── ext-layer_view/        # Layer visualization
│   │   ├── ext-markers/           # Arrow/marker decorators on lines
│   │   ├── ext-opensave/          # File open / save / import dialogs
│   │   ├── ext-overview_window/   # Mini canvas preview window
│   │   ├── ext-panning/           # Pan tool (hand) for mobile/touch
│   │   ├── ext-polystar/          # Star and polygon drawing tools
│   │   ├── ext-brush/             # Pressure-sensitive freehand brush (perfect-freehand)
│   │   ├── ext-proportion-markers/ # Wireframe-only edge proportion ticks
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
                    │                          //   wraps Editor.selectedChanged/
                    │                          //   elementChanged/zoomChanged BEFORE the
                    │                          //   svgCanvas event binds below run
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
| `draw.js` | Shape creation primitives (rect, circle, ellipse, text, line, path…) |
| `event.js` | All mouse/touch event bindings + custom event dispatch (~53KB) |
| `selected-elem.js` | Manipulate selected element(s): move, resize, flip; z-order (`moveToTopSelectedElement`, `moveToBottomSelectedElement`, `moveUpDownSelected`, `switchSelectedZorder`) |
| `selection.js` | Selection list management; `updateGroupSelector()` toggles the multi-select group box |
| `select.js` | Selector UI object (rubber-band, resize handles); `SelectorManager.showGroupSelector(bbox, angle)`/`hideGroupSelector()` draw one union box + 8 resize grips **+ the rotate grip** around a multi-selection (the optional `angle` rotates the box+grips rigidly during a live group rotation) |
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
        ├── iife-Editor.js       (self-contained IIFE — for <script> tag)
        └── *.html               (entry pages; copy-static.mjs)

npm start           → Vite dev server on http://localhost:8000
npm run build-docs  → JSDoc HTML docs
```

Entry points: `src/editor/index.html` (dev + ES build) · `iife-index.html` (IIFE build) · `xdomain-index.html` (cross-domain iframe mode)

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
(`packages/svgcanvas/core/utilities.js`):
- **Clipboard copy/paste** — `copySelectedElements` tags each referenced def's
  JSON with `_defs:true` and prepends them to the clipboard array; `pasteElements`
  recreates `_defs` entries in `<defs>` **first** (so the shapes' refs resolve),
  with the existing id-remap keeping references consistent.
- **Shape library** — `_addSelectedToShapeLibrary` (`EditorStartup.js`) serializes
  the referenced defs into a leading `<defs>…</defs>` so the saved `svgContent` is
  self-contained; on insert, `ext-shapes.js` splits the defs off, imports both,
  and calls `remapElementIdsAndRefs([shape, ...defs], getNextId)` so repeated
  insertions get independent, collision-free ids.

`restoreRefElements` (`svgcanvas.js`) only restores a missing ref when it was
actually tracked in `this.removedElements` (guards against the `append(undefined)`
corruption above).

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
  center) captured in `mouseDownEvent`. `rotateGroup` (`core/event.js`, mirrors `resizeGroup`)
  applies `R(angle, cx, cy)·startMatrix` to each element so the layout rotates rigidly. Undo
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
