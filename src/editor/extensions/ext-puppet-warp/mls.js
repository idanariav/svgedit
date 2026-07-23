/**
 * @file mls.js
 *
 * Moving Least Squares (MLS) **rigid** point deformation.
 *
 * Port of the closed-form rigid deformation from
 *   Schaefer, McPhail & Warren, "Image Deformation Using Moving Least Squares",
 *   ACM SIGGRAPH 2006.
 * Reference implementation: https://github.com/Jarvis73/Moving-Least-Squares
 *
 * Given a set of control "pins" (rest position `p` → current position `q`), each
 * point `v` in the plane is displaced by a per-point rigid transform (rotation +
 * translation, no scale/shear) weighted by inverse distance to the pins. This is
 * what gives a "puppet" feel: dragging one pin bends the shape around the pins you
 * left fixed, without shearing.
 *
 * Pure math — no DOM, no svgedit deps — so it unit-tests in isolation.
 *
 * @license MIT
 */

const EPS = 1e-8

/**
 * @typedef {object} Pin
 * @property {number} px  rest x
 * @property {number} py  rest y
 * @property {number} qx  deformed (current) x
 * @property {number} qy  deformed (current) y
 */

/**
 * Deform a single point `v` under the MLS rigid transform defined by `pins`.
 *
 * All coordinates must live in one shared space (pins and `v` alike).
 *
 * @param {{x:number, y:number}} v      Point to deform.
 * @param {Pin[]} pins                  Control pins (rest → current).
 * @param {number} [alpha=1]            Weight falloff exponent. Larger ⇒ more local.
 * @returns {{x:number, y:number}}      Deformed point.
 */
export const deformPoint = (v, pins, alpha = 1) => {
  const n = pins.length

  // 0 pins ⇒ identity.
  if (n === 0) return { x: v.x, y: v.y }

  // 1 pin ⇒ a rigid transform with a single handle is pure translation.
  if (n === 1) {
    return { x: v.x + (pins[0].qx - pins[0].px), y: v.y + (pins[0].qy - pins[0].py) }
  }

  // ── Weights + weighted centroids ──────────────────────────────────────────
  const w = new Array(n)
  let wsum = 0
  let pStarX = 0
  let pStarY = 0
  let qStarX = 0
  let qStarY = 0

  for (let i = 0; i < n; i++) {
    const dx = pins[i].px - v.x
    const dy = pins[i].py - v.y
    const d2 = dx * dx + dy * dy
    // If v coincides with a pin, that pin fully determines the result.
    if (d2 < EPS) {
      return { x: pins[i].qx, y: pins[i].qy }
    }
    const wi = 1 / Math.pow(d2, alpha)
    w[i] = wi
    wsum += wi
    pStarX += wi * pins[i].px
    pStarY += wi * pins[i].py
    qStarX += wi * pins[i].qx
    qStarY += wi * pins[i].qy
  }

  pStarX /= wsum
  pStarY /= wsum
  qStarX /= wsum
  qStarY /= wsum

  // v relative to the weighted rest centroid.
  const vx = v.x - pStarX
  const vy = v.y - pStarY

  // ── Rigid direction vector f̄_r(v) ────────────────────────────────────────
  // For each pin, project (v - p*) onto the local frame {p̂_i, p̂_i^⊥} and
  // accumulate q̂_i under that same rotation. Summing over pins yields a vector
  // whose direction is the rigidly-rotated displacement; its magnitude is then
  // discarded and replaced with |v - p*| to keep the transform length-preserving.
  let frX = 0
  let frY = 0

  for (let i = 0; i < n; i++) {
    const pHatX = pins[i].px - pStarX
    const pHatY = pins[i].py - pStarY
    const qHatX = pins[i].qx - qStarX
    const qHatY = pins[i].qy - qStarY

    // Coordinates of (v - p*) in the frame (p̂_i, p̂_i^⊥), where perp(a,b)=(-b,a):
    //   a =  p̂_i · v̂          (component along  p̂_i)
    //   b =  p̂_i^⊥ · v̂ = -p̂_i.y*v̂.x + p̂_i.x*v̂.y
    const a = pHatX * vx + pHatY * vy
    const b = -pHatY * vx + pHatX * vy

    // Rotate q̂_i into that frame and weight. This maps the basis
    //   p̂_i     ↦ q̂_i
    //   p̂_i^⊥  ↦ q̂_i^⊥   (perp of q̂_i = (-q̂_i.y, q̂_i.x))
    // so the contribution is  a*q̂_i + b*q̂_i^⊥ .
    frX += w[i] * (a * qHatX + b * -qHatY)
    frY += w[i] * (a * qHatY + b * qHatX)
  }

  const frLen = Math.sqrt(frX * frX + frY * frY)

  // Degenerate (all handles collapse) ⇒ fall back to the translated centroid.
  if (frLen < EPS) {
    return { x: qStarX, y: qStarY }
  }

  const vLen = Math.sqrt(vx * vx + vy * vy)
  const scale = vLen / frLen

  return { x: frX * scale + qStarX, y: frY * scale + qStarY }
}

/**
 * Convenience: deform many points with the same pins (weights are recomputed per
 * point, as MLS requires).
 *
 * @param {Array<{x:number, y:number}>} points
 * @param {Pin[]} pins
 * @param {number} [alpha=1]
 * @returns {Array<{x:number, y:number}>}
 */
export const deformPoints = (points, pins, alpha = 1) =>
  points.map((p) => deformPoint(p, pins, alpha))
