/**
 * Distort & stylize live effects: Roughen, Zig Zag, Pucker & Bloat, Twist,
 * Tweak, Round Corners and Scribble. Each is a pure function over anchor
 * subpaths registered into the live-effect registry (`live-effects.js`).
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/effects/src/distort.rs` and `crates/effects/src/stylize.rs`,
 * MIT OR Apache-2.0. Divergences from the Rust:
 *  - straight segments are sampled uniformly (`segCubic`), not through their
 *    retracted-handle cubic, so Zig Zag/Roughen points on a line are evenly
 *    spaced;
 *  - Roughen's `detail` is points per inch at 96 px/in (VectorCraft: 72 pt);
 *  - noise is a 32-bit integer hash (`seededNoise`), so jitter patterns do not
 *    match VectorCraft's bit for bit;
 *  - Scribble returns the hatch *centerline* (painted as a stroke through the
 *    registry's `strokeOutput`, original fill → stroke) instead of a filled
 *    outline, and only hatches closed subpaths.
 *
 * @module live-effects-distort
 * @license MIT
 */

import {
  segCubic, evalCubic, normalAt, mapNonlinear, catmullRom, polyline, seededNoise,
  segmentCount, hasIn, hasOut, cubicLength, flattenSubpaths
} from './anchor-path.js'
import { registerLiveEffect } from './live-effects.js'

const KAPPA = 0.5522847498307936

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const meanSize = (b) => (Math.abs(b.width) + Math.abs(b.height)) / 2
const diag = (b) => Math.max(Math.hypot(b.width, b.height), 1e-6)
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const smoothOrPolyline = (pts, closed, smooth) => (smooth ? catmullRom(pts, closed, 1) : polyline(pts, closed))

/**
 * Roughen: resample at `detail` points per inch and jitter each point.
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @param {Object} bbox
 * @param {Object} p
 * @returns {import('./anchor-path.js').SubPath[]}
 */
export const roughen = (subpaths, bbox, p) => {
  const size = clamp(p.size, 0, 1e4)
  const amp = p.relative ? size / 100 * meanSize(bbox) : size
  const detail = clamp(p.detail, 0, 100)
  const spacing = detail > 0 ? 96 / detail : Infinity
  const smooth = p.points !== 'corner'
  return subpaths.map((sp, si) => {
    let pts = []
    for (let i = 0; i < segmentCount(sp); i++) {
      const c = segCubic(sp, i)
      const k = Number.isFinite(spacing)
        ? clamp(Math.ceil(cubicLength(c) / spacing), 1, 2000)
        : 1
      for (let j = 0; j < k; j++) pts.push(evalCubic(c, j / k))
    }
    if (!sp.closed) pts.push(sp.anchors[sp.anchors.length - 1].p)
    if (!pts.length) pts = sp.anchors.map((a) => a.p)
    pts = pts.map((q, k) => ({
      x: q.x + amp * seededNoise(p.seed, si, k, 1),
      y: q.y + amp * seededNoise(p.seed, si, k, 2)
    }))
    return smoothOrPolyline(pts, sp.closed, smooth)
  })
}

/**
 * Zig Zag: `ridges` extra points per segment, alternately displaced along the
 * normal.
 */
export const zigZag = (subpaths, bbox, p) => {
  const size = clamp(p.size, -1e4, 1e4)
  const amp = p.relative ? size / 100 * meanSize(bbox) : size
  const ridges = Math.trunc(clamp(p.ridges, 0, 100))
  const smooth = p.points !== 'corner'
  return subpaths.map((sp) => {
    const segs = segmentCount(sp)
    const pts = []
    let k = 0
    for (let i = 0; i < segs; i++) {
      const c = segCubic(sp, i)
      for (let j = 0; j <= ridges; j++) {
        const t = j / (ridges + 1)
        let nrm
        if (j === 0) {
          // Average the normals of the segments meeting at the anchor.
          const prev = i > 0 ? segCubic(sp, i - 1) : (sp.closed ? segCubic(sp, segs - 1) : null)
          const n1 = normalAt(c, 0)
          nrm = n1
          if (prev) {
            const n0 = normalAt(prev, 1)
            const sx = n1.x + n0.x
            const sy = n1.y + n0.y
            const len = Math.hypot(sx, sy)
            if (len > 1e-9) nrm = { x: sx / len, y: sy / len }
          }
        } else {
          nrm = normalAt(c, t)
        }
        const sign = k % 2 === 0 ? 1 : -1
        const q = evalCubic(c, t)
        pts.push({ x: q.x + nrm.x * amp * sign, y: q.y + nrm.y * amp * sign })
        k++
      }
    }
    if (!sp.closed) {
      if (segs > 0) {
        const c = segCubic(sp, segs - 1)
        const sign = k % 2 === 0 ? 1 : -1
        const n = normalAt(c, 1)
        pts.push({ x: c.p3.x + n.x * amp * sign, y: c.p3.y + n.y * amp * sign })
      } else {
        pts.push(...sp.anchors.map((a) => a.p))
      }
    }
    return smoothOrPolyline(pts, sp.closed, smooth)
  })
}

/**
 * Pucker & Bloat: anchors move toward the centre, handles the opposite way.
 * Straight segments first get handles at 1/3 and 2/3 so they bulge — the
 * order matters.
 */
export const puckerBloat = (subpaths, bbox, p) => {
  const a = clamp(p.amount, -200, 200) / 100
  if (a === 0) return subpaths
  const c = center(bbox)
  return subpaths.map((sp) => {
    const n = sp.anchors.length
    const anchors = sp.anchors.map((an) => ({ p: { ...an.p }, hIn: { ...an.hIn }, hOut: { ...an.hOut } }))
    for (let i = 0; i < segmentCount(sp); i++) {
      const cub = segCubic(sp, i)
      anchors[i].hOut = cub.p1
      anchors[(i + 1) % n].hIn = cub.p2
    }
    return {
      closed: sp.closed,
      anchors: anchors.map((an) => ({
        p: lerp(an.p, c, a * 0.5),
        hIn: lerp(an.hIn, c, -a * 0.5),
        hOut: lerp(an.hOut, c, -a * 0.5)
      }))
    }
  })
}

/**
 * Twist: rotation strongest at the centre, fading to zero at the bounding
 * circle (radius `diag/2`). The piece size shrinks with the angle so large
 * twists stay smooth.
 */
export const twist = (subpaths, bbox, p) => {
  const ang = clamp(p.angle, -3600, 3600) * Math.PI / 180
  if (ang === 0) return subpaths
  const c = center(bbox)
  const r = diag(bbox) / 2
  const f = (q) => {
    const dx = q.x - c.x
    const dy = q.y - c.y
    const t = Math.max(1 - Math.hypot(dx, dy) / r, 0)
    const a = -ang * t
    const s = Math.sin(a)
    const co = Math.cos(a)
    return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co }
  }
  const pieces = Math.min(r / 8, r / (1 + Math.abs(ang) * 2))
  return mapNonlinear(subpaths, pieces, f)
}

/** Tweak: random displacement of anchors and/or control points. */
export const tweak = (subpaths, bbox, p) => {
  const ah = p.relative ? p.h / 100 * Math.abs(bbox.width) : p.h
  const av = p.relative ? p.v / 100 * Math.abs(bbox.height) : p.v
  return subpaths.map((sp, si) => ({
    closed: sp.closed,
    anchors: sp.anchors.map((an, ai) => {
      const d = (ch) => ({
        x: ah * seededNoise(p.seed, si, ai, ch * 2 + 1),
        y: av * seededNoise(p.seed, si, ai, ch * 2 + 2)
      })
      let pt = an.p
      let hIn = an.hIn
      let hOut = an.hOut
      const add = (q, v) => ({ x: q.x + v.x, y: q.y + v.y })
      if (p.anchors) {
        const dp = d(0)
        pt = add(pt, dp)
        hIn = add(hIn, dp)
        hOut = add(hOut, dp)
      }
      if (p.in) hIn = add(hIn, d(1))
      if (p.out) hOut = add(hOut, d(2))
      return { p: pt, hIn, hOut }
    })
  }))
}

/**
 * Round Corners: every sharp, handle-less interior corner becomes a
 * circular-ish arc of `radius` (capped at half the adjoining edges). Corners
 * that already carry handles are left alone.
 */
export const roundCorners = (subpaths, _bbox, p) => {
  const radius = p.radius
  if (!(radius > 0)) return subpaths
  return subpaths.map((sp) => {
    const n = sp.anchors.length
    if (n < 3 && (n !== 2 || sp.closed)) return sp
    const out = []
    for (let i = 0; i < n; i++) {
      const a = sp.anchors[i]
      const interior = sp.closed || (i > 0 && i + 1 < n)
      if (!interior || hasIn(a) || hasOut(a)) {
        out.push(a)
        continue
      }
      const prev = sp.anchors[(i + n - 1) % n]
      const next = sp.anchors[(i + 1) % n]
      // Directions toward the neighbours (their handles if the segments curve).
      const tp = hasOut(prev) ? prev.hOut : prev.p
      const tn = hasIn(next) ? next.hIn : next.p
      const vpx = tp.x - a.p.x
      const vpy = tp.y - a.p.y
      const vnx = tn.x - a.p.x
      const vny = tn.y - a.p.y
      const lp = Math.hypot(vpx, vpy)
      const ln = Math.hypot(vnx, vny)
      if (lp < 1e-9 || ln < 1e-9) {
        out.push(a)
        continue
      }
      const up = { x: vpx / lp, y: vpy / lp }
      const un = { x: vnx / ln, y: vny / ln }
      if (up.x * un.x + up.y * un.y < -0.9999) { // nearly straight
        out.push(a)
        continue
      }
      const d = Math.min(
        radius,
        Math.hypot(prev.p.x - a.p.x, prev.p.y - a.p.y) / 2,
        Math.hypot(next.p.x - a.p.x, next.p.y - a.p.y) / 2
      )
      const pa = { x: a.p.x + up.x * d, y: a.p.y + up.y * d }
      const pb = { x: a.p.x + un.x * d, y: a.p.y + un.y * d }
      const k = d * KAPPA
      out.push({ p: pa, hIn: pa, hOut: { x: pa.x - up.x * k, y: pa.y - up.y * k } })
      out.push({ p: pb, hIn: { x: pb.x - un.x * k, y: pb.y - un.y * k }, hOut: pb })
    }
    return { closed: sp.closed, anchors: out }
  })
}

/**
 * Scribble: one zig-zag hatching line across the filled area at `angle`.
 * Returns the *centerline*; the registry paints it as a stroke of
 * `strokeWidth` (`strokeOutput`). Open subpaths enclose no area and are
 * ignored — with none closed the result is empty (the effect is refused).
 */
export const scribble = (subpaths, bbox, p) => {
  const closed = subpaths.filter((sp) => sp.closed)
  if (!closed.length) return []
  const angle = p.angle * Math.PI / 180
  const overlap = p.overlap
  const curvy = clamp(p.curviness, 0, 100) / 100
  const spacing = Math.max(p.spacing, 0.1)
  const variation = clamp(p.variation, 0, 100)
  const c = center(bbox)
  const rot = (q, a) => {
    const dx = q.x - c.x
    const dy = q.y - c.y
    const s = Math.sin(a)
    const co = Math.cos(a)
    return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co }
  }
  const polys = flattenSubpaths(closed).map(({ pts }) => pts.map((q) => rot(q, -angle)))
  let y0 = Infinity
  let y1 = -Infinity
  for (const q of polys.flat()) {
    y0 = Math.min(y0, q.y)
    y1 = Math.max(y1, q.y)
  }
  if (!Number.isFinite(y0) || y1 - y0 < 1e-9) return []
  const step = Math.max(spacing, (y1 - y0) / 2000)
  const pts = []
  let row = 0
  for (let y = y0 + step / 2; y < y1; y += step, row++) {
    const xs = []
    for (const pl of polys) {
      for (let i = 0; i + 1 < pl.length; i++) {
        const a = pl[i]
        const b = pl[i + 1]
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x))
        }
      }
    }
    xs.sort((m, n) => m - n)
    const spans = []
    for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i] - overlap, xs[i + 1] + overlap])
    if (row % 2 === 1) spans.reverse()
    for (const [a, bx] of spans) {
      const jitter = (k) => variation * seededNoise(p.seed, row, k, 3)
      const l = { x: a + jitter(0), y: y + jitter(1) }
      const r = { x: bx + jitter(2), y: y + jitter(3) }
      if (row % 2 === 0) pts.push(l, r)
      else pts.push(r, l)
    }
  }
  if (pts.length < 2) return []
  const line = curvy > 0 ? catmullRom(pts, false, curvy * 2) : polyline(pts, false)
  const back = (q) => rot(q, angle)
  return [{
    closed: false,
    anchors: line.anchors.map((a) => ({ p: back(a.p), hIn: back(a.hIn), hOut: back(a.hOut) }))
  }]
}

const POINTS = ['smooth', 'corner']

/**
 * Register the distort/stylize effects into the live-effect registry
 * (idempotent).
 * @returns {void}
 */
export const registerDistortEffects = () => {
  registerLiveEffect('roughen', {
    label: 'Roughen',
    defaults: { size: 5, relative: true, detail: 10, points: 'smooth', seed: 0 },
    choices: { points: POINTS },
    ranges: { size: { min: 0, max: 1000, step: 1 }, detail: { min: 0, max: 100, step: 1 }, seed: { min: 0, max: 2147483647, step: 1 } },
    apply: roughen
  })
  registerLiveEffect('zigZag', {
    label: 'Zig Zag',
    defaults: { size: 10, relative: false, ridges: 4, points: 'corner' },
    choices: { points: POINTS },
    ranges: { size: { min: -1000, max: 1000, step: 1 }, ridges: { min: 0, max: 100, step: 1 } },
    apply: zigZag
  })
  registerLiveEffect('puckerBloat', {
    label: 'Pucker & Bloat',
    defaults: { amount: 30 },
    ranges: { amount: { min: -200, max: 200, step: 5 } },
    apply: puckerBloat
  })
  registerLiveEffect('twist', {
    label: 'Twist',
    defaults: { angle: 50 },
    ranges: { angle: { min: -3600, max: 3600, step: 5 } },
    apply: twist
  })
  registerLiveEffect('tweak', {
    label: 'Tweak',
    defaults: { h: 10, v: 10, relative: true, anchors: true, in: true, out: true, seed: 0 },
    ranges: { h: { min: 0, max: 1000, step: 1 }, v: { min: 0, max: 1000, step: 1 }, seed: { min: 0, max: 2147483647, step: 1 } },
    apply: tweak
  })
  registerLiveEffect('roundCorners', {
    label: 'Round Corners',
    defaults: { radius: 10 },
    ranges: { radius: { min: 0, max: 1000, step: 1 } },
    apply: roundCorners
  })
  registerLiveEffect('scribble', {
    label: 'Scribble',
    defaults: { angle: 30, overlap: 0, strokeWidth: 3, curviness: 5, spacing: 5, variation: 0.5, seed: 0 },
    ranges: {
      angle: { min: -360, max: 360, step: 5 },
      overlap: { min: -100, max: 100, step: 1 },
      strokeWidth: { min: 0.1, max: 100, step: 0.5 },
      curviness: { min: 0, max: 100, step: 1 },
      spacing: { min: 0.1, max: 200, step: 1 },
      variation: { min: 0, max: 100, step: 0.5 },
      seed: { min: 0, max: 2147483647, step: 1 }
    },
    strokeOutput: { widthParam: 'strokeWidth' },
    apply: scribble
  })
}

export const init = () => registerDistortEffects()
