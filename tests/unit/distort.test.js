import SvgCanvas from '../../packages/svgcanvas/svgcanvas.ts'
import {
  CORNER_KEYS, IDENTITY_CORNERS, cornersFromParams, paramsFromCorners, distortFrame, isConvexQuad,
  bilinearMap, homographyMap, distortMap, distortSubpaths, registerDistortEffects
} from '../../packages/svgcanvas/core/distort.ts'
import { computeFxD, parseFxStack, getLiveEffectDef } from '../../packages/svgcanvas/core/live-effects.ts'
import { parseAnchors, anchorBBox } from '../../packages/svgcanvas/core/anchor-path.ts'

registerDistortEffects()

const close = (a, b, eps = 1e-9) => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`)
const closePt = (p, q, eps = 1e-9) => {
  close(p.x, q.x, eps)
  close(p.y, q.y, eps)
}

const QUAD = [{ x: 0.1, y: 0.2 }, { x: 1.3, y: -0.1 }, { x: 0.9, y: 1.1 }, { x: -0.2, y: 0.8 }]
const CORNERS_UV = [[0, 0], [1, 0], [1, 1], [0, 1]]

describe('distort', function () {
  describe('params', function () {
    it('the defaults are the identity corners', function () {
      const def = getLiveEffectDef('freeDistort')
      assert.deepEqual(cornersFromParams(def.defaults), IDENTITY_CORNERS)
      assert.deepEqual(Object.keys(def.defaults), CORNER_KEYS)
      assert.deepEqual(def.defaults, getLiveEffectDef('perspective').defaults)
    })

    it('corners <-> params round-trip', function () {
      assert.deepEqual(cornersFromParams(paramsFromCorners(QUAD)), QUAD)
    })
  })

  describe('maps', function () {
    it('identity corners are the identity, bilinear and projective', function () {
      for (const name of ['freeDistort', 'perspective']) {
        const f = distortMap(name, IDENTITY_CORNERS)
        for (const [u, v] of [[0, 0], [1, 1], [0.3, 0.8], [-0.5, 2]]) closePt(f(u, v), { x: u, y: v })
      }
    })

    it('both maps send the four box corners exactly to the new corners', function () {
      for (const map of [bilinearMap(QUAD), homographyMap(QUAD)]) {
        CORNERS_UV.forEach(([u, v], i) => closePt(map(u, v), QUAD[i]))
      }
    })

    it('bilinear and projective agree when the quad is a parallelogram', function () {
      const par = [{ x: 0.2, y: 0.1 }, { x: 1.2, y: 0.3 }, { x: 1.0, y: 1.3 }, { x: 0, y: 1.1 }]
      const a = bilinearMap(par)
      const b = homographyMap(par)
      for (const [u, v] of [[0.5, 0.5], [0.2, 0.9], [0.77, 0.13], [1.5, -0.4]]) closePt(a(u, v), b(u, v), 1e-9)
    })

    it('the projective map keeps straight lines straight; the bilinear one bends a diagonal', function () {
      const trapezoid = [{ x: 0.25, y: 0 }, { x: 0.75, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      const proj = homographyMap(trapezoid)
      const bil = bilinearMap(trapezoid)
      const diag = [0, 0.25, 0.5, 0.75, 1].map((t) => [t, t])
      const collinear = (pts) => {
        const [a, , , , z] = pts
        return pts.every((p) => Math.abs((z.x - a.x) * (p.y - a.y) - (z.y - a.y) * (p.x - a.x)) < 1e-9)
      }
      assert.ok(collinear(diag.map(([u, v]) => proj(u, v))))
      assert.ok(!(collinear(diag.map(([u, v]) => bil(u, v)))))
    })

    it('a perspective of a trapezoid puts the centre of the box off the quad centre (foreshortening)', function () {
      const trapezoid = [{ x: 0.25, y: 0 }, { x: 0.75, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      const c = homographyMap(trapezoid)(0.5, 0.5)
      const b = bilinearMap(trapezoid)(0.5, 0.5)
      close(c.x, 0.5)
      assert.ok(c.y < b.y) // the far (narrow, top) half is compressed on screen: the object's centre sits nearer the far end
    })

    it('a non-convex quad has no homography and perspective falls back to bilinear', function () {
      const bow = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
      assert.ok(!(isConvexQuad(bow)))
      assert.strictEqual(homographyMap(bow), null)
      const f = distortMap('perspective', bow)
      closePt(f(0.5, 0.5), bilinearMap(bow)(0.5, 0.5))
      assert.strictEqual(homographyMap([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }]), null) // collinear
    })

    it('isConvexQuad accepts either winding', function () {
      assert.ok(isConvexQuad(IDENTITY_CORNERS))
      assert.ok(isConvexQuad([...IDENTITY_CORNERS].reverse()))
    })
  })

  describe('distortFrame', function () {
    it('is the box itself for a box with area', function () {
      assert.deepEqual(distortFrame({ x: 5, y: 6, width: 10, height: 20 }), { x: 5, y: 6, w: 10, h: 20 })
    })

    it('a flat box borrows the other axis, centred on the line', function () {
      assert.deepEqual(distortFrame({ x: 0, y: 50, width: 100, height: 0 }), { x: 0, y: 0, w: 100, h: 100 })
      assert.deepEqual(distortFrame({ x: 50, y: 0, width: 0, height: 40 }), { x: 30, y: 0, w: 40, h: 40 })
      assert.deepEqual(distortFrame({ x: 3, y: 4, width: 0, height: 0 }), { x: 3, y: 4, w: 1, h: 1 })
    })
  })

  describe('effects over geometry', function () {
    const run = (name, corners, d = 'M10,20 L110,20 L110,70 L10,70 Z') => {
      const sps = parseAnchors(d)
      return distortSubpaths(name, sps, anchorBBox(sps), paramsFromCorners(corners))
    }

    it('identity corners leave a rectangle where it was', function () {
      for (const name of ['freeDistort', 'perspective']) {
        const out = run(name, IDENTITY_CORNERS)
        const b = anchorBBox(out)
        close(b.x, 10, 1e-6)
        close(b.y, 20, 1e-6)
        close(b.width, 100, 1e-6)
        close(b.height, 50, 1e-6)
      }
    })

    it('moving the top right corner by half a box width stretches the box (VectorCraft test)', function () {
      const out = run('freeDistort', [{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 'M0,0 L100,0 L100,100 L0,100 Z')
      close(anchorBBox(out).x + anchorBBox(out).width, 150, 1e-6)
    })

    it('the box corners land on the unit-box corners of the quad, in document units', function () {
      const out = run('perspective', QUAD)
      const pts = out[0].anchors.map((a) => a.p)
      CORNERS_UV.forEach(([u, v], i) => {
        const want = { x: 10 + QUAD[i].x * 100, y: 20 + QUAD[i].y * 50 }
        assert.ok(pts.some((p) => Math.hypot(p.x - want.x, p.y - want.y) < 1e-6), `corner ${u},${v}`)
      })
    })

    it('a curve is subdivided so the result is not just its mapped anchors', function () {
      const out = run('freeDistort', QUAD, 'M0,0 C0,100 100,100 100,0')
      assert.ok(out[0].anchors.length > 2)
    })

    it('a straight line can be distorted (flat box)', function () {
      const out = run('freeDistort', [{ x: 0, y: 0.3 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 'M0,50 L100,50')
      assert.ok(anchorBBox(out).height > 1)
    })

    it('computeFxD runs the registered effects from a se:fx stack', function () {
      const stack = parseFxStack(`perspective(${CORNER_KEYS.map((k) => `${k}=${paramsFromCorners(QUAD)[k]}`).join(',')})`)
      assert.equal(stack.length, 1)
      assert.match(computeFxD('M0,0 L100,0 L100,100 L0,100 Z', stack), /^M/)
    })
  })

  describe('canvas API for tools', function () {
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
    })

    afterEach(function () {
      document.body.textContent = ''
    })

    const addRect = () => svgCanvas.addSVGElementsFromJson({
      element: 'rect', attr: { id: 'r1', x: 10, y: 20, width: 100, height: 50, fill: '#f00' }
    })
    const tilt = paramsFromCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1.2, y: 1 }, { x: 0.1, y: 1 }])

    it('registers freeDistort and perspective with the canvas', function () {
      const names = svgCanvas.listLiveEffects().map((e) => e.name)
      assert.ok(names.includes('freeDistort'))
      assert.ok(names.includes('perspective'))
    })

    it('getLiveEffectsBox is the source box, before and after the effect', function () {
      const r = addRect()
      assert.deepEqual(svgCanvas.getLiveEffectsBox(r), { x: 10, y: 20, width: 100, height: 50 })
      svgCanvas.beginTransaction('t')
      const path = svgCanvas.applyLiveEffectsTo(r, [{ name: 'perspective', params: tilt }])
      assert.deepEqual(svgCanvas.getLiveEffectsBox(path), { x: 10, y: 20, width: 100, height: 50 })
    })

    it('applyLiveEffectsTo turns a rect into a path inside the caller\'s transaction: one undo step, no re-select', function () {
      const r = addRect()
      svgCanvas.selectOnly([r], true)
      const before = svgCanvas.undoMgr.getUndoStackSize()
      const tx = svgCanvas.beginTransaction('Distort')
      const path = svgCanvas.applyLiveEffectsTo(r, [{ name: 'freeDistort', params: tilt }])
      svgCanvas.applyLiveEffectsTo(path, [{ name: 'freeDistort', params: paramsFromCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1.4, y: 1 }, { x: 0, y: 1 }]) }])
      tx.commit()
      assert.equal(path.tagName, 'path')
      assert.equal(path.id, 'r1')
      assert.equal(path.getAttribute('se:fx').split('(')[0], 'freeDistort')
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
      svgCanvas.undoMgr.undo()
      assert.equal(svgCanvas.getSvgContent().querySelector('#r1').tagName, 'rect')
    })

    it('returns null for an empty stack and for elements that cannot take effects', function () {
      const r = addRect()
      assert.strictEqual(svgCanvas.applyLiveEffectsTo(r, []), null)
      const g = svgCanvas.addSVGElementsFromJson({ element: 'g', attr: { id: 'g1' } })
      assert.strictEqual(svgCanvas.applyLiveEffectsTo(g, [{ name: 'freeDistort' }]), null)
      assert.strictEqual(svgCanvas.getLiveEffectsBox(g), null)
    })

    it('getLiveEffects reads any element, not only the selection', function () {
      const r = addRect()
      svgCanvas.beginTransaction('t')
      const path = svgCanvas.applyLiveEffectsTo(r, [{ name: 'perspective', params: tilt }])
      const stack = svgCanvas.getLiveEffects(path)
      assert.equal(stack[0].name, 'perspective')
      assert.equal(stack[0].params.bottomRightX, 1.2)
    })
  })
})
