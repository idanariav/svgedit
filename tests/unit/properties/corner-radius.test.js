import { fc, params } from './fc.js'
import { parseAnchors } from '../../../packages/svgcanvas/core/anchor-path.js'
import { pathCorners, cutCorner, cornerSetback, maxCornerRadius } from '../../../packages/svgcanvas/core/corner-radius.js'

const coord = fc.integer({ min: 0, max: 400 })

// A simple closed polygon: distinct points, kept in angular order around their centroid so it can't self-intersect.
const polygon = fc.uniqueArray(fc.record({ x: coord, y: coord }), { minLength: 3, maxLength: 7, selector: (p) => `${p.x},${p.y}` })
  .map((pts) => {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    return [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  })

const toSubpaths = (pts) => parseAnchors(`M${pts.map((p) => `${p.x},${p.y}`).join(' L')} Z`)
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9

describe('corner-radius properties', () => {
  it('all kinds (round / inverted / chamfer) share the same two end points', () => {
    fc.assert(fc.property(polygon, fc.double({ min: 0.5, max: 80, noNaN: true }), (pts, radius) => {
      const corners = pathCorners(toSubpaths(pts))
      for (const c of corners) {
        const cuts = ['r', 'i', 'c'].map((k) => cutCorner(c, radius, k))
        fc.pre(cuts.every(Boolean))
        const [r, i, ch] = cuts
        expect(near(r[0].p, i[0].p) && near(r[0].p, ch[0].p)).toBe(true)
        expect(near(r[1].p, i[1].p) && near(r[1].p, ch[1].p)).toBe(true)
      }
    }), params())
  })

  it('the cut stays on the two sides and never eats more than half of either', () => {
    fc.assert(fc.property(polygon, fc.double({ min: 0.5, max: 400, noNaN: true }), (pts, radius) => {
      for (const c of pathCorners(toSubpaths(pts))) {
        const t = cornerSetback(c, radius)
        expect(t).toBeLessThanOrEqual(c.lu / 2 + 1e-9)
        expect(t).toBeLessThanOrEqual(c.lv / 2 + 1e-9)
      }
    }), params())
  })

  it('a radius beyond maxCornerRadius is clamped to the same cut as maxCornerRadius', () => {
    fc.assert(fc.property(polygon, (pts) => {
      for (const c of pathCorners(toSubpaths(pts))) {
        const max = maxCornerRadius(c)
        expect(cornerSetback(c, max * 5)).toBeCloseTo(cornerSetback(c, max), 6)
      }
    }), params())
  })
})
