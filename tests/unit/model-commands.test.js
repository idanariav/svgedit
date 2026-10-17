import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.ts'

const createSvgCanvas = () => {
  document.body.textContent = ''
  const workarea = document.createElement('div')
  workarea.id = 'workarea'
  const host = document.createElement('div')
  host.id = 'svgcanvas'
  workarea.append(host)
  document.body.append(workarea)
  return new SvgCanvas(host, {
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
}

// Commands that edit the model (core/model-commands.ts): the DOM is made to show the result by the renderer, elements keep their
// identity, the step is one undo entry, and what was not touched is not written.
describe('model-first commands', () => {
  let canvas
  let layer
  let els
  const order = () => [...layer.querySelectorAll('rect')].map((r) => r.id)
  const make = (id) => canvas.addSVGElementsFromJson({ element: 'rect', attr: { id, x: 0, y: 0, width: 10, height: 10 } })

  beforeEach(() => {
    canvas = createSvgCanvas()
    layer = canvas.getCurrentDrawing().getCurrentLayer()
    els = ['a', 'b', 'c', 'd'].map(make)
    canvas.undoMgr.resetUndoStack()
  })

  afterEach(() => { document.body.textContent = '' })

  it('move to top: one undo step, the same nodes, undo and redo', () => {
    canvas.selectOnly([els[0], els[1]], true)
    canvas.moveToTopSelectedElement()
    expect(order()).toEqual(['c', 'd', 'a', 'b'])
    expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
    expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Move to Top')
    expect(layer.querySelector('[id="a"]')).toBe(els[0])
    expect(canvas.getSelectedElements().filter(Boolean).map((e) => e.id).sort()).toEqual(['a', 'b']) // the selection survives
    canvas.undoMgr.undo()
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
    expect(layer.querySelector('[id="a"]')).toBe(els[0])
    canvas.undoMgr.redo()
    expect(order()).toEqual(['c', 'd', 'a', 'b'])
  })

  it('records nothing when nothing moves', () => {
    canvas.selectOnly([els[3]], true)
    canvas.moveToTopSelectedElement()
    expect(canvas.undoMgr.getUndoStackSize()).toBe(0)
  })

  it('writes only what changed: moving one element to the top is one structural write', () => {
    canvas.selectOnly([els[0]], true)
    const writes = []
    const spy = (name) => {
      const original = Node.prototype[name]
      Node.prototype[name] = function (...args) { writes.push(name); return original.apply(this, args) }
      return () => { Node.prototype[name] = original }
    }
    const restore = ['insertBefore', 'appendChild', 'removeChild', 'replaceChild'].map(spy)
    try {
      canvas.moveToTopSelectedElement()
    } finally {
      restore.forEach((r) => r())
    }
    expect(writes.length).toBeLessThanOrEqual(2) // the moved node is taken out and put back, nothing else is rebuilt
    expect(order()).toEqual(['b', 'c', 'd', 'a'])
  })

  it('move to bottom puts the selection under the others', () => {
    canvas.selectOnly([els[2], els[3]], true)
    canvas.moveToBottomSelectedElement()
    expect(order()).toEqual(['c', 'd', 'a', 'b'])
    canvas.undoMgr.undo()
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('switch z-order swaps two siblings', () => {
    canvas.selectOnly([els[0], els[3]], true)
    canvas.switchSelectedZorder()
    expect(order()).toEqual(['d', 'b', 'c', 'a'])
    canvas.undoMgr.undo()
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('delete removes the selection as one step; undo brings back the same nodes', () => {
    canvas.selectOnly([els[1], els[2]], true)
    canvas.deleteSelectedElements()
    expect(order()).toEqual(['a', 'd'])
    expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
    expect(canvas.getSelectedElements().filter(Boolean)).toHaveLength(0)
    canvas.undoMgr.undo()
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
    expect(layer.querySelector('[id="b"]')).toBe(els[1])
    canvas.undoMgr.redo()
    expect(order()).toEqual(['a', 'd'])
  })

  it('model and DOM agree after the edits', () => {
    canvas.selectOnly([els[0]], true)
    canvas.moveToTopSelectedElement()
    canvas.selectOnly([els[1]], true)
    canvas.deleteSelectedElements()
    const shown = canvas.snapshotHistory.current()
    const ids = []
    const walk = (n) => { if (n.kind !== 'element') return; const id = n.attrs.find((a) => a.name === 'id')?.value; if (n.name === 'rect') ids.push(id); n.children.forEach(walk) }
    walk(shown)
    expect(ids).toEqual(order())
  })
})
