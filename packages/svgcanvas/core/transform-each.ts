/**
 * Transform Each: scale, move, rotate and reflect every selected object about **its own** reference point (one of
 * nine points of its own bounding box), optionally with a random amount per object and optionally on copies.
 * One undo step.
 *
 * The result is written the way the editor's own resize leaves an element: the scale (and reflection) is baked
 * into the geometry of a rect / ellipse / line / polyline / polygon / path (`recalculateDimensions`, so live
 * sources such as a taper follow through the remap hooks) and a rotation stays a `rotate(angle, cx, cy)`, so the
 * rotation field reads it and repeated use does not pile up transforms. That needs the combined matrix to be a
 * rotation times an axis scale (orthogonal columns); an element that would be skewed (a rotated element scaled
 * unevenly in the parent's axes) keeps one `matrix()` instead, as Flip does. Other elements (circle, text, image,
 * group, clipped / masked) get the same `rotate` plus one scale / translate `matrix()` without the bake.
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft), `transformEach` in
 * `crates/engine/src/cmd/menucmds.rs` (MIT OR Apache-2.0).
 * @module transform-each
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.ts'
import { getBBox } from './bbox-utils.ts'
import { affineEdit } from './model-commands.ts'
import { getTransformList, transformListToTransform } from './math.ts'

/** Reference points, row by row: top left … bottom right. */
export const REFERENCE_POINTS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']

export interface EachParams {
  /** horizontal scale in percent (100 = unchanged) */
  scaleH?: number
  /** vertical scale in percent */
  scaleV?: number
  /** horizontal move, in user units */
  moveH?: number
  /** vertical move */
  moveV?: number
  /** rotation in degrees (clockwise, as on screen) */
  rotate?: number
  /** mirror left ↔ right */
  reflectX?: boolean
  /** mirror top ↔ bottom */
  reflectY?: boolean
  /** one of {@link REFERENCE_POINTS}, default `c` */
  origin?: string
  /** each amount is a random fraction (0..1) of the entered one, per object; a checked reflection applies to about half of the objects */
  random?: boolean
  /** work on copies of the selection */
  copy?: boolean
}

/** `[a, b, c, d, e, f]` as in `matrix()` */
export type Affine = [number, number, number, number, number, number]

/** @returns `m · n` (n is applied first) */
export const multiply = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
]

/** What `recalculateDimensions` can absorb exactly (a circle would stay round, text and images do not stretch). */
/** What takes a scale into its own attributes through the model (`affineEdit`) */
const MODEL_BAKE = new Set(['rect', 'ellipse', 'line', 'circle', 'polyline', 'polygon', 'path'])
const BAKEABLE = new Set(['rect', 'ellipse', 'line', 'polyline', 'polygon', 'path'])

/**
 * Read a matrix as `rotate(angle) · scale(sx, sy)` (then a translation, which the caller derives).
 * @returns `null` when the matrix skews (its columns are not
 *   perpendicular) or collapses an axis. A reflection takes the reading with the smaller rotation.
 */
export const decompose = (m: Affine): { angle: number, sx: number, sy: number } | null => {
  const [a, b, c, d] = m
  const l1 = Math.hypot(a, b)
  const l2 = Math.hypot(c, d)
  if (l1 < 1e-9 || l2 < 1e-9) return null
  if (Math.abs(a * c + b * d) > 1e-6 * l1 * l2) return null
  let angle = Math.atan2(b, a) * 180 / Math.PI
  let sx = l1
  let sy = a * d - b * c < 0 ? -l2 : l2
  if (sy < 0) {
    const other = angle > 0 ? angle - 180 : angle + 180
    if (Math.abs(other) < Math.abs(angle)) { angle = other; sx = -l1; sy = l2 }
  }
  if (Math.abs(angle) < 1e-7) angle = 0
  return { angle, sx, sy }
}

/** @returns the reference point as fractions of a box (0, 0.5 or 1) */
export const referenceFraction = (origin: string | undefined): { x: number, y: number } => {
  const found = REFERENCE_POINTS.indexOf(origin ?? 'c')
  const index = found < 0 ? 4 : found
  return { x: (index % 3) / 2, y: Math.floor(index / 3) / 2 }
}

/** The amounts one object gets. */
export interface Amounts { sx: number, sy: number, dx: number, dy: number, angle: number, flipX: boolean, flipY: boolean }

/**
 * The amounts one object gets: the entered ones, or a random fraction of them.
 * @param rng in [0, 1)
 */
export const resolveAmounts = (params: EachParams, rng: () => number = Math.random): Amounts => {
  const num = (v: number | undefined, neutral: number): number => (Number.isFinite(v) ? v as number : neutral)
  /** Neutral + t × (entered − neutral), t random when asked for. */
  const amount = (v: number | undefined, neutral: number): number => {
    const entered = num(v, neutral)
    return neutral + (params.random ? rng() : 1) * (entered - neutral)
  }
  const flip = (on: boolean | undefined): boolean => !!on && (!params.random || rng() < 0.5)
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
 */
export const eachMatrix = (amounts: Amounts, px: number, py: number): Affine => {
  const rad = amounts.angle * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const about: Affine = [1, 0, 0, 1, px, py]
  const back: Affine = [1, 0, 0, 1, -px, -py]
  const scale: Affine = [amounts.sx * (amounts.flipX ? -1 : 1), 0, 0, amounts.sy * (amounts.flipY ? -1 : 1), 0, 0]
  const rotate: Affine = [cos, sin, -sin, cos, 0, 0]
  const move: Affine = [1, 0, 0, 1, amounts.dx, amounts.dy]
  return multiply(move, multiply(about, multiply(rotate, multiply(scale, back))))
}

/** whether `m` is the identity (to rounding) */
const isIdentityAffine = (m: Affine): boolean => [1, 0, 0, 1, 0, 0].every((v, i) => Math.abs(m[i] - v) < 1e-9)

const toTransform = (svgRoot: SVGSVGElement, m: Affine): SVGTransform => {
  const matrix = svgRoot.createSVGMatrix()
  Object.assign(matrix, { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] })
  const transform = svgRoot.createSVGTransform()
  transform.setMatrix(matrix)
  return transform
}

/**
 * Apply Transform Each to the selection (or to copies of it).
 * @param rng random source for `random` (tests pass a seeded one)
 * @returns the elements that were transformed
 */
export const transformEach = (
  svgCanvas: Pick<SvgCanvas, 'getSelectedElements' | 'getSvgRoot' | 'transact' | 'cloneSelectedElements' | 'recalculateDimensions' | 'selectorManager' | 'call' | 'getNextId' | 'setElementsAttributes'>,
  params: EachParams,
  rng: () => number = Math.random
): Element[] => {
  if (!svgCanvas.getSelectedElements().filter(Boolean).length) return []
  const svgRoot = svgCanvas.getSvgRoot()
  const at = referenceFraction(params.origin)
  let done: Element[] = []
  svgCanvas.transact('Transform each', () => {
    if (params.copy) svgCanvas.cloneSelectedElements(0, 0)
    done = svgCanvas.getSelectedElements().filter(Boolean)
    const stated: Array<{ el: Element, attrs: Record<string, string | null> }> = []
    for (const el of done) {
      const tlist = getTransformList(el)
      const box = getBBox(el)
      if (!tlist || !box) continue
      const current = transformListToTransform(tlist).matrix
      const own: Affine = [current.a, current.b, current.c, current.d, current.e, current.f]
      // The reference point on the box's axis-aligned extent in the parent's coordinates (as Flip does).
      const xs: number[] = []
      const ys: number[] = []
      for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
        xs.push(own[0] * x + own[2] * y + own[4])
        ys.push(own[1] * x + own[3] * y + own[5])
      }
      const left = Math.min(...xs)
      const top = Math.min(...ys)
      const px = left + at.x * (Math.max(...xs) - left)
      const py = top + at.y * (Math.max(...ys) - top)
      const result = multiply(eachMatrix(resolveAmounts(params, rng), px, py), own)
      const parts = decompose(result)
      if (parts && MODEL_BAKE.has(el.localName)) {
        // A rect / ellipse / line / circle / polyline / polygon takes the scale into its geometry and keeps the rotation as `rotate()`: stated on the model
        const c0 = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        const c1x = result[0] * c0.x + result[2] * c0.y + result[4]
        const c1y = result[1] * c0.x + result[3] * c0.y + result[5]
        const baked = affineEdit(el, { a: parts.sx, d: parts.sy, e: c1x - parts.sx * c0.x, f: c1y - parts.sy * c0.y })
        if (baked) {
          el.id ||= svgCanvas.getNextId()
          const r6 = (n: number) => Number(n.toFixed(6)) // as the browser writes a transform attribute
          baked.transform = parts.angle ? `rotate(${r6(parts.angle)} ${r6(c1x)} ${r6(c1y)})` : null
          stated.push({ el, attrs: baked })
          continue
        }
      }
      tlist.clear()
      if (parts) {
        // Scale about the geometry's centre c0, which lands on c1; the rotation is about c1.
        const c0 = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        const c1x = result[0] * c0.x + result[2] * c0.y + result[4]
        const c1y = result[1] * c0.x + result[3] * c0.y + result[5]
        const scale: Affine = [parts.sx, 0, 0, parts.sy, c1x - parts.sx * c0.x, c1y - parts.sy * c0.y]
        if (!isIdentityAffine(scale)) tlist.appendItem(toTransform(svgRoot, scale))
        if (BAKEABLE.has(el.localName)) svgCanvas.recalculateDimensions(el)
        if (parts.angle) {
          const rotation = svgRoot.createSVGTransform()
          rotation.setRotate(parts.angle, c1x, c1y)
          tlist.insertItemBefore(rotation, 0)
        }
      } else {
        tlist.appendItem(toTransform(svgRoot, result))
      }
      svgCanvas.selectorManager.requestSelector(el).resize()
    }
    if (stated.length) svgCanvas.setElementsAttributes('Transform each', stated)
    for (const { el } of stated) svgCanvas.selectorManager.requestSelector(el).resize()
  })
  svgCanvas.call('changed', done)
  return done
}
