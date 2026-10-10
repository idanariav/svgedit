import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

describe('convertToPath keeps the element’s own style', () => {
  let canvas
  beforeEach(() => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    canvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3, dimensions: [400, 400], initFill: { color: 'FFFFFF', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
    })
    canvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><g class="layer"><title>L</title><rect id="r1" x="10" y="10" width="50" height="40" fill="#2563eb" fill-opacity="0.8" stroke="#ff0000" stroke-width="5" stroke-dasharray="4 2" opacity="0.5" paint-order="stroke"/></g></svg>')
    canvas.undoMgr.resetUndoStack()
  })

  it('copies fill, stroke and opacity from the element, not from the current shape style', () => {
    canvas.selectOnly([document.getElementById('r1')])
    const path = canvas.convertToPath(document.getElementById('r1'))
    expect(path.id).toBe('r1')
    expect(path.tagName).toBe('path')
    for (const [name, value] of Object.entries({
      fill: '#2563eb', 'fill-opacity': '0.8', stroke: '#ff0000', 'stroke-width': '5', 'stroke-dasharray': '4 2', opacity: '0.5', 'paint-order': 'stroke'
    })) {
      expect(path.getAttribute(name), name).toBe(value)
    }
    expect(path.hasAttribute('visibility')).toBe(false)
  })

  it('undo brings the original rect back', () => {
    canvas.selectOnly([document.getElementById('r1')])
    canvas.convertToPath(document.getElementById('r1'))
    canvas.undoMgr.undo()
    expect(document.getElementById('r1').tagName).toBe('rect')
  })
})
