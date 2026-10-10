// @ts-check
/**
 * Smart alignment guides — object-to-object snapping math.
 *
 * Pure geometry helpers used by the select-mode move branch in `event.js`:
 * while dragging, the moving selection's edges/centers are compared against
 * every other element's edges/centers (plus the page edges/center), and the
 * drag delta is adjusted to the closest match within tolerance. Equal-spacing
 * detection snaps the selection to the midpoint between its two nearest
 * neighbors. Rendering of the guide lines is delegated to the editor's
 * ext-smart-guides extension via `svgCanvas.showSmartGuides(payload)`.
 *
 * All coordinates are in content (user) units; callers pass a tolerance
 * already divided by zoom so it stays constant in screen pixels.
 *
 * @module smart-guides
 * @license MIT
 */

import { parseAnchors } from './anchor-path.js'
import { visibleGuides } from './guides.js'
import { getTransformList, transformListToTransform, transformPoint } from './math.js'

// Cap the number of snap targets for drag-time performance.
const MAX_TARGETS = 60
// Drawing-time snapping looks at many more objects and their anchors, so it keeps
// its targets in sorted lists and finds the nearby ones by bisection. Past these
// counts it falls back to bounding boxes only (anchors) or stops adding objects.
const MAX_DRAW_ELEMENTS = 400
const MAX_DRAW_ANCHORS = 20000

/**
 * Convert a bbox to its edge/center coordinate record.
 * @param {{x: number, y: number, width: number, height: number}} bb
 * @returns {module:smart-guides.SnapTarget}
 */
const toEdges = (bb) => ({
  left: bb.x,
  cx: bb.x + bb.width / 2,
  right: bb.x + bb.width,
  top: bb.y,
  cy: bb.y + bb.height / 2,
  bottom: bb.y + bb.height
})

/**
 * Collect the snap targets for a drag: every visible, non-selected element on
 * a visible layer (by stroked bbox), plus a synthetic target for the page
 * itself so canvas-centering works on an empty page.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Element[]} excludeElems - The elements being dragged.
 * @returns {module:smart-guides.SnapTarget[]}
 */
export const collectSnapTargets = (svgCanvas, excludeElems) => {
  const exclude = excludeElems.filter(Boolean)
  const isExcluded = (el) => exclude.some(
    (sel) => sel === el || sel.contains(el) || el.contains(sel)
  )
  const targets = []
  const content = svgCanvas.getSvgContent()
  for (const layer of content.children) {
    if (layer.tagName !== 'g') continue
    if (layer.getAttribute('display') === 'none' || layer.style.display === 'none') continue
    for (const el of layer.children) {
      if (el.tagName === 'title') continue
      if (isExcluded(el) || el.hasAttribute('data-frame')) continue
      let bb
      try {
        bb = svgCanvas.getStrokedBBoxDefaultVisible([el])
      } catch {
        continue
      }
      if (!bb || (!bb.width && !bb.height)) continue
      targets.push(toEdges(bb))
      if (targets.length >= MAX_TARGETS) break
    }
    if (targets.length >= MAX_TARGETS) break
  }
  const res = svgCanvas.getResolution()
  targets.push({
    left: 0, cx: res.w / 2, right: res.w, top: 0, cy: res.h / 2, bottom: res.h, isPage: true
  })
  // Ruler guides: lines a moving box aligns to on their own axis only (`axis`), spanning the page.
  const guides = visibleGuides(svgCanvas)
  for (const x of guides.v) {
    targets.push({ left: x, cx: x, right: x, top: 0, cy: res.h / 2, bottom: res.h, isGuide: true, axis: 'x' })
  }
  for (const y of guides.h) {
    targets.push({ left: 0, cx: res.w / 2, right: res.w, top: y, cy: y, bottom: y, isGuide: true, axis: 'y' })
  }
  return targets
}

/**
 * Find the best edge/center snap for the moving bbox on each axis.
 * @param {{x: number, y: number, width: number, height: number}} bb - Drag-start bbox.
 * @param {number} dx - Candidate drag delta x.
 * @param {number} dy - Candidate drag delta y.
 * @param {module:smart-guides.SnapTarget[]} targets
 * @param {number} tol - Snap tolerance in content units.
 * @returns {{x: ?Object, y: ?Object}} Per-axis `{delta, pos, target}` or null.
 */
export const snapMovingBBox = (bb, dx, dy, targets, tol) => {
  const moving = toEdges({ x: bb.x + dx, y: bb.y + dy, width: bb.width, height: bb.height })
  // Same-kind matches (edge↔edge, center↔center) beat mixed ones (edge↔center),
  // and mixed matches only engage at a reduced tolerance — otherwise e.g. the
  // page's center line grabs a passing edge and drowns out the intended snap.
  const better = (cand, best) => {
    if (!best) return true
    if (cand.same !== best.same) return cand.same
    return Math.abs(cand.delta) < Math.abs(best.delta)
  }
  const axisBest = (keys, best, axis) => {
    for (const t of targets) {
      if (t.axis && t.axis !== axis) continue // a guide only aligns on its own axis
      for (const mk of keys) {
        for (const tk of keys) {
          const same = mk === tk
          const d = t[tk] - moving[mk]
          if (Math.abs(d) <= (same ? tol : tol * 0.6)) {
            const cand = { delta: d, pos: t[tk], target: t, same }
            if (better(cand, best)) best = cand
          }
        }
      }
    }
    return best
  }
  return {
    x: axisBest(['left', 'cx', 'right'], null, 'x'),
    y: axisBest(['top', 'cy', 'bottom'], null, 'y')
  }
}

/**
 * Detect the moving bbox being (nearly) centered between its two nearest
 * neighbors on an axis, returning the delta that makes both gaps equal plus
 * the gap segments for rendering. Horizontal neighbors must overlap the
 * moving box vertically (and vice versa) so unrelated far-away elements
 * don't produce phantom spacing hints.
 * @param {{x: number, y: number, width: number, height: number}} bb - Drag-start bbox.
 * @param {number} dx
 * @param {number} dy
 * @param {module:smart-guides.SnapTarget[]} targets
 * @param {number} tol
 * @returns {{x: ?Object, y: ?Object}} Per-axis `{delta, gap, segments}` or null.
 */
export const findEqualSpacing = (bb, dx, dy, targets, tol) => {
  const m = toEdges({ x: bb.x + dx, y: bb.y + dy, width: bb.width, height: bb.height })
  const overlapV = (t) => t.bottom >= m.top && t.top <= m.bottom
  const overlapH = (t) => t.right >= m.left && t.left <= m.right
  const real = targets.filter((t) => !t.isPage && !t.isGuide)

  let x = null
  const lefts = real.filter((t) => overlapV(t) && t.right <= m.left + tol)
  const rights = real.filter((t) => overlapV(t) && t.left >= m.right - tol)
  if (lefts.length && rights.length) {
    const L = lefts.reduce((a, b) => (b.right > a.right ? b : a))
    const R = rights.reduce((a, b) => (b.left < a.left ? b : a))
    const gapL = m.left - L.right
    const gapR = R.left - m.right
    const delta = (gapR - gapL) / 2
    if (Math.abs(delta) <= tol) {
      const gap = gapL + delta
      const yMid = m.cy
      x = {
        delta,
        gap,
        segments: [
          { x1: L.right, y1: yMid, x2: L.right + gap, y2: yMid },
          { x1: R.left - gap, y1: yMid, x2: R.left, y2: yMid }
        ]
      }
    }
  }

  let y = null
  const tops = real.filter((t) => overlapH(t) && t.bottom <= m.top + tol)
  const bottoms = real.filter((t) => overlapH(t) && t.top >= m.bottom - tol)
  if (tops.length && bottoms.length) {
    const T = tops.reduce((a, b) => (b.bottom > a.bottom ? b : a))
    const B = bottoms.reduce((a, b) => (b.top < a.top ? b : a))
    const gapT = m.top - T.bottom
    const gapB = B.top - m.bottom
    const delta = (gapB - gapT) / 2
    if (Math.abs(delta) <= tol) {
      const gap = gapT + delta
      const xMid = m.cx
      y = {
        delta,
        gap,
        segments: [
          { x1: xMid, y1: T.bottom, x2: xMid, y2: T.bottom + gap },
          { x1: xMid, y1: B.top - gap, x2: xMid, y2: B.top }
        ]
      }
    }
  }

  return { x, y }
}

// ---- snapping while drawing ----------------------------------------------------

/**
 * @typedef {object} DrawSnapTargets
 * @property {{x: number, y: number}[]} points Anchors, bounding-box corners / edge midpoints / centres and the
 *   page's, sorted by `x`.
 * @property {{pos: number, lo: number, hi: number}[]} xLines Vertical lines (`x = pos`, spanning `lo..hi` in y), sorted by `pos`.
 * @property {{pos: number, lo: number, hi: number}[]} yLines Horizontal lines, sorted by `pos`.
 */

/** The anchors of a line, polyline, polygon or path, in the element's own coordinates. */
const localAnchors = (el) => {
  const num = (name) => parseFloat(el.getAttribute(name))
  switch (el.tagName) {
    case 'line':
      return [{ x: num('x1'), y: num('y1') }, { x: num('x2'), y: num('y2') }]
    case 'polyline':
    case 'polygon': {
      const nums = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number)
      const out = []
      for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] })
      return out
    }
    case 'path':
      return parseAnchors(el.getAttribute('d') || '').flatMap((sub) => sub.anchors.map((a) => a.p))
    default:
      return []
  }
}

/**
 * Collect what a point being drawn can snap to, once per gesture: for every visible
 * object on a visible layer its anchors (lines, polylines, polygons, paths) and
 * its bounding box's corners, edge midpoints and centre as point targets, and the
 * box's edges and centre lines as line targets; plus the same for the page.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Element[]} [excludeElems] Objects to leave out (the one being drawn).
 * @returns {DrawSnapTargets}
 */
export const collectPointTargets = (svgCanvas, excludeElems = []) => {
  const exclude = excludeElems.filter(Boolean)
  const isExcluded = (el) => exclude.some((sel) => sel === el || sel.contains(el) || el.contains(sel))
  const points = []
  const xLines = []
  const yLines = []
  let anchors = 0
  let elements = 0

  const addBox = (bb) => {
    const l = bb.x
    const r = bb.x + bb.width
    const t = bb.y
    const b = bb.y + bb.height
    const cx = (l + r) / 2
    const cy = (t + b) / 2
    for (const x of [l, cx, r]) {
      for (const y of [t, cy, b]) points.push({ x, y })
    }
    for (const pos of [l, cx, r]) xLines.push({ pos, lo: t, hi: b })
    for (const pos of [t, cy, b]) yLines.push({ pos, lo: l, hi: r })
  }

  const content = svgCanvas.getSvgContent()
  for (const layer of content.children) {
    if (layer.tagName !== 'g') continue
    if (layer.getAttribute('display') === 'none' || layer.style.display === 'none') continue
    for (const el of layer.children) {
      if (el.tagName === 'title' || el.hasAttribute('data-frame') || isExcluded(el)) continue
      if (elements >= MAX_DRAW_ELEMENTS) break
      let bb
      try {
        bb = svgCanvas.getStrokedBBoxDefaultVisible([el])
      } catch {
        continue
      }
      if (!bb || (!bb.width && !bb.height)) continue
      elements++
      addBox(bb)
      if (anchors >= MAX_DRAW_ANCHORS) continue
      try {
        const local = localAnchors(el)
        const m = local.length ? transformListToTransform(getTransformList(el)).matrix : null
        for (const p of local) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
          points.push(m ? transformPoint(p.x, p.y, m) : p)
        }
        anchors += local.length
      } catch {
        // An element whose geometry cannot be read still contributes its bounding box.
      }
    }
  }
  const res = svgCanvas.getResolution()
  addBox({ x: 0, y: 0, width: res.w, height: res.h })
  const guides = visibleGuides(svgCanvas)
  for (const pos of guides.v) xLines.push({ pos, lo: 0, hi: res.h })
  for (const pos of guides.h) yLines.push({ pos, lo: 0, hi: res.w })
  points.sort((a, b) => a.x - b.x)
  xLines.sort((a, b) => a.pos - b.pos)
  yLines.sort((a, b) => a.pos - b.pos)
  return { points, xLines, yLines }
}

/** Index of the first element of `sorted` whose `key` is `>= value`. */
const lowerBound = (sorted, value, key) => {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (key(sorted[mid]) < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The line of `sorted` (by `pos`) nearest to `value`, within `tol`. */
const nearestLine = (sorted, value, tol) => {
  let best = null
  for (let i = lowerBound(sorted, value - tol, (l) => l.pos); i < sorted.length && sorted[i].pos <= value + tol; i++) {
    if (!best || Math.abs(sorted[i].pos - value) < Math.abs(best.pos - value)) best = sorted[i]
  }
  return best
}

/**
 * Snap a point being drawn. A point target (an anchor, a box corner, midpoint or
 * centre, or the page's) within `tol` wins and fixes both coordinates; otherwise
 * each axis independently snaps to the nearest line target (a box edge or centre
 * line) within `tol`.
 * @param {{x: number, y: number}} pt
 * @param {DrawSnapTargets} targets
 * @param {number} tol Snap distance in content units (callers divide screen pixels by zoom).
 * @returns {{x: number, y: number, point: ?{x: number, y: number}, xLine: ?{pos: number, lo: number, hi: number}, yLine: ?{pos: number, lo: number, hi: number}}}
 *   The snapped position and what it snapped to (`null` where nothing did).
 */
export const snapPoint = (pt, targets, tol) => {
  let best = null
  let bestDist = Infinity
  const { points } = targets
  for (let i = lowerBound(points, pt.x - tol, (p) => p.x); i < points.length && points[i].x <= pt.x + tol; i++) {
    const d = Math.hypot(points[i].x - pt.x, points[i].y - pt.y)
    if (d <= tol && d < bestDist) {
      best = points[i]
      bestDist = d
    }
  }
  if (best) return { x: best.x, y: best.y, point: best, xLine: null, yLine: null }
  const xLine = nearestLine(targets.xLines, pt.x, tol)
  const yLine = nearestLine(targets.yLines, pt.y, tol)
  return { x: xLine ? xLine.pos : pt.x, y: yLine ? yLine.pos : pt.y, point: null, xLine, yLine }
}
