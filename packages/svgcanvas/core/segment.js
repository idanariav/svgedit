/**
 * Segment tool: divides a single selected shape into symmetric pieces using
 * evenly-spaced dividing lines, in two generator modes:
 *   - radial: N lines radiating from a center point at 360/N apart (pie slices)
 *   - grid: N parallel vertical/horizontal lines (N+1 columns/rows)
 *
 * A `split` flag picks the output: split cuts the shape into N (radial) or
 * N+1 (grid) separate `<path>` pieces, replacing the original as one undo
 * step. Non-split keeps the shape intact, draws the dividing lines on top,
 * and wraps shape + lines in a `<g>` so they act as one object going
 * forward — re-editable via a `se:segment` stamp on that `<g>` (mirrors
 * ext-repeat's `se:repeat` re-edit pattern), following the same shape as
 * `cutter.js`/`boolean-ops.js` otherwise.
 *
 * Piece production uses paper.js `intersect()` against a generated
 * wedge/strip polygon per piece, rather than cutter.js's exact boundary
 * splice: that splice assumes one continuous cutter path crossing a
 * boundary, which doesn't model spokes radiating from one interior point.
 * `intersect()` is a production-proven primitive in this codebase already
 * (see boolean-ops.js's "Intersect" op) — wedges/strips are built as large,
 * simple, non-degenerate polygons specifically to avoid the thin/degenerate
 * inputs that paper.js's boolean ops are historically fragile on.
 *
 * @module segment
 * @license MIT
 */

import { getPaperScope, getStyleAttrs, svgToPaper, toAbsolutePathData } from './paper-utils.js'
import { getMatrixToContent, isIdentity } from './math.js'
import { warn } from '../common/logger.js'

const SEGMENT_ATTR = 'se:segment'
const SEGMENT_LINE_ATTR = 'se:segment-line'

// Element types that cannot be converted to a path.
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs'])

/**
 * Whether `elem` is eligible for the Segment tool — used as the toolbar
 * button's visibility gate. Deliberately tag-only (no paper.js conversion)
 * so it's cheap to call on every selection change.
 * @param {Element} elem
 * @returns {boolean}
 */
export const canSegment = elem => !!elem && !NON_PATH_TAGS.has(elem.tagName)

// ── Pure param (de)serialization — mirrors ext-repeat's se:repeat stamp ────

export const serializeParams = p => {
  if (p.mode === 'radial') {
    return `radial;count=${p.count};split=${p.split ? 1 : 0};startAngle=${p.startAngle ?? -90}`
  }
  return `grid;count=${p.count};split=${p.split ? 1 : 0};axis=${p.axis || 'vertical'}`
}

export const parseParams = str => {
  if (!str) return null
  const [mode, ...pairs] = str.split(';')
  const vals = Object.fromEntries(pairs.map(kv => kv.split('=')))
  if (mode === 'radial') {
    return {
      mode,
      count: parseInt(vals.count) || 4,
      split: vals.split === '1',
      startAngle: parseFloat(vals.startAngle)
    }
  }
  if (mode === 'grid') {
    return {
      mode,
      count: parseInt(vals.count) || 1,
      split: vals.split === '1',
      axis: vals.axis === 'horizontal' ? 'horizontal' : 'vertical'
    }
  }
  return null
}

// ── Pure geometry math (no paper.js — testable without a canvas context) ──

/**
 * The shape's own center, in content-space coordinates — exact for an
 * untransformed circle/ellipse via its own cx/cy; bbox-center otherwise
 * (exact for axis-aligned rect/polygon, approximate for skewed/irregular
 * paths).
 * @param {Element} elem
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {{cx: number, cy: number}}
 */
export const resolveCenter = (elem, svgCanvas) => {
  const hasTransform = elem.transform?.baseVal?.numberOfItems > 0
  if (!hasTransform && (elem.tagName === 'circle' || elem.tagName === 'ellipse')) {
    return { cx: parseFloat(elem.getAttribute('cx')) || 0, cy: parseFloat(elem.getAttribute('cy')) || 0 }
  }
  const bb = svgCanvas.getStrokedBBox([elem])
  return { cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 }
}

/**
 * The N wedge angle ranges for radial mode, sweeping 360/N apart.
 * @param {number} count
 * @param {number} [startAngle] - degrees, -90 = first spoke pointing up
 * @returns {Array<{a0: number, a1: number}>}
 */
export const computeWedgeAngles = (count, startAngle = -90) => {
  const n = Math.max(2, Math.round(count))
  const step = 360 / n
  return Array.from({ length: n }, (_, k) => ({ a0: startAngle + k * step, a1: startAngle + (k + 1) * step }))
}

/**
 * The N spoke angles for radial non-split lines.
 * @param {number} count
 * @param {number} [startAngle]
 * @returns {number[]}
 */
export const computeSpokeAngles = (count, startAngle = -90) => {
  const n = Math.max(2, Math.round(count))
  const step = 360 / n
  return Array.from({ length: n }, (_, k) => startAngle + k * step)
}

/**
 * The N+1 strip ranges for grid mode, evenly spaced across `[start, start+extent]`.
 * @param {number} count
 * @param {number} start
 * @param {number} extent
 * @returns {Array<{from: number, to: number}>}
 */
export const computeGridStrips = (count, start, extent) => {
  const n = Math.max(1, Math.round(count))
  const step = extent / (n + 1)
  return Array.from({ length: n + 1 }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step }))
}

/**
 * The N divider positions for grid non-split lines.
 * @param {number} count
 * @param {number} start
 * @param {number} extent
 * @returns {number[]}
 */
export const computeGridDividerPositions = (count, start, extent) => {
  const n = Math.max(1, Math.round(count))
  const step = extent / (n + 1)
  return Array.from({ length: n }, (_, i) => start + (i + 1) * step)
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Radius that safely exceeds `bounds` from `center` in every direction,
 * regardless of where center sits relative to the shape.
 * @param {{cx: number, cy: number}} center
 * @param {{x: number, y: number, width: number, height: number}} bounds
 * @returns {number}
 */
export const farthestCornerDistance = (center, bounds) => {
  const dx = Math.max(Math.abs(bounds.x - center.cx), Math.abs(bounds.x + bounds.width - center.cx))
  const dy = Math.max(Math.abs(bounds.y - center.cy), Math.abs(bounds.y + bounds.height - center.cy))
  return Math.hypot(dx, dy) * 2
}

// ── paper.js-dependent geometry ────────────────────────────────────────────

const getElemAsPath = (elem, scope) => {
  const item = svgToPaper(elem, scope, { asCompoundPath: true })
  if (!item) return null
  const ancestorMatrix = getMatrixToContent(elem)
  if (!isIdentity(ancestorMatrix)) {
    item.transform(new scope.Matrix(
      ancestorMatrix.a, ancestorMatrix.b, ancestorMatrix.c, ancestorMatrix.d, ancestorMatrix.e, ancestorMatrix.f
    ))
  }
  return item
}

const hasValidPiece = p => p && p.pathData && p.pathData.length > 4

/**
 * A straight-edged polygon fan from `center` out to `bigR`, spanning
 * `[a0, a1]` degrees — deliberately not a true arc sector (paper.js curve
 * booleans are the fragile case) and not a 3-point triangle (degenerates at
 * or above 180°). Sampled at <=4° per straight segment.
 */
const buildWedgePolygon = (scope, center, bigR, a0, a1) => {
  const step = a1 - a0
  const sampleCount = Math.max(2, Math.ceil(Math.abs(step) / 4))
  const points = [new scope.Point(center.cx, center.cy)]
  for (let i = 0; i <= sampleCount; i++) {
    const a = (a0 + (step * i) / sampleCount) * Math.PI / 180
    points.push(new scope.Point(center.cx + bigR * Math.cos(a), center.cy + bigR * Math.sin(a)))
  }
  points.push(new scope.Point(center.cx, center.cy))
  return new scope.Path({ segments: points, closed: true, insert: false })
}

const buildStripPolygon = (scope, x1, y1, x2, y2) =>
  new scope.Path.Rectangle({ from: new scope.Point(x1, y1), to: new scope.Point(x2, y2), insert: false })

const createResultPath = (piece, elem, styleAttrs, compensation, canvas, batchCmd, newPaths) => {
  if (!hasValidPiece(piece)) return
  const attr = {
    id: canvas.getNextId(),
    d: toAbsolutePathData(piece.pathData, canvas),
    ...styleAttrs
  }
  if (compensation) {
    attr.transform = `matrix(${compensation.a} ${compensation.b} ${compensation.c} ${compensation.d} ${compensation.e} ${compensation.f})`
  }
  const newPath = canvas.addSVGElementsFromJson({ element: 'path', attr })
  elem.before(newPath)
  newPaths.push(newPath)
  batchCmd.addSubCommand(new canvas.history.InsertElementCommand(newPath))
}

const splitRadial = (canvas, elem, params, scope, shapePath, batchCmd, newPaths) => {
  const center = resolveCenter(elem, canvas)
  const bigR = farthestCornerDistance(center, shapePath.bounds)
  const wedges = computeWedgeAngles(params.count, params.startAngle ?? -90)
  const styleAttrs = getStyleAttrs(elem)
  const ancestorMatrix = getMatrixToContent(elem)
  const compensation = isIdentity(ancestorMatrix) ? null : ancestorMatrix.inverse()

  for (const { a0, a1 } of wedges) {
    const wedge = buildWedgePolygon(scope, center, bigR, a0, a1)
    const piece = shapePath.intersect(wedge, { insert: false })
    wedge.remove()
    createResultPath(piece, elem, styleAttrs, compensation, canvas, batchCmd, newPaths)
    piece.remove?.()
  }
}

const splitGrid = (canvas, elem, params, scope, shapePath, batchCmd, newPaths) => {
  const bounds = shapePath.bounds
  const axis = params.axis === 'horizontal' ? 'horizontal' : 'vertical'
  const pad = Math.max(1, (axis === 'vertical' ? bounds.height : bounds.width) * 0.001)
  const strips = axis === 'vertical'
    ? computeGridStrips(params.count, bounds.x, bounds.width)
    : computeGridStrips(params.count, bounds.y, bounds.height)
  const styleAttrs = getStyleAttrs(elem)
  const ancestorMatrix = getMatrixToContent(elem)
  const compensation = isIdentity(ancestorMatrix) ? null : ancestorMatrix.inverse()

  for (const { from, to } of strips) {
    const rect = axis === 'vertical'
      ? buildStripPolygon(scope, from, bounds.y - pad, to, bounds.y + bounds.height + pad)
      : buildStripPolygon(scope, bounds.x - pad, from, bounds.x + bounds.width + pad, to)
    const piece = shapePath.intersect(rect, { insert: false })
    rect.remove()
    createResultPath(piece, elem, styleAttrs, compensation, canvas, batchCmd, newPaths)
    piece.remove?.()
  }
}

const farthestPointFrom = (center, points) =>
  points.reduce((best, p) => (distance(center, p) > distance(center, best) ? p : best))

const clipRadialSpoke = (scope, shapePath, center, angleDeg, bigR) => {
  const a = angleDeg * Math.PI / 180
  const far = { x: center.cx + bigR * Math.cos(a), y: center.cy + bigR * Math.sin(a) }
  const ray = new scope.Path({
    segments: [new scope.Point(center.cx, center.cy), new scope.Point(far.x, far.y)],
    closed: false,
    insert: false
  })
  const crossings = shapePath.getIntersections(ray)
  ray.remove()
  if (!crossings.length) return null
  const exit = farthestPointFrom(center, crossings.map(c => ({ x: c.point.x, y: c.point.y })))
  return { x1: center.cx, y1: center.cy, x2: exit.x, y2: exit.y }
}

const clipGridDivider = (scope, shapePath, axis, coord, bounds, pad) => {
  const seg = axis === 'vertical'
    ? [{ x: coord, y: bounds.y - pad }, { x: coord, y: bounds.y + bounds.height + pad }]
    : [{ x: bounds.x - pad, y: coord }, { x: bounds.x + bounds.width + pad, y: coord }]
  const line = new scope.Path({
    segments: seg.map(p => new scope.Point(p.x, p.y)),
    closed: false,
    insert: false
  })
  const crossings = shapePath.getIntersections(line)
  line.remove()
  if (crossings.length < 2) return null
  const along = axis === 'vertical' ? p => p.y : p => p.x
  const vals = crossings.map(c => along(c.point))
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  return axis === 'vertical' ? { x1: coord, y1: lo, x2: coord, y2: hi } : { x1: lo, y1: coord, x2: hi, y2: coord }
}

const buildDividerLines = (canvas, elem, params, scope, shapePath) => {
  const bounds = shapePath.bounds
  const lines = []
  if (params.mode === 'radial') {
    const center = resolveCenter(elem, canvas)
    const bigR = farthestCornerDistance(center, bounds)
    for (const a of computeSpokeAngles(params.count, params.startAngle ?? -90)) {
      const seg = clipRadialSpoke(scope, shapePath, center, a, bigR)
      if (seg) lines.push(seg)
      else warn('Segment: a radial spoke missed the shape and was skipped', null, 'segment')
    }
  } else {
    const axis = params.axis === 'horizontal' ? 'horizontal' : 'vertical'
    const pad = Math.max(1, (axis === 'vertical' ? bounds.height : bounds.width) * 0.001)
    const start = axis === 'vertical' ? bounds.x : bounds.y
    const extent = axis === 'vertical' ? bounds.width : bounds.height
    for (const pos of computeGridDividerPositions(params.count, start, extent)) {
      const seg = clipGridDivider(scope, shapePath, axis, pos, bounds, pad)
      if (seg) lines.push(seg)
    }
  }
  return lines
}

// ── DOM orchestration ───────────────────────────────────────────────────────

/**
 * If `elem` sits inside a `<g se:segment="...">` wrapper (a previous
 * non-split result), remove the old divider lines and unwrap `elem` back to
 * a plain shape before splitting — otherwise a stale empty group (or stale
 * lines) would be left behind.
 * @returns {Element} elem, possibly re-parented
 */
const unwrapSegmentGroup = (canvas, elem, batchCmd) => {
  const g = elem.parentNode
  if (!g || g.tagName !== 'g' || !g.hasAttribute(SEGMENT_ATTR)) return elem
  const { RemoveElementCommand, MoveElementCommand } = canvas.history

  for (const line of Array.from(g.children).filter(c => c !== elem)) {
    batchCmd.addSubCommand(new RemoveElementCommand(line, line.nextSibling, line.parentNode))
    line.remove()
  }

  const oldNextSibling = elem.nextSibling
  const oldParent = elem.parentNode
  g.before(elem)
  batchCmd.addSubCommand(new MoveElementCommand(elem, oldNextSibling, oldParent))

  const gNext = g.nextSibling
  const gParent = g.parentNode
  batchCmd.addSubCommand(new RemoveElementCommand(g, gNext, gParent))
  g.remove()

  return elem
}

const wrapInGroup = (canvas, elem, lineElems, batchCmd) => {
  const g = canvas.addSVGElementsFromJson({ element: 'g', attr: { id: canvas.getNextId() } })
  elem.before(g)
  batchCmd.addSubCommand(new canvas.history.InsertElementCommand(g))
  for (const el of [elem, ...lineElems]) {
    const oldNextSibling = el.nextSibling
    const oldParent = el.parentNode
    g.append(el)
    batchCmd.addSubCommand(new canvas.history.MoveElementCommand(el, oldNextSibling, oldParent))
  }
  return g
}

const segmentSplit = (canvas, elem, params) => {
  const { BatchCommand, RemoveElementCommand } = canvas.history
  const batchCmd = new BatchCommand('Segment shape')
  elem = unwrapSegmentGroup(canvas, elem, batchCmd)

  const scope = getPaperScope()
  const shapePath = getElemAsPath(elem, scope)
  if (!shapePath) return
  const newPaths = []

  if (params.mode === 'radial') {
    splitRadial(canvas, elem, params, scope, shapePath, batchCmd, newPaths)
  } else {
    splitGrid(canvas, elem, params, scope, shapePath, batchCmd, newPaths)
  }
  shapePath.remove()

  if (newPaths.length === 0) {
    warn('Segment produced no pieces', null, 'segment')
    return
  }

  const elemNext = elem.nextSibling
  const elemParent = elem.parentNode
  batchCmd.addSubCommand(new RemoveElementCommand(elem, elemNext, elemParent))
  elem.remove()

  canvas.clearSelection()
  canvas.addCommandToHistory(batchCmd)
  canvas.selectOnly(newPaths, true)
  canvas.call('changed', newPaths)
}

const segmentNonSplit = (canvas, elem, params) => {
  const scope = getPaperScope()
  const shapePath = getElemAsPath(elem, scope)
  if (!shapePath) return
  const lineSpecs = buildDividerLines(canvas, elem, params, scope, shapePath)
  shapePath.remove()

  const { BatchCommand, InsertElementCommand, ChangeElementCommand } = canvas.history
  const batchCmd = new BatchCommand('Segment shape (lines)')

  const lineStroke = elem.getAttribute('stroke') && elem.getAttribute('stroke') !== 'none'
    ? elem.getAttribute('stroke')
    : '#000000'
  const lineElems = lineSpecs.map(seg => canvas.addSVGElementsFromJson({
    element: 'line',
    attr: {
      id: canvas.getNextId(),
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      stroke: lineStroke,
      'stroke-width': 1,
      [SEGMENT_LINE_ATTR]: '1'
    }
  }))

  const existingGroup = elem.parentNode?.tagName === 'g' && elem.parentNode.hasAttribute(SEGMENT_ATTR)
    ? elem.parentNode
    : null

  let g
  if (existingGroup) {
    for (const line of Array.from(existingGroup.children).filter(c => c.hasAttribute(SEGMENT_LINE_ATTR))) {
      batchCmd.addSubCommand(new canvas.history.RemoveElementCommand(line, line.nextSibling, line.parentNode))
      line.remove()
    }
    for (const line of lineElems) {
      elem.after(line)
      batchCmd.addSubCommand(new InsertElementCommand(line))
    }
    const oldAttr = existingGroup.getAttribute(SEGMENT_ATTR)
    existingGroup.setAttribute(SEGMENT_ATTR, serializeParams(params))
    batchCmd.addSubCommand(new ChangeElementCommand(existingGroup, { [SEGMENT_ATTR]: oldAttr }))
    g = existingGroup
  } else {
    for (const line of lineElems) {
      elem.after(line)
      batchCmd.addSubCommand(new InsertElementCommand(line))
    }
    g = wrapInGroup(canvas, elem, lineElems, batchCmd)
    g.setAttribute(SEGMENT_ATTR, serializeParams(params))
  }

  canvas.addCommandToHistory(batchCmd)
  canvas.selectOnly([g], true)
  canvas.call('changed', [g])
}

/** Resolve a `<g se:segment>` wrapper selection down to its wrapped shape. */
const resolveTarget = elem => {
  if (elem?.tagName === 'g' && elem.hasAttribute(SEGMENT_ATTR)) {
    return Array.from(elem.children).find(c => !c.hasAttribute(SEGMENT_LINE_ATTR)) || null
  }
  return elem
}

const segmentSelection = (canvas, params) => {
  const selected = canvas.getSelectedElements().filter(Boolean)
  if (selected.length !== 1) return
  const elem = resolveTarget(selected[0])
  if (!elem || !canSegment(elem)) return

  if (params.split) {
    segmentSplit(canvas, elem, params)
  } else {
    segmentNonSplit(canvas, elem, params)
  }
}

const getSegmentParams = canvas => {
  const selected = canvas.getSelectedElements().filter(Boolean)
  if (selected.length !== 1) return null
  const [sel] = selected
  const g = sel.tagName === 'g' && sel.hasAttribute(SEGMENT_ATTR)
    ? sel
    : sel.parentNode?.tagName === 'g' && sel.parentNode.hasAttribute(SEGMENT_ATTR)
      ? sel.parentNode
      : null
  if (!g) return null
  return parseParams(g.getAttribute(SEGMENT_ATTR))
}

/**
 * @function module:segment.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = canvas => {
  canvas.canSegment = canSegment
  canvas.segmentSelection = params => segmentSelection(canvas, params)
  canvas.getSegmentParams = () => getSegmentParams(canvas)
}
