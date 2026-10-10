import { fc, params } from './fc.js'
import { WARP_STYLES, warpPoint, warpSubpaths } from '../../../packages/svgcanvas/core/warp.js'
import { polyline } from '../../../packages/svgcanvas/core/anchor-path.js'

const unitCoord = fc.double({ min: -1, max: 1, noNaN: true })
const amount = fc.double({ min: -1, max: 1, noNaN: true })
const style = fc.constantFrom(...WARP_STYLES, 'no-such-style')

describe('warp properties', () => {
  it('bend 0 with no distortion is the identity for every style', () => {
    fc.assert(fc.property(style, unitCoord, unitCoord, (s, x, y) => {
      const [x2, y2] = warpPoint(s, 0, 0, 0, x, y)
      expect(x2).toBeCloseTo(x, 9)
      expect(y2).toBeCloseTo(y, 9)
    }), params(200))
  })

  it('never produces a non-finite point, whatever the style and amounts', () => {
    fc.assert(fc.property(style, amount, amount, amount, unitCoord, unitCoord, (s, b, dh, dv, x, y) => {
      const [x2, y2] = warpPoint(s, b, dh, dv, x, y)
      expect(Number.isFinite(x2) && Number.isFinite(y2)).toBe(true)
    }), params(200))
  })

  it('warpSubpaths with bend 0 leaves the outline in place', () => {
    const bbox = { x: 0, y: 0, width: 100, height: 60 }
    fc.assert(fc.property(style, fc.constantFrom('horizontal', 'vertical'), (s, orientation) => {
      const sub = polyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }], true)
      const out = warpSubpaths([sub], bbox, { style: s, bend: 0, horizontal: 0, vertical: 0, orientation })
      const corners = out[0].anchors.map((a) => a.p)
      for (const want of sub.anchors.map((a) => a.p)) {
        expect(corners.some((c) => Math.hypot(c.x - want.x, c.y - want.y) < 1e-6)).toBe(true)
      }
    }), params(60))
  })
})
