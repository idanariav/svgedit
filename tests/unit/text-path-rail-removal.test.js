import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'

describe('text on a path whose rail is deleted', () => {
  let canvas
  const find = (sel) => canvas.getSvgContent().querySelector(sel)
  beforeEach(() => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    canvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3, dimensions: [400, 400], initFill: { color: 'FF0000', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
    })
    canvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="400"><g class="layer"><title>L</title><path id="rail" d="M10 100 C 100 0 200 0 300 100" fill="none" stroke="#888"/><text id="t1" fill="#000"><textPath href="#rail" xlink:href="#rail">along</textPath></text><rect id="other" x="1" y="1" width="5" height="5"/></g></svg>')
    canvas.undoMgr.resetUndoStack()
  })

  it('deleting the rail turns the text into plain text, and undo restores the original pair', () => {
    canvas.selectOnly([find('#rail')])
    canvas.deleteSelectedElements()
    expect(find('#rail')).toBeNull()
    expect(find('textPath')).toBeNull()
    const text = find('text')
    expect(text.textContent).toBe('along')
    expect(text.getAttribute('fill')).toBe('#000')
    expect(checkDrawing(canvas.getSvgContent())).toEqual([])
    expect(canvas.undoMgr.getUndoStackSize()).toBe(1)

    canvas.undoMgr.undo()
    expect(find('#rail')).not.toBeNull()
    expect(find('#t1 > textPath')).not.toBeNull()
    expect(canvas.getSvgContent().querySelectorAll('text').length).toBe(1)
    expect(checkDrawing(canvas.getSvgContent())).toEqual([])

    canvas.undoMgr.redo()
    expect(find('textPath')).toBeNull()
    expect(checkDrawing(canvas.getSvgContent())).toEqual([])
  })

  it('deleting the text with its rail does not try to rescue it', () => {
    canvas.selectOnly([find('#rail'), find('#t1')])
    canvas.deleteSelectedElements()
    expect(find('text')).toBeNull()
    expect(checkDrawing(canvas.getSvgContent())).toEqual([])
  })

  it('deleting an unrelated shape leaves text-on-path alone', () => {
    canvas.selectOnly([find('#other')])
    canvas.deleteSelectedElements()
    expect(find('#t1 > textPath')).not.toBeNull()
  })
})
