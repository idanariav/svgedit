/**
 * Custom brush geometry: centerline smoothing + a nib-based variable-width
 * outline generator for the freehand "brush" tool (see `ext-brush`).
 *
 * SVG has no native variable-width stroke, so — like `taper-stroke.js` — a
 * brush stroke is rendered as a single filled `<path>` outline rather than a
 * plain stroked line. Unlike `taper-stroke.js` (which only varies width along
 * the stroke via a start/end tip profile), this module also varies width
 * *across* the stroke's direction: a flat/chiseled nib held at a fixed angle
 * produces the classic calligraphy thick/thin effect as the travel direction
 * sweeps past the nib angle, while a fully round nib stays a constant width
 * regardless of direction or angle.
 *
 * This runs on every `pointermove` while drawing, so — unlike
 * `taper-stroke.js` — it deliberately avoids paper.js in the hot path and
 * works in plain `{x, y}` vector math. `finalizeBrushOutline` is the one
 * paper.js-assisted step, run once at `mouseUp` to compact the point-heavy
 * live-drawn outline into a smaller set of cubics.
 *
 * @module brush-stroke
 * @license MIT
 */

import { profile as taperProfile } from './taper-stroke.js'
import { getPaperScope, toAbsolutePathData } from './paper-utils.js'

// Half-width never drops fully to zero on a fully chiseled (roundness=0) nib
// swept parallel to its own angle — that would collapse the outline to a
// zero-area sliver. Expressed as a fraction of the full nib half-width.
const MIN_NIB = 0.08
// Below this roundness (0-100 scale, matching the UI field), stroke ends are
// closed with a straight (butt) join instead of a round arc fan.
const ROUND_CAP_THRESHOLD = 50
// Real pen pressure (0-1) is mapped onto this range rather than 0-1 directly,
// so a light touch still leaves a visible mark instead of thinning to nothing.
const PRESSURE_MIN_FACTOR = 0.35

const CAP_ANGLES = [30, 60, 90, 120, 150]

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (a, k) => ({ x: a.x * k, y: a.y * k })
const len = (a) => Math.hypot(a.x, a.y)
const normalize = (a) => {
  const l = len(a)
  return l > 1e-6 ? scale(a, 1 / l) : { x: 1, y: 0 }
}
/** Rotate a vector by `deg` degrees counter-clockwise. */
const rotate = (v, deg) => {
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

/**
 * Five points sweeping a 180° arc of radius `halfWidth` around `center`, from
 * `+normal` through the outward tangent (`normal` rotated -90°) to `-normal`.
 * Mirrors `taper-stroke.js`'s `CAP_ANGLES` fan, in plain vector math.
 * @param {{x:Float,y:Float}} center
 * @param {{x:Float,y:Float}} normal - Unit vector.
 * @param {Float} halfWidth
 * @returns {Array<{x:Float,y:Float}>}
 */
const capFan = (center, normal, halfWidth) =>
  CAP_ANGLES.map((a) => add(center, rotate(scale(normal, halfWidth), -a)))

/**
 * Nib half-width at a given travel direction: 0 (fully chiseled, `roundness`
 * 0) varies with `|sin(travel - angle)|` — vanishing when travel runs
 * parallel to the nib angle, maxing out perpendicular to it (the classic
 * calligraphy effect) — while `roundness` 100 holds a constant half-width
 * regardless of direction or angle.
 * @param {Float} travelRad
 * @param {Float} angleRad
 * @param {Float} roundness01 - 0-1.
 * @returns {Float} 0-1 factor to scale the full half-width by.
 */
const nibFactor = (travelRad, angleRad, roundness01) => {
  const chisel = Math.max(MIN_NIB, Math.abs(Math.sin(travelRad - angleRad)))
  return chisel + (1 - chisel) * roundness01
}

const pressureFactor = (pressure = 1) =>
  PRESSURE_MIN_FACTOR + (1 - PRESSURE_MIN_FACTOR) * Math.max(0, Math.min(1, pressure))

const pathFromLoop = (points) => {
  if (!points.length) return ''
  const d = ['M', points[0].x, points[0].y]
  for (let i = 1; i < points.length; i++) d.push('L', points[i].x, points[i].y)
  d.push('Z')
  return d.join(' ')
}

/**
 * A zero-length stroke (a tap/click without dragging): render the nib's own
 * footprint as a small ellipse — a thin dash along the nib angle for a
 * chiseled brush, a circle for a round one.
 * @param {{x:Float,y:Float}} center
 * @param {{thickness:Float, angle:Float, roundness:Float, pressure:Float}} p
 * @returns {string}
 */
const buildDab = (center, { thickness, angle, roundness, pressure }) => {
  const roundness01 = Math.max(0, Math.min(100, roundness)) / 100
  const hw = (thickness / 2) * pressureFactor(pressure)
  const along = rotate({ x: 1, y: 0 }, angle) // nib-length direction
  const across = rotate(along, 90)
  const steps = 16
  const pts = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const rx = hw
    const ry = Math.max(MIN_NIB, roundness01) * hw
    pts.push(add(center, add(scale(along, Math.cos(t) * rx), scale(across, Math.sin(t) * ry))))
  }
  return pathFromLoop(pts)
}

/**
 * Build a filled outline `d` string for a brush stroke.
 * @param {Array<{x:Float,y:Float,pressure?:Float}>} points - Centerline
 *  samples (already smoothed), each with optional real pen pressure (0-1,
 *  defaults to 1 — full width — for mouse/touch input).
 * @param {{thickness:Float, angle:Float, roundness:Float, taperStart:Float, taperEnd:Float}} params
 *  `angle` in degrees; `roundness`/`taperStart`/`taperEnd` are 0-100.
 * @returns {string} SVG path `d`, or `''` for fewer than 1 point.
 */
export const buildBrushOutline = (points, params) => {
  if (!points.length) return ''
  const { thickness, angle, roundness, taperStart, taperEnd } = params
  if (points.length < 2 || len(sub(points[points.length - 1], points[0])) < 1e-3) {
    return buildDab(points[points.length - 1], { thickness, angle, roundness, pressure: points[points.length - 1].pressure })
  }

  const angleRad = (angle * Math.PI) / 180
  const roundness01 = Math.max(0, Math.min(100, roundness)) / 100
  const sFrac = Math.max(0, Math.min(100, taperStart)) / 100
  const eFrac = Math.max(0, Math.min(100, taperEnd)) / 100

  const n = points.length
  const dist = new Array(n).fill(0)
  for (let i = 1; i < n; i++) dist[i] = dist[i - 1] + len(sub(points[i], points[i - 1]))
  const total = dist[n - 1] || 1

  const tangents = new Array(n)
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(n - 1, i + 1)]
    tangents[i] = normalize(sub(next, prev))
  }

  const left = new Array(n)
  const right = new Array(n)
  const halfWidths = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = dist[i] / total
    const travelRad = Math.atan2(tangents[i].y, tangents[i].x)
    const factor = nibFactor(travelRad, angleRad, roundness01)
    const hw = Math.max(0.01,
      (thickness / 2) * factor * taperProfile(t, sFrac, eFrac) * pressureFactor(points[i].pressure))
    halfWidths[i] = hw
    const normal = rotate(tangents[i], 90)
    left[i] = add(points[i], scale(normal, hw))
    right[i] = add(points[i], scale(normal, -hw))
  }

  const useRoundCap = roundness >= ROUND_CAP_THRESHOLD
  const endNormal = rotate(tangents[n - 1], 90)
  const startNormal = rotate(tangents[0], 90)
  const endCap = useRoundCap ? capFan(points[n - 1], endNormal, halfWidths[n - 1]) : []
  const startCap = useRoundCap ? capFan(points[0], scale(startNormal, -1), halfWidths[0]) : []

  return pathFromLoop([...left, ...endCap, ...right.slice().reverse(), ...startCap])
}

/**
 * Compact a live-drawn outline's `d` into a smaller set of cubics via
 * paper.js `simplify()`. Run once at `mouseUp`, never during live drawing.
 * @param {string} d
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {string} The simplified `d`, or the input unchanged on failure.
 */
export const finalizeBrushOutline = (d, svgCanvas) => {
  if (!d) return d
  const scope = getPaperScope()
  try {
    const path = new scope.CompoundPath(d)
    path.simplify(0.4)
    const out = path.pathData
    path.remove()
    return out ? toAbsolutePathData(out, svgCanvas) : d
  } catch {
    return d
  }
}

/**
 * Per-stroke EMA low-pass filter on raw pointer samples ("smoothness
 * enforcement while drawing") — the same technique already used for the
 * pencil tool's `pencilStabX/Y` (`event-shape-draw.js`), reimplemented here
 * as self-contained state so the brush and pencil tools never share mutable
 * fields.
 * @param {Float} smoothness - 0 (no smoothing, raw input) to 1 (heavy lag).
 * @returns {{push: function({x:Float,y:Float,pressure?:Float}): {x:Float,y:Float,pressure?:Float}}}
 */
export const createSmoother = (smoothness) => {
  // Cap below 1 so the filter can never fully lock and stop following input.
  const k = Math.max(0, Math.min(0.92, smoothness))
  let prev = null
  return {
    push (raw) {
      if (!prev) {
        prev = { ...raw }
        return prev
      }
      prev = {
        x: prev.x * k + raw.x * (1 - k),
        y: prev.y * k + raw.y * (1 - k),
        pressure: raw.pressure
      }
      return prev
    }
  }
}
