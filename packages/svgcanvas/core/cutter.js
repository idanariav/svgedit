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

import { getPaperScope, getStyleAttrs, svgToPaper, toAbsolutePathData } from './paper-utils.js'
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
 * uses an exact construction instead: find every crossing of the polyline
 * with the shape's boundary, then splice the boundary at those crossings
 * and stitch each resulting arc to the matching polyline segment (a
 * "chord") to form each piece's outline directly — no intersect() call
 * needed, and no approximation from a thin stroke-expanded band either
 * (paper.js's boolean ops have a long history of robustness bugs on
 * thin/degenerate input — see paperjs/paper.js #835/#968/#1149/#661/#889 —
 * which this exact-splice approach sidesteps entirely).
 *
 * Handles any even number of crossings ≥ 2 (`m` non-overlapping "bites"),
 * producing `m + 1` pieces: one per bite, plus the remaining "core" shape.
 * Both polyline endpoints must still lie outside the shape, and the
 * cutter itself must be simple (non-self-intersecting) — any other case
 * (odd crossing count, an endpoint inside the shape) leaves the shape
 * unchanged, same fallback as before.
 *
 * The decomposition is a Weiler-Atherton-style face split specialized to
 * "one simple open polyline vs. one simple closed boundary": walking the
 * crossings in shape-boundary order with a stack, a chord's "open" end
 * pushes a new region and its "close" end pops it — the popped region
 * (plus any bites nested fully inside it) is that chord's own piece, and a
 * single chord edge is spliced into the *parent* region in its place. Bites
 * are guaranteed non-overlapping because the cutter doesn't self-intersect.
 * @param {paper.PaperScope} scope
 * @param {paper.Path} shapePath
 * @param {Array<{x:number,y:number}>} points
 * @returns {paper.PathItem[]|null}
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
  if (crossings.length < 2 || crossings.length % 2 !== 0) {
    cutterPath.remove()
    return null
  }
  const m = crossings.length / 2

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
  // Reverse a segment chain while keeping its curvature: flip the segment
  // order AND swap each segment's handleIn/handleOut (mirrors Path#reverse()).
  const reverseArc = (arc) => arc.slice().reverse().map((s) => s.reversed())

  // Pair crossings into m chords by cutter order: consecutive pairs along
  // the cutter are exactly its "inside" stretches (the polyline starts and
  // ends outside the shape, so it alternates outside/inside as it crosses
  // the boundary — entering on each odd-indexed crossing, exiting on the
  // next). Each chord's own two crossings can land in either order on the
  // *shape's* boundary though, independent of this cutter-side order.
  const byCutter = crossings.slice()
    .sort((a, b) => a.getIntersection().getOffset() - b.getIntersection().getOffset())
  const chords = []
  for (let i = 0; i < m; i++) chords.push({ a: byCutter[2 * i], b: byCutter[2 * i + 1] })
  // Whether `a` (the cutter-earlier crossing) is also the shape-earlier
  // ("open") one — the per-chord generalization of the single-pair case's
  // `chordEndsAtB` comparison.
  const chordOpenIsA = chords.map(({ a, b }) => a.getOffset() < b.getOffset())

  // Slice each chord's own straight polyline stretch out of the cutter, in
  // the cutter's natural (a -> b) direction, then precompute both directed
  // copies: "open -> close" (used when a chord is referenced by the region
  // *around* it) and "close -> open" (used by the bite region it encloses).
  const cutterClone = cutterPath.clone({ insert: false })
  const cutterSegAt = byCutter.map((loc) => divideOrGetSegment(cutterClone, loc.getIntersection().getOffset()))
  const chordAtoB = chords.map((_, i) => cutterClone.segments
    .slice(cutterSegAt[2 * i].index, cutterSegAt[2 * i + 1].index + 1).map((s) => s.clone()))
  const chordOpenToClose = chordAtoB.map((segs, i) => (chordOpenIsA[i] ? segs : reverseArc(segs)))
  const chordCloseToOpen = chordAtoB.map((segs, i) => (chordOpenIsA[i] ? reverseArc(segs) : segs))

  // Slice the 2m boundary "gaps" between consecutive shape-side crossings,
  // in ascending shape-offset order (wrapping once back to the start) — the
  // arcAB/arcBA construction from the single-pair case, generalized from 2
  // stretches to 2m.
  const byShape = crossings.slice().sort((a, b) => a.getOffset() - b.getOffset())
  const chordIdOf = new Map()
  chords.forEach((c, i) => { chordIdOf.set(c.a, i); chordIdOf.set(c.b, i) })
  const shapeClone = shapePath.clone({ insert: false })
  const shapeSegAt = byShape.map((loc) => divideOrGetSegment(shapeClone, loc.getOffset()))
  const shapeSegs = shapeClone.segments
  const gapSegs = byShape.map((_, i) => (i < byShape.length - 1
    ? shapeSegs.slice(shapeSegAt[i].index, shapeSegAt[i + 1].index + 1)
    : shapeSegs.slice(shapeSegAt[i].index).concat(shapeSegs.slice(0, shapeSegAt[0].index + 1)) // wraps
  ).map((s) => s.clone()))

  const cleanup = () => { cutterPath.remove(); cutterClone.remove(); shapeClone.remove() }

  // Walk the crossings in shape-boundary order with an explicit stack
  // (bottom frame = the surviving "core" region) to decompose the boundary
  // into m+1 regions — see the function doc comment for the algorithm.
  const stack = [{ chordId: null, items: [] }]
  const seen = new Set()
  const biteItems = new Array(m)
  for (let i = 0; i < byShape.length; i++) {
    const cid = chordIdOf.get(byShape[i])
    if (!seen.has(cid)) {
      seen.add(cid)
      stack.push({ chordId: cid, items: [] })
    } else {
      const frame = stack.pop()
      // A mismatch here means the crossings didn't form a simple
      // non-crossing pairing (shouldn't happen for a non-self-intersecting
      // cutter, but bail rather than emit a wrong cut if it ever does).
      if (!frame || frame.chordId !== cid || stack.length === 0) {
        cleanup()
        return null
      }
      biteItems[cid] = frame.items
      stack[stack.length - 1].items.push({ type: 'chord', chordId: cid })
    }
    stack[stack.length - 1].items.push({ type: 'gap', segs: gapSegs[i] })
  }
  if (stack.length !== 1) {
    cleanup()
    return null
  }

  // Resolve a region's item list (gaps + nested-chord markers) into
  // directed edges: nested chords are always referenced by their *parent*
  // region here, so always in "open -> close" direction.
  const resolveItems = (items) => items.map((item) => (item.type === 'gap'
    ? item
    : { type: 'chord', segs: chordOpenToClose[item.chordId] }))

  // Stitch an alternating chord/arc edge list into one closed path's
  // segments. A chord edge contributes all of its points (with its two
  // endpoints' handles patched from the neighboring arc edges, since the
  // chord's own straight-line handles are zero on both sides — otherwise
  // the piece gets a flat/kinked seam right where the cut meets the
  // boundary instead of following its curve); an arc edge contributes only
  // its interior points (both its endpoints are already covered by the
  // neighboring chords).
  const buildLoopSegments = (edges) => {
    const n = edges.length
    const out = []
    edges.forEach((edge, i) => {
      if (edge.type === 'gap') {
        out.push(...edge.segs.slice(1, -1))
        return
      }
      const prevGap = edges[(i - 1 + n) % n].segs
      const nextGap = edges[(i + 1) % n].segs
      const start = edge.segs[0].clone()
      start.handleIn = prevGap[prevGap.length - 1].handleIn
      const end = edge.segs[edge.segs.length - 1].clone()
      end.handleOut = nextGap[0].handleOut
      out.push(start, ...edge.segs.slice(1, -1), end)
    })
    return out
  }
  const makePiece = (edges) => new scope.Path({ segments: buildLoopSegments(edges), closed: true, insert: false })

  const corePiece = makePiece(resolveItems(stack[0].items))
  const bitePieces = biteItems.map((items, cid) =>
    makePiece([{ type: 'chord', segs: chordCloseToOpen[cid] }, ...resolveItems(items)]))
  const pieces = [corePiece, ...bitePieces]

  cleanup()

  if (pieces.some((p) => !hasValidPiece(p))) {
    pieces.forEach((p) => p.remove())
    return null
  }
  return pieces
}

/**
 * Replace `elem` with the cut pieces (2 or more), batched into `batchCmd`.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Element} elem
 * @param {paper.PathItem[]} pieces
 * @param {*} batchCmd
 * @param {Element[]} resultElems
 */
const replaceWithPieces = (svgCanvas, elem, pieces, batchCmd, resultElems) => {
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

  for (const piece of pieces) {
    const attr = {
      id: svgCanvas.getNextId(),
      d: toAbsolutePathData(piece.pathData, svgCanvas),
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

    replaceWithPieces(svgCanvas, elem, pieces, batchCmd, resultElems)
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
