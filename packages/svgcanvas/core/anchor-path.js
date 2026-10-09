/**
 * Anchor-based path model — a small, DOM-free representation of a path as
 * subpaths of anchors with in/out Bézier handles, plus the geometry helpers
 * the live-effect pipeline needs (non-linear mapping, Catmull-Rom smoothing,
 * deterministic noise).
 *
 * An anchor is `{ p, hIn, hOut }` (absolute coordinates). A handle equal to its
 * anchor means "no handle" — a segment whose two facing handles are retracted
 * is a straight line. A subpath is `{ closed, anchors }`; a closed subpath has
 * an implicit segment from the last anchor back to the first.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/effects/src/util.rs` (`seg_cubic`, `catmull_rom`, `normal_at`,
 * `noise`) and `crates/doc/src/live.rs` (`map_nonlinear`), MIT OR Apache-2.0.
 * The noise hash is a 32-bit integer hash rather than VectorCraft's splitmix64
 * (bit-exact parity is not a goal).
 *
 * @module anchor-path
 * @license MIT
 */

import SvgPath from 'svgpath'

/** @typedef {{x: number, y: number}} Pt */
/** @typedef {{p: Pt, hIn: Pt, hOut: Pt}} Anchor */
/** @typedef {{closed: boolean, anchors: Anchor[]}} SubPath */
/** @typedef {{p0: Pt, p1: Pt, p2: Pt, p3: Pt}} Cubic */

const EPS = 1e-9
const round6 = (n) => Math.round(n * 1e6) / 1e6

const same = (a, b) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * Build an anchor with no handles.
 * @param {number} x
 * @param {number} y
 * @returns {Anchor}
 */
const makeAnchor = (x, y) => ({ p: { x, y }, hIn: { x, y }, hOut: { x, y } })

/**
 * Parse path data into anchor subpaths. Relative commands, `H`/`V`, shorthand
 * curves, arcs and quadratics are normalised to absolute lines and cubics.
 * Subpaths with fewer than two anchors (a lone `M`) are dropped. A closing
 * segment that returns to the first anchor (explicit `L`/`C` before `Z`) is
 * folded into the closed subpath instead of producing a duplicate anchor.
 * @param {string} d
 * @param {number} [closeTol] - How close the closing segment's end must be to
 *   the start to count as "returns to the first anchor" (default: exact).
 *   Path data re-serialised with rounding needs a looser value.
 * @returns {SubPath[]}
 */
export const parseAnchors = (d, closeTol = EPS) => {
  let segments
  try {
    segments = new SvgPath(d || '').abs().unarc().unshort().segments
  } catch (_err) {
    return []
  }
  const out = []
  let cur = null
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  const begin = (x, y) => {
    cur = { closed: false, anchors: [makeAnchor(x, y)] }
    out.push(cur)
  }
  const last = () => cur.anchors[cur.anchors.length - 1]
  const lineTo = (x, y) => {
    if (!cur) begin(cx, cy)
    cur.anchors.push(makeAnchor(x, y))
    cx = x
    cy = y
  }
  const cubicTo = (x1, y1, x2, y2, x, y) => {
    if (!cur) begin(cx, cy)
    last().hOut = { x: x1, y: y1 }
    const a = makeAnchor(x, y)
    a.hIn = { x: x2, y: y2 }
    cur.anchors.push(a)
    cx = x
    cy = y
  }
  for (const seg of segments) {
    const [cmd, ...a] = seg
    switch (cmd) {
      case 'M':
        cx = a[0]
        cy = a[1]
        sx = cx
        sy = cy
        begin(cx, cy)
        break
      case 'L':
        lineTo(a[0], a[1])
        break
      case 'H':
        lineTo(a[0], cy)
        break
      case 'V':
        lineTo(cx, a[0])
        break
      case 'C':
        cubicTo(a[0], a[1], a[2], a[3], a[4], a[5])
        break
      case 'Q': {
        // Elevate to a cubic: c1 = p0 + 2/3 (q − p0), c2 = p3 + 2/3 (q − p3).
        const k = 2 / 3
        cubicTo(
          cx + k * (a[0] - cx), cy + k * (a[1] - cy),
          a[2] + k * (a[0] - a[2]), a[3] + k * (a[1] - a[3]),
          a[2], a[3]
        )
        break
      }
      case 'Z':
        if (cur) {
          cur.closed = true
          // Fold the closing segment(s) that return to the first anchor. With a
          // tolerance, a curve that stops just short of the start followed by a
          // tiny closing `L` (what the saver writes) folds too; the incoming
          // handle comes from the curve.
          const first = cur.anchors[0]
          let handle = null
          while (cur.anchors.length > 1 &&
            Math.abs(first.p.x - last().p.x) <= closeTol && Math.abs(first.p.y - last().p.y) <= closeTol) {
            const a = cur.anchors.pop()
            if (!handle && !same(a.hIn, a.p)) handle = a.hIn
          }
          if (handle) first.hIn = handle
        }
        cx = sx
        cy = sy
        cur = null
        break
      default:
        break
    }
  }
  return out.filter((sp) => sp.anchors.length >= 2)
}

/**
 * Whether the segment between two anchors is a straight line.
 * @param {Anchor} a
 * @param {Anchor} b
 * @returns {boolean}
 */
export const isLineSegment = (a, b) => same(a.hOut, a.p) && same(b.hIn, b.p)

/**
 * Whether an anchor has an incoming / outgoing handle.
 * @param {Anchor} a
 * @returns {boolean}
 */
export const hasIn = (a) => !same(a.hIn, a.p)
export const hasOut = (a) => !same(a.hOut, a.p)

/**
 * Handle-less subpath through `pts`.
 * @param {Pt[]} pts
 * @param {boolean} closed
 * @returns {SubPath}
 */
export const polyline = (pts, closed) => ({
  closed,
  anchors: pts.map((pt) => makeAnchor(pt.x, pt.y))
})

/**
 * Number of segments in a subpath (a closed one has a closing segment).
 * @param {SubPath} sp
 * @returns {number}
 */
export const segmentCount = (sp) => (sp.closed ? sp.anchors.length : sp.anchors.length - 1)

/**
 * Segment `i` (anchor i → anchor i+1, wrapping when closed) as a cubic. A
 * straight segment gets handles at 1/3 and 2/3 so a non-linear map bends it.
 * @param {SubPath} sp
 * @param {number} i
 * @returns {Cubic}
 */
export const segCubic = (sp, i) => {
  const n = sp.anchors.length
  const a = sp.anchors[i % n]
  const b = sp.anchors[(i + 1) % n]
  if (isLineSegment(a, b)) {
    return { p0: a.p, p1: lerp(a.p, b.p, 1 / 3), p2: lerp(a.p, b.p, 2 / 3), p3: b.p }
  }
  return { p0: a.p, p1: a.hOut, p2: b.hIn, p3: b.p }
}

/**
 * Serialise anchor subpaths to absolute `M/L/C/Z` path data. Closed subpaths
 * carry the explicit closing segment *and* `Z` (the node editor models the
 * closing lineto as the start anchor's grip).
 * @param {SubPath[]} subpaths
 * @returns {string}
 */
export const anchorsToD = (subpaths) => {
  const f = (pt) => `${round6(pt.x)},${round6(pt.y)}`
  return subpaths.map((sp) => {
    const n = sp.anchors.length
    if (n === 0) return ''
    const parts = [`M${f(sp.anchors[0].p)}`]
    const segs = segmentCount(sp)
    for (let i = 0; i < segs; i++) {
      const a = sp.anchors[i]
      const b = sp.anchors[(i + 1) % n]
      parts.push(isLineSegment(a, b)
        ? `L${f(b.p)}`
        : `C${f(a.hOut)} ${f(b.hIn)} ${f(b.p)}`)
    }
    if (sp.closed) parts.push('Z')
    return parts.join(' ')
  }).filter(Boolean).join(' ')
}

/**
 * Evaluate a cubic at `t`.
 * @param {Cubic} c
 * @param {number} t
 * @returns {Pt}
 */
export const evalCubic = (c, t) => {
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
 * The sub-curve of `c` between parameters `t0` and `t1` (de Casteljau).
 * @param {Cubic} c
 * @param {number} t0
 * @param {number} t1
 * @returns {Cubic}
 */
export const splitCubic = (c, t0, t1) => {
  const right = (q, t) => { // keep [t, 1]
    const a = lerp(q.p0, q.p1, t)
    const b = lerp(q.p1, q.p2, t)
    const cc = lerp(q.p2, q.p3, t)
    const ab = lerp(a, b, t)
    const bc = lerp(b, cc, t)
    const m = lerp(ab, bc, t)
    return { p0: m, p1: bc, p2: cc, p3: q.p3 }
  }
  const left = (q, t) => { // keep [0, t]
    const a = lerp(q.p0, q.p1, t)
    const b = lerp(q.p1, q.p2, t)
    const cc = lerp(q.p2, q.p3, t)
    const ab = lerp(a, b, t)
    const bc = lerp(b, cc, t)
    const m = lerp(ab, bc, t)
    return { p0: q.p0, p1: a, p2: ab, p3: m }
  }
  const tail = t0 > 0 ? right(c, t0) : c
  if (t1 >= 1) return tail
  // Re-express t1 relative to the remaining [t0, 1] interval.
  return left(tail, (t1 - t0) / (1 - t0))
}

/**
 * Unit normal at `t` (left of the travel direction in y-down coordinates).
 * @param {Cubic} c
 * @param {number} t
 * @returns {Pt}
 */
export const normalAt = (c, t) => {
  const eps = 1e-4
  const a = evalCubic(c, Math.max(0, t - eps))
  const b = evalCubic(c, Math.min(1, t + eps))
  let dx = b.x - a.x
  let dy = b.y - a.y
  if (Math.hypot(dx, dy) < 1e-12) {
    dx = c.p3.x - c.p0.x
    dy = c.p3.y - c.p0.y
  }
  const len = Math.hypot(dx, dy)
  return len < 1e-12 ? { x: 0, y: 0 } : { x: dy / len, y: -dx / len }
}

/**
 * Approximate arc length of a cubic (20-sample polyline).
 * @param {Cubic} c
 * @returns {number}
 */
export const cubicLength = (c) => {
  let len = 0
  let prev = c.p0
  for (let k = 1; k <= 20; k++) {
    const q = evalCubic(c, k / 20)
    len += dist(prev, q)
    prev = q
  }
  return len
}

/**
 * Flatten subpaths to polylines. Closed subpaths come back with the start
 * point repeated at the end.
 * @param {SubPath[]} subpaths
 * @returns {Array<{closed: boolean, pts: Pt[]}>}
 */
export const flattenSubpaths = (subpaths) => subpaths.map((sp) => {
  const pts = [sp.anchors[0].p]
  const n = sp.anchors.length
  for (let i = 0; i < segmentCount(sp); i++) {
    if (isLineSegment(sp.anchors[i], sp.anchors[(i + 1) % n])) {
      pts.push(sp.anchors[(i + 1) % n].p)
      continue
    }
    const c = segCubic(sp, i)
    const steps = Math.min(100, Math.max(2, Math.ceil(polyLen(c) / 3)))
    for (let k = 1; k <= steps; k++) pts.push(evalCubic(c, k / steps))
  }
  return { closed: sp.closed, pts }
})

const polyLen = (c) => dist(c.p0, c.p1) + dist(c.p1, c.p2) + dist(c.p2, c.p3)

/**
 * Map every control point of `subpaths` through the non-linear function `f`.
 * Segments are first split into pieces no longer than about `maxPiece` (up to
 * 64 per segment) so the image curve is approximated to O(h²). Closedness and
 * subpath structure are preserved.
 * @param {SubPath[]} subpaths
 * @param {number} maxPiece
 * @param {(p: Pt) => Pt} f
 * @returns {SubPath[]}
 */
export const mapNonlinear = (subpaths, maxPiece, f) => {
  const piece = Math.max(maxPiece, 1e-3)
  const result = []
  for (const sp of subpaths) {
    const n = sp.anchors.length
    if (n === 0) continue
    const segs = segmentCount(sp)
    const res = []
    let pendingIn = null
    for (let i = 0; i < n; i++) {
      const a = sp.anchors[i]
      const hIn = pendingIn ?? f(a.hIn)
      pendingIn = null
      res.push({ p: f(a.p), hIn, hOut: f(a.hOut) })
      if (i < segs) {
        const c = segCubic(sp, i)
        const k = Math.min(64, Math.max(1, Math.ceil(polyLen(c) / piece)))
        for (let j = 0; j < k; j++) {
          const sub = splitCubic(c, j / k, (j + 1) / k)
          res[res.length - 1].hOut = f(sub.p1)
          if (j + 1 < k) {
            const p3 = f(sub.p3)
            res.push({ p: p3, hIn: f(sub.p2), hOut: p3 })
          } else {
            pendingIn = f(sub.p2)
          }
        }
      }
    }
    if (pendingIn && sp.closed) res[0].hIn = pendingIn
    result.push({ closed: sp.closed, anchors: res })
  }
  return result
}

/**
 * Smooth closed/open subpath through `pts` using Catmull-Rom tangents.
 * @param {Pt[]} pts
 * @param {boolean} closed
 * @param {number} tension - 1 gives standard Catmull-Rom.
 * @returns {SubPath}
 */
export const catmullRom = (pts, closed, tension) => {
  const n = pts.length
  if (n < 3) {
    return { closed, anchors: pts.map((pt) => makeAnchor(pt.x, pt.y)) }
  }
  const anchors = pts.map((pt, i) => {
    const prev = i === 0 ? (closed ? pts[n - 1] : pts[0]) : pts[i - 1]
    const next = i === n - 1 ? (closed ? pts[0] : pts[n - 1]) : pts[i + 1]
    const tx = (next.x - prev.x) * (tension / 6)
    const ty = (next.y - prev.y) * (tension / 6)
    return {
      p: { x: pt.x, y: pt.y },
      hIn: { x: pt.x - tx, y: pt.y - ty },
      hOut: { x: pt.x + tx, y: pt.y + ty }
    }
  })
  return { closed, anchors }
}

/**
 * Deterministic hash noise in [-1, 1] for `(seed, a, b, c)`. 32-bit integer
 * hash (murmur3 finaliser over a mixed key).
 * @param {number} seed
 * @param {number} a
 * @param {number} [b]
 * @param {number} [c]
 * @returns {number}
 */
export const seededNoise = (seed, a, b = 0, c = 0) => {
  let x = Math.imul(seed | 0, 0x9E3779B1) ^ Math.imul(a | 0, 0x85EBCA6B) ^
    Math.imul(b | 0, 0xC2B2AE35) ^ Math.imul(c | 0, 0x27D4EB2F)
  x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B)
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967295 * 2 - 1
}

/**
 * Bounding box of the path geometry itself (anchors plus samples along every
 * segment — handles are not included, so a circle's box is its true extent).
 * @param {SubPath[]} subpaths
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export const anchorBBox = (subpaths) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (pt) => {
    if (pt.x < minX) minX = pt.x
    if (pt.x > maxX) maxX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.y > maxY) maxY = pt.y
  }
  for (const sp of subpaths) {
    sp.anchors.forEach((a) => add(a.p))
    const segs = segmentCount(sp)
    for (let i = 0; i < segs; i++) {
      if (isLineSegment(sp.anchors[i], sp.anchors[(i + 1) % sp.anchors.length])) continue
      const c = segCubic(sp, i)
      for (let k = 1; k < 24; k++) add(evalCubic(c, k / 24))
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Whether two anchor models describe the same geometry: same subpath/anchor
 * structure and every anchor and handle within `tol` of its counterpart. Used
 * to recognise a path that was only re-serialised (the saver rewrites `d` as
 * relative commands rounded to 2 decimals) as unchanged.
 * @param {SubPath[]} a
 * @param {SubPath[]} b
 * @param {number} [tol]
 * @returns {boolean}
 */
export const sameAnchorGeometry = (a, b, tol = 0.1) => {
  if (a.length !== b.length) return false
  const near = (p, q) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol
  return a.every((sp, i) => {
    const other = b[i]
    return sp.closed === other.closed && sp.anchors.length === other.anchors.length &&
      sp.anchors.every((an, j) => {
        const bn = other.anchors[j]
        return near(an.p, bn.p) && near(an.hIn, bn.hIn) && near(an.hOut, bn.hOut)
      })
  })
}
