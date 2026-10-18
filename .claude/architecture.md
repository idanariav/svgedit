# SVGedit Architecture

> **How to use this doc:** Orientation and the contracts that cut across files: layering, startup order, undo, the tool and command contracts, the host seams. For "what is this file", use the generated [`file-map.md`](file-map.md); for commands and keys, [`commands.md`](commands.md); for tools and panels, [`tools.md`](tools.md).

---

## Layout

| Path | What lives there |
|---|---|
| `src/editor/` | The editor application (UI layer): `Editor.ts` / `EditorStartup.ts`, panels, components (shadow-DOM custom elements), dialogs, extensions, the command registry, hotkeys |
| `src/editor/panels/` | Four panels, each a `.js` + `.html` (Top, Left, Bottom, Right), plus the tablet shell and the Layers panel helpers (`layerTree.ts`, `layerGestures.ts`, `layerKeyboard.ts`) |
| `src/editor/extensions/` | `ext-*` folders (see [`extensions.md`](extensions.md)); inlined into the bundle by `extensionRegistry.ts` |
| `src/editor/hostApi.d.ts` | The host API types (`EditorHostApi`), typechecked against `Editor` and shipped to `dist/editor` |
| `packages/svgcanvas/` | The drawing engine (a separate npm workspace): `svgcanvas.ts` aggregates `core/` (~100 modules, each attached to the canvas by its `init(canvas)`) and `common/` |
| `packages/svgcanvas/core/model/` | The document model (R1 step a, below): a persistent XML tree, DOM-free |
| `scripts/`, `tests/` | Build, gates and repair scripts; `tests/unit` (vitest) and `tests/e2e` (Playwright) |
| `dist/` | Build output, gitignored |

**Layering.** `packages/svgcanvas` never imports from `src/editor`, never reads `window.svgEditor` and never defines custom elements; `scripts/check-layers.mjs` (a `pretest` gate) fails the build otherwise. The editor reaches the canvas only through its public API; the canvas reaches the editor only through events and hooks (e.g. `elementInserted`).

---

## Key Subsystems

| Subsystem | File(s) | Responsibility |
|-----------|---------|----------------|
| **Editor / EditorStartup** | `Editor.ts`, `EditorStartup.ts` | Orchestration (menus, event routing, alignment, groups, exports); async init: config → i18n → DOM → SvgCanvas → panels → extensions |
| **SvgCanvas** | `packages/svgcanvas/svgcanvas.ts` + `core/` | All SVG creation, selection, transforms, undo / redo, path editing |
| **ConfigObj** | `ConfigObj.ts` | Config and prefs: `pref(key)`, `setConfig(obj)`, localStorage persistence. Config comes only through `setConfig` (the page URL is not read) |
| **Panels** | `panels/*` | **Top**: quick actions and contextual trays; it inits last, so it can bind controls that live in other panels (zoom, stroke, opacity). **Left**: drawing tools. **Bottom**: colours. **Right**: the tabbed properties panel (Design / Text / Effects / Layers; `activateTab` / `autoSelectTab`) |
| **TabletShell** | `panels/TabletShell.*`, `tablet.css`, `uiMode.ts` | Optional touch-first shell (command bar + contextual bottom sheet) over `#workarea`: a presentation layer only, every control calls an existing `svgCanvas.*` / `editor.*` method. Toggled by `MainMenu.clickTabletMode` (`applyUiMode` + the `tabletMode` pref); shown only while `.svg_editor` has `ui-tablet` |
| **CommandRegistry** | `commands.js`, `coreCommands.ts`, `panelCommands.ts`, `components/commandBinding.ts` | "Everything is a command": one per-editor table (`editor.commands`) where each user-visible action has a stable persisted id, label, group, default keys, typed `params`, an `enabled(editor)` check that returns a *reason* when unavailable, and `run(editor, params)`; `run(id, params)` throws `CommandError` (`unknown` / `disabled` / `badParams` / `internal`). Hotkeys, `command="<id>"` buttons, the favorites menu, the tablet shell and the host API (`EditorHostApi.commands`) are views over it. Panel, main-menu and extension buttons are real commands (`panelCommands.ts`, per-extension `commands.register`, `LeftPanel.addModeCommand`); a component that still self-registers through `registerEl` becomes an **adapter** command (`run` = `el.click()`, `enabled` = not `disabled`), so `list()` stays complete. `atomic: true` runs a command in an undo transaction; `refreshEnablement()` runs after every command and from `updateContextPanel`. New button: register a command and add `command=`. The list: [`commands.md`](commands.md) |
| **Automation** | `automation.ts` | `editor.automation`: `inspect()` (mode, zoom, selection with document-unit bboxes, layers, undo state, open dialog), `pointer([...])` (real `MouseEvent`s from document- or screen-space points, scrolling the point into view, resolving coordinates once per gesture), `key(combo)` (through the HotkeyManager path). `docToClient` / `clientToDoc` are the single definition of the origin formula. In-page only, no network |
| **HotkeyManager** | `Hotkeys.ts` | The key-binding **view over the command registry** (`this.actions` *is* `editor.commands.table`) and the one document keydown dispatcher. Ingests `Editor.shortcuts` (editor-level, including curated keyless dropdown / context commands) and every `se-button` and `se-menu-item` (pushed via `registerEl` on connect, bindable even without a default `shortcut`); detects conflicts; keeps per-user overrides (`userDataAdapter` `getHotkeys` / `setHotkeys` or `svg-edit-hotkeys`). Dispatch is `editor.commands.tryRun(id)`: a disabled command does nothing and leaves the key to the browser. A command is `interactive` when its spec says so (or, for an adapter, when its element has an `interactive` attribute); `alias: true` marks a twin button (`tool_clone_multi`, `tool_delete_multi`) that owns no keys and is hidden from palettes and the shortcut manager. `refreshEnablement()` mirrors an unavailable command's reason into the button's `disabled-reason`, which `se-button` appends to its tooltip |
| **Favorites** | `favorites.ts`, `favoriteActions.ts`, `dialogs/favoritesDialog.ts`, `dialogs/cmenuDialog.ts` | The canvas right-click menu, rebuilt per open from the user's starred favorites; the catalog is the command registry plus live value controls (see `tools.md` › Main Menu) |
| **Components / Dialogs** | `components/*`, `dialogs/*` | Reusable shadow-DOM elements; modal dialogs |
| **Extensions** | `extensions/ext-*/` | Adds tools, UI and canvas behaviour |

---

## Initialization Flow

```
src/editor/index.html
  └─→ import Editor.ts
        └─→ new Editor(containerEl)       // EditorStartup.constructor()
              └─→ editor.init()           // EditorStartup.init()  [async]
                    ├── configObj.load()             // config + prefs from localStorage
                    ├── putLocale()                  // load i18n translations
                    ├── import all components + dialogs  // register custom elements
                    ├── render editorTemplate        // insert full DOM structure
                    ├── new SvgCanvas(svgcanvasEl)   // create drawing engine
                    ├── leftPanel.init()
                    ├── bottomPanel.init()
                    ├── rightPanel.init()      // builds the tabbed side panel
                    ├── topPanel.init()        // LAST → can bind any control in any panel
                    ├── mainMenu.init()
                    ├── tabletShell.init()     // builds tablet command bar + sheet; binds its own
                    │                          //   selected / changed / zoomed handlers directly
                    │                          //   (svgCanvas.bind is a native EventTarget, so it
                    │                          //   coexists with the binds below)
                    ├── bind svgCanvas events:
                    │     selected   → selectedChanged()   // update attribute panels
                    │     changed    → elementChanged()    // update coordinates
                    │     zoomed     → zoomChanged()
                    │     exported   → exportHandler()
                    │     ... (15+ events)
                    ├── readySignal()                // fire 'svgEditorReady' event
                    ├── resolve each extension from extensionRegistry.ts (inlined)
                    └── setBackground()
```

---

## Core engine contracts (`packages/svgcanvas/core/`)

One file, one job: the per-file list is [`file-map.md`](file-map.md). These are the contracts that span files.

**Events and selection.**
- `event.js` orchestrates mouseDown / Move / Up (shared prelude, hit-testing, dispatch to the `event-*.js` mode-family modules, epilogue). Its mouseUp insertion block fires a dedicated `elementInserted` event (element only, before the `InsertElementCommand` / `changed` pair) once per freshly drawn and kept element: the sanctioned core → editor seam for "a new element was just created" (`Editor.ts#elementInserted` applies `classLibrary.ts` per-tag default classes).
- `Drawing.refreshLayerPointerEvents()` (`draw.js`) is the single place layer `pointer-events` is set: normally only `current_layer` is `'all'` (the base single-layer isolation); `setAllLayersMode(bool)` flips every layer to `'all'` (ext-layer_view's All Layers). `selection.js` (`getMouseTargetFromNode`, `getIntersectionListMethod`) scopes to the current layer and widens when `getAllLayersMode()` is on and no group context is active.
- A locked object (`isObjectLocked` in `object-state.js`: own `se:locked` or a group above, **not** the layer's) is dropped by `addToSelection`, is no click target and is skipped by rubber bands. A template layer is treated like a locked group.
- `object-state.js` / `layer-ops.js` hold the Layers panel's per-object and per-layer-batch operations (hide, lock, rename, move; `setLayersVisibility` is one undo step, `setLayersLocked` none).

**Undo** (see also `extensions.md` › Recording undo).
- **Undo and redo are model snapshots** (R1 step d; `core/snapshot-history.ts`, `core/model-render.ts`). Every command that lands on the stack also records the model of `#svgcontent` after it (`readDom`, ephemeral overlays and the content root's view attributes `x y width height` left out, unchanged subtrees shared with the previous snapshot by `share`); an undo or redo is `reconcile(dom, shown, wanted)`, a patch of only what differs, matching children by id and keeping removed elements in a pool so the same node comes back (data storage, selectors, listeners stay valid). The command objects stay on the stack for their labels and counts, and a command that changes no element sets `domless` and runs itself (the canvas background is a preference). Three rules keep the snapshots honest: **(1)** the state being left takes in whatever changed since it was recorded (a command may write derived data after it landed), **(2)** any user input (`pointerdown`/`mousedown`/`keydown`/`click`/`input`/`change` in capture, `commands.run`, `beginTransaction`) first re-baselines the shown state, so a change made outside any command (a layer given its id, rounding) belongs to the state the next action starts from, except while a transaction holds the drawing, **(3)** after a restore, `changed` fires with `restored: true` on `elementChanged`, and a feature that regenerates derived data on that event (blend steps) must leave it alone, because the snapshot brought it back. The commands' own (un)apply is gone (the oracle that compared the two, `snapshot-mirror`, found about twenty places where the old undo did not restore the drawing exactly, and went with it). A unit test that builds a drawing through the API and then undoes a command must `undoMgr.snapshots.baseline()` first, as a user action does.
- **Writing through the model** (R1 step c; `core/model-commands.ts`, `core/model/edit.ts`). `svgCanvas.snapshotHistory.edit(label, fn)` is the write path: `fn` maps the model of the drawing to the one it should become (`moveToEnd`, `moveToStart`, `moveNextTo`, `swapSiblings`, `removeIds`, `setAttrsById`, `withChildren`; DOM-free and structure-sharing, so "nothing changed" is an identity check), the renderer makes the DOM show it (keeping node identity, so the selection survives), and one step is recorded (inside a transaction it is the transaction's). A command looks at the drawing to decide (the selection, what overlaps) and states the change on the model; an ESLint rule rejects `append` / `remove` / `insertBefore` / `setAttribute`… in `model-commands.ts`. Ported: the five z-order / delete commands, grouping and ungrouping (`wrapIds`, `unwrapId`; ungrouping first pushes the group's transform down to its children, DOM work in the same step), duplicating, pasting, setting attributes on one element (`setElementAttributes`: corner radius, arcs, image crop), moving, nudging or dragging, resizing and rotating plain shapes with the renderer showing the gesture (`snapshotHistory.preview` / `endPreview` / `cancelPreview`, `dragPlan` / `previewDrag`: a gesture states its in-progress change on the model and the renderer writes the DOM, so the real element is not edited), flipping, rotating (`commitTransforms`), editing path nodes (`PathObject.endChanges`), the fill-rule switch and the smooth-path commit (`commitUndoableChange`, which states what `beginUndoableChange` / `finishUndoableChange` saw on the model; not for text attributes, whose change lays the text out again), dragging or resizing plain shapes (`bakeDrag`; `parseAffine` / `affineEdit` are the pure matrix math) (their own coordinates, a pure translation folded in; anything with another transform, a clip, mask or feature data still bakes through the DOM) and layer create / duplicate / delete / rename / reorder / visibility / merge, move-to-layer (`insertLooseElements`, `removeIds`; the clones are built detached; `changeSelectedAttribute` for plain attributes (`changeSelectedAttributeByModel`; ids, text, hrefs, a group's or path's x / y, node editing, a rotated element's box and an area text's layout still go the DOM way) and element creation (`insertElementFromJson`, which the `registerTool` `{ create }` result uses; the built-in drag-drawn shapes preview as an ephemeral element and `commitDrawn` (event.ts) hands it to the model on mouse-up). Old commands that write the live DOM still work: the next snapshot reads what they did. `npm run check-dom-writes` is a ratchet on them (`scripts/dom-writes-baseline.json`: live-DOM writes per file in `core/` and `extensions/`; a file may write less than its entry, never more; `node scripts/check-dom-writes.mjs --update` after a port lowers a count).
- `history.js`: the undo stack (`UndoManager`: `undo()` / `redo()` step the snapshot history, or run a `domless` command's own `unapply` / `apply`) and the entries on it. The command types (`Move` / `Insert` / `Remove` / `Change` / `BatchCommand`) carry a label (`getText()`), the element they are about and `isEmpty()` (a batch nobody added to is not pushed); they hold no old values and do nothing when undone, because the snapshot is what comes back. So *when* a command is built no longer matters for undo (the old rule, "build `ChangeElementCommand` after the mutation", is gone). `EPHEMERAL_ATTR` / `isEphemeral`: nodes inside `#svgcontent` that aren't content (`data-se-ephemeral`).
- `undo.js`: recording (`changeSelectedAttribute`), and the wiring of the snapshot history: what a step does besides patching the DOM (`patched`: the document size from the viewBox, the pathedit session, `identifyLayers` when the layer list changed, `setUseData`, `changed` with `restored: true`).
- `transaction.js`: `beginTransaction(label)` → `{commit, cancel}`, `transact(label, fn)`, `inTransaction()`. `begin` takes the model snapshot of the drawing, `commit` takes it again and, unless it is the same object (nothing net-changed; snapshots share what an edit did not touch), pushes ONE labelled entry; `cancel` makes the DOM show the begin snapshot again (a `reconcile`) and restores the selection. It nests by depth; `undoMgr.addCommandToHistory` is swallowed while open and `undo()` / `redo()` cancel it. `beginTransaction(label, { onAbort })`: a transaction held across gestures (a tool session, e.g. puppet-warp) is told via `onAbort` when undo, redo or a drawing replace ended it from outside (not for its owner's own commit / cancel). Replaces the earlier diff of every element's attributes, text and child lists (≈14 ms / ≈22 ms at 5,000 elements). New code uses this, not hand-built batches.

**Tools.** `tool-registry.js`: `svgCanvas.registerTool({id, pointerDown, pointerMove, pointerUp, keyDown, cancel, activate, deactivate, undoLabel, wantsHover, options, setOption, snap, cursor, keepOverlays})`. `event.js` dispatches to the tool whose id equals the current mode *before* the mode `switch` and the extension hooks (`pointerDown` returning `false` declines). Events carry `x/y` in document units (unzoomed, grid-snapped, group-local; `rawX/rawY` unsnapped), `dragDistance` and `mods`. Each press → release gesture is one transaction (`pointerUp` → `'cancel'` or `{created}`); Escape, `setMode` or a throw roll it back. `ctx.addOverlay` draws outside `#svgcontent`; `finishCreated` finishes a new element like a drawn shape. **Options bar:** `options()` returns descriptors (`{id, label, type: number|select|checkbox, value, min/max/step, choices, hidden}`), `setOption(id, value)` takes a change; `svgCanvas.getToolOptions()` / `setToolOption()` expose them and `panels/toolOptionsBar.ts` draws the tray. `cursor` is a CSS cursor or a function of the context; `keepOverlays` lets a finished gesture leave its overlay (the Measure readout). Reference implementation: ext-shape-family; how to write one: `extensions.md`.

**Invariants.** `drawing-invariants.js`: `checkDrawing(svgContent)` → findings (`duplicate-id`, `dangling-ref`, `stray-text-in-defs`, `layer-shape`, `bad-number`, `se-attr-parse`, `se-stack`); `registerAttrValidator(name, fn)` lets a module own the parse check of its `se:*` attribute. Exposed as `svgCanvas.checkDrawing()`, run by the e2e `afterEach` and the command sweep, never in production.

**Geometry tools** share `paper-utils.js` (`getPaperScope()`, one lazy scope; `getStyleAttrs`; `svgToPaper(elem, scope, {asCompoundPath, flatten})`): boolean ops, cutter, segment, shape-builder, taper stroke. `path-offset.js` offsets with clipper-lib (paper.js only flattens). The path fitting stack is DOM-free and VectorCraft-derived: `anchor-path.js` (the anchor model) → `bezier-fit.js` → `path-fit.js` (`simplifyWith`, `fitFreehand`) → `path-simplify.js` (pencil commit, Smooth Path preview / commit / cancel, `simplifyPathD`).

**Path pen.** `pen-continue.js` finds and joins ends (`findPenEnd`, `continuationD`, `joinDrawn`, on `path-edit.js` `joinEnds`); `path-actions.js` drives the gesture: the continued path is hidden while a temp drawing stands in for it, and finishing writes `d` into the survivor inside one `svgCanvas.transact` (the temp is removed *before* the transaction so its removal isn't recorded). `event.js` forwards un-pressed `path`-mode moves to `pathActions.hover` for the end ring.

**The live stack** (`live-stack.js`): corners (`se:orig-d`) → effects (`se:fx-d`) → width (`se:taper-d`) on one element. Stages register themselves (`registerLiveStage`, from `corner-radius.js` / `live-effects.js` / `taper-stroke.js`); the earliest active stage's source is the root, later sources are mirrors of the stage before; `planStack` / `commitPlan` / `removalSet` change a stack, `reconcileStack` / `rebuildAfterRemap` keep it current. Supported: corners + width, effects + width. `coords.js` runs the geometry-remap hooks (`remapCornerSource`, `remapFxSource`, `remapTaperSource`, arrow-align, puppet) after a bake, for lines and polylines too. Grammar: `attributes.md`.

**Snapping.** `smart-guides.js` is the object-to-object snap math (rendered by ext-smart-guides); `draw-snap.ts` snaps a point a drawing tool places (`svgCanvas.drawSnap.snapDrawPoint`, a per-gesture target cache cleared on mouse-up; called from the `event.js` prelude for the built-in drawing modes, not the pencil, not inside a group, and from `tool-registry.js` for `snap: true` tools); grid snapping wins; one `smartSnapping` switch governs both. `guides.js` is the ruler-guide model (`se:guides` on the root); guides are axis-only targets in `smart-guides.js` and line targets in `draw-snap.ts`.

**Text.** `text-rows.js` / `text-wrap.ts` store and lay out `<text>` rows (hard rows are tspans; **area text** wraps to a box, soft rows are `se:soft` tspans recomputed on every layout and left out of the content string). `undo.js` settles an area text's rows once per undo batch (`settleAreaText`); resize is `event-resize.js` `resizeAreaText` (a transaction held for the drag, committed by `event-select.js`).

**Other seams.** `path-seg-shim.js` installs the `pathSegList` / `createSVGPathSeg*` replacement backed by `svgpath` (no browser API dependency). `recolor.js` and `gradient-edit.js` clone shared gradients and filters on write. `debug-events.js` backs `svgCanvas.logDebugEvent` (privacy-safe `tag#id` names, `redact`; see `debug-log.md`). `load-image.js` is the shared CORS-aware image loader (`image-crop.js`, `dialogs/traceImage.ts`).

**The document model** (`core/model/`, R1 step a; status and decisions in [`roadmap/rearchitecture.md`](roadmap/rearchitecture.md)). The tree and parser are not used by the editor yet; the renderer (`core/model-render.ts`: `renderNode`, `reconcile`, `readDom`) and the snapshot history above are. It must stay importable in a bare Node process (a unit test runs it there): no `document`, no `paper.js`. `node.ts` is a frozen, structurally shared XML tree (`element`, `text`, `cdata`, `comment`, `pi`; qualified names kept as written, `xmlns*` plain attributes) with path-copy edits (`updateAt`, `setAttr`: only the ancestors are copied, so the previous root is the undo snapshot). `parseSvg` / `serializeSvg` write the editor's own spelling (`toXml` escaping, `<x/>`): every round-trip fixture comes back byte-identical in `format: 'preserve'`, and `'indent'` is the editor's save layout. `drawing.ts` is the typed read-only view `readDrawing(doc)`: layers, items (groups with a `role` for generated blend / art-brush / repeat groups, shapes, paths, text, image, use, other; each with its `path` into the tree, `hidden`, `locked`, `generated` and every `se:*` attribute verbatim in `se`), the top-level `<defs>` children, orphans and the guides; cross-checked against `draw.js` / `object-state.js` on the corpus. `features.ts` types the `se:*` attributes whose owning module exports a DOM-free parser by calling that parser (one definition of each grammar); one that does not parse is named in `features.invalid`. A module that wants to be typed keeps its attribute names and parsers in a DOM-free file (`math.ts` makes its scratch `<svg>` on first use; the taper names and parsers live in `width-profile.ts`, re-exported by `taper-stroke.js`).

---

## Extension Plugin Lifecycle

1. Host sets `setConfig({ extensions: [...] })` (or takes the defaults in `ConfigObj.defaultExtensions`).
2. `EditorStartup` resolves each from the inlined `extensionRegistry.ts` (an eager glob, bundled into `Editor.ts`; no runtime fetch from `extPath`).
3. Each extension default-exports `{ name: 'ext-name', init(S) { ... } }`; `init(S)` receives `svgCanvas`, `editor`, `addLangData`, etc.
4. An extension can add buttons to panels, register tools and commands, listen for canvas events, inject UI.

See [`extensions.md`](extensions.md) for the contract and the per-extension notes.

---

## Host data persistence (`userDataAdapter`)

The editor persists four pieces of user customisation to its own `localStorage`: the **custom palette** (`sePalette.ts`, `svg-edit-custom-palette`), the **saved shape library** (`userShapes.ts`, `svg-edit-user-shapes`; store `{ categories, shapes, categoryLabels, hidden }`, see `tools.md` › ext-shapes), **hotkey overrides** (`Hotkeys.ts`, `svg-edit-hotkeys`) and **quick-action favorites** (`favorites.ts`, `svg-edit-favorites`); the tool order, canvas presets and layouts have their own keys (see `tools.md`).

A host that wants this data in *its own* store passes an adapter through `setConfig`:

```js
setConfig({ userDataAdapter: {
  getPalette (), setPalette (overrides),       // sync read / fire-and-forget write
  getUserShapes (), setUserShapes (store),
  getHotkeys (), setHotkeys (overrides),       // hotkey overrides { id: [keys] }
  getFavorites (), setFavorites (ids),         // quick-action favorites [id, …]
  getClasses (), setClasses (presets),         // style-preset class library
  getDefaultClasses (), setDefaultClasses (m)  // per-tag default class { text: 'title' }
}})
```

`EditorStartup.init()` registers it once into the `userDataAdapter.ts` registry **before** any component is constructed; the consumers resolve it through `getUserDataAdapter()`. Reads are synchronous; writes receive the full current state on every edit. Each method is independent and optional; with none set, that data falls back to localStorage and standalone svgedit is unchanged. Once an adapter is registered a *missing* method does not fall back: reads give the empty value and writes are dropped, so a host must implement both halves of every pair it uses (a host without `setDefaultClasses` loses every "default class for new objects" choice).

**Live refresh across instances: `svgEditor.reloadUserData()`.** When several instances share one store, a write by one leaves the others stale. `reloadUserData()` re-reads **both** stores (adapter, else localStorage) and re-renders the palette (`sePalette.reload()`) and shape library (the `user-shapes-updated` event on each `se-shape-library`, desktop and tablet) **for that instance only**; the host calls it on every *other* open instance after a write. It resolves components through the instance's own root (`this.$svgEditor`), never a document-wide query, and no-ops when a component isn't mounted.

---

## Build Pipeline

```
npm run build
  └── builds src/editor          → dist/editor/
        ├── Editor.ts            (self-contained ES module: all assets inlined, svgcanvas bundled from source)
        └── *.html               (entry pages; copy-static.mjs)

npm start           → Vite dev server on http://localhost:8000 (editor and canvas from source)
```

`vite.config.mjs` aliases the bare `@svgedit/svgcanvas` to `packages/svgcanvas/svgcanvas.ts` in every mode (dev, vitest, build), the same files its subpath imports (`@svgedit/svgcanvas/core/*.js`) already reach, so each core module exists once. HTML templates (`panels/`, `dialogs/`, `templates/`) are imported as strings through the `svgedit-html-templates` plugin, which only drops indentation between tags (`scripts/html-template.mjs`). `src/editor/index.html` is the only build entry (the sole consumer, the Obsidian plugin, imports the ES module directly). Sourcemaps are opt-in: `SOURCEMAP=true npm run build` (the plugin never consumes them and they roughly triple `dist/`).

### Self-contained bundle (no runtime asset folder)

`Editor.ts` inlines **every** asset, so a consumer (the Obsidian plugin's esbuild) can bundle it into one file with no `images/`, `extensions/` or CSS folder and no custom loaders. Mechanism: Vite's `import.meta.glob({ eager: true })` / `?raw` / `?inline`, resolved statically by Rollup.

| Asset | Inlined via | Entry point |
|---|---|---|
| Toolbar icons + cursors | `import.meta.glob('*.svg', '?raw')` | [`images/iconRegistry.ts`](../src/editor/images/iconRegistry.ts) → `svgIconLoader.ts` |
| Extensions | `import.meta.glob('ext-*/ext-*.js', eager)` | [`extensions/extensionRegistry.ts`](../src/editor/extensions/extensionRegistry.ts) |
| Extension + UI locales | `import.meta.glob('locale/*.js', eager)` | each `ext-*.js`; `locale.ts` |
| `svgedit.css` (+ tablet) | `import css from './svgedit.css?inline'` | `EditorStartup.injectSvgeditStyles()` |
| Shape library JSON | `import.meta.glob('shapelib/*.json', eager)` | `components/seShapeLibrary.ts` |
| Google-fonts catalog | static JSON import | `components/seFontLibrary.ts` |

Runtime `fetch()` survives only for genuinely external content (Google-fonts downloads, user-supplied SVG URLs) and as guarded fallbacks behind the inlined data.

---

## Host bridge (`window.svgEditHost`)

An **optional, feature-detected** global a host (the Obsidian plugin) may install so the editor can reach host-only resources. It is host-agnostic (no Obsidian naming), which respects the repo boundary. When it is absent, all dependent UI is hidden and standalone svgedit is unchanged.

| Method (all optional, async) | Returns | Used by |
|---|---|---|
| `pickVaultImage()` | `{ dataUrl, link, locked?, editableSvg? } \| null` | Image dialog "Import from vault" |
| `pickVaultFile()` | `{ link } \| null` | "Add to Shape Library" link control |
| `exportDrawing()` | — | Main menu "Export": when present it replaces svgedit's own export dialog |

**Locked vs. unlocked imports.** `pickVaultImage()` selects how the drawing is inserted:
- **Embed (locked / raster / frame crop)**, `{ dataUrl, link, locked? }`: a single `<image>` through `insertImageFromHref`; `locked` also stamps `data-vault-locked` so the host re-bakes content from source.
- **Editable (whole-drawing unlocked)**, `{ dataUrl, link, editableSvg }` with `editableSvg` the full `<svg>…</svg>` source: inserted as **real, editable elements** by `insertSvgElements` (`dialogs/insertImage.ts`). The drawable top-level elements go into the current layer as **individual, directly selectable** elements, not wrapped in one group (a wrapper makes a multi-object drawing select as one giant group with grips in empty canvas); paint-server and defs content goes to the canvas `<defs>`. Ids are uniquified together, the import is centred on the page and multi-selected (so it still moves as a unit right after), and recorded as one undoable `BatchCommand`. `editable` implies unlocked (`locked` is ignored, `data-vault-locked` is never set); `dataUrl` still feeds the dialog's preview.

**Provenance stamping, `data-vault-link`.** Every flow records the returned `link` on the inserted element(s): an image import stamps the single `<image>`; an editable import stamps each inserted top-level element (the host's backlink reconciler dedupes by link value, so repeats collapse to one backlink; never re-baked); a shape insert stamps the imported root **and every descendant** (`ext-shapes.ts`) so the link survives ungroup and partial deletion and goes away only with the last stamped element. `data-*` attributes round-trip through sanitize (an explicit bypass in `core/sanitize.js`) and `getSvgString()`, the same mechanism `data-frame` relies on; the host reads the attribute from the serialized SVG on save and svgedit emits no event for it.

**System-clipboard paste (Ctrl/Cmd+V).** One native `paste` listener in `EditorStartup.ts` (`this.pasteHandler`, registered with a remove-before-add guard like `keydownHandler`) is the sole arbiter of paste; there is **no** `v` shortcut in `Editor.ts`. The system clipboard decides the path: an internal copy mirrors its JSON array onto the clipboard (`copySelectedElements`, `core/selected-elem.js` → `navigator.clipboard.writeText`), so the handler can tell svgedit's own clipboard (a JSON array → `pasteInCenter()` → `pasteElements`, reading `sessionStorage`) from an external SVG document (`<svg>…</svg>` text, e.g. another editor's "Copy as SVG" → `importSvgString`, then `selectOnly` + `ungroupSelectedElement` to turn the non-editable `<use>` / `<symbol>` reference into a real editable group, then centred; without the ungroup it lands as one opaque object). Editable fields (`INPUT` / `TEXTAREA` / contentEditable) are skipped so their native paste works. One arbiter avoids double-pasting when an internal copy and an external SVG are both present.

**Referenced `<defs>` travel with a copy.** A selection that uses gradients, filters, markers, masks or clip-paths references them by `url(#id)` into the canvas `<defs>`, and those defs are **not** selected, so a naive copy leaves dangling references (and `restoreRefElements` once appended a literal `"undefined"` text node into `<defs>`). Every copy path collects the transitively referenced defs with `getReferencedDefElements(elems)` (`core/dom-utils.js`):
- **Clipboard copy / paste:** `copySelectedElements` tags each def's JSON `_defs:true` and prepends it; `pasteElements` recreates the `_defs` entries **first** (so the shapes' refs resolve), with the id remap keeping references consistent.
- **Shape library:** `_addSelectedToShapeLibrary` (`EditorStartup.ts`) serialises the defs into a leading `<defs>…</defs>` so `svgContent` is self-contained; on insert `ext-shapes.ts` splits it off, imports both and calls `remapElementIdsAndRefs([shape, ...defs], getNextId)`.
- **Duplicate:** `cloneSelectedElements` (`core/selected-elem.js`) clones the defs (`def.cloneNode(true)`) and remaps each duplicate's own `url(#…)` / `href` onto the clones before `copyElem` builds the shape clones. Sharing the original's node is a bug: a drop-shadow filter's region is a bbox snapshot (`fx-filter.ts` `setRegion`), so the duplicate rendered clipped to the original's position.
- `restoreRefElements` (`svgcanvas.ts`) restores a missing ref only when it was tracked in `this.removedElements`.

**Effect-filter ownership does not depend on its id.** `fx-filter.ts` `buildFilter` stamps `data-fx="1"` on every filter it creates and `isOurFilter` checks that first, falling back to the `${elem.id}_fx` suffix for filters saved before the marker. A duplicate's `remapElementIdsAndRefs` and paste's `checkIDs` both rename filters, so the id convention can't be relied on. `convertDropShadowFilters` (`svg-exec.js`, the load-time region repair) retrofits the marker onto legacy filters.

**Copy / paste and duplicate keep the source id prefix** (`ellipse_1` → `ellipse_2`, a renamed `foo_1` → `foo_2`, `svg_18` → `svg_19`): both strip the trailing digits of the source id and call `Drawing.getNextIdWithPrefix(prefix)` (`core/draw.js`), which bumps the shared `obj_num` counter until the id is unused (the number follows the global counter, not literally source + 1). Paste does it in `checkIDs` (`core/paste-elem.js`); duplicate through the `copyElem(el, getNextId)` closure (`core/copy-elem.js` passes the source element to `getNextId`).

---

## Event Flow Example: Draw a Rectangle

```
1. User clicks Rectangle in LeftPanel → editor.setMode('rect') → svgCanvas.setMode('rect')
2. SvgCanvas stores currentMode = 'rect', fires modeChange; Editor.modeListener() updates the LeftPanel button states
3. User drags on canvas: event.js handles mousedown / mousemove / mouseup; draw.js creates the <rect>
4. SvgCanvas fires 'changed' → Editor.elementChanged() updates the position / size inputs (Design tab)
5. SvgCanvas fires 'selected' → Editor.selectedChanged() → updateContextPanel shows the rect_panel section
   in the Design tab and the top object / arrange trays; autoSelectTab keeps Design active
6. RightPanel shows the new element in the active layer
```

---

## Group editing (drill-in)

Groups are native `<g>` containers. Selection and editing follow an Excalidraw-style *isolation* model on that DOM (not flat `groupIds` metadata):

- **Single click** on a grouped element selects the **whole group**: `getMouseTarget` (`core/selection.js`) walks up to the `<g>` that is a direct child of the current layer when no group context is active. The walk-up is `getMouseTargetFromNode(node)`, so any raw DOM node can be resolved while honouring isolation.
- **Proximity hit-testing for fill-less elements.** A `fill="none"` line / path is hittable only on its thin stroke, so the native hit-test usually misses it where it overlaps a filled shape. `findStrokeElementNearPoint` (`core/event.js`) samples `elementsFromPoint` in a screen-space radius (`HIT_TOLERANCE`, 8 px) around a select-mode click and prefers a nearby stroke-only element over the filled shape under the exact pixel. It runs last in the `mouseDownEvent` select branch and is skipped for right-click and selector grips.
- **The selection bbox is a move handle.** When a select-mode click would hit empty canvas (`mouseTarget === svgRoot`: the hollow interior of a fill-less shape, the gap between a shape and its bbox edge) but lands inside the selection's union bbox (`getStrokedBBoxDefaultVisible`), the click retargets to the selection so the drag moves it instead of starting a rubber band. A click on a real element inside the bbox is left alone.
- **Multi-selection rotation.** `showGroupSelector` shows the rotate grip; dragging it enters `rotate` mode with `svgCanvas.gesture.groupRotateStart` (per-element start matrices) and `groupRotateCenter` (the union centre) captured in `mouseDownEvent`. `rotateGroup` (`core/event-rotate.js`, mirroring `resizeGroup` in `event-resize.js`) applies `R(angle, cx, cy)·startMatrix` to each element, so the layout rotates rigidly. Undo is the multi-element-aware `beginUndoableChange('transform', selectedElements)` / `finishUndoableChange()` pair; the mouseUp skips `recalculateAllSelectedDimensions` (which would decompose the baked matrices) and refreshes the boxes through `updateGroupSelector`.
- **Double-click** (or **Ctrl/Cmd-click**) **drills into** the group: `setContext(group)` sets `currentGroup` (the analogue of Excalidraw's `editingGroupId`), dims sibling content and selects the clicked child (`dblClickEvent` and the Ctrl/Cmd branch of `mouseDownEvent`, `core/event.js`).
- **Non-destructive: never bakes.** Entering a *rotated / scaled* group keeps its transform on the `<g>`. Children are edited in the group's **local coordinate space**: pointer deltas go through `toCurrentGroupLocalDelta` / `getMatrixToContent` (`core/math.ts`), so a dragged child tracks the cursor 1:1 while the group transform stays. (`pushGroupProperty` is kept for ungroup, import and menu paths only; entry must not push a group's rotation onto its children, because that move was unrecorded and the next undo then dissolved the group.)
- **Moving a child never re-parents it.** The drag changes only the child's own `transform` (consolidated and recorded as one `BatchCommand` in the `mouseUp` select-case), so membership is preserved and undo / redo round-trips.
- **Exiting.** A click on empty canvas, or on any element outside the current group, calls `leaveContext` (the `mouseDownEvent` select branch clears `currentGroup` whenever the target is not the group or a descendant); double-clicking outside also exits. Without it the editor stays trapped in drill-in mode and every later click selects a single child, making the group *feel* destroyed.
- **Duplicate / paste of a group member always detaches.** `cloneSelectedElements` (Duplicate) and `pasteElements` while drilled in produce an **independent, top-level** copy in the current layer, not a new group member (copies are new content, not edits to the group). Both call `getGroupDetachTarget` (`core/group-detach.js`), which walks up through however many nested `<g>` / `<a>` ancestors the source sits in (the original's parent for duplicate, `currentGroup` for paste) to the layer, and `applyGroupDetachTransform`, which bakes the accumulated ancestor matrix into the copy's own `transform` so it lands where it was copied from.
