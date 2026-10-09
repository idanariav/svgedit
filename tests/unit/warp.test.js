import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { WARP_STYLES, warpPoint, warpSubpaths, registerWarpEffect } from '../../packages/svgcanvas/core/warp.js'
import { getLiveEffectDef, computeFxD, parseFxStack, serializeFxStack } from '../../packages/svgcanvas/core/live-effects.js'
import { parseAnchors, anchorBBox, anchorsToD } from '../../packages/svgcanvas/core/anchor-path.js'

registerWarpEffect()

const close = (a, b, eps = 1e-9) => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`)
const B = 0.5

// Value of each style at the box centre for bend 0.5, worked out from the
// Rust formulas (t = 0.5, par = 1 at x = 0).
const CENTRE = {
  arc: [0, 0],
  arcLower: [0, 0.25],
  arcUpper: [0, -0.25],
  arch: [0, -0.5],
  bulge: [0, 0],
  shellLower: [0, 0.25],
  shellUpper: [0, -0.25],
  flag: [0, 0],
  wave: [0, 0],
  fish: [0, 0],
  rise: [0, 0.25],
  fisheye: [0, 0],
  inflate: [0, 0],
  squeeze: [0, 0],
  twist: [0, 0]
}

const SAMPLES = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0.3, -0.7], [-0.6, 0.2], [0, 1], [1, 0]]

describe('warp', function () {
  describe('warpPoint', function () {
    it('lists all 15 styles', function () {
      assert.equal(WARP_STYLES.length, 15)
      assert.equal(new Set(WARP_STYLES).size, 15)
      assert.deepEqual(Object.keys(CENTRE).sort(), [...WARP_STYLES].sort())
    })

    it('maps the box centre where the Rust formula says', function () {
      for (const style of WARP_STYLES) {
        const [x, y] = warpPoint(style, B, 0, 0, 0, 0)
        close(x, CENTRE[style][0])
        close(y, CENTRE[style][1])
      }
    })

    it('bend 0 with no distortion is the identity for every style', function () {
      for (const style of WARP_STYLES) {
        for (const [x, y] of SAMPLES) {
          const [x2, y2] = warpPoint(style, 0, 0, 0, x, y)
          close(x2, x)
          close(y2, y)
        }
      }
    })

    it('every style is finite over the box and its surroundings', function () {
      for (const style of WARP_STYLES) {
        for (let x = -2; x <= 2; x += 0.25) {
          for (let y = -2; y <= 2; y += 0.25) {
            for (const b of [-1, -0.3, 0.7, 1]) {
              const [x2, y2] = warpPoint(style, b, 0.4, -0.4, x, y)
              assert.ok(Number.isFinite(x2) && Number.isFinite(y2), `${style} b=${b} (${x},${y})`)
            }
          }
        }
      }
    })

    it('arc bends the centre line into a circular arc of equal length', function () {
      const r0 = 2 / Math.PI // sweep = π at bend 1
      for (const x of [-1, -0.5, 0.25, 1]) {
        const [nx, ny] = warpPoint('arc', 1, 0, 0, x, 0)
        close(Math.hypot(nx, ny - r0), r0) // on the circle of radius r0 about (0, r0)
      }
      const [ex, ey] = warpPoint('arc', 1, 0, 0, 1, 0)
      close(ex, r0)
      close(ey, r0)
    })

    it('arc with negative bend mirrors vertically; |bend| < 1e-6 is the identity', function () {
      const [px, py] = warpPoint('arc', 0.6, 0, 0, 0.4, -0.3)
      const [mx, my] = warpPoint('arc', -0.6, 0, 0, 0.4, 0.3)
      close(mx, px)
      close(my, -py)
      assert.deepEqual(warpPoint('arc', 1e-7, 0, 0, 0.4, 0.3), [0.4, 0.3])
    })

    it('unknown styles fall back to arc', function () {
      assert.deepEqual(warpPoint('nonsense', 0.5, 0, 0, 0.4, 0.3), warpPoint('arc', 0.5, 0, 0, 0.4, 0.3))
    })

    it('horizontal / vertical distortion scale y by x and x by y', function () {
      // flag at bend 0 is the identity, so only the distortion acts.
      const [x1, y1] = warpPoint('flag', 0, 1, 0, 1, 1)
      close(x1, 1)
      close(y1, 1.5) // y * (1 + dh * x * 0.5)
      const [x2, y2] = warpPoint('flag', 0, 0, 1, 1, 1)
      close(y2, 1)
      close(x2, 1.5)
      // the scale factor never goes negative
      assert.equal(warpPoint('flag', 0, -1, 0, 3, 1)[1], 0)
    })
  })

  describe('warpSubpaths', function () {
    const params = (over = {}) => ({ style: 'arc', bend: 50, horizontal: 0, vertical: 0, orientation: 'horizontal', ...over })
    const warp = (d, over) => {
      const sps = parseAnchors(d)
      return warpSubpaths(sps, anchorBBox(sps), params(over))
    }
    const flat = (sps) => sps.flatMap((sp) => sp.anchors.map((a) => a.p))
    const transpose = (sps) => sps.map((sp) => ({
      closed: sp.closed,
      anchors: sp.anchors.map((a) => ({
        p: { x: a.p.y, y: a.p.x }, hIn: { x: a.hIn.y, y: a.hIn.x }, hOut: { x: a.hOut.y, y: a.hOut.x }
      }))
    }))

    it('bend 0 leaves the geometry (almost) unchanged for every style', function () {
      const d = 'M10,20 L210,20 L210,100 L10,100 Z'
      for (const style of WARP_STYLES) {
        const out = warp(d, { style, bend: 0 })
        for (const p of flat(out)) {
          // every output anchor lies on the rectangle's outline
          const onEdge = Math.min(Math.abs(p.x - 10), Math.abs(p.x - 210), Math.abs(p.y - 20), Math.abs(p.y - 100))
          assert.isBelow(onEdge, 1e-6, style)
        }
      }
    })

    it('a 200x80 rect warped with Arc 50% visibly arcs and stays closed', function () {
      const out = warp('M0,0 L200,0 L200,80 L0,80 Z')
      assert.equal(out.length, 1)
      assert.ok(out[0].closed)
      assert.ok(out[0].anchors.length > 4)
      // The top edge's midpoint is no longer on y = 0.
      const top = flat(out).filter((p) => p.x > 90 && p.x < 110).map((p) => p.y)
      assert.ok(Math.min(...top) < -1 || Math.max(...top) > 1)
    })

    it('orientation=vertical equals warping the transposed shape', function () {
      const d = 'M0,0 L120,0 L120,60 L40,90 Z'
      for (const style of ['arc', 'flag', 'inflate', 'twist']) {
        const sps = parseAnchors(d)
        const vertical = warpSubpaths(sps, anchorBBox(sps), params({ style, orientation: 'vertical', horizontal: 20 }))
        const t = transpose(sps)
        const viaTranspose = transpose(warpSubpaths(t, anchorBBox(t), params({ style, orientation: 'horizontal', horizontal: 20 })))
        // bbox half-axes swap along with the shape, so the maps coincide
        const a = flat(vertical)
        const b = flat(viaTranspose)
        assert.equal(a.length, b.length)
        a.forEach((p, i) => {
          close(p.x, b[i].x, 1e-6)
          close(p.y, b[i].y, 1e-6)
        })
      }
    })

    it('stays finite for degenerate boxes and bends a flat line', function () {
      const line = flat(warp('M0,0 L100,0'))
      assert.ok(line.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
      assert.ok(Math.max(...line.map((p) => Math.abs(p.y))) > 1)
      const vline = flat(warp('M0,0 L0,100'))
      assert.ok(vline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
      const dot = flat(warp('M5,5 L5,5'))
      assert.ok(dot.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    })

    it('clamps bend and distortion to ±100%', function () {
      assert.equal(anchorsToD(warp('M0,0 L100,50', { bend: 500 })), anchorsToD(warp('M0,0 L100,50', { bend: 100 })))
    })
  })

  describe('registered effect', function () {
    it('registers `warp` with all 15 styles and both orientations', function () {
      const def = getLiveEffectDef('warp')
      assert.ok(def)
      assert.deepEqual(def.choices.style, WARP_STYLES)
      assert.deepEqual(def.choices.orientation, ['horizontal', 'vertical'])
      assert.deepEqual(def.defaults, { style: 'arc', bend: 50, horizontal: 0, vertical: 0, orientation: 'horizontal' })
    })

    it('round-trips through se:fx and rejects unknown styles', function () {
      const str = 'warp(style=shellUpper,bend=-40,horizontal=10,vertical=0,orientation=vertical)'
      const stack = parseFxStack(str)
      assert.equal(serializeFxStack(stack), str)
      assert.equal(parseFxStack('warp(style=bogus)')[0].params.style, 'arc')
    })

    it('computeFxD warps and is undoable on an element', function () {
      document.body.textContent = ''
      const host = document.createElement('div')
      host.id = 'svgcanvas'
      const workarea = document.createElement('div')
      workarea.id = 'workarea'
      workarea.append(host)
      document.body.append(workarea)
      const svgCanvas = new SvgCanvas(host, {
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
      const rect = svgCanvas.addSVGElementsFromJson({
        element: 'rect', attr: { id: svgCanvas.getNextId(), x: 0, y: 0, width: 200, height: 80, fill: '#00f' }
      })
      svgCanvas.selectOnly([rect], true)
      const el = svgCanvas.applyLiveEffects([{ name: 'warp', params: { style: 'arc', bend: 50 } }])
      assert.equal(el.tagName, 'path')
      assert.equal(el.getAttribute('se:fx'), 'warp(style=arc,bend=50,horizontal=0,vertical=0,orientation=horizontal)')
      assert.equal(el.getAttribute('d'), computeFxD(el.getAttribute('se:fx-d'), parseFxStack(el.getAttribute('se:fx'))))
      assert.match(el.getAttribute('d'), /C/)
      svgCanvas.undoMgr.undo()
      assert.equal(svgCanvas.getSvgContent().querySelector('rect').getAttribute('width'), '200')
      document.body.textContent = ''
    })
  })
})
