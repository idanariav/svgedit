/**
 * Least-squares cubic Bézier fitting of point sequences: fit a cubic with
 * fixed end tangents, reparameterise with Newton steps, and split at the worst
 * point when one cubic is not enough (the approach from Graphics Gems,
 * "An Algorithm for Automatically Fitting Digitized Curves").
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/pathops/src/fit.rs`, MIT OR Apache-2.0. Unlike the `fit-curve` npm
 * package, `fitSingleFrom` takes caller-supplied parameters `u` per point,
 * which Remove Anchor needs (see `path-edit.js`); centerline tracing reuses
 * the module too.
 *
 * Cubics are `{p0, p1, p2, p3}` of `{x, y}` points, as in `anchor-path.js`.
 *
 * @module bezier-fit
 * @license MIT
 */

import { evalCubic } from './anchor-path.js'

/** Maximum Newton reparameterisation rounds per fit. */
const MAX_REPARAM = 6

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a, k) => ({ x: a.x * k, y: a.y * k })
const dot = (a, b) => a.x * b.x + a.y * b.y
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Unit vector, or null if (nearly) zero.
 * @param {{x: number, y: number}} v
 * @returns {?{x: number, y: number}}
 */
export const unit = (v) => {
  const l = Math.hypot(v.x, v.y)
  return l > 1e-12 && Number.isFinite(l) ? { x: v.x / l, y: v.y / l } : null
}

/**
 * Direction the curve leaves `p0` (robust to retracted handles).
 * @param {import('./anchor-path.js').Cubic} c
 * @returns {{x: number, y: number}}
 */
export const startTangent = (c) =>
  unit(sub(c.p1, c.p0)) || unit(sub(c.p2, c.p0)) || unit(sub(c.p3, c.p0)) || { x: 1, y: 0 }

/**
 * Direction the curve arrives at `p3`, pointing forward along the travel direction.
 * @param {import('./anchor-path.js').Cubic} c
 * @returns {{x: number, y: number}}
 */
export const endTangent = (c) =>
  unit(sub(c.p3, c.p2)) || unit(sub(c.p3, c.p1)) || unit(sub(c.p3, c.p0)) || { x: 1, y: 0 }

/**
 * Sample a cubic at `n + 1` evenly spaced parameters (including both ends).
 * @param {import('./anchor-path.js').Cubic} c
 * @param {number} n
 * @param {Array<{x: number, y: number}>} out - Points are appended here.
 * @param {boolean} [includeStart] - Whether to emit the point at t = 0.
 * @returns {void}
 */
export const sampleCubic = (c, n, out, includeStart = true) => {
  for (let i = includeStart ? 0 : 1; i <= n; i++) out.push(evalCubic(c, i / n))
}

const dedup = (pts) => {
  const v = []
  for (const p of pts) {
    if (!v.length || dist(v[v.length - 1], p) > 1e-12) v.push(p)
  }
  return v
}

const chordParams = (pts) => {
  const u = [0]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i])
    u.push(acc)
  }
  return acc > 0 ? u.map((x) => x / acc) : u
}

const bern = (t) => {
  const s = 1 - t
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]
}

/** Solve the 2x2 normal equations for the handle lengths along the fixed tangents. */
const generate = (pts, u, t0, t1) => {
  const p0 = pts[0]
  const p3 = pts[pts.length - 1]
  const dirIn = mul(t1, -1) // the handle at the end points backwards
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  pts.forEach((p, i) => {
    const b = bern(u[i])
    const a0 = mul(t0, b[1])
    const a1 = mul(dirIn, b[2])
    c00 += dot(a0, a0)
    c01 += dot(a0, a1)
    c11 += dot(a1, a1)
    const tmp = sub(p, add(mul(p0, b[0] + b[1]), mul(p3, b[2] + b[3])))
    x0 += dot(a0, tmp)
    x1 += dot(a1, tmp)
  })
  const det = c00 * c11 - c01 * c01
  const seg = dist(p0, p3)
  const eps = 1e-6 * seg
  let al
  let ar
  if (Math.abs(det) > 1e-12) {
    al = (x0 * c11 - x1 * c01) / det
    ar = (c00 * x1 - c01 * x0) / det
  } else {
    al = seg / 3
    ar = seg / 3
  }
  if (!Number.isFinite(al) || !Number.isFinite(ar) || al < eps || ar < eps) {
    al = seg / 3
    ar = seg / 3
  }
  // Guard against wild handles on nearly-degenerate data.
  const cap = seg * 4 + 1e-9
  al = Math.min(al, cap)
  ar = Math.min(ar, cap)
  return { p0, p1: add(p0, mul(t0, al)), p2: add(p3, mul(dirIn, ar)), p3 }
}

const maxError = (pts, c, u) => {
  let e = 0
  let idx = Math.floor(pts.length / 2)
  pts.forEach((p, i) => {
    const d = dist(evalCubic(c, u[i]), p)
    if (d > e) {
      e = d
      idx = i
    }
  })
  return [e, idx]
}

/** One Newton step moving parameter `t` towards the point on `c` closest to `p`. */
const newton = (c, p, t) => {
  const s = 1 - t
  const q = sub(evalCubic(c, t), p)
  const d1a = mul(sub(c.p1, c.p0), 3)
  const d1b = mul(sub(c.p2, c.p1), 3)
  const d1c = mul(sub(c.p3, c.p2), 3)
  const q1 = add(add(mul(d1a, s * s), mul(d1b, 2 * s * t)), mul(d1c, t * t))
  const d2a = mul(sub(d1b, d1a), 2)
  const d2b = mul(sub(d1c, d1b), 2)
  const q2 = add(mul(d2a, s), mul(d2b, t))
  const num = dot(q, q1)
  const den = dot(q1, q1) + dot(q, q2)
  if (Math.abs(den) < 1e-12) return t
  const nt = t - num / den
  return Number.isFinite(nt) ? Math.min(1, Math.max(0, nt)) : t
}

/**
 * Best single cubic for `pts` with the given end tangents, starting from the
 * parameters `u` (one per point, 0 to 1) instead of chord-length ones.
 * @param {Array<{x: number, y: number}>} pts
 * @param {number[]} u
 * @param {{x: number, y: number}} t0 - Unit tangent leaving the first point.
 * @param {{x: number, y: number}} t1 - Unit tangent arriving at the last point (forward).
 * @returns {[import('./anchor-path.js').Cubic, number, number]} The curve, its
 *   maximum error and the index of the worst point.
 */
export const fitSingleFrom = (pts, u, t0, t1) => {
  u = [...u]
  let best = generate(pts, u, t0, t1)
  let [bestErr, bestSplit] = maxError(pts, best, u)
  for (let r = 0; r < MAX_REPARAM; r++) {
    for (let i = 0; i < u.length; i++) u[i] = newton(best, pts[i], u[i])
    const c = generate(pts, u, t0, t1)
    const [e, s] = maxError(pts, c, u)
    if (e < bestErr) {
      best = c
      bestErr = e
      bestSplit = s
    } else {
      break
    }
  }
  return [best, bestErr, bestSplit]
}

/**
 * Best single cubic for `pts` with the given end tangents (chord-length
 * parameters to start with).
 * @param {Array<{x: number, y: number}>} pts
 * @param {{x: number, y: number}} t0
 * @param {{x: number, y: number}} t1
 * @returns {[import('./anchor-path.js').Cubic, number, number]}
 */
export const fitSingle = (pts, t0, t1) => fitSingleFrom(pts, chordParams(pts), t0, t1)

const fitRec = (pts, t0, t1, tol, out, depth) => {
  const n = pts.length
  if (n === 2) {
    const d = dist(pts[0], pts[1]) / 3
    out.push({ p0: pts[0], p1: add(pts[0], mul(t0, d)), p2: sub(pts[1], mul(t1, d)), p3: pts[1] })
    return
  }
  const [c, err, split0] = fitSingle(pts, t0, t1)
  if (err <= tol || depth > 40) {
    out.push(c)
    return
  }
  // Split at the worst point with a centre tangent estimated from its neighbours.
  const split = Math.min(n - 2, Math.max(1, split0))
  const tc = unit(sub(pts[split + 1], pts[split - 1])) || t0
  fitRec(pts.slice(0, split + 1), t0, tc, tol, out, depth + 1)
  fitRec(pts.slice(split), tc, t1, tol, out, depth + 1)
}

/**
 * Fit a chain of cubics through `pts` with maximum (parametric) error `tol`.
 * Consecutive output cubics are G1 continuous.
 * @param {Array<{x: number, y: number}>} pts
 * @param {{x: number, y: number}} t0 - Unit tangent leaving `pts[0]`.
 * @param {{x: number, y: number}} t1 - Unit tangent arriving at the last point (forward).
 * @param {number} tol
 * @returns {import('./anchor-path.js').Cubic[]}
 */
export const fitCubics = (pts, t0, t1, tol) => {
  const out = []
  const clean = dedup(pts)
  if (clean.length < 2) return out
  fitRec(clean, t0, t1, Math.max(tol, 1e-9), out, 0)
  return out
}

/**
 * Whether the cubic is, within `tol`, a straight line from p0 to p3 with its
 * handles inside the chord.
 * @param {import('./anchor-path.js').Cubic} c
 * @param {number} tol
 * @returns {boolean}
 */
export const isStraight = (c, tol) => {
  const chord = sub(c.p3, c.p0)
  const len = Math.hypot(chord.x, chord.y)
  if (len < 1e-12) return dist(c.p1, c.p0) <= tol && dist(c.p2, c.p0) <= tol
  const dir = { x: chord.x / len, y: chord.y / len }
  return [c.p1, c.p2].every((h) => {
    const v = sub(h, c.p0)
    const along = dot(v, dir)
    return Math.abs(v.x * dir.y - v.y * dir.x) <= tol && along >= -tol && along <= len + tol
  })
}
