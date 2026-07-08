/**
 * Cutter (knife) tool: splits selected shapes along a cutting line, which may
 * be a single straight segment or an arbitrary open polyline (zigzag).
 *
 * Straight-line cuts use the half-plane intersection method with paper.js
 * for reliable open-path cutting (avoids the divide() open-path bug).
 * Polyline cuts use an exact boundary-splice method instead (see
 * cutWithPolyline below) since half-plane intersection has no equivalent
 * for a multi-segment cutting line.
 *
 * @module cutter
 * @license MIT
 */

import { getPaperScope, getStyleAttrs, svgToPaper } from './paper-utils.js'
import { getMatrixToContent, isIdentity } from './math.js'
import { warn } from '../common/logger.js'

// Element types that cannot be converted to a path (used for the
// selection-fallback filter below; svgToPaper applies the same check itself).
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs'])

// Container tags whose children are recursed into instead of being cut
// directly (groups and, per svgedit convention, hyperlink wrappers).
const CONTAINER_TAGS = new Set(['g', 'a'])

/**
 * Expand a selection into the leaf shapes that can actually be cut, walking
 * into `<g>`/`<a>` containers (including nested groups) so a selected group
 * is cut piece-by-piece rather than skipped outright.
 * @param {Element[]} elems
 * @returns {Element[]}
 */
const collectCuttableElements = (elems) => {
  const result = []
  const visit = (el) => {
    if (el.tagName === 'title') return
    if (CONTAINER_TAGS.has(el.tagName)) {
      Array.from(el.children).forEach(visit)
      return
    }
    if (NON_PATH_TAGS.has(el.tagName)) {
      warn(`Cutter: cannot convert <${el.tagName}> to path — skipped`, null, 'cutter')
      return
    }
    result.push(el)
  }
  elems.forEach(visit)
  return result
}

/**
 * Convert an SVG element to a paper.js Path in content-space coordinates:
 * its own transform (applied by svgToPaper) plus every ancestor `<g>`/`<a>`
 * transform up to the content root, so shapes nested in a (possibly
 * transformed) group land in the same coordinate space as the cut line.
 * @param {Element} elem
 * @param {paper.PaperScope} scope
 * @returns {paper.Path|null}
 */
const getElemAsPath = (elem, scope) => {
  const item = svgToPaper(elem, scope)
  if (!item) return null
  const ancestorMatrix = getMatrixToContent(elem)
  if (!isIdentity(ancestorMatrix)) {
    item.transform(new scope.Matrix(
      ancestorMatrix.a, ancestorMatrix.b,
      ancestorMatrix.c, ancestorMatrix.d,
      ancestorMatrix.e, ancestorMatrix.f
    ))
  }
  return item
}

// A valid piece has non-trivial path data (more than a lone "M x,y")
const hasValidPiece = (p) => p && p.pathData && p.pathData.length > 4

/**
 * Cut `shapePath` along the straight line (p1)→(p2) using the half-plane
 * intersection method: build two large rectangles on either side of the
 * (line extended far in both directions) and intersect the shape with each.
 * @param {paper.PaperScope} scope
 * @param {paper.Path} shapePath
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @returns {[paper.PathItem,paper.PathItem]|null}
 */
const cutWithLine = (scope, shapePath, p1, p2) => {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6) return null

  // Unit direction and perpendicular vectors
  const ux = dx / len
  const uy = dy / len
  const px = -uy // perpendicular (rotated 90° CCW)
  const py = ux

  // Extend the line far beyond any realistic canvas content
  const FAR = 100000
  const ax = p1.x - FAR * ux
  const ay = p1.y - FAR * uy
  const bx = p2.x + FAR * ux
  const by = p2.y + FAR * uy

  /**
   * Build a half-plane rectangle on one side of the cut line.
   * @param {1|-1} side  +1 = left (perpendicular direction), -1 = right
   */
  const makeHalfPlane = (side) => new scope.Path({
    segments: [
      new scope.Point(ax, ay),
      new scope.Point(bx, by),
      new scope.Point(bx + side * FAR * px, by + side * FAR * py),
      new scope.Point(ax + side * FAR * px, ay + side * FAR * py)
    ],
    closed: true,
    insert: false
  })

  const hp1 = makeHalfPlane(1)
  const hp2 = makeHalfPlane(-1)

  const piece1 = shapePath.intersect(hp1, { insert: false })
  const piece2 = shapePath.intersect(hp2, { insert: false })

  hp1.remove()
  hp2.remove()

  // Both pieces must be non-empty for a real cut to have occurred.
  // If only one piece is valid, the cut line passed entirely to one side
  // of the shape (not through it), so the shape should be left unchanged.
  if (!hasValidPiece(piece1) || !hasValidPiece(piece2)) {
    piece1?.remove()
    piece2?.remove()
    return null
  }
  return [piece1, piece2]
}

/**
 * Cut `shapePath` along an open polyline (2+ points, straight segments).
 *
 * Unlike a single line, a polyline has no "half-plane" equivalent, so this
 * uses an exact construction instead: find where the polyline crosses the
 * shape's boundary, then splice the boundary at those two crossings and
 * stitch each resulting arc to the polyline segment between them (the
 * "chord") to form the two piece outlines directly — no intersect() call
 * needed.
 *
 * Scoped to exactly one crossing pair: both ends of the polyline must lie
 * outside the shape, and the polyline must cross the boundary exactly
 * twice. Any other case (0, 1, 3+ crossings, or an endpoint inside the
 * shape) leaves the shape unchanged — see .claude/techdebt.md for the
 * generalization this would need (N crossing pairs, Weiler-Atherton-style
 * stitching).
 * @param {paper.PaperScope} scope
 * @param {paper.Path} shapePath
 * @param {Array<{x:number,y:number}>} points
 * @returns {[paper.PathItem,paper.PathItem]|null}
 */
const cutWithPolyline = (scope, shapePath, points) => {
  const cutterPath = new scope.Path({
    segments: points.map((p) => new scope.Point(p.x, p.y)),
    closed: false,
    insert: false
  })

  const first = points[0]
  const last = points[points.length - 1]
  if (shapePath.contains(new scope.Point(first.x, first.y)) ||
      shapePath.contains(new scope.Point(last.x, last.y))) {
    cutterPath.remove()
    return null
  }

  const crossings = shapePath.getIntersections(cutterPath)
  if (crossings.length !== 2) {
    cutterPath.remove()
    return null
  }

  // Order the two crossings along the shape boundary (A = smaller offset).
  const [locA, locB] = crossings.slice().sort((a, b) => a.getOffset() - b.getOffset())
  // Order their cutter-side counterparts independently along the cutter —
  // the traversal order along the cutter need not match the shape's order.
  const cutLocA = locA.getIntersection()
  const cutLocB = locB.getIntersection()
  const chordEndsAtB = cutLocA.getOffset() <= cutLocB.getOffset()
  const cutOffsetStart = chordEndsAtB ? cutLocA.getOffset() : cutLocB.getOffset()
  const cutOffsetEnd = chordEndsAtB ? cutLocB.getOffset() : cutLocA.getOffset()

  // Insert a real segment at `offset` and return it — unless the offset
  // already lands exactly on an existing segment (e.g. a crossing that
  // coincides with one of the shape's own anchor points, common when
  // cutting straight across an ellipse's left/right/top/bottom), in which
  // case divideAt() has nothing to split and returns null; fall back to the
  // segment already there.
  const divideOrGetSegment = (path, offset) => {
    const loc = path.getLocationAt(offset)
    return path.divideAt(loc) || loc.getSegment()
  }

  // The "chord": the sub-polyline of the cutter strictly between the two
  // crossings, in the cutter's own start-to-end order. Segments are cloned
  // in full (not just their `.point`) so a curved shape boundary keeps its
  // bezier handles instead of being faceted into straight edges below.
  const cutterClone = cutterPath.clone({ insert: false })
  const segStart = divideOrGetSegment(cutterClone, cutOffsetStart)
  const segEnd = divideOrGetSegment(cutterClone, cutOffsetEnd)
  const chordSegs = cutterClone.segments
    .slice(segStart.index, segEnd.index + 1)
    .map((s) => s.clone())

  // The two complementary boundary arcs between the crossings.
  const shapeClone = shapePath.clone({ insert: false })
  const segA = divideOrGetSegment(shapeClone, locA.getOffset())
  const segB = divideOrGetSegment(shapeClone, locB.getOffset())
  const segs = shapeClone.segments
  const arcAB = segs.slice(segA.index, segB.index + 1).map((s) => s.clone()) // A -> ... -> B
  const arcBA = segs.slice(segB.index).concat(segs.slice(0, segA.index + 1))
    .map((s) => s.clone()) // B -> ... (wrap) ... -> A
  // Reverse an arc while keeping its curvature: flip the segment order AND
  // swap each segment's handleIn/handleOut (mirrors Path#reverse()).
  const reverseArc = (arc) => arc.slice().reverse().map((s) => s.reversed())

  // Build one piece's segments from `arc` (oriented so arc[0] is the same
  // point as the chord's last point, and arc[last] is the same point as the
  // chord's first point). The chord's own endpoint segments come from the
  // straight cutter line, so both their handles start at zero — correct on
  // the chord-facing side, but the arc-facing side must instead carry the
  // shape's original curve handle, or the piece gets a flat/kinked seam
  // right where the cut meets the boundary instead of following its curve.
  const buildPieceSegs = (arc) => {
    const chordStart = chordSegs[0].clone()
    chordStart.handleIn = arc[arc.length - 1].handleIn
    const chordEnd = chordSegs[chordSegs.length - 1].clone()
    chordEnd.handleOut = arc[0].handleOut
    return [chordStart, ...chordSegs.slice(1, -1), chordEnd, ...arc.slice(1, -1)]
  }

  const piece1 = new scope.Path({
    segments: buildPieceSegs(chordEndsAtB ? arcBA : arcAB),
    closed: true,
    insert: false
  })
  const piece2 = new scope.Path({
    segments: buildPieceSegs(chordEndsAtB ? reverseArc(arcAB) : reverseArc(arcBA)),
    closed: true,
    insert: false
  })

  cutterPath.remove()
  cutterClone.remove()
  shapeClone.remove()

  if (!hasValidPiece(piece1) || !hasValidPiece(piece2)) {
    piece1?.remove()
    piece2?.remove()
    return null
  }
  return [piece1, piece2]
}

/**
 * Replace `elem` with the two cut pieces, batched into `batchCmd`.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Element} elem
 * @param {paper.PathItem} piece1
 * @param {paper.PathItem} piece2
 * @param {*} batchCmd
 * @param {Element[]} resultElems
 */
const replaceWithPieces = (svgCanvas, elem, piece1, piece2, batchCmd, resultElems) => {
  const { InsertElementCommand, RemoveElementCommand } = svgCanvas.history
  const styleAttrs = getStyleAttrs(elem)
  const elemNext = elem.nextSibling
  const elemParent = elem.parentNode

  // Piece path data is in content-space coordinates, but the new <path> is
  // reinserted as a sibling of elem — inside any ancestor <g>/<a> transforms
  // it had. Counter those with an inverse transform so the piece renders in
  // the same place as the original.
  const ancestorMatrix = getMatrixToContent(elem)
  const compensation = isIdentity(ancestorMatrix) ? null : ancestorMatrix.inverse()

  for (const piece of [piece1, piece2]) {
    const attr = {
      id: svgCanvas.getNextId(),
      d: piece.pathData,
      ...styleAttrs
    }
    if (compensation) {
      attr.transform = `matrix(${compensation.a} ${compensation.b} ${compensation.c} ${compensation.d} ${compensation.e} ${compensation.f})`
    }
    const newPath = svgCanvas.addSVGElementsFromJson({ element: 'path', attr })
    // Preserve z-order by inserting before the original element
    elem.before(newPath)
    batchCmd.addSubCommand(new InsertElementCommand(newPath))
    resultElems.push(newPath)
    piece.remove()
  }

  batchCmd.addSubCommand(new RemoveElementCommand(elem, elemNext, elemParent))
  elem.remove()
}

/**
 * Cut all selected elements along the given cutting line.
 *
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Array<{x:number,y:number}>} points - 2+ points (SVG coordinates).
 *  Exactly 2 points cuts along a straight line; more points cut along the
 *  polyline they describe (straight segments, no curves).
 */
const cutShapes = (svgCanvas, points) => {
  // Prefer selected elements; fall back to all shapes in the current layer
  // (mirrors Illustrator knife tool: selection scopes the cut, but is optional)
  let elems = svgCanvas.getSelectedElements().filter(Boolean)
  if (elems.length === 0) {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    elems = Array.from(layer.children)
  }
  elems = collectCuttableElements(elems)
  if (elems.length === 0) return

  const scope = getPaperScope()
  const { BatchCommand } = svgCanvas.history
  const batchCmd = new BatchCommand('Cut shapes')
  const resultElems = []

  const cutShapePath = points.length === 2
    ? (shapePath) => cutWithLine(scope, shapePath, points[0], points[1])
    : (shapePath) => cutWithPolyline(scope, shapePath, points)

  for (const elem of elems) {
    const shapePath = getElemAsPath(elem, scope)
    if (!shapePath) {
      warn(`Cutter: cannot convert <${elem.tagName}> to path — skipped`, null, 'cutter')
      continue
    }

    const pieces = cutShapePath(shapePath)
    shapePath.remove()
    if (!pieces) continue

    replaceWithPieces(svgCanvas, elem, pieces[0], pieces[1], batchCmd, resultElems)
  }

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
  const svgCanvas = canvas
  svgCanvas.cutShapes = (points) => cutShapes(svgCanvas, points)
}
