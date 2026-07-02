/**
 * Corner rounding (fillet) for straight-segment paths.
 *
 * Attribute-driven and non-destructive: the pre-fillet geometry is kept on the
 * element as `se:orig-d` (canonical absolute `M x,y L x,y … [Z]` — always
 * written by this module) and the user radius as `se:corner-radius`. Radius
 * edits always regenerate `d` from the stored source; radius 0 restores the
 * source geometry and removes both attributes. `se:` attributes bypass the
 * sanitize whitelist, so they round-trip through save/load.
 *
 * Only paths whose every subpath consists of straight segments (M/L/H/V/Z)
 * are roundable — corners flanked by curves have no well-defined fillet here.
 * Each vertex is replaced by a circular-arc fillet: trim distance
 * `t = min(r / tan(θ/2), len₁/2, len₂/2)` per corner (the per-corner clamp
 * stops arcs overlapping on short edges), with the arc radius re-derived from
 * the clamped trim so short edges get a smaller, still-tangent arc.
 *
 * `remapCornerSource(elem, remap, scalew, scaleh)` is called from
 * `coords.js` `remapElement` when a transform is baked into a rounded path:
 * it remaps the stored source points, scales the radius uniformly, and
 * regenerates `d` — without it the stored original would go stale and the
 * next radius edit would teleport the shape.
 *
 * @module corner-radius
 * @license MIT
 */

import { NS } from './namespaces.js'

export const CORNER_RADIUS_ATTR = 'se:corner-radius'
export const CORNER_SOURCE_ATTR = 'se:orig-d'

/**
 * Parse a path `d` into straight-line subpaths.
 * @param {string} d
 * @param {Document} doc - Owner document used to create a temp path element.
 * @returns {?Array<{closed: boolean, pts: Array<{x: Float, y: Float}>}>}
 *   null when the path contains curve segments (not roundable).
 */
export const parseStraightSubpaths = (d, doc) => {
  const temp = doc.createElementNS(NS.SVG, 'path')
  temp.setAttribute('d', d)
  const segList = temp.pathSegList
  const len = segList.numberOfItems
  const subpaths = []
  let cur = null
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  for (let i = 0; i < len; ++i) {
    const seg = segList.getItem(i)
    const letter = seg.pathSegTypeAsLetter
    const rel = letter >= 'a' && letter <= 'z'
    switch (letter.toUpperCase()) {
      case 'M':
        cx = rel ? cx + seg.x : seg.x
        cy = rel ? cy + seg.y : seg.y
        startX = cx
        startY = cy
        cur = { closed: false, pts: [{ x: cx, y: cy }] }
        subpaths.push(cur)
        break
      case 'L':
        cx = rel ? cx + seg.x : seg.x
        cy = rel ? cy + seg.y : seg.y
        cur?.pts.push({ x: cx, y: cy })
        break
      case 'H':
        cx = rel ? cx + seg.x : seg.x
        cur?.pts.push({ x: cx, y: cy })
        break
      case 'V':
        cy = rel ? cy + seg.y : seg.y
        cur?.pts.push({ x: cx, y: cy })
        break
      case 'Z':
        if (cur) cur.closed = true
        cx = startX
        cy = startY
        break
      default:
        return null // curve segment — not roundable
    }
  }
  // Drop consecutive duplicate points (common in hand-built geometry).
  for (const sp of subpaths) {
    sp.pts = sp.pts.filter((p, i) => {
      if (i === 0) return true
      const q = sp.pts[i - 1]
      return Math.abs(p.x - q.x) > 1e-9 || Math.abs(p.y - q.y) > 1e-9
    })
    // A closed subpath whose last point repeats the first: drop the repeat.
    if (sp.closed && sp.pts.length > 1) {
      const a = sp.pts[0]
      const b = sp.pts[sp.pts.length - 1]
      if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) sp.pts.pop()
    }
  }
  return subpaths
}

/**
 * Serialise subpaths back to the canonical source form (absolute M/L/Z).
 * @param {Array<{closed: boolean, pts: Array<{x: Float, y: Float}>}>} subpaths
 * @returns {string}
 */
export const subpathsToD = (subpaths) => subpaths.map(({ closed, pts }) => {
  const cmds = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${round6(p.x)},${round6(p.y)}`)
  return cmds.join(' ') + (closed ? ' Z' : '')
}).join(' ')

const round6 = (n) => Math.round(n * 1e6) / 1e6

/**
 * Build the fillet data for one corner.
 * @returns {?{ex: Float, ey: Float, xx: Float, xy: Float, r: Float, sweep: 0|1}}
 *   Entry point, exit point, arc radius, sweep flag — or null (skip corner).
 */
const filletCorner = (prev, pt, next, radius) => {
  const v1x = prev.x - pt.x
  const v1y = prev.y - pt.y
  const v2x = next.x - pt.x
  const v2y = next.y - pt.y
  const len1 = Math.hypot(v1x, v1y)
  const len2 = Math.hypot(v2x, v2y)
  if (len1 < 1e-9 || len2 < 1e-9) return null
  const cross = v1x * v2y - v1y * v2x
  const dot = v1x * v2x + v1y * v2y
  const theta = Math.atan2(Math.abs(cross), dot) // corner angle (0..π)
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return null // spike or straight-through
  const tanHalf = Math.tan(theta / 2)
  // Half-edge budget per corner so two fillets on one edge never overlap.
  const t = Math.min(radius / tanHalf, len1 / 2, len2 / 2)
  if (t < 1e-6) return null
  const r = t * tanHalf
  const ex = pt.x + (v1x / len1) * t
  const ey = pt.y + (v1y / len1) * t
  const xx = pt.x + (v2x / len2) * t
  const xy = pt.y + (v2y / len2) * t
  // Arc turns from (pt−prev) direction to (next−pt): the turn sign is
  // cross((pt−prev),(next−pt)) = cross(v2,v1)-ish; derived empirically below.
  const sweep = cross < 0 ? 1 : 0
  return { ex, ey, xx, xy, r, sweep }
}

/**
 * Generate the rounded `d` from straight subpaths and a radius.
 * @param {Array<{closed: boolean, pts: Array<{x: Float, y: Float}>}>} subpaths
 * @param {Float} radius
 * @returns {string}
 */
export const roundedPathD = (subpaths, radius) => subpaths.map(({ closed, pts }) => {
  const n = pts.length
  if (n < 3) return subpathsToD([{ closed, pts }])
  const parts = []
  if (closed) {
    const first = filletCorner(pts[n - 1], pts[0], pts[1], radius)
    parts.push(first
      ? `M${round6(first.ex)},${round6(first.ey)} A${round6(first.r)} ${round6(first.r)} 0 0 ${first.sweep} ${round6(first.xx)},${round6(first.xy)}`
      : `M${round6(pts[0].x)},${round6(pts[0].y)}`)
    for (let i = 1; i < n; ++i) {
      const f = filletCorner(pts[i - 1], pts[i], pts[(i + 1) % n], radius)
      parts.push(f
        ? `L${round6(f.ex)},${round6(f.ey)} A${round6(f.r)} ${round6(f.r)} 0 0 ${f.sweep} ${round6(f.xx)},${round6(f.xy)}`
        : `L${round6(pts[i].x)},${round6(pts[i].y)}`)
    }
    parts.push('Z')
  } else {
    parts.push(`M${round6(pts[0].x)},${round6(pts[0].y)}`)
    for (let i = 1; i < n - 1; ++i) {
      const f = filletCorner(pts[i - 1], pts[i], pts[i + 1], radius)
      parts.push(f
        ? `L${round6(f.ex)},${round6(f.ey)} A${round6(f.r)} ${round6(f.r)} 0 0 ${f.sweep} ${round6(f.xx)},${round6(f.xy)}`
        : `L${round6(pts[i].x)},${round6(pts[i].y)}`)
    }
    parts.push(`L${round6(pts[n - 1].x)},${round6(pts[n - 1].y)}`)
  }
  return parts.join(' ')
}).join(' ')

/**
 * Called from `remapElement` (coords.js) when a transform is baked into a
 * path carrying corner-rounding attributes: remap the stored source points,
 * scale the radius by the uniform scale factor, regenerate `d`.
 * @param {Element} elem
 * @param {Function} remap - `(x, y) → {x, y}` from remapElement.
 * @param {Function} scalew
 * @param {Function} scaleh
 * @returns {void}
 */
export const remapCornerSource = (elem, remap, scalew, scaleh) => {
  const src = elem.getAttribute(CORNER_SOURCE_ATTR)
  if (!src) return
  const subpaths = parseStraightSubpaths(src, elem.ownerDocument)
  if (!subpaths) return
  for (const sp of subpaths) {
    sp.pts = sp.pts.map((p) => remap(p.x, p.y))
  }
  const radiusScale = Math.sqrt(Math.abs(scalew(1) * scaleh(1)))
  const radius = (parseFloat(elem.getAttribute(CORNER_RADIUS_ATTR)) || 0) * radiusScale
  elem.setAttribute(CORNER_SOURCE_ATTR, subpathsToD(subpaths))
  elem.setAttribute(CORNER_RADIUS_ATTR, String(round6(radius)))
  elem.setAttribute('d', radius > 0 ? roundedPathD(subpaths, radius) : subpathsToD(subpaths))
}

export const init = (canvas) => {
  const svgCanvas = canvas

  /**
   * Whether corner rounding can apply to this element right now.
   * @param {Element} elem
   * @returns {boolean}
   */
  const canRoundCorners = (elem) => {
    if (!elem) return false
    if (elem.tagName === 'polygon' || elem.tagName === 'polyline') return true
    if (elem.tagName !== 'path') return false
    if (elem.hasAttribute(CORNER_SOURCE_ATTR)) return true
    return parseStraightSubpaths(elem.getAttribute('d') || '', elem.ownerDocument) !== null
  }

  /**
   * Apply (or clear, r = 0) a corner radius on the selected element,
   * recording one undo step. Polygons/polylines are swapped for a `<path>`
   * in the same batch.
   * @param {Float} r
   * @returns {?Element} The (possibly new) rounded element.
   */
  const applyCornerRadius = (r) => {
    let [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!elem) return null
    const { BatchCommand, ChangeElementCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Corner radius')
    const doc = elem.ownerDocument

    // Polygon/polyline → equivalent <path> (points can't render arcs).
    if (elem.tagName === 'polygon' || elem.tagName === 'polyline') {
      const pts = elem.getAttribute('points').trim()
      if (!pts) return null
      const coords = pts.split(/[\s,]+/).map(Number)
      let d = ''
      for (let i = 0; i + 1 < coords.length; i += 2) {
        d += `${i === 0 ? 'M' : 'L'}${coords[i]},${coords[i + 1]} `
      }
      if (elem.tagName === 'polygon') d += 'Z'
      const path = doc.createElementNS(NS.SVG, 'path')
      for (const attr of elem.attributes) {
        if (attr.name === 'points') continue
        path.setAttribute(attr.name, attr.value)
      }
      path.setAttribute('d', d.trim())
      path.id = svgCanvas.getNextId()
      elem.before(path)
      batchCmd.addSubCommand(new InsertElementCommand(path))
      batchCmd.addSubCommand(new RemoveElementCommand(elem, elem.nextSibling, elem.parentNode))
      elem.remove()
      elem = path
    }

    const oldValues = {
      d: elem.getAttribute('d'),
      [CORNER_RADIUS_ATTR]: elem.getAttribute(CORNER_RADIUS_ATTR),
      [CORNER_SOURCE_ATTR]: elem.getAttribute(CORNER_SOURCE_ATTR)
    }

    const src = elem.getAttribute(CORNER_SOURCE_ATTR) || elem.getAttribute('d')
    const subpaths = parseStraightSubpaths(src, doc)
    if (!subpaths) return null

    if (r > 0) {
      elem.setAttribute(CORNER_SOURCE_ATTR, subpathsToD(subpaths))
      elem.setAttribute(CORNER_RADIUS_ATTR, String(r))
      elem.setAttribute('d', roundedPathD(subpaths, r))
    } else {
      elem.setAttribute('d', subpathsToD(subpaths))
      elem.removeAttribute(CORNER_RADIUS_ATTR)
      elem.removeAttribute(CORNER_SOURCE_ATTR)
    }
    batchCmd.addSubCommand(new ChangeElementCommand(elem, oldValues))
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([elem], true)
    svgCanvas.call('changed', [elem])
    return elem
  }

  svgCanvas.applyCornerRadius = applyCornerRadius
  svgCanvas.canRoundCorners = canRoundCorners
}
