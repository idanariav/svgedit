// @ts-check
/**
 * Snapping while drawing: the point a drawing tool places (the corner of a
 * rectangle, a line's end, a pen anchor, a polygon's centre) snaps to other
 * objects' anchors, bounding-box corners / midpoints / centres and edge lines,
 * and to the page, with the guide lines shown by ext-smart-guides.
 *
 * One entry point, `svgCanvas.snapDrawPoint(x, y)`, called from the pointer
 * prelude in `event.js` (the built-in drawing modes) and from the tool registry
 * (tools that opt in with `snap: true`), so every drawing tool gets the same
 * behaviour. Grid snapping wins when it is on, as in VectorCraft; otherwise this
 * follows the same switch as object-to-object snapping (`smartSnapping`).
 * Targets are collected once per gesture and dropped on mouse-up.
 *
 * @module draw-snap
 * @license MIT
 */

import { collectPointTargets, snapPoint } from './smart-guides.js'

/** The built-in modes in which a press or drag places a point. The pencil (`fhpath`) is free-hand, so it never snaps. */
const DRAW_SNAP_MODES = new Set([
  'text', 'line', 'foreignObject', 'frame', 'square', 'rect', 'image', 'circle', 'ellipse', 'fhellipse', 'fhrect', 'path'
])

/** Snap distance in screen pixels (divided by zoom to get content units). */
const SNAP_PIXELS = 8

export const isDrawSnapMode = (/** @type {string} */ mode) => DRAW_SNAP_MODES.has(mode)

/**
 * @param {any} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas
  /** @type {?import('./smart-guides.js').DrawSnapTargets} */
  let targets = null

  /**
   * @param {number} x document units
   * @param {number} y
   * @param {{tool?: boolean, exclude?: Element[]}} [opts] `tool`: the caller is a registered tool that opted in (any
   *   mode); `exclude`: objects not to snap to (the one being drawn)
   * @returns {{x: number, y: number}} the snapped point, or the input when nothing applies
   */
  const snapDrawPoint = (x, y, opts = {}) => {
    const config = svgCanvas.getCurConfig()
    if (config.gridSnapping || config.smartSnapping === false) return { x, y }
    if (!opts.tool && !DRAW_SNAP_MODES.has(svgCanvas.getCurrentMode())) return { x, y }
    // Inside a group the children's boxes are in the group's local space.
    if (svgCanvas.getCurrentGroup()) return { x, y }
    targets ??= collectPointTargets(svgCanvas, opts.exclude ?? [])
    const hit = snapPoint({ x, y }, targets, SNAP_PIXELS / svgCanvas.getZoom())
    svgCanvas.showDrawGuides?.(hit.point || hit.xLine || hit.yLine ? { at: { x: hit.x, y: hit.y }, ...hit } : null)
    return { x: hit.x, y: hit.y }
  }

  /** End of a gesture: forget the targets (the drawing has changed) and clear the guides. */
  const clearDrawSnap = () => {
    targets = null
  }

  svgCanvas.snapDrawPoint = snapDrawPoint
  svgCanvas.clearDrawSnap = clearDrawSnap
}
