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

1. Host calls `editor.setConfig({ extensions: ['ext-polystar', 'ext-grid', ...] })`
2. `EditorStartup.init()` iterates the list and calls:
   ```js
   const { default: ext } = await import(`./extensions/${name}/${name}.js`)
   svgCanvas.addExtension(ext.name, ext.init)
   ```
3. `svgCanvas.addExtension()` calls `ext.init(S)` and stores returned hooks
4. Canvas events then dispatch to all registered extension hooks

### i18n in Extensions

Each extension has a `locale/` subfolder with JSON files per language.
Use `S.importLocale()` in `init()` to load the appropriate file.

---

## Built-in Extensions

| Extension folder | What it adds | Key file |
|-----------------|--------------|---------|
| `ext-connector` | Connector lines that auto-update when objects move; excludes connectors from group ops | `ext-connector.js` |
| `ext-eyedropper` | Eyedropper tool — click element to copy its fill/stroke/opacity to current style | `ext-eyedropper.js` |
| `ext-grid` | Grid overlay on canvas with snap-to-grid; resolution auto-adjusts with zoom level | `ext-grid.js` |
| `ext-helloworld` | Minimal example template — start here when creating a new extension | `ext-helloworld.js` |
| `ext-layer_view` | Layer visualization enhancements | `ext-layer_view.js` |
| `ext-markers` | Arrow/marker decorators on lines, polylines, paths, polygons (start/middle/end) | `ext-markers.js` |
| `ext-opensave` | File open, save, clear, import image (drag-drop), append SVG | `ext-opensave.js` |
| `ext-overview_window` | Mini canvas preview in side panel with draggable viewport indicator | `ext-overview_window.js` |
| `ext-panning` | Hand/pan tool for touch and tablet navigation | `ext-panning.js` |
| `ext-polystar` | Star tool (points, radius multiplier, radial shift) and Polygon tool (sides) | `ext-polystar.js` |
| `ext-shapes` | Shape library modal — categorised pre-made SVG shapes (clipart) | `ext-shapes.js` |
| `ext-storage` | Auto-save to `localStorage`; prompts to restore session on page load | `ext-storage.js` |
| `ext-theme-toggle` | Light/dark theme toggle button injected into `#theme_panel` in top toolbar | `ext-theme-toggle.js` |
| `ext-shadow` | Drop shadow on any single selected element — offset X/Y, blur, opacity, color; uses `<feDropShadow>` filter in `<defs>` | `ext-shadow.js` |
| `ext-cutter` | Cutter/knife tool — drag a straight line across selected shapes to split each into two independent `<path>` elements; fully undo/redo-safe | `ext-cutter.js` |
| `ext-curvature` | Curvature tool — click-to-place smooth Bézier curves auto-computed via Catmull-Rom; double-click for corner points; Escape or click-start to finalize | `ext-curvature.js` |
| `ext-color-shift` | HSL + transparency shift controls in the right side panel (H/S/L/T spin inputs, Fill/Stroke toggles, Reset). Relative deltas computed against a per-selection snapshot captured in a `WeakMap`; each input commit is one undo entry | `ext-color-shift.js` |
| `ext-fonts` | Custom/handwritten font support for text. DOM-only glue: points `<se-font-library>` (Google Fonts browser) at its bundled catalog, applies a picked font (adds it to the `#tool_font_family` dropdown, selects it, calls `setFontFamily`), and on startup restores cached fonts so they work offline and re-populate the dropdown. Download/cache/embed plumbing lives in `fontStore.js` + `core/svg-exec.js` | `ext-fonts.js` |

---

## Adding UI from an Extension

Extensions can inject buttons or panels into:
- **`#theme_panel`** in `#tools_top` — small icon-only controls (e.g. theme toggle)
- **`#cur_context_panel`** — context strip shown in `rulerX` area when inside a group
- **Left panel** — add a `<se-button>` via the `addToToolbar` helper or direct DOM manipulation
- **Side panel content** — append to `#sidepanel_content`

Extension context panels for shapes (e.g. marker controls) are typically appended to `#tools_top` and shown/hidden based on element selection events.
