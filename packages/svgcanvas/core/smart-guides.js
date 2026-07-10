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

import { getStrokedBBoxDefaultVisible } from './bbox-utils.js'

// Cap the number of snap targets for drag-time performance.
const MAX_TARGETS = 60

/**
 * Convert a bbox to its edge/center coordinate record.
 * @param {{x: Float, y: Float, width: Float, height: Float}} bb
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
        bb = getStrokedBBoxDefaultVisible([el])
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
  // Ruler guides (ext-guides) snap on their own axis only: a vertical guide
  // carries just x-keys, a horizontal one just y-keys, so the other axis'
  // comparisons come out NaN and never match.
  const rulerGuides = svgCanvas.getRulerGuides?.()
  if (rulerGuides) {
    for (const gx of rulerGuides.v) targets.push({ left: gx, cx: gx, right: gx, isGuide: true })
    for (const gy of rulerGuides.h) targets.push({ top: gy, cy: gy, bottom: gy, isGuide: true })
  }
  return targets
}

/**
 * Find the best edge/center snap for the moving bbox on each axis.
 * @param {{x: Float, y: Float, width: Float, height: Float}} bb - Drag-start bbox.
 * @param {Float} dx - Candidate drag delta x.
 * @param {Float} dy - Candidate drag delta y.
 * @param {module:smart-guides.SnapTarget[]} targets
 * @param {Float} tol - Snap tolerance in content units.
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
  const axisBest = (keys, best) => {
    for (const t of targets) {
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
    x: axisBest(['left', 'cx', 'right'], null),
    y: axisBest(['top', 'cy', 'bottom'], null)
  }
}

/**
 * Detect the moving bbox being (nearly) centered between its two nearest
 * neighbors on an axis, returning the delta that makes both gaps equal plus
 * the gap segments for rendering. Horizontal neighbors must overlap the
 * moving box vertically (and vice versa) so unrelated far-away elements
 * don't produce phantom spacing hints.
 * @param {{x: Float, y: Float, width: Float, height: Float}} bb - Drag-start bbox.
 * @param {Float} dx
 * @param {Float} dy
 * @param {module:smart-guides.SnapTarget[]} targets
 * @param {Float} tol
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
