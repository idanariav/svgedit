/**
 * Variable-width strokes: the filled outline of a path stroked with a width profile.
 *
 * Each subpath is flattened, and at every sample the left and right offsets `width/2 · factor(t)` are placed
 * along the normal (`t` = fraction of the subpath's length). Corners of the path take the stroke's miter,
 * round or bevel join on their outer side (smooth points bend round); open subpaths get butt, round or
 * square caps (the round cap blends the two side widths); a closed subpath becomes two loops of opposite
 * orientation, which the non-zero fill rule turns into a ring. Where the offset would fold over itself (a
 * corner sharper than the stroke is wide, a curve tighter than the half-width) only the outer side is
 * joined and the fold is left for the non-zero fill, as VectorCraft does, rather than cleaning the polygon.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/effects/src/stroke/width.rs`
 * (`width_outline`), MIT OR Apache-2.0.
 *
 * @module width-outline
 * @license MIT
 */

import { parseAnchors, segCubic, segmentCount, isLineSegment } from './anchor-path.js'
import { profileAround } from './width-profile.js'

/** @typedef {{x: number, y: number}} Pt */

const EPS = 1e-9
/** Two segments meeting at more than about a degree are a corner of the path, not a smooth point. */
const KINK_COS = 0.9998

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a, k) => ({ x: a.x * k, y: a.y * k })
const dot = (a, b) => a.x * b.x + a.y * b.y
const cross = (a, b) => a.x * b.y - a.y * b.x
const hypot = (a) => Math.hypot(a.x, a.y)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const unit = (a) => {
  const l = hypot(a)
  return l < EPS ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l }
}
/** Left normal in y-down space (left of the direction of travel). */
const left = (t) => ({ x: t.y, y: -t.x })

/** The first non-zero of the vectors, as a direction. */
const firstDir = (...vs) => unit(vs.find((v) => hypot(v) > EPS) ?? { x: 1, y: 0 })

/** Direction a cubic leaves its start / arrives at its end. */
const startDir = (c) => firstDir(sub(c.p1, c.p0), sub(c.p2, c.p0), sub(c.p3, c.p0))
const endDir = (c) => firstDir(sub(c.p3, c.p2), sub(c.p3, c.p1), sub(c.p3, c.p0))

const cubicAt = (c, t) => {
  const u = 1 - t
  const w0 = u * u * u
  const w1 = 3 * u * u * t
  const w2 = 3 * u * t * t
  const w3 = t * t * t
  return {
    x: w0 * c.p0.x + w1 * c.p1.x + w2 * c.p2.x + w3 * c.p3.x,
    y: w0 * c.p0.y + w1 * c.p1.y + w2 * c.p2.y + w3 * c.p3.y
  }
}

/**
 * Flatten an anchor subpath to points, each marked when it is a corner of the path.
 * Consecutive duplicates are dropped; a closed subpath does not repeat its start.
 * @param {import('./anchor-path.js').SubPath} sp
 * @param {number} tol flatness tolerance
 * @returns {{pts: Pt[], corner: boolean[]}}
 */
export const flatten = (sp, tol) => {
  const pts = [sp.anchors[0].p]
  const corner = [false]
  let first = null
  let prev = null
  for (let i = 0; i < segmentCount(sp); i++) {
    const a = sp.anchors[i]
    const b = sp.anchors[(i + 1) % sp.anchors.length]
    const c = segCubic(sp, i)
    const at = pts.length - 1
    const push = (p) => {
      if (dist(pts[pts.length - 1], p) > EPS) {
        pts.push(p)
        corner.push(false)
      }
    }
    if (isLineSegment(a, b)) {
      push(c.p3)
    } else {
      const dd = Math.max(hypot(add(sub(c.p0, mul(c.p1, 2)), c.p2)), hypot(add(sub(c.p1, mul(c.p2, 2)), c.p3)))
      const n = Math.min(400, Math.max(2, Math.ceil(Math.sqrt((0.75 * dd) / tol))))
      for (let k = 1; k <= n; k++) push(k === n ? c.p3 : cubicAt(c, k / n))
    }
    if (pts.length > at + 1) {
      if (prev) corner[at] = dot(endDir(prev), startDir(c)) < KINK_COS
      else first = c
      prev = c
    }
  }
  if (sp.closed) {
    if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= EPS) {
      pts.pop()
      corner.pop()
    }
    if (prev && first) corner[0] = dot(endDir(prev), startDir(first)) < KINK_COS
  }
  return { pts, corner }
}

const length = (pts, closed) => {
  const n = pts.length
  let len = 0
  for (let i = 0; i < (closed ? n : n - 1); i++) len += dist(pts[i], pts[(i + 1) % n])
  return len
}

/**
 * Insert samples where the profile has width points, so the piecewise-linear profile is exact along straight
 * runs (the two points of a discontinuous point share one sample).
 */
const densify = (pts, corner, closed, profile) => {
  const total = length(pts, closed)
  if (total <= 1e-12) return { pts, corner }
  const marks = profile.map((p) => p[0] * total)
  const n = pts.length
  const outPts = []
  const outCorner = []
  let acc = 0
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = dist(a, b)
    outPts.push(a)
    outCorner.push(corner[i])
    const inner = [...new Set(marks.filter((d) => d > acc + 1e-9 && d < acc + len - 1e-9).map((d) => Math.round(d * 1e9) / 1e9))].sort((x, y) => x - y)
    for (const d of inner) {
      const u = (d - acc) / len
      outPts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
      outCorner.push(false)
    }
    acc += len
  }
  if (!closed && n > 0) {
    outPts.push(pts[n - 1])
    outCorner.push(corner[n - 1])
  }
  return { pts: outPts, corner: outCorner }
}

/**
 * @typedef {object} OutlineOptions
 * @property {'butt'|'round'|'square'} [cap]
 * @property {'miter'|'round'|'bevel'} [join]
 * @property {number} [miterLimit]
 * @property {number} [tol] flatness tolerance in user units
 */

/**
 * The offset points at a vertex on one side (`side` 1: left, −1: right), `w` from the path: the join on the
 * outer side of a turn, the inner miter point (or a detour through the vertex when that would overshoot a
 * segment) on the inner side.
 */
const joinPoints = (out, v, w, side, o) => {
  const na = mul(left(v.a), side)
  const nb = mul(left(v.b), side)
  const mid = add(na, nb)
  // Cosine of half the turn; the miter point is `w / c` out along `mid`.
  const c = hypot(mid) / 2
  const miter = () => out.push(add(v.p, mul(mid, w / (2 * c * c))))
  if (w <= 0) {
    out.push(v.p)
  } else if (dot(v.b, na) <= 0) {
    // Outer side: the path turns away from it.
    const excess = c > EPS ? w * (1 / c - 1) : Infinity
    if (excess <= o.tol) miter()
    else if (o.join === 'miter' && v.corner && 1 / c <= o.miterLimit) miter()
    else if ((o.join === 'miter' || o.join === 'bevel') && v.corner) out.push(add(v.p, mul(na, w)), add(v.p, mul(nb, w)))
    else arc(out, v, na, nb, w, o)
  } else if (c > EPS && (w * Math.sqrt(1 - c * c)) / c <= Math.min(v.la, v.lb)) {
    miter()
  } else {
    out.push(add(v.p, mul(na, w)), v.p, add(v.p, mul(nb, w)))
  }
}

/** A round join from `na` to `nb` (unit normals) at radius `w` around the vertex; a full reversal rounds through the direction of travel. */
const arc = (out, v, na, nb, w, o) => {
  const phi = hypot(add(na, nb)) < EPS
    ? (dot({ x: -na.y, y: na.x }, v.a) > 0 ? Math.PI : -Math.PI)
    : Math.atan2(cross(na, nb), dot(na, nb))
  const step = 2 * Math.acos(1 - Math.min(o.tol / w, 1))
  const steps = Math.min(256, Math.max(1, Math.ceil(Math.abs(phi) / Math.max(step, 1e-3))))
  for (let k = 0; k <= steps; k++) {
    const s = Math.sin((phi * k) / steps)
    const c = Math.cos((phi * k) / steps)
    out.push(add(v.p, mul({ x: na.x * c - na.y * s, y: na.x * s + na.y * c }, w)))
  }
}

/** Cap points between `c + u·r0` and `c − u·r1`, bulging towards `v`. */
const capPoints = (ring, c, u, v, r0, r1, cap) => {
  if (cap === 'square') {
    const h = (r0 + r1) / 2
    ring.push(add(add(c, mul(u, r0)), mul(v, h)), add(sub(c, mul(u, r1)), mul(v, h)))
  } else if (cap === 'round') {
    const steps = 16
    for (let k = 1; k < steps; k++) {
      const a = (Math.PI * k) / steps
      const r = r0 + (r1 - r0) * (k / steps)
      ring.push(add(add(c, mul(u, Math.cos(a) * r)), mul(v, Math.sin(a) * r)))
    }
  }
}

/**
 * The outline polygons of one subpath: one ring for an open subpath, two opposite loops for a closed one.
 * @param {import('./anchor-path.js').SubPath} sp
 * @param {number} width
 * @param {import('./width-profile.js').WidthPoint[]} profile
 * @param {Required<OutlineOptions>} o
 * @returns {Pt[][]}
 */
const outlineSubpath = (sp, width, profile, o) => {
  const flat = flatten(sp, o.tol)
  if (flat.pts.length < 2) return []
  const { closed } = sp
  const { pts, corner } = densify(flat.pts, flat.corner, closed, profile)
  const n = pts.length
  const segCount = closed ? n : n - 1
  const segDir = []
  const cum = [0]
  for (let i = 0; i < segCount; i++) {
    segDir.push(unit(sub(pts[(i + 1) % n], pts[i])))
    cum.push(cum[i] + dist(pts[i], pts[(i + 1) % n]))
  }
  const total = cum[segCount]
  if (total <= 1e-12) return []
  const half = width / 2
  // Left and right offsets just before and just after `d` along the subpath (they differ at a discontinuous point).
  const widthAt = (d) => {
    const [b, a] = profileAround(profile, d / total)
    const side = ([l, r]) => [half * Math.max(l, 0), half * Math.max(r, 0)]
    return { before: side(b), after: side(a) }
  }
  const lpts = []
  const rpts = []
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const { before, after } = widthAt(cum[i])
    if (!closed && (i === 0 || i === n - 1)) {
      const nm = left(segDir[Math.min(i, segCount - 1)])
      const [wl, wr] = i === 0 ? after : before
      lpts.push(add(p, mul(nm, wl)))
      rpts.push(sub(p, mul(nm, wr)))
      continue
    }
    const ip = i === 0 ? segCount - 1 : i - 1
    const v = { p, a: segDir[ip], b: segDir[i], la: cum[ip + 1] - cum[ip], lb: cum[i + 1] - cum[i], corner: corner[i] }
    // A step: the side goes straight out (or in) from the width before to the one after.
    ;[before, after].forEach(([wl, wr], k) => {
      if (k === 0 || wl !== before[0] || wr !== before[1]) {
        joinPoints(lpts, v, wl, 1, o)
        joinPoints(rpts, v, wr, -1, o)
      }
    })
  }
  if (closed) return [lpts, rpts.reverse()]
  const t0 = segDir[0]
  const t1 = segDir[segCount - 1]
  const [wl0, wr0] = widthAt(0).after
  const [wl1, wr1] = widthAt(total).before
  const ring = lpts
  // End cap: from the left side around the end to the right side.
  capPoints(ring, pts[n - 1], left(t1), t1, wl1, wr1, o.cap)
  ring.push(...rpts.reverse())
  // Start cap: from the right side around the start back to the left side.
  capPoints(ring, pts[0], mul(left(t0), -1), mul(t0, -1), wr0, wl0, o.cap)
  return [ring]
}

const f = (n) => String(Math.round(n * 1000) / 1000)

/**
 * The outline of a path stroked with `width` scaled by `profile`, as absolute `M/L/Z` path data to fill
 * with the non-zero rule.
 * @param {string} d the centerline
 * @param {number} width the stroke's full width
 * @param {import('./width-profile.js').WidthPoint[]} profile
 * @param {OutlineOptions} [options]
 * @returns {?string} null when there is nothing to stroke (no path, no width)
 */
export const widthOutline = (d, width, profile, options = {}) => {
  if (!(width > 0) || !profile?.length) return null
  const o = { cap: 'butt', join: 'miter', miterLimit: 4, tol: 0.1, ...options }
  const rings = parseAnchors(d || '', 0.1).flatMap((sp) => (sp.anchors.length > 1 ? outlineSubpath(sp, width, profile, /** @type {Required<OutlineOptions>} */ (o)) : []))
  const out = rings.filter((r) => r.length > 2).map((r) => `M${r.map((p) => `${f(p.x)},${f(p.y)}`).join(' L')} Z`)
  return out.length ? out.join(' ') : null
}

/**
 * The area of the polygons in outline path data (shoelace, summed with sign): for tests and sanity checks.
 * @param {string} d
 * @returns {number}
 */
export const outlineArea = (d) => {
  let area = 0
  for (const ring of d.split('Z')) {
    const pts = [...ring.matchAll(/(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      a += p.x * q.y - q.x * p.y
    }
    area += a / 2
  }
  return area
}

/**
 * A path's centerline prepared for locating points along it by fraction of its length (the profile's `t`).
 * @typedef {object} Centerline
 * @property {Pt[]} pts flattened points (a closed path does not repeat its start)
 * @property {boolean} closed
 * @property {number[]} cum arc length at each point, plus the total (closing segment included for a closed path)
 * @property {number} total
 */

/**
 * @param {string} d path data of a single subpath
 * @param {number} [tol] flatness tolerance
 * @returns {?Centerline} null when there is no line to follow
 */
export const centerline = (d, tol = 0.2) => {
  const sp = parseAnchors(d || '', 0.1)[0]
  if (!sp || sp.anchors.length < 2) return null
  const { pts } = flatten(sp, tol)
  if (pts.length < 2) return null
  const cum = [0]
  const n = pts.length
  for (let i = 0; i < (sp.closed ? n : n - 1); i++) cum.push(cum[i] + dist(pts[i], pts[(i + 1) % n]))
  return cum[cum.length - 1] > 1e-12 ? { pts, closed: sp.closed, cum, total: cum[cum.length - 1] } : null
}

/**
 * The point at fraction `t` of the centerline, with its left normal (the side a profile's `left` factor is on).
 * @param {Centerline} c
 * @param {number} t
 * @returns {{p: Pt, n: Pt}}
 */
export const pointAt = (c, t) => {
  const d = Math.min(Math.max(t, 0), 1) * c.total
  const n = c.pts.length
  const segs = c.cum.length - 1
  let i = 0
  while (i < segs - 1 && c.cum[i + 1] < d) i++
  const a = c.pts[i]
  const b = c.pts[(i + 1) % n]
  const len = c.cum[i + 1] - c.cum[i]
  const u = len > 0 ? (d - c.cum[i]) / len : 0
  return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, n: left(unit(sub(b, a))) }
}

/**
 * The closest point of the centerline to `q`.
 * @param {Centerline} c
 * @param {Pt} q
 * @returns {{t: number, p: Pt, n: Pt, dist: number}}
 */
export const locate = (c, q) => {
  const n = c.pts.length
  let best = null
  for (let i = 0; i < c.cum.length - 1; i++) {
    const a = c.pts[i]
    const b = c.pts[(i + 1) % n]
    const ab = sub(b, a)
    const len2 = dot(ab, ab)
    const u = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(q, a), ab) / len2)) : 0
    const p = { x: a.x + ab.x * u, y: a.y + ab.y * u }
    const dd = dist(p, q)
    if (!best || dd < best.dist) best = { t: (c.cum[i] + (c.cum[i + 1] - c.cum[i]) * u) / c.total, p, n: left(unit(ab)), dist: dd }
  }
  return /** @type {{t: number, p: Pt, n: Pt, dist: number}} */ (best)
}
