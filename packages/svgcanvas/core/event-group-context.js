/**
 * Group-editing coordinate helpers shared by `event.js`'s mouseDown/mouseMove
 * preludes and the select/shape-draw mode handlers.
 *
 * When editing inside a group (after double-clicking in), the directly
 * selected children and any newly drawn shapes live in the group's local
 * coordinate space, but pointer math is done in content/user space. These
 * helpers convert between the two using the current group's accumulated
 * matrix. Outside a group context they are no-ops, preserving prior behavior.
 *
 * @module event-group-context
 * @license MIT
 */
import { transformPoint, getMatrixToContent } from './math.js'

/**
 * Modes that operate on existing elements / the selection, working in content
 * (user) space. Every other mode is a "create" mode whose new geometry must be
 * placed in the current group's local space while editing inside a group.
 */
export const CONTENT_SPACE_MODES = ['select', 'multiselect', 'resize', 'rotate', 'pathedit', 'textedit', 'zoom']

/**
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {boolean}
 */
export const isCreateInCurrentGroup = (svgCanvas) =>
  !CONTENT_SPACE_MODES.includes(svgCanvas.getCurrentMode()) && !!svgCanvas.getCurrentGroup()

/**
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Float} dx
 * @param {Float} dy
 * @returns {{dx: Float, dy: Float}}
 */
export const toCurrentGroupLocalDelta = (svgCanvas, dx, dy) => {
  const g = svgCanvas.getCurrentGroup()
  if (!g) { return { dx, dy } }
  const inv = getMatrixToContent(g).inverse()
  // a delta is a vector: apply only the linear part (ignore translation e,f)
  return { dx: inv.a * dx + inv.c * dy, dy: inv.b * dx + inv.d * dy }
}

/**
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Float} x
 * @param {Float} y
 * @returns {{x: Float, y: Float}}
 */
export const toCurrentGroupLocalPoint = (svgCanvas, x, y) => {
  const g = svgCanvas.getCurrentGroup()
  if (!g) { return { x, y } }
  const p = transformPoint(x, y, getMatrixToContent(g).inverse())
  return { x: p.x, y: p.y }
}
