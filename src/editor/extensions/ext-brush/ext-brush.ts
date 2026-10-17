/**
 * @file ext-brush.ts
 *
 * Configurable freehand "brush" tool. Produces a variable-width stroke
 * rendered as a filled <path> outline via `core/brush-stroke.js` — a
 * nib-based renderer supporting roundness, thickness, calligraphic angle,
 * taper start/end, opacity and smoothness. Its controls and up to 5 saved
 * presets are the tool's options bar (see `brushOptions.js`).
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

import { BRUSH_SLOT_COUNT, getBrushSlot, saveBrushSlot, deleteBrushSlot, renameBrushSlot } from '../../customBrushes.ts'
import { createBrushOptions } from './brushOptions.ts'
import { createSmoother, buildBrushOutline, finalizeBrushOutline } from '@svgedit/svgcanvas/core/brush-stroke.ts'

const name = 'brush'

// Most-recent pointer state. Module scope is sufficient: one canvas is active
// at a time and the value is only read synchronously inside a draw hook.
let lastPressure = 1
let lastPointerType = 'mouse'

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.ts').default
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    let element: Element | null = null
    let points: import('@svgedit/svgcanvas/core/brush-stroke.ts').BrushPoint[] = []
    let smoother = null

    const recordPressure = (e: { pressure: number; pointerType: string; }) => {
      lastPressure = e.pressure
      lastPointerType = e.pointerType
    }
    // Real pressure only for pens; mouse/finger always draw at full width.
    const pressureNow = () => (lastPointerType === 'pen' ? lastPressure : 1)
    const redraw = () => {
      element?.setAttribute('d', buildBrushOutline(points, svgCanvas.getBrushParams()))
    }

    const brushOptions = createBrushOptions({
      slotCount: BRUSH_SLOT_COUNT,
      getParams: () => svgCanvas.getBrushParams(),
      setParams: (params) => svgCanvas.setBrushParams(params),
      getSlot: getBrushSlot,
      saveSlot: saveBrushSlot,
      deleteSlot: deleteBrushSlot,
      renameSlot: renameBrushSlot,
      askName: (i, current) => window.sePrompt(`Name for brush ${i + 1}`, current, {}, svgEditor.$container)
    })

    // The brush as a registered tool: one undo step per stroke, rolled back on Escape
    // or a tool switch. First point is the (grid-snapped) press, the rest are raw.
    svgCanvas.registerTool({
      id: 'brush',
      undoLabel: 'Brush stroke',
      ...brushOptions,
      keepOpacity: true, // the stroke carries the brush's own opacity, not the shape style's
      pointerDown (ctx, ev) {
        smoother = createSmoother(svgCanvas.getBrushParams().smoothness)
        points = [smoother.push({ x: ev.x, y: ev.y, pressure: pressureNow() })]
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
      },
      pointerMove (ctx, ev) {
        if (!element) return
        points.push(smoother.push({ x: ev.rawX, y: ev.rawY, pressure: pressureNow() }))
        redraw()
      },
      pointerUp () {
        const el = element
        if (!el) return 'cancel'
        el.setAttribute('d', finalizeBrushOutline(el.getAttribute('d') ?? '', svgCanvas))
        element = null
        points = []
        smoother = null
        return { created: el }
      },
      cancel () {
        element = null
        points = []
        smoother = null
      }
    })

    return {
      name,
      callback () {
        const buttonTemplate = `
          <se-button id="tool_brush" command="tool_brush" title="Brush" src="brush.svg" shortcut="W"></se-button>
        `
        svgCanvas.insertChildAtIndex($req('tools_left'), buttonTemplate, 11)
        svgEditor.leftPanel.addModeCommand('tool_brush', 'brush', { label: 'Brush' })
        // Double-click to lock, matching the other drawing tools (LeftPanel.js's
        // `lockable` list) — added dynamically here since #tool_brush doesn't
        // exist yet when LeftPanel.js wires up its own static lockable buttons.
        $req('tool_brush').addEventListener('dblclick', () => svgEditor.leftPanel.lockTool($req('tool_brush')))
        // Passive pressure side-channel — never interferes with the mouse pipeline.
        svgCanvas.svgroot.addEventListener('pointerdown', recordPressure, { passive: true })
        svgCanvas.svgroot.addEventListener('pointermove', recordPressure, { passive: true })
      }
    }
  }
}
