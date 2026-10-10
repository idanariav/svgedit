/**
 * Width profiles: the data behind variable-width strokes (the Width tool and the presets).
 *
 * A profile is a list of width points `[t, left, right]`: `t` is the fraction (0–1) of the path's length
 * and `left` / `right` are the factors of the stroke's width on each side of the path (travelling along the
 * path, y down: `left` is the side on the left of the direction of travel). The width between points is
 * linear. Two points at the same `t` make a discontinuous point: the width steps there.
 *
 * Stored as `se:width-profile="t:l:r;t:l:r;…"` on a stroke drawn as an outline (see taper-stroke.js, which
 * owns the centerline and the outline). Ported from VectorCraft
 * (https://github.com/storytold/vectorcraft), `crates/doc/src/appearance.rs` (`WidthProfile`), MIT OR Apache-2.0.
 *
 * @module width-profile
 * @license MIT
 */

export const WIDTH_PROFILE_ATTR = 'se:width-profile'

/** Points this close in `t` are at the same place (the two sides of a discontinuous point). */
export const SAME_T = 1e-6

/** @typedef {[number, number, number]} WidthPoint `[t, left, right]` */

/**
 * The built-in profiles, in menu order. The plain stroke is "no profile".
 * @type {ReadonlyArray<{id: string, label: string, points: ReadonlyArray<WidthPoint>}>}
 */
export const PRESETS = [
  { id: 'lens', label: 'Lens', points: [[0, 0, 0], [0.5, 1, 1], [1, 0, 0]] },
  { id: 'taperStart', label: 'Taper start', points: [[0, 0, 0], [1, 1, 1]] },
  { id: 'taperEnd', label: 'Taper end', points: [[0, 1, 1], [1, 0, 0]] },
  // Full width at both ends, pinched to a quarter in the middle.
  { id: 'pinch', label: 'Pinch', points: [[0, 1, 1], [0.5, 0.25, 0.25], [1, 1, 1]] },
  // A round head a fifth of the way along, then a long taper to the end.
  { id: 'teardrop', label: 'Teardrop', points: [[0, 0, 0], [0.2, 1, 1], [1, 0, 0]] },
  // Two swells between narrow necks.
  { id: 'wave', label: 'Wave', points: [[0, 0.3, 0.3], [0.25, 1, 1], [0.5, 0.3, 0.3], [0.75, 1, 1], [1, 0.3, 0.3]] }
]

const num = (n) => Math.round(n * 1e5) / 1e5

/**
 * Whether the points form a profile: at least two, `t` in 0–1 and not going back, widths finite and not negative.
 * @param {WidthPoint[]} points
 * @returns {boolean}
 */
export const isProfile = (points) => Array.isArray(points) && points.length >= 2 &&
  points.every(([t, l, r], i) => [t, l, r].every(Number.isFinite) && t >= 0 && t <= 1 && l >= 0 && r >= 0 &&
    (i === 0 || t >= points[i - 1][0]))

/**
 * @param {?string} str an `se:width-profile` value
 * @returns {?WidthPoint[]} null when it is not a profile
 */
export const parseProfile = (str) => {
  if (!str) return null
  const points = str.split(';').map((p) => p.split(':').map(Number))
  return points.every((p) => p.length === 3) && isProfile(points) ? /** @type {WidthPoint[]} */ (points) : null
}

/**
 * @param {WidthPoint[]} points
 * @returns {string}
 */
export const formatProfile = (points) => points.map((p) => p.map(num).join(':')).join(';')

/**
 * Validator for `registerAttrValidator`.
 * @param {string} value
 * @returns {true|string}
 */
export const validateProfile = (value) => (parseProfile(value) ? true : 'is not "t:left:right;…" (t rising, 0–1)')

/**
 * The (left, right) factors at `t`, linear between points.
 * @param {ReadonlyArray<WidthPoint>} points
 * @param {number} t
 * @returns {[number, number]}
 */
export const profileAt = (points, t) => {
  if (!points.length) return [1, 1]
  if (t <= points[0][0]) return [points[0][1], points[0][2]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (t <= b[0]) {
      const u = (t - a[0]) / Math.max(b[0] - a[0], 1e-9)
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
    }
  }
  const last = points[points.length - 1]
  return [last[1], last[2]]
}

/**
 * The (left, right) factors just before and just after `t`: they differ only at a discontinuous point
 * (two points at `t`).
 * @param {ReadonlyArray<WidthPoint>} points
 * @param {number} t
 * @returns {[[number, number], [number, number]]}
 */
export const profileAround = (points, t) => {
  const i = points.findIndex((p) => Math.abs(p[0] - t) <= SAME_T)
  if (i >= 0) {
    let j = i
    while (j + 1 < points.length && Math.abs(points[j + 1][0] - points[i][0]) <= 1e-9) j++
    if (j > i) return [[points[i][1], points[i][2]], [points[j][1], points[j][2]]]
  }
  const v = profileAt(points, t)
  return [v, v]
}

/**
 * The id of the preset these points are, or `'custom'`.
 * @param {?ReadonlyArray<WidthPoint>} points null for the plain stroke
 * @returns {string} `'uniform'`, a preset id or `'custom'`
 */
export const presetId = (points) => {
  if (!points) return 'uniform'
  const same = (a, b) => a.length === b.length && a.every((p, i) => p.every((v, k) => Math.abs(v - b[i][k]) < 1e-6))
  return PRESETS.find((p) => same(p.points, points))?.id ?? 'custom'
}

/**
 * @param {string} id
 * @returns {?WidthPoint[]} a copy of the preset's points
 */
export const presetPoints = (id) => PRESETS.find((p) => p.id === id)?.points.map((p) => /** @type {WidthPoint} */ ([...p])) ?? null

/**
 * The profile with a width point set at `t`: an existing point there (within `SAME_T`) is changed, else one
 * is added in order.
 * @param {ReadonlyArray<WidthPoint>} points
 * @param {number} t
 * @param {number} left
 * @param {number} right
 * @returns {WidthPoint[]}
 */
export const withPoint = (points, t, left, right) => {
  const out = points.map((p) => /** @type {WidthPoint} */ ([...p]))
  const i = out.findIndex((p) => Math.abs(p[0] - t) <= SAME_T)
  if (i >= 0) {
    out[i] = [out[i][0], Math.max(0, left), Math.max(0, right)]
    return out
  }
  const at = out.findIndex((p) => p[0] > t)
  const point = /** @type {WidthPoint} */ ([t, Math.max(0, left), Math.max(0, right)])
  if (at < 0) out.push(point)
  else out.splice(at, 0, point)
  return out
}

/**
 * The profile without the point at `index`. A profile keeps at least two points: removing one of two
 * gives the profile back unchanged.
 * @param {ReadonlyArray<WidthPoint>} points
 * @param {number} index
 * @returns {WidthPoint[]}
 */
export const withoutPoint = (points, index) => {
  const out = points.map((p) => /** @type {WidthPoint} */ ([...p]))
  if (out.length > 2 && index >= 0 && index < out.length) out.splice(index, 1)
  return out
}

/**
 * The profile with the point at `index` moved to `t`, kept between its neighbours.
 * @param {ReadonlyArray<WidthPoint>} points
 * @param {number} index
 * @param {number} t
 * @returns {WidthPoint[]}
 */
export const movedPoint = (points, index, t) => {
  const out = points.map((p) => /** @type {WidthPoint} */ ([...p]))
  if (index < 0 || index >= out.length) return out
  const lo = index > 0 ? out[index - 1][0] + SAME_T * 10 : 0
  const hi = index < out.length - 1 ? out[index + 1][0] - SAME_T * 10 : 1
  out[index][0] = Math.min(Math.max(t, lo), Math.max(lo, hi))
  return out
}

/**
 * The "taper" a profile amounts to at each end, in percent of the full width (the mean of its two sides):
 * what `se:taper` records so that code that only asks "is this stroke tapered" keeps working.
 * @param {ReadonlyArray<WidthPoint>} points
 * @returns {[number, number]}
 */
export const endPercents = (points) => {
  const mean = (p) => Math.round(((p[1] + p[2]) / 2) * 100)
  return [mean(points[0]), mean(points[points.length - 1])]
}
