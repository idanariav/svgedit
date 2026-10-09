import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { getLiveEffectDef, resolveParams, computeFxD, FX_ATTR, FX_STYLE_ATTR } from '../../packages/svgcanvas/core/live-effects.js'
import { registerDistortEffects } from '../../packages/svgcanvas/core/live-effects-distort.js'
import { parseAnchors, anchorBBox, anchorsToD } from '../../packages/svgcanvas/core/anchor-path.js'

registerDistortEffects()

/**
 * Run a registered effect over path data with the given params.
 * @param {string} name
 * @param {string} d
 * @param {Object} [params]
 * @returns {Array} resulting subpaths
 */
const run = (name, d, params = {}) => {
  const def = getLiveEffectDef(name)
  const sps = parseAnchors(d)
  return def.apply(sps, anchorBBox(sps), resolveParams(def, params))
}
const pts = (sps) => sps.flatMap((sp) => sp.anchors.map((a) => a.p))
const close = (a, b, eps = 1e-6) => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`)

const SQUARE = 'M0,0 L100,0 L100,100 L0,100 Z'
const CURVY = 'M0,0 C0,60 100,60 100,0 L50,-80 Z M200,0 L260,0 L260,60'

describe('live-effects-distort', function () {
  it('registers all seven effects with defaults and labels', function () {
    for (const name of ['roughen', 'zigZag', 'puckerBloat', 'twist', 'tweak', 'roundCorners', 'scribble']) {
      const def = getLiveEffectDef(name)
      assert.ok(def, name)
      assert.ok(def.label)
      assert.ok(Object.keys(def.defaults).length)
    }
  })

  describe('structure', function () {
    it('keeps subpath count and closedness for the geometry-preserving effects', function () {
      for (const [name, params] of [['roughen', { seed: 3 }], ['zigZag', {}], ['puckerBloat', {}], ['twist', {}], ['tweak', { seed: 3 }], ['roundCorners', {}]]) {
        const out = run(name, CURVY, params)
        assert.equal(out.length, 2, name)
        assert.deepEqual(out.map((sp) => sp.closed), [true, false], name)
      }
    })

    it('output is always finite and serialisable', function () {
      for (const name of ['roughen', 'zigZag', 'puckerBloat', 'twist', 'tweak', 'roundCorners']) {
        const d = computeFxD(CURVY, [{ name, params: { seed: 9 } }])
        assert.ok(d, name)
        assert.doesNotMatch(d, /NaN|Infinity/)
      }
    })
  })

  describe('roughen', function () {
    it('is deterministic for a fixed seed and differs between seeds', function () {
      const a = anchorsToD(run('roughen', SQUARE, { seed: 5 }))
      assert.equal(a, anchorsToD(run('roughen', SQUARE, { seed: 5 })))
      assert.notEqual(a, anchorsToD(run('roughen', SQUARE, { seed: 6 })))
    })

    it('displaces points by at most size (px, relative=false)', function () {
      const out = run('roughen', SQUARE, { size: 4, relative: false, detail: 20, points: 'corner', seed: 1 })
      // Every resampled point lies within `size` of the square's outline.
      for (const p of pts(out)) {
        const onEdge = Math.min(Math.abs(p.x), Math.abs(p.x - 100), Math.abs(p.y), Math.abs(p.y - 100))
        assert.isBelow(onEdge, 4 + 1e-9)
      }
      assert.ok(out[0].anchors.length > 8)
    })

    it('relative size is a percentage of the mean bbox side', function () {
      const out = run('roughen', SQUARE, { size: 10, relative: true, detail: 20, points: 'corner', seed: 1 })
      for (const p of pts(out)) {
        const onEdge = Math.min(Math.abs(p.x), Math.abs(p.x - 100), Math.abs(p.y), Math.abs(p.y - 100))
        assert.isBelow(onEdge, 10 + 1e-9) // 10% of 100
      }
    })

    it('size 0 only resamples', function () {
      const out = run('roughen', 'M0,0 L96,0', { size: 0, detail: 10, points: 'corner' })
      // 96px at 9.6px spacing → 10 points + the end.
      assert.equal(out[0].anchors.length, 11)
      for (const p of pts(out)) close(p.y, 0)
    })

    it('corner mode has no handles, smooth mode has', function () {
      const corner = run('roughen', SQUARE, { points: 'corner', seed: 1 })
      assert.ok(corner[0].anchors.every((a) => a.hIn.x === a.p.x && a.hOut.y === a.p.y))
      const smooth = run('roughen', SQUARE, { points: 'smooth', seed: 1 })
      assert.ok(smooth[0].anchors.some((a) => a.hOut.x !== a.p.x || a.hOut.y !== a.p.y))
    })
  })

  describe('zigZag', function () {
    it('a 100x0 line with ridges=4 gives 5 points per segment plus the end, alternating ±size', function () {
      const out = run('zigZag', 'M0,0 L100,0', { size: 10, ridges: 4, points: 'corner', relative: false })
      const p = pts(out)
      assert.equal(p.length, 6)
      p.forEach((q, i) => {
        close(Math.abs(q.y), 10)
        if (i > 0) assert.notEqual(Math.sign(q.y), Math.sign(p[i - 1].y))
      })
      // evenly spaced along the line
      close(p[1].x - p[0].x, 20)
      close(p[4].x - p[3].x, 20)
      close(p[5].x, 100)
    })

    it('closed shapes stay closed with ridges*segments extra points', function () {
      const out = run('zigZag', SQUARE, { ridges: 2, points: 'corner' })
      assert.ok(out[0].closed)
      assert.equal(out[0].anchors.length, 4 * 3)
    })

    it('ridges=0 on a line only displaces the endpoints', function () {
      const out = run('zigZag', 'M0,0 L100,0', { size: 5, ridges: 0, points: 'corner' })
      assert.equal(out[0].anchors.length, 2)
    })
  })

  describe('puckerBloat', function () {
    it('amount 0 is the identity', function () {
      const sps = parseAnchors(CURVY)
      const def = getLiveEffectDef('puckerBloat')
      assert.equal(def.apply(sps, anchorBBox(sps), { amount: 0 }), sps)
    })

    it('moves anchors toward the centre for positive amounts and gives lines handles', function () {
      const out = run('puckerBloat', SQUARE, { amount: 100 })
      // anchors pulled halfway toward (50,50): (0,0) → (25,25)
      close(out[0].anchors[0].p.x, 25)
      close(out[0].anchors[0].p.y, 25)
      // handle that started at 1/3 along the first edge ends up pushed away
      assert.notDeepEqual(out[0].anchors[0].hOut, out[0].anchors[0].p)
    })

    it('negative amounts move anchors away from the centre', function () {
      const out = run('puckerBloat', SQUARE, { amount: -100 })
      close(out[0].anchors[0].p.x, -25)
    })
  })

  describe('twist', function () {
    it('angle 0 is the identity', function () {
      const sps = parseAnchors(SQUARE)
      const def = getLiveEffectDef('twist')
      assert.equal(def.apply(sps, anchorBBox(sps), { angle: 0 }), sps)
    })

    it('leaves points at or beyond the bbox circle unchanged and moves interior ones', function () {
      // Corners of the square are exactly at the falloff radius (diag/2) → fixed.
      const out = run('twist', SQUARE, { angle: 90 })
      const corners = out[0].anchors.filter((a) => [0, 100].includes(Math.round(a.p.x)) && [0, 100].includes(Math.round(a.p.y)))
      assert.ok(corners.length >= 4)
      for (const c of corners.slice(0, 4)) {
        assert.isBelow(Math.min(...[[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => Math.hypot(c.p.x - x, c.p.y - y))), 1e-6)
      }
      // The middle of an edge (50,0) is inside the circle → rotated away.
      const moved = out[0].anchors.some((a) => Math.hypot(a.p.x - 50, a.p.y - 0) < 1e-6)
      assert.equal(moved, false)
    })

    it('splits segments into more pieces than the input has anchors', function () {
      assert.ok(run('twist', SQUARE, { angle: 180 })[0].anchors.length > 4)
    })
  })

  describe('tweak', function () {
    it('is deterministic per seed', function () {
      assert.equal(anchorsToD(run('tweak', SQUARE, { seed: 2 })), anchorsToD(run('tweak', SQUARE, { seed: 2 })))
      assert.notEqual(anchorsToD(run('tweak', SQUARE, { seed: 2 })), anchorsToD(run('tweak', SQUARE, { seed: 3 })))
    })

    it('displacement is bounded by h/v (relative to bbox)', function () {
      const out = run('tweak', SQUARE, { h: 10, v: 5, relative: true, in: false, out: false, seed: 4 })
      const orig = parseAnchors(SQUARE)[0].anchors
      out[0].anchors.forEach((a, i) => {
        assert.isBelow(Math.abs(a.p.x - orig[i].p.x), 10 + 1e-9)
        assert.isBelow(Math.abs(a.p.y - orig[i].p.y), 5 + 1e-9)
      })
    })

    it('anchors=false with in/out off changes nothing; handle flags move only their handle', function () {
      const none = run('tweak', SQUARE, { anchors: false, in: false, out: false, seed: 1 })
      assert.equal(anchorsToD(none), anchorsToD(parseAnchors(SQUARE)))
      const outOnly = run('tweak', SQUARE, { anchors: false, in: false, out: true, seed: 1 })
      const a = outOnly[0].anchors[0]
      assert.deepEqual(a.p, { x: 0, y: 0 })
      assert.deepEqual(a.hIn, a.p)
      assert.notDeepEqual(a.hOut, a.p)
    })
  })

  describe('roundCorners', function () {
    it('a square becomes 8 anchors and stays closed', function () {
      const out = run('roundCorners', SQUARE, { radius: 10 })
      assert.ok(out[0].closed)
      assert.equal(out[0].anchors.length, 8)
    })

    it('arc end points sit radius from the corner; radius is capped at half the edge', function () {
      const out = run('roundCorners', SQUARE, { radius: 10 })
      assert.ok(out[0].anchors.some((a) => Math.hypot(a.p.x - 10, a.p.y - 0) < 1e-9))
      const big = run('roundCorners', SQUARE, { radius: 1000 })
      assert.ok(big[0].anchors.some((a) => Math.hypot(a.p.x - 50, a.p.y - 0) < 1e-9))
    })

    it('leaves curved anchors and open-path ends alone', function () {
      const out = run('roundCorners', 'M0,0 L100,0 C150,0 150,100 100,100 L0,100', { radius: 10 })
      const orig = parseAnchors('M0,0 L100,0 C150,0 150,100 100,100 L0,100')[0].anchors
      assert.deepEqual(out[0].anchors[0], orig[0]) // open-path start
      assert.deepEqual(out[0].anchors[out[0].anchors.length - 1], orig[orig.length - 1]) // end
      // anchors (100,0) and (100,100) carry handles → untouched
      assert.ok(out[0].anchors.some((a) => a.p.x === 100 && a.p.y === 0))
      assert.ok(out[0].anchors.some((a) => a.p.x === 100 && a.p.y === 100))
    })

    it('radius 0 is the identity', function () {
      const sps = parseAnchors(SQUARE)
      assert.equal(getLiveEffectDef('roundCorners').apply(sps, anchorBBox(sps), { radius: 0 }), sps)
    })
  })

  describe('scribble', function () {
    it('refuses open paths', function () {
      assert.deepEqual(run('scribble', 'M0,0 L100,0 L100,100'), [])
      assert.equal(computeFxD('M0,0 L100,0 L100,100', [{ name: 'scribble', params: {} }]), null)
    })

    it('hatches a closed shape with one open centerline inside the bbox', function () {
      const out = run('scribble', SQUARE, { angle: 0, spacing: 10, variation: 0, curviness: 0, seed: 1 })
      assert.equal(out.length, 1)
      assert.equal(out[0].closed, false)
      // 100 / 10 = 10 rows × 2 points
      assert.equal(out[0].anchors.length, 20)
      for (const p of pts(out)) {
        assert.ok(p.x >= -1e-9 && p.x <= 100 + 1e-9 && p.y >= 0 && p.y <= 100)
      }
      // snake: second row starts where the first ended
      assert.equal(out[0].anchors[1].p.x, 100)
      assert.equal(out[0].anchors[2].p.x, 100)
      assert.equal(out[0].anchors[3].p.x, 0)
    })

    it('overlap widens the spans past the outline', function () {
      const out = run('scribble', SQUARE, { angle: 0, spacing: 10, variation: 0, curviness: 0, overlap: 5 })
      assert.equal(Math.min(...pts(out).map((p) => p.x)), -5)
      assert.equal(Math.max(...pts(out).map((p) => p.x)), 105)
    })

    it('respects holes (even-odd) and rotation', function () {
      const ring = 'M0,0 L100,0 L100,100 L0,100 Z M40,0 L60,0 L60,100 L40,100 Z'
      const out = run('scribble', ring, { angle: 0, spacing: 50, variation: 0, curviness: 0 })
      // each row has two spans (left strip + right strip) → 4 points per row
      assert.equal(out[0].anchors.length, 4 * 2)
      const rotated = run('scribble', SQUARE, { angle: 45, spacing: 10, variation: 0, curviness: 0 })
      assert.ok(rotated[0].anchors.length > 4)
    })

    it('is deterministic for a fixed seed', function () {
      const a = anchorsToD(run('scribble', SQUARE, { seed: 7 }))
      assert.equal(a, anchorsToD(run('scribble', SQUARE, { seed: 7 })))
      assert.notEqual(a, anchorsToD(run('scribble', SQUARE, { seed: 8 })))
    })
  })

  describe('stroke-output paint swap (scribble on an element)', function () {
    let svgCanvas
    beforeEach(function () {
      document.body.textContent = ''
      const host = document.createElement('div')
      host.id = 'svgcanvas'
      host.style.visibility = 'hidden'
      const workarea = document.createElement('div')
      workarea.id = 'workarea'
      workarea.append(host)
      document.body.append(workarea)
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
    afterEach(function () { document.body.textContent = '' })

    const addRect = () => svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: svgCanvas.getNextId(), x: 10, y: 20, width: 100, height: 50, fill: '#ff0000', stroke: '#00ff00', 'stroke-width': 2 }
    })

    it('repaints as a stroke in the original fill and restores everything on remove / undo', function () {
      const rect = addRect()
      svgCanvas.selectOnly([rect], true)
      const undoBefore = svgCanvas.undoMgr.getUndoStackSize()
      const el = svgCanvas.applyLiveEffects([{ name: 'scribble', params: { strokeWidth: 4, seed: 1 } }])
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), undoBefore + 1)
      assert.equal(el.getAttribute('fill'), 'none')
      assert.equal(el.getAttribute('stroke'), '#ff0000')
      assert.equal(el.getAttribute('stroke-width'), '4')
      assert.equal(el.getAttribute('stroke-linecap'), 'round')
      assert.equal(el.getAttribute(FX_STYLE_ATTR), '#ff0000|#00ff00|2||')

      // Changing the width re-paints from the saved original, not the hatch style.
      svgCanvas.selectOnly([el], true)
      svgCanvas.applyLiveEffects([{ name: 'scribble', params: { strokeWidth: 6, seed: 1 } }])
      assert.equal(el.getAttribute('stroke'), '#ff0000')
      assert.equal(el.getAttribute('stroke-width'), '6')
      assert.equal(el.getAttribute(FX_STYLE_ATTR), '#ff0000|#00ff00|2||')

      svgCanvas.selectOnly([el], true)
      svgCanvas.removeLiveEffects()
      assert.equal(el.getAttribute('fill'), '#ff0000')
      assert.equal(el.getAttribute('stroke'), '#00ff00')
      assert.equal(el.getAttribute('stroke-width'), '2')
      assert.equal(el.hasAttribute('stroke-linecap'), false)
      assert.equal(el.hasAttribute(FX_STYLE_ATTR), false)

      svgCanvas.undoMgr.undo()
      assert.equal(el.getAttribute('fill'), 'none')
      assert.equal(el.getAttribute('stroke-width'), '6')
      assert.equal(el.getAttribute(FX_STYLE_ATTR), '#ff0000|#00ff00|2||')
    })

    it('swapping Scribble for a non-stroke effect restores the paint', function () {
      const rect = addRect()
      svgCanvas.selectOnly([rect], true)
      const el = svgCanvas.applyLiveEffects([{ name: 'scribble', params: {} }])
      svgCanvas.selectOnly([el], true)
      svgCanvas.applyLiveEffects([{ name: 'roughen', params: { seed: 1 } }])
      assert.equal(el.getAttribute('fill'), '#ff0000')
      assert.equal(el.getAttribute('stroke-width'), '2')
      assert.equal(el.hasAttribute(FX_STYLE_ATTR), false)
      assert.match(el.getAttribute(FX_ATTR), /^roughen\(/)
    })

    it('expand keeps the hatch paint and drops the bookkeeping', function () {
      const rect = addRect()
      svgCanvas.selectOnly([rect], true)
      const el = svgCanvas.applyLiveEffects([{ name: 'scribble', params: {} }])
      svgCanvas.selectOnly([el], true)
      svgCanvas.expandLiveEffects()
      assert.equal(el.getAttribute('fill'), 'none')
      assert.equal(el.hasAttribute(FX_STYLE_ATTR), false)
      assert.equal(el.hasAttribute(FX_ATTR), false)
    })

    it('scribble on an open path is refused and changes nothing', function () {
      const path = svgCanvas.addSVGElementsFromJson({
        element: 'path', attr: { id: svgCanvas.getNextId(), d: 'M0,0 L100,0 L100,100', fill: 'none', stroke: '#000' }
      })
      svgCanvas.selectOnly([path], true)
      assert.equal(svgCanvas.applyLiveEffects([{ name: 'scribble', params: {} }]), null)
      assert.equal(path.hasAttribute(FX_ATTR), false)
    })

    it('preview paints the clone as a stroke without touching the element', function () {
      const rect = addRect()
      svgCanvas.selectOnly([rect], true)
      svgCanvas.previewLiveEffects([{ name: 'scribble', params: { strokeWidth: 5 } }])
      const clone = rect.nextElementSibling
      assert.equal(clone.getAttribute('fill'), 'none')
      assert.equal(clone.getAttribute('stroke'), '#ff0000')
      assert.equal(clone.getAttribute('stroke-width'), '5')
      assert.equal(rect.getAttribute('fill'), '#ff0000')
      svgCanvas.previewLiveEffects([{ name: 'roughen', params: {} }])
      assert.equal(clone.getAttribute('fill'), '#ff0000')
      assert.equal(clone.getAttribute('stroke-width'), '2')
      svgCanvas.cancelLiveEffectsPreview()
    })
  })

  describe('save → reload keeps effects editable', function () {
    let svgCanvas
    beforeEach(function () {
      document.body.textContent = ''
      const host = document.createElement('div')
      host.id = 'svgcanvas'
      const workarea = document.createElement('div')
      workarea.id = 'workarea'
      workarea.append(host)
      document.body.append(workarea)
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
    afterEach(function () { document.body.textContent = '' })

    it('closed smooth results (Roughen, Pucker + Twist) still match after the saver rounds d', function () {
      const stacks = [
        [{ name: 'roundCorners', params: { radius: 14 } }, { name: 'roughen', params: { size: 2, seed: 1234 } }],
        [{ name: 'puckerBloat', params: { amount: 40 } }, { name: 'twist', params: { angle: 40 } }],
        [{ name: 'zigZag', params: { size: 6, ridges: 3 } }]
      ]
      const ids = stacks.map((stack, i) => {
        const el = svgCanvas.addSVGElementsFromJson({
          element: 'path',
          attr: { id: svgCanvas.getNextId(), d: `M${40 + i * 200},40 L${220 + i * 200},40 L${220 + i * 200},140 L${40 + i * 200},140 Z`, fill: '#00f' }
        })
        svgCanvas.selectOnly([el], true)
        return svgCanvas.applyLiveEffects(stack).id
      })
      svgCanvas.setSvgString(svgCanvas.getSvgString())
      for (const id of ids) {
        const el = svgCanvas.getSvgContent().querySelector(`#${id}`)
        assert.ok(el.hasAttribute('se:fx-d'), `${id} keeps its source`)
        assert.equal(svgCanvas.reconcileLiveEffects(el), true, `${id} still matches its regenerated geometry`)
      }
    })
  })
})
