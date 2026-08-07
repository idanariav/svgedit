# SVGedit Extension System

> **How to use this doc:** Use the Extension Contract section to understand the API when writing or modifying an extension. Use the Built-in Extensions table to quickly find which file controls a given feature.

---

## Extension Contract

Every extension lives in `src/editor/extensions/ext-name/` and exports a single default object:

```js
// src/editor/extensions/ext-myname/ext-myname.js
export default {
  name: 'ext-myname',      // must be unique; used as identifier

  async init (S) {
    // S is a context object provided by EditorStartup
    // available on S:
    //   S.svgCanvas       — the SvgCanvas instance
    //   S.editor          — the Editor instance
    //   S.addLangData     — function to register i18n strings
    //   S.importLocale    — load locale file dynamically
    //   ...other helpers

    return {
      // Optional hooks (all optional):
      name: 'ext-myname',

      // Called when any element is changed
      elementChanged ({ elems }) { },

      // Called when selection changes
      selectedChanged ({ elems }) { },

      // Add items to a panel (via innerHTML or DOM manipulation)
      // Use S.editor or document.querySelector() to find containers

      // Register a new drawing mode
      // S.svgCanvas.setMode('my-mode') triggers mousedown/mousemove/up hooks

      mouseDown (opts) { },
      mouseMove (opts) { },
      mouseUp (opts) { },

      // Called when zoom changes
      zoomChanged ({ zoom }) { },
    }
  }
}
```

### How Extensions Load

Extensions are **inlined into the bundle** (no runtime fetch from `extPath`).
They are statically resolved through
[`extensions/extensionRegistry.js`](../src/editor/extensions/extensionRegistry.js),
which eagerly globs every `ext-*/ext-*.js` so Rollup bundles them into the
single `Editor.js`.

1. Host calls `editor.setConfig({ extensions: ['ext-polystar', 'ext-grid', ...] })`
2. `EditorStartup.extAndLocaleFunc()` iterates the list and resolves each from
   the registry:
   ```js
   const imported = getExtension(name)          // from extensionRegistry.js
   svgCanvas.addExtension(imported.default.name, imported.default.init)
   ```
3. `svgCanvas.addExtension()` calls `ext.init(S)` and stores returned hooks
4. Canvas events then dispatch to all registered extension hooks

> **Adding a new built-in extension:** drop it in `extensions/ext-<name>/` and
> add its name to `defaultExtensions` in `ConfigObj.js`. The registry glob picks
> it up automatically — no manual import needed.

### DOM id/class namespacing convention

`extensionRegistry.js` only namespaces extensions by directory name — nothing
prevents two extensions from colliding on the same DOM `id`/class. **New
extensions should prefix every `id`/class they create with `ext-<name>-`**
(e.g. `ext-taper-settings`, not `taper_settings`) to keep the DOM footprint
collision-proof as the extension count grows.

A few built-ins predate this convention and keep their original unprefixed
ids for compatibility (referenced by other extensions, tests, or docs):
`ext-grid` (`#canvasGrid`, `#gridLines`), `ext-markers` (`#marker_panel`).
These are not being renamed — do so only as an opportunistic spot-fix if
you're already touching that code for another reason, and update every
cross-reference (`ext-proportion-markers.js`, `tests/unit/`, `.claude/tools.md`)
in the same change.

### i18n in Extensions

Each extension has a `locale/` subfolder with JS modules per language. These are
**inlined** via `import.meta.glob('./locale/*.js', { eager: true })` inside each
extension's `loadExtensionTranslation()` (falls back to `en`). There is no
runtime `import(`./locale/${lang}.js`)` any more.

This fork is **English-only**: every extension's `locale/` folder holds just
`en.js` (non-English files were removed to shrink the bundle — this fork is
used solely as the Obsidian plugin's drawing engine, which is English-facing).
A new extension should still follow the same `locale/en.js` + eager-glob +
`en` fallback convention for consistency with the rest of the codebase, even
though only English ships.

---

## Built-in Extensions

| Extension folder | What it adds | Key file |
|-----------------|--------------|---------|
| `ext-connector` | Line-binding engine behind the core **Line tool** (no button/mode of its own). Lets a drawn `<line>` bind either endpoint to a shape (`se:bind-start`/`se:bind-end`); bound endpoints snap to the shape edge and track it when it moves. Auto-binds on release near a shape; **Alt** keeps an endpoint free. Excludes bound lines from group ops. Still recognises legacy `se:connector` polylines (straight/elbow). | `ext-connector.js` |
| `ext-eyedropper` | Eyedropper tool (`tool_eyedropper`, `Ctrl+I`) — click an element on canvas to sample its **fill color only** (not the whole style — a deliberate scope-narrowing from an earlier version of this tool that stamped fill+stroke+width+dasharray+opacity), then a small click-anchored menu (`<se-eyedropper-menu>`, positioned via `dialogs/positionContextMenu.js`, not a reuse of the favorites-driven `SeCMenuDialog`) offers: **Set as fill/outline/background color** (each switches back to Select mode *before* calling `svgCanvas.setColor`/`svgEditor.setBackground` — the toolbar swatch only re-syncs when `mode === 'select'` at the time the `changed` event fires, so the mode switch must happen first) or **Generate matching palette**, which opens `<se-palette-dialog>` seeded with the sampled hex. The palette dialog is a thin UI over `src/editor/palette/generatePalette.js` — an OKLCH optimizer (via `culori`) that searches per-hue (L, max in-gamut chroma) curves against a WCAG contrast floor, then runs a mandatory whole-palette harmonization pass (equal-visual-weight relaxation for icons/text/buttons/notifications, pairwise-distinctiveness hill-climb for charts, shared-target variance-minimization for illustrations) — see `file-map.md`'s `src/editor/palette/` entry for the module breakdown | `ext-eyedropper.js` |
| `ext-grid` | Grid overlay + snap via `<se-grid-settings>` popover. 8 shapes (square pattern tile; iso/triangle/1pt/2pt-perspective as `<line>`s; plus **thirds/golden ratio/center cross** — a fixed vertical+horizontal line pair per fraction, `fractionalCross()` in `buildShapeLines`, absorbing what used to be ext-guides' separate composition-overlay popover). All non-square shapes share the same `curConfig.gridColor` styling — snapping stays the plain step grid regardless of shape (`snapToGrid`, shape-agnostic). Persists via `grid_*` prefs. Exposes `svgEditor.updateGrid` for resize redraws | `ext-grid.js` |
| `ext-layer_view` | **Layer mode** (`#tool_layerView`, `Ctrl+Shift+L`), with two mutually-exclusive sub-modes switched via a 2-segment control inside the on-canvas badge (`#layer_focus_badge`, a grid-cell sibling of `#workarea`): **Layer** (Focus, default) isolates the current layer — every other layer is **locked** (`setLayerLocked` — new/pasted objects can only land on the focused layer) and **dimmed** (inline `style.opacity` on the layer `<g>`), badge shows `Layer: {{name}}`, and layer-nav hotkeys are active: `[`/`]` switch the focused layer down/up, `PageUp`/`PageDown` move the selection to the adjacent layer and follow it. **All** (All Layers) instead calls `svgCanvas.setAllLayersMode(true)` so every layer is simultaneously selectable (click, rubber-band) — no dim/lock, hotkeys disabled, badge shows "All Layers" — for selecting elements across layers (e.g. to group/save a compound shape) without merging layers. Snapshots each layer's lock state when layer mode is entered, restores it on exit; sub-mode always resets to Layer on (re-)entry; nothing is persisted. Re-derives on `layersChanged`; drops out on manual `layerVisChanged`. Honours the `curConfig.layerView` startup flag | `ext-layer_view.js` |
| `ext-markers` | Arrow/marker decorators on lines, polylines, paths, polygons (start/middle/end). Set: arrows, triangle, diamond, open-V arrow, box, circle, star, X, slashes (filled + open `_o` variants) | `ext-markers.js` |
| `ext-opensave` | File open, save, clear, import image (drag-drop), append SVG | `ext-opensave.js` |
| `ext-panning` | Hand/pan tool for touch and tablet navigation | `ext-panning.js` |
| `ext-polystar` | Star tool (points, radius multiplier, radial shift) and Polygon tool (sides) | `ext-polystar.js` |
| `ext-proportion-markers` | Wireframe-only overlay: triangle tick markers along all four canvas edges at proportion points (1/2, thirds, quarters, fifths), each tier distinct in size/color. Drawn in `#proportionMarkers` under `#canvasBackground`; also owns `#snapGuides` (transient dashed snap-line overlay). Shown only when `.wireframe` class is on `editor.workarea`; redraws on `zoomChanged` and via exposed `svgEditor.updateProportionMarkers` (called by `clickWireframe` + resolution change). Tier fractions/colors are shared with the snapping code via `core/proportions.js`. Companion proportion-line snapping lives in core `event.js` (gated on `curConfig.wireframeSnapping`), which calls the exposed `svgCanvas.showSnapGuides({x,y})` to draw a guide line in the matched marker's color while dragging | `ext-proportion-markers.js` |
| `ext-smart-guides` | Rendering + toggle for **smart alignment guides** (object-to-object snapping while dragging). Snap math lives in core (`core/smart-guides.js`, hooked into the `event.js` select-move branch, gated on `curConfig.smartSnapping`); this extension implements `svgCanvas.showSmartGuides(payload)` — solid alignment lines + dashed equal-spacing segments in an `<svg id="smartGuides">` appended **last** in `svgroot` so guides render above filled shapes (position synced from `#svgcontent` per draw; core clears on mouse-up). Adds the `tool_smart_snap` view-tray toggle (pref `smart_snapping`, default on) | `ext-smart-guides.js` |
| `ext-corner-radius` | **Corners** Design-tab section — arc-fillet rounding for straight-segment paths/polygons/polylines via `svgCanvas.applyCornerRadius(r)` (`core/corner-radius.js`). Non-destructive: source geometry in `se:orig-d`, radius in `se:corner-radius` (both survive save/load via the sanitize `se:` bypass); radius 0 restores; `coords.js` keeps the source synced with baked transforms (`remapCornerSource`). The extension shows/seeds the panel and drops stale rounding attrs when `d` was rewritten outside the pipeline (e.g. pathedit) | `ext-corner-radius.js` |
| `ext-repeat` | **Radial / grid / path repeat** (array) tool. `svgCanvas.repeatSelection(params)` clones the selection per step (radial: `rotate(a cx cy)` prepended, never recalculated — center is canvas center, the selection's own stroked-bbox center, or a **custom point** picked by clicking the canvas (`center: 'custom'`, `centerX`/`centerY` in params); the source is never moved, so its existing distance from whatever center is chosen becomes every copy's radius (this is how off-center + canvas/custom center produces a flower/fan pattern) — picking is a one-shot canvas click captured via `svgCanvas.armRepeatCenterPick(cb)` and mode `'repeat-pick-center'` (added to `EditorStartup.js`'s `modesToCancel`/crosshair-cursor lists), guarded in this extension's own `mouseDown` hook; grid: `translate` steps of stroked-bbox+gap; **path**: copies distributed along a rail `<path>` by arc length via `getPointAtLength` — count/start%/span%, optional tangent **rotation-follow** — the rail is the topmost selected path on a fresh apply, or the `rail=<id>` stored in the params stamp on re-edit, and is never cloned/stamped; closed rails wrap i/n, open rails clamp endpoints) with fresh ids (`remapElementIdsAndRefs`; defs stay shared), one `BatchCommand`. Re-editable via stamps: `se:repeat-source`/`se:repeat` (params) on sources, `se:repeat-copy` on copies — `getRepeatParams()` seeds the `<se-repeat-settings>` popover from source *or copy*, and re-applying replaces the copies in the same batch. Buttons injected into the Object + Combine sections | `ext-repeat.js`, `components/seRepeatSettings.js` |
| `ext-mirror` | Mirror-copy action + **live linked symmetry** engine for the (currently UI-less) mirror drawing mode. `svgCanvas.setMirrorAxis('v'\|'h'\|null)`/`getMirrorAxis()` drive the mode's live-symmetry axis (dashed overlay `#mirrorAxis` on `#canvasBackground`) — no toolbar toggle button as of the top-panel cleanup that removed `tool_mirror`; API-only until/unless a UI entry point is re-added. Twin creation hooks history, not events: wraps `svgCanvas.addCommandToHistory` and replaces a bare `InsertElementCommand` of a layer child (= hand-drawn commit) with one `BatchCommand` of source + reflected twin (`se:mirror-of` + `se:mirror-axis`), so a mirrored stroke undoes in one step; batched inserts (paste/repeat/bool-ops) pass through. Text twins are position-mirrored only. **Live link:** `elementChanged`/`elementTransition` re-sync a twin whenever its source changes (during the drag too), mode on or off; syncs are non-undoable (connector re-routing precedent — undo of the source edit re-fires the sync). Dragging a twin directly (or source+twin together) unlinks it so manual edits stick. **Mirror delete:** wraps `svgCanvas.deleteSelectedElements` to pull a still-linked partner (source or twin) into the selection before the original runs, so deleting either half removes both in one undo step; unlinked elements delete normally. `svgCanvas.mirrorSelection()` (buttons `tool_mirror_copy`/`_multi`, Object/Combine sections) reflects a copy of the selection without the mode | `ext-mirror.js` |
| `ext-taper` | **Tapered strokes** UI glue (geometry in `core/taper-stroke.js`): `<se-taper-settings>` popover (`tool_taper`, Object section, after `tool_stroke_to_path`) with start/end tip-% inputs + Apply/Update/Remove. Self-managed visibility: shown only for a single taperable element (`svgCanvas.canTaperStroke` — open stroked line/polyline/path without fill, or an already-tapered path) | `ext-taper.js`, `components/seTaperSettings.js` |
| `ext-text-path` | **Text on path** UI glue (logic in `core/text-path.js`). `tool_text_on_path` (Combine section, shown only when exactly one `<text>` + one path-convertible shape are selected) → `svgCanvas.attachTextToPath()`: rebuilds the text as `<text><textPath href xlink:href startOffset>` referencing the rail (non-path rails are swapped for their `<path>` equivalent in the same batch; structure changes are Remove+Insert pairs). Text tab gains `#textpath_panel` (self-managed visibility) with `textpath_offset` (startOffset %, `svgCanvas.textPathOffset(pct)`) and `tool_text_path_release` (`detachTextFromPath()` — plants plain text at the first glyph's rendered baseline). v1 caveats: multi-line text flattens to one line; deleting the rail orphans the textPath; text-edit caret on a curved baseline is unreliable | `ext-text-path.js` |
| `ext-shape-builder` | **Shape builder** (Illustrator-style paint-to-merge; math in `core/shape-builder.js`). `tool_shape_builder` (Combine section, 2+ selection) enters mode `shapebuilder`: the selection decomposes into atomic regions (planar arrangement via iterative paper.js intersect/subtract, ≤12 shapes), outlined in the `#shapeBuilderOverlay` overlay (zoom-scaled `<g>`, inserted before `#smartGuides`). Hover highlights the region under the cursor (workarea mousemove listener — ext `mouseMove` only fires while pressed); click/drag across regions and release to **merge** them into one path (styled from the topmost shape under the first pick, carved out of all sources) or **Alt+release to delete** them. One BatchCommand per gesture; touched sources are rebuilt as `<path>` (Remove+Insert), the resulting `d` normalized to absolute commands via `toAbsolutePathData` (see `core/paper-utils.js` — needed so the result is node-editable; see below). The session re-decomposes from the results and continues; Escape (added to `cancelTool`'s mode list), any tool switch (a wrapped `setMode` tears down), or the **Done** button on the `#shape_builder_hint` on-canvas bar all exit; an outside `elementChanged` (undo/redo) bails out rather than acting on stale regions. The hint bar (`svgEditor.$svgEditor`-anchored, same grid-cell-sibling pattern as `#layer_focus_badge`) shows the click/drag/Alt instructions plus a live picked-region count while a session is active — added 2026-07-09 since the toolbar tooltip alone wasn't discoverable enough | `ext-shape-builder.js` |
| `ext-shapes` | Shape library modal — categorised pre-made SVG shapes (clipart). Also user-saved shapes (`userShapes.js`, `localStorage`); a saved shape may carry an optional `linkedFile` (a host-provided vault link via `window.svgEditHost.pickVaultFile`) which is stamped as `data-vault-link` on the imported root + every descendant on insert. **Insertion is element-agnostic:** arming the tool listens for the bubbling/composed `shape-insert` event at the document level (so *any* `<se-shape-library>` instance — the desktop `#tool_shapelib` or the tablet command bar's — drives it), stores the armed shape in the extension closure (`_armedDraw` / `_userShapeData`, fed from the event detail, not a DOM `dataset`), and the next canvas mousedown places it. Also exposed as `svgEditor.armShapeInsert(detail, target)` for programmatic callers. **User-shape resize:** the drag in `mouseMove` sizes a user shape deterministically from its saved `bbox` (the content's own coordinate space) — it rewrites the `translate/scale/translate` transform from scratch each move and recalcs only once on `mouseUp`. This avoids the path-shape's incremental `getBBox()`-based math, which broke for container elements (`<g>`, `<image>`, …) whose seed `scale` can't be flattened, leaving them stuck at ~0 size. **Paint servers:** a saved shape may carry its referenced gradients/filters/markers in a leading `<defs>` (`EditorStartup._addSelectedToShapeLibrary` bundles them via `getReferencedDefElements`); on insert, `ext-shapes` splits that defs off, imports it into the canvas `<defs>`, and remaps all ids of shape + defs together (`canv.remapElementIdsAndRefs`) so repeat insertions don't collide and `url(#…)` refs stay intact. **Proportion lock:** the placement drag is free-form (non-uniform) by default — the shape stretches to fill whatever box is dragged; holding **Shift** locks it to the source shape's original aspect ratio (uniform scale, fit to the smaller drag-box dimension), for both the path-shape and user-shape branches of `mouseMove` | `ext-shapes.js`, `userShapes.js` |
| `ext-theme-toggle` | Light/dark theme toggle button injected into `#theme_panel` in top toolbar | `ext-theme-toggle.js` |
| `ext-shadow` | Drop shadow on any single selected element — angle/length, blur, opacity, color; uses an `<feDropShadow>` primitive. **Length is the on/off control: length 0 ⟺ no shadow** (the panel defaults to 0 when the element has none, and setting length 0 removes the shadow). Delegates all filter construction to the shared **`fx-filter.js` composer** (see below), so a shadow and an outline share one per-element filter and coexist. Exposes `svgEditor.shadowApi` (`{ read(elem), apply(elem, params, batchCmd) }`) so the class library can capture/re-stamp shadows | `ext-shadow.js` |
| `ext-outline` | Second outline (halo / casing) color around a **line's** own stroke — e.g. a white line with a thin black outline, like a text outline. Controls: width (0 ⟺ no outline), opacity, color. Built from an `<feMorphology operator=dilate>` → `<feFlood>` → `<feComposite>` → `<feMerge>` chain that floods the dilated source alpha and draws the original on top. Shown only for line-family tagNames (`line`, `polyline`, `path`, `polygon`). Delegates to the shared `fx-filter.js` composer (coexists with shadow). Exposes `svgEditor.outlineApi` (`{ read(elem), apply(elem, params, batchCmd) }`) for class-library capture/re-stamp. Caveat: `feMorphology` dilate gives mildly boxy corners at large widths — negligible on thin lines | `ext-outline.js` |
| `fx-filter.js` (shared, not an extension) | Per-element SVG filter composer shared by ext-shadow and ext-outline. An element's `filter` attr references only one filter, so both effects compose into a single filter (id = existing referenced id, else `{id}_fx`): outline block (`feMorphology`/`feFlood`/`feComposite`/`feMerge`) then `feDropShadow` fed from the outlined result. `readEffects(elem)` parses the current `{ outline, shadow }` spec by primitive type; `writeEffects(elem, spec, batchCmd)` rebuilds the whole filter (Remove+Insert for undo). **Region uses absolute `userSpaceOnUse`** (not `objectBoundingBox`): an axis-aligned line has a zero-dimension bbox that collapses a bbox-relative region and hides the line. `refreshRegion(elem)` re-derives the absolute region after a move; the extensions call it from `mouseUp` (runs after a move bakes the drag transform), `elementChanged`, and `selectedChanged`. Load-time realignment + legacy `objectBoundingBox`→`userSpaceOnUse` migration happen in `svgCanvas.convertDropShadowFilters` (svg-exec.js). One instance is shared via `svgEditor.fxFilter` | `fx-filter.js` |
| `ext-cutter` | Cutter/knife tool — drag a straight line across selected shapes to split each into two independent `<path>` elements; fully undo/redo-safe | `ext-cutter.js` |
| `ext-curvature` | Curvature tool — click-to-place smooth curves via Spiro (clothoid curves, `spiro` pkg); Shift+click for corner anchors, Alt+click for **end** anchors (fix the curve up to that point and start the next segment; combinable with Shift; Alt chosen over Ctrl since Ctrl+click triggers the OS context menu on macOS), click-drag an existing anchor to reposition it live (session-only); double-click or click-start to finalize | `ext-curvature.js` |
| `ext-brush` | Configurable freehand **Brush** tool (mode `'brush'`, `#tool_brush`; settings popover `#tool_brush_settings` currently lives in the right panel's Effects tab as a "Brush" section — `#brush_settings_panel`, not selection-dependent unlike ext-shadow/ext-outline's panels there — temporary until a better spot is found). Renders a *filled* `<path>` outline via `core/brush-stroke.js` — a nib-based renderer with roundness (round ⇄ flat/chiseled tip), thickness, calligraphic angle, taper start/end, opacity and smoothness, all live-editable through `<se-brush-settings>` (`svgCanvas.getBrushParams()`/`setBrushParams()`, session state on `svgCanvas.curBrush` — not persisted to the document) plus up to 5 saved presets (`src/editor/customBrushes.js`). The drawing pipeline is mouse-based, so coordinates flow through the normal `mouseDown/Move/Up` hooks while **pen pressure rides a passive side-channel**: a module-scope `pointerdown`/`pointermove` listener on `svgroot` records the latest `pressure`+`pointerType` (pointer events fire just before their compat mouse events). Real pressure only for `pointerType==='pen'` (extra width multiplier); mouse/finger draw at constant width — no velocity-simulated pressure. Each `pointermove` smooths the raw point (`createSmoother`, an EMA filter independent of the pencil tool's stabilization) and rebuilds the outline (`buildBrushOutline`, plain vector math — no paper.js in the hot path); `mouseUp` runs one paper.js `simplify()` pass (`finalizeBrushOutline`) to compact the outline. History/selection are committed by core on the `{keep,element}` return — the extension does **not** call `addCommandToHistory` | `ext-brush.js` |
| `ext-color-shift` | HSL + transparency shift controls in the right side panel (H/S/L/T spin inputs, Fill/Stroke toggles, Reset). Relative deltas computed against a per-selection snapshot captured in a `WeakMap`; each input commit is one undo entry | `ext-color-shift.js` |
| `ext-fonts` | Custom/handwritten font support for text. DOM-only glue: points `<se-font-library>` (Google Fonts browser) at its bundled catalog, applies a picked font (adds it to the `#tool_font_family` dropdown, selects it, calls `setFontFamily`), and on startup restores cached fonts so they work offline and re-populate the dropdown. Download/cache/embed plumbing lives in `fontStore.js` + `core/svg-exec.js` | `ext-fonts.js` |
| `ext-puppet-warp` | **Puppet Warp** (`#tool_puppet_warp`) — Illustrator-style mesh deformation via Moving Least Squares (`mls.js`). Drop pins on a selection, drag one to bend the shape around the others; Escape cancels, any exit commits one undo step. **Persistent for single-shape selections** (one shape, or a group with exactly one warp-able descendant): rest pose + pins are cached as `se:puppet-rest-d`/`se:puppet-pins` (same `se:`-attribute idiom as `core/corner-radius.js`'s `se:orig-d`) and re-hydrated on re-entry via `svgCanvas.registerGeometryRemap` (an extension can't import `geometry-remap-registry.js` directly — that resolves to a source copy disjoint from the `packages/svgcanvas` dist bundle `coords.js` ships in). Multi-shape selections stay session-only (`coords.js`'s remap-registry hook only fires for `<path>`, not `<g>`) | `ext-puppet-warp.js` |

---

## Adding UI from an Extension

Extensions can inject buttons or panels into:
- **`#theme_panel`** in `#tools_top` — small icon-only controls (e.g. theme toggle)
- **`#cur_context_panel`** — context strip shown in `rulerX` area when inside a group
- **Left panel** — add a `<se-button>` via the `addToToolbar` helper or direct DOM manipulation
- **Side panel content** — the right panel is tabbed; append property/effect sections to a tab container (`#tab_design`/`#tab_text`/`#tab_effects`/`#tab_layers`), falling back to `#sidepanel_content`. ext-shadow, ext-outline, and ext-color-shift inject into `#tab_effects` (ext-outline inserts its panel right after `#shadow_panel`)

Extension context panels for shapes (e.g. marker controls) are typically appended to `#tools_top` and shown/hidden based on element selection events.
