# SVGedit Extension System

> **How to use this doc:** Use the Extension Contract section to understand the API when writing or modifying an extension. Use the Built-in Extensions table to quickly find which file controls a given feature.

---

## Extension Contract

Every extension (a *feature*) lives in `src/editor/extensions/ext-name/` and exports one default `defineFeature({...})`
(`extensions/defineFeature.ts`; it types `init` and the hooks, and costs nothing at run time):

```ts
// src/editor/extensions/ext-myname/ext-myname.ts
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'myname'

export default defineFeature({
  name,
  async init (svgEditor) {                      // the Editor instance (no `this`, no context object)
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const { svgCanvas } = svgEditor

    // Register commands (svgEditor.commands.register), tools (svgCanvas.registerTool: PREFERRED for new tools,
    // see "Adding a canvas tool" below), and panel sections here.

    return {
      // Hooks, all optional, each typed with its payload (core/extension-hooks.ts):
      elementChanged ({ elems }) { },           // any element changed
      selectedChanged ({ elems }) { },          // the selection changed
      zoomChanged (zoom) { },                   // the zoom factor (1 = 100%)
      keyDown ({ event }) { },                  // an Editor-owned keydown; return { preventDefault: true } to swallow it

      // Not a hook: svgCanvas.bind('gestureEnded', (_win, { mode, event }: GestureEndedDetail) => …) fires once after every canvas pointer
      // release (any mode, registerTool tools and select included, which the mouseUp hook skips); use it to react to a finished gesture.

      // Mouse hooks: observers of the BUILT-IN modes only (ext-connector watches line drawing and select drags). They mix
      // coordinate spaces (start_x unzoomed, mouse_x ZOOMED) and never run for registerTool tools, select release or zoom.
      // A tool of your own is registerTool, not these:
      mouseDown (opts) { }, mouseMove (opts) { }, mouseUp (opts) { },

      // Runs once, after every extension has been added
      callback () { }
    }
  }
})
```

### How Extensions Load

Extensions are **inlined into the bundle** (no runtime fetch from `extPath`).
They are statically resolved through
[`extensions/extensionRegistry.ts`](../src/editor/extensions/extensionRegistry.ts),
which eagerly globs every `ext-*/ext-*.{js,ts}` so Rollup bundles them into the
single `Editor.ts`.

1. Host calls `editor.setConfig({ extensions: ['ext-polystar', 'ext-grid', ...] })`
2. `EditorStartup.extAndLocaleFunc()` iterates the list and resolves each from
   the registry:
   ```js
   const imported = getExtension(name)          // from extensionRegistry.ts
   svgCanvas.addExtension(imported.default.name, () => imported.default.init(editor), …)
   ```
3. `svgCanvas.addExtension()` awaits `init(editor)` and stores the returned hooks
4. Canvas events then dispatch to all registered extension hooks. Valid hook names live in `packages/svgcanvas/core/extension-hooks.ts` (`EXTENSION_HOOKS`); `addExtension` warns about unknown function members and `runExtensions` about unknown dispatches. Add a new hook there first, with a payload typedef (`ExtensionHookPayloads`); a test fails if a dispatched hook is unregistered or a registered one is never dispatched. `ext-puppet-warp` deliberately keeps its own window-capture Escape listener instead of `keyDown` (ordering vs. the hotkey dispatcher).

> **Adding a new built-in extension:** drop it in `extensions/ext-<name>/` and
> add its name to `defaultExtensions` in `ConfigObj.ts`. The registry glob picks
> it up automatically — no manual import needed.

### DOM id/class namespacing convention

`extensionRegistry.ts` only namespaces extensions by directory name — nothing
prevents two extensions from colliding on the same DOM `id`/class. **New
extensions should prefix every `id`/class they create with `ext-<name>-`**
(e.g. `ext-taper-settings`, not `taper_settings`) to keep the DOM footprint
collision-proof as the extension count grows.

A few built-ins predate this convention and keep their original unprefixed
ids for compatibility (referenced by other extensions, tests, or docs):
`ext-grid` (`#canvasGrid`, `#gridLines`), `ext-markers` (`#marker_panel`).
These are not being renamed — do so only as an opportunistic spot-fix if
you're already touching that code for another reason, and update every
cross-reference (`ext-proportion-markers.ts`, `tests/unit/`, `.claude/tools.md`)
in the same change.

### i18n in Extensions

Each extension has a `locale/` subfolder with JS modules per language. These are
**inlined** via `import.meta.glob('./locale/*.js', { eager: true })` inside each
extension's `addFeatureLocale()` call (falls back to `en`). There is no
runtime `import(`./locale/${lang}.js`)` any more.

This fork is **English-only**: every extension's `locale/` folder holds just
`en.js` (non-English files were removed to shrink the bundle — this fork is
used solely as the Obsidian plugin's drawing engine, which is English-facing).
A new extension should still follow the same `locale/en.js` + eager-glob +
`en` fallback convention for consistency with the rest of the codebase, even
though only English ships.

---

## Built-in Extensions

User-facing behaviour (what a control does, its keys) is in [`tools.md`](tools.md) › Extension-Provided Tools and the generated [`commands.md`](commands.md); this table is for how each one is built and the traps in it. Entries marked *(tools.md)* are covered there in full.

| Extension folder | What it adds / how it works | Key file |
|-----------------|--------------|---------|
| `ext-connector` | Line-binding engine behind the core **Line tool**, no button or mode of its own *(tools.md)*. Excludes bound lines from group ops; still recognises legacy `se:connector` polylines | `ext-connector.ts` |
| `ext-eyedropper` | Samples the **fill only**. A click-anchored `<se-eyedropper-menu>` (placed by `dialogs/positionContextMenu.ts`, not the favorites-driven `SeCMenuDialog`) offers set as fill / outline / background colour, which each switch back to Select mode *before* calling `svgCanvas.setColor` / `svgEditor.setBackground` (the toolbar swatch re-syncs only when `mode === 'select'` as the `changed` event fires), Apply style to selection / Apply selection's style to this (`styleCopy.ts`, one undo step, always an explicit menu choice), and **Generate matching palette**: `<se-palette-dialog>` over `palette/generatePalette.ts`, an OKLCH optimiser (`culori`) that searches per-hue (L, max in-gamut chroma) curves against a WCAG contrast floor, then a mandatory whole-palette harmonisation (equal visual weight for icons / text / buttons / notifications, pairwise-distinctiveness hill-climb for charts, shared-target variance minimisation for illustrations) | `ext-eyedropper.ts` |
| `ext-grid` | Grid overlay + snap via `<se-grid-settings>` *(tools.md)*. Non-square shapes share `curConfig.gridColor`; the composition guides (thirds / golden ratio / centre cross) are a fixed vertical + horizontal line pair per fraction (`fractionalCross()` in `buildShapeLines`). Persists via `grid_*` prefs; exposes `svgEditor.updateGrid` for resize redraws | `ext-grid.ts` |
| `ext-layer_view` | **Layer mode** (`#tool_layerView`) with two mutually exclusive sub-modes switched by a 2-segment control in the on-canvas badge (`#layer_focus_badge`, a grid-cell sibling of `#workarea`). **Layer** (Focus, default) isolates the current layer: every other layer is **locked** (`setLayerLocked`, so new and pasted objects land only on the focused layer) and **dimmed** (inline `style.opacity` on the layer `<g>`); the badge reads `Layer: {{name}}`; `[` / `]` switch the focused layer, `PageUp` / `PageDown` move the selection to the adjacent layer and follow it. **All** calls `svgCanvas.setAllLayersMode(true)`: every layer is selectable at once (click, rubber band), no dim or lock, no hotkeys, the badge reads "All Layers" (to group across layers without merging them). Each layer's lock state is snapshotted on entry and restored on exit; the sub-mode resets to Layer on every entry; nothing persists. Re-derives on `layersChanged`, drops out on a manual `layerVisChanged`; honours the `curConfig.layerView` startup flag | `ext-layer_view.ts` |
| `ext-markers` | Start / mid / end markers on lines, polylines, paths, polygons, and the **Head position** picker (`core/arrow-align.js`) *(tools.md)* | `ext-markers.ts` |
| `ext-opensave` | File open, save, clear, import image (drag-drop), append SVG | `ext-opensave.ts` |
| `ext-panning` | Hand / pan tool for touch and tablet navigation | `ext-panning.ts` |
| `ext-polystar` | Star (points, radius multiplier, radial shift) and Polygon (sides) tools in the shapes flyout *(tools.md)* | `ext-polystar.ts` |
| `ext-shape-family` | Spiral / Arc / Rectangular Grid / Polar Grid in the `tools_shapes` flyout, **on `registerTool`**, with the reference implementation of the contract below *(tools.md)*. The element is created lazily on the first move past a 3 px threshold (a plain click creates nothing); the tool re-renders on every move and arrow key and returns `{ created }` from `pointerUp`. Space is claimed in `keyDown` and released by a document `keyup` listener (read from there as well as the payload, because the editor's own handler also sees it). The selection is cleared when a drag starts so arrow keys cannot nudge the previous shape. A grid is a `<g>` (fill none, paint on the group) of line `<path>`s, polar `<ellipse>`s and a frame `<rect>`; children get ids at commit. Geometry and caps: `core/shape-family.js` | `ext-shape-family.ts`, `locale/en.js` |
| `ext-proportion-markers` | Wireframe-only overlay: triangle ticks along all four canvas edges at proportion points (1/2, thirds, quarters, fifths), each tier distinct in size and colour, in `#proportionMarkers` under `#canvasBackground`; also owns `#snapGuides` (transient dashed snap line). Shown only while `.wireframe` is on `editor.workarea`; redraws on `zoomChanged` and via `svgEditor.updateProportionMarkers` (`clickWireframe`, resolution change). Tiers are shared with the snapping code through `core/proportions.js`; the snapping itself is in core `event.js` (gated on `curConfig.wireframeSnapping`), which calls `svgCanvas.showSnapGuides({x,y})` to draw a guide in the matched marker's colour | `ext-proportion-markers.ts` |
| `ext-frame-labels` | Name tag above every frame (`<rect data-frame>`): an HTML overlay `#frameLabels` in `#svgcanvas` (never saved), one `.frame-label` per frame positioned from `getBoundingClientRect()` so zoom, scroll and transforms come free; repaints (rAF-coalesced) from a `MutationObserver` on `#svgroot` plus `zoomChanged` / `selectedChanged`. Click selects the frame; **double-click** swaps the label for an `<input>` (Enter / blur commits through `selectOnly` + `svgCanvas.setGroupTitle`, Escape cancels) and mirrors the value into `#frame_name`. The text is the frame's `<title>` (fallback `Frame N`, as in the export picker). Labels take pointer events only in `select` mode (`.interactive`, toggled on `modeChange`). A host with an explicit `extensions` list must add it | `ext-frame-labels.ts` |
| `ext-ruler-guides` | **Ruler guides**: drag from `#ruler_x` for a horizontal guide, from `#ruler_y` for a vertical one; in Select mode drag a guide to move it (Alt copies), drag it back onto the ruler to delete, Escape cancels. Whole-unit positions (or grid). Stored as `se:guides="v:120,350;h:300.5"` on the drawing root (`core/guides.js`: `svgCanvas.getGuides()` / `setGuides(guides, label)`, one `transact` per change, validated by `checkDrawing`), drawn in the `#rulerGuides` overlay in `#svgroot` (never exported). Each guide is a visible 1 px line plus a transparent 8 px hit line with its own resize cursor, grabbable only in Select mode with guides shown and unlocked, so drawing tools can still start on a guide. They are snap targets for drawing (`draw-snap`) and select-mode moves (`smart-guides.js`: axis-only, ignored by equal spacing). View settings, not drawing data: prefs `guides_show` / `guides_lock` (`curConfig.showGuides` / `lockGuides`), commands `guides_toggle_show`, `guides_toggle_lock`, `guides_clear` | `ext-ruler-guides.ts`, `locale/en.js` |
| `ext-smart-guides` | Rendering + toggle for **smart alignment guides** *(tools.md)*: `svgCanvas.showSmartGuides(payload)` over snap math in `core/smart-guides.js`, and **path-node alignment** while dragging an existing node in pathedit (`core/path-node-guides.js`: `collectPathNodeTargets` / `snapPathNodeToTargets`, hooked into the pathedit-drag branch of `path-actions.js` `mouseMove`; `svgCanvas.showPathNodeGuides(payload)` draws a line from the dragged node's actual position to the target plus a ring on the target, deduped by `target.index` when x and y both match; cleared on pathedit mouse-up). Path-node alignment is **informational**: the node keeps the raw cursor delta. Scope: anchor nodes only, same path only, drag only. Both behaviours share one flag: `tool_smart_snap`, `curConfig.smartSnapping`, pref `smart_snapping` | `ext-smart-guides.ts`, `core/path-node-guides.js` |
| `ext-corner-radius` | **Corner style** Design-tab section (Live Corners): `svgCanvas.applyCornerRadius(r, {kind, corners})` (`core/corner-radius.js`) *(tools.md)*. `se:orig-d` + `se:corner-radius` (grammar: `attributes.md`) survive save and load through the sanitize `se:` bypass; `coords.js` keeps the source in step with baked transforms (`remapCornerSource`). When `d` was rewritten outside the pipeline (pathedit…, compared within 0.1 px) the extension drops the stale attributes, and a stale live stack as a whole via `svgCanvas.reconcileLiveStack`. Offered on a variable-width stroke too (the corners sit under the width stage). Per-corner values are kept and shown, but there is no per-corner UI in the panel (the Corners tool has it; `techdebt.md`) | `ext-corner-radius.ts` |
| `ext-repeat` | **Radial / grid / path repeat** *(tools.md)*. `svgCanvas.repeatSelection(params)`; custom centre via `armRepeatCenterPick` and the one-shot mode `'repeat-pick-center'`. **Path** mode distributes copies along a rail `<path>` by arc length (`getPointAtLength`): count, start %, span %, optional tangent **rotation-follow**; the rail is the topmost selected path on a fresh apply, or the `rail=<id>` in the params stamp on re-edit, and is never cloned or stamped; closed rails wrap `i/n`, open rails clamp the ends. Stamps: `se:repeat-source` / `se:repeat` on sources, `se:repeat-copy` on copies; re-applying replaces the copies in the same batch. Buttons are injected into the Object and Combine sections | `ext-repeat.ts`, `components/seRepeatSettings.ts` |
| `ext-mirror` | Mirror-copy action + **live linked symmetry** engine for the API-only mirror mode *(tools.md)*. Twin creation hooks history, not events (it wraps `svgCanvas.addCommandToHistory`); a twin carries `se:mirror-of` + `se:mirror-axis`. **Live link:** `elementChanged` / `elementTransition` re-sync a twin whenever its source changes (during the drag too), mode on or off; syncs are non-undoable (the connector re-routing precedent: undoing the source edit re-fires the sync). Dragging a twin (or source + twin together) unlinks it so manual edits stick. **Mirror delete:** wraps `svgCanvas.deleteSelectedElements` to pull a still-linked partner into the selection first, so deleting either half removes both in one undo step; unlinked elements delete normally | `ext-mirror.ts` |
| `ext-taper` | **Tapered strokes** UI glue (geometry `core/taper-stroke.js`): `<se-taper-settings>` popover (`tool_taper`, Object section after `tool_stroke_to_path`) with a **Profile** preset picker (Lens, Taper start / end, Pinch, Teardrop, Wave: `applyWidthProfile`) and start / end tip-% inputs + Apply / Update / Remove (Update replaces a width profile with the three-point taper). Visibility is self-managed: one taperable element (`svgCanvas.canTaperStroke`: an open stroked line / polyline / path without fill, or an already-tapered path) | `ext-taper.ts`, `components/seTaperSettings.ts` |
| `ext-text-path` | **Text on path** UI glue (logic `core/text-path.js`). `tool_text_on_path` (Combine; exactly one `<text>` + one path-convertible shape) → `svgCanvas.attachTextToPath()` rebuilds the text as `<text><textPath href xlink:href startOffset>` referencing the rail (a non-path rail is swapped for its `<path>` in the same batch; structure changes are Remove + Insert pairs). The Text tab gains `#textpath_panel` (own visibility) with `textpath_offset` (`textPathOffset(pct)`) and `tool_text_path_release` (`detachTextFromPath()` plants plain text at the first glyph's rendered baseline). Caveats: multi-line text flattens to one line; deleting the rail orphans the textPath; the text-edit caret on a curved baseline is unreliable | `ext-text-path.ts` |
| `ext-shape-builder` | **Shape builder** (Illustrator-style paint-to-merge; math `core/shape-builder.js`). `tool_shape_builder` (Combine, 2+ selected) enters mode `shapebuilder`: the selection decomposes into atomic regions (planar arrangement by iterative paper.js intersect / subtract, ≤ 12 shapes), outlined in `#shapeBuilderOverlay` (a zoom-scaled `<g>` before `#smartGuides`). Hover highlights the region under the cursor (a workarea mousemove listener, because ext `mouseMove` fires only while pressed); click / drag across regions and release to **merge** them into one path (styled from the topmost shape under the first pick, carved out of all sources) or **Alt+release to delete**. One `BatchCommand` per gesture; touched sources are rebuilt as `<path>` (Remove + Insert) with `d` normalised to absolute commands by `toAbsolutePathData` (`core/paper-utils.js`; needed for the result to be node-editable). The session re-decomposes from the results and continues; Escape (in `cancelTool`'s mode list), any tool switch (a wrapped `setMode` tears down) or the **Done** button on the `#shape_builder_hint` bar (same grid-cell-sibling pattern as `#layer_focus_badge`; it also shows the instructions and a live picked-region count) exits; an outside `elementChanged` (undo / redo) bails out rather than act on stale regions | `ext-shape-builder.ts` |
| `ext-shapes` | Shape library modal *(tools.md)*. **Insertion is element-agnostic:** arming listens for the bubbling, composed `shape-insert` event at document level (so any `<se-shape-library>`, the desktop `#tool_shapelib` or the tablet bar's, drives it), keeps the armed shape in the extension closure (`_armedDraw` / `_userShapeData`, from the event detail, not a DOM `dataset`), and the next canvas mousedown places it; also `svgEditor.armShapeInsert(detail, target)`. **User-shape resize:** the drag in `mouseMove` sizes a user shape deterministically from its saved `bbox`, rewriting the `translate/scale/translate` transform from scratch each move and recalculating only on `mouseUp` (the path-shape's incremental `getBBox()` math broke for containers (`<g>`, `<image>`) whose seed `scale` can't be flattened). **Paint servers:** a saved shape may carry gradients / filters / markers in a leading `<defs>` (`EditorStartup._addSelectedToShapeLibrary` bundles them via `getReferencedDefElements`); on insert that defs is imported into the canvas `<defs>` and all ids of shape + defs are remapped together (`canv.remapElementIdsAndRefs`), so repeat inserts don't collide and `url(#…)` stays intact. **Proportion lock:** the placement drag is free-form; **Shift** locks the source shape's aspect ratio (uniform scale, fit to the smaller drag dimension) in both branches of `mouseMove` | `ext-shapes.ts`, `userShapes.ts` |
| `ext-theme-toggle` | Light / dark button in `#theme_panel`. **Not a default extension** (theme lives in Preferences); a host opts in by listing it in `extensions` | `ext-theme-toggle.ts` |
| `ext-live-effects` | UI for the **live-effect stack** (engine `core/live-effects.js`): the "Distort" section (`#ext-live-effects-panel`) in `#tab_effects` *(tools.md)*. The inline param form is generated from the effect's `defaults` (number → `se-spin-input`, boolean → checkbox, string → `se-select` from `choices`; `ranges` give min / max / step) and live-previews through `svgCanvas.previewLiveEffects` (a hidden original + throwaway clone, **no undo step**); Apply is one step via `applyLiveEffects`; Cancel or a selection change calls `cancelLiveEffectsPreview`. Hidden while no effect is registered, in pathedit, or when the selection can't take effects (`canApplyLiveEffect`: not text, groups or corner-radius paths; a variable-width stroke is fine). On such a stroke `#ext-live-effects-note` says Scribble can't be added and the add list skips it; `#ext-live-effects-hint` is the text hint. It calls `reconcileLiveEffects` on selection so a node-edited path drops its stale `se:fx` / `se:fx-d`. Seeded effects (a `seed` param: Roughen, Tweak, Scribble) get a random seed per object and a **Randomize** button; re-editing keeps the stored seed. **To add an effect:** `registerLiveEffect(name, { label, defaults, apply(subpaths, bbox, params), choices?, ranges? })`, no UI code | `ext-live-effects.ts` |
| `ext-shadow` | Drop shadow on one selected element, `<feDropShadow>` *(tools.md)*; **Length 0 ⟺ no shadow** in the data model, shown as the **On** switch (`#shadow_enabled`). Filter construction is delegated to `fx-filter.ts`; exposes `svgEditor.shadowApi` for the class library | `ext-shadow.ts` |
| `ext-outline` | Halo around a line's own stroke *(tools.md)*: `feMorphology` dilate → `feFlood` → `feComposite` → `feMerge`; line family only; delegates to `fx-filter.ts`; exposes `svgEditor.outlineApi` | `ext-outline.ts` |
| `fx-filter.ts` (shared, not an extension) | Per-element SVG filter composer shared by ext-shadow, ext-outline and ext-glow (one `filter` attribute can reference only one filter; id = the existing referenced id, else `{id}_fx`). Blocks in order: **feather** (`feGaussianBlur(SourceAlpha)` → `feComposite(SourceGraphic in soft)` → `feComposite(in SourceAlpha)` → `fx_feathered`, which then stands in for `SourceGraphic` *and* `SourceAlpha` in every later block, so outline / glows / shadow follow the soft edge); **outline** (`feMorphology` / `feFlood` / `feComposite` / `feMerge` → `fx_outlined`); **outer glow** (blur of the outlined alpha, flood, `in` composite, merged *under*; `fx_oglow_*` → `fx_oglowed`); **inner glow** (edge: blurred inverted alpha via `feComponentTransfer` / `feFuncA table 1 0`; centre: blurred alpha; clipped to `SourceAlpha`, merged *over*; `fx_iglow_*` → `fx_iglowed`); then `feDropShadow` from the newest result (the shadow is cast by shape + glow). `readEffects(elem)` parses the `{ feather, outline, glow: {outer, inner}, shadow }` spec **by `result` name**, never "first feFlood" (a glow's flood may come first); `writeEffects(elem, spec, batchCmd)` rebuilds the whole filter (Remove + Insert for undo; `spec.glow` may be omitted). A filter with a glow or feather gets `color-interpolation-filters="sRGB"`; shadow-only and outline-only filters are byte-identical to the pre-glow output (`tests/unit/fx-filter-glow.test.js`). **The region is absolute `userSpaceOnUse`**, not `objectBoundingBox`: an axis-aligned line has a zero-dimension bbox that collapses a bbox-relative region and hides the line. It pads by stroke/2 + max(outline + 1.5·outerBlur, 1.5·innerBlur if edge, shadow reach + 1.5·outerBlur), since an edge inner glow needs room *outside* the shape. `refreshRegion(elem)` re-derives it after a move (the extensions call it from `mouseUp`, which runs after a move bakes the drag transform, `elementChanged` and `selectedChanged`); load-time realignment and the legacy `objectBoundingBox` → `userSpaceOnUse` migration are in `svgCanvas.convertDropShadowFilters` (`svg-exec.js`). One instance is shared as `svgEditor.fxFilter` | `fx-filter.ts` |
| `ext-glow` | **Outer / inner glow and feather** *(tools.md)*. Blur σ = blur/2, feather σ = radius/2; editing opacity or colour of a glow that is off switches it on at blur 5; unlike Blur, feather never grows past the silhouette; Remove clears both glows and the feather, leaving shadow and outline. Owns only the `glow` and `feather` slices of the composer spec. `svgEditor.glowApi = { read(elem) → {outer, inner, feather}\|null, apply(elem, {outer, inner, feather}\|{remove:true}, batchCmd) }` for class presets (`preset.glow`). Glows composite normally: a filter can't blend with what is behind the element, so there is no "screen" as in VectorCraft's raster mode | `ext-glow.ts` |
| `ext-shaper` | **Shaper** on `registerTool` *(tools.md)*; classification in `core/shape-recognize.js`. The extension captures the stroke, previews it in the tool overlay, maps the result to an element and hit-tests scribbles (`strokeTouches`: `isPointInFill` / `isPointInStroke` for the paint the element really has). Polygons are plain `<polygon>`s, not polystar ones: the polystar panel rebuilds from a fixed orientation and would flip a down-pointing triangle on its first edit | `ext-shaper.ts`, `locale/en.js` |
| `ext-art-brush` | **Brush** section in the Design tab: art and pattern brushes (engine `core/art-brush.js` + `core/art-brush-canvas.js`). Select artwork → *New art brush* / *New pattern brush* (added to the drawing's library, picker `#ext-art-brush-pick`) → select a path → choose the brush (the path becomes a group: an invisible spine + generated art). A selected brushed path shows its options (art: fit, width %, direction, flips; pattern: size %, spacing %, tile fit, flips) plus Edit path / Expand / Release. Commands `brush_new_art`, `brush_new_pattern`, `brush_delete`, `brush_edit_path`, `brush_expand`, `brush_release`. `selectedChanged` notes what the selected art was made from; `elementChanged` calls `svgCanvas.refreshArtBrush`, so editing the spine (or undoing that) regenerates the art with no undo step of its own (the ext-mirror precedent). Reuses `ext-live-effects` button classes | `ext-art-brush.ts` |
| `ext-blend` | **Blend tool** (`tool_blend`) and the **Blend** Design-tab section (engine `core/blend.js` + `core/blend-canvas.js`). Click one shape, then another (or a blend, by its steps): one undo step; a dashed marker shows the first pick; Escape starts over. Its **options bar** (the first `options()` / `setOption()` tool) holds the spacing: mode (specified steps / specified distance / smooth colour) and the steps or distance; with a blend selected it shows and changes that blend's (one step), and the values are what new blends start with. The section (a blend or ≥ 2 shapes selected): Make blend / Expand / Release plus the same fields. **Spine** (`se:blend-spine`): *Replace spine* (a blend + a path selected) moves the keys onto the path, evenly spread by length, and the steps ride it (distance spacing counts along it); *Reverse spine*; *Detach spine* gives the path back and the steps go straight. **Pinned spine** (`se:blend-pins="0,2,3"`, an anchor index per key, written by Replace spine, which adds an anchor under each key): a moved or resized key drags its anchor, and `refreshBlend` (`holdSpine`) re-derives the spine on every refresh with no history; closed spines and spines without pins spread the keys evenly. **Align to path** (`se:blend-align="1"`, `blend_align_path` toggle; needs a spine): the first key is the reference and stays; every other key is turned (a real single `matrix(…)` about the centre of its box) by how far the spine has turned since the first key's stop, and each step is the blend of the keys *as drawn* turned to the spine's direction there; switching it off, Detach and Expand turn the keys back, Replace / Reverse un-turn, move, then turn again (one step each). `selectedChanged` / `elementChanged` call `svgCanvas.refreshBlend`, so editing a key (or undoing that) regenerates the steps with no undo step of its own. Commands `blend_make`, `blend_expand`, `blend_release`, `blend_replace_spine`, `blend_reverse_spine`, `blend_detach_spine` | `ext-blend.ts` |
| `ext-width-tool` | **Width tool** (`tool_width`, mode `width`, on `registerTool`): variable-width strokes on the canvas. Hover shows a hollow diamond and the width at the closest spot of the selected stroke (or the one under the pointer); drag outward to add a width point (both sides; **Alt** = only the dragged side), drag a diamond to slide it, drag a side handle to widen it, click to select a point, **Delete** removes it. One undo step per gesture; a line or polyline becomes a path on the first point; paths with a fill, live effects or corners are skipped. Geometry `core/width-outline.js` + `core/width-profile.js`, the stroke `drawWidthProfile` in `core/taper-stroke.js`; the overlay (diamonds, side handles) is in the tool overlay | `ext-width-tool.ts`, `images/width-tool.svg` |
| `ext-distort-tool` | **Distort tool** (`tool_distort`, mode `distort`, on `registerTool`): four grips on the corners of the selected shape's source box; dragging one (Shift = one axis) writes a `freeDistort` (bilinear) or `perspective` (projective) effect into its `se:fx` stack, one undo step per drag. A rect / ellipse / line / polyline / polygon becomes a path on the first drag; a second drag edits the same effect; a press on another shape that can take effects selects it. Mode (Free / Perspective) is on the options bar and converts a distorted selection. Perspective refuses a corner position that makes the quad non-convex. Groups, text and shapes that can't take effects are skipped. The numbers are also in the Effects panel | `ext-distort-tool.ts`, `images/distort-tool.svg` |
| `ext-gradient-tool` | **Gradient tool** (`tool_gradient`, mode `gradient`, on `registerTool`): an annotator on the selected shape's gradient (the fill, or the stroke when only that is one; Fill / Stroke on the options bar). A round start handle moves the whole gradient; a square end handle sets length and angle (Shift = 45° steps; a radial's radius); a chip per stop under the bar (drag to move, drag 24 px off the bar to delete, Alt-drag copies, double-click opens the colour dialog, Delete removes the selected one, click the bar or the stop row to add); a radial's dashed extent ellipse and focal dot. It edits the geometry attributes and stops only (units and `gradientTransform` kept); a gradient another element shares is copied first (clone-on-write). One undo step per gesture; pressing another shape with a gradient selects it | `ext-gradient-tool.ts`, `images/gradient-tool.svg`, `core/gradient-edit.js` |
| `ext-corner-tool` | **Corners tool** (`tool_corners`, mode `corners`, on `registerTool`): a round widget inside each corner of the selected `path` / `polygon` / `polyline` / `rect` (the corners `getCornerSettings` lists; hidden when a side is under 30 screen px), at the centre of the arc as drawn (at least 10 px in). Dragging moves the radius along the corner's bisector, from square to fully round (VectorCraft's `radius_change`; one undo step per drag, a readout beside the pointer). With nothing picked it edits every corner that shows a widget; with some picked (click; Shift-click adds / removes; the *Pick several* checkbox is Shift for touch) only those; a drag on an unpicked widget edits just that one. Alt-click cycles the kind (round → inverted → chamfer) of the targeted corners; a corner not cut yet gets the kind last chosen. Radius and Kind on the options bar act on the same corners (own undo steps). A rect / polygon / polyline becomes a path on the first cut (picks carry over); the element's own transform is honoured, not its groups'. Pressing another shape that can take corners selects it. Separate from `ext-corner-radius` (the Design-tab panel) so its button sits with the other on-canvas editors. The tool redraws from a microtask after each gesture, because the registry clears the overlays and then commits | `ext-corner-tool/` |
| `ext-smooth-tool` | **Smooth tool** (`tool_smooth`, mode `smooth`, on `registerTool`): drag over a path and only the part under the brush is smoothed. Targets: the selected plain paths, else the path under the press. Anchors within 18 screen px of the drag (`BRUSH_RADIUS_PX`) are marked (marks only ever grow); each run of marked anchors plus the unmarked anchor either side is refit by `smoothRegion` to within 2.5 screen px (`TOLERANCE_PX`) **from the path as it was at the press**, so a long drag never compounds. The path is rewritten live inside the gesture's one `Smooth path` undo step. Radius and tolerance divide by the path's screen scale, so any zoom or group transform feels the same. A ring (`#toolOverlay circle`) follows the pointer. Skips `se:taper-d` / `se:orig-d` / `se:fx-d` paths | `ext-smooth-tool.ts` |
| `ext-cutter` | Knife tool *(tools.md)*, on `registerTool`; geometry `core/cutter.js` | `ext-cutter.ts` |
| `ext-path-edit` | UI for **Average / Add anchor points / Join** (geometry `core/path-edit.js`, `core/path-join.js`; fit `core/bezier-fit.js`) *(tools.md)*. Injects `tool_node_average` and `tool_node_add_anchors` into `.path_node_panel` after `tool_node_delete`, `tool_join_paths` ("Close", Object → Path cluster) and `tool_join_paths_multi` (Combine row); the join buttons show only when `svgCanvas.canJoinPaths(selection)` | `ext-path-edit.ts` |
| `ext-segment` | **Segment** UI glue (geometry `core/segment.js`) *(tools.md)*; visibility via `svgCanvas.canSegment`; re-edit stamp `se:segment` on the non-split `<g>` | `ext-segment.ts`, `components/seSegmentSettings.ts` |
| `ext-curvature` | Curvature tool: Spiro curves with corner / end anchors *(tools.md)*, on `registerTool` | `ext-curvature.ts` |
| `ext-brush` | Freehand **Brush** tool (mode `'brush'`, `#tool_brush`; its controls and presets are the tool's options bar, built by `brushOptions.ts` (`createBrushOptions`, pure over injected deps) from the `buttons` / `button` / `number` / `checkbox` option types). Renders a *filled* `<path>` outline via `core/brush-stroke.js`, a nib-based renderer (roundness, thickness, calligraphic angle, taper start / end, opacity, smoothness), all live-editable (`svgCanvas.getBrushParams()` / `setBrushParams()`, session state on `svgCanvas.curBrush`, not persisted to the document) plus up to 5 saved presets (`src/editor/customBrushes.ts`). On `registerTool` (id `brush`, `keepOpacity`, `options` / `setOption`): document-space events (first point snapped, the rest raw), one undo step per stroke, Escape rolls back. **Pen pressure rides a passive side channel:** a module-scope `pointerdown` / `pointermove` listener on `svgroot` records the latest `pressure` + `pointerType` (pointer events fire just before their compat mouse events); only `pointerType === 'pen'` yields an extra width multiplier, and mouse and finger draw at constant width (no simulated pressure). Each `pointermove` smooths the raw point (`createSmoother`, an EMA independent of the pencil's stabilisation) and rebuilds the outline (`buildBrushOutline`, plain vector math, no paper.js in the hot path); `pointerUp` runs one paper.js `simplify()` (`finalizeBrushOutline`) and returns `{ created }`: the registry's transaction records and selects the stroke, so the extension never calls `addCommandToHistory` | `ext-brush.ts` |
| `ext-layout-ops` | **Transform Each** (`tool_transform_each`, group Transform) and **Split Into Grid** (`tool_split_grid`, group Tools): `interactive` commands with `enabled` reasons (any selection / one plain shape), plus a Layout section (`#layout_ops_panel`, with a selection) at the end of the Design tab. Each opens the shared `se-params-dialog`; every edit rolls the previous preview back and re-applies inside `svgCanvas.beginTransaction`, OK commits (one step), Cancel / Escape rolls back. Transform Each's Random uses one seed per dialog so the preview is stable. Maths: `core/transform-each.js`, `core/split-grid.js` | `ext-layout-ops.ts` |
| `ext-magic-wand` | **Magic Wand** (`tool_wand`, mode `wand`, on `registerTool` with `wantsHover`): a click selects every shape matching the one under the pointer (`svgCanvas.findSameAs`, the Select Same scan: the open group, else visible layers); Shift adds, Alt subtracts, empty canvas clears (the selection box is looked through with `elementsFromPoint`; locked shapes count as empty canvas). Options bar: Match (fill / stroke / fill & stroke / stroke weight / opacity / type, in memory), Click (Select / Add / Subtract, in memory: the touch stand-in for Shift / Alt, which still win; `selectionOpFor`) and Tolerance (the Select Same tolerance of Editor Preferences, one setting for both; colour criteria only). Records no undo step | `ext-magic-wand.ts` |
| `ext-measure` | **Measure tool** (`tool_measure`, mode `measure`, on `registerTool`): drag to read distance, angle (counter-clockwise), Δx, Δy in `baseUnit`; `snap: true`, Shift = 45° (or the *45° steps* checkbox, in memory: Shift for touch), `cursor: 'crosshair'`, `keepOverlays: true` (the readout in `#toolOverlay` stays until the next press / Escape / leaving the tool); never changes the drawing. Maths: `core/measure.js` | `ext-measure.ts` |
| `ext-recolor` | **Recolor Artwork** (`tool_recolor`, group Edit, `interactive`; a Recolor button in the Effects tab after Color Shift). Opens `se-recolor-dialog` (`dialogs/seRecolorDialog.ts`, a view with no drawing knowledge): rows "current → new" for every distinct solid colour (fills, strokes incl. `style`, gradient stops, filter flood colours; maths + DOM walk in `core/recolor.js`). Options: colour method (Exact / Preserve Tints / Scale Tints / Tints and Shades / Hue Shift), a harmony rule (21, VectorCraft's `harmony.rs` tones: the first row's colour is the base, rows take the tones in turn), reduce to N colours (k-means in Lab, lightness halved), turn hue, keep white / black / grays (white and black by default). Every dialog edit **previews** on the canvas (the previous preview is cancelled and the new plan applied inside `svgCanvas.beginTransaction`); OK commits one step, Cancel / Escape rolls back. A gradient or filter that something outside the selection also uses is copied first and the selection repointed (clone-on-write, as the gradient tool): one copy per gradient however many selected shapes use it, none when none of its colours change | `ext-recolor.ts`, `locale/en.js` |
| `ext-color-shift` | HSL + transparency shift in the right panel *(tools.md)*; relative deltas against a per-selection `WeakMap` snapshot; one undo step per input commit | `ext-color-shift.ts` |
| `ext-fonts` | Custom / handwritten fonts *(tools.md)*. DOM-only glue: points `<se-font-library>` at its bundled catalog, applies a picked font (adds it to `#tool_font_family`, selects it, calls `setFontFamily`) and restores cached fonts on startup. The download / cache / embed plumbing is `fontStore.ts` + `core/svg-exec.js` | `ext-fonts.ts` |
| `ext-puppet-warp` | **Puppet Warp** (`#tool_puppet_warp`): mesh deformation via Moving Least Squares (`mls.ts`) *(tools.md)*. The whole session (conversion, warp, rig attributes) is one `beginTransaction` held from entry to exit; undo or a file load mid-session drops it through `onAbort`. **Persistent for single-shape selections** (one shape, or a group with exactly one warpable descendant): rest pose + pins are cached as `se:puppet-rest-d` / `se:puppet-pins` (the `se:orig-d` idiom of `core/corner-radius.js`) and re-hydrated on re-entry through `svgCanvas.registerGeometryRemap` (an extension can't import `geometry-remap-registry.js` itself: that resolves to a source copy disjoint from the one `coords.js` ships). Multi-shape selections stay session-only (the remap hook fires for `<path>`, not `<g>`) | `ext-puppet-warp.ts` |

---

## Adding a canvas tool (`registerTool`)

> **Status (2026-10-10):** shape-family, brush, panning, eyedropper, cutter, polystar, shapes, curvature and shape-builder are on `registerTool`. Puppet-warp (a session across many gestures) and connector (augments the built-in line/select modes) intentionally keep the legacy hooks; see `techdebt.md`. A tool that finishes by switching to Select (`clickSelect()`) must do it in `pointerUp` (the gesture is closed there), never in `pointerDown`/`pointerMove` (`setMode` cancels an open gesture). Persistent previews belong in `data-se-ephemeral` nodes (or `ctx.addOverlay` for one gesture).

Register the tool from `init()`; its `id` is the mode name `setMode(id)` switches to
(the toolbar button keeps calling `setMode`, and stays a command — see below).

```js
svgCanvas.registerTool({
  id: 'spiral',
  undoLabel: 'Draw spiral',                    // one undo step per press→release
  pointerDown (ctx, ev) { /* ev.x, ev.y: document units, unzoomed, grid-snapped; return false to decline */ },
  pointerMove (ctx, ev) { /* ev.dragDistance (screen px), ev.mods.{shift,alt,ctrl,meta,mod} */ },
  pointerUp (ctx, ev) { return { created: el } /* or 'cancel' to roll back */ },
  keyDown (ctx, e) { return true /* handled */ },   // Escape never reaches it: the registry cancels
  cancel (ctx) { /* reset your own state: Escape / tool switch / error rolled the drawing back */ },
  snap: true   // optional: ev.x / ev.y also snap to other objects' anchors, boxes and the page (grid wins; rawX / rawY stay raw)
})
```

`snap: true` only for a tool that places points with `ev.x` / `ev.y` on press **and** drag (shape-family, polystar do); a tool that ignores them during the drag (brush, shaper) would show guides for points it never uses.

Rules: the gesture runs inside an undo transaction, so mutate the drawing freely and **never call
`addCommandToHistory`**; put previews/guides in `ctx.addOverlay(el)` (outside `#svgcontent`) or mark
them `data-se-ephemeral`; hand a finished new element back as `{ created }` (or call
`svgCanvas.finishCreatedElement(el)` for shapes created outside a drag, e.g. from a popover, inside
`svgCanvas.transact`). ext-shape-family is the reference implementation.

## Recording undo

New code should prefer `svgCanvas.transact(label, () => { … })` over hand-built
`BatchCommand`s: everything that changes in the callback becomes ONE undo step, a throw rolls the
drawing back, and "forgot to record this attribute" bugs cannot happen. If you must build commands by
hand, remember `ChangeElementCommand(elem, oldValues)` reads the **new** values from the DOM *when it is
constructed* — construct it **after** mutating, or redo re-applies the old value (this exact bug was in
glow/outline removal, clip release and the text-decoration toggles). Text edited in place and structure
changes are covered by transactions too. While a transaction is open, `addCommandToHistory` is
swallowed, so existing canvas methods can be called inside one unchanged.

## Commands

Every user-visible action is a command in `editor.commands` (see `architecture.md`). An extension that
adds a button gives it a stable id and registers the command, then references it from the markup:

```js
svgEditor.commands.register({
  id: 'tool_my_action',                 // persisted by hotkey overrides and favorites: never rename
  label: 'myext:buttons.0.title',
  group: 'Edit',
  keys: 'mod+shift+m',                  // optional default binding
  enabled: (editor) => editor.selectedElement ? true : 'Select something first',   // a REASON, not false
  atomic: true,                         // optional: run in an undo transaction (document-only, synchronous)
  run: (editor) => editor.svgCanvas.doMyThing()
})
// <se-button id="tool_my_action" command="tool_my_action" title="…" src="…"></se-button>
```

A `<se-button>` without `command=` still works (it self-registers as an adapter command). Flag commands
that open a dialog / file picker with `interactive: true` so the sweep and automation skip them.

## Adding UI from an Extension

Extensions can inject buttons or panels into:
- **`#theme_panel`** in `#tools_top` — small icon-only controls (e.g. theme toggle)
- **`#cur_context_panel`** — context strip shown in `rulerX` area when inside a group
- **Left panel** — add a `<se-button>` via the `addToToolbar` helper or direct DOM manipulation
- **Side panel content** — the right panel is tabbed; append property/effect sections to a tab container (`#tab_design`/`#tab_text`/`#tab_effects`/`#tab_layers`), falling back to `#sidepanel_content`. ext-shadow, ext-outline, ext-live-effects, and ext-color-shift inject into `#tab_effects` (ext-outline inserts its panel right after `#shadow_panel`)

Extension context panels for shapes (e.g. marker controls) are typically appended to `#tools_top` and shown/hidden based on element selection events.
