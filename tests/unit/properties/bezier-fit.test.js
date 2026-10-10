import { fc, params } from './fc.js'
import { evalCubic } from '../../../packages/svgcanvas/core/anchor-path.js'
import { fitCubics, startTangent, endTangent, unit } from '../../../packages/svgcanvas/core/bezier-fit.js'

const coord = fc.integer({ min: -300, max: 300 })
const cubic = fc.record({
  p0: fc.record({ x: coord, y: coord }),
  p1: fc.record({ x: coord, y: coord }),
  p2: fc.record({ x: coord, y: coord }),
  p3: fc.record({ x: coord, y: coord })
}).filter((c) => Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) > 20)

const sample = (c, n) => Array.from({ length: n }, (_, i) => evalCubic(c, i / (n - 1)))
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// True distance from p to a cubic: coarse scan, then ternary-search the best bracket
// (a fixed-step scan over-estimates by up to half a step, which is more than the tolerance).
const distanceToCurve = (p, c) => {
  const N = 64
  let bestI = 0
  let best = Infinity
  for (let i = 0; i <= N; i++) {
    const d = dist(p, evalCubic(c, i / N))
    if (d < best) { best = d; bestI = i }
  }
  let lo = Math.max(0, (bestI - 1) / N)
  let hi = Math.min(1, (bestI + 1) / N)
  for (let k = 0; k < 40; k++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (dist(p, evalCubic(c, m1)) < dist(p, evalCubic(c, m2))) hi = m2
    else lo = m1
  }
  return Math.min(best, dist(p, evalCubic(c, (lo + hi) / 2)))
}

const distanceToChain = (p, chain) => Math.min(...chain.map((c) => distanceToCurve(p, c)))

describe('bezier-fit properties', () => {
  const run = (src, n, tol) => {
    const pts = sample(src, n)
    const t0 = unit({ x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y })
    const t1 = unit({ x: pts[n - 1].x - pts[n - 2].x, y: pts[n - 1].y - pts[n - 2].y })
    return { pts, t0, t1, chain: t0 && t1 ? fitCubics(pts, t0, t1, tol) : [] }
  }

  it('the fitted chain starts and ends exactly on the first and last samples', () => {
    fc.assert(fc.property(cubic, fc.integer({ min: 8, max: 40 }), (src, n) => {
      const { pts, chain } = run(src, n, 1)
      fc.pre(chain.length > 0)
      expect(dist(chain[0].p0, pts[0])).toBeLessThan(1e-9)
      expect(dist(chain[chain.length - 1].p3, pts[n - 1])).toBeLessThan(1e-9)
    }), params())
  })

  it('consecutive cubics join (C0) and are tangent-continuous (G1)', () => {
    fc.assert(fc.property(cubic, fc.integer({ min: 12, max: 40 }), (src, n) => {
      const { chain } = run(src, n, 0.25)
      for (let i = 1; i < chain.length; i++) {
        expect(dist(chain[i - 1].p3, chain[i].p0)).toBeLessThan(1e-9)
        const a = endTangent(chain[i - 1])
        const b = startTangent(chain[i])
        fc.pre(a && b)
        expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 3) // parallel
        expect(a.x * b.x + a.y * b.y).toBeGreaterThan(0) // same direction
      }
    }), params())
  })

  it('every input point lies within the tolerance of the fitted curve', () => {
    fc.assert(fc.property(cubic, fc.integer({ min: 8, max: 40 }), fc.constantFrom(0.5, 1, 2), (src, n, tol) => {
      const { pts, chain } = run(src, n, tol)
      fc.pre(chain.length > 0)
      // The fit's own metric measures at the point's curve parameter, so the true
      // (nearest-point) distance can only be smaller.
      for (const p of pts) expect(distanceToChain(p, chain)).toBeLessThanOrEqual(tol + 1e-6)
    }), params(60))
  })
})
