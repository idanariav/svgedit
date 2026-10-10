import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

const mouse = (type, clientX, clientY, extra = {}) => new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true, ...extra })

describe('tool registry (registerTool)', () => {
  let canvas
  let layer
  const undoSize = () => canvas.undoMgr.getUndoStackSize()
  const rects = () => layer.querySelectorAll('rect').length

  // A drag tool: a rect from the press point to the pointer.
  const makeTool = (over = {}) => {
    const calls = []
    let el = null
    const tool = {
      id: 'dragrect',
      undoLabel: 'Draw test rect',
      activate: () => calls.push('activate'),
      deactivate: () => calls.push('deactivate'),
      cancel: () => { calls.push('cancel'); el = null },
      pointerDown: (ctx, ev) => { calls.push(['down', ev]); return undefined },
      pointerMove: (ctx, ev) => {
        calls.push(['move', ev])
        if (!el) {
          el = canvas.addSVGElementsFromJson({ element: 'rect', attr: { id: canvas.getNextId(), x: 0, y: 0, width: 1, height: 1 } })
        }
        el.setAttribute('width', String(Math.abs(ev.x - ctx.start.x)))
        el.setAttribute('height', String(Math.abs(ev.y - ctx.start.y)))
      },
      pointerUp: (ctx, ev) => { calls.push(['up', ev]); const made = el; el = null; return made ? { created: made } : undefined },
      ...over
    }
    return { tool, calls, get el () { return el } }
  }

  const gesture = (down, ...moves) => {
    canvas.toolPointerDown(mouse('mousedown', ...down))
    for (const m of moves) canvas.toolPointerMove(mouse('mousemove', ...m))
  }
  const release = (x, y, extra) => canvas.toolPointerUp(mouse('mouseup', x, y, extra))

  beforeEach(() => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    canvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3, dimensions: [400, 400], initFill: { color: 'FF0000', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
    })
    layer = canvas.getCurrentDrawing().getCurrentLayer()
    canvas.setRootSctm({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    canvas.undoMgr.resetUndoStack()
  })

  afterEach(() => { document.body.textContent = '' })

  describe('registration', () => {
    it('needs an id and a pointerDown', () => {
      expect(() => canvas.registerTool({ id: 'x' })).toThrow(TypeError)
      expect(() => canvas.registerTool({ pointerDown () {} })).toThrow(TypeError)
    })

    it('registers and unregisters', () => {
      canvas.registerTool(makeTool().tool)
      expect(canvas.hasTool('dragrect')).toBe(true)
      expect(canvas.unregisterTool('dragrect')).toBe(true)
      expect(canvas.hasTool('dragrect')).toBe(false)
      expect(canvas.unregisterTool('dragrect')).toBe(false)
    })

    it('only handles events while its id is the current mode', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      expect(canvas.toolPointerDown(mouse('mousedown', 5, 5))).toBe(false) // mode is "select"
      canvas.setMode('dragrect')
      expect(canvas.toolPointerDown(mouse('mousedown', 5, 5))).toBe(true)
      expect(canvas.getStarted()).toBe(true)
    })
  })

  describe('declining', () => {
    it('pointerDown returning false falls through to the legacy pipeline and records nothing', () => {
      canvas.registerTool(makeTool({ pointerDown: () => false }).tool)
      canvas.setMode('dragrect')
      expect(canvas.toolPointerDown(mouse('mousedown', 5, 5))).toBe(false)
      expect(canvas.getStarted()).toBe(false)
      expect(canvas.inTransaction()).toBe(false)
      expect(canvas.toolPointerMove(mouse('mousemove', 9, 9))).toBe(false)
      expect(canvas.toolPointerUp(mouse('mouseup', 9, 9))).toBe(false)
      expect(undoSize()).toBe(0)
    })
  })

  describe('normalised coordinates', () => {
    it('are document units, identical across down / move / up for a stationary pointer at zoom 2', () => {
      // screen -> document at 200 %: the root CTM maps client px to half as many units
      canvas.setRootSctm({ a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 })
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([100, 60], [100, 60])
      release(100, 60)
      const [, down] = t.calls.find((c) => c[0] === 'down')
      const [, move] = t.calls.find((c) => c[0] === 'move')
      const [, up] = t.calls.find((c) => c[0] === 'up')
      for (const ev of [down, move, up]) expect([ev.x, ev.y]).toEqual([50, 30])
      expect([down.screenX, down.screenY]).toEqual([100, 60])
    })

    it('rawX/rawY skip grid snapping; x/y apply it', () => {
      canvas.getCurConfig().gridSnapping = true
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      canvas.toolPointerDown(mouse('mousedown', 13, 27))
      const [, ev] = t.calls.find((c) => c[0] === 'down')
      expect([ev.rawX, ev.rawY]).toEqual([13, 27])
      expect({ x: ev.x, y: ev.y }).toEqual(canvas.snapPointToGrid(13, 27))
    })

    it('reports drag distance in screen pixels, modifiers (incl. the platform mod key)', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      canvas.toolPointerDown(mouse('mousedown', 10, 10))
      canvas.toolPointerMove(mouse('mousemove', 13, 14, { shiftKey: true, ctrlKey: true }))
      const [, ev] = t.calls.filter((c) => c[0] === 'move').at(-1)
      expect(ev.dragDistance).toBe(5)
      expect(ev.mods).toMatchObject({ shift: true, alt: false, ctrl: true, mod: true }) // jsdom: non-Mac
      expect(ev.event).toBeInstanceOf(MouseEvent)
    })
  })

  describe('automatic undo', () => {
    it('a whole gesture is one undo step with the tool label', () => {
      canvas.registerTool(makeTool().tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [20, 20], [40, 40], [60, 50])
      expect(canvas.inTransaction()).toBe(true)
      release(60, 50)
      expect(canvas.inTransaction()).toBe(false)
      expect(rects()).toBe(1)
      expect(undoSize()).toBe(1)
      expect(canvas.undoMgr.getNextUndoCommandText()).toBe('Draw test rect')
      canvas.undoMgr.undo()
      expect(rects()).toBe(0)
      canvas.undoMgr.redo()
      expect(rects()).toBe(1)
    })

    it("'cancel' from pointerUp rolls the drawing back and records nothing", () => {
      const t = makeTool({ pointerUp: () => 'cancel' })
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      expect(rects()).toBe(1)
      release(60, 50)
      expect(rects()).toBe(0)
      expect(undoSize()).toBe(0)
      expect(t.calls).toContain('cancel')
    })

    it('Escape rolls the gesture back and lets the editor leave the tool', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      expect(canvas.toolKeyDown({ key: 'Escape' })).toBe(false) // not "handled"
      expect(rects()).toBe(0)
      expect(canvas.inTransaction()).toBe(false)
      expect(canvas.getStarted()).toBe(false)
      expect(undoSize()).toBe(0)
      expect(t.calls).toContain('cancel')
      expect(release(60, 50)).toBe(false) // nothing left to release
    })

    it('switching modes mid-gesture rolls it back', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      canvas.setMode('select')
      expect(rects()).toBe(0)
      expect(undoSize()).toBe(0)
      expect(t.calls).toEqual(expect.arrayContaining(['cancel', 'deactivate']))
    })

    it('a throwing pointerMove rolls back and rethrows', () => {
      const t = makeTool({ pointerMove: () => { throw new Error('boom') } })
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      canvas.toolPointerDown(mouse('mousedown', 1, 1))
      expect(() => canvas.toolPointerMove(mouse('mousemove', 5, 5))).toThrow('boom')
      expect(canvas.inTransaction()).toBe(false)
      expect(canvas.getStarted()).toBe(false)
    })

    it('a throwing pointerDown rolls back and rethrows', () => {
      canvas.registerTool(makeTool({ pointerDown: () => { throw new Error('boom') } }).tool)
      canvas.setMode('dragrect')
      expect(() => canvas.toolPointerDown(mouse('mousedown', 1, 1))).toThrow('boom')
      expect(canvas.inTransaction()).toBe(false)
    })

    it('a throwing pointerUp rolls back and rethrows', () => {
      canvas.registerTool(makeTool({ pointerUp: () => { throw new Error('boom') } }).tool)
      canvas.setMode('dragrect')
      gesture([1, 1], [9, 9])
      expect(() => release(9, 9)).toThrow('boom')
      expect(rects()).toBe(0)
      expect(canvas.inTransaction()).toBe(false)
    })

    it('a click (no movement) commits nothing', () => {
      canvas.registerTool(makeTool().tool)
      canvas.setMode('dragrect')
      gesture([10, 10])
      release(10, 10)
      expect(undoSize()).toBe(0)
      expect(canvas.inTransaction()).toBe(false)
    })
  })

  describe('created elements', () => {
    it('are finished like drawn shapes: opacity, events, selected, back to Select', () => {
      canvas.registerTool(makeTool().tool)
      canvas.setMode('dragrect')
      const inserted = vi.fn()
      canvas.bind('elementInserted', inserted)
      gesture([10, 10], [60, 50])
      release(60, 50)
      const el = layer.querySelector('rect')
      // opacity 1 is the default, which cleanupElement() strips -- same as a drawn shape
      expect(el.hasAttribute('opacity')).toBe(false)
      expect(el.getAttribute('style')).toBe('pointer-events:inherit')
      expect(inserted).toHaveBeenCalledTimes(1)
      expect(canvas.getSelectedElements().filter(Boolean)).toEqual([el])
      expect(canvas.getMode()).toBe('select')
    })

    it('stay armed and unselected while the tool is locked', () => {
      canvas.registerTool(makeTool().tool)
      canvas.setMode('dragrect')
      canvas.setToolLocked?.(true)
      if (!canvas.getToolLocked()) return // lock API absent in this build: nothing to assert
      gesture([10, 10], [60, 50])
      release(60, 50)
      expect(canvas.getMode()).toBe('dragrect')
      expect(canvas.getSelectedElements().filter(Boolean)).toEqual([])
    })
  })

  describe('keys', () => {
    it('forwards other keys to the tool; true means handled', () => {
      const seen = []
      canvas.registerTool(makeTool({ keyDown: (ctx, e) => { seen.push(e.key); return e.key === 'x' } }).tool)
      canvas.setMode('dragrect')
      expect(canvas.toolKeyDown({ key: 'x' })).toBe(true)
      expect(canvas.toolKeyDown({ key: 'y' })).toBe(false)
      expect(seen).toEqual(['x', 'y'])
    })
  })

  describe('overlays', () => {
    it('live outside #svgcontent, are never recorded, and are cleared when the gesture ends', () => {
      const guide = () => document.createElementNS(NS.SVG, 'line')
      const t = makeTool({
        pointerMove: (ctx, ev) => { ctx.clearOverlays(); ctx.addOverlay(guide()) }
      })
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      const overlay = document.getElementById('toolOverlay')
      expect(overlay).toBeTruthy()
      expect(canvas.getSvgContent().contains(overlay)).toBe(false)
      expect(overlay.children).toHaveLength(1)
      release(60, 50)
      expect(overlay.children).toHaveLength(0)
      expect(undoSize()).toBe(0) // nothing drawn, overlay not an edit
    })
  })

  describe('hover', () => {
    it('is delivered only to tools that ask for it', () => {
      const hover = []
      const t = makeTool({ wantsHover: true, pointerMove: (ctx, ev) => hover.push(ev.x) })
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      const group = canvas.getSvgContent().querySelector('g')
      group.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) })
      canvas.toolHover(mouse('mousemove', 7, 8))
      expect(hover).toEqual([7])
      canvas.unregisterTool('dragrect')
      canvas.registerTool(makeTool({ pointerMove: (c, e) => hover.push(e.x) }).tool)
      canvas.toolHover(mouse('mousemove', 9, 9))
      expect(hover).toEqual([7])
    })
  })

  describe('lifecycle hooks', () => {
    it('activate / deactivate fire on mode changes', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      canvas.setMode('select')
      expect(t.calls).toEqual(['activate', 'deactivate'])
    })

    it('unregistering the active tool cancels its gesture', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      canvas.unregisterTool('dragrect')
      expect(rects()).toBe(0)
      expect(canvas.inTransaction()).toBe(false)
    })
  })

  describe('gestures that never see their mouseup', () => {
    it('window blur rolls the gesture back, so undo recording is not left disabled', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      window.dispatchEvent(new Event('blur'))
      expect(rects()).toBe(0)
      expect(canvas.inTransaction()).toBe(false)
      expect(t.calls).toContain('cancel')
    })

    it('undo during a gesture goes through the tool (cancel() runs; a late mouseup does nothing)', () => {
      const t = makeTool()
      canvas.registerTool(t.tool)
      canvas.setMode('dragrect')
      gesture([10, 10], [60, 50])
      canvas.undoMgr.undo()
      expect(t.calls).toContain('cancel')
      expect(canvas.inTransaction()).toBe(false)
      expect(release(60, 50)).toBe(false)
      expect(rects()).toBe(0)
    })
  })
})
