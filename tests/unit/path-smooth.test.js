import { describe, it, expect } from 'vitest'
import { parseAnchors, anchorsToD, flattenSubpaths, polyline } from '../../packages/svgcanvas/core/anchor-path.js'
import { markAnchorsNear, smoothRegion } from '../../packages/svgcanvas/core/path-fit.js'

const P = (x, y) => ({ x, y })

const distToPolyline = (p, pts) => {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0
    best = Math.min(best, Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t)))
  }
  return best
}

/** An open path along x with a ±1.5 zig-zag, an anchor every 10 units. */
const jittery = (n = 40) => polyline(Array.from({ length: n }, (_, i) => P(i * 10, (i % 2 ? 1.5 : -1.5))), false)
/** A closed polygon approximating a circle of radius 100. */
const ring = (n = 48) => polyline(Array.from({ length: n }, (_, i) => {
  const a = 2 * Math.PI * i / n
  return P(200 + 100 * Math.cos(a), 200 + 100 * Math.sin(a))
}), true)
const marksFor = (sp, pick) => [sp.anchors.map((a, i) => pick(a, i))]

describe('markAnchorsNear', () => {
  it('marks the anchors within the radius of a drag step, and only adds', () => {
    const sp = jittery()
    const marks = [sp.anchors.map(() => false)]
    expect(markAnchorsNear([sp], marks, P(100, 0), P(200, 0), 3)).toBe(true)
    expect(marks[0].map((m, i) => (m ? i : -1)).filter((i) => i >= 0)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(markAnchorsNear([sp], marks, P(120, 0), P(150, 0), 3)).toBe(false) // nothing new
    expect(markAnchorsNear([sp], marks, P(200, 0), P(220, 0), 3)).toBe(true)
    expect(marks[0].filter(Boolean)).toHaveLength(13)
  })
})

describe('smoothRegion', () => {
  it('returns an untouched subpath as it is', () => {
    const sp = jittery()
    const out = smoothRegion([sp], [sp.anchors.map(() => false)], 2)
    expect(out[0]).toBe(sp)
  })

  it('refits only the marked run: anchors outside it keep their place and the run loses anchors', () => {
    const sp = jittery()
    const [out] = smoothRegion([sp], marksFor(sp, (a) => a.p.x >= 100 && a.p.x <= 200), 2.5)
    expect(out.closed).toBe(false)
    expect(out.anchors.length).toBeLessThan(sp.anchors.length - 5)
    // Everything from x=0..90 and x=210..390 is an anchor of the result, at the same place with the same handles.
    for (const a of sp.anchors.filter((q) => q.p.x <= 90 || q.p.x >= 210)) {
      expect(out.anchors.some((b) => b.p.x === a.p.x && b.p.y === a.p.y)).toBe(true)
    }
    // The ends of the path are not moved.
    expect(out.anchors[0].p).toEqual(sp.anchors[0].p)
    expect(out.anchors.at(-1).p).toEqual(sp.anchors.at(-1).p)
  })

  it('keeps the refit within the tolerance of the original', () => {
    const sp = jittery()
    const tol = 2.5
    const [out] = smoothRegion([sp], marksFor(sp, (a) => a.p.x >= 100 && a.p.x <= 200), tol)
    const flat = flattenSubpaths([out]).flatMap((s) => s.pts)
    for (const a of sp.anchors) expect(distToPolyline(a.p, flat)).toBeLessThanOrEqual(tol + 1e-6)
  })

  it('a bigger tolerance smooths more', () => {
    const sp = jittery()
    const marks = marksFor(sp, () => true)
    const fine = smoothRegion([sp], marks, 0.5)[0].anchors.length
    const coarse = smoothRegion([sp], marks, 4)[0].anchors.length
    expect(coarse).toBeLessThan(fine)
    expect(coarse).toBeLessThan(5)
  })

  it('smooths a run that touches the start of the path and keeps its end points', () => {
    const sp = jittery()
    const [out] = smoothRegion([sp], marksFor(sp, (a) => a.p.x <= 100), 2.5)
    expect(out.anchors[0].p).toEqual(sp.anchors[0].p)
    expect(out.anchors.length).toBeLessThan(sp.anchors.length)
    expect(out.anchors.at(-1).p).toEqual(sp.anchors.at(-1).p)
  })

  it('two runs with one unmarked anchor between them leave that anchor where it was', () => {
    const sp = jittery()
    const [out] = smoothRegion([sp], marksFor(sp, (a) => (a.p.x >= 50 && a.p.x < 150) || (a.p.x > 150 && a.p.x <= 250)), 2.5)
    const keep = sp.anchors.find((a) => a.p.x === 150)
    expect(out.anchors.some((b) => b.p.x === keep.p.x && b.p.y === keep.p.y)).toBe(true)
    expect(out.anchors.length).toBeLessThan(sp.anchors.length)
    // A continuous path: every anchor is finite.
    expect(anchorsToD([out])).not.toMatch(/NaN/)
  })

  it('opens a closed subpath at an unmarked anchor and closes it again', () => {
    const sp = ring()
    const [out] = smoothRegion([sp], marksFor(sp, (a) => a.p.x > 250), 1.5)
    expect(out.closed).toBe(true)
    expect(out.anchors.length).toBeLessThan(sp.anchors.length)
    // The far side (x < 150) is untouched, anchor for anchor.
    for (const a of sp.anchors.filter((q) => q.p.x < 150)) {
      expect(out.anchors.some((b) => Math.abs(b.p.x - a.p.x) < 1e-9 && Math.abs(b.p.y - a.p.y) < 1e-9)).toBe(true)
    }
    expect(anchorsToD([out])).toMatch(/Z$/)
  })

  it('refits a whole closed subpath when every anchor is marked', () => {
    const sp = ring(60)
    const [out] = smoothRegion([sp], marksFor(sp, () => true), 1.5)
    expect(out.closed).toBe(true)
    expect(out.anchors.length).toBeLessThan(sp.anchors.length / 2)
    const flat = flattenSubpaths([out]).flatMap((s) => s.pts)
    for (const a of sp.anchors) expect(distToPolyline(a.p, flat)).toBeLessThanOrEqual(1.5 + 1e-6)
  })

  it('works on parsed path data and leaves other subpaths alone', () => {
    const subs = parseAnchors('M0,0 L10,3 L20,-3 L30,3 L40,-3 L50,0 M0,100 L50,100')
    const marks = [subs[0].anchors.map(() => true), subs[1].anchors.map(() => false)]
    const out = smoothRegion(subs, marks, 4)
    expect(out[1]).toBe(subs[1])
    expect(out[0].anchors.length).toBeLessThan(subs[0].anchors.length)
  })
})
