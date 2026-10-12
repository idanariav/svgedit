// @ts-check
/**
 * Measure tool maths: the distance, angle and offsets between two points, the 45° constraint, and the readout
 * lines. Pure; `ext-measure` draws it and supplies the unit conversion.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/xform/measure.rs`
 * (MIT OR Apache-2.0).
 * @module measure
 * @license MIT
 */

/**
 * @typedef {object} Measurement
 * @property {number} distance
 * @property {number} angle degrees, counter-clockwise from the +x axis as on paper (the y axis points down on screen), in (-180, 180]
 * @property {number} dx
 * @property {number} dy
 */

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {Measurement}
 */
export const measureSegment = (a, b) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  // `0 - dy` and `+ 0` keep a horizontal line at 0° / 180° (not -0°, not -180°)
  return { distance: Math.hypot(dx, dy), angle: Math.atan2(0 - dy, dx) * 180 / Math.PI + 0, dx, dy }
}

/**
 * The point at the same distance from `a` as `b`, on the nearest multiple of `step` degrees.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {number} [step=45]
 * @returns {{x: number, y: number}}
 */
export const constrainAngle = (a, b, step = 45) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  const snapped = Math.round(Math.atan2(dy, dx) / (step * Math.PI / 180)) * step * Math.PI / 180
  // keep the result exact on the axes (cos(90°) is not 0 in floating point)
  const round = (/** @type {number} */ v) => (Math.abs(v) < 1e-12 ? 0 : v)
  return { x: a.x + round(dist * Math.cos(snapped)), y: a.y + round(dist * Math.sin(snapped)) }
}

/**
 * @param {number} value
 * @param {number} [digits=2]
 * @returns {string} without trailing zeros ("12.5", "3")
 */
export const trimNumber = (value, digits = 2) => String(Number(value.toFixed(digits)) + 0)

/**
 * The readout's lines.
 * @param {Measurement} m
 * @param {(px: number) => number} toUnit px → the document's unit
 * @param {string} unit its name
 * @returns {string[]}
 */
export const readoutLines = (m, toUnit, unit) => [
  `D: ${trimNumber(toUnit(m.distance))} ${unit}`,
  `Angle: ${trimNumber(m.angle, 1)}°`,
  `Δx: ${trimNumber(toUnit(m.dx))} ${unit}`,
  `Δy: ${trimNumber(toUnit(m.dy))} ${unit}`
]
