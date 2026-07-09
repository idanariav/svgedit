/**
 * Path offset / inset and stroke-to-path operations.
 *
 * Operates on the single selected element, producing a new filled `<path>`:
 *  - `offsetPath(delta)` grows (delta > 0) or shrinks (delta < 0) the shape outline.
 *  - `strokeToPath()` converts the element's stroke into a filled outline path.
 *
 * Both rely on polygon offsetting (clipper-lib), since paper.js has no offset.
 * Curved paths are flattened to line segments via paper.js before offsetting, so
 * results are polyline `<path>`s. Undo/redo is supported via the BatchCommand system.
 *
 * @module path-offset
 * @license MIT
 */

import ClipperLib from 'clipper-lib'
import { getPaperScope, getStyleAttrs, svgToPaper } from './paper-utils.js'
import { warn } from '../common/logger.js'

// Clipper works on integers — scale coordinates up, then back down.
const SCALE = 1000
// Flattening tolerance (in user units) for converting curves to line segments.
const FLATTEN_TOLERANCE = 0.25

/**
 * Whether `elem` has a stroke that would produce visible geometry when
 * converted: a non-'none' color, a positive width (the SVG initial value of
 * 1 applies when the attribute is absent — `cleanupElement` strips it at
 * that value), and neither stroke-opacity nor element opacity fully zeroed.
 * @param {Element} elem
 * @returns {boolean}
 */
export const hasVisibleStroke = (elem) => {
  const stroke = elem.getAttribute('stroke')
  if (!stroke || stroke === 'none') return false
  const strokeWidthAttr = elem.getAttribute('stroke-width')
  const strokeWidth = strokeWidthAttr === null ? 1 : parseFloat(strokeWidthAttr)
  if (!(strokeWidth > 0)) return false
  const strokeOpacity = elem.getAttribute('stroke-opacity')
  if (strokeOpacity !== null && parseFloat(strokeOpacity) === 0) return false
  const opacity = elem.getAttribute('opacity')
  if (opacity !== null && parseFloat(opacity) === 0) return false
  return true
}

// Reentrant init: the offset operations are created per SvgCanvas instance
// (closed over `svgCanvas` below) so several editors can coexist in one
// realm. Stateless helpers above stay shared.
export const init = (canvas) => {
  const svgCanvas = canvas

/**
 * Build a paper.js CompoundPath for an element, with its transform applied and
 * curves flattened to line segments.
 * @param {Element} elem
 * @param {paper.PaperScope} scope
 * @returns {paper.CompoundPath|null}
 */
const getElemAsFlatItem = (elem, scope) => svgToPaper(elem, scope, { asCompoundPath: true, flatten: FLATTEN_TOLERANCE })

/**
 * Convert a flattened paper item to Clipper polygons (scaled-up integer points).
 * @param {paper.CompoundPath} item
 * @returns {{poly: Array<{X:number,Y:number}>, closed: boolean}[]}
 */
const itemToPolys = (item) => {
  const children = item.children?.length ? item.children : [item]
  return children
    .filter(child => child.segments?.length)
    .map(child => ({
      closed: child.closed,
      poly: child.segments.map(seg => ({
        X: Math.round(seg.point.x * SCALE),
        Y: Math.round(seg.point.y * SCALE)
      }))
    }))
}

/**
 * Serialise Clipper solution polygons (scaled-up integers) to an SVG `d` string.
 * @param {Array<Array<{X:number,Y:number}>>} solution
 * @returns {string}
 */
const solutionToD = (solution) => solution
  .filter(poly => poly.length >= 2)
  .map(poly => {
    const pts = poly.map(p => `${p.X / SCALE},${p.Y / SCALE}`)
    return `M${pts.join('L')}Z`
  })
  .join('')

/**
 * Replace `elem` with a freshly created `<path>` (d + style), recording undo/redo.
 * @param {Element} elem
 * @param {string} d
 * @param {Object} styleAttrs
 */
const replaceWithPath = (elem, d, styleAttrs) => {
  const newPath = svgCanvas.addSVGElementsFromJson({
    element: 'path',
    attr: { id: svgCanvas.getNextId(), d, ...styleAttrs }
  })
  elem.before(newPath)

  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
  const batchCmd = new BatchCommand('Path offset')
  batchCmd.addSubCommand(new InsertElementCommand(newPath))

  const nextSibling = elem.nextSibling
  const parent = elem.parentNode
  batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent))
  elem.remove()

  svgCanvas.clearSelection()
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.selectOnly([newPath], true)
}

/**
 * Grow (delta > 0) or shrink (delta < 0) the selected shape's outline.
 * @param {number} delta - Offset distance in user units.
 */
const offsetPath = (delta) => {
  if (!delta) return
  const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
  if (!elem) {
    warn('Path offset requires a selected shape', null, 'path-offset')
    return
  }

  const scope = getPaperScope()
  const item = getElemAsFlatItem(elem, scope)
  if (!item) {
    warn('Path offset is not supported for this element type', null, 'path-offset')
    return
  }

  const polys = itemToPolys(item)
  if (!polys.length) return

  const co = new ClipperLib.ClipperOffset(2, FLATTEN_TOLERANCE * SCALE)
  polys.forEach(({ poly }) => {
    co.AddPath(poly, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  })

  const solution = new ClipperLib.Paths()
  co.Execute(solution, delta * SCALE)

  if (!solution.length) {
    warn('Offset produced an empty result (inset too large?)', null, 'path-offset')
    return
  }

  const d = solutionToD(solution)
  if (!d) return

  replaceWithPath(elem, d, getStyleAttrs(elem))
}

/**
 * Map an element's stroke-linejoin to a Clipper JoinType.
 */
const joinTypeFor = (elem) => {
  switch (elem.getAttribute('stroke-linejoin')) {
    case 'round': return ClipperLib.JoinType.jtRound
    case 'bevel': return ClipperLib.JoinType.jtSquare
    default: return ClipperLib.JoinType.jtMiter
  }
}

/**
 * Map an element's stroke-linecap to a Clipper open EndType.
 */
const openEndTypeFor = (elem) => {
  switch (elem.getAttribute('stroke-linecap')) {
    case 'round': return ClipperLib.EndType.etOpenRound
    case 'square': return ClipperLib.EndType.etOpenSquare
    default: return ClipperLib.EndType.etOpenButt
  }
}

/**
 * Convert the selected element's stroke into a filled outline `<path>`.
 */
const strokeToPath = () => {
  const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
  if (!elem) {
    warn('Stroke to path requires a selected shape', null, 'path-offset')
    return
  }

  if (!hasVisibleStroke(elem)) {
    warn('Stroke to path requires a visible stroke', null, 'path-offset')
    return
  }
  const stroke = elem.getAttribute('stroke')
  const strokeWidthAttr = elem.getAttribute('stroke-width')
  const strokeWidth = strokeWidthAttr === null ? 1 : parseFloat(strokeWidthAttr)

  const scope = getPaperScope()
  const item = getElemAsFlatItem(elem, scope)
  if (!item) {
    warn('Stroke to path is not supported for this element type', null, 'path-offset')
    return
  }

  const polys = itemToPolys(item)
  if (!polys.length) return

  const halfWidth = (strokeWidth / 2) * SCALE
  const joinType = joinTypeFor(elem)
  const openEnd = openEndTypeFor(elem)

  const co = new ClipperLib.ClipperOffset(2, FLATTEN_TOLERANCE * SCALE)
  polys.forEach(({ poly, closed }) => {
    // A closed line offset on both sides yields the stroke band; open uses linecap.
    const endType = closed ? ClipperLib.EndType.etClosedLine : openEnd
    co.AddPath(poly, joinType, endType)
  })

  const band = new ClipperLib.Paths()
  co.Execute(band, halfWidth)

  if (!band.length) {
    warn('Stroke to path produced an empty result', null, 'path-offset')
    return
  }

  let result = band
  // If the shape is also filled, union the stroke band with the filled interior.
  const fill = elem.getAttribute('fill')
  const hasFill = fill && fill !== 'none'
  if (hasFill && polys.some(p => p.closed)) {
    const fillPolys = polys.filter(p => p.closed).map(p => p.poly)
    const clpr = new ClipperLib.Clipper()
    clpr.AddPaths(band, ClipperLib.PolyType.ptSubject, true)
    clpr.AddPaths(fillPolys, ClipperLib.PolyType.ptClip, true)
    const united = new ClipperLib.Paths()
    clpr.Execute(
      ClipperLib.ClipType.ctUnion, united,
      ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero
    )
    if (united.length) result = united
  }

  const d = solutionToD(result)
  if (!d) return

  // The outline is a filled region painted with the former stroke colour.
  const styleAttrs = getStyleAttrs(elem)
  styleAttrs.fill = hasFill ? fill : stroke
  styleAttrs.stroke = 'none'
  delete styleAttrs['stroke-width']

  replaceWithPath(elem, d, styleAttrs)
}

  svgCanvas.offsetPath = offsetPath
  svgCanvas.strokeToPath = strokeToPath
  svgCanvas.hasVisibleStroke = hasVisibleStroke
}
