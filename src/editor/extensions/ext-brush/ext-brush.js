/**
 * @file ext-brush.js
 *
 * Configurable freehand "brush" tool. Produces a variable-width stroke
 * rendered as a filled <path> outline via `core/brush-stroke.js` — a
 * nib-based renderer supporting roundness, thickness, calligraphic angle,
 * taper start/end, opacity and smoothness (see `<se-brush-settings>` for the
 * live controls and up to 5 saved presets).
 *
 * Pen pressure (Apple Pencil, Wacom, Surface Pen, …) is read from PointerEvents
 * through a passive side-channel: the editor's drawing pipeline is mouse-based,
 * so coordinates still flow through the normal mouseDown/Move/Up hooks while the
 * latest pointer `pressure`/`pointerType` is captured separately. Pointer events
 * fire immediately before their compatibility mouse events, so the recorded
 * pressure is current when each hook runs. Non-pen input (mouse / finger) draws
 * at full, constant width — there is no velocity-based pressure simulation.
 *
 * @license MIT
 */

import '../../components/seBrushSettings.js'
import { createSmoother, buildBrushOutline, finalizeBrushOutline } from '@svgedit/svgcanvas/core/brush-stroke.js'

const name = 'brush'

// Most-recent pointer state. Module scope is sufficient: one canvas is active
// at a time and the value is only read synchronously inside a draw hook.
let lastPressure = 1
let lastPointerType = 'mouse'

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas
    let element = null
    let points = []
    let smoother = null
    let started = false

    const recordPressure = (e) => {
      lastPressure = e.pressure
      lastPointerType = e.pointerType
    }
    // Real pressure only for pens; mouse/finger always draw at full width.
    const pressureNow = () => (lastPointerType === 'pen' ? lastPressure : 1)
    const redraw = () => {
      element.setAttribute('d', buildBrushOutline(points, svgCanvas.getBrushParams()))
    }

    return {
      name,
      callback () {
        const buttonTemplate = `
          <se-button id="tool_brush" title="Brush" src="brush.svg"></se-button>
        `
        svgCanvas.insertChildAtIndex($id('tools_left'), buttonTemplate, 11)
        $click($id('tool_brush'), () => {
          if (svgEditor.leftPanel.updateLeftPanel('tool_brush')) {
            svgCanvas.setMode('brush')
          }
        })
        // Double-click to lock, matching the other drawing tools (LeftPanel.js's
        // `lockable` list) — added dynamically here since #tool_brush doesn't
        // exist yet when LeftPanel.js wires up its own static lockable buttons.
        $id('tool_brush').addEventListener('dblclick', () => svgEditor.leftPanel.lockTool($id('tool_brush')))
        // Lives in the Effects tab (not tied to the current selection, unlike
        // ext-shadow/ext-outline's panels there — it configures the brush
        // tool itself) until it finds a more permanent home.
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="brush_settings_panel" class="sidepanel_section">
            <div class="sidepanel_section_label">Brush</div>
            <se-brush-settings id="tool_brush_settings" title="Brush settings" src="config.svg"></se-brush-settings>
          </div>
        `
        const host = $id('tab_effects') || $id('sidepanel_content') || $id('tools_top')
        host.appendChild(panelTemplate.content.cloneNode(true))
        // Passive pressure side-channel — never interferes with the mouse pipeline.
        svgCanvas.svgroot.addEventListener('pointerdown', recordPressure, { passive: true })
        svgCanvas.svgroot.addEventListener('pointermove', recordPressure, { passive: true })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'brush') return undefined
        started = true
        smoother = createSmoother(svgCanvas.getBrushParams().smoothness)
        points = [smoother.push({ x: opts.start_x, y: opts.start_y, pressure: pressureNow() })]
        element = svgCanvas.addSVGElementsFromJson({
          element: 'path',
          attr: {
            id: svgCanvas.getNextId(),
            d: '',
            // The outline is a closed filled shape, so the stroke colour is
            // applied as fill and the path has no SVG stroke of its own.
            fill: svgCanvas.getColor('stroke'),
            'fill-rule': 'nonzero',
            stroke: 'none',
            opacity: svgCanvas.getBrushParams().opacity,
            style: 'pointer-events:none'
          }
        })
        redraw()
        return { started: true }
      },

      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== 'brush') return undefined
        // mouseDown opts use start_x/start_y (already in canvas coords).
        // mouseMove/mouseUp use mouse_x/mouse_y (screen-pixel coords, need /zoom)
        // — see ext-cutter for the same convention. Without the division the
        // stroke tracked the cursor 1:1 only at 100% zoom; at any other zoom
        // level every point after the first landed far off from where it was
        // drawn, stretching a straight line from the start point out to the
        // wrong location.
        const zoom = svgCanvas.getZoom()
        points.push(smoother.push({ x: opts.mouse_x / zoom, y: opts.mouse_y / zoom, pressure: pressureNow() }))
        redraw()
        return { started: true }
      },

      mouseUp () {
        if (svgCanvas.getMode() !== 'brush') return undefined
        started = false
        const keep = points.length > 0
        const el = element
        if (el) el.setAttribute('d', finalizeBrushOutline(el.getAttribute('d'), svgCanvas))
        element = null
        points = []
        smoother = null
        // Core commits the InsertElementCommand and handles selection when keep
        // is true (see core/event.js mouseUp) — do not add to history here.
        return { keep, element: el, started: false }
      }
    }
  }
}
