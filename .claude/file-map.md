# SVGedit File Map

> **How to use this doc:** Quick lookup table — find a concern, jump to the file. Line numbers reference points of interest within large files.

---

## Editor (UI Layer) — `src/editor/`

| File | Purpose |
|------|---------|
| `Editor.js` | Main class extending EditorStartup; top-level event handlers, menu callbacks, alignment, groups, exports, `setDebugLogger(sink)` (~37KB) |
| `EditorStartup.js` | Async `init()` sequence: config → i18n → DOM → SvgCanvas → panels → extensions (~27KB) |
| `DebugSnapshotLogger.js` | Polls `svgCanvas.getDebugSnapshot()` and forwards it to a host-provided sink whenever it changes — no side effects otherwise, so an idle canvas doesn't flood the log. Backs `Editor.setDebugLogger(sink)`; off by default. Surfaces selection boxes, path-node grips, or group-context dimming still rendered but no longer backed by the model (a history of desyncing — e.g. a selection box left shown after deselect, a path-node grip orphaned from a previously-drawn/edited path, group-context sibling dimming not cleared on `leaveContext()`). Caught a real live bug this way — see `path-actions.js`'s `mouseDown` hide-all-on-new-path guard and `tests/unit/path-draw-orphaned-grips.test.js`. Replaced the old `<se-debug-overlay>` UI panel — a host now receives `(event, detail)` calls instead of rendering a DOM overlay (e.g. the Obsidian plugin routes it into its file-based debug log) |
| `ConfigObj.js` | `pref(key)`, `setConfig(obj)`, localStorage persistence (~24KB) |
| `MainMenu.js` | Export, Preferences, **Tablet mode toggle** (`clickTabletMode`), **Hotkey Manager** launcher (`tool_hotkeys` → opens `se-hotkey-dialog`), **Favorites** launcher (`tool_favorites` → opens `se-favorites-dialog`) (~5KB) |
| `Hotkeys.js` | `HotkeyManager` — single registry for all keyboard shortcuts. Ingests the editor-level `Editor.shortcuts` array + component `[shortcut]` buttons (pushed via `registerEl`), owns one document keydown dispatcher, conflict detection, per-user overrides, and the read API for `se-hotkey-dialog`. Persists overrides via `userDataAdapter` (`getHotkeys`/`setHotkeys`) or localStorage `svg-edit-hotkeys`. Exports `formatHotkey`, `GROUP_ORDER`, and `getAction(id)` (used by the favorites menu) |
| `domScope.js` | Multi-instance DOM helpers, all pure/stateless except the module-level `activeEditor` pointer: `closestRoot(el)` (walk up to the owning `[data-svgedit-root]` container), `setActiveEditor`/`clearActiveEditor`/`isActiveEditor` (live-focus-first active-editor tracking), `getActiveRoot()`, `isTypingTarget()`/`deepActiveElement()` (shadow-DOM-piercing "is the user typing in a field" check), and `ownsKeyEvent(container, target)` (whether a document-level key event belongs to this editor — target is `<body>`, the container, or a descendant, and not a typing target). `ownsKeyEvent` backs both `Hotkeys.js`'s dispatcher and `EditorStartup.js`'s space-pan/shift-zoom/paste-fallback-armer keydown+keyup listeners — see its doc comment for the BODY-only-check regression it replaced |
| `favorites.js` | Persistence for the quick-action **favorites** list (ordered array of action ids): `loadFavorites` (falls back to `DEFAULT_FAVORITES` = cut/copy/paste/delete_selected), `saveFavorites`, `toggleFavorite`. Via `userDataAdapter` (`getFavorites`/`setFavorites`) or localStorage `svg-edit-favorites` |
| `favoriteActions.js` | Catalog of favoritable actions — a superset of the hotkey registry. Derives trigger entries from `Hotkeys.js`, adds `EXTRA_TRIGGERS` (paste) and `VALUE_CONTROLS` (stroke width, fill/stroke colour — rendered as live widgets). Exports `buildFavoritesCatalog` (for the dialog), `getFavoriteMeta`, `isValueControl`, `VALUE_CONTROLS`, `runFavoriteTrigger` (for the menu) |
| `Rulers.js` | Canvas ruler rendering and tick marks |
| `pasteFallbackArmer.js` | `createPasteFallbackArmer(onFallback, delayMs=80)` — arm/disarm timing helper backing the Cmd/Ctrl+V keyboard-paste fallback in `EditorStartup.js` (`init()`'s keydown listener arms it, `pasteHandler` disarms it on a real native `paste` event; used because Electron/Obsidian doesn't always dispatch a native `paste` DOM event to a non-editable workarea). On fallback, `EditorStartup.js` tries `navigator.clipboard.readText()` (classified via `pasteClipboardText.js`) before giving up and falling back further to the internal sessionStorage clipboard |
| `pasteClipboardText.js` | `classifyClipboardText(text)` — pure parser shared by `EditorStartup.js`'s native `paste` handler and its `pasteFallbackArmer` callback: tells apart svgedit's internal clipboard JSON from an external SVG document (e.g. "Copy as SVG"), or returns `null` for neither |
| `themeUtil.js` | `applyTheme(theme, rootEl)` — canonical theme helper |
| `uiMode.js` | `applyUiMode(on, rootEl)` — toggles the `ui-tablet` class on `.svg_editor` (desktop ⇄ tablet shell). Mirrors `themeUtil.js`; persistence of the `tabletMode` pref is the caller's job |
| `classLibrary.js` | Global class/style-preset store (localStorage `svg-edit-class-library`): `getClasses`/`getClassesForScope`/`getClass`/`saveClass`/`deleteClass`, `elementScope`, `attrCatalog`. Also owns **per-object-type default classes** (localStorage `svg-edit-default-classes`): `getDefaultClasses`/`getDefaultClassForTag`/`setDefaultClassForTag` — e.g. `{ text: 'title' }` auto-stamps the "title" preset onto every newly created `<text>` element; `deleteClass` purges any tag defaults pointing at the deleted name. `applyDefaultClassAttrs(elem, preset)` does the plain (non-undo-tracked) stamping for a not-yet-inserted element; `internalClassTokens`/`nextClassString` are the shared `class`-attribute merge helpers used by both that and `<se-class-select>`'s `applyClass`. Backs `<se-class-select>` and `Editor.js#elementInserted` |
| `customBrushes.js` | 5 saved custom-brush slots (localStorage `svg-edit-custom-brushes`, sparse `{0..4: params}` map like `sePalette.js`'s overrides): `loadBrushSlots`/`getBrushSlot`/`saveBrushSlot`/`deleteBrushSlot`, `BRUSH_SLOT_COUNT`. Via `userDataAdapter` (`getBrushes`/`setBrushes`) or localStorage fallback. Backs `<se-brush-settings>` |
| `canvasLayouts.js` | Saved canvas "layouts" (templates) store + apply logic: `loadLayouts`/`saveLayouts`/`captureCurrentLayout`/`applyLayout`. Persists via `userDataAdapter` (`getCanvasLayouts`/`setCanvasLayouts`) else localStorage `svg-edit-canvas-layouts`. `applyLayout` overwrites only canvas size + `bkgd_color`, then re-injects the saved objects (with fresh remapped ids, paste-style) onto a `Layout: <name>` layer left inactive (so locked). Backs the Layouts section of `<se-canvas-settings>` |
| `toolOrder.js` | Left-panel drag-to-reorder + "Additional tools" overflow bucket persistence: `loadToolOrder`/`saveToolOrder` (via `userDataAdapter` `getToolOrder`/`setToolOrder` else localStorage `svg-edit-tool-order`) and the pure `reconcileToolOrder(currentIds, stored)` helper (drops stale ids, defaults new ones into the main row). Consumed by `LeftPanel.js`'s `finalizeToolOrder` |
| `toolDragReorder.js` | `initToolDragReorder({ container, overflowHost, onChange })` — left panel reorder, both mouse and keyboard. Native HTML5 drag-and-drop: makes each direct child of `container`/`overflowHost` draggable, drop-to-reorder (before/after via cursor vs. target midpoint, `.se-drop-before`/`.se-drop-after` indicator classes), drop-on-`overflowHost` to tuck a tool into the bucket. Keyboard: `container` becomes an ARIA `toolbar` with a roving tabindex; Space grabs/drops a tool (`.se-grabbed`/`aria-grabbed`), ArrowUp/ArrowDown moves or crosses it between the main row and the bucket, Escape cancels back to the pre-grab snapshot, Enter forwards to the tool's own `click()`. A shared visually-hidden live region announces moves. See [tools.md](tools.md) |
| `userDataAdapter.js` | Module registry for the optional `userDataAdapter` config: `setUserDataAdapter`/`getUserDataAdapter`. Lets a host persist the custom palette, saved shapes, **hotkey overrides** (`getHotkeys`/`setHotkeys`), **quick-action favorites** (`getFavorites`/`setFavorites`), **custom brush slots** (`getBrushes`/`setBrushes`), **and the left-panel tool order** (`getToolOrder`/`setToolOrder`) in its own store; `null` → localStorage fallback. Set once in `EditorStartup.init()`; read by `sePalette.js`, `userShapes.js`, `Hotkeys.js`, `favorites.js`, `customBrushes.js` + `toolOrder.js` |
| `locale.js` | i18next setup, language detection, locale file loading |
| `contextmenu.js` | Right-click context menu setup and handlers |
| `svgedit.css` | All CSS: variables, grid layout, panel/toolbar rules (~750+ lines); `@import`s `tablet.css` at the top |
| `tablet.css` | Tablet-mode touch sizing + shell layout, all scoped under `.svg_editor.ui-tablet` (collapses the desktop grid, hides the four panels, styles the command bar/sheet/popovers). Colors inherit from svgedit.css tokens |
| `index.html` | Dev + ES-module build entry point (the only build entry — IIFE and cross-domain iframe entries were removed, see `architecture.md` Build Pipeline) |

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
| `TabletShell.js` | **Tablet mode** shell: builds the touch command bar + contextual bottom sheet, binds directly to the `selected`/`changed`/`zoomed` `svgCanvas` events (`svgCanvas.bind` is backed by a native `EventTarget`, so multiple handlers per event coexist), and resolves every control to an existing `svgCanvas.*`/`editor.*` call. Shown only while `.svg_editor.ui-tablet` is set |
| `TabletShell.html` | Tablet shell skeleton (`.tablet-shell` overlay: `.ts-topbar` command bar + `.ts-sheet` bottom sheet) |

---

## Custom Components — `src/editor/components/`

| File | Custom element | Purpose |
|------|---------------|---------|
| `seButton.js` | `<se-button>` | Icon button with pressed/disabled states |
| `seFlyingButton.js` | `<se-flying-button>` | Button with sub-tool flyout |
| `seColorPicker.js` | `<se-color-picker>` | Color selection modal |
| `seSelect.js` | `<se-select>` | Styled `<select>` dropdown |
| `seFontSelect.js` | `<se-font-select>` | Google-style font-family picker: themed popover with a search box and per-font previews (each option rendered in its own typeface). Drop-in replacement for the old `<se-select>` font dropdown — same `value`/`addOption`/`change`/`src`/`options`/`values` interface. Powers `tool_font_family` |
| `seToolOverflow.js` | `<se-tool-overflow>` | Left panel's "Additional tools" overflow bucket — a pure drawer (no active-tool concept, unlike `se-flyingbutton`): fixed `src` icon, clicking the trigger always opens/closes the popover, closes on outside click/Escape/after a slotted tool is clicked. Slotted children are real tools dragged in via `toolDragReorder.js` — each keeps its own click handler/hotkey/lock gesture. See [tools.md](tools.md) |
| `seList.js` | `<se-list>` | Icon-based dropdown list |
| `seListItem.js` | `<se-list-item>` | Item inside `<se-list>` |
| `seSpinInput.js` | `<se-spin-input>` | Numeric input with icon/label/spinner |
| `seInput.js` | `<se-input>` | Text input with icon/label |
| `seClassSelect.js` | `<se-class-select>` | Class/style-preset picker for `#elem_class`: scope-filtered dropdown of saved classes + "+"/trash buttons + save/update popover (name, scope, attribute checklist, **"Default for new `<tag>` objects" checkbox**). Applying a class stamps its captured attributes onto the selection as one undo step. The default checkbox reads/writes `classLibrary.js`'s per-tag default map, keyed off the currently-edited element's exact tag (`elem.tagName.toLowerCase()`), independent of the class's `scope`. Backed by `../classLibrary.js` |
| `seZoom.js` | `<se-zoom>` | Zoom percentage selector |
| `seCanvasSettings.js` | `<se-canvas-settings>` | Canvas-resize popover (W/H inputs + ratio/size presets + Apply/Reset). Presets are user-editable via a "Manage presets" mode (add/edit/remove rows, GCD-autofilled labels) and persist via the `userDataAdapter` (`getCanvasPresets`/`setCanvasPresets`), falling back to `localStorage` key `svg-edit-canvas-presets`; built-in `DEFAULT_PRESETS` seed an empty list. Also hosts a **Layouts** section (save current canvas as a named template, Apply/Overwrite/Remove) backed by `../canvasLayouts.js` |
| `seSettingsPopover.js` | *(base class, not a custom element)* | `SeSettingsPopover` — shared base for the seven toolbar-button-plus-popover settings components below (incl. `seCanvasSettings.js`): shadow-DOM/icon-loading/`toggle`/`open`/`close`/viewport-aware `positionPopup` wiring. Light-dismiss (outside-click + Escape) and top-layer stacking are delegated to the native Popover API (`$popup` is `popover="auto"`), same pattern as `seMenu.js`; a `toggle`-event listener routes browser-driven closes back through the (possibly overridden) `close()` so subclass close-time side effects still run. Subclasses supply their own template (incl. `<style>`) and override `open()`/`close()` to seed/revert fields around `super.open()`/`super.close()` |
| `seGridSettings.js` | `<se-grid-settings>` | Grid-settings popover (show/snap toggles, shape select — square/isometric/triangle/1pt/2pt perspective plus the **thirds/golden ratio/center cross** composition-guide shapes, color, step); injected into `#editor_panel` by ext-grid. Extends `SeSettingsPopover`; the one popover using an immediate-commit pattern (writes `curConfig`/`pref` on every field change) rather than an Apply button |
| `seOffsetSettings.js` | `<se-offset-settings>` | Path offset/inset popover (distance input + outset/inset toggle + Apply → `svgCanvas.offsetPath`). Extends `SeSettingsPopover` |
| `seSmoothPathSettings.js` | `<se-smooth-path-settings>` | Smooth-path popover (0-100% strength spin-input, live-previews on every change via `svgCanvas.previewSmoothPath`, Apply → `svgCanvas.commitSmoothPath`, close-without-apply → `svgCanvas.cancelSmoothPath`). Extends `SeSettingsPopover` |
| `seRepeatSettings.js` | `<se-repeat-settings>` | Radial/grid repeat popover (mode tabs, count/sweep/center or rows/cols/gaps + Apply/Update → `svgCanvas.repeatSelection`); seeded from `svgCanvas.getRepeatParams()`; injected by ext-repeat. Extends `SeSettingsPopover` |
| `seTaperSettings.js` | `<se-taper-settings>` | Taper-stroke popover (start/end tip % + Apply/Update/Remove → `svgCanvas.applyTaperStroke`/`removeTaperStroke`); seeded from `svgCanvas.getTaperParams()`; injected by ext-taper. Extends `SeSettingsPopover` |
| `seSegmentSettings.js` | `<se-segment-settings>` | Radial/grid Segment popover (mode tabs, count/start-angle/center or count/axis, Split/Non-split toggle + Apply/Update → `svgCanvas.segmentSelection`); seeded from `svgCanvas.getSegmentParams()`; injected by ext-segment. Extends `SeSettingsPopover` |
| `seBrushSettings.js` | `<se-brush-settings>` | Brush-tool settings popover (thickness/angle/roundness/taper start-end/opacity/smoothness fields + 5 preset slots with save/load/delete). Field changes write live into `svgCanvas.setBrushParams()` (no separate Apply step); slots backed by `../customBrushes.js`; injected by ext-brush into a "Brush" section (`#brush_settings_panel`) in the right panel's Effects tab (`#tab_effects`) — a temporary home, pending a better one. Extends `SeSettingsPopover` |
| `sePalette.js` | `<se-palette>` | Color palette swatch grid |
| `seShapeLibrary.js` | `<se-shape-library>` | Shape library modal (48KB) |
| `seFontLibrary.js` | `<se-font-library>` | Google Fonts browser popover (search + category chips, lazy in-font previews via `text=` subset). Picks a font → downloads it once via `fontStore.js`, dispatches `font-pick`. Sole importer of `fontStore.js` (keeps it single-instance) |
| `PaintBox.js` | `<se-paint-box>` | Fill/stroke paint control |
| `svgIconLoader.js` | *(utility)* | Normalises + caches SVG icons for inline injection; resolves source from the inlined `images/iconRegistry.js` (fetch fallback only) |
| `fieldAutoBlur.js` | *(utility)* | Releases keyboard focus held by panel input fields: `attachIdleBlur(host)` blurs a field after `FIELD_IDLE_BLUR_MS` idle (used by `seSpinInput`/`seInput`); `blurActiveField()` blurs the deep-focused node on deselection (called from `Editor.selectedChanged`). Keeps tool shortcuts / Delete from being swallowed by a focused field |
| `eyedropper/EyedropperActionMenu.js` | `<se-eyedropper-menu>` | Fixed 4-item action menu shown at the eyedropper tool's click point after a color is sampled (Set as fill/outline/background, Generate matching palette). Not a subclass of anything — reuses only `dialogs/positionContextMenu.js` for click-anchored, viewport-clamped placement. `open(clientX, clientY, {onFill,onStroke,onBackground,onPalette})` / `close()` |
| `palette/PaletteDialog.js` | `<se-palette-dialog>` | Modal showing the 8-color OKLCH palette generated by `../palette/generatePalette.js` from a sampled background color. Purpose dropdown / min-contrast input / hex-oklch format toggle re-run the generator reactively; display-only (no per-swatch apply-to-canvas in v1) |

---

## Palette Generator — `src/editor/palette/`

OKLCH color-science module backing the eyedropper's "Generate matching palette"
action. No UI here — pure logic, consumed by `components/palette/PaletteDialog.js`.
Uses the `culori` npm dependency for OKLCH conversion, sRGB gamut clamping, and
WCAG contrast (`converter`, `clampChroma`, `wcagContrast`, `formatHex`).

| File | Purpose |
|------|---------|
| `oklchColor.js` | Thin culori wrapper: `maxChromaAt(l, h)` (max in-gamut chroma at a fixed L/hue — the core per-hue search primitive, via `clampChroma`), `toRgbHex`, `toOklchString`, `contrastAgainst` (WCAG contrast ratio), `oklchToCartesian`/`oklchDistance` (Euclidean distance in OKLCH's cylindrical space — needed since a naive scalar hue diff isn't a valid metric), `normalizeFillToHex` (resolves an SVG `fill` attribute — hex, named color, `none`, or a gradient `url(#...)` ref — down to a single hex, falling back to black with a console warning for anything that isn't a solid color) |
| `paletteObjectives.js` | `DEFAULT_TARGET_HUES` (the 8 fixed hues: red/orange/yellow/green/cyan/blue/purple/pink), `weightsForHue` (per-purpose chroma/contrast weight table, with a boosted-chroma + legibility-biased path for `notifications`' 4 semantic hues), `scoreCandidate` (single-hue score), and the 3 whole-palette harmonization passes: `harmonizeEqualWeight` (icons/text/buttons/notifications — bounded coordinate-descent relaxation toward equal cross-palette "visual weight", normalized by each hue's own peak chroma so e.g. yellow at L≈0.9 and blue at L≈0.45 can both read as equally vibrant), `harmonizePairwiseDistinct` (charts — hill-climb maximizing the *minimum* pairwise OKLCH distance across all 8 colors, so no two hues end up confusably similar), `harmonizeVarianceMin` (illustrations — pulls every hue toward one shared (L,C) target for a cohesive/harmonious feel over max contrast) |
| `generatePalette.js` | Orchestrator. `buildHueCurve(h, backgroundHex, preferredChroma)` samples `L` 0.05→0.95 to build each hue's full (L, maxChroma, contrast) frontier; `shortlistCandidates` filters to the contrast floor (falling back to the single best-contrast point — flagged `meetsContrastFloor: false` — if nothing qualifies, never silently failing) and keeps either a score-ranked top-12 or an evenly-spaced diverse sample (charts/illustrations need spread, not just the single best point). Default export `generatePalette({ backgroundHex, purpose, minContrast, outputFormat, targetHues, preferredChroma })` → `Array<{name, hue, l, c, h, hex, oklch, contrast, meetsContrastFloor}>`. Deterministic (no randomness) |

---

## Dialogs — `src/editor/dialogs/`

| File | Purpose |
|------|---------|
| `imagePropertiesDialog.js` | Modal for image element properties |
| `editorPreferencesDialog.js` | Editor preferences modal (units, rulers; grid settings moved to the grid-settings popover). No language picker — this fork is English-only (see `locale.js`) |
| `exportDialog.js` | Export dialog (PNG/JPG/BMP/WebP options) |
| `imageImportDialog.js` | **Insert image** dialog (`se-image-import-dialog`) — file upload + URL, self-themed shadow DOM |
| `insertImage.js` | `insertImageFromHref(href)` — inserts a centered `<image>` at natural size (used by the import dialog and ext-opensave); `insertSvgElements(svgString, { vaultLink, asPaths, fitTo })` — inserts a vault drawing as real, editable elements (individual directly-selectable shapes in the layer, defs → canvas `<defs>`, undoable) for the host's "Unlocked" import mode. `fitTo` (a user-space rect) overlays the import on that rect (scale+translate on the wrapping `<g>`) instead of centering — used by the image-trace feature |
| `traceImage.js` | `traceImageToSvg(imageElem, { preset, numberofcolors })` — vectorizes a selected `<image>` (PNG/raster) into editable `<path>` elements via `imagetracerjs`, positioned over the original (non-destructive). Reads pixels through an offscreen canvas (CORS-guarded via `core/load-image.js`'s shared `loadImage()`), runs the tracer, then calls `insertSvgElements(..., { asPaths: true, fitTo })`. Backs the **Convert to editable SVG** button |
| `seTraceDialog.js` / `.html` | **Convert to editable SVG** options dialog (`se-trace-dialog`) — style preset (line art / color / detailed / posterized) + palette-size slider, self-themed shadow DOM. Emits `change` ({ preset, numberofcolors }); exposes `setBusy()`/`showError()` for the panel handler |
| `svgSourceDialog.js` | View/edit raw SVG source |
| `hotkeyDialog.js` | **Hotkey Manager** modal (`se-hotkey-dialog`) — grouped list of every action with add (key recorder) / remove / reset / reset-all, conflict feedback. Pure view over `Editor.hotkeys` (`Hotkeys.js`) |
| `favoritesDialog.js` | **Favorites** manager modal (`se-favorites-dialog`) — grouped list of every favoritable action (via `buildFavoritesCatalog`) with a star toggle each. Pure view over `favorites.js`; starred actions populate the canvas quick-action menu |
| `cmenuDialog.js` | Canvas **quick-action menu** (`se-cmenu_canvas-dialog`) — replaces the old static right-click menu. On `contextmenu` it rebuilds from `loadFavorites()`: trigger actions as icon+label rows (`runFavoriteTrigger`), value controls (stroke width, fill/stroke colour) as live widgets seeded from the selection. Plain `<ul>` (not `role=menu`). Disables selection-dependent rows when nothing is selected |
| `SePlainAlertDialog.js` | Native-`<dialog>` choice-prompt base class (`se-plain-alert-dialog`) — renders light-DOM content + one button per `choices` entry, resolves via `whenClosed()`. Base for `seAlertDialog.js`, `seConfirmDialog.js`, `sePromptDialog.js`, `seSelectDialog.js` |
| `seAlertDialog.js` | Alert dialog (OK only) |
| `seConfirmDialog.js` | Confirm dialog (OK / Cancel) |
| `sePromptDialog.js` | Prompt-style dialog (`se-prompt-dialog`) — used by ext-opensave as a "loading" indicator (title + Cancel), not a real text prompt |
| `seSelectDialog.js` | Multi-choice select dialog |
| `seTextPromptDialog.js` / `.html` | **Text prompt** dialog (`se-text-prompt-dialog`) — on-brand replacement for native `window.prompt`. Self-themed shadow DOM; exposes promise-based global `window.sePrompt(message, value, opts)` resolving to the entered string or `null`. Used for layer add/clone/rename (works in Obsidian/Electron where native `prompt` is broken) |

---

## Extensions — `src/editor/extensions/`

| Folder | Adds |
|--------|------|
| `ext-connector/` | Line-binding engine for the Line tool: binds line endpoints to shapes (`se:bind-start`/`se:bind-end`) and tracks them on move. Alt = free endpoint. Recognises legacy `se:connector` polylines |
| `ext-eyedropper/` | Eyedropper tool — click an element to sample its fill color, then choose fill/outline/background/generate-palette from a menu at the click point (see `extensions.md`) |
| `ext-grid/` | Grid overlay + snap, incl. thirds/golden-ratio/center-cross composition-guide shapes (formerly the separate ext-guides overlays) |
| `ext-layer_view/` | Layer visualization |
| `ext-markers/` | Arrow/marker decorators |
| `ext-opensave/` | File open/save/import/append |
| `ext-panning/` | Pan/hand tool |
| `ext-polystar/` | Star and polygon tools |
| `ext-brush/` | Configurable brush tool: roundness/thickness/angle/taper/opacity/smoothness via `<se-brush-settings>` + up to 5 saved presets, filled-outline strokes via `core/brush-stroke.js`; real pen pressure via passive PointerEvent side-channel (no simulated mouse-velocity pressure) |
| `ext-curvature/` | Curvature tool — click-to-place smooth curves via Spiro (clothoid curves, `spiro` pkg); Shift+click for corner anchors, Alt+click for end anchors (fixes the curve, starts a new segment), drag an existing anchor to reposition it; double-click or click-start to finalize |
| `ext-puppet-warp/` | Puppet Warp tool (mode `puppetwarp`) — select an object/group, drop pins, drag a pin to bend the shape via Moving Least Squares rigid deformation. `mls.js` holds the pure math (unit-tested); the extension resamples paths (paper.js, arc-length) into dense polylines so straight limbs bend, warps live, refits to cubic béziers (`svgCanvas.simplifyPathD`) and commits one undo step on tool-switch, Escape cancels. Session-only (no persistent rig) |
| `ext-proportion-markers/` | Wireframe-only edge proportion tick markers (companion to proportion snapping in `event.js`) |
| `ext-smart-guides/` | Smart alignment guides overlay + `tool_smart_snap` toggle (view tray). Renders `svgCanvas.showSmartGuides(payload)` for the object-to-object snapping in `core/smart-guides.js`/`event.js` |
| `ext-corner-radius/` | "Corners" Design-tab section (`corner_radius_value`) → `svgCanvas.applyCornerRadius(r)`; drops stale rounding attrs when `d` is rewritten outside the pipeline |
| `ext-repeat/` | Radial/grid/**path** repeat (array) tool: `svgCanvas.repeatSelection(params)` + `getRepeatParams()`, `se:repeat*` stamping for re-edit, popover buttons in Object/Combine sections. Path mode distributes copies along the topmost selected `<path>` rail by arc length (`getPointAtLength`), optional tangent rotation-follow; rail id stored in the params stamp |
| `ext-mirror/` | Mirror drawing mode (API-only — `svgCanvas.setMirrorAxis('v'\|'h'\|null)`, no toolbar toggle) + "Mirror-copy selection" buttons. Wraps `addCommandToHistory` to twin freshly drawn elements in one undo batch. **Live linked symmetry:** twins (`se:mirror-of` + `se:mirror-axis`) re-sync to source edits via `elementChanged`/`elementTransition` (non-undoable, connector-style); dragging a twin unlinks it |
| `ext-taper/` | UI glue for tapered strokes (`core/taper-stroke.js`): `<se-taper-settings>` popover in the Object section, self-managed visibility via `svgCanvas.canTaperStroke` |
| `ext-text-path/` | UI glue for text on path (`core/text-path.js`): `tool_text_on_path` in the Combine section (shown when one text + one shape are selected) + `#textpath_panel` in the Text tab (startOffset % spin, detach button) |
| `ext-shape-builder/` | Interactive shape builder mode (`shapebuilder`): region overlay `#shapeBuilderOverlay`, hover highlight, drag-across-regions to merge (Alt = delete), Escape/tool-switch exits; math + mutations in `core/shape-builder.js` |
| `ext-shapes/` | Pre-made shape library (incl. the stroke-based **Accents** decoration category — droplets, sparkles, motion arcs, speed lines, puffs — in `shapelib/accents.json`) |
| `ext-theme-toggle/` | Light/dark theme button |
| `ext-shadow/` | Drop shadow filter via `<feDropShadow>` — angle/length, blur, opacity, color (delegates to `fx-filter.js`) |
| `ext-outline/` | Second outline/halo color around a line's stroke via `feMorphology` dilate filter — width, opacity, color; line-family only (delegates to `fx-filter.js`) |
| `fx-filter.js` | Shared per-element filter composer for ext-shadow + ext-outline: one filter (`{id}_fx`) holding both effect blocks; `userSpaceOnUse` region with `refreshRegion` for move-tracking. Not an extension (not auto-registered) |
| `ext-cutter/` | Cutter (knife) tool — drag for an instant straight cut, or click multiple points for a zigzag cut (Enter/double-click to finish, Backspace to undo last point, Escape to cancel); splits each selected shape into two pieces (straight cut) or `m + 1` pieces for a zigzag crossing the boundary `2m` times |
| `ext-segment/` | UI glue for the Segment (shape divide) tool (`core/segment.js`): `<se-segment-settings>` popover in the Object section, radial (spokes from a center) or grid (parallel lines) dividing lines with a Split/Non-split toggle, self-managed visibility via `svgCanvas.canSegment` |
| `ext-color-shift/` | Right side-panel section: H/S/L/T relative-delta inputs + Fill/Stroke toggles to shift selection colours |
| `ext-fonts/` | Custom font support: `ext-fonts.js` (DOM glue), `fontStore.js` (IndexedDB cache + `FontFace` registration + Google Fonts download), `google-fonts-catalog.json` (full ~1,934-family static catalog, regenerable from Google's metadata endpoint). Fonts embed as base64 `@font-face` in `<defs>` on export |

---

## SVG Canvas Engine — `packages/svgcanvas/`

| File | Purpose |
|------|---------|
| `svgcanvas.js` | `SvgCanvas` class — aggregates all core modules (~36KB) |
| `core/draw.js` | Shape creation primitives |
| `core/event.js` | mouseDown/mouseMove/mouseUp orchestrators (shared prelude/hit-testing/epilogue + per-mode dispatch to the `core/event-*.js` family modules below) + `dblClickEvent`, `mouseOutEvent`, `DOMMouseScrollEvent`; exposes `svgCanvas.zoomAtPoint(zoom, clientX, clientY)` shared by Ctrl+wheel zoom and tablet pinch |
| `core/event-group-context.js` | Group-local coordinate helpers shared by `event.js`'s preludes and the select/shape-draw handlers: `toCurrentGroupLocalDelta`/`Point`, `isCreateInCurrentGroup`, `CONTENT_SPACE_MODES` |
| `core/event-select.js` | `select`/`multiselect` mode handlers: drag-move (proportion/smart-guide snapping), rubber-band multiselect, and the mouseUp property-capture/transform-consolidation tail (also entered via the `resize`/`multiselect` fallthrough) |
| `core/event-resize.js` | `resize` mode handlers: single-element resize + multi-element uniform `resizeGroup` scale |
| `core/event-rotate.js` | `rotate` mode handlers: single-element rotate + multi-element rigid `rotateGroup` |
| `core/event-shape-draw.js` | Shape-creation mode handlers: rect/square/frame/foreignObject/image/circle/ellipse/line/text/fhellipse/fhrect/fhpath (incl. freehand pencil B-spline smoothing) |
| `core/event-path-edit.js` | `path`/`pathedit` mode handlers — thin delegates onto `pathActions.*` plus grid/shift-angle-snap bookkeeping |
| `core/event-text-edit.js` | `textedit` mode handlers — thin delegates onto `textActions.*` |
| `core/event-zoom.js` | `zoom` mode handlers (marquee-zoom rubber band + `zoomed` event) |
| `core/selected-elem.js` | Move, resize, flip selected elements |
| `core/selection.js` | Selection list management |
| `core/select.js` | Rubber-band selector + resize handles UI |
| `core/path.js` | Path state and node data |
| `core/path-actions.js` | Add/delete/move path nodes |
| `core/path-seg-shim.js` | Self-installing replacement for the deprecated `SVGPathSeg`/`SVGPathSegList` DOM API (`pathSegList`, `createSVGPathSeg*`, `SVGPathSeg.PATHSEG_*`), backed by the `svgpath` package's `d`-string parser/serializer instead of any native/polyfilled browser API |
| `core/elem-get-set.js` | `changeSelectedAttribute()` and attribute I/O |
| `core/history.js` | Undo/redo stack |
| `core/undo.js` | Change recording |
| `core/coords.js` | Coordinate transform + remapping |
| `core/recalculate.js` | Post-change dimension/transform recalc |
| `core/dom-utils.js` | DOM/element manipulation, lookup, ids/refs, snapping, `$id`/`$qq`/`$qa` shortcuts, `mock()` for tests |
| `core/bbox-utils.js` | Bounding-box computation (`getBBox`, `getBBoxWithTransform`, `getStrokedBBox`, `getVisibleElements`) |
| `core/path-utils.js` | Path `d`-attribute construction and element-to-path conversion (`getPathDFromElement`, `convertToPath`) |
| `core/encoding-utils.js` | String/XML/base64 encoding (`toXml`, `encode64`, `text2xml`, …) |
| `core/paint.js` | Fill, stroke, color management |
| `core/sanitize.js` | SVG security sanitization |
| `core/text-actions.js` | Text cursor/selection editing |
| `core/layer.js` | Layer CRUD |
| `core/paper-utils.js` | Shared paper.js helpers used by boolean-ops/cutter/path-offset/shape-builder/taper-stroke/path-simplify: `getPaperScope()` (one lazy singleton, shared across all six), `getStyleAttrs(elem, extraAttrs)`, `svgToPaper(elem, scope, {asCompoundPath, flatten})`, `toAbsolutePathData(d, svgCanvas)` (paper.js's `pathData` getter emits relative/shorthand commands that svgedit's node-edit machinery can't represent — normalizes via `pathActions.convertPath`; wrap any `d: item.pathData` assignment with it or the result crashes on node-edit entry — currently applied in shape-builder/boolean-ops/cutter, see `techdebt.md` for the other three) |
| `core/boolean-ops.js` | Union, intersect, subtract, exclude (XOR), divide (split bottom by top into separate pieces) |
| `core/path-offset.js` | `offsetPath(delta)` (outset/inset) + `strokeToPath()` via clipper-lib polygon offsetting (paper.js flattening) |
| `core/path-simplify.js` | `simplifyFreehand(polyline, tol)` (pencil-commit curve fitting) + `previewSmoothPath(strength)`/`commitSmoothPath()`/`cancelSmoothPath()` ("Smooth Path" popover, non-destructive session baseline) via paper.js `simplify()` (flatten→refit for existing paths) |
| `core/smart-guides.js` | Object-to-object snapping math: `collectSnapTargets`, `snapMovingBBox` (edge/center, same-kind beats mixed), `findEqualSpacing`; consumed by the select-move branch in `event.js` |
| `core/path-node-guides.js` | Path-node alignment snapping math: `collectPathNodeTargets` (other anchor nodes of the same path), `snapPathNodeToTargets` (per-axis nearest-within-tolerance); consumed by the pathedit-drag branch in `path-actions.js`'s `mouseMove`, gated on `curConfig.smartSnapping` |
| `core/corner-radius.js` | Attribute-driven corner fillets: `applyCornerRadius(r)`/`canRoundCorners` (`se:corner-radius` + `se:orig-d`), `roundedPathD` arc-fillet geometry, `remapCornerSource` (called from `coords.js` to keep the source in sync with baked transforms) |
| `core/taper-stroke.js` | Tapered strokes: `applyTaperStroke({start,end})`/`removeTaperStroke()`/`canTaperStroke` — stroked open path → filled variable-width outline (paper.js normal offsetting + `simplify()` refit); centerline in `se:taper-d`, width/paint in `se:taper-style`, profile in `se:taper`; `remapTaperSource` keeps them in sync from `coords.js`. Exports `profile(t,s,e)`, the quadratic-Bézier tip-width shape, reused by `brush-stroke.js` |
| `core/brush-stroke.js` | Custom-brush geometry for `ext-brush`: `buildBrushOutline(points, {thickness,angle,roundness,taperStart,taperEnd})` — plain-vector-math nib outline (no paper.js in the hot path; runs every `pointermove`) producing the calligraphy thick/thin effect via `\|sin(travel-angle)\|`, blended with `roundness` and `taper-stroke.js`'s `profile()`. `createSmoother(smoothness)` — per-stroke EMA jitter filter (independent of the pencil tool's `pencilStabX/Y`). `finalizeBrushOutline(d, svgCanvas)` — one-time paper.js `simplify()` cleanup at `mouseUp` |
| `core/image-crop.js` | Destructive crop for imported raster `<image>` elements: `startImageCrop(elem)`/`applyImageCrop()`/`cancelImageCrop()`/`isImageCropEligible(elem)` (excludes vault-linked and transformed images). Draws its own dashed-rect + 8-handle overlay as a sibling of the image (own mousedown/mousemove/mouseup, not `select.js`'s `SelectorManager`); Apply resamples just the cropped region (via `core/load-image.js` + canvas `drawImage`) into a new `href`, rewriting `href`/`x`/`y`/`width`/`height` in one undoable `BatchCommand`. Pure geometry (`clampCropRect`, `computeSourceRect`) is exported separately for unit testing. Backs the Top Panel's **Crop Image** button — see [tools.md](tools.md) |
| `core/load-image.js` | `loadImage(href)` — shared `HTMLImageElement` loader with CORS handling (`crossOrigin` set before `src`, per Safari/mobile quirk); used by both `image-crop.js` and `traceImage.js` (`dialogs/traceImage.js`'s `loadImageData`) so the two don't duplicate the same CORS dance |
| `core/text-path.js` | Text on path: `attachTextToPath()`/`detachTextFromPath()`/`canTextOnPath`/`textPathOffset(pct)` — rebuilds the text with a `<textPath>` child (`href` + `xlink:href`), converting a non-path rail to `<path>` in the same batch; Remove+Insert command pairs for structure changes |
| `core/shape-builder.js` | Shape-builder math: `svgCanvas.shapeBuilder.{begin,hitTest,apply,end}` — planar arrangement of the selection into atomic regions (iterative paper.js intersect/subtract, ≤12 shapes), merge/delete gestures rebuild touched sources as paths (one BatchCommand each) |
| `core/clip-mask.js` | Set/release/feather clip path & mask — `setClip()`, `setMask()`, `releaseClipMask()`, `setFeather()`/`getFeather()` (bottom of 2 selected is cloned into `<defs>` as the silhouette; top shape gets the `clip-path`/`mask`; both stay visible). Signed feather: +soft edge / −strong rim; auto-converts a clip to a mask |
| `core/cutter.js` | `cutShapes(points)` — 2 points (straight) or 3+ points (zigzag) both use the same exact boundary-splice algorithm (`cutContour`), handling any even number of shape-boundary crossings per loop (Weiler-Atherton-style decomposition into `m + 1` pieces for `m` crossing pairs). Compound-path targets (multiple disjoint closed loops in one `d`) are cut per-loop — a loop the cutter doesn't cross is carried through untouched |
| `core/segment.js` | `segmentSelection(params)`/`getSegmentParams()`/`canSegment(elem)` — divides one shape into N (radial spokes) or N+1 (grid columns/rows) symmetric pieces. Split: `shapePath.intersect(wedgeOrStripPolygon)` per piece (paper.js), one `BatchCommand` of inserts + a remove. Non-split: divider lines clipped to the true boundary via `getIntersections()`, shape+lines wrapped in a `<g>` stamped `se:segment` for re-edit |
| `core/json.js` | JSON import/export |
| `core/units.js` | Unit conversion (px↔em↔cm…) |
| `core/math.js` | Transform matrix math |
| `core/paste-elem.js` | Paste handler |
| `core/copy-elem.js` | Copy handler |
| `core/clear.js` | Clear canvas |
| `core/touch.js` | Mobile touch event support; two-finger **pinch-to-zoom** in tablet mode (calls `svgCanvas.zoomAtPoint`) |
| `core/blur-event.js` | Blur filter UI helpers |
| `core/dataStorage.js` | Internal element data store |
| `core/namespaces.js` | SVG/XML namespace constants |
| `common/browser.js` | Browser detection utilities |
| `common/util.js` | Common utility functions |
| `common/logger.js` | Logging helpers |
| `common/initGuard.js` | `runGuardedInit()` — wraps each `core/*.js` `xxxInit(canvas)` call in `svgcanvas.js`'s constructor with an `Object.keys` diff, warning if two modules claim the same instance property name |

---

## Icons — `src/editor/images/`

All toolbar icons are stroke-based SVGs using `stroke="currentColor" fill="none"`.
They recolor automatically via CSS `color:` property — no filter needed.

Key icon naming: `{action}.svg` e.g. `undo.svg`, `align_left.svg`, `bold.svg`, `c_radius.svg`, `frame.svg` (Frame export-region tool)

| File | Purpose |
|------|---------|
| `iconRegistry.js` | Inlines every `*.svg` + `cursors/*.svg` into the bundle (eager `?raw` glob); `getRawIcon()` / `getIconDataUri()` resolve icons with no runtime fetch |
| `lock.svg` / `lock_open.svg` | Closed/open padlock icons for the per-row **layer lock** toggle (`td.layerlock`) in the Layers panel. Open = unlocked (clickable hint), closed = locked; `RightPanel.populateLayers` picks/swaps them by state — see [tools.md](tools.md) "Layers Panel" |
| `move.svg` | Dual-purpose: as the **select-mode move cursor** (used raw via `getIconDataUri`, so it bakes a white-halo + dark-glyph for visibility on any canvas — cursors can't inherit `currentColor`) and, if injected via `svgIconLoader`, both strokes normalize to `currentColor`. See `tool_select` in [tools.md](tools.md) |
| `pin.svg` | Puppet Warp tool (`tool_puppet_warp`) icon |
| `shapes.svg` | Combined shapes flyout (`tools_shapes`) fixed trigger icon |
| `more_tools.svg` | "Additional tools" overflow bucket (`tools_overflow`, `<se-tool-overflow>`) icon |

`extensions/extensionRegistry.js` does the equivalent for extensions (eager glob
of `ext-*/ext-*.js`, bundled into `Editor.js`).

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
| `src/vite-env.d.ts` | Ambient TS declarations for Vite imports (`vite/client` + `*.html` as string) so the IDE resolves template/`?inline` imports |
| `scripts/copy-static.mjs` | Postbuild: copies HTML entries + Playwright test harness to `dist/editor/` (CSS/images/extensions are now inlined into `Editor.js`, so they are **not** copied) |
| `scripts/check-dom-scope.mjs` | `pretest` gate: fails on new bare `document.querySelector`/`getElementById` calls under `src/editor/` outside a small reviewed allowlist — enforces the multi-instance scoping in `src/editor/domScope.js` |
| `package.json` | Scripts: `build`, `start` (dev server :8000), `build-docs`. Dependencies include `culori` (OKLCH color math, used by `src/editor/palette/`) |
| `packages/svgcanvas/package.json` | svgcanvas workspace package |
| `CLAUDE.md` | This repo's coding guidelines for AI agents |
| `.claude/` | Agent documentation (this folder) |
