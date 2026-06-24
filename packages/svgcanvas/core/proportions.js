/**
 * @file proportions.js
 *
 * Shared definitions for wireframe-mode proportion markers + snapping.
 * Consumed by:
 *  - `ext-proportion-markers` (editor) — renders the edge triangle markers and
 *    the snap guide lines, and owns the overlay coordinate space.
 *  - core `event.js` — snaps a dragged selection to the proportion lines and
 *    asks the extension to show the matching guide.
 *
 * Keeping the fractions + colors here ensures the markers and the snap lines
 * always agree.
 *
 * @license Apache-2.0
 */

// Each tier groups proportion fractions of the canvas width/height and assigns
// them a distinct size + color. `len` = triangle protrusion into the canvas,
// `base` = triangle base width along the edge (both in screen px).
export const PROPORTION_TIERS = [
  { fracs: [0.5], len: 14, base: 14, color: '#e8462b' }, // half — largest
  { fracs: [1 / 3, 2 / 3], len: 11, base: 11, color: '#f5a623' }, // thirds
  { fracs: [0.25, 0.75], len: 8, base: 8, color: '#2d9cdb' }, // quarters
  { fracs: [0.2, 0.4, 0.6, 0.8], len: 6, base: 6, color: '#27ae60' } // fifths — smallest
]

// Flattened [{ frac, color }] for snap-line/color lookup.
export const PROPORTION_POINTS = PROPORTION_TIERS.flatMap(
  (t) => t.fracs.map((frac) => ({ frac, color: t.color }))
)

/**
 * Proportion lines for one canvas dimension, in user units.
 * @param {Float} dim canvas width or height in user units
 * @returns {Array<{pos: Float, color: string}>}
 */
export const proportionLines = (dim) =>
  PROPORTION_POINTS.map(({ frac, color }) => ({ pos: dim * frac, color }))
