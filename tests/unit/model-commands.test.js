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

  describe('changeSelectedAttribute', () => {
    it('sets a plain attribute on the selection as one step; undo and redo; the same nodes', () => {
      canvas.selectOnly([els[0], els[1]], true)
      canvas.changeSelectedAttribute('fill', '#00ff00')
      expect(els[0].getAttribute('fill')).toBe('#00ff00')
      expect(els[1].getAttribute('fill')).toBe('#00ff00')
      expect(els[2].hasAttribute('fill')).toBe(false)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Change fill')
      canvas.undoMgr.undo()
      expect(els[0].hasAttribute('fill')).toBe(false)
      expect(layer.querySelector('[id="a"]')).toBe(els[0])
      canvas.undoMgr.redo()
      expect(els[1].getAttribute('fill')).toBe('#00ff00')
    })

    it('normalises numbers, keeps zero and removes the attribute for an empty value', () => {
      canvas.selectOnly([els[0]], true)
      canvas.changeSelectedAttribute('stroke-width', '3.5px')
      expect(els[0].getAttribute('stroke-width')).toBe('3.5')
      canvas.changeSelectedAttribute('opacity', 0)
      expect(els[0].getAttribute('opacity')).toBe('0')
      canvas.changeSelectedAttribute('stroke-width', '')
      expect(els[0].hasAttribute('stroke-width')).toBe(false)
    })

    it('records nothing when the value is the one it has', () => {
      els[0].setAttribute('fill', '#f00')
      canvas.undoMgr.resetUndoStack()
      canvas.selectOnly([els[0]], true)
      canvas.changeSelectedAttribute('fill', '#f00')
      expect(canvas.undoMgr.getUndoStackSize()).toBe(0)
    })

    it('leaves the attributes that need the DOM to the DOM path', () => {
      canvas.selectOnly([els[0]], true)
      expect(canvas.changeSelectedAttributeByModel('id', 'z', [els[0]])).toBe(false)
      expect(canvas.changeSelectedAttributeByModel('#text', 'z', [els[0]])).toBe(false)
      const path = canvas.addSVGElementsFromJson({ element: 'path', attr: { id: 'p', d: 'M0,0 L5,5' } })
      expect(canvas.changeSelectedAttributeByModel('x', 20, [path])).toBe(false) // a path has no x: the DOM path moves it
      expect(canvas.changeSelectedAttributeByModel('fill', '#000', [els[0]])).toBe(true)
    })
  })

  describe('layers', () => {
    it('create, duplicate and delete are one undoable step each, made through the model', () => {
      const count = () => canvas.getSvgContent().querySelectorAll(':scope > g.layer').length
      const before = count()
      canvas.createLayer('Extra')
      expect(count()).toBe(before + 1)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Create Layer')
      expect(canvas.getCurrentDrawing().getCurrentLayerName()).toBe('Extra')
      canvas.cloneLayer('Extra copy')
      expect(count()).toBe(before + 2)
      expect(canvas.deleteCurrentLayer()).toBe(true)
      expect(count()).toBe(before + 1)
      canvas.undoMgr.undo()
      expect(count()).toBe(before + 2)
      canvas.undoMgr.undo()
      canvas.undoMgr.undo()
      expect(count()).toBe(before)
    })
  })

  describe('layer rename and order', () => {
    it('are single undoable steps through the model', () => {
      canvas.createLayer('Top')
      const names = () => [...canvas.getSvgContent().querySelectorAll(':scope > g.layer > title')].map((t) => t.textContent)
      expect(canvas.renameCurrentLayer('Renamed')).toBe(true)
      expect(names().at(-1)).toBe('Renamed')
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Rename Layer')
      expect(canvas.setCurrentLayerPosition(0)).toBe(true)
      expect(names()[0]).toBe('Renamed')
      canvas.undoMgr.undo()
      expect(names().at(-1)).toBe('Renamed')
      canvas.undoMgr.undo()
      expect(names().at(-1)).not.toBe('Renamed')
    })
  })

  describe('layer visibility, move-to-layer and merge', () => {
    it('are single undoable steps through the model', () => {
      const layers = () => [...canvas.getSvgContent().querySelectorAll(':scope > g.layer')]
      canvas.createLayer('Second')
      const second = canvas.getCurrentDrawing().getCurrentLayer()
      expect(canvas.setLayerVisibility('Second', false)).toBe(true)
      expect(second.getAttribute('display')).toBe('none')
      canvas.undoMgr.undo()
      expect(second.getAttribute('display')).not.toBe('none')
      canvas.selectOnly([els[0]])
      expect(canvas.moveSelectedToLayer('Second')).toBe(true)
      expect(els[0].parentNode).toBe(second)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Move Elements to Layer')
      canvas.undoMgr.undo()
      expect(els[0].parentNode).toBe(layer)
      const n = layers().length
      canvas.mergeLayer()
      expect(layers().length).toBe(n - 1)
      canvas.undoMgr.undo()
      expect(layers().length).toBe(n)
    })
  })

  describe('group and ungroup', () => {
    it('keep the nodes of the children, each in one undoable step', () => {
      canvas.selectOnly([els[1], els[2]])
      canvas.groupSelectedElements()
      const g = canvas.getSelectedElements()[0]
      expect(g.tagName).toBe('g')
      expect(els[1].parentNode).toBe(g)
      const size = canvas.undoMgr.getUndoStackSize()
      canvas.ungroupSelectedElement()
      expect(canvas.undoMgr.getUndoStackSize()).toBe(size + 1)
      expect(g.isConnected).toBe(false)
      expect(els[1].parentNode).toBe(layer)
      expect(canvas.getSelectedElements()).toContain(els[1])
      canvas.undoMgr.undo()
      expect(els[1].parentNode.tagName).toBe('g')
      canvas.undoMgr.undo()
      expect(els[1].parentNode).toBe(layer)
    })
  })

  describe('moving plain shapes', () => {
    it('shifts their own coordinates through the model, in one step, and undo gives them back', () => {
      canvas.selectOnly([els[0]])
      const x = Number(els[0].getAttribute('x'))
      canvas.moveSelectedElements(5, 7)
      expect(Number(els[0].getAttribute('x'))).toBe(x + 5)
      expect(els[0].hasAttribute('transform')).toBe(false)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('position')
      canvas.undoMgr.undo()
      expect(Number(els[0].getAttribute('x'))).toBe(x)
    })
  })

  describe('moving a shape that only carries a translation', () => {
    it('folds it into the coordinates and drops the transform', () => {
      els[1].setAttribute('transform', 'translate(10 20)')
      canvas.undoMgr.snapshots.baseline()
      canvas.selectOnly([els[1]])
      const x = Number(els[1].getAttribute('x'))
      const y = Number(els[1].getAttribute('y'))
      canvas.moveSelectedElements(1, 2)
      expect(Number(els[1].getAttribute('x'))).toBe(x + 11)
      expect(Number(els[1].getAttribute('y'))).toBe(y + 22)
      expect(els[1].hasAttribute('transform')).toBe(false)
      canvas.undoMgr.undo()
      expect(els[1].getAttribute('transform')).toBe('translate(10 20)')
    })
  })

  describe('setElementAttributes', () => {
    it('sets and removes attributes through the model, as one step', () => {
      els[0].setAttribute('rx', '3')
      canvas.undoMgr.snapshots.baseline()
      expect(canvas.setElementAttributes('Radius', els[0], { rx: '9', ry: '9', fill: null })).toBe(true)
      expect(els[0].getAttribute('rx')).toBe('9')
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Radius')
      canvas.undoMgr.undo()
      expect(els[0].getAttribute('rx')).toBe('3')
      expect(els[0].hasAttribute('ry')).toBe(false)
      const bare = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      expect(canvas.setElementAttributes('x', bare, { a: '1' })).toBe(false)
    })
  })

  describe('bakeDrag', () => {
    const undoPreview = (el, was) => { if (was) el.setAttribute('transform', was); else el.removeAttribute('transform') }
    it('states a finished drag of plain shapes on the model, as one step from before the drag', () => {
      canvas.undoMgr.snapshots.baseline()
      const x0 = Number(els[0].getAttribute('x'))
      const x1 = Number(els[1].getAttribute('x'))
      els[0].setAttribute('transform', 'translate(7 3)') // the live preview of the drag
      els[1].setAttribute('transform', 'translate(7 3)')
      expect(canvas.bakeDrag(new Map([[els[0], ''], [els[1], '']]), undoPreview)).toBe(true)
      expect(Number(els[0].getAttribute('x'))).toBe(x0 + 7)
      expect(Number(els[1].getAttribute('x'))).toBe(x1 + 7)
      expect(els[0].hasAttribute('transform')).toBe(false)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
      canvas.undoMgr.undo()
      expect(Number(els[0].getAttribute('x'))).toBe(x0)
      expect(els[0].hasAttribute('transform')).toBe(false)
    })
    it('states a resize (translate, scale, translate) as new sizes and positions', () => {
      canvas.undoMgr.snapshots.baseline()
      const r = els[0]
      r.setAttribute('x', '10'); r.setAttribute('y', '20'); r.setAttribute('width', '40'); r.setAttribute('height', '30')
      canvas.undoMgr.snapshots.baseline()
      r.setAttribute('transform', 'translate(10 20) scale(2 3) translate(-10 -20)')
      expect(canvas.bakeDrag(new Map([[r, '']]), undoPreview)).toBe(true)
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['10', '20', '80', '90'])
      expect(r.hasAttribute('transform')).toBe(false)
      canvas.undoMgr.undo()
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['10', '20', '40', '30'])
    })
    it('declines (touching nothing) when one of them carries more than a translation', () => {
      els[0].setAttribute('transform', 'rotate(30)')
      expect(canvas.bakeDrag(new Map([[els[0], '']]), undoPreview)).toBe(false)
      expect(els[0].getAttribute('transform')).toBe('rotate(30)')
    })
  })

  describe('flipSelectedElements', () => {
    it('is one model step that undo takes back', () => {
      canvas.selectOnly([els[0], els[1]])
      canvas.undoMgr.snapshots.baseline()
      const before = canvas.undoMgr.getUndoStackSize()
      canvas.flipSelectedElements(-1, 1)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(before + 1)
      expect(els[0].getAttribute('transform')).toMatch(/^matrix\(-1 /)
      expect(els[1].getAttribute('transform')).toMatch(/^matrix\(-1 /)
      canvas.undoMgr.undo()
      expect(els[0].hasAttribute('transform')).toBe(false)
    })
  })

  describe('a drag and a resize shown through the model', () => {
    it('the renderer shows each step; ending it is one step; the element never carries a transform', () => {
      canvas.undoMgr.snapshots.baseline()
      const r = els[0]
      r.setAttribute('x', '10'); r.setAttribute('y', '20'); r.setAttribute('width', '40'); r.setAttribute('height', '30')
      canvas.undoMgr.snapshots.baseline()
      const plan = canvas.dragPlan([r])
      expect(plan).not.toBeNull()
      canvas.previewDrag(plan, 5, 5)
      canvas.previewDrag(plan, 7, 9)
      expect([r.getAttribute('x'), r.getAttribute('y')]).toEqual(['17', '29'])
      expect(r.hasAttribute('transform')).toBe(false)
      canvas.previewScale(plan, { a: 2, d: 2, e: -10, f: -20 }) // about (10, 20)
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['10', '20', '80', '60'])
      canvas.previewAfter(plan, { a: 0.5, d: 0.5, e: 0, f: 0 }) // a selection scaled as one, about the origin
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['5', '10', '20', '15'])
      canvas.previewScale(plan, { a: 2, d: 2, e: -10, f: -20 })
      const size = canvas.undoMgr.getUndoStackSize()
      expect(canvas.bakeDrag(new Map([[r, '']]), () => {})).toBe(true)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(size + 1)
      canvas.undoMgr.undo()
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['10', '20', '40', '30'])
    })
  })

  describe('a rotation shown through the model', () => {
    it('turns about the middle of the box; the renderer writes the transform; ending it is one step', () => {
      const r = els[0]
      r.setAttribute('x', '10'); r.setAttribute('y', '20'); r.setAttribute('width', '40'); r.setAttribute('height', '30')
      canvas.undoMgr.snapshots.baseline()
      r.getBBox = () => ({ x: 10, y: 20, width: 40, height: 30 }) // jsdom has no layout
      const plan = canvas.rotationPlan(r)
      expect(plan).toEqual({ id: r.id, cx: 30, cy: 35 })
      canvas.previewRotation(plan, 15)
      canvas.previewRotation(plan, 30)
      expect(r.getAttribute('transform')).toBe('rotate(30 30 35)')
      const size = canvas.undoMgr.getUndoStackSize()
      expect(canvas.snapshotHistory.endPreview('Rotate')).toBe(true)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(size + 1)
      canvas.undoMgr.undo()
      expect(r.hasAttribute('transform')).toBe(false)
      r.setAttribute('transform', 'matrix(1 0 0 1 5 5)')
      expect(canvas.rotationPlan(r)).toBeNull()
    })
  })

  describe('a rotation of the whole selection shown through the model', () => {
    it('turns each element about the common centre, after its own transform', () => {
      canvas.undoMgr.snapshots.baseline()
      els[1].setAttribute('transform', 'translate(10 0)')
      canvas.undoMgr.snapshots.baseline()
      const plan = canvas.rotationGroupPlan([els[0], els[1]])
      expect(plan).not.toBeNull()
      canvas.previewGroupRotation(plan, 90, 0, 0)
      expect(els[0].getAttribute('transform')).toBe('matrix(0 1 -1 0 0 0)')
      expect(els[1].getAttribute('transform')).toBe('matrix(0 1 -1 0 0 10)')
      const size = canvas.undoMgr.getUndoStackSize()
      expect(canvas.snapshotHistory.endPreview('Rotate')).toBe(true)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(size + 1)
      canvas.undoMgr.undo()
      expect(els[0].hasAttribute('transform')).toBe(false)
      expect(els[1].getAttribute('transform')).toBe('translate(10 0)')
      els[0].setAttribute('transform', 'rotate(10)')
      expect(canvas.rotationGroupPlan([els[0]])).toBeNull()
    })
  })

  describe('a drag of a turned shape shown through the model', () => {
    it('moves the geometry and the centre of its rotate() together', () => {
      const r = els[0]
      r.setAttribute('x', '10'); r.setAttribute('y', '20'); r.setAttribute('width', '40'); r.setAttribute('height', '30')
      r.setAttribute('transform', 'rotate(30 30 35)')
      canvas.undoMgr.snapshots.baseline()
      expect(canvas.dragPlan([r])).toBeNull() // only a drag turns a rotation into part of the plan
      const plan = canvas.dragPlan([r], true)
      expect(plan).not.toBeNull()
      canvas.previewDrag(plan, 5, 7)
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['15', '27', '40', '30'])
      expect(r.getAttribute('transform')).toBe('rotate(30 35 42)')
      expect(canvas.snapshotHistory.endPreview('position')).toBe(true)
      canvas.undoMgr.undo()
      expect(r.getAttribute('transform')).toBe('rotate(30 30 35)')
      expect(r.getAttribute('x')).toBe('10')
    })
  })

  describe('a resize of a turned shape shown through the model', () => {
    it('scales in the shape\'s own frame and keeps turning about the middle of the new geometry', () => {
      const r = els[0]
      r.setAttribute('x', '10'); r.setAttribute('y', '20'); r.setAttribute('width', '40'); r.setAttribute('height', '30')
      r.setAttribute('transform', 'rotate(90 30 35)')
      canvas.undoMgr.snapshots.baseline()
      const plan = canvas.dragPlan([r], true)
      canvas.previewTurnedScale(plan, { a: 2, d: 1, e: -10, f: 0 }) // twice as wide, about the left edge
      expect(['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n))).toEqual(['-10', '40', '80', '30'])
      expect(r.getAttribute('transform')).toBe('rotate(90 30 55)')
      canvas.snapshotHistory.cancelPreview()
      expect(r.getAttribute('transform')).toBe('rotate(90 30 35)')
    })
  })

  describe('a drag of a clipped shape shown through the model', () => {
    it('keeps the move as a matrix transform and leaves the geometry alone', async () => {
      const { parseMatrix } = await import('../../packages/svgcanvas/core/model-commands.ts')
      expect(parseMatrix('translate(5 6) scale(2)')).toEqual([2, 0, 0, 2, 5, 6])
      expect(parseMatrix('rotate(90)').map((v) => Math.round(v))).toEqual([0, 1, -1, 0, 0, 0])
      expect(parseMatrix('wobble(1)')).toBeNull()
      const r = els[0]
      r.setAttribute('x', '10'); r.setAttribute('clip-path', 'url(#clip1)'); r.setAttribute('transform', 'rotate(90)')
      canvas.undoMgr.snapshots.baseline()
      const plan = canvas.dragPlan([r], true)
      expect(plan).not.toBeNull()
      canvas.previewDrag(plan, 3, 4)
      const m = r.getAttribute('transform').match(/-?[\d.e-]+/g).map(Number)
      expect(m.map((v) => Math.round(v))).toEqual([0, 1, -1, 0, 3, 4])
      expect(r.getAttribute('x')).toBe('10')
      canvas.snapshotHistory.cancelPreview()
      expect(r.getAttribute('transform')).toBe('rotate(90)')
    })
  })

  describe('a resize of a turned polyline and path shown through the model', () => {
    it('keeps the look of the turned shape: scaled in its own frame, turned about its new middle', () => {
      const ns = 'http://www.w3.org/2000/svg'
      const layerEl = els[0].parentNode
      const poly = document.createElementNS(ns, 'polyline')
      poly.setAttribute('id', 'pl'); poly.setAttribute('points', '0,0 40,0 40,20'); poly.setAttribute('transform', 'rotate(90 20 10)')
      layerEl.append(poly)
      canvas.undoMgr.snapshots.baseline()
      const plan = canvas.dragPlan([poly], true)
      expect(plan).not.toBeNull()
      canvas.previewTurnedScale(plan, { a: 2, d: 1, e: 0, f: 0 }) // twice as wide about the left edge (x = 0)
      const pts = poly.getAttribute('points').split(/[\s,]+/).map(Number)
      // the scaled points, moved so that their middle sits where the turned one's did
      expect(pts[2] - pts[0]).toBe(80)
      expect(poly.getAttribute('transform')).toMatch(/^rotate\(90 /)
      canvas.snapshotHistory.cancelPreview()
      expect(poly.getAttribute('points')).toBe('0,0 40,0 40,20')
    })
  })

  describe('commitTransforms', () => {
    const undoPreview = (el, was) => { if (was) el.setAttribute('transform', was); else el.removeAttribute('transform') }
    it('states the transform a gesture left on the model, as one step from before it', () => {
      canvas.undoMgr.snapshots.baseline()
      els[0].setAttribute('transform', 'rotate(30 5 5)') // the live preview
      expect(canvas.commitTransforms('Rotate', new Map([[els[0], '']]), undoPreview)).toBe(true)
      expect(els[0].getAttribute('transform')).toBe('rotate(30 5 5)')
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Rotate')
      canvas.undoMgr.undo()
      expect(els[0].hasAttribute('transform')).toBe(false)
    })
  })

  describe('path edits', () => {
    it('are committed through the model: one step, undo gives the old d back', () => {
      const pathEl = canvas.addSVGElementsFromJson({ element: 'path', attr: { id: 'pth', d: 'M0,0 L10,10' } })
      canvas.undoMgr.snapshots.baseline()
      const path = new canvas.PathClass(pathEl)
      path.storeD()
      pathEl.setAttribute('d', 'M0,0 L20,20') // the live edit
      const size = canvas.undoMgr.getUndoStackSize()
      path.endChanges('Move path point(s)')
      expect(pathEl.getAttribute('d')).toBe('M0,0 L20,20')
      expect(canvas.undoMgr.getUndoStackSize()).toBe(size + 1)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Move path point(s)')
      canvas.undoMgr.undo()
      expect(pathEl.getAttribute('d')).toBe('M0,0 L10,10')
    })
  })

  describe('affineEdit', () => {
    it('maps the points of a polyline and the centre and radius of a circle', async () => {
      const { affineEdit } = await import('../../packages/svgcanvas/core/model-commands.ts')
      const ns = 'http://www.w3.org/2000/svg'
      const poly = document.createElementNS(ns, 'polyline')
      poly.setAttribute('points', '0,0 10,5')
      expect(affineEdit(poly, { a: 2, d: 3, e: 1, f: 1 })).toEqual({ points: '1,1 21,16' })
      const circle = document.createElementNS(ns, 'circle')
      circle.setAttribute('cx', '5'); circle.setAttribute('cy', '5'); circle.setAttribute('r', '2')
      expect(affineEdit(circle, { a: 2, d: 2, e: 0, f: 0 })).toEqual({ cx: '10', cy: '10', r: '4' })
      expect(affineEdit(circle, { a: 2, d: 3, e: 0, f: 0 })).toBeNull()
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', 'M0 0 L10 10 C 10 20 20 20 30 10 Z')
      expect(affineEdit(path, { a: 2, d: 2, e: 1, f: 1 }).d).toBe('M1 1L21 21C21 41 41 41 61 21Z')
      const g = document.createElementNS(ns, 'g')
      expect(affineEdit(g, { a: 1, d: 1, e: 3, f: 4 })).toEqual({ transform: 'matrix(1 0 0 1 3 4)' })
      expect(affineEdit(g, { a: 1, d: 1, e: 0, f: 0 })).toEqual({ transform: null })
      path.setAttribute('data-arc', '90') // an arc keeps its own parameters
      expect(affineEdit(path, { a: 2, d: 2, e: 1, f: 1 })).toBeNull()
    })
  })

  describe('insertLooseElements', () => {
    it('puts detached elements in their parents through the model, as one step', () => {
      const a = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      a.setAttribute('id', 'loose1')
      const b = a.cloneNode(true)
      b.setAttribute('id', 'loose2')
      const out = canvas.insertLooseElements([{ parent: layer, el: a }, { parent: layer, el: b }])
      expect(out.map((e) => e.id)).toEqual(['loose1', 'loose2'])
      expect(out[0].parentNode).toBe(layer)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
      canvas.undoMgr.undo()
      expect(layer.querySelector('[id="loose2"]')).toBeNull()
    })
  })

  describe('insertElementFromJson', () => {
    it('creates the element in the current layer through the model, in one step, with the current paint', () => {
      const el = canvas.insertElementFromJson({ element: 'circle', curStyles: true, attr: { id: 'n1', cx: 5, cy: 6, r: 7 } })
      expect(el.parentNode).toBe(layer)
      expect(layer.lastElementChild).toBe(el)
      expect(el.getAttribute('r')).toBe('7')
      expect(el.hasAttribute('fill')).toBe(true) // curStyles
      expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Create circle')
      canvas.undoMgr.undo()
      expect(layer.querySelector('[id="n1"]')).toBeNull()
      canvas.undoMgr.redo()
      expect(layer.querySelector('[id="n1"]')).toBe(el)
    })

    it('gives the element an id when the description has none', () => {
      const el = canvas.insertElementFromJson({ element: 'rect', attr: { width: 1, height: 1 } })
      expect(el.id).toMatch(/^svg_/)
    })

    it('joins a transaction: one step for the insertion and the change next to it', () => {
      canvas.transact('both', () => {
        canvas.insertElementFromJson({ element: 'rect', attr: { id: 'n2', width: 1, height: 1 } })
        els[0].setAttribute('x', '9')
      })
      expect(canvas.undoMgr.getUndoStackSize()).toBe(1)
      canvas.undoMgr.undo()
      expect(layer.querySelector('[id="n2"]')).toBeNull()
      expect(els[0].getAttribute('x')).toBe('0')
    })
  })
})
