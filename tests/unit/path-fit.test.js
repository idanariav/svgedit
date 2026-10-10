import { describe, it, expect } from 'vitest'
import { parseAnchors, anchorsToD, flattenSubpaths, isLineSegment, segmentCount, sameAnchorGeometry } from '../../packages/svgcanvas/core/anchor-path.js'
import { simplifyWith, fitFreehand } from '../../packages/svgcanvas/core/path-fit.js'

const P = (x, y) => ({ x, y })
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/** Distance from `p` to the polyline `pts`. */
const distToPolyline = (p, pts) => {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0
    best = Math.min(best, dist(p, P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)))
  }
  return best
}
/** Largest distance from any of `from` to the flattened `subpaths`. */
const deviation = (from, subpaths) => {
  const flat = flattenSubpaths(subpaths).flatMap((s) => s.pts)
  return Math.max(...from.map((p) => distToPolyline(p, flat)))
}
const corners = (sp) => sp.anchors.filter((a, i) => {
  const hasHandle = (a.hIn.x !== a.p.x || a.hIn.y !== a.p.y || a.hOut.x !== a.p.x || a.hOut.y !== a.p.y)
  return !hasHandle && i > 0 && i < sp.anchors.length - 1
})

/** How sharply (degrees) the path turns at anchor `i`: along its handles, or towards its neighbours when it has none. */
const turnAt = (sp, i) => {
  const a = sp.anchors[i]
  const prev = sp.anchors[i - 1]
  const next = sp.anchors[i + 1]
  const same = (u, v) => u.x === v.x && u.y === v.y
  const from = same(a.hIn, a.p) ? prev.p : a.hIn
  const to = same(a.hOut, a.p) ? next.p : a.hOut
  const u = P(a.p.x - from.x, a.p.y - from.y)
  const v = P(to.x - a.p.x, to.y - a.p.y)
  return Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180 / Math.PI
}

const dense = (a, b, step = 1) => {
  const n = Math.max(1, Math.round(dist(a, b) / step))
  return Array.from({ length: n }, (_, i) => P(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n))
}
const polyOf = (verts, closed = false) => {
  const pts = []
  const n = closed ? verts.length : verts.length - 1
  for (let i = 0; i < n; i++) pts.push(...dense(verts[i], verts[(i + 1) % verts.length]))
  if (!closed) pts.push(verts[verts.length - 1])
  return pts
}
const polylineSubpath = (pts, closed = false) => ({
  closed,
  anchors: pts.map((p) => ({ p, hIn: { ...p }, hOut: { ...p } }))
})

describe('simplifyWith', () => {
  it('turns a dense open polyline with sharp corners into a few line segments, keeping every corner', () => {
    const verts = [P(0, 0), P(100, 0), P(100, 60), P(30, 60), P(30, 10)]
    const input = polyOf(verts)
    const [out] = simplifyWith([polylineSubpath(input)], { tolerance: 1 })
    expect(input.length).toBeGreaterThan(200)
    expect(out.anchors.length).toBe(5)
    verts.forEach((v, i) => expect(dist(out.anchors[i].p, v)).toBeLessThan(0.5))
    for (let i = 0; i < segmentCount(out); i++) expect(isLineSegment(out.anchors[i], out.anchors[i + 1])).toBe(true)
  })

  it('does not round off a sharp turn (the whole point over paper.js simplify)', () => {
    const input = polyOf([P(0, 0), P(50, 40), P(100, 0)]) // a 70-degree-off-straight apex
    const [out] = simplifyWith([polylineSubpath(input)], { tolerance: 2 })
    expect(out.anchors.length).toBe(3)
    expect(dist(out.anchors[1].p, P(50, 40))).toBeLessThan(0.5)
    expect(deviation(input, [out])).toBeLessThan(0.5)
  })

  it('a turn gentler than the threshold is smoothed through, a sharper one is kept', () => {
    const gentle = polyOf([P(0, 0), P(100, 0), P(200, 20)]) // ~11 degrees
    const [smooth] = simplifyWith([polylineSubpath(gentle)], { tolerance: 3, cornerAngleDeg: 30 })
    expect(smooth.anchors.length).toBeLessThanOrEqual(3)
    expect(deviation(gentle, [smooth])).toBeLessThan(3.5)
    const sharp = polyOf([P(0, 0), P(100, 0), P(130, 80)])
    const [kept] = simplifyWith([polylineSubpath(sharp)], { tolerance: 3, cornerAngleDeg: 30 })
    expect(corners({ anchors: [kept.anchors[0], kept.anchors[1], kept.anchors[2]] }).length).toBe(1)
    const [loose] = simplifyWith([polylineSubpath(sharp)], { tolerance: 3, cornerAngleDeg: 80 })
    expect(deviation(sharp, [loose])).toBeLessThan(3.5)
  })

  it('refits a dense circle with a handful of cubics within the tolerance', () => {
    const circle = Array.from({ length: 360 }, (_, i) => P(100 + 80 * Math.cos(i * Math.PI / 180), 100 + 80 * Math.sin(i * Math.PI / 180)))
    const input = [...circle, circle[0]]
    const [out] = simplifyWith([polylineSubpath(input)], { tolerance: 0.5 })
    expect(out.anchors.length).toBeLessThanOrEqual(12)
    expect(deviation(input, [out])).toBeLessThan(0.75)
  })

  it('collinear points collapse to one straight segment', () => {
    const [out] = simplifyWith([polylineSubpath(dense(P(0, 0), P(200, 50)).concat([P(200, 50)]))], { tolerance: 1 })
    expect(out.anchors.length).toBe(2)
    expect(isLineSegment(out.anchors[0], out.anchors[1])).toBe(true)
  })

  it('keeps a closed polygon closed, with its corners', () => {
    const verts = [P(0, 0), P(80, 0), P(80, 50), P(0, 50)]
    const [out] = simplifyWith([polylineSubpath(polyOf(verts, true), true)], { tolerance: 1 })
    expect(out.closed).toBe(true)
    expect(out.anchors.length).toBe(4)
    for (const v of verts) expect(out.anchors.some((a) => dist(a.p, v) < 0.5)).toBe(true)
  })

  it('never adds anchors: an already minimal path comes back unchanged', () => {
    const sub = parseAnchors('M0,0 C 30,60 70,60 100,0')
    const [out] = simplifyWith(sub, { tolerance: 0.5 })
    expect(out.anchors.length).toBe(2)
    expect(sameAnchorGeometry([out], sub, 0.05)).toBe(true) // refit, not rewritten: within a hundredth of a unit
    const line = parseAnchors('M0,0 L 100,0')
    expect(anchorsToD(simplifyWith(line, { tolerance: 0.5 }))).toBe(anchorsToD(line))
  })

  it('leaves hand-built shapes alone: a star keeps its ten corners, a rounded rectangle its eight anchors', () => {
    const star = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 40 : 100
      const a = -Math.PI / 2 + i * Math.PI / 5
      return P(150 + r * Math.cos(a), 150 + r * Math.sin(a))
    })
    const starD = `M${star.map((p) => `${p.x},${p.y}`).join(' L')} Z`
    const [s] = simplifyWith(parseAnchors(starD), { tolerance: 1.5 })
    expect(s.closed).toBe(true)
    expect(s.anchors.length).toBe(10)
    star.forEach((v) => expect(s.anchors.some((a) => dist(a.p, v) < 0.5)).toBe(true))

    const k = 0.5523 * 20
    const rrectD = `M20,0 L80,0 C${80 + k},0 100,${20 - k} 100,20 L100,60 C100,${60 + k} ${80 + k},80 80,80 L20,80 C${20 - k},80 0,${60 + k} 0,60 L0,20 C0,${20 - k} ${20 - k},0 20,0 Z`
    const input = parseAnchors(rrectD)
    const [r] = simplifyWith(input, { tolerance: 1 })
    expect(r.anchors.length).toBeLessThanOrEqual(input[0].anchors.length)
    const sampled = flattenSubpaths(input).flatMap((x) => x.pts)
    expect(deviation(sampled, [r])).toBeLessThan(1.1)
  })

  it('handles several subpaths and empty ones', () => {
    const out = simplifyWith([polylineSubpath(polyOf([P(0, 0), P(50, 0), P(50, 50)])), { closed: false, anchors: [] }, polylineSubpath([P(5, 5)])], { tolerance: 1 })
    expect(out.length).toBe(3)
    expect(out[0].anchors.length).toBe(3)
    expect(out[1].anchors.length).toBe(0)
    expect(out[2].anchors.length).toBe(1)
  })
})

describe('fitFreehand', () => {
  const noisy = (pts, amount = 0.6) => pts.map((p, i) => P(p.x + Math.sin(i * 1.7) * amount, p.y + Math.cos(i * 2.3) * amount))

  it('a nearly straight stroke becomes one straight segment between its end points', () => {
    const stroke = noisy(dense(P(0, 0), P(200, 20), 2)).concat([P(200, 20)])
    const out = fitFreehand(stroke, 2)
    expect(out.anchors.length).toBe(2)
    expect(out.anchors[0].p).toEqual(stroke[0])
    expect(out.anchors[1].p).toEqual(stroke[stroke.length - 1])
  })

  it('keeps a sharp turn of the pen as an exact corner', () => {
    // up the left side and sharply back down the right: a ~130 degree turn at the apex
    const stroke = polyOf([P(0, 100), P(60, 0), P(120, 100)]).map((p, i) => (i === 0 ? p : P(p.x + Math.sin(i * 1.7) * 0.2, p.y + Math.cos(i * 2.3) * 0.2))).concat([P(120, 100)])
    const out = fitFreehand(stroke, 2)
    const apex = out.anchors.find((a) => dist(a.p, P(60, 0)) < 3)
    expect(apex).toBeTruthy()
    // a corner: the curve arrives and leaves in sharply different directions
    expect(turnAt(out, out.anchors.indexOf(apex))).toBeGreaterThan(90)
    expect(dist(apex.p, P(60, 0))).toBeLessThan(1)
    expect(out.anchors.length).toBeLessThanOrEqual(4)
  })

  // What an editor's stabiliser and curve capture hand over: ~0.4 apart, the tip already rounded off.
  const denseRoundedV = (turnDeg = 130, radius = 3) => {
    const half = (180 - turnDeg) / 2 * Math.PI / 180 // half the opening angle
    const legLen = 150
    const tip = P(200, 60)
    const dirL = P(-Math.sin(half), Math.cos(half))
    const dirR = P(Math.sin(half), Math.cos(half))
    const setback = radius / Math.tan(half)
    const left = P(tip.x + dirL.x * legLen, tip.y + dirL.y * legLen)
    const right = P(tip.x + dirR.x * legLen, tip.y + dirR.y * legLen)
    const a = P(tip.x + dirL.x * setback, tip.y + dirL.y * setback)
    const b = P(tip.x + dirR.x * setback, tip.y + dirR.y * setback)
    const centre = P(tip.x, tip.y + radius / Math.sin(half))
    const a0 = Math.atan2(a.y - centre.y, a.x - centre.x)
    const a1 = Math.atan2(b.y - centre.y, b.x - centre.x)
    const arc = Array.from({ length: 12 }, (_, i) => {
      const t = a0 + (a1 - a0) * (i + 1) / 13
      return P(centre.x + radius * Math.cos(t), centre.y + radius * Math.sin(t))
    })
    return { stroke: [...dense(left, a, 0.4), a, ...arc, b, ...dense(b, right, 0.4), right], tip }
  }

  it('keeps a sharp turn as a corner even when the points are dense and the tip is already rounded', () => {
    const { stroke, tip } = denseRoundedV()
    expect(stroke.length).toBeGreaterThan(700)
    const out = fitFreehand(stroke, 2)
    expect(out.anchors.length).toBeLessThanOrEqual(5)
    const at = out.anchors.findIndex((a) => dist(a.p, tip) < 5)
    expect(at).toBeGreaterThan(0)
    expect(turnAt(out, at)).toBeGreaterThan(90)
    expect(deviation(stroke, [out])).toBeLessThan(2.5)
  })

  it('does not invent corners on dense smooth curves, even tight ones', () => {
    const wave = Array.from({ length: 1200 }, (_, i) => P(i * 0.4, 30 * Math.sin(i / 60)))
    const out = fitFreehand(wave, 2)
    expect(out.anchors.length).toBeLessThan(14)
    expect(deviation(wave, [out])).toBeLessThan(2.5)
    // a circle of radius 12 (tight, but smooth) stays round: no anchor is a corner
    const circle = Array.from({ length: 400 }, (_, i) => P(100 + 12 * Math.cos(i / 400 * 2 * Math.PI * 0.9), 100 + 12 * Math.sin(i / 400 * 2 * Math.PI * 0.9)))
    const ring = fitFreehand(circle, 2)
    expect(deviation(circle, [ring])).toBeLessThan(2.5)
    expect(corners({ anchors: [P(0, 0), ...ring.anchors, P(0, 0)].map((a) => a.p ? a : { p: a, hIn: a, hOut: a }) }).length).toBe(0)
  })

  it('a zigzag of dense points keeps every turn', () => {
    const verts = [P(0, 0), P(60, 80), P(120, 0), P(180, 80), P(240, 0)]
    const stroke = polyOf(verts).map((p, i) => P(p.x + Math.sin(i * 0.9) * 0.3, p.y))
    const out = fitFreehand(stroke, 2)
    for (const v of verts.slice(1, -1)) expect(out.anchors.some((a) => dist(a.p, v) < 4)).toBe(true)
    expect(out.anchors.length).toBeLessThanOrEqual(7)
  })

  it('a noise-free sharp stroke is exact straight segments', () => {
    const stroke = polyOf([P(0, 100), P(60, 0), P(120, 100)])
    expect(anchorsToD([fitFreehand(stroke, 2)])).toBe('M0,100 L60,0 L120,100')
  })

  it('a right-angle turn stays within the fidelity of the pen path (a gentle corner is held to the tolerance, not razored)', () => {
    const stroke = noisy(polyOf([P(0, 0), P(100, 0), P(100, 100)]).filter((_, i) => i % 2 === 0)).concat([P(100, 100)])
    const out = fitFreehand(stroke, 2)
    expect(out.anchors.length).toBeLessThanOrEqual(5)
    expect(deviation(stroke, [out])).toBeLessThan(2.5)
    expect(Math.min(...flattenSubpaths([out]).flatMap((x) => x.pts).map((p) => dist(p, P(100, 0))))).toBeLessThan(2.5)
  })

  it('a wavy stroke is smoothed with far fewer anchors than points and stays within the fidelity', () => {
    const stroke = Array.from({ length: 200 }, (_, i) => P(i * 2, 40 * Math.sin(i / 20)))
    const out = fitFreehand(stroke, 2)
    expect(out.anchors.length).toBeLessThan(15)
    expect(deviation(stroke, [out])).toBeLessThan(2.5)
    expect(out.anchors[0].p).toEqual(stroke[0])
    expect(out.anchors[out.anchors.length - 1].p).toEqual(stroke[199])
  })

  it('drops jitter finer than a third of the fidelity', () => {
    const stroke = [P(0, 0), P(0.1, 0.1), P(0.2, 0), P(30, 0), P(60, 0)]
    expect(fitFreehand(stroke, 2).anchors.length).toBe(2)
  })

  it('copes with tiny inputs', () => {
    expect(fitFreehand([], 2).anchors.length).toBe(0)
    expect(fitFreehand([P(3, 4)], 2).anchors.length).toBe(1)
    const two = fitFreehand([P(0, 0), P(10, 5)], 2)
    expect(two.anchors.map((a) => a.p)).toEqual([P(0, 0), P(10, 5)])
  })

  it('the same stroke fits to the same path', () => {
    const stroke = Array.from({ length: 80 }, (_, i) => P(i * 3, 25 * Math.sin(i / 8)))
    expect(anchorsToD([fitFreehand(stroke, 1.5)])).toBe(anchorsToD([fitFreehand(stroke, 1.5)]))
  })
})
