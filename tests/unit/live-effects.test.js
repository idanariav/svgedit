import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import {
  registerLiveEffect, listLiveEffects, parseFxStack, serializeFxStack, sanitizeFxStack,
  computeFxD, isFxCurrent, remapFxSource, resolveParams, MAX_FX_ANCHORS,
  FX_ATTR, FX_SOURCE_ATTR
} from '../../packages/svgcanvas/core/live-effects.js'
import { parseAnchors, anchorsToD } from '../../packages/svgcanvas/core/anchor-path.js'

// Test-only effects. `fxshift` moves everything by (dx, dy); `fxgrow` scales
// about the source bbox centre by `1 + amount` and records the bbox it saw.
const seenBBoxes = []
registerLiveEffect('fxshift', {
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
registerLiveEffect('fxgrow', {
  label: 'Grow',
  defaults: { amount: 0.5, mode: 'smooth', flag: false },
  choices: { mode: ['smooth', 'corner'] },
  apply: (subpaths, bbox, p) => {
    seenBBoxes.push(bbox)
    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    const k = 1 + p.amount
    const m = (pt) => ({ x: cx + (pt.x - cx) * k, y: cy + (pt.y - cy) * k })
    return subpaths.map((sp) => ({
      closed: sp.closed,
      anchors: sp.anchors.map((a) => ({ p: m(a.p), hIn: m(a.hIn), hOut: m(a.hOut) }))
    }))
  }
})
registerLiveEffect('fxempty', { label: 'Empty', defaults: {}, apply: () => [] })

describe('live-effects', function () {
  let svgCanvas

  beforeEach(function () {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)
    svgCanvas = new SvgCanvas(svgcanvas, {
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
    seenBBoxes.length = 0
  })

  afterEach(function () {
    document.body.textContent = ''
  })

  const addRect = (id = 'r1') => svgCanvas.addSVGElementsFromJson({
    element: 'rect',
    attr: { id, x: 10, y: 20, width: 100, height: 50, fill: '#f00' }
  })
  const select = (elem) => svgCanvas.selectOnly([elem], true)
  const byId = (id) => svgCanvas.getSvgContent().querySelector(`#${id}`)

  describe('registry and se:fx format', function () {
    it('lists registered effects with their defaults', function () {
      const shift = listLiveEffects().find((e) => e.name === 'fxshift')
      assert.equal(shift.label, 'Shift')
      assert.deepEqual(shift.defaults, { dx: 10, dy: 0 })
    })

    it('rejects invalid effect names', function () {
      assert.throws(() => registerLiveEffect('bad name', { defaults: {}, apply: (s) => s }))
    })

    it('parse → serialize round-trips a two-effect stack', function () {
      const str = 'fxshift(dx=5,dy=-2.5);fxgrow(amount=0.25,mode=corner,flag=true)'
      const stack = parseFxStack(str)
      assert.equal(stack.length, 2)
      assert.deepEqual(stack[0], { name: 'fxshift', params: { dx: 5, dy: -2.5 } })
      assert.deepEqual(stack[1].params, { amount: 0.25, mode: 'corner', flag: true })
      assert.equal(serializeFxStack(stack), str)
    })

    it('drops unknown effect names and malformed entries', function () {
      const stack = parseFxStack('nope(a=1);fxshift(dx=3);garbage;fxshift(dx=4')
      assert.deepEqual(stack, [{ name: 'fxshift', params: { dx: 3, dy: 0 } }])
    })

    it('keeps the default for non-finite, wrong-typed or disallowed values', function () {
      const [grow] = parseFxStack('fxgrow(amount=NaN,mode=weird,flag=maybe)')
      assert.deepEqual(grow.params, { amount: 0.5, mode: 'smooth', flag: false })
      const [shift] = parseFxStack('fxshift(dx=Infinity,dy=1e999,extra=7)')
      assert.deepEqual(shift.params, { dx: 10, dy: 0 })
    })

    it('resolveParams coerces booleans/numbers and ignores undeclared keys', function () {
      assert.deepEqual(resolveParams({ defaults: { n: 1, b: false } }, { n: true, b: 1, zzz: 3 }), { n: 1, b: true })
    })

    it('sanitizeFxStack tolerates junk', function () {
      assert.deepEqual(sanitizeFxStack(null), [])
      assert.deepEqual(sanitizeFxStack([null, { name: 'nope' }, { name: 'fxshift' }]),
        [{ name: 'fxshift', params: { dx: 10, dy: 0 } }])
    })
  })

  describe('computeFxD', function () {
    it('applies effects left to right against the source bbox', function () {
      const d = computeFxD('M0,0 L100,0 L100,50 Z', [
        { name: 'fxshift', params: { dx: 10, dy: 0 } },
        { name: 'fxgrow', params: { amount: 1 } }
      ])
      assert.deepEqual(seenBBoxes[0], { x: 0, y: 0, width: 100, height: 50 })
      const [sp] = parseAnchors(d)
      // shift then grow ×2 about the *source* centre (50,25).
      assert.deepEqual(sp.anchors[0].p, { x: -30, y: -25 })
    })

    it('returns null for an empty source, an empty result or an over-budget result', function () {
      assert.equal(computeFxD('', [{ name: 'fxshift' }]), null)
      assert.equal(computeFxD('M0,0 L1,1', [{ name: 'fxempty', params: {} }]), null)
      registerLiveEffect('fxhuge', {
        label: 'Huge',
        defaults: {},
        apply: (sps) => [{ closed: false, anchors: Array.from({ length: MAX_FX_ANCHORS + 1 }, (_, i) => ({ p: { x: i, y: 0 }, hIn: { x: i, y: 0 }, hOut: { x: i, y: 0 } })) }, ...sps.slice(1)]
      })
      assert.equal(computeFxD('M0,0 L1,1', [{ name: 'fxhuge', params: {} }]), null)
    })

    it('contains a throwing effect', function () {
      registerLiveEffect('fxboom', { label: 'Boom', defaults: {}, apply: () => { throw new Error('boom') } })
      assert.equal(computeFxD('M0,0 L1,1', [{ name: 'fxboom', params: {} }]), null)
    })
  })

  describe('canApplyLiveEffect', function () {
    it('accepts supported primitives and rejects others', function () {
      const rect = addRect()
      assert.equal(svgCanvas.canApplyLiveEffect(rect), true)
      const text = svgCanvas.addSVGElementsFromJson({ element: 'text', attr: { id: 't1', x: 0, y: 0 } })
      assert.equal(svgCanvas.canApplyLiveEffect(text), false)
      const g = svgCanvas.addSVGElementsFromJson({ element: 'g', attr: { id: 'g1' } })
      assert.equal(svgCanvas.canApplyLiveEffect(g), false)
      assert.equal(svgCanvas.canApplyLiveEffect(null), false)
    })

    it('is exclusive with taper and corner radius, and they with it', function () {
      const a = addRect('a')
      a.setAttribute('se:taper-d', 'M0,0 L1,1')
      assert.equal(svgCanvas.canApplyLiveEffect(a), false)
      const b = addRect('b')
      b.setAttribute('se:orig-d', 'M0,0 L1,1')
      assert.equal(svgCanvas.canApplyLiveEffect(b), false)

      const p = svgCanvas.addSVGElementsFromJson({
        element: 'path', attr: { id: 'p1', d: 'M0,0 L10,0 L10,10 Z', stroke: '#000', fill: 'none' }
      })
      assert.equal(svgCanvas.canRoundCorners(p), true)
      p.setAttribute(FX_SOURCE_ATTR, 'M0,0 L10,0 L10,10 Z')
      assert.equal(svgCanvas.canRoundCorners(p), false)
      assert.equal(svgCanvas.canTaperStroke(p), false)
    })
  })

  describe('apply / remove / expand', function () {
    it('applies to a rect: swaps in a <path> with se:fx / se:fx-d and keeps the id', function () {
      const rect = addRect()
      select(rect)
      const out = svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25, dy: 0 } }])
      assert.equal(out.tagName, 'path')
      assert.equal(out.id, 'r1')
      assert.equal(out.getAttribute('fill'), '#f00')
      assert.equal(out.getAttribute(FX_ATTR), 'fxshift(dx=25,dy=0)')
      assert.equal(out.getAttribute(FX_SOURCE_ATTR), 'M10,20 L110,20 L110,70 L10,70 L10,20 Z')
      assert.ok(out.getAttribute('d').startsWith('M35,20'))
      assert.equal(svgCanvas.getSvgContent().querySelectorAll('rect#r1').length, 0)
    })

    it('is a single undo step and undo restores the rect exactly', function () {
      const rect = addRect()
      select(rect)
      const before = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.applyLiveEffects([{ name: 'fxshift' }])
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
      svgCanvas.undoMgr.undo()
      const restored = byId('r1')
      assert.equal(restored.tagName, 'rect')
      assert.equal(restored.getAttribute('x'), '10')
      assert.equal(restored.getAttribute('width'), '100')
      assert.equal(restored.hasAttribute(FX_ATTR), false)
      svgCanvas.undoMgr.redo()
      assert.equal(byId('r1').getAttribute(FX_ATTR), 'fxshift(dx=10,dy=0)')
    })

    it('re-applying a new stack regenerates from the stored source (no compounding)', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const src = byId('r1').getAttribute(FX_SOURCE_ATTR)
      select(byId('r1'))
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 5 } }])
      const el = byId('r1')
      assert.equal(el.getAttribute(FX_SOURCE_ATTR), src)
      assert.ok(el.getAttribute('d').startsWith('M15,20'))
      assert.deepEqual(svgCanvas.getLiveEffects(), [{ name: 'fxshift', params: { dx: 5, dy: 0 } }])
    })

    it('an empty or all-unknown stack removes the effects instead', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift' }])
      select(byId('r1'))
      svgCanvas.applyLiveEffects([{ name: 'nope' }])
      const el = byId('r1')
      assert.equal(el.hasAttribute(FX_ATTR), false)
      assert.equal(el.hasAttribute(FX_SOURCE_ATTR), false)
    })

    it('remove restores the source geometry as one undo step; undo restores attrs exactly', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const el = byId('r1')
      const snapshot = { d: el.getAttribute('d'), fx: el.getAttribute(FX_ATTR), src: el.getAttribute(FX_SOURCE_ATTR) }
      select(el)
      const before = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.removeLiveEffects()
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
      assert.equal(el.getAttribute('d'), snapshot.src)
      assert.equal(el.hasAttribute(FX_ATTR), false)
      svgCanvas.undoMgr.undo()
      assert.equal(el.getAttribute('d'), snapshot.d)
      assert.equal(el.getAttribute(FX_ATTR), snapshot.fx)
      assert.equal(el.getAttribute(FX_SOURCE_ATTR), snapshot.src)
    })

    it('expand keeps the baked d, drops the attrs, and is one undo step', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const el = byId('r1')
      const baked = el.getAttribute('d')
      select(el)
      const before = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.expandLiveEffects()
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
      assert.equal(el.getAttribute('d'), baked)
      assert.equal(el.hasAttribute(FX_ATTR), false)
      assert.equal(el.hasAttribute(FX_SOURCE_ATTR), false)
      svgCanvas.undoMgr.undo()
      assert.equal(el.hasAttribute(FX_SOURCE_ATTR), true)
    })

    it('does nothing for unsupported or multi-selections', function () {
      const a = addRect('a')
      const b = addRect('b')
      svgCanvas.selectOnly([a, b], true)
      assert.equal(svgCanvas.applyLiveEffects([{ name: 'fxshift' }]), null)
      assert.equal(byId('a').tagName, 'rect')
    })

    it('converts circles/lines/polygons too', function () {
      const circle = svgCanvas.addSVGElementsFromJson({ element: 'circle', attr: { id: 'c1', cx: 50, cy: 50, r: 20 } })
      select(circle)
      const out = svgCanvas.applyLiveEffects([{ name: 'fxshift' }])
      assert.equal(out.tagName, 'path')
      assert.equal(out.hasAttribute('cx'), false)
      const poly = svgCanvas.addSVGElementsFromJson({ element: 'polygon', attr: { id: 'pg1', points: '0,0 10,0 10,10' } })
      select(poly)
      const out2 = svgCanvas.applyLiveEffects([{ name: 'fxshift' }])
      assert.equal(out2.tagName, 'path')
      assert.ok(out2.getAttribute(FX_SOURCE_ATTR).endsWith('Z'))
      assert.equal(parseAnchors(out2.getAttribute(FX_SOURCE_ATTR))[0].anchors.length, 3)
    })
  })

  describe('preview', function () {
    it('shows the result via a throwaway clone and leaves the element untouched', function () {
      const rect = addRect()
      select(rect)
      const before = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.previewLiveEffects([{ name: 'fxshift', params: { dx: 40 } }])
      const clone = rect.nextElementSibling
      assert.equal(clone.tagName, 'path')
      assert.ok(clone.getAttribute('d').startsWith('M50,20'))
      assert.equal(rect.getAttribute('visibility'), 'hidden')
      assert.equal(clone.hasAttribute('id'), false)
      svgCanvas.previewLiveEffects([{ name: 'fxshift', params: { dx: 60 } }])
      assert.ok(clone.getAttribute('d').startsWith('M70,20'))
      svgCanvas.cancelLiveEffectsPreview()
      assert.equal(clone.isConnected, false)
      assert.equal(rect.hasAttribute('visibility'), false)
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before)
    })

    it('restores a pre-existing visibility value on cancel and on apply', function () {
      const rect = addRect()
      rect.setAttribute('visibility', 'visible')
      select(rect)
      svgCanvas.previewLiveEffects([{ name: 'fxshift' }])
      svgCanvas.cancelLiveEffectsPreview()
      assert.equal(rect.getAttribute('visibility'), 'visible')
      svgCanvas.previewLiveEffects([{ name: 'fxshift' }])
      const out = svgCanvas.applyLiveEffects([{ name: 'fxshift' }])
      assert.equal(out.getAttribute('visibility'), 'visible')
      assert.equal(svgCanvas.getSvgContent().querySelectorAll('path').length, 1)
    })
  })

  describe('geometry remap', function () {
    const remap = (x, y) => ({ x: 2 * x + 10, y: 3 * y + 5 })

    it('transforms the source and regenerates d', function () {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      el.setAttribute(FX_SOURCE_ATTR, 'M0,0 L10,0 L10,10 Z')
      el.setAttribute(FX_ATTR, 'fxshift(dx=4,dy=0)')
      el.setAttribute('d', 'stale')
      remapFxSource(el, remap)
      assert.equal(el.getAttribute(FX_SOURCE_ATTR), 'M10,5 L30,5 L30,35 L10,5 Z')
      // fx params are not rescaled: shifted by the same 4px as before.
      assert.equal(el.getAttribute('d'), 'M14,5 L34,5 L34,35 L14,5 Z')
      assert.equal(isFxCurrent(el), true)
    })

    it('keeps the source in sync after a move so the next edit does not teleport', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const el = byId('r1')
      select(el)
      svgCanvas.moveSelectedElements(30, 40, true)
      assert.equal(el.getAttribute(FX_SOURCE_ATTR), 'M40,60 L140,60 L140,110 L40,110 L40,60 Z')
      assert.equal(isFxCurrent(el), true)
      select(el)
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 5 } }])
      assert.ok(byId('r1').getAttribute('d').startsWith('M45,60'))
    })

    it('leaves d alone when the stack names an unregistered effect', function () {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      el.setAttribute(FX_SOURCE_ATTR, 'M0,0 L10,0')
      el.setAttribute(FX_ATTR, 'ghost(a=1)')
      el.setAttribute('d', 'M10,5 L30,5')
      remapFxSource(el, remap)
      assert.equal(el.getAttribute('d'), 'M10,5 L30,5')
      assert.equal(el.getAttribute(FX_SOURCE_ATTR), 'M10,5 L30,5')
    })
  })

  describe('reconcile', function () {
    it('keeps effects while d matches, including equivalent re-serialisations', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const el = byId('r1')
      assert.equal(svgCanvas.reconcileLiveEffects(el), true)
      el.setAttribute('d', anchorsToD(parseAnchors(el.getAttribute('d'))).replace(/,/g, ' '))
      assert.equal(svgCanvas.reconcileLiveEffects(el), true)
      assert.equal(el.hasAttribute(FX_ATTR), true)
    })

    it('survives the saver rewriting d as rounded relative commands', function () {
      const circle = svgCanvas.addSVGElementsFromJson({ element: 'circle', attr: { id: 'c9', cx: 400, cy: 200, r: 60 } })
      select(circle)
      svgCanvas.applyLiveEffects([{ name: 'fxgrow', params: { amount: -0.2 } }])
      const el = byId('c9')
      // What a save/load pass leaves behind: 2-decimal relative path data.
      el.setAttribute('d', 'm352,200c0,-26.52 21.48,-48 48,-48c26.52,0 48,21.48 48,48c0,26.52 -21.48,48 -48,48c-26.52,0 -48,-21.48 -48,-48z')
      assert.equal(svgCanvas.reconcileLiveEffects(el), true)
      assert.equal(el.hasAttribute(FX_ATTR), true)
    })

    it('drops both attributes once d was edited elsewhere (node editing)', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const el = byId('r1')
      const edited = 'M0,0 L5,5 L9,1 Z'
      el.setAttribute('d', edited)
      assert.equal(svgCanvas.reconcileLiveEffects(el), false)
      assert.equal(el.hasAttribute(FX_ATTR), false)
      assert.equal(el.hasAttribute(FX_SOURCE_ATTR), false)
      assert.equal(el.getAttribute('d'), edited)
    })

    it('keeps effects it cannot verify (unregistered effect in the stack)', function () {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      el.setAttribute(FX_SOURCE_ATTR, 'M0,0 L10,0')
      el.setAttribute(FX_ATTR, 'ghost(a=1)')
      el.setAttribute('d', 'M3,3 L9,9')
      assert.equal(svgCanvas.reconcileLiveEffects(el), true)
      assert.equal(el.hasAttribute(FX_SOURCE_ATTR), true)
    })

    it('re-applying after a stale edit adopts the edited d as the new source', function () {
      select(addRect())
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 25 } }])
      const el = byId('r1')
      el.setAttribute('d', 'M0,0 L40,0 L40,40 Z')
      select(el)
      svgCanvas.applyLiveEffects([{ name: 'fxshift', params: { dx: 1 } }])
      assert.equal(el.getAttribute(FX_SOURCE_ATTR), 'M0,0 L40,0 L40,40 L0,0 Z')
      assert.ok(el.getAttribute('d').startsWith('M1,0'))
    })
  })
})
