import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

describe('getSvgString defs purge vs undo', () => {
  let canvas
  beforeEach(() => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    canvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3, dimensions: [400, 400], initFill: { color: 'FF0000', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
    })
    canvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="400"><defs><linearGradient id="base"><stop offset="0" stop-color="#f00"/></linearGradient><linearGradient id="g1" xlink:href="#base"/><filter id="f1"><feGaussianBlur stdDeviation="2"/></filter></defs><g class="layer"><title>L</title><rect id="r1" x="1" y="1" width="50" height="50" fill="url(#g1)" filter="url(#f1)"/></g></svg>')
    canvas.undoMgr.resetUndoStack()
  })

  const removeRect = () => {
    const r = document.getElementById('r1')
    canvas.selectOnly([r])
    canvas.deleteSelectedElements()
  }

  it('undo of a delete restores the gradient chain and filter after a save purged them', () => {
    removeRect()
    canvas.getSvgString() // purges the now unused defs
    expect(document.getElementById('g1')).toBeNull()
    canvas.undoMgr.undo()
    expect(document.getElementById('r1')).not.toBeNull()
    expect(document.getElementById('g1')).not.toBeNull()
    expect(document.getElementById('base')).not.toBeNull()
    expect(document.getElementById('f1')).not.toBeNull()
  })

  it('undoing a fill change restores a gradient that a save purged as unused', () => {
    const r = document.getElementById('r1')
    canvas.selectOnly([r])
    canvas.changeSelectedAttribute('fill', '#00ff00')
    canvas.changeSelectedAttribute('filter', 'none')
    canvas.getSvgString()
    expect(document.getElementById('g1')).toBeNull()
    canvas.undoMgr.undo()
    canvas.undoMgr.undo()
    expect(r.getAttribute('fill')).toBe('url(#g1)')
    expect(document.getElementById('g1')).not.toBeNull()
    expect(document.getElementById('base')).not.toBeNull()
    expect(document.getElementById('f1')).not.toBeNull()
  })
})

describe('getSvgString and ephemeral scaffolding', () => {
  it('does not serialise data-se-ephemeral nodes', () => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    const canvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3, dimensions: [400, 400], initFill: { color: 'FF0000', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
    })
    canvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><g class="layer"><title>L</title><rect id="keep" x="1" y="1" width="5" height="5"/></g></svg>')
    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    preview.id = 'preview'
    preview.setAttribute('data-se-ephemeral', '')
    canvas.getCurrentDrawing().getCurrentLayer().append(preview)
    const svg = canvas.getSvgString()
    expect(svg).toContain('id="keep"')
    expect(svg).not.toContain('preview')
  })
})
