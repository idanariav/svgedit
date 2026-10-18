/**
 * Bake a finished gesture's transform on a throwaway copy, and hand back what changed (R1: the gesture is stated on the model,
 * the measuring stays where the browser can do it).
 *
 * `recalculateDimensions` and the geometry-remap hooks of the features that cache source geometry (arrow trim, effects…)
 * work on a DOM element: they read the transform list and bounding boxes and write the attributes. Rather than run them on the
 * element the user is dragging, the element is copied into an ephemeral group (`data-se-ephemeral`, never part of the drawing),
 * the bake runs on the copy, and the attributes that differ are returned for the model to take. Only an element without element
 * children is baked this way (a text or group would change its children as well).
 * @module scratch-bake
 * @license MIT
 */
import type SvgCanvas from '../svgcanvas.ts'
import { EPHEMERAL_ATTR } from './history.js'

/**
 * The attribute changes (a string sets, `null` removes) the bake of `el`'s current transform makes, or null when `el` cannot be
 * baked this way.
 */
export const bakeInScratch = (svgCanvas: SvgCanvas, el: Element): Record<string, string | null> | null => {
  const parent = el.parentNode as Element | null
  if (!parent || el.children.length) return null
  const scratch = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
  scratch.setAttribute(EPHEMERAL_ATTR, '')
  const copy = el.cloneNode(true) as Element
  copy.removeAttribute('id') // the copy is not the element: nothing may find it by id
  scratch.append(copy)
  parent.append(scratch)
  const startTransform = svgCanvas.getStartTransform()
  try {
    svgCanvas.setStartTransform(el.getAttribute('transform') || '')
    svgCanvas.recalculateDimensions(copy)
    const changes: Record<string, string | null> = {}
    for (const { name, value } of Array.from(copy.attributes)) {
      if (name !== 'id' && el.getAttribute(name) !== value) changes[name] = value
    }
    for (const { name } of Array.from(el.attributes)) {
      if (name !== 'id' && !copy.hasAttribute(name)) changes[name] = null
    }
    return changes
  } finally {
    svgCanvas.setStartTransform(startTransform)
    scratch.remove()
  }
}
