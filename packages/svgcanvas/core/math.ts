/**
 * Mathematical utilities.
 * @module math
 * @license MIT
 *
 * ©2010 Alexis Deveria, ©2010 Jeff Schiller
 */

import { NS } from './namespaces.ts'
import { warn } from '../common/logger.ts'

export interface AngleCoord45 {
  /** The angle-snapped x value */
  x: number
  /** The angle-snapped y value */
  y: number
  /** The angle (in radians) at which to snap */
  a: number
}

export interface XYObject {
  x: number
  y: number
}

export interface TransformedBox {
  /** Top-left coordinate */
  tl: XYObject
  tr: XYObject
  bl: XYObject
  br: XYObject
  /** Axis-aligned box */
  aabox: { x: number, y: number, width: number, height: number }
}

// Constants
const NEAR_ZERO = 1e-10

// A throwaway SVG element for matrix operations, made on first use so that importing this module needs no DOM
let scratchSvg: SVGSVGElement | undefined
const getScratchSvg = (): SVGSVGElement => (scratchSvg ??= document.createElementNS(NS.SVG, 'svg') as SVGSVGElement)

const createTransformFromMatrix = (m: SVGMatrix): SVGTransform => {
  const createFallback = (matrix: SVGMatrix) => {
    const fallback = getScratchSvg().createSVGMatrix()
    Object.assign(fallback, {
      a: matrix.a,
      b: matrix.b,
      c: matrix.c,
      d: matrix.d,
      e: matrix.e,
      f: matrix.f
    })
    return fallback
  }

  try {
    return getScratchSvg().createSVGTransformFromMatrix(m)
  } catch (e) {
    const t = getScratchSvg().createSVGTransform()
    try {
      t.setMatrix(m)
      return t
    } catch (err) {
      try {
        return getScratchSvg().createSVGTransformFromMatrix(createFallback(m))
      } catch (e2) {
        t.setMatrix(createFallback(m))
        return t
      }
    }
  }
}

/** Transforms a point by a given matrix without DOM calls. */
export const transformPoint = (x: number, y: number, m: SVGMatrix): XYObject => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f
})

/** Gets the transform list (baseVal) from an element if it exists. */
export const getTransformList = (elem: Element): SVGTransformList | undefined => {
  const e = elem as Element & {
    transform?: SVGAnimatedTransformList
    gradientTransform?: SVGAnimatedTransformList
    patternTransform?: SVGAnimatedTransformList
  }
  if (e.transform?.baseVal) {
    return e.transform.baseVal
  }
  if (e.gradientTransform?.baseVal) {
    return e.gradientTransform.baseVal
  }
  if (e.patternTransform?.baseVal) {
    return e.patternTransform.baseVal
  }
  warn('No transform list found. Check browser compatibility.', elem, 'math')
}

/** Checks if a matrix is the identity matrix (1,0,0,1,0,0). */
export const isIdentity = (m: SVGMatrix): boolean =>
  Math.abs(m.a - 1) < NEAR_ZERO &&
  Math.abs(m.b) < NEAR_ZERO &&
  Math.abs(m.c) < NEAR_ZERO &&
  Math.abs(m.d - 1) < NEAR_ZERO &&
  Math.abs(m.e) < NEAR_ZERO &&
  Math.abs(m.f) < NEAR_ZERO

/**
 * Multiplies multiple matrices together (m1 * m2 * ...).
 * Near-zero values are rounded to zero.
 */
export const matrixMultiply = (...args: SVGMatrix[]): SVGMatrix => {
  if (args.length === 0) {
    return getScratchSvg().createSVGMatrix()
  }

  const normalizeNearZero = (matrix: SVGMatrix) => {
    const props = ['a', 'b', 'c', 'd', 'e', 'f'] as const
    for (const prop of props) {
      if (Math.abs(matrix[prop]) < NEAR_ZERO) {
        matrix[prop] = 0
      }
    }
    return matrix
  }

  if (typeof DOMMatrix === 'function' && typeof DOMMatrix.fromMatrix === 'function') {
    const result = args.reduce(
      (acc, curr) => acc.multiply(DOMMatrix.fromMatrix(curr)),
      new DOMMatrix()
    )

    const out = getScratchSvg().createSVGMatrix()
    Object.assign(out, {
      a: result.a,
      b: result.b,
      c: result.c,
      d: result.d,
      e: result.e,
      f: result.f
    })

    return normalizeNearZero(out)
  }

  let m = getScratchSvg().createSVGMatrix()
  for (const curr of args) {
    const next = getScratchSvg().createSVGMatrix()
    Object.assign(next, {
      a: m.a * curr.a + m.c * curr.b,
      b: m.b * curr.a + m.d * curr.b,
      c: m.a * curr.c + m.c * curr.d,
      d: m.b * curr.c + m.d * curr.d,
      e: m.a * curr.e + m.c * curr.f + m.e,
      f: m.b * curr.e + m.d * curr.f + m.f
    })
    m = next
  }

  return normalizeNearZero(m)
}

/** Checks if a transform list includes a non-identity matrix transform. */
export const hasMatrixTransform = (tlist?: SVGTransformList): boolean => {
  if (!tlist) return false
  for (let i = 0; i < tlist.numberOfItems; i++) {
    const xform = tlist.getItem(i)
    if (
      xform.type === SVGTransform.SVG_TRANSFORM_MATRIX &&
      !isIdentity(xform.matrix)
    ) {
      return true
    }
  }
  return false
}

/** Transforms a rectangular box (left, top, width, height) using a given matrix. */
export const transformBox = (l: number, t: number, w: number, h: number, m: SVGMatrix): TransformedBox => {
  const tl = transformPoint(l, t, m)
  const tr = transformPoint(l + w, t, m)
  const bl = transformPoint(l, t + h, m)
  const br = transformPoint(l + w, t + h, m)

  const minx = Math.min(tl.x, tr.x, bl.x, br.x)
  const maxx = Math.max(tl.x, tr.x, bl.x, br.x)
  const miny = Math.min(tl.y, tr.y, bl.y, br.y)
  const maxy = Math.max(tl.y, tr.y, bl.y, br.y)

  return {
    tl,
    tr,
    bl,
    br,
    aabox: {
      x: minx,
      y: miny,
      width: maxx - minx,
      height: maxy - miny
    }
  }
}

/**
 * Consolidates a transform list into a single matrix transform without modifying the original list.
 * `min` is the start index; `max` the end index, defaulting to the list length - 1.
 */
export const transformListToTransform = (tlist: SVGTransformList | undefined | null, min = 0, max: number | null = null): SVGTransform => {
  if (!tlist) {
    return createTransformFromMatrix(getScratchSvg().createSVGMatrix())
  }

  const start = Number.parseInt(String(min), 10)
  const end = Number.parseInt(String(max ?? tlist.numberOfItems - 1), 10)
  const [low, high] = [Math.min(start, end), Math.max(start, end)]

  const matrices = []
  for (let i = low; i <= high; i++) {
    const matrix = (i >= 0 && i < tlist.numberOfItems)
      ? tlist.getItem(i).matrix
      : getScratchSvg().createSVGMatrix()
    matrices.push(matrix)
  }

  const combinedMatrix = matrixMultiply(...matrices)

  const out = getScratchSvg().createSVGMatrix()
  Object.assign(out, {
    a: combinedMatrix.a,
    b: combinedMatrix.b,
    c: combinedMatrix.c,
    d: combinedMatrix.d,
    e: combinedMatrix.e,
    f: combinedMatrix.f
  })

  return createTransformFromMatrix(out)
}

/** Gets the matrix of a given element's transform list. */
export const getMatrix = (elem: Element): SVGMatrix => {
  const tlist = getTransformList(elem)
  return transformListToTransform(tlist).matrix
}

/**
 * Accumulates the transform matrices of an element and its ancestor
 * `<g>`/`<a>` containers up to (but not including) the element whose `id`
 * matches `stopId` (the SVG content root by default). The result maps a point
 * expressed in `elem`'s own local coordinate space into content/user space.
 *
 * For a top-level element (no transformed ancestors) this is the identity
 * matrix, so callers gating on a current group get a no-op outside groups.
 */
export const getMatrixToContent = (elem: Element, stopId = 'svgcontent'): SVGMatrix => {
  let m = getScratchSvg().createSVGMatrix() // identity
  let el = elem as (Element & { transform?: SVGAnimatedTransformList }) | null
  while (el && el.id !== stopId && el.tagName !== 'svg') {
    if ((el.tagName === 'g' || el.tagName === 'a') &&
        el.transform?.baseVal?.numberOfItems) {
      m = matrixMultiply(transformListToTransform(getTransformList(el)).matrix, m)
    }
    el = el.parentNode as typeof el
  }
  return m
}

/** Returns a coordinate snapped to the nearest 15-degree angle. */
export const snapToAngle = (x1: number, y1: number, x2: number, y2: number): AngleCoord45 => {
  const snap = Math.PI / 12 // 15 degrees
  const dx = x2 - x1
  const dy = y2 - y1
  const angle = Math.atan2(dy, dx)
  const dist = Math.hypot(dx, dy)
  const snapAngle = Math.round(angle / snap) * snap

  return {
    x: x1 + dist * Math.cos(snapAngle),
    y: y1 + dist * Math.sin(snapAngle),
    a: snapAngle
  }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Checks if two rectangles (`{x, y, width, height}`) intersect. */
export const rectsIntersect = (r1: Rect, r2: Rect): boolean =>
  r2.x < r1.x + r1.width &&
  r2.x + r2.width > r1.x &&
  r2.y < r1.y + r1.height &&
  r2.y + r2.height > r1.y
