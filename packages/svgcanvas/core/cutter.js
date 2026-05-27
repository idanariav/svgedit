/**
 * Cutter (knife) tool: splits selected shapes along a straight line.
 * Uses the half-plane intersection method with paper.js for reliable
 * open-path cutting (avoids the divide() open-path bug).
 *
 * @module cutter
 * @license MIT
 */

import paper from 'paper/dist/paper-core.js'
import { getPathDFromElement } from './utilities.js'
import { getTransformList, transformListToTransform } from './math.js'
import { warn } from '../common/logger.js'

// Element types that cannot be converted to a path
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs'])

let svgCanvas = null

// Shared paper.js scope — lazy-initialised once on first use
let paperScope = null
const getPaperScope = () => {
  if (!paperScope) {
    paperScope = new paper.PaperScope()
    paperScope.setup(document.createElement('canvas'))
  }
  return paperScope
}

/**
 * Convert an SVG element to a paper.js Path with its transform applied.
 * @param {Element} elem
 * @param {paper.PaperScope} scope
 * @returns {paper.Path|null}
 */
const getElemAsPath = (elem, scope) => {
  if (NON_PATH_TAGS.has(elem.tagName)) return null
  const d = getPathDFromElement(elem)
  if (!d) return null
  const path = new scope.Path(d)
  const tlist = getTransformList(elem)
  if (tlist && tlist.numberOfItems > 0) {
    const matrix = transformListToTransform(tlist).matrix
    path.transform(new scope.Matrix(
      matrix.a, matrix.b,
      matrix.c, matrix.d,
      matrix.e, matrix.f
    ))
  }
  return path
}

/**
 * Collect inheritable style attributes from an element.
 * @param {Element} elem
 * @returns {Object}
 */
const getStyleAttrs = (elem) => {
  const styleAttrs = {}
  for (const attr of ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity']) {
    const val = elem.getAttribute(attr)
    if (val !== null) styleAttrs[attr] = val
  }
  return styleAttrs
}

/**
 * Cut all selected elements along the line (x1,y1)→(x2,y2).
 *
 * Strategy: build two large half-plane rectangles on either side of the cut
 * line, then intersect the target shape with each half-plane. This reliably
 * produces two clean closed pieces regardless of whether the cutter is an
 * open or closed path.
 *
 * @param {number} x1 - Cut line start X (SVG coordinates)
 * @param {number} y1 - Cut line start Y (SVG coordinates)
 * @param {number} x2 - Cut line end X (SVG coordinates)
 * @param {number} y2 - Cut line end Y (SVG coordinates)
 */
const cutShapes = (x1, y1, x2, y2) => {
  // Prefer selected elements; fall back to all shapes in the current layer
  // (mirrors Illustrator knife tool: selection scopes the cut, but is optional)
  let elems = svgCanvas.getSelectedElements().filter(Boolean)
  if (elems.length === 0) {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    elems = Array.from(layer.children).filter(
      el => el.tagName !== 'title' && !NON_PATH_TAGS.has(el.tagName)
    )
  }
  if (elems.length === 0) return

  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6) return

  // Unit direction and perpendicular vectors
  const ux = dx / len
  const uy = dy / len
  const px = -uy  // perpendicular (rotated 90° CCW)
  const py = ux

  // Extend the line far beyond any realistic canvas content
  const FAR = 100000
  const ax = x1 - FAR * ux
  const ay = y1 - FAR * uy
  const bx = x2 + FAR * ux
  const by = y2 + FAR * uy

  const scope = getPaperScope()

  /**
   * Build a half-plane rectangle on one side of the cut line.
   * @param {1|-1} side  +1 = left (perpendicular direction), -1 = right
   */
  const makeHalfPlane = (side) => {
    const s = side
    return new scope.Path({
      segments: [
        new scope.Point(ax, ay),
        new scope.Point(bx, by),
        new scope.Point(bx + s * FAR * px, by + s * FAR * py),
        new scope.Point(ax + s * FAR * px, ay + s * FAR * py)
      ],
      closed: true,
      insert: false
    })
  }

  const hp1 = makeHalfPlane(1)
  const hp2 = makeHalfPlane(-1)

  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
  const batchCmd = new BatchCommand('Cut shapes')
  const resultElems = []

  // A valid piece has non-trivial path data (more than a lone "M x,y")
  const hasValidPiece = (p) => p && p.pathData && p.pathData.length > 4

  for (const elem of elems) {
    const shapePath = getElemAsPath(elem, scope)
    if (!shapePath) {
      warn(`Cutter: cannot convert <${elem.tagName}> to path — skipped`, null, 'cutter')
      continue
    }

    const piece1 = shapePath.intersect(hp1, { insert: false })
    const piece2 = shapePath.intersect(hp2, { insert: false })
    shapePath.remove()

    // Both pieces must be non-empty for a real cut to have occurred.
    // If only one piece is valid, the cut line passed entirely to one side
    // of the shape (not through it), so the shape should be left unchanged.
    if (!hasValidPiece(piece1) || !hasValidPiece(piece2)) {
      piece1?.remove()
      piece2?.remove()
      continue
    }

    const styleAttrs = getStyleAttrs(elem)
    const elemNext = elem.nextSibling
    const elemParent = elem.parentNode

    for (const piece of [piece1, piece2]) {
      if (!hasValidPiece(piece)) {
        piece?.remove()
        continue
      }
      const newPath = svgCanvas.addSVGElementsFromJson({
        element: 'path',
        attr: {
          id: svgCanvas.getNextId(),
          d: piece.pathData,
          ...styleAttrs
        }
      })
      // Preserve z-order by inserting before the original element
      elem.before(newPath)
      batchCmd.addSubCommand(new InsertElementCommand(newPath))
      resultElems.push(newPath)
      piece.remove()
    }

    batchCmd.addSubCommand(new RemoveElementCommand(elem, elemNext, elemParent))
    elem.remove()
  }

  // Clean up half-plane paper objects
  hp1.remove()
  hp2.remove()

  if (batchCmd.isEmpty()) return

  svgCanvas.clearSelection()
  svgCanvas.addCommandToHistory(batchCmd)
  if (resultElems.length > 0) {
    svgCanvas.selectOnly(resultElems, true)
    svgCanvas.call('changed', resultElems)
  }
}

/**
 * @function module:cutter.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
  svgCanvas.cutShapes = cutShapes
}
