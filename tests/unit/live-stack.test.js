import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { registerLiveEffect } from '../../packages/svgcanvas/core/live-effects.js'
import { presetPoints } from '../../packages/svgcanvas/core/width-profile.js'
import { planStack, removalSet, canAddStage, stackProblems, rebuildAfterRemap } from '../../packages/svgcanvas/core/live-stack.js'

// Test-only effects: a plain shift, and a stroke-output one (like Scribble).
registerLiveEffect('stackshift', {
  label: 'Shift',
  defaults: { dx: 10, dy: 0 },
  apply: (subpaths, _bbox, p) => subpaths.map((sp) => ({
    closed: sp.closed,
    anchors: sp.anchors.map((a) => ({
      p: { x: a.p.x + p.dx, y: a.p.y + p.dy },
      hIn: { x: a.hIn.x + p.dx, y: a.hIn.y + p.dy },
      hOut: { x: a.hOut.x + p.dx, y: a.hOut.y + p.dy }
    }))
  }))
})
registerLiveEffect('stackhatch', {
  label: 'Hatch',
  defaults: { width: 2 },
  strokeOutput: { widthParam: 'width' },
  apply: (subpaths) => subpaths
})

const SQUARE = 'M0,0 L100,0 L100,100 L0,100 Z'

describe('live stack: corners → effects → width', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    document.body.append(workarea, toolsLeft)
    svgCanvas = new SvgCanvas(host, {
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
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  const make = (d = SQUARE, attr = {}) => svgCanvas.addSVGElementsFromJson({
    element: 'path', attr: { id: svgCanvas.getNextId(), d, stroke: '#336699', 'stroke-width': 10, fill: 'none', ...attr }
  })
  const health = () => svgCanvas.checkDrawing().filter((f) => f.code === 'se-stack' || f.code === 'se-attr-parse')

  describe('corners + width', () => {
    it('width then corners: the corners cut the centerline, the outline follows', () => {
      const sq = make()
      svgCanvas.selectOnly([sq], true)
      const [el] = svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      const profiled = el.getAttribute('d')
      expect(svgCanvas.canRoundCorners(el)).toBe(true)

      const before = svgCanvas.undoMgr.getUndoStackSize()
      expect(svgCanvas.applyCornerRadius(20)).toBe(el)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
      expect(el.getAttribute('se:orig-d')).toMatch(/^M0,0/)
      expect(el.getAttribute('se:taper-d')).toContain('A') // the mirror is the cut centerline
      expect(el.getAttribute('d')).not.toBe(profiled)
      expect(el.getAttribute('fill')).toBe('#336699') // still drawn as the outline
      expect(el.getAttribute('stroke')).toBe('none')
      expect(svgCanvas.isLiveStacked(el)).toBe(true)
      expect(health()).toEqual([])

      svgCanvas.undoMgr.undo()
      expect(el.hasAttribute('se:orig-d')).toBe(false)
      expect(el.getAttribute('se:taper-d')).toBe(SQUARE)
      expect(el.getAttribute('d')).toBe(profiled)
      svgCanvas.undoMgr.redo()
      expect(el.getAttribute('se:orig-d')).toMatch(/^M0,0/)
    })

    it('corners then width: the same element comes out', () => {
      const a = make()
      svgCanvas.selectOnly([a], true)
      svgCanvas.applyCornerRadius(20)
      expect(svgCanvas.canWidthStroke(a)).toBe(true)
      const [wa] = svgCanvas.applyWidthProfile(presetPoints('taperEnd'))

      const b = make()
      svgCanvas.selectOnly([b], true)
      const [wb] = svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      svgCanvas.applyCornerRadius(20)
      expect(wa.getAttribute('d')).toBe(wb.getAttribute('d'))
      expect(wa.getAttribute('se:taper-d')).toBe(wb.getAttribute('se:taper-d'))
      expect(wa.getAttribute('se:orig-d')).toBe(wb.getAttribute('se:orig-d'))
      expect(health()).toEqual([])
    })

    it('changing the radius regenerates the outline; radius 0 puts the sharp centerline back', () => {
      const sq = make()
      svgCanvas.selectOnly([sq], true)
      svgCanvas.applyCornerRadius(10)
      svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      const small = sq.getAttribute('d')
      svgCanvas.applyCornerRadius(30)
      expect(sq.getAttribute('d')).not.toBe(small)
      expect(health()).toEqual([])

      svgCanvas.applyCornerRadius(0)
      expect(sq.hasAttribute('se:orig-d')).toBe(false)
      expect(sq.hasAttribute('se:corner-radius')).toBe(false)
      expect(sq.getAttribute('se:taper-d')).toBe(SQUARE) // the width stage is the root again, on the sharp shape
      expect(sq.getAttribute('stroke')).toBe('none')
      expect(svgCanvas.isLiveStacked(sq)).toBe(false)
      expect(health()).toEqual([])
    })

    it('removing the width stroke leaves the cut shape and its corners', () => {
      const sq = make()
      svgCanvas.selectOnly([sq], true)
      svgCanvas.applyCornerRadius(20)
      const cut = sq.getAttribute('d')
      svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      svgCanvas.removeTaperStroke()
      expect(sq.getAttribute('d')).toBe(cut)
      expect(sq.getAttribute('stroke')).toBe('#336699')
      expect(sq.getAttribute('se:orig-d')).toMatch(/^M0,0/)
      expect(sq.hasAttribute('se:taper-d')).toBe(false)
      expect(health()).toEqual([])
    })
  })

  describe('effects + width', () => {
    it('effects under a width stroke: shifted centerline, outline over it, one undo step each', () => {
      const line = make('M0,0 L100,0')
      svgCanvas.selectOnly([line], true)
      const [el] = svgCanvas.applyWidthProfile(presetPoints('lens'))
      const plain = el.getAttribute('d')
      expect(svgCanvas.canApplyLiveEffect(el)).toBe(true)

      const before = svgCanvas.undoMgr.getUndoStackSize()
      expect(svgCanvas.applyLiveEffects([{ name: 'stackshift', params: { dx: 25, dy: 0 } }])).toBe(el)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
      expect(el.getAttribute('se:fx-d')).toBe('M0,0 L100,0') // the root: the sharp, unshifted centerline
      expect(el.getAttribute('se:taper-d')).toBe('M25,0 L125,0') // the mirror: what the effects drew
      expect(el.getAttribute('d')).not.toBe(plain)
      expect(el.getAttribute('stroke')).toBe('none')
      expect(health()).toEqual([])

      svgCanvas.undoMgr.undo()
      expect(el.hasAttribute('se:fx-d')).toBe(false)
      expect(el.getAttribute('se:taper-d')).toBe('M0,0 L100,0')
      expect(el.getAttribute('d')).toBe(plain)
    })

    it('width on top of effects', () => {
      const line = make('M0,0 L100,0')
      svgCanvas.selectOnly([line], true)
      svgCanvas.applyLiveEffects([{ name: 'stackshift', params: { dx: 25, dy: 0 } }])
      const [el] = svgCanvas.applyWidthProfile(presetPoints('lens'))
      expect(el.getAttribute('se:fx-d')).toBe('M0,0 L100,0')
      expect(el.getAttribute('se:taper-d')).toBe('M25,0 L125,0')
      // editing the effect's params re-runs the width stage over the new shape
      svgCanvas.applyLiveEffects([{ name: 'stackshift', params: { dx: 50, dy: 0 } }])
      expect(el.getAttribute('se:taper-d')).toBe('M50,0 L150,0')
      expect(health()).toEqual([])
    })

    it('removing the effects keeps the width stroke, on the sharp centerline', () => {
      const line = make('M0,0 L100,0')
      svgCanvas.selectOnly([line], true)
      svgCanvas.applyWidthProfile(presetPoints('lens'))
      const plain = line.getAttribute('d')
      svgCanvas.applyLiveEffects([{ name: 'stackshift', params: { dx: 25, dy: 0 } }])
      svgCanvas.removeLiveEffects()
      expect(line.hasAttribute('se:fx-d')).toBe(false)
      expect(line.getAttribute('se:taper-d')).toBe('M0,0 L100,0')
      expect(line.getAttribute('d')).toBe(plain)
      expect(health()).toEqual([])
    })

    it('expanding the effects bakes them into the width stroke\'s centerline', () => {
      const line = make('M0,0 L100,0')
      svgCanvas.selectOnly([line], true)
      svgCanvas.applyWidthProfile(presetPoints('lens'))
      svgCanvas.applyLiveEffects([{ name: 'stackshift', params: { dx: 25, dy: 0 } }])
      const drawn = line.getAttribute('d')
      svgCanvas.expandLiveEffects()
      expect(line.hasAttribute('se:fx-d')).toBe(false)
      expect(line.getAttribute('se:taper-d')).toBe('M25,0 L125,0')
      expect(line.getAttribute('d')).toBe(drawn)
      expect(health()).toEqual([])
    })

    it('removing the width stroke leaves the effects', () => {
      const line = make('M0,0 L100,0')
      svgCanvas.selectOnly([line], true)
      svgCanvas.applyLiveEffects([{ name: 'stackshift', params: { dx: 25, dy: 0 } }])
      const shifted = line.getAttribute('d')
      svgCanvas.applyWidthProfile(presetPoints('lens'))
      svgCanvas.removeTaperStroke()
      expect(line.getAttribute('d')).toBe(shifted)
      expect(line.getAttribute('se:fx-d')).toBe('M0,0 L100,0')
      expect(line.getAttribute('stroke')).toBe('#336699')
      expect(health()).toEqual([])
    })
  })

  describe('what stays exclusive', () => {
    it('corners and effects do not share an element', () => {
      const a = make()
      svgCanvas.selectOnly([a], true)
      svgCanvas.applyCornerRadius(10)
      expect(svgCanvas.canApplyLiveEffect(a)).toBe(false)
      const b = make()
      svgCanvas.selectOnly([b], true)
      svgCanvas.applyLiveEffects([{ name: 'stackshift' }])
      expect(svgCanvas.canRoundCorners(b)).toBe(false)
    })

    it('a stroke-output effect (Scribble) takes no width stroke, and the other way round', () => {
      const a = make('M0,0 L100,0')
      svgCanvas.selectOnly([a], true)
      svgCanvas.applyLiveEffects([{ name: 'stackhatch' }])
      expect(svgCanvas.canWidthStroke(a)).toBe(false)
      expect(svgCanvas.canTaperStroke(a)).toBe(false)

      const b = make('M0,0 L100,0')
      svgCanvas.selectOnly([b], true)
      svgCanvas.applyWidthProfile(presetPoints('lens'))
      const drawn = b.getAttribute('d')
      expect(svgCanvas.applyLiveEffects([{ name: 'stackhatch' }])).toBeNull()
      expect(b.hasAttribute('se:fx-d')).toBe(false)
      expect(b.getAttribute('d')).toBe(drawn)
    })

    it('canAddStage mirrors the supported sets', () => {
      const el = make()
      expect(canAddStage(el, 'corners')).toBe(true)
      el.setAttribute('se:orig-d', SQUARE)
      expect(canAddStage(el, 'width')).toBe(true)
      expect(canAddStage(el, 'fx')).toBe(false)
      expect(canAddStage(el, 'nope')).toBe(false)
    })
  })

  describe('the chain', () => {
    it('planStack writes nothing and returns the mirrors and d', () => {
      const el = make('M0,0 L100,0', { 'se:fx-d': 'M0,0 L100,0', 'se:fx': 'stackshift(dx=5,dy=0)' })
      const plan = planStack(el, { 'se:fx': 'stackshift(dx=7,dy=0)' })
      expect(plan.d).toBe('M7,0 L107,0')
      expect(el.getAttribute('se:fx')).toBe('stackshift(dx=5,dy=0)')
      expect(el.getAttribute('d')).toBe('M0,0 L100,0')
    })

    it('removalSet hands the removed root\'s source to the next stage', () => {
      const el = make(SQUARE, { 'se:orig-d': SQUARE, 'se:taper-d': 'M1,1 L2,2' })
      const set = removalSet(el, 'corners')
      expect(set['se:orig-d']).toBeNull()
      expect(set['se:taper-d']).toBe(SQUARE)
    })

    it('after a bake the mirrors and d are regenerated from the root', () => {
      // The per-feature hooks (paper-based for the width stage, so e2e covers them) map each source and scale the
      // sizes; this is the step that follows them.
      const sq = make()
      svgCanvas.selectOnly([sq], true)
      svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      svgCanvas.applyCornerRadius(20)
      const drawn = sq.getAttribute('d')
      sq.setAttribute('se:orig-d', 'M30,40 L130,40 L130,140 L30,140 Z') // what the corner hook did
      sq.setAttribute('se:taper-d', 'M0,0 L1,1') // a mirror the width hook could not map sensibly
      rebuildAfterRemap(sq, svgCanvas)
      expect(sq.getAttribute('se:taper-d')).toContain('A')
      expect(sq.getAttribute('se:taper-d')).toMatch(/^M\d/)
      expect(sq.getAttribute('d')).not.toBe(drawn)
      expect(svgCanvas.reconcileLiveStack(sq)).toBe(true)
      expect(health()).toEqual([])
    })

    it('a stale stack (d edited outside) is dropped whole, keeping the shape', () => {
      const sq = make()
      svgCanvas.selectOnly([sq], true)
      svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      svgCanvas.applyCornerRadius(20)
      expect(svgCanvas.reconcileLiveStack(sq)).toBe(true)
      sq.setAttribute('d', 'M0,0 L5,5 L0,9 Z')
      expect(svgCanvas.reconcileLiveStack(sq)).toBe(false)
      for (const a of ['se:orig-d', 'se:corner-radius', 'se:taper-d', 'se:taper', 'se:taper-style', 'se:width-profile']) {
        expect(sq.hasAttribute(a)).toBe(false)
      }
      expect(sq.getAttribute('d')).toBe('M0,0 L5,5 L0,9 Z')
    })

    it('reconcileLiveStack is null for an element without a stack', () => {
      expect(svgCanvas.reconcileLiveStack(make())).toBeNull()
      const one = make(SQUARE, { 'se:orig-d': SQUARE, 'se:corner-radius': '10' })
      expect(svgCanvas.reconcileLiveStack(one)).toBeNull()
    })

    it('checkDrawing reports a mirror that left the chain, and an unsupported pair', () => {
      const sq = make()
      svgCanvas.selectOnly([sq], true)
      svgCanvas.applyWidthProfile(presetPoints('taperEnd'))
      svgCanvas.applyCornerRadius(20)
      sq.setAttribute('se:taper-d', 'M0,0 L50,50')
      expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-stack' && /not the output/.test(f.message))).toBe(true)

      const bad = make(SQUARE, { 'se:orig-d': SQUARE, 'se:fx-d': SQUARE, 'se:fx': 'stackshift(dx=1,dy=0)' })
      expect(stackProblems(bad)[0]).toMatch(/cannot be stacked/)
      expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-stack' && f.id === bad.id)).toBe(true)
    })
  })
})
