/**
 * Live Corners: per-corner radius and kind (round, inverted round, chamfer)
 * on the corners of any path — the anchors where two straight sides meet.
 *
 * Attribute-driven and non-destructive: the pre-cut geometry is kept on the
 * element as `se:orig-d` (canonical absolute `M/L/C/Z`, always written by this
 * module) and the user's choice as `se:corner-radius`. Edits always regenerate
 * `d` from the stored source; radius 0 restores the source geometry and
 * removes both attributes. `se:` attributes bypass the sanitize whitelist, so
 * they round-trip through save/load.
 *
 * `se:corner-radius` grammar (backward compatible):
 *   - `8`            every corner round with radius 8 (the original format);
 *   - `8:i,0,5:c`    a list indexed by anchor index (across all subpaths, in
 *                    order); each entry is `radius[:kind]`, kind `r` (round,
 *                    the default), `i` (inverted round) or `c` (chamfer);
 *                    missing / non-corner entries are 0.
 * A list of one entry is always written with its kind (`8:r`) so it is never
 * mistaken for the single-number format.
 *
 * A corner is an anchor without handles between two straight sides that meet
 * at an angle — the path may curve elsewhere. Each cut is trimmed
 * `t = min(r / tan(θ/2), len₁/2, len₂/2)` from the corner (the per-corner
 * clamp stops cuts overlapping on short sides), with the round arc's radius
 * re-derived from the clamped trim so short sides get a smaller, still-tangent
 * arc. Round cuts are SVG arcs tangent to both sides (exactly the construction
 * of the original single-radius feature, so saved drawings render unchanged);
 * inverted cuts are the arc centred on the corner through both trim points;
 * chamfers are the straight line between them. Geometry ported from
 * VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/geom/src/corners.rs`, MIT OR Apache-2.0.
 *
 * `remapCornerSource(elem, remap, scalew, scaleh)` is registered with
 * `geometry-remap-registry.js` (from this module's own `init`) and run by
 * `coords.js` `remapElement` when a transform is baked into a cut path: it
 * remaps the stored source, scales the radii uniformly, and regenerates `d` —
 * without it the stored original would go stale and the next edit would
 * teleport the shape.
 *
 * @module corner-radius
 * @license MIT
 */

import { NS } from './namespaces.js'
import { registerGeometryRemap } from './geometry-remap-registry.js'
import { FX_SOURCE_ATTR } from './live-effects.js'
import { registerAttrValidator, pathDataValidator } from './drawing-invariants.js'
import { parseAnchors, hasIn, hasOut, isLineSegment, sameAnchorGeometry } from './anchor-path.js'

export const CORNER_RADIUS_ATTR = 'se:corner-radius'
export const CORNER_SOURCE_ATTR = 'se:orig-d'
const TAPER_SOURCE_ATTR = 'se:taper-d' // literal: taper-stroke.js imports from here

/** Corner kinds, in the order the UI cycles through them. */
export const CORNER_KINDS = ['r', 'i', 'c']

const EPS = 1e-9
const round6 = (n) => Math.round(n * 1e6) / 1e6
const fmt = (p) => `${round6(p.x)},${round6(p.y)}`

/**
 * Parse path data into the anchor model, dropping a point that repeats its
 * predecessor (common in hand-built geometry) so the neighbouring vertex is a
 * proper corner.
 * @param {string} d
 * @returns {import('./anchor-path.js').SubPath[]}
 */
export const parseSource = (d) => {
  const subpaths = parseAnchors(d)
  for (const sp of subpaths) {
    const kept = []
    for (const a of sp.anchors) {
      const prev = kept[kept.length - 1]
      if (prev && Math.abs(a.p.x - prev.p.x) < EPS && Math.abs(a.p.y - prev.p.y) < EPS) {
        prev.hOut = a.hOut
      } else {
        kept.push(a)
      }
    }
    sp.anchors = kept
  }
  return subpaths.filter((sp) => sp.anchors.length >= 2)
}

/**
 * Serialise subpaths to path data: absolute `M/L/C`, `A` for an anchor carrying
 * an `arc` ({r, sweep}) towards the next one, and `Z` for closed subpaths. A
 * straight closing segment is left to `Z`.
 * @param {Array<{closed: boolean, anchors: Array<object>}>} subpaths
 * @returns {string}
 */
export const subpathsToD = (subpaths) => subpaths.map((sp) => {
  const { anchors, closed } = sp
  const n = anchors.length
  const parts = [`M${fmt(anchors[0].p)}`]
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const a = anchors[i]
    const b = anchors[(i + 1) % n]
    if (a.arc) {
      parts.push(`A${round6(a.arc.r)} ${round6(a.arc.r)} 0 0 ${a.arc.sweep} ${fmt(b.p)}`)
    } else if (isLineSegment(a, b)) {
      if (!(closed && i === n - 1)) parts.push(`L${fmt(b.p)}`)
    } else {
      parts.push(`C${fmt(a.hOut)} ${fmt(b.hIn)} ${fmt(b.p)}`)
    }
  }
  if (closed) parts.push('Z')
  return parts.join(' ')
}).join(' ')

/**
 * A corner Live Corners can cut.
 * @typedef {object} Corner
 * @property {number} index - Anchor index counting every subpath's anchors in order.
 * @property {number} sub - Subpath index.
 * @property {number} i - Anchor index within its subpath.
 * @property {{x: number, y: number}} at
 * @property {{x: number, y: number}} u - Unit direction towards the previous anchor.
 * @property {{x: number, y: number}} v - Unit direction towards the next anchor.
 * @property {number} lu - Length of the arriving side.
 * @property {number} lv - Length of the leaving side.
 * @property {number} tanHalf - tan(θ/2), θ the angle between the sides.
 * @property {0|1} sweep - SVG sweep flag of the round arc.
 */

const cornerOf = (sp, i, sub, index) => {
  const n = sp.anchors.length
  let prevI
  let nextI
  if (sp.closed) {
    prevI = (i + n - 1) % n
    nextI = (i + 1) % n
  } else {
    if (i === 0 || i === n - 1) return null // ends of an open subpath
    prevI = i - 1
    nextI = i + 1
  }
  const a = sp.anchors[i]
  const prev = sp.anchors[prevI]
  const next = sp.anchors[nextI]
  if (prevI === nextI) return null
  if (hasIn(a) || hasOut(a) || hasOut(prev) || hasIn(next)) return null // a curve on a side
  const v1x = prev.p.x - a.p.x
  const v1y = prev.p.y - a.p.y
  const v2x = next.p.x - a.p.x
  const v2y = next.p.y - a.p.y
  const lu = Math.hypot(v1x, v1y)
  const lv = Math.hypot(v2x, v2y)
  if (lu < EPS || lv < EPS) return null
  const cross = v1x * v2y - v1y * v2x
  const dot = v1x * v2x + v1y * v2y
  const theta = Math.atan2(Math.abs(cross), dot)
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return null // spike or straight-through
  return {
    index,
    sub,
    i,
    at: a.p,
    u: { x: v1x / lu, y: v1y / lu },
    v: { x: v2x / lv, y: v2y / lv },
    lu,
    lv,
    tanHalf: Math.tan(theta / 2),
    sweep: cross < 0 ? 1 : 0
  }
}

/**
 * The corners of `subpaths` Live Corners can cut, in anchor order.
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @returns {Corner[]}
 */
export const pathCorners = (subpaths) => {
  const out = []
  let first = 0
  subpaths.forEach((sp, sub) => {
    sp.anchors.forEach((_a, i) => {
      const c = cornerOf(sp, i, sub, first + i)
      if (c) out.push(c)
    })
    first += sp.anchors.length
  })
  return out
}

/**
 * How far from the corner a cut of `radius` meets each side, no further than
 * halfway along the shorter side (so neighbouring corners at their largest
 * meet without overlapping).
 * @param {Corner} c
 * @param {number} radius
 * @returns {number}
 */
export const cornerSetback = (c, radius) => Math.min(radius / c.tanHalf, c.lu / 2, c.lv / 2)

/**
 * The largest radius a corner draws: its cut then reaches halfway along the
 * shorter side (half the shorter side at a rectangle's corners).
 * @param {Corner} c
 * @returns {number}
 */
export const maxCornerRadius = (c) => Math.min(c.lu, c.lv) / 2 * c.tanHalf

/**
 * The two anchors replacing a corner: where the cut meets the arriving side,
 * then the leaving one. The first carries the `arc` towards the second.
 * @param {Corner} c
 * @param {number} radius
 * @param {string} kind - `r`, `i` or `c`.
 * @returns {?Array<object>} null when the cut is too small to draw.
 */
export const cutCorner = (c, radius, kind) => {
  const t = cornerSetback(c, radius)
  if (!(t >= 1e-6)) return null
  const entry = { x: c.at.x + c.u.x * t, y: c.at.y + c.u.y * t }
  const exit = { x: c.at.x + c.v.x * t, y: c.at.y + c.v.y * t }
  const mk = (p) => ({ p, hIn: { ...p }, hOut: { ...p } })
  const a = mk(entry)
  if (kind === 'r') a.arc = { r: t * c.tanHalf, sweep: c.sweep }
  else if (kind === 'i') a.arc = { r: t, sweep: 1 - c.sweep }
  return [a, mk(exit)]
}

/**
 * Parse `se:corner-radius`.
 * @param {?string} str
 * @returns {{uniform: ?number, radii: number[], kinds: string[]}} `uniform` is
 *   set for the single-number format (every corner round); otherwise the
 *   per-anchor-index `radii` / `kinds`.
 */
export const parseCornerSpec = (str) => {
  const s = String(str ?? '').trim()
  const num = (x) => Math.max(0, parseFloat(x) || 0)
  if (!/[,:]/.test(s)) return { uniform: num(s), radii: [], kinds: [] }
  const radii = []
  const kinds = []
  for (const entry of s.split(',')) {
    const [r, k] = entry.split(':')
    radii.push(num(r))
    kinds.push(CORNER_KINDS.includes((k || '').trim()) ? k.trim() : 'r')
  }
  return { uniform: null, radii, kinds }
}

export const specRadius = (spec, index) => spec.uniform ?? spec.radii[index] ?? 0
export const specKind = (spec, index) => (spec.uniform != null ? 'r' : spec.kinds[index] || 'r')

/**
 * Serialise per-corner choices to `se:corner-radius`.
 * @param {Corner[]} corners
 * @param {Map<number, number>} radii - corner index → radius.
 * @param {Map<number, string>} kinds - corner index → kind.
 * @returns {?string} null when no corner is cut.
 */
export const formatCornerSpec = (corners, radii, kinds) => {
  const cut = corners.filter((c) => (radii.get(c.index) || 0) > 0)
  if (!cut.length) return null
  const r0 = radii.get(cut[0].index)
  const uniform = cut.length === corners.length &&
    cut.every((c) => radii.get(c.index) === r0 && (kinds.get(c.index) || 'r') === 'r')
  if (uniform) return String(round6(r0))
  const last = Math.max(...cut.map((c) => c.index))
  const entries = []
  for (let idx = 0; idx <= last; idx++) {
    const r = radii.get(idx) || 0
    const k = kinds.get(idx) || 'r'
    entries.push(r > 0 ? `${round6(r)}${k !== 'r' ? ':' + k : ''}` : '0')
  }
  if (entries.length === 1) entries[0] += ':r'
  return entries.join(',')
}

/**
 * Generate the cut `d` from the source subpaths and a parsed spec.
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @param {{uniform: ?number, radii: number[], kinds: string[]}} spec
 * @returns {string}
 */
export const cornersD = (subpaths, spec) => {
  const byIndex = new Map(pathCorners(subpaths).map((c) => [c.index, c]))
  let first = 0
  const out = subpaths.map((sp) => {
    const anchors = []
    sp.anchors.forEach((a, i) => {
      const index = first + i
      const c = byIndex.get(index)
      const r = c ? specRadius(spec, index) : 0
      const cut = r > 0 ? cutCorner(c, r, specKind(spec, index)) : null
      if (cut) anchors.push(...cut)
      else anchors.push(a)
    })
    first += sp.anchors.length
    return { closed: sp.closed, anchors }
  })
  return subpathsToD(out)
}

/**
 * The `d` an element should carry given its stored source and radius spec.
 * @param {Element} elem
 * @returns {?string} null when the element has no (parseable) source.
 */
export const expectedCornerD = (elem) => {
  const src = elem.getAttribute(CORNER_SOURCE_ATTR)
  if (!src) return null
  const subpaths = parseSource(src)
  if (!subpaths.length) return null
  return cornersD(subpaths, parseCornerSpec(elem.getAttribute(CORNER_RADIUS_ATTR)))
}

/**
 * Whether the element's `d` is still what the stored source + spec produce.
 * Tolerance-based: the saver rewrites `d` with rounded relative commands.
 * @param {Element} elem
 * @returns {boolean}
 */
export const isCornerStateCurrent = (elem) => {
  const expected = expectedCornerD(elem)
  if (expected == null) return false
  return sameAnchorGeometry(parseAnchors(expected, 0.1), parseAnchors(elem.getAttribute('d') || '', 0.1))
}

/**
 * Called from `remapElement` (coords.js) when a transform is baked into a path
 * carrying corner attributes: remap the stored source, scale the radii by the
 * uniform scale factor, regenerate `d`.
 * @param {Element} elem
 * @param {Function} remap - `(x, y) → {x, y}` from remapElement.
 * @param {Function} scalew
 * @param {Function} scaleh
 * @returns {void}
 */
export const remapCornerSource = (elem, remap, scalew, scaleh) => {
  const src = elem.getAttribute(CORNER_SOURCE_ATTR)
  if (!src) return
  const subpaths = parseSource(src)
  if (!subpaths.length) return
  const map = (pt) => {
    const q = remap(pt.x, pt.y)
    return { x: q.x, y: q.y }
  }
  for (const sp of subpaths) {
    sp.anchors = sp.anchors.map((a) => ({ p: map(a.p), hIn: map(a.hIn), hOut: map(a.hOut) }))
  }
  const k = Math.sqrt(Math.abs(scalew(1) * scaleh(1)))
  const spec = parseCornerSpec(elem.getAttribute(CORNER_RADIUS_ATTR))
  const scaled = {
    uniform: spec.uniform != null ? round6(spec.uniform * k) : null,
    radii: spec.radii.map((r) => round6(r * k)),
    kinds: spec.kinds
  }
  elem.setAttribute(CORNER_SOURCE_ATTR, subpathsToD(subpaths))
  if (scaled.uniform != null) {
    elem.setAttribute(CORNER_RADIUS_ATTR, String(scaled.uniform))
  } else {
    elem.setAttribute(CORNER_RADIUS_ATTR, scaled.radii
      .map((r, i) => (r > 0 ? `${r}${scaled.kinds[i] !== 'r' ? ':' + scaled.kinds[i] : ''}` : '0'))
      .join(',') + (scaled.radii.length === 1 ? ':r' : ''))
  }
  elem.setAttribute('d', cornersD(subpaths, scaled))
}

/**
 * The path data an element's corners would be cut from: a path's stored source
 * (or current `d`), or the outline of a polygon / polyline / rect.
 * @param {Element} elem
 * @returns {?string}
 */
const cornerSourceD = (elem) => {
  switch (elem.tagName) {
    case 'path':
      return elem.getAttribute(CORNER_SOURCE_ATTR) || elem.getAttribute('d')
    case 'polygon':
    case 'polyline': {
      const coords = (elem.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
      let d = ''
      for (let i = 0; i + 1 < coords.length; i += 2) {
        d += `${i === 0 ? 'M' : 'L'}${coords[i]},${coords[i + 1]} `
      }
      if (!d) return null
      return elem.tagName === 'polygon' ? d + 'Z' : d.trim()
    }
    case 'rect': {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => parseFloat(elem.getAttribute(a)) || 0)
      if (!(w > 0 && h > 0)) return null
      return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`
    }
    default:
      return null
  }
}

export const init = (canvas) => {
  const svgCanvas = canvas

  registerGeometryRemap(CORNER_SOURCE_ATTR, remapCornerSource)
  registerAttrValidator(CORNER_SOURCE_ATTR, pathDataValidator)
  registerAttrValidator(CORNER_RADIUS_ATTR, (value) => {
    const entry = /^\s*\d*\.?\d+(?:e[+-]?\d+)?\s*(?::\s*[ric]\s*)?$/i
    return value.trim() && value.split(',').every((e) => entry.test(e)) ? true : 'is not a radius list'
  })

  /**
   * Whether corner cutting can apply to this element right now.
   * @param {Element} elem
   * @returns {boolean}
   */
  const canRoundCorners = (elem) => {
    if (!elem) return false
    if (elem.hasAttribute(FX_SOURCE_ATTR) || elem.hasAttribute(TAPER_SOURCE_ATTR)) return false // exclusive
    if (elem.tagName === 'path' && elem.hasAttribute(CORNER_SOURCE_ATTR)) return true
    if (!['path', 'polygon', 'polyline', 'rect'].includes(elem.tagName)) return false
    const d = cornerSourceD(elem)
    return !!d && pathCorners(parseSource(d)).length > 0
  }

  /**
   * The corners of the selected element and their current radius / kind.
   * @param {Element} [elem] - Defaults to the selected element.
   * @returns {Array<{index: number, radius: number, kind: string, max: number}>}
   */
  const getCornerSettings = (elem = svgCanvas.getSelectedElements().filter(Boolean)[0]) => {
    if (!elem) return []
    const d = cornerSourceD(elem)
    if (!d) return []
    const spec = elem.hasAttribute(CORNER_SOURCE_ATTR)
      ? parseCornerSpec(elem.getAttribute(CORNER_RADIUS_ATTR))
      : { uniform: 0, radii: [], kinds: [] }
    return pathCorners(parseSource(d)).map((c) => ({
      index: c.index,
      radius: specRadius(spec, c.index),
      kind: specKind(spec, c.index),
      max: maxCornerRadius(c)
    }))
  }

  /**
   * Cut the corners of the selected element, recording one undo step.
   * Polygons, polylines and rects are swapped for a `<path>` in the same batch.
   * @param {number} [r] - Radius for the targeted corners (0 clears them);
   *   omit to change only the kind.
   * @param {object} [opts]
   * @param {string} [opts.kind] - `r`, `i` or `c` for the targeted corners.
   * @param {number[]} [opts.corners] - Corner (anchor) indices to change;
   *   default all corners.
   * @returns {?Element} The (possibly new) element, or null when nothing changed.
   */
  const applyCornerRadius = (r, opts = {}) => {
    let [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!elem || !canRoundCorners(elem)) return null
    const { kind, corners: only } = opts
    const doc = elem.ownerDocument
    const srcD = cornerSourceD(elem)
    const subpaths = srcD ? parseSource(srcD) : []
    const corners = pathCorners(subpaths)
    if (!corners.length) return null

    // Current choices per corner, then overlay the request.
    const hadSource = elem.hasAttribute(CORNER_SOURCE_ATTR)
    const spec = hadSource
      ? parseCornerSpec(elem.getAttribute(CORNER_RADIUS_ATTR))
      : { uniform: 0, radii: [], kinds: [] }
    const radii = new Map()
    const kinds = new Map()
    for (const c of corners) {
      const targeted = !only || only.includes(c.index)
      const cur = specRadius(spec, c.index)
      radii.set(c.index, targeted && r != null ? Math.max(0, r) : cur)
      kinds.set(c.index, targeted && kind ? kind : specKind(spec, c.index))
    }
    const value = formatCornerSpec(corners, radii, kinds)
    if (value == null && !hadSource) return null // nothing to cut, nothing to clear

    const { BatchCommand, ChangeElementCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Corner radius')

    // Polygon / polyline / rect → equivalent <path> (arcs can't be drawn otherwise).
    if (elem.tagName !== 'path') {
      const path = doc.createElementNS(NS.SVG, 'path')
      for (const attr of elem.attributes) {
        if (['points', 'x', 'y', 'width', 'height', 'rx', 'ry'].includes(attr.name)) continue
        path.setAttribute(attr.name, attr.value)
      }
      path.setAttribute('d', srcD)
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

    if (value != null) {
      elem.setAttribute(CORNER_SOURCE_ATTR, subpathsToD(subpaths))
      elem.setAttribute(CORNER_RADIUS_ATTR, value)
      elem.setAttribute('d', cornersD(subpaths, parseCornerSpec(value)))
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
  svgCanvas.getCornerSettings = getCornerSettings
}
