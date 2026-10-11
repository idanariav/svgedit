// @ts-check
/**
 * Free Distort and Perspective Distort live effects: the four corners of the shape's box move to new places
 * and the geometry follows. `freeDistort` is a bilinear map of the box onto the quad (straight lines parallel
 * to the box's sides stay straight, the others bend); `perspective` is the projective map through the same four
 * corners (every straight line stays straight, as in a photograph of the flat shape).
 *
 * The corners are eight params in *unit box coordinates* (`0,0` is the top left of the source box, `1,1` the
 * bottom right), in the order top left, top right, bottom right, bottom left, so the effect survives a
 * resize of the source and the defaults are the identity. The on-canvas editor is `ext-distort-tool`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/effects/src/distort.rs`
 * (`free_distort`) and `crates/geom/src/projective.rs` (`Homography`), MIT OR Apache-2.0. Divergence: the
 * projective map is built from the corners with Heckbert's square-to-quad formula, and a flat box (a straight
 * horizontal or vertical line) borrows the other axis' size (as `warp.js` does) so its corners can be pulled apart.
 *
 * @module distort
 * @license MIT
 */

import { mapNonlinear } from './anchor-path.js'
import { registerLiveEffect } from './live-effects.js'

/** @typedef {{x: number, y: number}} Pt */

/** Param names, corner by corner: top left, top right, bottom right, bottom left (each x then y). */
export const CORNER_KEYS = [
  'topLeftX', 'topLeftY', 'topRightX', 'topRightY',
  'bottomRightX', 'bottomRightY', 'bottomLeftX', 'bottomLeftY'
]

/** The identity corners (the box itself), in unit box coordinates. */
export const IDENTITY_CORNERS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

export const DISTORT_EFFECTS = ['freeDistort', 'perspective']

/**
 * @param {Object<string, number>} params
 * @returns {Pt[]} four corners
 */
export const cornersFromParams = (params) =>
  IDENTITY_CORNERS.map((c, i) => ({ x: params[CORNER_KEYS[2 * i]] ?? c.x, y: params[CORNER_KEYS[2 * i + 1]] ?? c.y }))

/**
 * @param {Pt[]} corners
 * @returns {Object<string, number>}
 */
export const paramsFromCorners = (corners) => {
  /** @type {Object<string, number>} */
  const out = {}
  corners.forEach((c, i) => {
    out[CORNER_KEYS[2 * i]] = c.x
    out[CORNER_KEYS[2 * i + 1]] = c.y
  })
  return out
}

/**
 * The box the unit coordinates refer to. A box with no extent on one axis borrows the other axis' size,
 * centred, so the corners of a straight line can still be told apart.
 * @param {{x: number, y: number, width: number, height: number}} bbox
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export const distortFrame = (bbox) => {
  let { width: w, height: h } = bbox
  let { x, y } = bbox
  if (w < 1e-6 && h < 1e-6) {
    w = 1
    h = 1
  }
  if (w < 1e-6) {
    x -= h / 2
    w = h
  } else if (h < 1e-6) {
    y -= w / 2
    h = w
  }
  return { x, y, w, h }
}

/**
 * Whether the quad is strictly convex (all turns the same way): a projective map of the box onto it has no
 * point at infinity inside the box exactly then.
 * @param {Pt[]} q
 * @returns {boolean}
 */
export const isConvexQuad = (q) => {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-12) return false
    const s = Math.sign(cross)
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}

/**
 * The bilinear map of the unit square onto the quad `c`.
 * @param {Pt[]} c
 * @returns {(u: number, v: number) => Pt}
 */
export const bilinearMap = (c) => (u, v) => {
  const topX = c[0].x + (c[1].x - c[0].x) * u
  const topY = c[0].y + (c[1].y - c[0].y) * u
  const botX = c[3].x + (c[2].x - c[3].x) * u
  const botY = c[3].y + (c[2].y - c[3].y) * u
  return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v }
}

/**
 * The projective map of the unit square onto the quad `c` (Heckbert, "Fundamentals of Texture Mapping and
 * Image Warping", square-to-quad). Null when the quad is degenerate or not convex.
 * @param {Pt[]} c
 * @returns {?((u: number, v: number) => Pt)}
 */
export const homographyMap = (c) => {
  if (!isConvexQuad(c)) return null
  const [p0, p1, p2, p3] = c
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  let g = 0
  let h = 0
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dy1 * dx2
    if (Math.abs(den) < 1e-15) return null
    g = (dx3 * dy2 - dy3 * dx2) / den
    h = (dx1 * dy3 - dy1 * dx3) / den
  }
  const a = p1.x - p0.x + g * p1.x
  const b = p3.x - p0.x + h * p3.x
  const d = p1.y - p0.y + g * p1.y
  const e = p3.y - p0.y + h * p3.y
  return (u, v) => {
    const w = g * u + h * v + 1
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w }
  }
}

/**
 * The map the effect `name` applies for these unit corners; a perspective whose corners are not convex falls
 * back to the bilinear map.
 * @param {string} name `freeDistort` or `perspective`
 * @param {Pt[]} corners
 * @returns {(u: number, v: number) => Pt}
 */
export const distortMap = (name, corners) => (name === 'perspective' ? homographyMap(corners) : null) ?? bilinearMap(corners)

/**
 * Distort anchor subpaths inside `bbox`.
 * @param {string} name
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @param {{x: number, y: number, width: number, height: number}} bbox
 * @param {Object<string, number>} params
 * @returns {import('./anchor-path.js').SubPath[]}
 */
export const distortSubpaths = (name, subpaths, bbox, params) => {
  const { x, y, w, h } = distortFrame(bbox)
  const map = distortMap(name, cornersFromParams(params))
  /** @param {Pt} q */
  const f = (q) => {
    const out = map((q.x - x) / w, (q.y - y) / h)
    return Number.isFinite(out.x) && Number.isFinite(out.y) ? { x: x + out.x * w, y: y + out.y * h } : q
  }
  return mapNonlinear(subpaths, Math.hypot(bbox.width, bbox.height) / 16, f)
}

/**
 * Register `freeDistort` and `perspective` (idempotent).
 * @returns {void}
 */
export const registerDistortEffects = () => {
  const defaults = paramsFromCorners(IDENTITY_CORNERS)
  const ranges = Object.fromEntries(CORNER_KEYS.map((k) => [k, { min: -10, max: 10, step: 0.05 }]))
  for (const [name, label] of [['freeDistort', 'Free distort'], ['perspective', 'Perspective distort']]) {
    registerLiveEffect(name, {
      label,
      defaults: { ...defaults },
      ranges,
      apply: (subpaths, bbox, params) => distortSubpaths(name, subpaths, bbox, /** @type {Object<string, number>} */ (params))
    })
  }
}

export const init = () => registerDistortEffects()
