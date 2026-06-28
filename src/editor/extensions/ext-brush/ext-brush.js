/**
 * @file ext-brush.js
 *
 * Pressure-sensitive freehand "brush" tool. Produces a variable-width stroke
 * rendered as a filled <path> outline via the perfect-freehand library.
 *
 * Pen pressure (Apple Pencil, Wacom, Surface Pen, …) is read from PointerEvents
 * through a passive side-channel: the editor's drawing pipeline is mouse-based,
 * so coordinates still flow through the normal mouseDown/Move/Up hooks while the
 * latest pointer `pressure`/`pointerType` is captured separately. Pointer events
 * fire immediately before their compatibility mouse events, so the recorded
 * pressure is current when each hook runs. For non-pen input (mouse / finger)
 * perfect-freehand simulates pressure from velocity.
 *
 * @license MIT
 */

import { getStroke } from 'perfect-freehand'

const name = 'brush'

// Most-recent pointer state. Module scope is sufficient: one canvas is active
// at a time and the value is only read synchronously inside a draw hook.
let lastPressure = 0.5
let lastPointerType = 'mouse'

/**
 * Convert a perfect-freehand outline (array of [x, y] points) into an SVG path
 * `d` string using median-point quadratic curves. Straight from the library's
 * documented usage example.
 * @param {Array<number[]>} stroke
 * @returns {string}
 */
const getSvgPathFromStroke = (stroke) => {
  if (!stroke.length) return ''
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...stroke[0], 'Q']
  )
  d.push('Z')
  return d.join(' ')
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas
    let element = null
    let points = []
    let started = false

    const recordPressure = (e) => {
      lastPressure = e.pressure
      lastPointerType = e.pointerType
    }
    // Real pressure only for pens; mouse/finger feed a neutral value and let
    // perfect-freehand's simulatePressure derive a taper from velocity.
    const pressureNow = () => (lastPointerType === 'pen' ? lastPressure : 0.5)
    const strokeOptions = () => ({
      // Map the editor's stroke-width control onto the brush's max width.
      size: svgCanvas.getStrokeWidth() * 2,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: lastPointerType !== 'pen'
    })
    const redraw = () => {
      element.setAttribute('d', getSvgPathFromStroke(getStroke(points, strokeOptions())))
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
        // Passive pressure side-channel — never interferes with the mouse pipeline.
        svgCanvas.svgroot.addEventListener('pointerdown', recordPressure, { passive: true })
        svgCanvas.svgroot.addEventListener('pointermove', recordPressure, { passive: true })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'brush') return undefined
        started = true
        points = [[opts.start_x, opts.start_y, pressureNow()]]
        element = svgCanvas.addSVGElementsFromJson({
          element: 'path',
          attr: {
            id: svgCanvas.getNextId(),
            d: '',
            // perfect-freehand returns a closed outline, so the stroke colour is
            // applied as fill and the path has no SVG stroke of its own.
            fill: svgCanvas.getColor('stroke'),
            'fill-rule': 'nonzero',
            stroke: 'none',
            opacity: svgCanvas.getStyle().opacity,
            style: 'pointer-events:none'
          }
        })
        redraw()
        return { started: true }
      },

      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== 'brush') return undefined
        points.push([opts.mouse_x, opts.mouse_y, pressureNow()])
        redraw()
        return { started: true }
      },

      mouseUp () {
        if (svgCanvas.getMode() !== 'brush') return undefined
        started = false
        const keep = points.length > 1
        const el = element
        element = null
        points = []
        // Core commits the InsertElementCommand and handles selection when keep
        // is true (see core/event.js mouseUp) — do not add to history here.
        return { keep, element: el, started: false }
      }
    }
  }
}
