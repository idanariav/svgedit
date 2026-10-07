import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

describe('svgCanvas.insertSvgFragment', () => {
  let svgCanvas
  let before

  beforeEach(() => {
    document.body.textContent = ''
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const container = document.createElement('div')
    container.id = 'svgcanvas'
    workarea.append(container)
    document.body.append(workarea)

    svgCanvas = new SvgCanvas(container, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>' +
      '<g id="grp"><rect id="inner" x="1" y="1" width="5" height="5"/></g>' +
      '<rect id="sib" x="300" y="300" width="40" height="40"/></g></svg>'
    )
    svgCanvas.undoMgr.resetUndoStack()
    before = svgCanvas.getSvgString()
  })

  const IMAGE = '<image href="data:image/png;base64,AAAA" data-vault-link="[[a b]]" data-vault-locked="1" x="50" y="50" width="200" height="200"/>'

  it('inserts the markup as-is into the current layer, keeping custom attributes, and selects it', () => {
    const inserted = svgCanvas.insertSvgFragment(IMAGE)

    expect(inserted).toHaveLength(1)
    const [img] = inserted
    expect(img.nodeName).toBe('image')
    expect(img.parentNode).toBe(svgCanvas.getCurrentDrawing().getCurrentLayer())
    expect(img.id).toBeTruthy()
    expect(img.getAttribute('data-vault-link')).toBe('[[a b]]')
    expect(img.getAttribute('data-vault-locked')).toBe('1')
    expect(img.getAttribute('width')).toBe('200')
    expect(svgCanvas.getSelectedElements().filter(Boolean)).toStrictEqual([img])
    // not wrapped in symbol/use, not rescaled
    expect(document.querySelector('#svgcontent symbol')).toBe(null)
    expect(img.hasAttribute('transform')).toBe(false)
  })

  it('is one undo step that leaves everything else alone, and redo restores it', () => {
    const [img] = svgCanvas.insertSvgFragment(IMAGE)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(1)

    svgCanvas.undoMgr.undo()
    expect(document.getElementById(img.id)).toBe(null)
    expect(svgCanvas.getSvgString()).toBe(before)
    expect(document.getElementById('sib')).not.toBe(null)

    svgCanvas.undoMgr.redo()
    expect(document.getElementById(img.id)).not.toBe(null)
  })

  it('inserts several elements as a single undo step', () => {
    const inserted = svgCanvas.insertSvgFragment('<text x="5" y="5">hi</text><rect x="1" y="1" width="3" height="3"/>')

    expect(inserted.map(e => e.nodeName)).toStrictEqual(['text', 'rect'])
    expect(new Set(inserted.map(e => e.id)).size).toBe(2)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(1)
  })

  it('goes into the current group when editing inside one, without leaving it', () => {
    const grp = document.getElementById('grp')
    svgCanvas.setContext(grp)

    const [el] = svgCanvas.insertSvgFragment('<rect x="2" y="2" width="9" height="9"/>')

    expect(el.parentNode).toBe(grp)
    expect(svgCanvas.getCurrentGroup()).toBe(grp)
  })

  it('runs the markup through the sanitizer', () => {
    const [el] = svgCanvas.insertSvgFragment('<rect x="1" y="1" width="3" height="3" onclick="alert(1)"/>')

    expect(el.hasAttribute('onclick')).toBe(false)
  })

  it('returns null and changes nothing for malformed markup', () => {
    expect(svgCanvas.insertSvgFragment('<rect x="1"')).toBe(null)

    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(0)
    expect(svgCanvas.getSvgString()).toBe(before)
  })

  it('fires "changed" so hosts can mark the drawing dirty', () => {
    const seen = []
    svgCanvas.bind('changed', (win, elems) => { seen.push(elems) })

    const inserted = svgCanvas.insertSvgFragment(IMAGE)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toStrictEqual(inserted)
  })
})
