import { fc, params } from './fc.js'
import { parseAnchors, anchorsToD, evalCubic, splitCubic } from '../../../packages/svgcanvas/core/anchor-path.js'

const int = fc.integer({ min: -500, max: 500 })
const pt = fc.record({ x: int, y: int })

// An anchor with optional handles (a handle equal to its anchor means "none").
const anchor = fc.tuple(pt, fc.option(pt, { nil: null }), fc.option(pt, { nil: null })).map(([p, hi, ho]) => ({
  p, hIn: hi ?? { ...p }, hOut: ho ?? { ...p }
}))

// Consecutive anchors must differ or a zero-length segment is (legitimately) folded away.
const distinctNeighbours = (anchors, closed) => anchors.every((a, i) => {
  const b = anchors[(i + 1) % anchors.length]
  return (i === anchors.length - 1 && !closed) || a.p.x !== b.p.x || a.p.y !== b.p.y
})

const subpath = fc.tuple(fc.array(anchor, { minLength: 3, maxLength: 7 }), fc.boolean())
  .filter(([anchors, closed]) => distinctNeighbours(anchors, closed))
  .map(([anchors, closed]) => {
    // An open subpath has no segment before its first anchor or after its last,
    // so those two handles cannot survive serialisation: they mean nothing.
    if (!closed) {
      const first = anchors[0]
      const last = anchors[anchors.length - 1]
      first.hIn = { ...first.p }
      last.hOut = { ...last.p }
    }
    return { anchors, closed }
  })

const cubic = fc.record({ p0: pt, p1: pt, p2: pt, p3: pt })
const near = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol

describe('anchor-path properties', () => {
  it('parseAnchors(anchorsToD(x)) reproduces x', () => {
    fc.assert(fc.property(fc.array(subpath, { minLength: 1, maxLength: 3 }), (subs) => {
      expect(parseAnchors(anchorsToD(subs))).toEqual(subs)
    }), params())
  })

  it('serialising twice is stable', () => {
    fc.assert(fc.property(fc.array(subpath, { minLength: 1, maxLength: 3 }), (subs) => {
      const d = anchorsToD(subs)
      expect(anchorsToD(parseAnchors(d))).toBe(d)
    }), params())
  })

  it('splitCubic ends on the curve at t0 and t1 (endpoint continuity) and preserves the shape', () => {
    fc.assert(fc.property(
      cubic,
      fc.double({ min: 0, max: 0.95, noNaN: true }),
      fc.double({ min: 0.01, max: 1, noNaN: true }),
      (c, a, b) => {
        const [t0, t1] = a < b ? [a, b] : [b, a]
        fc.pre(t1 - t0 > 0.01)
        const s = splitCubic(c, t0, t1)
        expect(near(s.p0, evalCubic(c, t0), 1e-5)).toBe(true)
        expect(near(s.p3, evalCubic(c, t1), 1e-5)).toBe(true)
        // the middle of the sub-curve is the middle of that parameter range
        expect(near(evalCubic(s, 0.5), evalCubic(c, (t0 + t1) / 2), 1e-4)).toBe(true)
      }
    ), params())
  })
})
