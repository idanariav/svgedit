# SVGedit File Map

> **How to use this doc:** find a file, read what it is. The tables of source files below are **generated** from each
> file's header comment (`npm run file-map`; `npm test` fails when a file has no header or the tables are stale), so to
> change an entry, edit the first sentence of that file's header comment. Details belong in the file, history in git.
> Files that are not JS (icons, docs, configs) are listed by hand after the generated block.

<!-- file-map:begin -->

### `packages/svgcanvas/`

| File | What it is |
|---|---|
| `svgcanvas.ts` | Numerous tools for working with the editor's "canvas" |
| `vite.config.mjs` | Vite library build of the canvas on its own: one ES `svgcanvas.js` into `dist/` |

### `packages/svgcanvas/common/`

| File | What it is |
|---|---|
| `browser.ts` | Browser detection |
| `initGuard.ts` | Collision guard for the members core modules give the SvgCanvas instance |
| `logger.ts` | Centralized logging utility for SVGCanvas |
| `util.ts` | Common utility functions |

### `packages/svgcanvas/core/`

| File | What it is |
|---|---|
| `anchor-path.ts` | Anchor-based path model — a small, DOM-free representation of a path as subpaths of anchors with in/out Bézier handles, plus the geometry helpers the live-effect pipeline needs (non-linear mapping, Catmull-Rom… |
| `arrow-align.ts` | Arrowhead alignment: where a marker head sits on the end of its line |
| `art-brush-canvas.ts` | Art and pattern brushes on the canvas: the elements, the brush library and the canvas API |
| `art-brush.ts` | Art and pattern brush geometry: artwork bent along a path by arc length |
| `bbox-utils.ts` | Bounding-box computation utilities |
| `bezier-fit.ts` | Least-squares cubic Bézier fitting of point sequences: fit a cubic with fixed end tangents, reparameterise with Newton steps, and split at the worst point when one cubic is not enough (the approach from Graphics Gems,… |
| `blend-canvas.ts` | Blends on the canvas: the group, its keys and generated steps, and the canvas API |
| `blend.ts` | Blends: the geometry and paint of the steps between two key shapes |
| `blur-event.ts` | Tools for blur event |
| `boolean-ops.ts` | Boolean path operations: union, intersect, subtract, exclude, divide |
| `brush-stroke.ts` | Custom brush geometry: centerline smoothing + a nib-based variable-width outline generator for the freehand "brush" tool (see `ext-brush`) |
| `canvas-state.ts` | The session/UI state of one canvas (`svgCanvas.state`), grouped by concern: zoom, selection, current styles, history scratch and the drawing gesture's working values |
| `clear.ts` | Resets the `#svgcontent` element to a blank document |
| `clip-mask.ts` | Clip & mask creation: confine the top selected object to the silhouette of the object below it, and release an existing clip/mask |
| `coords.ts` | Manipulating coordinates |
| `copy-elem.ts` | Copy handler |
| `corner-radius.ts` | Live Corners: per-corner radius and kind (round, inverted round, chamfer) on the corners of any path — the anchors where two straight sides meet |
| `cutter.ts` | Cutter (knife) tool: splits selected shapes along a cutting line, which may be a single straight segment or an arbitrary open polyline (zigzag) |
| `dash-fit.ts` | Fitted dashes: stretch or squeeze a dash pattern so a whole number of periods fits the stroke's length, with a dash centred on both ends of an open path |
| `dataStorage.ts` | A storage solution aimed at replacing jQuery's data function |
| `debug-events.ts` | Helpers for the discrete debug-event channel (`svgCanvas.logDebugEvent`): compact, privacy-safe descriptions of elements and input, so a host log can be read — by a person or an LLM — as the sequence of things the user… |
| `distort.ts` | Free Distort and Perspective Distort live effects: the four corners of the shape's box move to new places and the geometry follows |
| `dom-utils.ts` | DOM/element manipulation, lookup, and misc canvas-state utilities |
| `draw-snap.ts` | Snapping while drawing: the point a drawing tool places (the corner of a rectangle, a line's end, a pen anchor, a polygon's centre) snaps to other objects' anchors, bounding-box corners / midpoints / centres and edge… |
| `draw.ts` | The drawing: the layer list, element id minting and the nonce, plus the group-context (isolation) functions the canvas attaches |
| `drawing-invariants.ts` | Structural invariants of a healthy drawing, as a pure DOM check |
| `elem-get-set.ts` | `changeSelectedAttribute()` and attribute I/O |
| `encoding-utils.ts` | String/XML/base64 encoding utilities |
| `event-group-context.ts` | Group-editing coordinate helpers shared by `event.js`'s mouseDown/mouseMove preludes and the select/shape-draw mode handlers |
| `event-path-edit.ts` | Path drawing/editing mode (`path`/`pathedit`) mouse handlers, extracted from the `path`/`pathedit` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-resize.ts` | Resize mode (`resize`) mouse handlers, extracted from the `resize` case of `event.js`'s mouseDown/mouseMove switches |
| `event-rotate.ts` | Rotate mode (`rotate`) mouse handlers, extracted from the `rotate` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-select.ts` | Selection mode (`select`/`multiselect`) mouse handlers, extracted from the `select`/`multiselect` cases of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-shape-draw.ts` | Shape-creation mode mouse handlers, extracted from the rect/square/frame/foreignObject/image/circle/ellipse/line/text/ fhellipse/fhrect/fhpath cases of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-text-edit.ts` | Text-editing mode (`textedit`) mouse handlers, extracted from the `textedit` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-zoom.ts` | Zoom-mode (rubber-band marquee zoom) mouse handlers, extracted from the `zoom` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event.ts` | Pointer and wheel dispatch for the canvas: press, move, release and double-click are routed to the per-mode `event-*` handlers, with the debug log and the creation epilogue |
| `extension-hooks.ts` | Registry of extension hook names, with the payload each one receives |
| `geometry-remap-registry.ts` | Registry for attribute-driven derived-geometry remap hooks |
| `gesture-state.ts` | The state a pointer gesture parks on the canvas between mouse events (rotate / resize / drag starts, the armed alt-clone, the pending new element…), one object per canvas (`svgCanvas.gesture`) instead of fourteen loose… |
| `gradient-edit.ts` | Gradient editing maths and DOM helpers for the on-canvas gradient tool (`ext-gradient-tool`) |
| `group-detach.ts` | Helpers for detaching content from group nesting so it becomes independent top-level content (used by Duplicate and Paste) while staying in the same visual position |
| `group-ops.ts` | Grouping operations (group, ungroup, convert-to-group, push group properties down to children), split out of selected-elem.js |
| `guides.ts` | Ruler guides: horizontal and vertical lines the user drags out of the rulers to align things by |
| `history.js` | The undo stack and the entries on it |
| `historyrecording.js` | HistoryRecordingService component of history |
| `image-crop.ts` | Destructive crop for imported raster `<image>` elements |
| `json.ts` | Tools for SVG handle on JSON format |
| `layer-ops.ts` | Layer operations (create/clone/delete/rename/reorder/visibility/lock/merge, move-to-layer, all-layers mode), split out of draw.js |
| `layer.ts` | Provides tools for the layer concept |
| `live-effects-distort.ts` | Distort & stylize live effects: Roughen, Zig Zag, Pucker & Bloat, Twist, Tweak, Round Corners and Scribble |
| `live-effects.ts` | Live (re-editable) path-geometry effects — the shared foundation for Roughen, Zig Zag, Warp, … Each effect is a pure function over anchor subpaths registered here; this module owns the attribute plumbing so an effect is… |
| `live-stack.ts` | The live stack: how corner radius, live effects and a variable-width stroke combine on one element |
| `load-image.ts` | Load an image href into an `HTMLImageElement`, ready for `drawImage` |
| `math.ts` | Mathematical utilities |
| `measure.ts` | Measure tool maths: the distance, angle and offsets between two points, the 45° constraint, and the readout lines |
| `model-commands.ts` | Commands that edit the drawing through the document model (R1 step c): stacking order and deletion |
| `model-render.ts` | Document model → SVG DOM (R1 step b): the renderer that makes the DOM a view of the model |
| `namespaces.ts` | Namespaces or tools therefor |
| `object-state.ts` | Per-object state for the Layers panel's object rows: hidden (`display="none"`, the same mechanism as a hidden layer), locked (`se:locked="true"`, the same attribute a locked layer carries) and moving objects between… |
| `paint.ts` | Fill, stroke, color management |
| `paper-utils.ts` | Shared paper.js helpers for the boolean/geometry tools (boolean-ops, cutter, path-offset, shape-builder, taper-stroke, path-simplify) |
| `paste-elem.ts` | Paste handler |
| `path-actions.ts` | Path-drawing and path-editing gestures (the Pen, the node editor's mouse handling, node delete / add / align) and the path-data converters |
| `path-edit.ts` | Path-editing operations on the anchor model (`anchor-path.js`): Remove Anchor (keeps the shape by refitting the neighbours' handles), Add Anchor Points, Average and Join |
| `path-fit.ts` | Corner-keeping path simplification, on the anchor model (`anchor-path.js`) |
| `path-join.ts` | Join for the select tool: two selected open paths become one (the upper one is merged into the lower one, which keeps its id and style), or one open path is closed |
| `path-method.ts` | The path node editor's model: the `Segment` and `Path` wrappers over a path's segment list, and the grip helpers they use |
| `path-node-guides.ts` | Path-node alignment guides — node-to-node alignment math for pathedit mode |
| `path-offset.ts` | Path offset / inset and stroke-to-path operations |
| `path-seg-shim.js` | Replacement for the deprecated `SVGPathSeg`/`SVGPathSegList` DOM API, removed from browsers around 2016 and previously restored here via the `pathseg` npm polyfill |
| `path-simplify.ts` | Path simplification / smoothing, on the corner-keeping Bézier fit in `path-fit.js` (sharp turns stay corners; tolerances are distances in user units) |
| `path-types.ts` | Types of the path node editor: a path segment as `path-seg-shim.js` models it, the `Segment` and `Path` wrappers that `path-method.ts` builds over it, and the `pathSegList` API of a path element |
| `path-utils.ts` | Path `d`-attribute construction and element-to-path conversion utilities |
| `path.ts` | Path functionality |
| `pen-continue.ts` | The Pen's "continue" and "join" gestures: pressing on an end of an existing open path carries that path on (or, while drawing, joins the drawing to it) |
| `proportions.ts` | Shared definitions for wireframe-mode proportion markers + snapping |
| `recalculate.ts` | Recalculate dimensions and transformations of SVG elements |
| `recolor.ts` | Recolor Artwork: the colour maths and the DOM walk behind the Recolor dialog (`ext-recolor`) |
| `sanitize.ts` | Tools for SVG sanitization |
| `scratch-bake.ts` | Bake a finished gesture's transform on a throwaway copy, and hand back what changed (R1: the gesture is stated on the model, the measuring stays where the browser can do it) |
| `se-namespace.ts` | Helpers for the editor's `se:` attribute namespace |
| `segment.ts` | Segment tool: divides a single selected shape into symmetric pieces using evenly-spaced dividing lines, in two generator modes: - radial: N lines radiating from a center point at 360/N apart (pie slices) - grid: N… |
| `select-same.ts` | Select Same: extend the selection to every element that shares a property with the primary selected element |
| `select.ts` | DOM element selection box tools |
| `selected-elem.ts` | Tools for SVG selected element operation |
| `selection.ts` | Tools for selection |
| `shape-builder.ts` | Shape builder — region arithmetic for the interactive paint-to-merge tool (UI/mode in ext-shape-builder; this module owns the paper.js math and the document mutations) |
| `shape-family.ts` | Generators for the "Line Segment family" shape tools: Spiral, Arc, Rectangular Grid and Polar Grid, plus the drag geometry (Shift = equal axes, Alt = from the centre) the tools share |
| `shape-recognize.ts` | Shape recognition for the Shaper tool: a rough freehand stroke becomes a clean shape |
| `smart-guides.ts` | Smart alignment guides — object-to-object snapping math |
| `snapshot-history.ts` | Undo and redo as model snapshots (R1 step d): the drawing after every command, and a step is `reconcile(dom, now, snapshot)` |
| `split-grid.ts` | Split Into Grid: replace a shape with `rows × cols` rectangles that fill its bounding box, in the shape's own coordinates (so a rotated rect keeps its rotation) and with its look |
| `svg-defs.ts` | Defs / reference maintenance for the document: id uniquification, `<use>` wiring, unused-def cleanup, and the load-time gradient and drop-shadow-filter conversions |
| `svg-exec.ts` | SVG text in and out of the canvas: serializing the drawing (`svgToString`, `svgCanvasToString`), loading it (`setSvgString`), importing and inserting fragments, embedding images and fonts, and rasterising the result |
| `svgroot.ts` | The `svgroot` element (with the canvas drop-shadow filter) a canvas starts from |
| `taper-stroke.ts` | Tapered strokes — turn a stroked open path into a filled outline whose width follows a start/middle/end profile (paper.js-assisted) |
| `text-actions.ts` | Text edit session: the caret, the selection and the hidden textarea behind them (`verticalMove` / `lineEdge` for area text) |
| `text-attrs.ts` | Text attribute operations (bold/italic/decoration, anchor and spacing, perspective, font family/size/colour, text content), split out of elem-get-set.js |
| `text-path.ts` | Text on path — attach a `<text>` element's content to a path so the text flows along it, and detach it back to plain text |
| `text-rows.ts` | How a `<text>` element's rows are stored, read and laid out |
| `text-wrap.ts` | Greedy line breaking for area text |
| `tool-registry.ts` | Tool contract: `svgCanvas.registerTool({ id, pointerDown, pointerMove, pointerUp, … })` |
| `touch.ts` | Http://ross.posterous.com/2008/08/19/iphone-touch-events-in-javascript/ |
| `transaction.ts` | Undo transactions: `begin → (mutate freely / preview) → commit \| cancel` |
| `transform-each.ts` | Transform Each: scale, move, rotate and reflect every selected object about **its own** reference point (one of nine points of its own bounding box), optionally with a random amount per object and optionally on copies |
| `undo.ts` | Tools for undo |
| `units.ts` | Tools for working with units |
| `warp.ts` | Warp live effect: 15 envelope styles plus horizontal/vertical perspective-like distortion |
| `width-outline.ts` | Variable-width strokes: the filled outline of a path stroked with a width profile |
| `width-profile.ts` | Width profiles: the data behind variable-width strokes (the Width tool and the presets) |

### `packages/svgcanvas/core/model/`

| File | What it is |
|---|---|
| `drawing.ts` | Document model, layer 2: a typed, read-only view of a drawing over the tree in `node.ts` |
| `edit.ts` | Document model, layer 4: edits |
| `features.ts` | Document model, layer 2b: the `se:*` features of one element as typed fields |
| `index.ts` | Document model (R1 step a): a persistent tree with lossless SVG parse and serialize (`node.ts`, `parse.ts`, `serialize.ts`) and a typed read-only view of a drawing over it (`drawing.ts`) |
| `node.ts` | Document model, layer 1: a persistent (immutable, structurally shared) XML tree |
| `parse.ts` | Document model: SVG/XML text -> persistent tree (see `node.ts`) |
| `serialize.ts` | Document model: persistent tree -> SVG/XML text (see `node.ts`, `parse.ts`) |
| `summary.ts` | Document model, layer 3: a compact structural summary of a drawing, for tools that read a drawing without an editor (the headless CLI, an LLM that wants the shape of a file before it opens it) |

### `scripts/`

| File | What it is |
|---|---|
| `bundle-report.mjs` | What is in `dist/editor/Editor.js`, by package and by source folder (R6 in .claude/roadmap/rearchitecture.md) |
| `check-canvas-calls.mjs` | Fails when editor code calls the canvas wrongly: a member that does not exist on `SvgCanvas`, or arguments / assignments on a line that touches `svgCanvas` that its signature rejects |
| `check-dom-scope.mjs` | Guards against the "wrong owning editor" bug class: svgedit mounts one editor per pane/drawing in the same document, but its chrome uses fixed element ids (workarea, fill_color, the se-* dialogs, ...), so a bare… |
| `check-dom-writes.mjs` | A ratchet on the live-DOM writes of the canvas engine and the extensions (R1 step e: the document model is the source of truth, the DOM is a view the renderer writes) |
| `check-editor-strict.mjs` | Fails when a file on the editor's strict list (`src/editor/strict-files.json`) has a type error under `strict` |
| `check-layers.mjs` | Keeps the canvas engine (packages/svgcanvas) independent of the editor UI (src/editor), the way VectorCraft's `cargo xtask layers` enforces its crate layering |
| `check-model-roundtrip.mjs` | Oracle for the document model (R1): parse every saved drawing into the model and serialize it back |
| `check-ts-imports.mjs` | Fails when an import names a `.js` file that exists only as `.ts` |
| `commands-doc.mjs` | Renders `.claude/commands.md` (every command id, label, default keys and params) from `editor.commands.list({ includeHidden: true })` |
| `copy-static.mjs` | Postbuild: copies HTML entries + Playwright test harness to `dist/editor/` (CSS/images/extensions are now inlined into `Editor.js`, so they are not copied) |
| `file-map.mjs` | Generates the code tables of `.claude/file-map.md` from each source file's header comment, and checks that every file has one (R7 in .claude/roadmap/rearchitecture.md: docs say what a thing is, the file says it first) |
| `gen-ui-ids.mjs` | Generates `src/editor/ui-ids.d.ts`, the element type of every id in the editor's markup, so `svgCanvas.$id('angle')` and `$req('angle')` return `se-spin-input`'s class instead of a bare `HTMLElement` |
| `html-template.mjs` | Compaction for the editor's HTML templates (panels, dialogs, editor shell), applied by the `svgedit-html-templates` plugin in `vite.config.mjs` when a template is imported as a string |
| `publish.mjs` | Interactive release helper: confirms the version bump and CHANGES.md, optionally commits and tags the release, then publishes the packages |
| `repair-drawings.mjs` | One-off repair of already-saved drawings: rewrites the .svg files themselves, so the editor never has to carry a load-time sanitizer for old corruption |
| `run-e2e.mjs` | Runs the Playwright e2e suite: builds `dist/editor` with coverage instrumentation, starts the preview server, runs the specs and merges their coverage with vitest's |
| `svgedit-cli.mjs` | Headless CLI over the document model (R1): read a drawing without an editor or a browser |
| `version-bump.mjs` | Interactive version bump: suggests patch / minor / major from the current version and writes it to the root and workspace packages |

### `src/editor/`

| File | What it is |
|---|---|
| `addToShapeLibrary.ts` | "Add to Shape Library": serialize the selection, ask for a label/category, store it, and tell the shape library component to refresh |
| `automation.ts` | A stable in-page API for driving and inspecting the editor in **document coordinates**: `editor.automation` (also reachable as `window.svgEditor.automation`) |
| `browser-not-supported.js` | Redirects to `browser-not-supported.html` when the browser has no SVG support |
| `canvasCommands.ts` | The canvas page itself (size, background colour, saved layouts) as commands, so the Canvas Settings popover, the bottom panel's background swatch, a host and a debug log / LLM all go through one named, typed, logged… |
| `canvasLayouts.ts` | Saved canvas "layouts" (templates) for the Canvas Settings popover (`seCanvasSettings.js`) |
| `classLibrary.ts` | Class library — a global, browser-persisted store of named style presets ("classes") |
| `commandGates.ts` | Shared `enabled` checks for registry commands (see commands.js) |
| `commands.ts` | The editor's command registry ("everything is a command") |
| `commandSearch.ts` | Data + activation logic for the Command Search popup |
| `ConfigObj.ts` | `pref(key)`, `setConfig(obj)`, localStorage persistence |
| `coreCommands.ts` | The pilot commands that live in the command registry as real commands (one implementation shared by hotkey, toolbar button, favorites / quick-action menu, tablet shell and the host API) |
| `customBrushes.ts` | Custom brush presets — up to 5 saved slots for the freehand brush tool's settings (thickness, angle, roundness, taper start/end, opacity, smoothness) |
| `DebugActionStream.ts` | The debug log's *action* channel |
| `DebugSnapshotLogger.ts` | Polls a snapshot function (svgCanvas.getDebugSnapshot()) and forwards it to a host-provided sink whenever it changes, instead of rendering it in a UI panel (see Editor.js's setDebugLogger()) |
| `documentColors.ts` | The distinct solid colours a drawing already uses, for the palette's "Recent" row |
| `domScope.ts` | Resolve the editor container that owns a given element. svgedit's chrome uses fixed element IDs (workarea, fill_color, the se-* dialogs, …), so a global `getElementById`/`querySelector` returns the first match when… |
| `Editor.js` | The package entry: re-exports the `Editor` class from Editor.ts (the HTML entry and the library build name this file, and `dist/editor/Editor.js` is the bundle hosts load) |
| `Editor.ts` | The main module for the visual SVG this |
| `editorShortcuts.ts` | Editor-level shortcuts (not associated with a toolbar button) |
| `EditorStartup.ts` | Async `init()` sequence: config → i18n → DOM → SvgCanvas → panels → extensions |
| `favoriteActions.ts` | The catalog of favoritable actions and their execution |
| `favorites.ts` | Persistence for the user's quick-action favorites |
| `hostApi.check.ts` | Compile-time conformance check: fails `npm run typecheck` if `Editor` stops satisfying the declared host API |
| `Hotkeys.ts` | Central keyboard-shortcut registry for the editor |
| `locale.ts` | Localizing script for SVG-edit UI |
| `MainMenu.ts` | Export, Preferences, Tablet mode toggle (`clickTabletMode`), Hotkey Manager launcher (`tool_hotkeys` → opens `se-hotkey-dialog`), Favorites launcher (`tool_favorites` → opens `se-favorites-dialog`) |
| `panelCommands.ts` | The commands behind the panel / menu buttons, as real registry commands (see commands.js, coreCommands.js) |
| `panelI18n.ts` | Localise the literal English labels in the static panel templates (RightPanel.html / TopPanel.html) |
| `pasteClipboardText.ts` | Shared parsing rule for pasted clipboard text |
| `pasteFallbackArmer.ts` | Timing-coordinated fallback for Cmd/Ctrl+V paste |
| `Rulers.ts` | Canvas ruler rendering and tick marks |
| `runSteps.ts` | `runSteps(steps)`: runs labeled, independent steps so one that throws is logged and skipped instead of aborting the chain |
| `styleCopy.ts` | Copy the look of one element onto others (the eyedropper's "Apply style" actions) |
| `themeUtil.ts` | `applyTheme(theme, rootEl)` — canonical theme helper |
| `toolAutoFold.ts` | Fold the left column's last tools into "Additional tools" while the pane is too short to show them all, and bring them back when it grows |
| `toolCursors.ts` | The canvas cursor of each tool (mode) |
| `toolDragReorder.ts` | Drag-to-reorder for the left panel's tools |
| `toolOrder.ts` | Persistence for the left panel's user-customized tool order |
| `toolShortcutBadges.ts` | Tool shortcut badges: the key that activates a tool, drawn at the bottom right of its icon in the left panel (a `data-shortcut` attribute that `svgedit.css` paints with `::after`, so the icon artwork stays the same… |
| `tooltips.ts` | Hover tooltips for the editor chrome: a short-delay replacement for the browser's native `title` tooltip, which waits about a second (longer on some platforms) and sometimes never shows |
| `uiMode.ts` | `applyUiMode(on, rootEl)` — toggles the `ui-tablet` class on `.svg_editor` (desktop ⇄ tablet shell) |
| `userDataAdapter.ts` | Module-level registry for an optional host storage adapter used to persist user customizations (custom palette colors, the saved shape library, and custom hotkey bindings) outside the editor's own `localStorage` |

### `src/editor/components/`

| File | What it is |
|---|---|
| `commandBinding.ts` | Lets a component act as a *view* of a registry command: with `command="<id>"` a click runs `editor.commands.run(id)` instead of whatever the host panel would otherwise bind, and the editor keeps the component's… |
| `fieldAutoBlur.ts` | Release keyboard focus held by panel input fields |
| `index.ts` | Imports every custom-element component so that each registers itself |
| `PaintBox.ts` | `<se-paint-box>` — Fill/stroke paint control |
| `seButton.ts` | `<se-button>` — Icon button with pressed/disabled states |
| `seCanvasSettings.ts` | `<se-canvas-settings>` — Canvas-resize popover (W/H inputs + ratio/size presets + Apply/Reset) |
| `seClassSelect.ts` | `<se-class-select>` — Class/style-preset picker for `#elem_class`: scope-filtered dropdown of saved classes + "+"/trash buttons + save/update popover (name, scope, attribute checklist, "Default for… |
| `seColorPicker.ts` | `<se-color-picker>` — Color selection modal |
| `seExplorerButton.ts` | `<se-explorerbutton>` — toolbar button that opens a library explorer (the shape library, through its `lib` attribute) |
| `seFlyingButton.ts` | `<se-flying-button>` — Button with sub-tool flyout |
| `seFontLibrary.ts` | SeFontLibrary — <se-font-library> web component |
| `seFontSelect.ts` | `<se-font-select>` — Google-style font-family picker: themed popover with a search box and per-font previews (each option rendered in its own typeface) |
| `seGridSettings.ts` | `<se-grid-settings>` — Grid-settings popover (show/snap toggles, shape select — square/isometric/triangle/1pt/2pt perspective plus the thirds/golden ratio/center cross composition-guide shapes,… |
| `seInput.ts` | `<se-input>` — Text input with icon/label |
| `seList.ts` | `<se-list>` — Icon-based dropdown list; the `field` attribute draws the trigger as a framed field with a chevron (used for stroke Join / Cap) |
| `seListItem.ts` | `<se-list-item>` — Item inside `<se-list>` |
| `seMenu.ts` | `<se-menu>` — menu button with a popup that holds `<se-menu-item>` rows |
| `seMenuItem.ts` | `<se-menu-item>` — one row of a `<se-menu>` popup, with an icon, a label and a shortcut hint |
| `seOffsetSettings.ts` | `<se-offset-settings>` — Path offset/inset popover (distance input + outset/inset toggle + Apply → `svgCanvas.offsetPath`) |
| `sePalette.ts` | `<se-palette>` — Color palette swatch grid: per-swatch overrides, removable/re-addable swatches (`removed` key in the overrides map), and a labelled "Recent" row (`setDocumentColors`, last 5, fed by… |
| `seRepeatSettings.ts` | `<se-repeat-settings>` — Radial/grid repeat popover (mode tabs, count/sweep/center or rows/cols/gaps + Apply/Update → `svgCanvas.repeatSelection`); seeded from `svgCanvas.getRepeatParams()`; injected… |
| `seSegmentSettings.ts` | `<se-segment-settings>` — Radial/grid Segment popover (mode tabs, count/start-angle/center or count/axis, Split/Non-split toggle + Apply/Update → `svgCanvas.segmentSelection`); seeded from… |
| `seSelect.ts` | `<se-select>` — Styled `<select>` dropdown |
| `seSettingsPopover.ts` | `SeSettingsPopover` — shared base for the seven toolbar-button-plus-popover settings components below (incl |
| `seShapeLibrary.css.js` | Shadow-DOM stylesheet for <se-shape-library> (split out of seShapeLibrary.js) |
| `seShapeLibrary.data.js` | Static data for <se-shape-library> (split out of seShapeLibrary.js): the bundled shape catalog, category labels and inline icon markup |
| `seShapeLibrary.ts` | SeShapeLibrary — <se-shape-library> web component |
| `seSmoothPathSettings.ts` | `<se-smooth-path-settings>` — Smooth-path popover (0-100% strength spin-input, live-previews on every change via `svgCanvas.previewSmoothPath`, Apply → `svgCanvas.commitSmoothPath`,… |
| `seSpinInput.ts` | `<se-spin-input>` — Numeric input with icon/label/spinner; hold-repeat buttons, arrow keys, scrubby label (drag = one undo step via a canvas transaction, Shift x10 / Ctrl x0.1, Escape restores) and… |
| `seTaperSettings.ts` | `<se-taper-settings>` — Taper-stroke popover (start/end tip % + Apply/Update/Remove → `svgCanvas.applyTaperStroke`/`removeTaperStroke`); seeded from `svgCanvas.getTaperParams()`; injected by ext-taper |
| `seText.ts` | `<se-text>` — themed text label driven by its `text` / `value` attributes |
| `seToolOverflow.ts` | `<se-tool-overflow>` — Left panel's "Additional tools" overflow bucket — a pure drawer (no active-tool concept, unlike `se-flyingbutton`): fixed `src` icon, clicking the trigger always opens/closes… |
| `seZoom.ts` | `<se-zoom>` — Zoom percentage selector |
| `svgIconLoader.ts` | SvgIconLoader.ts |

### `src/editor/components/colorPicker/`

| File | What it is |
|---|---|
| `ColorDialog.css.js` | All styles for the <se-color-dialog> shadow DOM |
| `ColorDialog.ts` | <se-color-dialog> web component |
| `index.ts` | Registers <se-color-dialog> custom element |
| `PaintModel.ts` | Pure data-transformation layer for the color picker |

### `src/editor/components/colorPicker/panels/`

| File | What it is |
|---|---|
| `LinearPanel.ts` | Linear gradient tab panel |
| `RadialPanel.ts` | Radial gradient tab panel |
| `SolidPanel.ts` | Solid-color tab panel |

### `src/editor/components/colorPicker/panels/shared/`

| File | What it is |
|---|---|
| `Dial.ts` | Direction dial for linear gradient angle |
| `HsvBox.ts` | HSV color picker with hue strip, alpha strip, numeric inputs, and preset palette |
| `Slider.ts` | Reusable horizontal slider factory (not a custom element) |
| `StopBar.ts` | Gradient stop bar + detail list factory |

### `src/editor/components/eyedropper/`

| File | What it is |
|---|---|
| `EyedropperActionMenu.css.js` | Styles for the <se-eyedropper-menu> shadow DOM |
| `EyedropperActionMenu.ts` | <se-eyedropper-menu> web component |

### `src/editor/components/palette/`

| File | What it is |
|---|---|
| `PaletteDialog.css.js` | Styles for the <se-palette-dialog> shadow DOM |
| `PaletteDialog.ts` | <se-palette-dialog> web component |

### `src/editor/dialogs/`

| File | What it is |
|---|---|
| `cmenuDialog.ts` | Canvas quick-action menu (`se-cmenu_canvas-dialog`) — replaces the old static right-click menu |
| `cmenuLayersDialog.ts` | `<se-cmenu-layers>` — right-click menu of the Layers panel |
| `commandSearchDialog.ts` | `<se-command-search-dialog>` — command search: type to find a command by name or key and run it |
| `dialogSkin.css.js` | Shared look for the form-style dialogs (export, SVG source, document properties, preferences, alert/confirm/prompt) |
| `editorPreferencesDialog.ts` | Editor preferences modal (units, rulers, theme; grid settings moved to the grid-settings popover) |
| `exportDialog.ts` | Export dialog (region, format, scale 1–4×, quality for JPEG/WebP, output-size preview) |
| `favoritesDialog.ts` | Favorites manager modal (`se-favorites-dialog`) — grouped list of every favoritable action (via `buildFavoritesCatalog`) with a star toggle each |
| `hotkeyDialog.ts` | Hotkey Manager modal (`se-hotkey-dialog`) — grouped list of every action with add (key recorder) / remove / reset / reset-all, conflict feedback |
| `imageImportDialog.ts` | Insert image dialog (`se-image-import-dialog`) — file upload + URL, self-themed shadow DOM |
| `imagePropertiesDialog.ts` | Modal for image element properties |
| `index.ts` | Imports every dialog element so that each registers itself |
| `insertImage.ts` | `insertImageFromHref(href)` — inserts a centered `<image>` at natural size (used by the import dialog and ext-opensave); `insertSvgElements(svgString, { vaultLink, asPaths, fitTo })` — inserts a… |
| `positionContextMenu.ts` | Position a `position: fixed` context menu at the given viewport coordinates, keeping it inside the viewport |
| `seAlertDialog.ts` | Alert dialog (OK only) |
| `seConfirmDialog.ts` | Confirm dialog (OK / Cancel) |
| `seParamsDialog.ts` | `se-params-dialog`: a small modal form from field descriptors (number / checkbox / select / 9-point `origin` locator); `open({title, fields, onChange, onOk, onCancel})`, knows nothing of the drawing… |
| `SePlainAlertDialog.ts` | Native-`<dialog>` choice-prompt base class (`se-plain-alert-dialog`) — renders light-DOM content + one button per `choices` entry, resolves via `whenClosed()` |
| `sePromptDialog.ts` | Prompt-style dialog (`se-prompt-dialog`) — used by ext-opensave as a "loading" indicator (title + Cancel), not a real text prompt |
| `seRecolorDialog.ts` | Recolor Artwork dialog (`se-recolor-dialog`): rows "current → new", method / harmony / reduce / hue turn / keep white-black-grays; knows nothing of the drawing, hands `ext-recolor` an old → new `Map` |
| `seSelectDialog.ts` | Multi-choice select dialog |
| `seTextPromptDialog.ts` | `<se-text-prompt-dialog>` — themed replacement for the browser `prompt()`; resolves with the entered text, or `null` when cancelled |
| `seTraceDialog.ts` | `<se-trace-dialog>` — options for tracing a raster image to vector (style, colors) before `traceImageToSvg` runs |
| `svgSourceDialog.ts` | View/edit raw SVG source |
| `traceCenterline.ts` | Centerline tracing: thin strokes of a scanned or photographed drawing become stroked open paths (with their mean width and colour) instead of the filled outlines imagetracerjs makes |
| `traceImage.ts` | `traceImageToSvg(imageElem, { preset, numberofcolors })` — vectorizes a selected `<image>` (PNG/raster) into editable `<path>` elements via `imagetracerjs`, positioned over the original… |

### `src/editor/extensions/`

| File | What it is |
|---|---|
| `defineFeature.ts` | The typed shape of a built-in feature (`ext-*`): `defineFeature({ name, init(editor) })`, and the one-line locale loader every feature shares |
| `extensionRegistry.ts` | ExtensionRegistry.ts |
| `fx-filter.ts` | Shared per-element SVG filter composer for the editor's filter-based effects (outline halo, outer/inner glow and drop shadow) |

### `src/editor/extensions/ext-art-brush/`

| File | What it is |
|---|---|
| `ext-art-brush.ts` | "Brush" section in the right-panel Design tab: art brushes (one copy of some artwork stretched along a path) and pattern brushes (a tile repeated along it) |

### `src/editor/extensions/ext-blend/`

| File | What it is |
|---|---|
| `ext-blend.ts` | Blend: steps that morph shape, colour, stroke width and opacity between two (or more) key shapes |

### `src/editor/extensions/ext-brush/`

| File | What it is |
|---|---|
| `brushOptions.ts` | The Brush tool's options bar: the five saved brushes as a row of buttons (the one in use is highlighted, one edited since it was loaded is dashed), the live brush parameters, and Save / Delete for the current slot |
| `ext-brush.ts` | Configurable freehand "brush" tool |

### `src/editor/extensions/ext-color-shift/`

| File | What it is |
|---|---|
| `ext-color-shift.ts` | Adds a "Color Shift" section to the right-hand side panel (next to Layers) |

### `src/editor/extensions/ext-connector/`

| File | What it is |
|---|---|
| `ext-connector.ts` | Line-binding engine |

### `src/editor/extensions/ext-corner-radius/`

| File | What it is |
|---|---|
| `ext-corner-radius.ts` | "Corners" section in the right-panel Design tab (Live Corners): cuts the corners of the selected `<path>` / `<polygon>` / `<polyline>` / `<rect>` — every anchor where two straight sides meet, even on a path that curves… |

### `src/editor/extensions/ext-corner-tool/`

| File | What it is |
|---|---|
| `ext-corner-tool.ts` | The Corners tool (`tool_corners`, mode `corners`): a widget inside each corner of the selected shape |

### `src/editor/extensions/ext-curvature/`

| File | What it is |
|---|---|
| `ext-curvature.ts` | Curvature tool — click to place anchor points and draw smooth curves automatically (Spiro/clothoid curves), similar to Adobe Illustrator's Curvature Tool |

### `src/editor/extensions/ext-cutter/`

| File | What it is |
|---|---|
| `ext-cutter.ts` | Cutter (knife) tool — cut shapes along a straight line or a multi-point zigzag line |

### `src/editor/extensions/ext-distort-tool/`

| File | What it is |
|---|---|
| `ext-distort-tool.ts` | Distort tool: drag the four corners of a shape's box to distort it |

### `src/editor/extensions/ext-eyedropper/`

| File | What it is |
|---|---|
| `ext-eyedropper.ts` | Toolbar eyedropper tool: click an element on canvas to sample its fill color, then choose what to do with it from a small action menu (set as fill/outline/background, generate a matching OKLCH palette, or copy the whole… |

### `src/editor/extensions/ext-fonts/`

| File | What it is |
|---|---|
| `ext-fonts.ts` | Wires the <se-font-library> Google Fonts browser into the text panel: - points it at the bundled catalog, - applies a picked font (adds it to the font-family dropdown, selects it, and sets it on the current text), -… |
| `fontStore.ts` | Persistent custom-font cache + live registration for the ext-fonts feature |

### `src/editor/extensions/ext-frame-labels/`

| File | What it is |
|---|---|
| `ext-frame-labels.ts` | Draws a small name label above every frame (`<rect data-frame>`) on the canvas |

### `src/editor/extensions/ext-glow/`

| File | What it is |
|---|---|
| `ext-glow.ts` | Outer and inner glow, and feather, for any selected element, text included, in the Effects tab |

### `src/editor/extensions/ext-gradient-tool/`

| File | What it is |
|---|---|
| `ext-gradient-tool.ts` | Gradient tool: edit the gradient of the selected shape on the canvas |

### `src/editor/extensions/ext-grid/`

| File | What it is |
|---|---|
| `ext-grid.ts` | Grid overlay + snap, incl. thirds/golden-ratio/center-cross composition-guide shapes (formerly the separate ext-guides overlays) |

### `src/editor/extensions/ext-layer_view/`

| File | What it is |
|---|---|
| `ext-layer_view.ts` | Layer mode |

### `src/editor/extensions/ext-layout-ops/`

| File | What it is |
|---|---|
| `ext-layout-ops.ts` | Two dialogs that rework the selection as a whole: **Transform Each** (scale / move / rotate / reflect every selected object about its own reference point, optionally random, optionally on copies) and **Split Into Grid**… |

### `src/editor/extensions/ext-live-effects/`

| File | What it is |
|---|---|
| `ext-live-effects.ts` | UI glue for live (re-editable) path effects — the engine, `se:fx` format and effect registry live in `@svgedit/svgcanvas/core/live-effects.js` |

### `src/editor/extensions/ext-magic-wand/`

| File | What it is |
|---|---|
| `ext-magic-wand.ts` | Magic Wand tool: click a shape to select every shape that shares something with it (fill, stroke, both, stroke weight, opacity or shape type, optionally within a colour tolerance) |

### `src/editor/extensions/ext-markers/`

| File | What it is |
|---|---|
| `ext-markers.ts` | Arrow/marker decorators |

### `src/editor/extensions/ext-measure/`

| File | What it is |
|---|---|
| `ext-measure.ts` | Measure tool: drag between two points to read the distance, angle and horizontal / vertical offsets |

### `src/editor/extensions/ext-mirror/`

| File | What it is |
|---|---|
| `ext-mirror.ts` | Mirror drawing mode: while active, every newly drawn element gets a reflected twin across the canvas center axis (vertical by default; Shift+click the toggle for horizontal) |

### `src/editor/extensions/ext-opensave/`

| File | What it is |
|---|---|
| `ext-opensave.ts` | File open/save/import/append |

### `src/editor/extensions/ext-outline/`

| File | What it is |
|---|---|
| `ext-outline.ts` | Adds a second outline (halo / casing) color around a line's own stroke — e.g. a white line with a thin black outline so it stays readable on any background, analogous to a text outline |

### `src/editor/extensions/ext-panning/`

| File | What it is |
|---|---|
| `ext-panning.ts` | Pan/hand tool |

### `src/editor/extensions/ext-path-edit/`

| File | What it is |
|---|---|
| `ext-path-edit.ts` | UI for the path edits that live in `@svgedit/svgcanvas/core/path-edit.js` / `path-join.js` (geometry, undo and eligibility are the canvas's job): |

### `src/editor/extensions/ext-polystar/`

| File | What it is |
|---|---|
| `ext-polystar.ts` | Star and polygon tools |

### `src/editor/extensions/ext-proportion-markers/`

| File | What it is |
|---|---|
| `ext-proportion-markers.ts` | Draws small triangle tick markers along all four canvas edges at canonical proportion points of the canvas width/height (1/2, thirds, quarters, fifths) |

### `src/editor/extensions/ext-puppet-warp/`

| File | What it is |
|---|---|
| `ext-puppet-warp.ts` | Puppet Warp tool — Illustrator-style mesh deformation |
| `mls.ts` | Moving Least Squares (MLS) **rigid** point deformation |

### `src/editor/extensions/ext-recolor/`

| File | What it is |
|---|---|
| `ext-recolor.ts` | Recolor Artwork: a "Recolor" button in the Effects tab (command `tool_recolor`) opens `se-recolor-dialog`, which lists the distinct colours of the selection (fills, strokes, gradient stops, filter flood colours) as rows… |

### `src/editor/extensions/ext-repeat/`

| File | What it is |
|---|---|
| `ext-repeat.ts` | Radial / grid repeat (array) tool |

### `src/editor/extensions/ext-ruler-guides/`

| File | What it is |
|---|---|
| `ext-ruler-guides.ts` | Ruler guides: drag from the top ruler for a horizontal guide, from the left ruler for a vertical one |

### `src/editor/extensions/ext-segment/`

| File | What it is |
|---|---|
| `ext-segment.ts` | UI glue for the Segment tool (geometry + data model live in `@svgedit/svgcanvas/core/segment.js`) |

### `src/editor/extensions/ext-shadow/`

| File | What it is |
|---|---|
| `ext-shadow.ts` | Adds a drop shadow to any selected shape via a composed SVG filter |

### `src/editor/extensions/ext-shape-builder/`

| File | What it is |
|---|---|
| `ext-shape-builder.ts` | Interactive shape builder (Illustrator-style paint-to-merge), the UI/mode for `@svgedit/svgcanvas/core/shape-builder.js` |

### `src/editor/extensions/ext-shape-family/`

| File | What it is |
|---|---|
| `ext-shape-family.ts` | Four drag tools in the shapes flyout, after Illustrator's Line Segment family and ported from VectorCraft: Spiral, Arc, Rectangular Grid and Polar Grid |

### `src/editor/extensions/ext-shaper/`

| File | What it is |
|---|---|
| `ext-shaper.ts` | Shaper tool, after Illustrator's: draw a rough rectangle, ellipse, triangle, polygon or line with the pen / mouse / finger and it becomes a clean native shape; a zig-zag scribbled over existing objects deletes them |

### `src/editor/extensions/ext-shapes/`

| File | What it is |
|---|---|
| `ext-shapes.ts` | Pre-made shape library (incl. the stroke-based Accents decoration category — droplets, sparkles, motion arcs, speed lines, puffs — in `shapelib/accents.json`) |
| `userShapes.ts` | Persistence utilities for user-saved shape library entries |

### `src/editor/extensions/ext-smart-guides/`

| File | What it is |
|---|---|
| `ext-smart-guides.ts` | Renders the smart alignment guides: while dragging a selection, core `event.js` snaps it to other elements' edges/centers (or the page) and to equal spacing between neighbors — see… |

### `src/editor/extensions/ext-smooth-tool/`

| File | What it is |
|---|---|
| `ext-smooth-tool.ts` | Smooth tool: brush over part of a path and only that part is smoothed |

### `src/editor/extensions/ext-taper/`

| File | What it is |
|---|---|
| `ext-taper.ts` | UI glue for tapered strokes (geometry + data model live in `@svgedit/svgcanvas/core/taper-stroke.js`) |

### `src/editor/extensions/ext-text-path/`

| File | What it is |
|---|---|
| `ext-text-path.ts` | UI glue for text on path (logic in `@svgedit/svgcanvas/core/text-path.js`) |

### `src/editor/extensions/ext-theme-toggle/`

| File | What it is |
|---|---|
| `ext-theme-toggle.ts` | Adds a theme-toggle button to the top panel (#theme_panel) that lets users quickly switch between light and dark themes |

### `src/editor/extensions/ext-width-tool/`

| File | What it is |
|---|---|
| `ext-width-tool.ts` | Width tool: variable-width strokes edited on the canvas |

### `src/editor/images/`

| File | What it is |
|---|---|
| `iconRegistry.ts` | IconRegistry.ts |

### `src/editor/palette/`

| File | What it is |
|---|---|
| `generatePalette.ts` | OKLCH palette generator orchestrator |
| `oklchColor.ts` | Thin culori wrapper for OKLCH color-space math |
| `paletteObjectives.ts` | Scoring and whole-palette harmonization passes for the OKLCH palette generator |

### `src/editor/panels/`

| File | What it is |
|---|---|
| `BottomPanel.ts` | Color-picker handlers + zoom/stroke/opacity handler methods (listeners bound in TopPanel) |
| `layerGestures.ts` | Gestures of the Layers panel's eye / lock columns and layer rows: - **Alt-click an eye or a padlock** acts on every *other* row (the siblings, for an object row): hide / lock them all, or, when they already are, show /… |
| `layerKeyboard.ts` | Keyboard access to the Layers panel (the layer rows and the object tree under them, see layerTree.js) |
| `layerTree.ts` | Object rows of the Layers panel: under each expanded layer, a row per object and group (groups expand), with an eye (hide), a lock, the name (double-click renames), the selection highlight, and drag to reorder or move… |
| `LeftPanel.ts` | Drawing tool button handlers; mode switching |
| `RightPanel.ts` | Tabbed properties panel: `activateTab`/`autoSelectTab` + layer ops |
| `TabletShell.ts` | Tablet mode shell: builds the touch command bar + contextual bottom sheet, binds directly to the `selected`/`changed`/`zoomed` `svgCanvas` events (`svgCanvas.bind` is backed by a native… |
| `toolOptionsBar.ts` | The options bar of the current tool: a tray in the top panel (and, in tablet mode, a strip in the shell) drawn from the tool's `options()` descriptors (`ToolDef.options` / `setOption`, core/tool-registry.js) |
| `TopPanel.ts` | Quick-action handlers + `updateContextPanel` (shows/hides trays & tab sections); binds relocated zoom/stroke/opacity listeners; `attrChanger()` |
| `topPanelContext.ts` | The top panel's context-panel refresh (which tools/fields show for the current selection), split out of TopPanel.js, whose `updateContextPanel()` delegates here |

<!-- file-map:end -->

---

## Icons — `src/editor/images/`

All toolbar icons are stroke-based SVGs using `stroke="currentColor" fill="none"`.
They recolor automatically via CSS `color:` property — no filter needed.

Key icon naming: `{action}.svg` e.g. `undo.svg`, `align_left.svg`, `bold.svg`, `c_radius.svg`, `frame.svg` (Frame export-region tool)

| File | Purpose |
|------|---------|
| `lock.svg` / `lock_open.svg` | Closed/open padlock icons for the per-row **layer lock** toggle (`td.layerlock`) in the Layers panel. Open = unlocked (clickable hint), closed = locked; `RightPanel.populateLayers` picks/swaps them by state — see [tools.md](tools.md) "Layers Panel" |
| `pin.svg` | Puppet Warp tool (`tool_puppet_warp`) icon |
| `shapes.svg` | Combined shapes flyout (`tools_shapes`) fixed trigger icon |
| `more_tools.svg` | "Additional tools" overflow bucket (`tools_overflow`, `<se-tool-overflow>`) icon |

`extensions/extensionRegistry.js` does the equivalent for extensions (eager glob
of `ext-*/ext-*.js`, bundled into `Editor.js`).

---

## Documentation — `docs/`

| Path | Audience | Purpose |
|------|----------|---------|
| `docs/tutorials/` | Developers | API/config reference (CanvasAPI, EditorAPI, Events, etc.; upstream, partly dated) |
| `docs/Development.md` | Developers | npm scripts, tests, coverage, dev server |
| `docs/user-tutorials/` | End users | Short promo-style how-to guides, one per tool/feature (Use case / Relevant for / How to test it / Related properties); `README.md` is the index |

---

## Config & Build

| File | Purpose |
|------|---------|
| `src/vite-env.d.ts` | Ambient TS declarations for Vite imports (`vite/client` + `*.html` as string) so the IDE resolves template/`?inline` imports |
| `packages/svgcanvas/legacy-jsdoc-types.d.ts` | Global `PlainObject` / `GenericArray` aliases for the upstream JSDoc still in `// @ts-check` modules (listed first in both svgcanvas tsconfigs). New code writes the real type |
| `packages/svgcanvas/tsconfig.strict.json` | Strict (`noImplicitAny` + `strictNullChecks`) typecheck, part of `npm run typecheck`. Lists every `// @ts-check` module that is strict-clean **together with everything it imports** (all 107 `core/`+`common/` modules on 2026-10-12, and `svgcanvas.js` itself on 2026-10-13); a module outside the list is only checked by the lax `tsconfig.json`. To add one: fix its strict errors (and its imports'), then add it. A pragma'd file reached by a listed one is checked strictly whether listed or not |
| `package.json` | Scripts: `build`, `start` (dev server :8000), `test` (+ `pretest` gates), `typecheck`, `version-bump`, `publish`. Dependencies include `culori` (OKLCH color math, used by `src/editor/palette/`) |
| `packages/svgcanvas/package.json` | svgcanvas workspace package |
| `CLAUDE.md` | This repo's coding guidelines for AI agents |
| `.claude/` | Agent documentation (this folder) |
