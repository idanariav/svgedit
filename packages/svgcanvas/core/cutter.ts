/**
 * Cutter (knife) tool: splits selected shapes along a cutting line, which may
 * be a single straight segment, an open polyline (zigzag) or an open Bézier
 * path (vertices with handles, drawn like the pen tool).
 *
 * Both use the same exact boundary-splice construction (see `cutContour`
 * below): find every crossing of the cutting line/polyline with the shape's
 * boundary, then splice the boundary at those crossings and stitch each
 * resulting arc to the matching cutter segment (a "chord") to form each
 * piece's outline directly — no `intersect()`/`divide()` boolean-op call
 * needed, and no approximation from a thin stroke-expanded band either
 * (paper.js's boolean ops have a long history of robustness bugs on
 * thin/degenerate input — see paperjs/paper.js #835/#968/#1149/#661/#889 —
 * which this exact-splice approach sidesteps entirely). Crucially, this
 * makes every cut *local*: a shape is only ever split where the cutter
 * actually crosses its boundary, never wherever a boolean op's implicit
 * infinite-plane math happens to reach.
 *
 * A target shape may be a compound path (a single element whose `d` holds
 * several disjoint closed sub-loops — common in multi-part line art). Each
 * loop is cut independently: a loop the cutter doesn't cross is carried
 * through completely untouched, and only loops it actually crosses (an even
 * number of times) get split.
 *
 * A cut through a group splits the group too: what lies on one side of the cut
 * (the pieces, and the children the cut missed) stays in it, the other side
 * moves to a copy of the group inserted after it, nested groups likewise. A cut
 * apple becomes a top group and a bottom group.
 *
 * @module cutter
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.ts'
import type { BatchCommand } from './history.js'
import { getMatrixScale, getOwnTransformScale, getPaperScope, getStyleAttrs, scaleStrokeWidth, svgToPaper, toAbsolutePathData } from './paper-utils.ts'
import { getMatrixToContent, isIdentity } from './math.ts'
import { warn } from '../common/logger.ts'
import { element, type ModelElement } from './model/node.ts'
import { findById, moveNextTo, pathOfId, withChildren, appendIdsTo } from './model/edit.ts'

// Element types that cannot be converted to a path (used for the
// selection-fallback filter below; svgToPaper applies the same check itself).
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs'])

// Container tags whose children are recursed into instead of being cut
// directly (groups and, per svgedit convention, hyperlink wrappers).
const CONTAINER_TAGS = new Set(['g', 'a'])

type Pt = { x: number, y: number }
/**
 * A vertex of the cutting line. `handleIn` / `handleOut` are offsets from the
 * vertex (paper.js's convention); a vertex without them is a corner, so a line
 * of bare points is a polyline.
 */
export type CutPoint = Pt & { handleIn?: Pt, handleOut?: Pt }

// Samples per curved stretch when a curved cut is flattened for `sideOfCut`.
const CURVE_SAMPLES = 16

/**
 * The cutting line as a polyline: bare points as they are, each curved stretch
 * (a handle on either end) sampled along its cubic. `sideOfCut` judges against it.
 */
export const flattenCut = (points: CutPoint[]): Pt[] => {
  if (points.length === 0) return []
  const out: Pt[] = [{ x: points[0].x, y: points[0].y }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i]
    if (!a.handleOut && !b.handleIn) {
      out.push({ x: b.x, y: b.y })
      continue
    }
    const c1 = { x: a.x + (a.handleOut?.x ?? 0), y: a.y + (a.handleOut?.y ?? 0) }
    const c2 = { x: b.x + (b.handleIn?.x ?? 0), y: b.y + (b.handleIn?.y ?? 0) }
    for (let k = 1; k <= CURVE_SAMPLES; k++) {
      const t = k / CURVE_SAMPLES; const u = 1 - t
      const w0 = u * u * u; const w1 = 3 * u * u * t; const w2 = 3 * u * t * t; const w3 = t * t * t
      out.push({ x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x, y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y })
    }
  }
  return out
}
/** A stretch of the shape's boundary between two crossings. */
type GapEdge = { type: 'gap', segs: paper.Segment[] }
/** A cutter stretch, by index (in a region's item list) or with its segments (once resolved). */
type ChordRef = { type: 'chord', chordId: number }
type ChordEdge = { type: 'chord', segs: paper.Segment[] }

/**
 * Expand a selection into the leaf shapes that can actually be cut, walking
 * into `<g>`/`<a>` containers (including nested groups) so a selected group
 * is cut piece-by-piece rather than skipped outright.
 */
const collectCuttableElements = (elems: Element[]): Element[] => {
  const result: Element[] = []
  const visit = (el: Element): void => {
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
 * Convert an SVG element to a paper.js CompoundPath in content-space
 * coordinates: its own transform (applied by svgToPaper) plus every
 * ancestor `<g>`/`<a>` transform up to the content root, so shapes nested in
 * a (possibly transformed) group land in the same coordinate space as the
 * cut line. Always a CompoundPath (even for a single-loop shape, as a
 * 1-child one) so multi-subpath `d` data — several disjoint closed loops in
 * one element — is preserved as separate loops instead of being silently
 * welded together by `Path`'s single-contour parsing.
 */
const getElemAsPath = (elem: Element, scope: paper.PaperScope): paper.CompoundPath | null => {
  const item = svgToPaper(elem, scope, { asCompoundPath: true })
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

/**
 * Which side of the cut `p` lies on: the sign of the cross product against the
 * nearest stretch of the cut, its first and last stretches extended past the
 * ends, so the cut parts the whole plane in two. 1 or -1.
 */
export const sideOfCut = (points: Pt[], p: Pt): number => {
  let best = Infinity
  let side = 1
  const last = points.length - 2
  for (let i = 0; i <= last; i++) {
    const a = points[i]; const b = points[i + 1]
    const dx = b.x - a.x; const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (!len2) continue
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    if (i > 0) t = Math.max(t, 0)
    if (i < last) t = Math.min(t, 1)
    const dist = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (dist < best) {
      best = dist
      side = dx * (p.y - a.y) - dy * (p.x - a.x) < 0 ? -1 : 1
    }
  }
  return side
}

/** A leaf's position in content space, for `sideOfCut`: the centre of its box. */
const contentCentre = (svgCanvas: SvgCanvas, el: Element): Pt | null => {
  const g = el as SVGGraphicsElement
  const box = g.getBBox?.()
  const to = g.getCTM?.()
  const root = (svgCanvas.getSvgContent() as unknown as SVGGraphicsElement).getCTM()
  if (!box || !to || !root) return null
  const m = root.inverse().multiply(to)
  const x = box.x + box.width / 2; const y = box.y + box.height / 2
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}

/** How a group the cut went through splits: the children that move to its copy, in order, nested splits included. */
interface GroupSplit { id: string, copyId: string, moves: Array<string | GroupSplit> }

/**
 * Plan the split of a group the cut went through: the children on the -1 side
 * move to a copy of the group (whole, or split again when they are groups
 * across the cut). Read from the DOM; `applySplit` states it on the model.
 */
const planSplit = (svgCanvas: SvgCanvas, group: Element, sidesOf: (el: Element) => Set<number>): GroupSplit => {
  const moves: Array<string | GroupSplit> = []
  for (const child of Array.from(group.children)) {
    const sides = sidesOf(child)
    if (sides.size === 2) moves.push(planSplit(svgCanvas, child, sidesOf))
    else if (sides.has(-1) && child.id) moves.push(child.id)
  }
  return { id: group.id, copyId: svgCanvas.getNextId(), moves }
}

/** A copy of the group `id`: its attributes (with `copyId`) and its `<title>`, no other children. */
const emptyCopy = (root: ModelElement, id: string, copyId: string): ModelElement | null => {
  const group = findById(root, id)
  if (!group) return null
  const attrs = group.attrs.map((a) => (a.name === 'id' ? { ...a, value: copyId } : a))
  return element(group.name, attrs, group.children.filter((c) => c.kind === 'element' && c.name === 'title'))
}

/** Append an empty copy of `split.id` to the element `intoId`, then move into it what goes. */
const fillCopy = (root: ModelElement, split: GroupSplit, intoId: string): ModelElement => {
  const copy = emptyCopy(root, split.id, split.copyId)
  const at = pathOfId(root, intoId)
  if (!copy || !at) return root
  let out = withChildren(root, at, (kids) => [...kids, copy])
  for (const move of split.moves) {
    out = typeof move === 'string' ? appendIdsTo(out, split.copyId, [move]) : fillCopy(out, move, split.copyId)
  }
  return out
}

/** The split, on the model: the copy goes right after the group. */
const applySplit = (root: ModelElement, split: GroupSplit): ModelElement =>
  moveNextTo(fillCopy(root, split, split.id), split.copyId, split.id, 'after')

// A valid piece has non-trivial path data (more than a lone "M x,y")
const hasValidPiece = (p: { pathData?: string } | null | undefined): boolean => Boolean(p && p.pathData && p.pathData.length > 4)

/**
 * Cut one simple closed contour along an open cutter line (2+ vertices, straight
 * or curved, already built as a paper.Path). Returns `null` if the cutter doesn't
 * cross this contour's boundary an even number of times ≥ 2, or if the
 * crossings don't form a simple non-crossing pairing — either way meaning
 * this contour should be left completely untouched.
 *
 * Handles any even number of crossings ≥ 2 (`m` non-overlapping "bites"),
 * producing `m + 1` pieces: one per bite, plus the remaining "core" of this
 * contour. The cutter itself must be simple (non-self-intersecting).
 *
 * The decomposition is a Weiler-Atherton-style face split specialized to
 * "one simple open polyline vs. one simple closed boundary": walking the
 * crossings in shape-boundary order with a stack, a chord's "open" end
 * pushes a new region and its "close" end pops it — the popped region
 * (plus any bites nested fully inside it) is that chord's own piece, and a
 * single chord edge is spliced into the *parent* region in its place. Bites
 * are guaranteed non-overlapping because the cutter doesn't self-intersect.
 * @param contourPath - One simple closed contour (a
 *  CompoundPath child, or a whole single-loop shape).
 * @param cutterPath - The (already-built, not-yet-removed)
 *  open cutter polyline — owned by the caller, not removed here.
 */
const cutContour = (scope: paper.PaperScope, contourPath: paper.Path, cutterPath: paper.Path): { core: paper.Path, bites: paper.Path[] } | null => {
  const crossings = contourPath.getIntersections(cutterPath)
  if (crossings.length < 2 || crossings.length % 2 !== 0) return null
  const m = crossings.length / 2

  // Insert a real segment at `offset` and return it — unless the offset
  // already lands exactly on an existing segment (e.g. a crossing that
  // coincides with one of the shape's own anchor points, common when
  // cutting straight across an ellipse's left/right/top/bottom), in which
  // case divideAt() has nothing to split and returns null; fall back to the
  // segment already there.
  const divideOrGetSegment = (path: paper.Path, offset: number): paper.Segment => {
    const loc = path.getLocationAt(offset) as paper.CurveLocation
    return path.divideAt(loc) || loc.segment
  }
  // Reverse a segment chain while keeping its curvature: flip the segment
  // order AND swap each segment's handleIn/handleOut (mirrors Path#reverse()).
  const reverseArc = (arc: paper.Segment[]): paper.Segment[] => arc.slice().reverse().map((s) => s.reversed())

  // Pair crossings into m chords by cutter order: consecutive pairs along
  // the cutter are exactly its "inside" stretches (the polyline starts and
  // ends outside the shape, so it alternates outside/inside as it crosses
  // the boundary — entering on each odd-indexed crossing, exiting on the
  // next). Each chord's own two crossings can land in either order on the
  // *shape's* boundary though, independent of this cutter-side order.
  const byCutter = crossings.slice()
    .sort((a, b) => a.intersection.offset - b.intersection.offset)
  const chords: Array<{ a: paper.CurveLocation, b: paper.CurveLocation }> = []
  for (let i = 0; i < m; i++) chords.push({ a: byCutter[2 * i], b: byCutter[2 * i + 1] })
  // Whether `a` (the cutter-earlier crossing) is also the shape-earlier
  // ("open") one — the per-chord generalization of the single-pair case's
  // `chordEndsAtB` comparison.
  const chordOpenIsA = chords.map(({ a, b }) => a.offset < b.offset)

  // Slice each chord's own stretch (straight or curved) out of the cutter, in
  // the cutter's natural (a -> b) direction, then precompute both directed
  // copies: "open -> close" (used when a chord is referenced by the region
  // *around* it) and "close -> open" (used by the bite region it encloses).
  const cutterClone = cutterPath.clone({ insert: false })
  const cutterSegAt = byCutter.map((loc) => divideOrGetSegment(cutterClone, loc.intersection.offset))
  const chordAtoB = chords.map((_, i) => cutterClone.segments
    .slice(cutterSegAt[2 * i].index, cutterSegAt[2 * i + 1].index + 1).map((s) => s.clone()))
  const chordOpenToClose = chordAtoB.map((segs, i) => (chordOpenIsA[i] ? segs : reverseArc(segs)))
  const chordCloseToOpen = chordAtoB.map((segs, i) => (chordOpenIsA[i] ? reverseArc(segs) : segs))

  // Slice the 2m boundary "gaps" between consecutive shape-side crossings,
  // in ascending shape-offset order (wrapping once back to the start) — the
  // arcAB/arcBA construction from the single-pair case, generalized from 2
  // stretches to 2m.
  const byShape = crossings.slice().sort((a, b) => a.offset - b.offset)
  const chordIdOf = new Map<paper.CurveLocation, number>()
  chords.forEach((c, i) => { chordIdOf.set(c.a, i); chordIdOf.set(c.b, i) })
  const shapeClone = contourPath.clone({ insert: false })
  const shapeSegAt = byShape.map((loc) => divideOrGetSegment(shapeClone, loc.offset))
  const shapeSegs = shapeClone.segments
  const gapSegs = byShape.map((_, i) => (i < byShape.length - 1
    ? shapeSegs.slice(shapeSegAt[i].index, shapeSegAt[i + 1].index + 1)
    : shapeSegs.slice(shapeSegAt[i].index).concat(shapeSegs.slice(0, shapeSegAt[0].index + 1)) // wraps
  ).map((s) => s.clone()))

  const cleanup = () => { cutterClone.remove(); shapeClone.remove() }

  // Walk the crossings in shape-boundary order with an explicit stack
  // (bottom frame = the surviving "core" region) to decompose the boundary
  // into m+1 regions — see the function doc comment for the algorithm.
  type Item = GapEdge | ChordRef
  const stack: Array<{ chordId: number | null, items: Item[] }> = [{ chordId: null, items: [] }]
  const seen = new Set<number>()
  const biteItems: Item[][] = new Array(m)
  for (let i = 0; i < byShape.length; i++) {
    const cid = chordIdOf.get(byShape[i]) as number
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
  const resolveItems = (items: Item[]): Array<GapEdge | ChordEdge> => items.map((item): GapEdge | ChordEdge => (item.type === 'gap'
    ? item
    : { type: 'chord', segs: chordOpenToClose[item.chordId] }))

  // Stitch an alternating chord/arc edge list into one closed path's
  // segments. A chord edge contributes all of its points (with its two
  // endpoints' outer handles patched from the neighboring arc edges: the
  // chord only knows the cutter's handles on its inner side — otherwise
  // the piece gets a flat/kinked seam right where the cut meets the
  // boundary instead of following its curve); an arc edge contributes only
  // its interior points (both its endpoints are already covered by the
  // neighboring chords).
  const buildLoopSegments = (edges: Array<GapEdge | ChordEdge>): paper.Segment[] => {
    const n = edges.length
    const out: paper.Segment[] = []
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
  const makePiece = (edges: Array<GapEdge | ChordEdge>): paper.Path => new scope.Path({ segments: buildLoopSegments(edges), closed: true, insert: false })

  const core = makePiece(resolveItems(stack[0].items))
  const bites = biteItems.map((items, cid) =>
    makePiece([{ type: 'chord', segs: chordCloseToOpen[cid] } as ChordEdge, ...resolveItems(items)]))

  cleanup()
  return { core, bites }
}

/**
 * Cut `shapePath` (a CompoundPath — one or more disjoint closed loops) along
 * an open cutter line (2+ vertices, straight or with Bézier handles).
 *
 * Each loop is cut independently via `cutContour`: a loop the cutter
 * doesn't cross (an even number of times ≥ 2) is carried through into the
 * result completely unchanged, alongside whichever loops it does cross.
 * Both cutter endpoints must lie outside `shapePath` as a whole, checked
 * once up front.
 */
const cutShapePath = (scope: paper.PaperScope, shapePath: paper.CompoundPath, points: CutPoint[]): paper.PathItem[] | null => {
  const handle = (h: Pt | undefined) => (h ? new scope.Point(h.x, h.y) : undefined)
  const cutterPath = new scope.Path({
    segments: points.map((p) => new scope.Segment(new scope.Point(p.x, p.y), handle(p.handleIn), handle(p.handleOut))),
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

  const untouchedChildren: paper.Item[] = []
  const coreChildren: paper.Path[] = []
  const bitePieces: paper.Path[] = []
  for (const child of shapePath.children) {
    const result = cutContour(scope, child as paper.Path, cutterPath)
    if (!result) {
      untouchedChildren.push(child.clone({ insert: false }))
    } else {
      coreChildren.push(result.core)
      bitePieces.push(...result.bites)
    }
  }
  cutterPath.remove()

  // No loop was actually crossed — leave the shape entirely unchanged.
  if (coreChildren.length === 0) {
    untouchedChildren.forEach((c) => c.remove())
    return null
  }

  const corePiece = new scope.CompoundPath({ children: [...untouchedChildren, ...coreChildren], insert: false })
  const pieces: paper.PathItem[] = [corePiece, ...bitePieces]

  if (pieces.some((p) => !hasValidPiece(p))) {
    pieces.forEach((p) => p.remove())
    return null
  }
  return pieces
}

/**
 * Replace `elem` with the cut pieces (2 or more), batched into `batchCmd`.
 */
const replaceWithPieces = (
  svgCanvas: SvgCanvas, elem: Element, pieces: paper.PathItem[], batchCmd: BatchCommand, resultElems: Element[],
  pieceSide: (piece: paper.PathItem) => number, sides: Map<Element, number>
): void => {
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
  // The piece's geometry has elem's own transform baked in, and `compensation` cancels the ancestors' transforms for the
  // stroke as well as the geometry: the stroke takes both scales to look as it did.
  scaleStrokeWidth(styleAttrs, getOwnTransformScale(elem) * (compensation ? getMatrixScale(ancestorMatrix) : 1), elem)

  for (const piece of pieces) {
    const attr: Record<string, string> = {
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
    // a piece may be concave: a point inside it, not its box's centre, says which side it is on
    sides.set(newPath, pieceSide(piece))
    piece.remove()
  }

  batchCmd.addSubCommand(new RemoveElementCommand(elem, elemNext, elemParent))
  elem.remove()
}

/**
 * Cut all selected elements along the given cutting line.
 *
 * @param points - 2+ vertices (SVG coordinates).
 *  Exactly 2 bare points cut along a straight line; more cut along the
 *  polyline they describe; a vertex with `handleIn` / `handleOut` curves the
 *  stretches on either side of it.
 */
const cutShapes = (svgCanvas: SvgCanvas, points: CutPoint[]): void => {
  // Prefer selected elements; fall back to all shapes in the current layer
  // (mirrors Illustrator knife tool: selection scopes the cut, but is optional)
  let targets = svgCanvas.getSelectedElements().filter(Boolean)
  if (targets.length === 0) {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer() as SVGGElement
    targets = Array.from(layer.children)
  }
  const elems = collectCuttableElements(targets)
  if (elems.length === 0) return

  const scope = getPaperScope()
  const { BatchCommand } = svgCanvas.history
  const batchCmd = new BatchCommand('Cut shapes')
  const resultElems: Element[] = []
  const sides = new Map<Element, number>()
  const line = flattenCut(points)
  const pieceSide = (piece: paper.PathItem): number => {
    const p = piece.interiorPoint
    return sideOfCut(line, { x: p.x, y: p.y })
  }

  for (const elem of elems) {
    const shapePath = getElemAsPath(elem, scope)
    if (!shapePath) {
      warn(`Cutter: cannot convert <${elem.tagName}> to path — skipped`, null, 'cutter')
      continue
    }

    const pieces = cutShapePath(scope, shapePath, points)
    shapePath.remove()
    if (!pieces) continue

    replaceWithPieces(svgCanvas, elem, pieces, batchCmd, resultElems, pieceSide, sides)
  }

  if (batchCmd.isEmpty()) return

  // The groups the cut went through split in two along it.
  const sidesOf = (el: Element): Set<number> => {
    if (el.tagName === 'title') return new Set()
    if (CONTAINER_TAGS.has(el.tagName)) return new Set(Array.from(el.children).flatMap((c) => [...sidesOf(c)]))
    let side = sides.get(el)
    if (side === undefined) {
      const c = contentCentre(svgCanvas, el)
      side = c ? sideOfCut(line, c) : 1
      sides.set(el, side)
    }
    return new Set([side])
  }
  const cutGroups = targets.filter((el) => el.isConnected && CONTAINER_TAGS.has(el.tagName) &&
    resultElems.some((piece) => el.contains(piece)) && sidesOf(el).size === 2)
  const splits = cutGroups.filter((group) => group.id).map((group) => planSplit(svgCanvas, group, sidesOf))
  if (splits.length) svgCanvas.snapshotHistory.edit('Cut shapes', (root) => splits.reduce(applySplit, root))
  const halves = splits.flatMap(({ id, copyId }) => [svgCanvas.getElement(id), svgCanvas.getElement(copyId)]).filter((el): el is Element => Boolean(el))
  // a split group is selected as its two halves
  const selection = [...halves, ...resultElems.filter((piece) => !halves.some((h) => h.contains(piece)))]

  svgCanvas.clearSelection()
  svgCanvas.addCommandToHistory(batchCmd)
  if (selection.length > 0) {
    svgCanvas.selectOnly(selection, true)
    svgCanvas.call('changed', selection)
  }
}

/** The members `cutter.ts` gives its canvas. */
export interface CutterApi {
  cutShapes(points: CutPoint[]): void
}

export const createCutter = (canvas: SvgCanvas): CutterApi => {
  const svgCanvas = canvas

  return {
    // one undo step: the pieces (written to the DOM) and a group split (stated on the model)
    cutShapes: (points: CutPoint[]) => { svgCanvas.transact('Cut shapes', () => cutShapes(svgCanvas, points)) }
  }
}
