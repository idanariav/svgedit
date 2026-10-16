/**
 * Helpers for detaching content from group nesting so it becomes independent
 * top-level content (used by Duplicate and Paste) while staying in the same
 * visual position.
 * @module group-detach
 * @license MIT
 */

import Layer from './layer.ts'
import {
  getTransformList,
  matrixMultiply,
  transformListToTransform,
  isIdentity
} from './math.ts'

/**
 * Walks up from `parent` through any nested `<g>`/`<a>` group ancestors,
 * accumulating their combined transform, and returns the first ancestor that
 * isn't a plain group (a layer, or the SVG content root) along with that
 * matrix.
 * @param parent - Ancestor to start walking up from (inclusive)
 */
export const getGroupDetachTarget = (parent: Element): { targetParent: Element, matrix: SVGMatrix } => {
  let matrix = transformListToTransform(null).matrix
  let el = parent as Element | null
  while (el && (el.tagName === 'g' || el.tagName === 'a') && !Layer.isLayer(el)) {
    const tlist = getTransformList(el)
    if (tlist?.numberOfItems) {
      matrix = matrixMultiply(transformListToTransform(tlist).matrix, matrix)
    }
    el = el.parentNode as Element | null
  }
  return { targetParent: el as Element, matrix }
}

/**
 * Bakes a `getGroupDetachTarget` matrix into an element's own transform, so
 * it lands in the same visual position after being moved out of its group
 * ancestors.
 * @param el - Element whose transform is updated in place
 */
export const applyGroupDetachTransform = (el: Element, groupMatrix: SVGMatrix): void => {
  const ownMatrix = transformListToTransform(getTransformList(el)).matrix
  const combined = matrixMultiply(groupMatrix, ownMatrix)
  if (isIdentity(combined)) {
    el.removeAttribute('transform')
  } else {
    el.setAttribute(
      'transform',
      `matrix(${combined.a} ${combined.b} ${combined.c} ${combined.d} ${combined.e} ${combined.f})`
    )
  }
}
