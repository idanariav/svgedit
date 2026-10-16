# SVGedit File Map

> **How to use this doc:** find a file, read what it is. The tables of source files below are **generated** from each
> file's header comment (`npm run file-map`; `npm test` fails when a file has no header or the tables are stale), so to
> change an entry, edit the first sentence of that file's header comment. Details belong in the file, history in git.
> Files that are not JS (icons, docs, configs) are listed by hand after the generated block.

<!-- file-map:begin -->

### `packages/svgcanvas/`

| File | What it is |
|---|---|
| `svgcanvas.js` | Numerous tools for working with the editor's "canvas" |
| `vite.config.mjs` | Vite library build of the canvas on its own: one ES `svgcanvas.js` into `dist/` |

### `packages/svgcanvas/common/`

| File | What it is |
|---|---|
| `browser.ts` | Browser detection |
| `initGuard.ts` | Collision guard for SvgCanvas's per-module `xxxInit(canvas)` calls |
| `logger.ts` | Centralized logging utility for SVGCanvas |
| `util.ts` | Common utility functions |

### `packages/svgcanvas/core/`

| File | What it is |
|---|---|
| `anchor-path.ts` | Anchor-based path model — a small, DOM-free representation of a path as subpaths of anchors with in/out Bézier handles, plus the geometry helpers the live-effect pipeline needs (non-linear mapping, Catmull-Rom… |
| `arrow-align.ts` | Arrowhead alignment: where a marker head sits on the end of its line |
| `art-brush-canvas.js` | Art and pattern brushes on the canvas: the elements, the brush library and the canvas API |
| `art-brush.ts` | Art and pattern brush geometry: artwork bent along a path by arc length |
| `bbox-utils.ts` | Bounding-box computation utilities |
| `bezier-fit.ts` | Least-squares cubic Bézier fitting of point sequences: fit a cubic with fixed end tangents, reparameterise with Newton steps, and split at the worst point when one cubic is not enough (the approach from Graphics Gems,… |
| `blend-canvas.js` | Blends on the canvas: the group, its keys and generated steps, and the canvas API |
| `blend.ts` | Blends: the geometry and paint of the steps between two key shapes |
| `blur-event.js` | Tools for blur event |
| `boolean-ops.ts` | Boolean path operations: union, intersect, subtract, exclude, divide |
| `brush-stroke.js` | Custom brush geometry: centerline smoothing + a nib-based variable-width outline generator for the freehand "brush" tool (see `ext-brush`) |
| `clear.ts` | Resets the `#svgcontent` element to a blank document |
| `clip-mask.js` | Clip & mask creation: confine the top selected object to the silhouette of the object below it, and release an existing clip/mask |
| `coords.js` | Manipulating coordinates |
| `copy-elem.js` | Copy handler |
| `corner-radius.ts` | Live Corners: per-corner radius and kind (round, inverted round, chamfer) on the corners of any path — the anchors where two straight sides meet |
| `cutter.ts` | Cutter (knife) tool: splits selected shapes along a cutting line, which may be a single straight segment or an arbitrary open polyline (zigzag) |
| `dash-fit.ts` | Fitted dashes: stretch or squeeze a dash pattern so a whole number of periods fits the stroke's length, with a dash centred on both ends of an open path |
| `dataStorage.ts` | A storage solution aimed at replacing jQuery's data function |
| `debug-events.ts` | Helpers for the discrete debug-event channel (`svgCanvas.logDebugEvent`): compact, privacy-safe descriptions of elements and input, so a host log can be read — by a person or an LLM — as the sequence of things the user… |
| `distort.ts` | Free Distort and Perspective Distort live effects: the four corners of the shape's box move to new places and the geometry follows |
| `dom-utils.ts` | DOM/element manipulation, lookup, and misc canvas-state utilities |
| `draw-snap.ts` | Snapping while drawing: the point a drawing tool places (the corner of a rectangle, a line's end, a pen anchor, a polygon's centre) snaps to other objects' anchors, bounding-box corners / midpoints / centres and edge… |
| `draw.js` | Tools for drawing |
| `drawing-invariants.ts` | Structural invariants of a healthy drawing, as a pure DOM check |
| `elem-get-set.js` | `changeSelectedAttribute()` and attribute I/O |
| `encoding-utils.ts` | String/XML/base64 encoding utilities |
| `event-group-context.js` | Group-editing coordinate helpers shared by `event.js`'s mouseDown/mouseMove preludes and the select/shape-draw mode handlers |
| `event-path-edit.js` | Path drawing/editing mode (`path`/`pathedit`) mouse handlers, extracted from the `path`/`pathedit` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-resize.js` | Resize mode (`resize`) mouse handlers, extracted from the `resize` case of `event.js`'s mouseDown/mouseMove switches |
| `event-rotate.js` | Rotate mode (`rotate`) mouse handlers, extracted from the `rotate` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-select.js` | Selection mode (`select`/`multiselect`) mouse handlers, extracted from the `select`/`multiselect` cases of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-shape-draw.js` | Shape-creation mode mouse handlers, extracted from the rect/square/frame/foreignObject/image/circle/ellipse/line/text/ fhellipse/fhrect/fhpath cases of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-text-edit.js` | Text-editing mode (`textedit`) mouse handlers, extracted from the `textedit` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event-zoom.js` | Zoom-mode (rubber-band marquee zoom) mouse handlers, extracted from the `zoom` case of `event.js`'s mouseDown/mouseMove/mouseUp switches |
| `event.js` | Tools for event |
| `extension-hooks.ts` | Registry of extension hook names, with the payload each one receives |
| `geometry-remap-registry.ts` | Registry for attribute-driven derived-geometry remap hooks |
| `gesture-state.ts` | The state a pointer gesture parks on the canvas between mouse events (rotate / resize / drag starts, the armed alt-clone, the pending new element…), one object per canvas (`svgCanvas.gesture`) instead of fourteen loose… |
| `gradient-edit.ts` | Gradient editing maths and DOM helpers for the on-canvas gradient tool (`ext-gradient-tool`) |
| `group-detach.js` | Helpers for detaching content from group nesting so it becomes independent top-level content (used by Duplicate and Paste) while staying in the same visual position |
| `group-ops.js` | Grouping operations (group, ungroup, convert-to-group, push group properties down to children), split out of selected-elem.js |
| `guides.ts` | Ruler guides: horizontal and vertical lines the user drags out of the rulers to align things by |
| `history.js` | For command history tracking and undo functionality |
| `historyrecording.js` | HistoryRecordingService component of history |
| `image-crop.js` | Destructive crop for imported raster `<image>` elements |
| `json.js` | Tools for SVG handle on JSON format |
| `layer-ops.js` | Layer operations (create/clone/delete/rename/reorder/visibility/lock/merge, move-to-layer, all-layers mode), split out of draw.js |
| `layer.js` | Provides tools for the layer concept |
| `live-effects-distort.js` | Distort & stylize live effects: Roughen, Zig Zag, Pucker & Bloat, Twist, Tweak, Round Corners and Scribble |
| `live-effects.ts` | Live (re-editable) path-geometry effects — the shared foundation for Roughen, Zig Zag, Warp, … Each effect is a pure function over anchor subpaths registered here; this module owns the attribute plumbing so an effect is… |
| `live-stack.ts` | The live stack: how corner radius, live effects and a variable-width stroke combine on one element |
| `load-image.ts` | Load an image href into an `HTMLImageElement`, ready for `drawImage` |
| `math.ts` | Mathematical utilities |
| `measure.ts` | Measure tool maths: the distance, angle and offsets between two points, the 45° constraint, and the readout lines |
| `namespaces.ts` | Namespaces or tools therefor |
| `object-state.js` | Per-object state for the Layers panel's object rows: hidden (`display="none"`, the same mechanism as a hidden layer), locked (`se:locked="true"`, the same attribute a locked layer carries) and moving objects between… |
| `paint.ts` | Fill, stroke, color management |
| `paper-utils.ts` | Shared paper.js helpers for the boolean/geometry tools (boolean-ops, cutter, path-offset, shape-builder, taper-stroke, path-simplify) |
| `paste-elem.js` | Paste handler |
| `path-actions.js` | Path functionality |
| `path-edit.ts` | Path-editing operations on the anchor model (`anchor-path.js`): Remove Anchor (keeps the shape by refitting the neighbours' handles), Add Anchor Points, Average and Join |
| `path-fit.ts` | Corner-keeping path simplification, on the anchor model (`anchor-path.js`) |
| `path-join.ts` | Join for the select tool: two selected open paths become one (the upper one is merged into the lower one, which keeps its id and style), or one open path is closed |
| `path-method.js` | Path functionality |
| `path-node-guides.ts` | Path-node alignment guides — node-to-node alignment math for pathedit mode |
| `path-offset.ts` | Path offset / inset and stroke-to-path operations |
| `path-seg-shim.js` | Replacement for the deprecated `SVGPathSeg`/`SVGPathSegList` DOM API, removed from browsers around 2016 and previously restored here via the `pathseg` npm polyfill |
| `path-simplify.ts` | Path simplification / smoothing, on the corner-keeping Bézier fit in `path-fit.js` (sharp turns stay corners; tolerances are distances in user units) |
| `path-utils.ts` | Path `d`-attribute construction and element-to-path conversion utilities |
| `path.js` | Path functionality |
| `pen-continue.ts` | The Pen's "continue" and "join" gestures: pressing on an end of an existing open path carries that path on (or, while drawing, joins the drawing to it) |
| `proportions.ts` | Shared definitions for wireframe-mode proportion markers + snapping |
| `recalculate.js` | Recalculate dimensions and transformations of SVG elements |
| `recolor.ts` | Recolor Artwork: the colour maths and the DOM walk behind the Recolor dialog (`ext-recolor`) |
| `sanitize.js` | Tools for SVG sanitization |
| `se-namespace.ts` | Helpers for the editor's `se:` attribute namespace |
| `segment.ts` | Segment tool: divides a single selected shape into symmetric pieces using evenly-spaced dividing lines, in two generator modes: - radial: N lines radiating from a center point at 360/N apart (pie slices) - grid: N… |
| `select-same.ts` | Select Same: extend the selection to every element that shares a property with the primary selected element |
| `select.js` | DOM element selection box tools |
| `selected-elem.js` | Tools for SVG selected element operation |
| `selection.js` | Tools for selection |
| `shape-builder.ts` | Shape builder — region arithmetic for the interactive paint-to-merge tool (UI/mode in ext-shape-builder; this module owns the paper.js math and the document mutations) |
| `shape-family.ts` | Generators for the "Line Segment family" shape tools: Spiral, Arc, Rectangular Grid and Polar Grid, plus the drag geometry (Shift = equal axes, Alt = from the centre) the tools share |
| `shape-recognize.ts` | Shape recognition for the Shaper tool: a rough freehand stroke becomes a clean shape |
| `smart-guides.ts` | Smart alignment guides — object-to-object snapping math |
| `split-grid.js` | Split Into Grid: replace a shape with `rows × cols` rectangles that fill its bounding box, in the shape's own coordinates (so a rotated rect keeps its rotation) and with its look |
| `svg-defs.js` | Defs / reference maintenance for the document: id uniquification, `<use>` wiring, unused-def cleanup, and the load-time gradient and drop-shadow-filter conversions |
| `svg-exec.js` | Tools for svg |
| `svgroot.ts` | The `svgroot` element (with the canvas drop-shadow filter) a canvas starts from |
| `taper-stroke.ts` | Tapered strokes — turn a stroked open path into a filled outline whose width follows a start/middle/end profile (paper.js-assisted) |
| `text-actions.js` | Text cursor/selection editing (`verticalMove` for area text) |
| `text-attrs.js` | Text attribute operations (bold/italic/decoration, anchor and spacing, perspective, font family/size/colour, text content), split out of elem-get-set.js |
| `text-path.js` | Text on path — attach a `<text>` element's content to a path so the text flows along it, and detach it back to plain text |
| `text-rows.ts` | How a `<text>` element's rows are stored, read and laid out |
| `text-wrap.ts` | Greedy line breaking for area text |
| `tool-registry.js` | Tool contract: `svgCanvas.registerTool({ id, pointerDown, pointerMove, pointerUp, … })` |
| `touch.ts` | Http://ross.posterous.com/2008/08/19/iphone-touch-events-in-javascript/ |
| `transaction.js` | Undo transactions: `begin → (mutate freely / preview) → commit \| cancel` |
| `transform-each.js` | Transform Each: scale, move, rotate and reflect every selected object about **its own** reference point (one of nine points of its own bounding box), optionally with a random amount per object and optionally on copies |
| `undo.js` | Tools for undo |
| `units.ts` | Tools for working with units |
| `warp.ts` | Warp live effect: 15 envelope styles plus horizontal/vertical perspective-like distortion |
| `width-outline.ts` | Variable-width strokes: the filled outline of a path stroked with a width profile |
| `width-profile.ts` | Width profiles: the data behind variable-width strokes (the Width tool and the presets) |

### `packages/svgcanvas/core/model/`

| File | What it is |
|---|---|
| `drawing.ts` | Document model, layer 2: a typed, read-only view of a drawing over the tree in `node.ts` |
| `features.ts` | Document model, layer 2b: the `se:*` features of one element as typed fields |
| `index.ts` | Document model (R1 step a): a persistent tree with lossless SVG parse and serialize (`node.ts`, `parse.ts`, `serialize.ts`) and a typed read-only view of a drawing over it (`drawing.ts`) |
| `node.ts` | Document model, layer 1: a persistent (immutable, structurally shared) XML tree |
| `parse.ts` | Document model: SVG/XML text -> persistent tree (see `node.ts`) |
| `serialize.ts` | Document model: persistent tree -> SVG/XML text (see `node.ts`, `parse.ts`) |

### `scripts/`

| File | What it is |
|---|---|
| `bundle-report.mjs` | What is in `dist/editor/Editor.js`, by package and by source folder (R6 in .claude/roadmap/rearchitecture.md) |
| `check-dom-scope.mjs` | Guards against the "wrong owning editor" bug class: svgedit mounts one editor per pane/drawing in the same document, but its chrome uses fixed element ids (workarea, fill_color, the se-* dialogs, ...), so a bare… |
| `check-layers.mjs` | Keeps the canvas engine (packages/svgcanvas) independent of the editor UI (src/editor), the way VectorCraft's `cargo xtask layers` enforces its crate layering |
| `check-model-roundtrip.mjs` | Oracle for the document model (R1): parse every saved drawing into the model and serialize it back |
| `check-ts-imports.mjs` | Fails when an import names a `.js` file that exists only as `.ts` |
| `commands-doc.mjs` | Renders `.claude/commands.md` (every command id, label, default keys and params) from `editor.commands.list({ includeHidden: true })` |
| `copy-static.mjs` | Postbuild: copies HTML entries + Playwright test harness to `dist/editor/` (CSS/images/extensions are now inlined into `Editor.js`, so they are not copied) |
| `file-map.mjs` | Generates the code tables of `.claude/file-map.md` from each source file's header comment, and checks that every file has one (R7 in .claude/roadmap/rearchitecture.md: docs say what a thing is, the file says it first) |
| `html-template.mjs` | Compaction for the editor's HTML templates (panels, dialogs, editor shell), applied by the `svgedit-html-templates` plugin in `vite.config.mjs` when a template is imported as a string |
| `publish.mjs` | Interactive release helper: confirms the version bump and CHANGES.md, optionally commits and tags the release, then publishes the packages |
| `repair-drawings.mjs` | One-off repair of already-saved drawings: rewrites the .svg files themselves, so the editor never has to carry a load-time sanitizer for old corruption |
| `run-e2e.mjs` | Runs the Playwright e2e suite: builds `dist/editor` with coverage instrumentation, starts the preview server, runs the specs and merges their coverage with vitest's |
| `version-bump.mjs` | Interactive version bump: suggests patch / minor / major from the current version and writes it to the root and workspace packages |

### `src/editor/`

| File | What it is |
|---|---|
| `addToShapeLibrary.js` | "Add to Shape Library": serialize the selection, ask for a label/category, store it, and tell the shape library component to refresh |
| `automation.js` | A stable in-page API for driving and inspecting the editor in **document coordinates**: `editor.automation` (also reachable as `window.svgEditor.automation`) |
| `browser-not-supported.js` | Redirects to `browser-not-supported.html` when the browser has no SVG support |
| `canvasCommands.js` | The canvas page itself (size, background colour, saved layouts) as commands, so the Canvas Settings popover, the bottom panel's background swatch, a host and a debug log / LLM all go through one named, typed, logged… |
| `canvasLayouts.js` | Saved canvas "layouts" (templates) for the Canvas Settings popover (`seCanvasSettings.js`) |
| `classLibrary.js` | Class library — a global, browser-persisted store of named style presets ("classes") |
| `commandGates.js` | Shared `enabled` checks for registry commands (see commands.js) |
| `commands.js` | The editor's command registry ("everything is a command") |
| `commandSearch.js` | Data + activation logic for the Command Search popup |
| `ConfigObj.js` | `pref(key)`, `setConfig(obj)`, localStorage persistence |
| `contextmenu.js` | Adds context menu functionality |
| `coreCommands.js` | The pilot commands that live in the command registry as real commands (one implementation shared by hotkey, toolbar button, favorites / quick-action menu, tablet shell and the host API) |
| `customBrushes.js` | Custom brush presets — up to 5 saved slots for the freehand brush tool's settings (thickness, angle, roundness, taper start/end, opacity, smoothness) |
| `DebugActionStream.js` | The debug log's *action* channel |
| `DebugSnapshotLogger.js` | Polls a snapshot function (svgCanvas.getDebugSnapshot()) and forwards it to a host-provided sink whenever it changes, instead of rendering it in a UI panel (see Editor.js's setDebugLogger()) |
| `documentColors.js` | The distinct solid colours a drawing already uses, for the palette's "Recent" row |
| `domScope.js` | Resolve the editor container that owns a given element |
| `Editor.js` | The main module for the visual SVG this |
| `editorShortcuts.js` | Editor-level shortcuts (not associated with a toolbar button) |
| `EditorStartup.js` | Async `init()` sequence: config → i18n → DOM → SvgCanvas → panels → extensions |
| `favoriteActions.js` | The catalog of favoritable actions and their execution |
| `favorites.js` | Persistence for the user's quick-action favorites |
| `hostApi.check.ts` | Compile-time conformance check: fails `npm run typecheck` if `Editor` stops satisfying the declared host API |
| `Hotkeys.js` | Central keyboard-shortcut registry for the editor |
| `locale.js` | Localizing script for SVG-edit UI |
| `MainMenu.js` | Export, Preferences, Tablet mode toggle (`clickTabletMode`), Hotkey Manager launcher (`tool_hotkeys` → opens `se-hotkey-dialog`), Favorites launcher (`tool_favorites` → opens `se-favorites-dialog`) |
| `panelCommands.js` | The commands behind the panel / menu buttons, as real registry commands (see commands.js, coreCommands.js) |
| `panelI18n.js` | Localise the literal English labels in the static panel templates (RightPanel.html / TopPanel.html) |
| `pasteClipboardText.js` | Shared parsing rule for pasted clipboard text |
| `pasteFallbackArmer.js` | Timing-coordinated fallback for Cmd/Ctrl+V paste |
| `Rulers.js` | Canvas ruler rendering and tick marks |
| `runSteps.js` | `runSteps(steps)`: runs labeled, independent steps so one that throws is logged and skipped instead of aborting the chain |
| `styleCopy.js` | Copy the look of one element onto others (the eyedropper's "Apply style" actions) |
| `themeUtil.js` | `applyTheme(theme, rootEl)` — canonical theme helper |
| `toolAutoFold.js` | Fold the left column's last tools into "Additional tools" while the pane is too short to show them all, and bring them back when it grows |
| `toolCursors.js` | The canvas cursor of each tool (mode) |
| `toolDragReorder.js` | Drag-to-reorder for the left panel's tools |
| `toolOrder.js` | Persistence for the left panel's user-customized tool order |
| `toolShortcutBadges.js` | Tool shortcut badges: the key that activates a tool, drawn at the bottom right of its icon in the left panel (a `data-shortcut` attribute that `svgedit.css` paints with `::after`, so the icon artwork stays the same… |
| `uiMode.js` | `applyUiMode(on, rootEl)` — toggles the `ui-tablet` class on `.svg_editor` (desktop ⇄ tablet shell) |
| `userDataAdapter.js` | Module-level registry for an optional host storage adapter used to persist user customizations (custom palette colors, the saved shape library, and custom hotkey bindings) outside the editor's own `localStorage` |

### `src/editor/components/`

| File | What it is |
|---|---|
| `commandBinding.js` | Lets a component act as a *view* of a registry command: with `command="<id>"` a click runs `editor.commands.run(id)` instead of whatever the host panel would otherwise bind, and the editor keeps the component's… |
| `fieldAutoBlur.js` | Release keyboard focus held by panel input fields |
| `index.js` | Imports every custom-element component so that each registers itself |
| `PaintBox.js` | `<se-paint-box>` — Fill/stroke paint control |
| `seBrushSettings.js` | `<se-brush-settings>` — Brush-tool settings popover (its trigger is a gear with the text "Brush settings", not a lone icon; thickness/angle/roundness/taper start-end/opacity/smoothness fields + 5… |
| `seButton.js` | `<se-button>` — Icon button with pressed/disabled states |
| `seCanvasSettings.js` | `<se-canvas-settings>` — Canvas-resize popover (W/H inputs + ratio/size presets + Apply/Reset) |
| `seClassSelect.js` | `<se-class-select>` — Class/style-preset picker for `#elem_class`: scope-filtered dropdown of saved classes + "+"/trash buttons + save/update popover (name, scope, attribute checklist, "Default for… |
| `seColorPicker.js` | `<se-color-picker>` — Color selection modal |
| `seExplorerButton.js` | `<se-explorerbutton>` — toolbar button that opens a library explorer (the shape library, through its `lib` attribute) |
| `seFlyingButton.js` | `<se-flying-button>` — Button with sub-tool flyout |
| `seFontLibrary.js` | SeFontLibrary — <se-font-library> web component |
| `seFontSelect.js` | `<se-font-select>` — Google-style font-family picker: themed popover with a search box and per-font previews (each option rendered in its own typeface) |
| `seGridSettings.js` | `<se-grid-settings>` — Grid-settings popover (show/snap toggles, shape select — square/isometric/triangle/1pt/2pt perspective plus the thirds/golden ratio/center cross composition-guide shapes,… |
| `seInput.js` | `<se-input>` — Text input with icon/label |
| `seList.js` | `<se-list>` — Icon-based dropdown list; the `field` attribute draws the trigger as a framed field with a chevron (used for stroke Join / Cap) |
| `seListItem.js` | `<se-list-item>` — Item inside `<se-list>` |
| `seMenu.js` | `<se-menu>` — menu button with a popup that holds `<se-menu-item>` rows |
| `seMenuItem.js` | `<se-menu-item>` — one row of a `<se-menu>` popup, with an icon, a label and a shortcut hint |
| `seOffsetSettings.js` | `<se-offset-settings>` — Path offset/inset popover (distance input + outset/inset toggle + Apply → `svgCanvas.offsetPath`) |
| `sePalette.js` | `<se-palette>` — Color palette swatch grid: per-swatch overrides, removable/re-addable swatches (`removed` key in the overrides map), and a labelled "Recent" row (`setDocumentColors`, last 5, fed by… |
| `seRepeatSettings.js` | `<se-repeat-settings>` — Radial/grid repeat popover (mode tabs, count/sweep/center or rows/cols/gaps + Apply/Update → `svgCanvas.repeatSelection`); seeded from `svgCanvas.getRepeatParams()`; injected… |
| `seSegmentSettings.js` | `<se-segment-settings>` — Radial/grid Segment popover (mode tabs, count/start-angle/center or count/axis, Split/Non-split toggle + Apply/Update → `svgCanvas.segmentSelection`); seeded from… |
| `seSelect.js` | `<se-select>` — Styled `<select>` dropdown |
| `seSettingsPopover.js` | `SeSettingsPopover` — shared base for the seven toolbar-button-plus-popover settings components below (incl |
| `seShapeLibrary.css.js` | Shadow-DOM stylesheet for <se-shape-library> (split out of seShapeLibrary.js) |
| `seShapeLibrary.data.js` | Static data for <se-shape-library> (split out of seShapeLibrary.js): the bundled shape catalog, category labels and inline icon markup |
| `seShapeLibrary.js` | SeShapeLibrary — <se-shape-library> web component |
| `seSmoothPathSettings.js` | `<se-smooth-path-settings>` — Smooth-path popover (0-100% strength spin-input, live-previews on every change via `svgCanvas.previewSmoothPath`, Apply → `svgCanvas.commitSmoothPath`,… |
| `seSpinInput.js` | `<se-spin-input>` — Numeric input with icon/label/spinner; hold-repeat buttons, arrow keys, scrubby label (drag = one undo step via a canvas transaction, Shift x10 / Ctrl x0.1, Escape restores) and… |
| `seTaperSettings.js` | `<se-taper-settings>` — Taper-stroke popover (start/end tip % + Apply/Update/Remove → `svgCanvas.applyTaperStroke`/`removeTaperStroke`); seeded from `svgCanvas.getTaperParams()`; injected by ext-taper |
| `seText.js` | `<se-text>` — themed text label driven by its `text` / `value` attributes |
| `seToolOverflow.js` | `<se-tool-overflow>` — Left panel's "Additional tools" overflow bucket — a pure drawer (no active-tool concept, unlike `se-flyingbutton`): fixed `src` icon, clicking the trigger always opens/closes… |
| `seZoom.js` | `<se-zoom>` — Zoom percentage selector |
| `svgIconLoader.js` | SvgIconLoader.js |

### `src/editor/components/colorPicker/`

| File | What it is |
|---|---|
| `ColorDialog.css.js` | All styles for the <se-color-dialog> shadow DOM |
| `ColorDialog.js` | <se-color-dialog> web component |
| `index.js` | Registers <se-color-dialog> custom element |
| `PaintModel.js` | Pure data-transformation layer for the color picker |

### `src/editor/components/colorPicker/panels/`

| File | What it is |
|---|---|
| `LinearPanel.js` | Linear gradient tab panel |
| `RadialPanel.js` | Radial gradient tab panel |
| `SolidPanel.js` | Solid-color tab panel |

### `src/editor/components/colorPicker/panels/shared/`

| File | What it is |
|---|---|
| `Dial.js` | Direction dial for linear gradient angle |
| `HsvBox.js` | HSV color picker with hue strip, alpha strip, numeric inputs, and preset palette |
| `Slider.js` | Reusable horizontal slider factory (not a custom element) |
| `StopBar.js` | Gradient stop bar + detail list factory |

### `src/editor/components/eyedropper/`

| File | What it is |
|---|---|
| `EyedropperActionMenu.css.js` | Styles for the <se-eyedropper-menu> shadow DOM |
| `EyedropperActionMenu.js` | <se-eyedropper-menu> web component |

### `src/editor/components/palette/`

| File | What it is |
|---|---|
| `PaletteDialog.css.js` | Styles for the <se-palette-dialog> shadow DOM |
| `PaletteDialog.js` | <se-palette-dialog> web component |

### `src/editor/dialogs/`

| File | What it is |
|---|---|
| `cmenuDialog.js` | Canvas quick-action menu (`se-cmenu_canvas-dialog`) — replaces the old static right-click menu |
| `cmenuLayersDialog.js` | `<se-cmenu-layers>` — right-click menu of the Layers panel |
| `commandSearchDialog.js` | `<se-command-search-dialog>` — command search: type to find a command by name or key and run it |
| `dialogSkin.css.js` | Shared look for the form-style dialogs (export, SVG source, document properties, preferences, alert/confirm/prompt) |
| `editorPreferencesDialog.js` | Editor preferences modal (units, rulers, theme; grid settings moved to the grid-settings popover) |
| `exportDialog.js` | Export dialog (region, format, scale 1–4×, quality for JPEG/WebP, output-size preview) |
| `favoritesDialog.js` | Favorites manager modal (`se-favorites-dialog`) — grouped list of every favoritable action (via `buildFavoritesCatalog`) with a star toggle each |
| `hotkeyDialog.js` | Hotkey Manager modal (`se-hotkey-dialog`) — grouped list of every action with add (key recorder) / remove / reset / reset-all, conflict feedback |
| `imageImportDialog.js` | Insert image dialog (`se-image-import-dialog`) — file upload + URL, self-themed shadow DOM |
| `imagePropertiesDialog.js` | Modal for image element properties |
| `index.js` | Imports every dialog element so that each registers itself |
| `insertImage.js` | `insertImageFromHref(href)` — inserts a centered `<image>` at natural size (used by the import dialog and ext-opensave); `insertSvgElements(svgString, { vaultLink, asPaths, fitTo })` — inserts a… |
| `positionContextMenu.js` | Position a `position: fixed` context menu at the given viewport coordinates, keeping it inside the viewport |
| `seAlertDialog.js` | Alert dialog (OK only) |
| `seConfirmDialog.js` | Confirm dialog (OK / Cancel) |
| `seParamsDialog.js` | `se-params-dialog`: a small modal form from field descriptors (number / checkbox / select / 9-point `origin` locator); `open({title, fields, onChange, onOk, onCancel})`, knows nothing of the drawing… |
| `SePlainAlertDialog.js` | Native-`<dialog>` choice-prompt base class (`se-plain-alert-dialog`) — renders light-DOM content + one button per `choices` entry, resolves via `whenClosed()` |
| `sePromptDialog.js` | Prompt-style dialog (`se-prompt-dialog`) — used by ext-opensave as a "loading" indicator (title + Cancel), not a real text prompt |
| `seRecolorDialog.js` | Recolor Artwork dialog (`se-recolor-dialog`): rows "current → new", method / harmony / reduce / hue turn / keep white-black-grays; knows nothing of the drawing, hands `ext-recolor` an old → new `Map` |
| `seSelectDialog.js` | Multi-choice select dialog |
| `seTextPromptDialog.js` | `<se-text-prompt-dialog>` — themed replacement for the browser `prompt()`; resolves with the entered text, or `null` when cancelled |
| `seTraceDialog.js` | `<se-trace-dialog>` — options for tracing a raster image to vector (style, colors) before `traceImageToSvg` runs |
| `svgSourceDialog.js` | View/edit raw SVG source |
| `traceCenterline.js` | Centerline tracing: thin strokes of a scanned or photographed drawing become stroked open paths (with their mean width and colour) instead of the filled outlines imagetracerjs makes |
| `traceImage.js` | `traceImageToSvg(imageElem, { preset, numberofcolors })` — vectorizes a selected `<image>` (PNG/raster) into editable `<path>` elements via `imagetracerjs`, positioned over the original… |

### `src/editor/extensions/`

| File | What it is |
|---|---|
| `extensionRegistry.js` | ExtensionRegistry.js |
| `fx-filter.js` | Shared per-element SVG filter composer for the editor's filter-based effects (outline halo, outer/inner glow and drop shadow) |

### `src/editor/extensions/ext-art-brush/`

| File | What it is |
|---|---|
| `ext-art-brush.js` | "Brush" section in the right-panel Design tab: art brushes (one copy of some artwork stretched along a path) and pattern brushes (a tile repeated along it) |

### `src/editor/extensions/ext-blend/`

| File | What it is |
|---|---|
| `ext-blend.js` | Blend: steps that morph shape, colour, stroke width and opacity between two (or more) key shapes |

### `src/editor/extensions/ext-brush/`

| File | What it is |
|---|---|
| `ext-brush.js` | Configurable freehand "brush" tool |

### `src/editor/extensions/ext-color-shift/`

| File | What it is |
|---|---|
| `ext-color-shift.js` | Adds a "Color Shift" section to the right-hand side panel (next to Layers) |

### `src/editor/extensions/ext-connector/`

| File | What it is |
|---|---|
| `ext-connector.js` | Line-binding engine |

### `src/editor/extensions/ext-corner-radius/`

| File | What it is |
|---|---|
| `ext-corner-radius.js` | "Corners" section in the right-panel Design tab (Live Corners): cuts the corners of the selected `<path>` / `<polygon>` / `<polyline>` / `<rect>` — every anchor where two straight sides meet, even on a path that curves… |

### `src/editor/extensions/ext-corner-tool/`

| File | What it is |
|---|---|
| `ext-corner-tool.js` | The Corners tool (`tool_corners`, mode `corners`): a widget inside each corner of the selected shape |

### `src/editor/extensions/ext-curvature/`

| File | What it is |
|---|---|
| `ext-curvature.js` | Curvature tool — click to place anchor points and draw smooth curves automatically (Spiro/clothoid curves), similar to Adobe Illustrator's Curvature Tool |

### `src/editor/extensions/ext-cutter/`

| File | What it is |
|---|---|
| `ext-cutter.js` | Cutter (knife) tool — cut shapes along a straight line or a multi-point zigzag line |

### `src/editor/extensions/ext-distort-tool/`

| File | What it is |
|---|---|
| `ext-distort-tool.js` | Distort tool: drag the four corners of a shape's box to distort it |

### `src/editor/extensions/ext-eyedropper/`

| File | What it is |
|---|---|
| `ext-eyedropper.js` | Toolbar eyedropper tool: click an element on canvas to sample its fill color, then choose what to do with it from a small action menu (set as fill/outline/background, generate a matching OKLCH palette, or copy the whole… |

### `src/editor/extensions/ext-fonts/`

| File | What it is |
|---|---|
| `ext-fonts.js` | Wires the <se-font-library> Google Fonts browser into the text panel: - points it at the bundled catalog, - applies a picked font (adds it to the font-family dropdown, selects it, and sets it on the current text), -… |
| `fontStore.js` | Persistent custom-font cache + live registration for the ext-fonts feature |

### `src/editor/extensions/ext-frame-labels/`

| File | What it is |
|---|---|
| `ext-frame-labels.js` | Draws a small name label above every frame (`<rect data-frame>`) on the canvas |

### `src/editor/extensions/ext-glow/`

| File | What it is |
|---|---|
| `ext-glow.js` | Outer and inner glow, and feather, for any selected element, text included, in the Effects tab |

### `src/editor/extensions/ext-gradient-tool/`

| File | What it is |
|---|---|
| `ext-gradient-tool.js` | Gradient tool: edit the gradient of the selected shape on the canvas |

### `src/editor/extensions/ext-grid/`

| File | What it is |
|---|---|
| `ext-grid.js` | Grid overlay + snap, incl. thirds/golden-ratio/center-cross composition-guide shapes (formerly the separate ext-guides overlays) |

### `src/editor/extensions/ext-layer_view/`

| File | What it is |
|---|---|
| `ext-layer_view.js` | Layer mode |

### `src/editor/extensions/ext-layout-ops/`

| File | What it is |
|---|---|
| `ext-layout-ops.js` | Two dialogs that rework the selection as a whole: **Transform Each** (scale / move / rotate / reflect every selected object about its own reference point, optionally random, optionally on copies) and **Split Into Grid**… |

### `src/editor/extensions/ext-live-effects/`

| File | What it is |
|---|---|
| `ext-live-effects.js` | UI glue for live (re-editable) path effects — the engine, `se:fx` format and effect registry live in `@svgedit/svgcanvas/core/live-effects.js` |

### `src/editor/extensions/ext-magic-wand/`

| File | What it is |
|---|---|
| `ext-magic-wand.js` | Magic Wand tool: click a shape to select every shape that shares something with it (fill, stroke, both, stroke weight, opacity or shape type, optionally within a colour tolerance) |

### `src/editor/extensions/ext-markers/`

| File | What it is |
|---|---|
| `ext-markers.js` | Arrow/marker decorators |

### `src/editor/extensions/ext-measure/`

| File | What it is |
|---|---|
| `ext-measure.js` | Measure tool: drag between two points to read the distance, angle and horizontal / vertical offsets |

### `src/editor/extensions/ext-mirror/`

| File | What it is |
|---|---|
| `ext-mirror.js` | Mirror drawing mode: while active, every newly drawn element gets a reflected twin across the canvas center axis (vertical by default; Shift+click the toggle for horizontal) |

### `src/editor/extensions/ext-opensave/`

| File | What it is |
|---|---|
| `ext-opensave.js` | File open/save/import/append |

### `src/editor/extensions/ext-outline/`

| File | What it is |
|---|---|
| `ext-outline.js` | Adds a second outline (halo / casing) color around a line's own stroke — e.g. a white line with a thin black outline so it stays readable on any background, analogous to a text outline |

### `src/editor/extensions/ext-panning/`

| File | What it is |
|---|---|
| `ext-panning.js` | Pan/hand tool |

### `src/editor/extensions/ext-path-edit/`

| File | What it is |
|---|---|
| `ext-path-edit.js` | UI for the path edits that live in `@svgedit/svgcanvas/core/path-edit.js` / `path-join.js` (geometry, undo and eligibility are the canvas's job): |

### `src/editor/extensions/ext-polystar/`

| File | What it is |
|---|---|
| `ext-polystar.js` | Star and polygon tools |

### `src/editor/extensions/ext-proportion-markers/`

| File | What it is |
|---|---|
| `ext-proportion-markers.js` | Draws small triangle tick markers along all four canvas edges at canonical proportion points of the canvas width/height (1/2, thirds, quarters, fifths) |

### `src/editor/extensions/ext-puppet-warp/`

| File | What it is |
|---|---|
| `ext-puppet-warp.js` | Puppet Warp tool — Illustrator-style mesh deformation |
| `mls.js` | Moving Least Squares (MLS) **rigid** point deformation |

### `src/editor/extensions/ext-recolor/`

| File | What it is |
|---|---|
| `ext-recolor.js` | Recolor Artwork: a "Recolor" button in the Effects tab (command `tool_recolor`) opens `se-recolor-dialog`, which lists the distinct colours of the selection (fills, strokes, gradient stops, filter flood colours) as rows… |

### `src/editor/extensions/ext-repeat/`

| File | What it is |
|---|---|
| `ext-repeat.js` | Radial / grid repeat (array) tool |

### `src/editor/extensions/ext-ruler-guides/`

| File | What it is |
|---|---|
| `ext-ruler-guides.js` | Ruler guides: drag from the top ruler for a horizontal guide, from the left ruler for a vertical one |

### `src/editor/extensions/ext-segment/`

| File | What it is |
|---|---|
| `ext-segment.js` | UI glue for the Segment tool (geometry + data model live in `@svgedit/svgcanvas/core/segment.js`) |

### `src/editor/extensions/ext-shadow/`

| File | What it is |
|---|---|
| `ext-shadow.js` | Adds a drop shadow to any selected shape via a composed SVG filter |

### `src/editor/extensions/ext-shape-builder/`

| File | What it is |
|---|---|
| `ext-shape-builder.js` | Interactive shape builder (Illustrator-style paint-to-merge), the UI/mode for `@svgedit/svgcanvas/core/shape-builder.js` |

### `src/editor/extensions/ext-shape-family/`

| File | What it is |
|---|---|
| `ext-shape-family.js` | Four drag tools in the shapes flyout, after Illustrator's Line Segment family and ported from VectorCraft: Spiral, Arc, Rectangular Grid and Polar Grid |

### `src/editor/extensions/ext-shaper/`

| File | What it is |
|---|---|
| `ext-shaper.js` | Shaper tool, after Illustrator's: draw a rough rectangle, ellipse, triangle, polygon or line with the pen / mouse / finger and it becomes a clean native shape; a zig-zag scribbled over existing objects deletes them |

### `src/editor/extensions/ext-shapes/`

| File | What it is |
|---|---|
| `ext-shapes.js` | Pre-made shape library (incl. the stroke-based Accents decoration category — droplets, sparkles, motion arcs, speed lines, puffs — in `shapelib/accents.json`) |
| `userShapes.js` | Persistence utilities for user-saved shape library entries |

### `src/editor/extensions/ext-smart-guides/`

| File | What it is |
|---|---|
| `ext-smart-guides.js` | Renders the smart alignment guides: while dragging a selection, core `event.js` snaps it to other elements' edges/centers (or the page) and to equal spacing between neighbors — see… |

### `src/editor/extensions/ext-smooth-tool/`

| File | What it is |
|---|---|
| `ext-smooth-tool.js` | Smooth tool: brush over part of a path and only that part is smoothed |

### `src/editor/extensions/ext-taper/`

| File | What it is |
|---|---|
| `ext-taper.js` | UI glue for tapered strokes (geometry + data model live in `@svgedit/svgcanvas/core/taper-stroke.js`) |

### `src/editor/extensions/ext-text-path/`

| File | What it is |
|---|---|
| `ext-text-path.js` | UI glue for text on path (logic in `@svgedit/svgcanvas/core/text-path.js`) |

### `src/editor/extensions/ext-theme-toggle/`

| File | What it is |
|---|---|
| `ext-theme-toggle.js` | Adds a theme-toggle button to the top panel (#theme_panel) that lets users quickly switch between light and dark themes |

### `src/editor/extensions/ext-width-tool/`

| File | What it is |
|---|---|
| `ext-width-tool.js` | Width tool: variable-width strokes edited on the canvas |

### `src/editor/images/`

| File | What it is |
|---|---|
| `iconRegistry.js` | IconRegistry.js |

### `src/editor/palette/`

| File | What it is |
|---|---|
| `generatePalette.js` | OKLCH palette generator orchestrator |
| `oklchColor.js` | Thin culori wrapper for OKLCH color-space math |
| `paletteObjectives.js` | Scoring and whole-palette harmonization passes for the OKLCH palette generator |

### `src/editor/panels/`

| File | What it is |
|---|---|
| `BottomPanel.js` | Color-picker handlers + zoom/stroke/opacity handler methods (listeners bound in TopPanel) |
| `layerGestures.js` | Gestures of the Layers panel's eye / lock columns and layer rows: - **Alt-click an eye or a padlock** acts on every *other* row (the siblings, for an object row): hide / lock them all, or, when they already are, show /… |
| `layerKeyboard.js` | Keyboard access to the Layers panel (the layer rows and the object tree under them, see layerTree.js) |
| `layerTree.js` | Object rows of the Layers panel: under each expanded layer, a row per object and group (groups expand), with an eye (hide), a lock, the name (double-click renames), the selection highlight, and drag to reorder or move… |
| `LeftPanel.js` | Drawing tool button handlers; mode switching |
| `RightPanel.js` | Tabbed properties panel: `activateTab`/`autoSelectTab` + layer ops |
| `TabletShell.js` | Tablet mode shell: builds the touch command bar + contextual bottom sheet, binds directly to the `selected`/`changed`/`zoomed` `svgCanvas` events (`svgCanvas.bind` is backed by a native… |
| `toolOptionsBar.js` | The options bar of the current tool: a tray in the top panel (and, in tablet mode, a strip in the shell) drawn from the tool's `options()` descriptors (`ToolDef.options` / `setOption`, core/tool-registry.js) |
| `TopPanel.js` | Quick-action handlers + `updateContextPanel` (shows/hides trays & tab sections); binds relocated zoom/stroke/opacity listeners; `attrChanger()` |
| `topPanelContext.js` | The top panel's context-panel refresh (which tools/fields show for the current selection), split out of TopPanel.js, whose `updateContextPanel()` delegates here |

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
