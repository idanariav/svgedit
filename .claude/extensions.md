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

      // Called on Editor-owned keydown (focused editor only); return
      // { preventDefault: true } to swallow the key
      keyDown ({ event }) { },

      // Add items to a panel (via innerHTML or DOM manipulation)
      // Use S.editor or document.querySelector() to find containers

      // Register a new drawing mode. PREFERRED for new tools: svgCanvas.registerTool({...})
      // (see "Adding a canvas tool" below) -- normalised document-space events and
      // automatic undo. The legacy hooks below still work, but note their
      // coordinates mix spaces (start_x unzoomed, mouse_x ZOOMED).
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
4. Canvas events then dispatch to all registered extension hooks. Valid hook names live in `packages/svgcanvas/core/extension-hooks.js` (`EXTENSION_HOOKS`); `addExtension` warns about unknown function members and `runExtensions` about unknown dispatches. Add a new hook there first, with a payload typedef (`ExtensionHookPayloads`); a test fails if a dispatched hook is unregistered or a registered one is never dispatched. `ext-puppet-warp` deliberately keeps its own window-capture Escape listener instead of `keyDown` (ordering vs. the hotkey dispatcher).

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
| `ext-eyedropper` | Eyedropper tool (`tool_eyedropper`, `Ctrl+I`) — click an element on canvas to sample its **fill color only** (not the whole style — a deliberate scope-narrowing from an earlier version of this tool that stamped fill+stroke+width+dasharray+opacity), then a small click-anchored menu (`<se-eyedropper-menu>`, positioned via `dialogs/positionContextMenu.js`, not a reuse of the favorites-driven `SeCMenuDialog`) offers: **Set as fill/outline/background color** (each switches back to Select mode *before* calling `svgCanvas.setColor`/`svgEditor.setBackground` — the toolbar swatch only re-syncs when `mode === 'select'` at the time the `changed` event fires, so the mode switch must happen first) **Apply style to selection** / **Apply selection's style to this** (greyed out unless another shape is selected; the whole look is copied by `src/editor/styleCopy.js` in one undo step, still an explicit menu choice, never a side effect of the click, see `tools.md`), or **Generate matching palette**, which opens `<se-palette-dialog>` seeded with the sampled hex. The palette dialog is a thin UI over `src/editor/palette/generatePalette.js` — an OKLCH optimizer (via `culori`) that searches per-hue (L, max in-gamut chroma) curves against a WCAG contrast floor, then runs a mandatory whole-palette harmonization pass (equal-visual-weight relaxation for icons/text/buttons/notifications, pairwise-distinctiveness hill-climb for charts, shared-target variance-minimization for illustrations) — see `file-map.md`'s `src/editor/palette/` entry for the module breakdown | `ext-eyedropper.js` |
| `ext-grid` | Grid overlay + snap via `<se-grid-settings>` popover. 8 shapes (square pattern tile; iso/triangle/1pt/2pt-perspective as `<line>`s; plus **thirds/golden ratio/center cross** — a fixed vertical+horizontal line pair per fraction, `fractionalCross()` in `buildShapeLines`, absorbing what used to be ext-guides' separate composition-overlay popover). All non-square shapes share the same `curConfig.gridColor` styling — snapping stays the plain step grid regardless of shape (`snapToGrid`, shape-agnostic). Persists via `grid_*` prefs. Exposes `svgEditor.updateGrid` for resize redraws | `ext-grid.js` |
| `ext-layer_view` | **Layer mode** (`#tool_layerView`, `Ctrl+Shift+L`), with two mutually-exclusive sub-modes switched via a 2-segment control inside the on-canvas badge (`#layer_focus_badge`, a grid-cell sibling of `#workarea`): **Layer** (Focus, default) isolates the current layer — every other layer is **locked** (`setLayerLocked` — new/pasted objects can only land on the focused layer) and **dimmed** (inline `style.opacity` on the layer `<g>`), badge shows `Layer: {{name}}`, and layer-nav hotkeys are active: `[`/`]` switch the focused layer down/up, `PageUp`/`PageDown` move the selection to the adjacent layer and follow it. **All** (All Layers) instead calls `svgCanvas.setAllLayersMode(true)` so every layer is simultaneously selectable (click, rubber-band) — no dim/lock, hotkeys disabled, badge shows "All Layers" — for selecting elements across layers (e.g. to group/save a compound shape) without merging layers. Snapshots each layer's lock state when layer mode is entered, restores it on exit; sub-mode always resets to Layer on (re-)entry; nothing is persisted. Re-derives on `layersChanged`; drops out on manual `layerVisChanged`. Honours the `curConfig.layerView` startup flag | `ext-layer_view.js` |
| `ext-markers` | Arrow/marker decorators on lines, polylines, paths, polygons (start/middle/end). Set: arrows, triangle, diamond, open-V arrow, box, circle, star, X, slashes (filled + open `_o` variants). **Head position** picker: tip on the end / past the end / centred (`core/arrow-align.js`) | `ext-markers.js` |
| `ext-opensave` | File open, save, clear, import image (drag-drop), append SVG | `ext-opensave.js` |
| `ext-panning` | Hand/pan tool for touch and tablet navigation | `ext-panning.js` |
| `ext-polystar` | Star tool (points, radius multiplier, radial shift) and Polygon tool (sides) | `ext-polystar.js` |
| `ext-shape-family` | **Spiral / Arc / Rectangular Grid / Polar Grid** drag tools appended to the `tools_shapes` flyout (modes `spiral`, `arc`, `rectgrid`, `polargrid`). The extension creates the element lazily on the first mouseMove past a 3px threshold (a plain click never creates anything), re-renders on every move / arrow key, and returns `{keep, element}` from `mouseUp` so core inserts it (one undo step, tool-lock aware via the mode list in `event.js`). Modifiers: **Shift** equal axes, **Alt** from the centre (arc, grids), **Space** held moves the shape (claimed via the `keyDown` hook; a document `keyup` listener releases it), **↑/↓** spiral segments / grid rows / concentric rings, **←/→** grid columns / radial dividers (counts are remembered for the next shape; caps in `shape-family.js`), **Esc** aborts. A **click without a drag** opens a small options form (`.shape_family_popover`: size, counts, spiral decay/direction, arc slope/closed, grid frame) anchored at the click; Create inserts the shape there (spiral centred, others top-left). Spiral/arc = one `<path>` (fill none unless a closed arc); a grid = a `<g>` (fill none, paint on the group) of line `<path>`s, `<ellipse>`s (polar rings) and a frame `<rect>`, children get ids at commit. Selection is cleared when a drag starts so the arrow keys cannot nudge the previous shape. Geometry in `core/shape-family.js` | `ext-shape-family.js`, `locale/en.js` |
| `ext-proportion-markers` | Wireframe-only overlay: triangle tick markers along all four canvas edges at proportion points (1/2, thirds, quarters, fifths), each tier distinct in size/color. Drawn in `#proportionMarkers` under `#canvasBackground`; also owns `#snapGuides` (transient dashed snap-line overlay). Shown only when `.wireframe` class is on `editor.workarea`; redraws on `zoomChanged` and via exposed `svgEditor.updateProportionMarkers` (called by `clickWireframe` + resolution change). Tier fractions/colors are shared with the snapping code via `core/proportions.js`. Companion proportion-line snapping lives in core `event.js` (gated on `curConfig.wireframeSnapping`), which calls the exposed `svgCanvas.showSnapGuides({x,y})` to draw a guide line in the matched marker's color while dragging | `ext-proportion-markers.js` |
| `ext-frame-labels` | Name tag above every frame (`<rect data-frame>`): an HTML overlay `#frameLabels` appended to `#svgcanvas` (never saved), one `.frame-label` per frame positioned from the frame's `getBoundingClientRect()` so zoom/scroll/transforms come free. Repaints (rAF-coalesced) from a `MutationObserver` on `#svgroot` plus `zoomChanged`/`selectedChanged`. Single click selects the frame; **double-click** swaps the label for an `<input>` (Enter/blur commits via `selectOnly` + `svgCanvas.setGroupTitle`, Escape cancels) and mirrors the value into the right panel's `#frame_name`. The label text is the frame's `<title>` (fallback `Frame N`, same as the export picker). Labels take pointer events only in `select` mode (`.interactive` class, toggled on `modeChange`). Styles live in `svgedit.css` (`#frameLabels`). Hosts that pass an explicit `extensions` list must add `ext-frame-labels` | `ext-frame-labels.js` |
| `ext-ruler-guides` | **Ruler guides**: drag from `#ruler_x` for a horizontal guide, from `#ruler_y` for a vertical one; with the Select tool drag a guide to move it (Alt copies), drag it back out of the work area onto the ruler to delete, Escape cancels. Whole-unit positions (or grid). The guides are `se:guides="v:120,350;h:300.5"` on the drawing root (`core/guides.js`: `svgCanvas.getGuides()` / `setGuides(guides, label)`, one `transact` per change, validated by `checkDrawing`), drawn in the `#rulerGuides` overlay inside `#svgroot` (never exported). Each guide is a visible 1px line plus a transparent 8px hit line with its own resize cursor, grabbable only in Select mode with guides shown and unlocked, so drawing tools can still start on a guide. They are snap targets for drawing (`draw-snap`) and for select-mode moves (`smart-guides.js`: axis-only targets, ignored by equal spacing). View settings, not drawing data: prefs `guides_show` / `guides_lock` (`curConfig.showGuides` / `lockGuides`), commands `guides_toggle_show` (mod+;), `guides_toggle_lock`, `guides_clear` | `ext-ruler-guides.js`, `locale/en.js` |
| `ext-smart-guides` | Rendering + toggle for **smart alignment guides** (object-to-object snapping while dragging, *and* path-node alignment while dragging an existing node in pathedit). Object snap math lives in `core/smart-guides.js` (hooked into the `event.js` select-move branch); this extension implements `svgCanvas.showSmartGuides(payload)` — solid alignment lines + dashed equal-spacing segments in an `<svg id="smartGuides">` appended **last** in `svgroot` so guides render above filled shapes (position synced from `#svgcontent` per draw; core clears on mouse-up). **Path-node alignment**: separate alignment-detection math in `core/path-node-guides.js` (`collectPathNodeTargets`/`snapPathNodeToTargets`), hooked into `path-actions.js`'s pathedit-drag branch in `mouseMove` — while dragging a node grip (not a bezier control handle), the dragged anchor's candidate x/y is compared against every *other* anchor node of the same path within tolerance (~8 screen px), letting e.g. a path-tool-drawn rectangle's corners be lined up in exact horizontal/vertical alignment without eyeballing it. **Informational only**: the matched position is used solely to draw the guide, the node itself keeps tracking the raw cursor delta and is never pulled onto it — path nodes are too small a target to fight a hard snap free of once alignment is found (unlike object-to-object snapping above, which does move the dragged object). Rendered via the same overlay through `svgCanvas.showPathNodeGuides(payload)` (a line from the dragged node's actual (unsnapped) position to the matched target — already axis-aligned since one coordinate matches exactly — plus a small ring drawn around the target node itself, so it's unambiguous *which* node the line is aligning to; deduped by `target.index` when x and y both match the same node); cleared on pathedit mouse-up. Both snap behaviors share **one** toggle/flag: `tool_smart_snap` view-tray button, `curConfig.smartSnapping`, pref `smart_snapping` (default on). Scope is deliberately narrow: anchor nodes only (no control-handle targets), same-path nodes only (no cross-object/cross-path alignment), and drag-only (no live guide while placing new points during path *creation*) | `ext-smart-guides.js`, `@svgedit/svgcanvas/core/path-node-guides.js` |
| `ext-corner-radius` | **Corners** Design-tab section (Live Corners) — cuts every straight-sided corner of a `path` (it may curve elsewhere) / `polygon` / `polyline` / `rect` with a radius and a kind (round, inverted round, chamfer) via `svgCanvas.applyCornerRadius(r, {kind, corners})` (`core/corner-radius.js`). Controls: `corner_radius_value` (all corners) and `corner_kind_r/i/c` buttons. Non-destructive: source geometry in `se:orig-d`, choices in `se:corner-radius` (grammar in `attributes.md`; both survive save/load via the sanitize `se:` bypass); radius 0 restores; `coords.js` keeps the source synced with baked transforms (`remapCornerSource`). Polygons/polylines/rects become a `<path>` on first use. The extension shows/seeds the panel and drops stale corner attrs when `d` was rewritten outside the pipeline (e.g. pathedit; compared within 0.1px). Per-corner values (the attribute takes a list) are kept and shown; there is no per-corner UI yet (techdebt.md) | `ext-corner-radius.js` |
| `ext-repeat` | **Radial / grid / path repeat** (array) tool. `svgCanvas.repeatSelection(params)` clones the selection per step (radial: `rotate(a cx cy)` prepended, never recalculated — center is canvas center, the selection's own stroked-bbox center, or a **custom point** picked by clicking the canvas (`center: 'custom'`, `centerX`/`centerY` in params); the source is never moved, so its existing distance from whatever center is chosen becomes every copy's radius (this is how off-center + canvas/custom center produces a flower/fan pattern) — picking is a one-shot canvas click captured via `svgCanvas.armRepeatCenterPick(cb)` and mode `'repeat-pick-center'` (added to `EditorStartup.js`'s `modesToCancel`/crosshair-cursor lists), guarded in this extension's own `mouseDown` hook; grid: `translate` steps of stroked-bbox+gap; **path**: copies distributed along a rail `<path>` by arc length via `getPointAtLength` — count/start%/span%, optional tangent **rotation-follow** — the rail is the topmost selected path on a fresh apply, or the `rail=<id>` stored in the params stamp on re-edit, and is never cloned/stamped; closed rails wrap i/n, open rails clamp endpoints) with fresh ids (`remapElementIdsAndRefs`; defs stay shared), one `BatchCommand`. Re-editable via stamps: `se:repeat-source`/`se:repeat` (params) on sources, `se:repeat-copy` on copies — `getRepeatParams()` seeds the `<se-repeat-settings>` popover from source *or copy*, and re-applying replaces the copies in the same batch. Buttons injected into the Object + Combine sections | `ext-repeat.js`, `components/seRepeatSettings.js` |
| `ext-mirror` | Mirror-copy action + **live linked symmetry** engine for the (currently UI-less) mirror drawing mode. `svgCanvas.setMirrorAxis('v'\|'h'\|null)`/`getMirrorAxis()` drive the mode's live-symmetry axis (dashed overlay `#mirrorAxis` on `#canvasBackground`) — no toolbar toggle button as of the top-panel cleanup that removed `tool_mirror`; API-only until/unless a UI entry point is re-added. Twin creation hooks history, not events: wraps `svgCanvas.addCommandToHistory` and replaces a bare `InsertElementCommand` of a layer child (= hand-drawn commit) with one `BatchCommand` of source + reflected twin (`se:mirror-of` + `se:mirror-axis`), so a mirrored stroke undoes in one step; batched inserts (paste/repeat/bool-ops) pass through. Text twins are position-mirrored only. **Live link:** `elementChanged`/`elementTransition` re-sync a twin whenever its source changes (during the drag too), mode on or off; syncs are non-undoable (connector re-routing precedent — undo of the source edit re-fires the sync). Dragging a twin directly (or source+twin together) unlinks it so manual edits stick. **Mirror delete:** wraps `svgCanvas.deleteSelectedElements` to pull a still-linked partner (source or twin) into the selection before the original runs, so deleting either half removes both in one undo step; unlinked elements delete normally. `svgCanvas.mirrorSelection()` (buttons `tool_mirror_copy`/`_multi`, Object/Combine sections) reflects a copy of the selection without the mode | `ext-mirror.js` |
| `ext-taper` | **Tapered strokes** UI glue (geometry in `core/taper-stroke.js`): `<se-taper-settings>` popover (`tool_taper`, Object section, after `tool_stroke_to_path`) with start/end tip-% inputs + Apply/Update/Remove. Self-managed visibility: shown only for a single taperable element (`svgCanvas.canTaperStroke` — open stroked line/polyline/path without fill, or an already-tapered path) | `ext-taper.js`, `components/seTaperSettings.js` |
| `ext-text-path` | **Text on path** UI glue (logic in `core/text-path.js`). `tool_text_on_path` (Combine section, shown only when exactly one `<text>` + one path-convertible shape are selected) → `svgCanvas.attachTextToPath()`: rebuilds the text as `<text><textPath href xlink:href startOffset>` referencing the rail (non-path rails are swapped for their `<path>` equivalent in the same batch; structure changes are Remove+Insert pairs). Text tab gains `#textpath_panel` (self-managed visibility) with `textpath_offset` (startOffset %, `svgCanvas.textPathOffset(pct)`) and `tool_text_path_release` (`detachTextFromPath()` — plants plain text at the first glyph's rendered baseline). v1 caveats: multi-line text flattens to one line; deleting the rail orphans the textPath; text-edit caret on a curved baseline is unreliable | `ext-text-path.js` |
| `ext-shape-builder` | **Shape builder** (Illustrator-style paint-to-merge; math in `core/shape-builder.js`). `tool_shape_builder` (Combine section, 2+ selection) enters mode `shapebuilder`: the selection decomposes into atomic regions (planar arrangement via iterative paper.js intersect/subtract, ≤12 shapes), outlined in the `#shapeBuilderOverlay` overlay (zoom-scaled `<g>`, inserted before `#smartGuides`). Hover highlights the region under the cursor (workarea mousemove listener — ext `mouseMove` only fires while pressed); click/drag across regions and release to **merge** them into one path (styled from the topmost shape under the first pick, carved out of all sources) or **Alt+release to delete** them. One BatchCommand per gesture; touched sources are rebuilt as `<path>` (Remove+Insert), the resulting `d` normalized to absolute commands via `toAbsolutePathData` (see `core/paper-utils.js` — needed so the result is node-editable; see below). The session re-decomposes from the results and continues; Escape (added to `cancelTool`'s mode list), any tool switch (a wrapped `setMode` tears down), or the **Done** button on the `#shape_builder_hint` on-canvas bar all exit; an outside `elementChanged` (undo/redo) bails out rather than acting on stale regions. The hint bar (`svgEditor.$svgEditor`-anchored, same grid-cell-sibling pattern as `#layer_focus_badge`) shows the click/drag/Alt instructions plus a live picked-region count while a session is active — added 2026-07-09 since the toolbar tooltip alone wasn't discoverable enough | `ext-shape-builder.js` |
| `ext-shapes` | Shape library modal — categorised pre-made SVG shapes (clipart). Also user-saved shapes (`userShapes.js`, `localStorage`); a saved shape may carry an optional `linkedFile` (a host-provided vault link via `window.svgEditHost.pickVaultFile`) which is stamped as `data-vault-link` on the imported root + every descendant on insert. **Insertion is element-agnostic:** arming the tool listens for the bubbling/composed `shape-insert` event at the document level (so *any* `<se-shape-library>` instance — the desktop `#tool_shapelib` or the tablet command bar's — drives it), stores the armed shape in the extension closure (`_armedDraw` / `_userShapeData`, fed from the event detail, not a DOM `dataset`), and the next canvas mousedown places it. Also exposed as `svgEditor.armShapeInsert(detail, target)` for programmatic callers. **User-shape resize:** the drag in `mouseMove` sizes a user shape deterministically from its saved `bbox` (the content's own coordinate space) — it rewrites the `translate/scale/translate` transform from scratch each move and recalcs only once on `mouseUp`. This avoids the path-shape's incremental `getBBox()`-based math, which broke for container elements (`<g>`, `<image>`, …) whose seed `scale` can't be flattened, leaving them stuck at ~0 size. **Paint servers:** a saved shape may carry its referenced gradients/filters/markers in a leading `<defs>` (`EditorStartup._addSelectedToShapeLibrary` bundles them via `getReferencedDefElements`); on insert, `ext-shapes` splits that defs off, imports it into the canvas `<defs>`, and remaps all ids of shape + defs together (`canv.remapElementIdsAndRefs`) so repeat insertions don't collide and `url(#…)` refs stay intact. **Proportion lock:** the placement drag is free-form (non-uniform) by default — the shape stretches to fill whatever box is dragged; holding **Shift** locks it to the source shape's original aspect ratio (uniform scale, fit to the smaller drag-box dimension), for both the path-shape and user-shape branches of `mouseMove` | `ext-shapes.js`, `userShapes.js` |
| `ext-theme-toggle` | Light/dark theme toggle button injected into `#theme_panel` in top toolbar. **Not in the default extension list** (theme lives in Preferences); a host opts in by listing `ext-theme-toggle` in `extensions` | `ext-theme-toggle.js` |
| `ext-live-effects` | UI for the **live-effect stack** (engine in `core/live-effects.js`): a "Distort" section (`#ext-live-effects-panel`) in `#tab_effects` with the current `se:fx` stack as rows (✎ edit, ✕ remove), an "Add effect" `se-select` (filled from `svgCanvas.listLiveEffects()`) and an Expand button. Editing/adding opens an inline param form generated from the effect's `defaults` (number → `se-spin-input`, boolean → checkbox, string → `se-select` from `choices`; `ranges` give spin min/max/step) that live-previews through `svgCanvas.previewLiveEffects` (a hidden-original + throwaway clone, **no undo step**), Apply = one undo step via `applyLiveEffects`, Cancel/selection change = `cancelLiveEffectsPreview`. A selected `<text>` shows a one-line hint (`#ext-live-effects-hint`) instead of the controls. Hidden while no effect is registered, in pathedit, or when the selection can't take effects (`canApplyLiveEffect`; text/groups/taper/corner-radius paths). Calls `reconcileLiveEffects` on selection so a node-edited path drops its stale `se:fx`/`se:fx-d`. Seeded effects (a `seed` param — Roughen, Tweak, Scribble) start with a random seed (so each object jitters differently) and get a **Randomize** button; re-editing keeps the stored seed. **To add an effect:** `registerLiveEffect(name, { label, defaults, apply(subpaths, bbox, params), choices?, ranges? })` — no UI code | `ext-live-effects.js` |
| `ext-shadow` | Drop shadow on any single selected element — angle/length, blur, opacity, color; uses an `<feDropShadow>` primitive. **Length 0 ⟺ no shadow** in the data model; the panel shows this as an **On** switch (`#shadow_enabled`): turning it off removes the shadow, turning it on (or editing any field while off) applies it with a default distance of 8. Opacity is shown 0–100 in the panel (stored 0–1 in the filter). Delegates all filter construction to the shared **`fx-filter.js` composer** (see below), so a shadow and an outline share one per-element filter and coexist. Exposes `svgEditor.shadowApi` (`{ read(elem), apply(elem, params, batchCmd) }`) so the class library can capture/re-stamp shadows | `ext-shadow.js` |
| `ext-outline` | Second outline (halo / casing) color around a **line's** own stroke — e.g. a white line with a thin black outline, like a text outline. Controls: width (0 ⟺ no outline), opacity, color. Built from an `<feMorphology operator=dilate>` → `<feFlood>` → `<feComposite>` → `<feMerge>` chain that floods the dilated source alpha and draws the original on top. Shown only for line-family tagNames (`line`, `polyline`, `path`, `polygon`). Delegates to the shared `fx-filter.js` composer (coexists with shadow). Exposes `svgEditor.outlineApi` (`{ read(elem), apply(elem, params, batchCmd) }`) for class-library capture/re-stamp. Caveat: `feMorphology` dilate gives mildly boxy corners at large widths — negligible on thin lines | `ext-outline.js` |
| `fx-filter.js` (shared, not an extension) | Per-element SVG filter composer shared by ext-shadow, ext-outline and ext-glow. An element's `filter` attr references only one filter, so the effects compose into a single filter (id = existing referenced id, else `{id}_fx`): feather block first when set (`feGaussianBlur(SourceAlpha)` → `feComposite(SourceGraphic in soft)` → `feComposite(in SourceAlpha)` → `fx_feathered`, which then stands in for `SourceGraphic` *and* `SourceAlpha` in every later block, so outline / glows / shadow follow the soft edge), outline block (`feMorphology`/`feFlood`/`feComposite`/`feMerge` → `fx_outlined`), outer glow (blur of the outlined alpha, flood, `in` composite, merged *under*; `fx_oglow_*` → `fx_oglowed`), inner glow (edge: blurred inverted alpha via `feComponentTransfer`/`feFuncA table 1 0`, centre: blurred alpha; clipped to `SourceAlpha`, merged *over*; `fx_iglow_*` → `fx_iglowed`), then `feDropShadow` fed from the newest result (so the shadow is cast by shape + glow). `readEffects(elem)` parses the current `{ feather, outline, glow: {outer, inner}, shadow }` spec **by `result` name** (never "first feFlood" — a glow's flood may come first); `writeEffects(elem, spec, batchCmd)` rebuilds the whole filter (Remove+Insert for undo; `spec.glow` may be omitted). A filter with a glow or feather gets `color-interpolation-filters="sRGB"`; shadow-only / outline-only filters are byte-identical to the pre-glow output (pinned by `tests/unit/fx-filter-glow.test.js`). **Region uses absolute `userSpaceOnUse`** (not `objectBoundingBox`): an axis-aligned line has a zero-dimension bbox that collapses a bbox-relative region and hides the line; it pads by stroke/2 + max(outline + 1.5·outerBlur, 1.5·innerBlur if edge, shadow reach + 1.5·outerBlur) — an edge inner glow needs room *outside* the shape to blur the inverted alpha. `refreshRegion(elem)` re-derives the absolute region after a move; the extensions call it from `mouseUp` (runs after a move bakes the drag transform), `elementChanged`, and `selectedChanged`. Load-time realignment + legacy `objectBoundingBox`→`userSpaceOnUse` migration happen in `svgCanvas.convertDropShadowFilters` (svg-exec.js). One instance is shared via `svgEditor.fxFilter` | `fx-filter.js` |
| `ext-glow` | **Outer / inner glow and feather** on any single selected element, text included (Effects tab, `#glow_panel` after `#outline_panel`). Per glow: blur (**0 ⟺ no glow**; σ = blur/2), opacity %, colour; the inner glow also has a source (`edge` inward / `centre` outward). Editing opacity / colour of a glow that is off switches it on at blur 5. **Feather** (`glow_feather_radius`, 0 ⟺ off; σ = radius/2) fades the object's own edges inward, unlike Blur it never grows past the silhouette. Remove button clears both glows and the feather (shadow / outline untouched). Owns only the `glow` and `feather` slices of the composer spec. Exposes `svgEditor.glowApi = { read(elem) → {outer, inner, feather}\|null, apply(elem, {outer, inner, feather}\|{remove:true}, batchCmd) }` for class presets (`<se-class-select>` captures / re-applies `preset.glow`). Glows composite normally (a filter cannot blend with what is behind the element, so no "screen" like VectorCraft's raster mode) | `ext-glow.js` |
| `ext-shaper` | **Shaper** tool (`tool_shaper`, Shift+N, mode `shaper`, on `registerTool`): a rough stroke becomes a clean `<line>` / `<rect>` / `<ellipse>` / `<polygon>` (rotated rect/ellipse carry a `rotate()` transform); a zig-zag scribble deletes the objects it touches; an unrecognised stroke is discarded. Classification in `core/shape-recognize.js`; the extension captures the stroke, previews it in the tool overlay, maps the result to an element and hit-tests scribbles (`strokeTouches`: `isPointInFill`/`isPointInStroke` for the paint the element really has). Polygons are plain `<polygon>`s, not polystar ones: the polystar panel rebuilds from a fixed orientation and would flip a down-pointing triangle on its first edit | `ext-shaper.js`, `locale/en.js` |
| `ext-smooth-tool` | **Smooth tool** (`tool_smooth`, mode `smooth`, no default shortcut, on `registerTool`; button after the Shaper): drag over a path and only the part under the brush is smoothed. Targets: the selected plain paths, else the path under the press. Anchors within 18 screen px of the drag (`BRUSH_RADIUS_PX`) are marked (marks only ever grow) and each run of marked anchors plus the unmarked anchor either side is refit by `smoothRegion` to within 2.5 screen px (`TOLERANCE_PX`), from the path as it was at the press, so a long drag never compounds; the path is rewritten live inside the gesture's one `Smooth path` undo step. Radius and tolerance divide by the path's screen scale, so any zoom or group transform feels the same. A ring (`#toolOverlay circle`) follows the pointer. Skips `se:taper-d` / `se:orig-d` / `se:fx-d` paths |
| `ext-cutter` | Cutter/knife tool — drag a straight line across selected shapes to split each into two independent `<path>` elements; fully undo/redo-safe | `ext-cutter.js` |
| `ext-path-edit` | UI for **Average / Add anchor points / Join** (geometry in `core/path-edit.js`, `core/path-join.js`; fit in `core/bezier-fit.js`). Injects `tool_node_average` (`se-select` action menu: Horizontal / Vertical / Both) and `tool_node_add_anchors` into `.path_node_panel` after `tool_node_delete`, `tool_join_paths` ("Close", Object → Path cluster, one open path) and `tool_join_paths_multi` (Combine row, two open paths). Join buttons show only when `svgCanvas.canJoinPaths(selection)` | `ext-path-edit.js` |
| `ext-segment` | **Segment** tool UI glue (geometry in `core/segment.js`): `<se-segment-settings>` popover (`tool_segment`, Object section, after `tool_repeat`) divides the single selected shape with N evenly-spaced dividing lines — **radial** (spokes 360°/N apart, always around the shape's own center — exact `cx`/`cy` for an untransformed circle/ellipse, bbox center otherwise; no center picker) or **grid** (N parallel vertical/horizontal lines). A **Split/Non-split** toggle picks the output: split cuts the shape into N (radial) or N+1 (grid) independent `<path>` pieces via paper.js `intersect()` against a generated wedge/strip polygon per piece, replacing the original as one `BatchCommand`; non-split draws the lines (exactly clipped to the shape's true boundary via `getIntersections`, not its bbox) on top and wraps shape+lines in a `<g>` so they act as one object. Re-editable via an `se:segment` stamp on that `<g>` — reopening the popover seeds params for "Update"; switching an existing non-split result to Split first unwraps it cleanly (old lines removed, empty group dropped) before cutting. Self-managed visibility via `svgCanvas.canSegment` | `ext-segment.js`, `components/seSegmentSettings.js` |
| `ext-curvature` | Curvature tool — click-to-place smooth curves via Spiro (clothoid curves, `spiro` pkg); Shift+click for corner anchors, Alt+click for **end** anchors (fix the curve up to that point and start the next segment; combinable with Shift; Alt chosen over Ctrl since Ctrl+click triggers the OS context menu on macOS), click-drag an existing anchor to reposition it live (session-only); double-click or click-start to finalize | `ext-curvature.js` |
| `ext-brush` | Configurable freehand **Brush** tool (mode `'brush'`, `#tool_brush`; settings popover `#tool_brush_settings` currently lives in the right panel's Effects tab as a "Brush" section — `#brush_settings_panel`, not selection-dependent unlike ext-shadow/ext-outline's panels there — temporary until a better spot is found). Renders a *filled* `<path>` outline via `core/brush-stroke.js` — a nib-based renderer with roundness (round ⇄ flat/chiseled tip), thickness, calligraphic angle, taper start/end, opacity and smoothness, all live-editable through `<se-brush-settings>` (`svgCanvas.getBrushParams()`/`setBrushParams()`, session state on `svgCanvas.curBrush` — not persisted to the document) plus up to 5 saved presets (`src/editor/customBrushes.js`). The tool is registered with `svgCanvas.registerTool` (id `brush`, `keepOpacity`): document-space events (first point snapped, the rest raw), one undo step per stroke, Escape rolls the stroke back. **Pen pressure rides a passive side-channel**: a module-scope `pointerdown`/`pointermove` listener on `svgroot` records the latest `pressure`+`pointerType` (pointer events fire just before their compat mouse events). Real pressure only for `pointerType==='pen'` (extra width multiplier); mouse/finger draw at constant width — no velocity-simulated pressure. Each `pointermove` smooths the raw point (`createSmoother`, an EMA filter independent of the pencil tool's stabilization) and rebuilds the outline (`buildBrushOutline`, plain vector math — no paper.js in the hot path); `pointerUp` runs one paper.js `simplify()` pass (`finalizeBrushOutline`) to compact the outline and returns `{ created }`; the registry's transaction records the stroke and selects it — the extension does **not** call `addCommandToHistory` | `ext-brush.js` |
| `ext-color-shift` | HSL + transparency shift controls in the right side panel (H/S/L/T spin inputs, Fill/Stroke toggles, Reset). Relative deltas computed against a per-selection snapshot captured in a `WeakMap`; each input commit is one undo entry | `ext-color-shift.js` |
| `ext-fonts` | Custom/handwritten font support for text. DOM-only glue: points `<se-font-library>` (Google Fonts browser) at its bundled catalog, applies a picked font (adds it to the `#tool_font_family` dropdown, selects it, calls `setFontFamily`), and on startup restores cached fonts so they work offline and re-populate the dropdown. Download/cache/embed plumbing lives in `fontStore.js` + `core/svg-exec.js` | `ext-fonts.js` |
| `ext-puppet-warp` | **Puppet Warp** (`#tool_puppet_warp`) — Illustrator-style mesh deformation via Moving Least Squares (`mls.js`). Drop pins on a selection, drag one to bend the shape around the others; Escape cancels, any exit commits one undo step (the whole session — conversion, warp, rig attrs — is one `beginTransaction` held from entry to exit; undo or loading a file mid-session drops the session via `onAbort`). **Persistent for single-shape selections** (one shape, or a group with exactly one warp-able descendant): rest pose + pins are cached as `se:puppet-rest-d`/`se:puppet-pins` (same `se:`-attribute idiom as `core/corner-radius.js`'s `se:orig-d`) and re-hydrated on re-entry via `svgCanvas.registerGeometryRemap` (an extension can't import `geometry-remap-registry.js` directly — that resolves to a source copy disjoint from the `packages/svgcanvas` dist bundle `coords.js` ships in). Multi-shape selections stay session-only (`coords.js`'s remap-registry hook only fires for `<path>`, not `<g>`) | `ext-puppet-warp.js` |

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
