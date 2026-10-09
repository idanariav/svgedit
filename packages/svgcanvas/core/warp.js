/**
 * Warp live effect: 15 envelope styles plus horizontal/vertical
 * perspective-like distortion. Each style is a closed-form map on normalised
 * box coordinates (x, y) ∈ [-1, 1]² (y down); the path is split into short
 * pieces whose control points are mapped (`mapNonlinear`).
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/doc/src/live.rs` (`WarpStyle`, `warp_point`) and
 * `crates/effects/src/warp.rs`, MIT OR Apache-2.0. Divergence: VectorCraft
 * clamps a zero-height (or zero-width) box to 1e-9, which makes a warp of a
 * flat line move it by ~1e-9 px; here the missing axis borrows the other
 * axis' half-size so an Arc on a horizontal line visibly bends it.
 *
 * @module warp
 * @license MIT
 */

import { mapNonlinear } from './anchor-path.js'
import { registerLiveEffect } from './live-effects.js'

export const WARP_STYLES = [
  'arc', 'arcLower', 'arcUpper', 'arch', 'bulge', 'shellLower', 'shellUpper', 'flag',
  'wave', 'fish', 'rise', 'fisheye', 'inflate', 'squeeze', 'twist'
]

const { PI } = Math

/**
 * The warp map on normalised coordinates.
 * @param {string} style - One of `WARP_STYLES` (unknown ids act as `arc`).
 * @param {number} b - Bend, -1..1.
 * @param {number} dh - Horizontal distortion, -1..1.
 * @param {number} dv - Vertical distortion, -1..1.
 * @param {number} x - Normalised x, -1..1.
 * @param {number} y - Normalised y, -1..1 (y down).
 * @returns {[number, number]}
 */
export const warpPoint = (style, b, dh, dv, x, y) => {
  const t = (y + 1) / 2 // 0 at top, 1 at bottom
  const par = 1 - x * x // parabola: 1 at centre, 0 at the sides
  let x2
  let y2
  switch (style) {
    case 'arcLower': [x2, y2] = [x, y + b * par * t]; break
    case 'arcUpper': [x2, y2] = [x, y - b * par * (1 - t)]; break
    case 'arch': [x2, y2] = [x, y - b * par]; break
    case 'bulge': [x2, y2] = [x, y + b * par * y]; break
    case 'shellLower': [x2, y2] = [x * (1 - 0.5 * b * (1 - t)), y + b * par * t]; break
    case 'shellUpper': [x2, y2] = [x * (1 - 0.5 * b * t), y - b * par * (1 - t)]; break
    case 'flag': [x2, y2] = [x, y + 0.5 * b * Math.sin(PI * x)]; break
    case 'wave':
      [x2, y2] = [x + 0.1 * b * Math.sin(PI * y), y + 0.3 * b * Math.sin(2 * PI * x) * (0.5 + 0.5 * t)]
      break
    case 'fish': [x2, y2] = [x, y * (1 + 0.5 * b * Math.sin(0.75 * PI * (x + 1)))]; break
    case 'rise': [x2, y2] = [x, y - b * ((x + 1) / 2) ** 2 * 2 + b]; break
    case 'fisheye': {
      const r2 = x * x + y * y
      const s = r2 < 1 ? 1 + 0.5 * b * (1 - r2) : 1
      x2 = x * s
      y2 = y * s
      break
    }
    case 'inflate': [x2, y2] = [x * (1 + 0.5 * b * (1 - y * y)), y * (1 + 0.5 * b * par)]; break
    case 'squeeze': [x2, y2] = [x * (1 - 0.5 * b * (1 - y * y)), y * (1 + 0.3 * b * par)]; break
    case 'twist': {
      const r = Math.hypot(x, y)
      const a = -b * PI * 0.5 * Math.max(1 - r / Math.SQRT2, 0)
      const s = Math.sin(a)
      const c = Math.cos(a)
      ;[x2, y2] = [x * c - y * s, x * s + y * c]
      break
    }
    default: { // arc
      if (Math.abs(b) < 1e-6) {
        [x2, y2] = [x, y]
      } else {
        // Bend the centre line into a circular arc of equal length (sweep = |b|·180°).
        const sweep = Math.abs(b) * PI
        const r0 = 2 / sweep
        const yy = b > 0 ? y : -y
        const a = x / r0
        const r = r0 - yy
        const nx = r * Math.sin(a)
        const ny = r0 - r * Math.cos(a)
        ;[x2, y2] = [nx, b > 0 ? ny : -ny]
      }
    }
  }
  // Perspective-like distortion: horizontal narrows one side, vertical one end.
  if (dh !== 0) y2 *= Math.max(1 + dh * x2 * 0.5, 0)
  if (dv !== 0) x2 *= Math.max(1 + dv * y2 * 0.5, 0)
  return [x2, y2]
}

/**
 * Warp anchor subpaths inside `bbox`.
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @param {{x: number, y: number, width: number, height: number}} bbox
 * @param {{style: string, bend: number, horizontal: number, vertical: number, orientation: string}} p
 * @returns {import('./anchor-path.js').SubPath[]}
 */
export const warpSubpaths = (subpaths, bbox, p) => {
  const bend = Math.min(100, Math.max(-100, p.bend)) / 100
  const dh = Math.min(100, Math.max(-100, p.horizontal)) / 100
  const dv = Math.min(100, Math.max(-100, p.vertical)) / 100
  const vertical = p.orientation === 'vertical'
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  let hw = bbox.width / 2
  let hh = bbox.height / 2
  // A flat box has no extent on one axis: borrow the other one's.
  if (hw < 1e-6) hw = Math.max(hh, 1e-9)
  if (hh < 1e-6) hh = Math.max(hw, 1e-9)
  const f = (q) => {
    const x = (q.x - cx) / hw
    const y = (q.y - cy) / hh
    let x2
    let y2
    if (vertical) {
      const [a, b2] = warpPoint(p.style, bend, dh, dv, y, x)
      x2 = b2
      y2 = a
    } else {
      [x2, y2] = warpPoint(p.style, bend, dh, dv, x, y)
    }
    const out = { x: cx + x2 * hw, y: cy + y2 * hh }
    return Number.isFinite(out.x) && Number.isFinite(out.y) ? out : q
  }
  return mapNonlinear(subpaths, Math.hypot(bbox.width, bbox.height) / 24, f)
}

/**
 * Register the `warp` effect (idempotent).
 * @returns {void}
 */
export const registerWarpEffect = () => {
  registerLiveEffect('warp', {
    label: 'Warp',
    defaults: { style: 'arc', bend: 50, horizontal: 0, vertical: 0, orientation: 'horizontal' },
    choices: { style: WARP_STYLES, orientation: ['horizontal', 'vertical'] },
    ranges: {
      bend: { min: -100, max: 100, step: 5 },
      horizontal: { min: -100, max: 100, step: 5 },
      vertical: { min: -100, max: 100, step: 5 }
    },
    apply: warpSubpaths
  })
}

export const init = () => registerWarpEffect()
