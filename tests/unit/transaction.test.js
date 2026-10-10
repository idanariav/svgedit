import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { setLogSink, setLogLevel, LogLevel } from '../../packages/svgcanvas/common/logger.js'

const createSvgCanvas = () => {
  document.body.textContent = ''
  const svgEditor = document.createElement('div')
  svgEditor.id = 'svg_editor'
  const svgcanvas = document.createElement('div')
  svgcanvas.style.visibility = 'hidden'
  svgcanvas.id = 'svgcanvas'
  const workarea = document.createElement('div')
  workarea.id = 'workarea'
  workarea.append(svgcanvas)
  svgEditor.append(workarea)
  document.body.append(svgEditor)
  return new SvgCanvas(document.getElementById('svgcanvas'), {
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

describe('undo transactions', () => {
  let canvas
  let layer
  let rect
  let circle
  const html = () => canvas.getSvgContent().outerHTML
  const undoSize = () => canvas.undoMgr.getUndoStackSize()
  const make = (element, attr) => canvas.addSVGElementsFromJson({ element, attr })

  beforeEach(() => {
    canvas = createSvgCanvas()
    layer = canvas.getCurrentDrawing().getCurrentLayer()
    rect = make('rect', { id: 'r1', x: 10, y: 10, width: 40, height: 40, fill: '#f00' })
    circle = make('circle', { id: 'c1', cx: 100, cy: 100, r: 20 })
    canvas.undoMgr.resetUndoStack()
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  describe('attributes', () => {
    it('records changes as one undo step that undo/redo restore', () => {
      const before = html()
      const batch = (() => {
        const tx = canvas.beginTransaction('Nudge')
        rect.setAttribute('x', '20')
        rect.setAttribute('y', '30')
        circle.setAttribute('r', '25')
        return tx.commit()
      })()
      const after = html()
      expect(after).not.toBe(before)
      expect(batch.getText()).toBe('Nudge')
      expect(undoSize()).toBe(1)
      expect(batch.stack.map((c) => c.type())).toEqual(['ChangeElementCommand', 'ChangeElementCommand'])
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
      canvas.undoMgr.redo()
      expect(html()).toBe(after)
    })

    it('keeps the value from before the FIRST change', () => {
      const tx = canvas.beginTransaction('Many')
      for (let i = 1; i <= 50; i++) rect.setAttribute('x', String(i))
      tx.commit()
      canvas.undoMgr.undo()
      expect(rect.getAttribute('x')).toBe('10')
    })

    it('records nothing, and returns null, when the net change is nil', () => {
      const before = html()
      const tx = canvas.beginTransaction('Noop')
      rect.setAttribute('x', '99')
      rect.setAttribute('x', '10') // back to the original
      rect.setAttribute('y', '10') // identical value still queues a record
      expect(tx.commit()).toBeNull()
      expect(undoSize()).toBe(0)
      expect(html()).toBe(before)
    })

    it('restores attributes that were added and removed', () => {
      const before = html()
      canvas.transact('Add/remove', () => {
        rect.setAttribute('opacity', '0.5')
        circle.removeAttribute('r')
      })
      expect(rect.getAttribute('opacity')).toBe('0.5')
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
    })

    it('handles se: attributes (plain and namespaced), including removal', () => {
      rect.setAttribute('se:fx', 'a')
      circle.setAttributeNS(NS.SE, 'se:taper', 'b')
      const before = html()
      canvas.transact('se', () => {
        rect.setAttribute('se:fx', 'changed')
        rect.removeAttribute('se:fx')
        circle.setAttributeNS(NS.SE, 'se:taper', 'c')
        circle.removeAttributeNS(NS.SE, 'taper')
        circle.setAttributeNS(NS.SE, 'se:new', 'n')
      })
      expect(rect.hasAttribute('se:fx')).toBe(false)
      canvas.undoMgr.undo()
      expect(rect.getAttribute('se:fx')).toBe('a')
      expect(circle.getAttribute('se:taper')).toBe('b')
      expect(circle.hasAttribute('se:new')).toBe(false)
      expect(html()).toBe(before)
    })

    it('diffs transform / gradientTransform against their value at begin (native lists are invisible to observers)', () => {
      rect.setAttribute('transform', 'translate(1 1)')
      circle.setAttribute('transform', 'rotate(10)')
      const before = html()
      canvas.transact('transforms', () => {
        rect.setAttribute('transform', 'translate(5 5)')
        circle.removeAttribute('transform')
        make('rect', { id: 'r2' }).setAttribute('transform', 'scale(2)')
      })
      canvas.undoMgr.undo()
      expect(rect.getAttribute('transform')).toBe('translate(1 1)')
      expect(circle.getAttribute('transform')).toBe('rotate(10)')
      expect(html()).toBe(before) // r2, added inside the step, is gone again
      canvas.undoMgr.redo()
      expect(rect.getAttribute('transform')).toBe('translate(5 5)')
      expect(circle.hasAttribute('transform')).toBe(false)
    })

    it('maps xlink:href onto the #href pseudo-attribute', () => {
      const image = make('image', { id: 'i1', width: 10, height: 10 })
      image.setAttributeNS(NS.XLINK, 'xlink:href', 'a.png')
      canvas.undoMgr.resetUndoStack()
      const tx = canvas.beginTransaction('href')
      image.setAttributeNS(NS.XLINK, 'xlink:href', 'b.png')
      const batch = tx.commit()
      expect(batch.stack[0].oldValues).toHaveProperty('#href')
    })
  })

  describe('structure', () => {
    const check = (label, mutate) => {
      const before = html()
      canvas.transact(label, mutate)
      const after = html()
      expect(undoSize()).toBe(after === before ? 0 : 1)
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
      canvas.undoMgr.redo()
      expect(html()).toBe(after)
      return after
    }

    it('insert', () => {
      check('insert', () => {
        const el = document.createElementNS(NS.SVG, 'rect')
        el.id = 'new'
        layer.append(el)
      })
    })

    it('remove', () => {
      check('remove', () => rect.remove())
    })

    it('reorder', () => {
      const after = check('reorder', () => rect.before(circle))
      expect(after.indexOf('id="c1"')).toBeLessThan(after.indexOf('id="r1"'))
    })

    it('move between parents (into a new group)', () => {
      check('group', () => {
        const g = document.createElementNS(NS.SVG, 'g')
        g.id = 'grp'
        layer.append(g)
        g.append(rect, circle)
      })
    })

    it('re-nesting groups in the opposite order', () => {
      const x = document.createElementNS(NS.SVG, 'g')
      const y = document.createElementNS(NS.SVG, 'g')
      x.id = 'x'
      y.id = 'y'
      y.append(x)
      layer.append(y)
      canvas.undoMgr.resetUndoStack()
      check('swap nesting', () => {
        layer.append(x)
        x.append(y)
      })
    })

    it('add then remove inside the transaction nets out to nothing', () => {
      const before = html()
      const tx = canvas.beginTransaction('flash')
      const el = document.createElementNS(NS.SVG, 'path')
      layer.append(el)
      el.setAttribute('d', 'M0 0L1 1')
      el.remove()
      expect(tx.commit()).toBeNull()
      expect(html()).toBe(before)
    })

    it('a removed element keeps its changed attributes undoable', () => {
      const before = html()
      canvas.transact('edit then delete', () => {
        rect.setAttribute('x', '77')
        rect.remove()
      })
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
    })

    it('supports in-place text edits', () => {
      const text = make('text', { id: 't1', x: 5, y: 5 })
      text.textContent = 'hello'
      canvas.undoMgr.resetUndoStack()
      const before = html()
      canvas.transact('type', () => { text.firstChild.data = 'hello world' })
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
      canvas.undoMgr.redo()
      expect(text.textContent).toBe('hello world')
    })

    it('restores replaced text content (textContent = …)', () => {
      const text = make('text', { id: 't1', x: 5, y: 5 })
      text.textContent = 'one'
      canvas.undoMgr.resetUndoStack()
      const before = html()
      canvas.transact('replace', () => { text.textContent = 'two' })
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
    })
  })

  describe('lifecycle', () => {
    it('cancel restores the drawing and the selection and records nothing', () => {
      canvas.selectOnly([rect])
      const before = html()
      const tx = canvas.beginTransaction('Preview')
      rect.setAttribute('width', '999')
      circle.remove()
      canvas.clearSelection()
      tx.cancel()
      expect(html()).toBe(before)
      expect(canvas.getSelectedElements().filter(Boolean)).toEqual([rect])
      expect(undoSize()).toBe(0)
      expect(canvas.inTransaction()).toBe(false)
    })

    it('fires `changed` once on cancel', () => {
      const changed = vi.fn()
      canvas.bind('changed', changed)
      const tx = canvas.beginTransaction('Preview')
      rect.setAttribute('width', '999')
      tx.cancel()
      expect(changed).toHaveBeenCalledTimes(1)
    })

    it('nested transactions produce a single step, committed by the outermost', () => {
      const outer = canvas.beginTransaction('outer')
      rect.setAttribute('x', '1')
      const inner = canvas.beginTransaction('inner')
      circle.setAttribute('r', '5')
      expect(inner.commit()).toBeNull()
      expect(canvas.inTransaction()).toBe(true)
      expect(undoSize()).toBe(0)
      const batch = outer.commit()
      expect(batch.getText()).toBe('outer')
      expect(undoSize()).toBe(1)
      expect(canvas.inTransaction()).toBe(false)
    })

    it('an inner cancel dooms the whole transaction', () => {
      const before = html()
      const outer = canvas.beginTransaction('outer')
      rect.setAttribute('x', '1')
      const inner = canvas.beginTransaction('inner')
      circle.setAttribute('r', '5')
      inner.cancel()
      expect(outer.commit()).toBeNull()
      expect(html()).toBe(before)
      expect(undoSize()).toBe(0)
    })

    it('transact returns the result and rolls back + rethrows on error', () => {
      expect(canvas.transact('ok', () => { rect.setAttribute('x', '2'); return 42 })).toBe(42)
      const before = html()
      expect(() => canvas.transact('boom', () => {
        rect.setAttribute('x', '3')
        layer.append(document.createElementNS(NS.SVG, 'g'))
        throw new Error('boom')
      })).toThrow('boom')
      expect(html()).toBe(before)
      expect(undoSize()).toBe(1)
      expect(canvas.inTransaction()).toBe(false)
    })

    it('swallows commands pushed to the history while open (existing recorders keep working)', () => {
      canvas.selectOnly([rect])
      canvas.transact('via existing API', () => {
        canvas.changeSelectedAttribute('x', 55)
        canvas.changeSelectedAttribute('y', 66)
      })
      expect(undoSize()).toBe(1)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('via existing API')
      canvas.undoMgr.undo()
      expect(rect.getAttribute('x')).toBe('10')
      expect(rect.getAttribute('y')).toBe('10')
    })

    it('undo/redo while a transaction is open cancel it first', () => {
      canvas.transact('first', () => rect.setAttribute('x', '1'))
      const tx = canvas.beginTransaction('open')
      circle.setAttribute('r', '5')
      canvas.undoMgr.undo()
      expect(canvas.inTransaction()).toBe(false)
      expect(circle.getAttribute('r')).toBe('20') // cancelled
      expect(rect.getAttribute('x')).toBe('10') // and the previous step undone
      expect(tx.commit()).toBeNull() // stale handle is inert
    })

    describe('onAbort (a transaction held across gestures learns it was ended for it)', () => {
      it('fires after undo cancelled the transaction and the drawing is already reverted', () => {
        const seen = []
        canvas.beginTransaction('session', { onAbort: () => seen.push(circle.getAttribute('r')) })
        circle.setAttribute('r', '5')
        canvas.undoMgr.undo()
        expect(seen).toEqual(['20'])
        expect(canvas.inTransaction()).toBe(false)
      })

      it('fires when the drawing is replaced, leaving the new drawing alone', () => {
        const onAbort = vi.fn()
        canvas.beginTransaction('session', { onAbort })
        canvas.clear()
        expect(onAbort).toHaveBeenCalledTimes(1)
        expect(canvas.inTransaction()).toBe(false)
      })

      it('does not fire for the owner\'s own commit or cancel', () => {
        const onAbort = vi.fn()
        canvas.beginTransaction('a', { onAbort }).commit()
        canvas.beginTransaction('b', { onAbort }).cancel()
        expect(onAbort).not.toHaveBeenCalled()
      })

      it('a throwing handler does not break undo', () => {
        canvas.transact('first', () => rect.setAttribute('x', '1'))
        canvas.beginTransaction('session', { onAbort: () => { throw new Error('boom') } })
        expect(() => canvas.undoMgr.undo()).not.toThrow()
        expect(rect.getAttribute('x')).toBe('10')
      })
    })

    it('stale handles are inert', () => {
      const tx = canvas.beginTransaction('a')
      tx.cancel()
      expect(tx.commit()).toBeNull()
      expect(() => tx.cancel()).not.toThrow()
    })

    it('does not record mutations made outside a transaction', () => {
      canvas.transact('a', () => rect.setAttribute('x', '1'))
      rect.setAttribute('x', '2')
      expect(undoSize()).toBe(1)
    })
  })

  describe('ephemeral nodes', () => {
    it('are not recorded, nor their subtrees, nor restored by undo', () => {
      const overlay = document.createElementNS(NS.SVG, 'g')
      overlay.setAttribute('data-se-ephemeral', '')
      layer.append(overlay)
      const before = html()
      const batch = canvas.beginTransaction('with overlay')
      const guide = document.createElementNS(NS.SVG, 'line')
      overlay.append(guide)
      guide.setAttribute('x2', '5')
      const preview = document.createElementNS(NS.SVG, 'path')
      preview.setAttribute('data-se-ephemeral', '')
      layer.append(preview)
      rect.setAttribute('x', '1')
      const cmd = batch.commit()
      expect(cmd.stack).toHaveLength(1)
      expect(cmd.stack[0].type()).toBe('ChangeElementCommand')
      canvas.undoMgr.undo()
      expect(rect.getAttribute('x')).toBe('10')
      expect(preview.parentNode).toBe(layer)
      expect(overlay.contains(guide)).toBe(true)
      expect(before).toContain('data-se-ephemeral')
    })
  })

  describe('<text> x/y', () => {
    it('undoing a non-positional change leaves the tspans alone (used to write x="NaN")', () => {
      const text = make('text', { id: 't1', x: 10, y: 20, fill: '#f00' })
      const tspan = document.createElementNS(NS.SVG, 'tspan')
      tspan.setAttribute('x', '10')
      tspan.setAttribute('y', '20')
      text.append(tspan)
      canvas.undoMgr.resetUndoStack()
      canvas.transact('recolor', () => text.setAttribute('fill', '#00f'))
      canvas.undoMgr.undo()
      canvas.undoMgr.redo()
      expect(tspan.getAttribute('x')).toBe('10')
      expect(tspan.getAttribute('y')).toBe('20')
    })

    it('does not shift tspans twice when a text and its tspans move together', () => {
      const text = make('text', { id: 't1', x: 10, y: 20 })
      const t1 = document.createElementNS(NS.SVG, 'tspan')
      t1.setAttribute('x', '10')
      t1.setAttribute('y', '20')
      const t2 = document.createElementNS(NS.SVG, 'tspan')
      t2.setAttribute('x', '10')
      t2.setAttribute('y', '40')
      text.append(t1, t2)
      canvas.undoMgr.resetUndoStack()
      const before = html()
      canvas.transact('move text', () => {
        text.setAttribute('x', '15')
        text.setAttribute('y', '25')
        t1.setAttribute('x', '15')
        t1.setAttribute('y', '25')
        t2.setAttribute('x', '15')
        t2.setAttribute('y', '45')
      })
      const after = html()
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
      canvas.undoMgr.redo()
      expect(html()).toBe(after)
    })

    it('cancel restores tspans when a text and its tspans moved together', () => {
      const text = make('text', { id: 't1', x: 10, y: 20 })
      const tspan = document.createElementNS(NS.SVG, 'tspan')
      tspan.setAttribute('x', '10')
      tspan.setAttribute('y', '20')
      text.append(tspan)
      canvas.undoMgr.resetUndoStack()
      const before = html()
      const tx = canvas.beginTransaction('move text')
      text.setAttribute('x', '15')
      text.setAttribute('y', '25')
      tspan.setAttribute('x', '15')
      tspan.setAttribute('y', '25')
      tx.cancel()
      expect(html()).toBe(before)
      expect(canvas.undoMgr.getUndoStackSize()).toBe(0)
    })
  })

  describe('structural side effects of undo/redo', () => {
    it('re-identifies layers when a layer is added or removed', () => {
      const spy = vi.spyOn(canvas, 'identifyLayers')
      canvas.transact('new layer', () => {
        const g = document.createElementNS(NS.SVG, 'g')
        g.setAttribute('class', 'layer')
        const title = document.createElementNS(NS.SVG, 'title')
        title.textContent = 'Extra'
        g.append(title)
        canvas.getSvgContent().append(g)
      })
      spy.mockClear()
      canvas.undoMgr.undo()
      expect(spy).toHaveBeenCalled()
      spy.mockClear()
      canvas.undoMgr.redo()
      expect(spy).toHaveBeenCalled()
    })

    it('restores <use> data when a <use> is re-attached', () => {
      const seen = []
      canvas.setUseData = (el) => seen.push(el)
      const use = document.createElementNS(NS.SVG, 'use')
      use.id = 'u1'
      layer.append(use)
      canvas.undoMgr.resetUndoStack()
      canvas.transact('delete use', () => use.remove())
      canvas.undoMgr.undo()
      expect(seen).toEqual([use])
    })
  })

  describe('logging', () => {
    it('does not warn for the supported record kinds', () => {
      const lines = []
      setLogSink((level, ...rest) => lines.push([level, ...rest]))
      setLogLevel(LogLevel.WARN)
      try {
        canvas.transact('all kinds', () => {
          rect.setAttribute('x', '1')
          rect.remove()
        })
      } finally {
        setLogSink(null)
      }
      expect(lines).toEqual([])
    })
  })
})
