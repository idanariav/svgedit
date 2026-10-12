// @ts-check
/**
 * Transform Each: scale, move, rotate and reflect every selected object about **its own** reference point (one of
 * nine points of its own bounding box), optionally with a random amount per object and optionally on copies.
 * One undo step.
 *
 * Like Flip, the result is one `matrix()` on each element, laid on top of what it already had (no
 * `recalculateDimensions`, which would decompose a rotated or skewed element and relocate it). Live-geometry
 * sources (taper, corner radius, `se:fx`) live in the element's own coordinates, so they stay in sync.
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft), `transformEach` in
 * `crates/engine/src/cmd/menucmds.rs` (MIT OR Apache-2.0).
 * @module transform-each
 * @license MIT
 */

import { getBBox } from './bbox-utils.js'
import { getTransformList, transformListToTransform } from './math.js'

/** Reference points, row by row: top left … bottom right. */
export const REFERENCE_POINTS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']

/**
 * @typedef {object} EachParams
 * @property {number} [scaleH] horizontal scale in percent (100 = unchanged)
 * @property {number} [scaleV] vertical scale in percent
 * @property {number} [moveH] horizontal move, in user units
 * @property {number} [moveV] vertical move
 * @property {number} [rotate] rotation in degrees (clockwise, as on screen)
 * @property {boolean} [reflectX] mirror left ↔ right
 * @property {boolean} [reflectY] mirror top ↔ bottom
 * @property {string} [origin] one of {@link REFERENCE_POINTS}, default `c`
 * @property {boolean} [random] each amount is a random fraction (0..1) of the entered one, per object; a
 *   checked reflection applies to about half of the objects
 * @property {boolean} [copy] work on copies of the selection
 */

/** @typedef {[number, number, number, number, number, number]} Affine `[a, b, c, d, e, f]` as in `matrix()` */

/**
 * @param {Affine} m
 * @param {Affine} n
 * @returns {Affine} `m · n` (n is applied first)
 */
export const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
]

/**
 * @param {string|undefined} origin
 * @returns {{x: number, y: number}} the reference point as fractions of a box (0, 0.5 or 1)
 */
export const referenceFraction = (origin) => {
  const found = REFERENCE_POINTS.indexOf(origin ?? 'c')
  const index = found < 0 ? 4 : found
  return { x: (index % 3) / 2, y: Math.floor(index / 3) / 2 }
}

/**
 * The amounts one object gets: the entered ones, or a random fraction of them.
 * @param {EachParams} params
 * @param {() => number} [rng] in [0, 1)
 * @returns {{sx: number, sy: number, dx: number, dy: number, angle: number, flipX: boolean, flipY: boolean}}
 */
export const resolveAmounts = (params, rng = Math.random) => {
  const num = (/** @type {number|undefined} */ v, /** @type {number} */ neutral) => (Number.isFinite(v) ? /** @type {number} */ (v) : neutral)
  /** Neutral + t × (entered − neutral), t random when asked for. */
  const amount = (/** @type {number|undefined} */ v, /** @type {number} */ neutral) => {
    const entered = num(v, neutral)
    return neutral + (params.random ? rng() : 1) * (entered - neutral)
  }
  const flip = (/** @type {boolean|undefined} */ on) => !!on && (!params.random || rng() < 0.5)
  return {
    sx: amount(params.scaleH, 100) / 100,
    sy: amount(params.scaleV, 100) / 100,
    dx: amount(params.moveH, 0),
    dy: amount(params.moveV, 0),
    angle: amount(params.rotate, 0),
    flipX: flip(params.reflectX),
    flipY: flip(params.reflectY)
  }
}

/**
 * The transform of one object, in its parent's coordinates: scale and reflect, then rotate, both about
 * `(px, py)`, then move.
 * @param {ReturnType<typeof resolveAmounts>} amounts
 * @param {number} px
 * @param {number} py
 * @returns {Affine}
 */
export const eachMatrix = (amounts, px, py) => {
  const rad = amounts.angle * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  /** @type {Affine} */
  const about = [1, 0, 0, 1, px, py]
  /** @type {Affine} */
  const back = [1, 0, 0, 1, -px, -py]
  /** @type {Affine} */
  const scale = [amounts.sx * (amounts.flipX ? -1 : 1), 0, 0, amounts.sy * (amounts.flipY ? -1 : 1), 0, 0]
  /** @type {Affine} */
  const rotate = [cos, sin, -sin, cos, 0, 0]
  /** @type {Affine} */
  const move = [1, 0, 0, 1, amounts.dx, amounts.dy]
  return multiply(move, multiply(about, multiply(rotate, multiply(scale, back))))
}

/**
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  /**
   * Apply Transform Each to the selection (or to copies of it).
   * @function module:transform-each.SvgCanvas#transformEach
   * @param {EachParams} params
   * @param {() => number} [rng] random source for `random` (tests pass a seeded one)
   * @returns {Element[]} the elements that were transformed
   */
  const transformEach = (params, rng = Math.random) => {
    if (!svgCanvas.getSelectedElements().filter(Boolean).length) return []
    const svgRoot = svgCanvas.getSvgRoot()
    const at = referenceFraction(params.origin)
    /** @type {Element[]} */
    let done = []
    svgCanvas.transact('Transform each', () => {
      if (params.copy) svgCanvas.cloneSelectedElements(0, 0)
      done = svgCanvas.getSelectedElements().filter(Boolean)
      for (const el of done) {
        const tlist = getTransformList(el)
        const box = getBBox(el)
        if (!tlist || !box) continue
        const current = transformListToTransform(tlist).matrix
        /** @type {Affine} */
        const own = [current.a, current.b, current.c, current.d, current.e, current.f]
        // The reference point on the box's axis-aligned extent in the parent's coordinates (as Flip does).
        const xs = []
        const ys = []
        for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
          xs.push(own[0] * x + own[2] * y + own[4])
          ys.push(own[1] * x + own[3] * y + own[5])
        }
        const left = Math.min(...xs)
        const top = Math.min(...ys)
        const px = left + at.x * (Math.max(...xs) - left)
        const py = top + at.y * (Math.max(...ys) - top)
        const [a, b, c, d, e, f] = multiply(eachMatrix(resolveAmounts(params, rng), px, py), own)
        const matrix = svgRoot.createSVGMatrix()
        Object.assign(matrix, { a, b, c, d, e, f })
        const transform = svgRoot.createSVGTransform()
        transform.setMatrix(matrix)
        tlist.clear()
        tlist.appendItem(transform)
        svgCanvas.selectorManager.requestSelector(el).resize()
      }
    })
    svgCanvas.call('changed', done)
    return done
  }

  svgCanvas.transformEach = transformEach
}
