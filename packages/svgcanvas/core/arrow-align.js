/**
 * Arrowhead alignment: where a marker head sits on the end of its line.
 *
 * A marker is centred on the vertex (`refX=50`), so the stroke runs on through
 * the head and the tip overshoots (or a hollow head shows the stroke inside it).
 * SVG cannot clip a stroke under a marker, so two alignments move one or the
 * other instead. Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/effects/src/stroke/arrow.rs`, MIT OR Apache-2.0.
 *
 * - **Tip** — the head's tip is on the endpoint and the stroke is shortened by the
 *   head's *inset* (how far from the tip the stroke may end without showing:
 *   halfway into a solid head, in the back wall of a hollow one, at a chevron's
 *   inner corner).
 * - **Extend** — the stroke keeps its length and the tip sits one inset past the end.
 *
 * Both are stored as `se:arrow-align="tip|extend"` on the element (absent = the
 * legacy centred head, untouched). For Tip the untrimmed geometry is kept as the
 * source — `se:arrow-pts` ("x,y x,y …") for a `<line>`/`<polyline>`, `se:arrow-d`
 * for a `<path>` — with the trim last applied in `se:arrow-trim` ("start,end", user
 * units); the visible geometry is regenerated from it whenever the stroke width,
 * the markers or the source change (`syncArrowAlign`). A source that no longer
 * matches its geometry was edited from outside (node editing, an undo that restored
 * only the geometry): the element then becomes Extend on the geometry it has now,
 * which draws the same picture.
 *
 * The heads' geometry (tip, inset) is the table in `HEADS`; the markers themselves
 * are built by `ext-markers`. Everything here is user units of the element.
 *
 * @module arrow-align
 * @license MIT
 */

import { parseAnchors, anchorsToD, segCubic, splitCubic, cubicLength, evalCubic, isLineSegment, segmentCount } from './anchor-path.js'
import { LIVE_ATTRS } from './path-join.js'
import { registerGeometryRemap } from './geometry-remap-registry.js'
import { registerAttrValidator, pathDataValidator } from './drawing-invariants.js'

export const ARROW_ALIGN_ATTR = 'se:arrow-align'
export const ARROW_PTS_ATTR = 'se:arrow-pts'
export const ARROW_D_ATTR = 'se:arrow-d'
export const ARROW_TRIM_ATTR = 'se:arrow-trim'

/** Marker boxes are `viewBox 0 0 100 100` and `markerWidth=5` stroke widths. */
const BOX = 100
const DEFAULT_MARKER_SIZE = 5
/** Centre of the box: where legacy (unaligned) heads sit on the vertex. */
const CENTRE = 50
/** The trim never takes more than this share of the stroke's length. */
const MAX_TRIMMED = 0.95
/** Geometry this close to what the source would give counts as current (user units). */
const SAME_TOL = 0.05

/**
 * The heads that point somewhere. `tip` is where the head's tip is in the box
 * (100 = +x, 0 = −x; a head that is the same both ways has its tip at the outward
 * end), `solid`/`hollow` the inset in box units. Anything not listed (box, circle,
 * star, slashes, X) has no tip and stays centred.
 */
const HEADS = {
  leftarrow: { tip: 0, solid: 50, hollow: 70 }, // hollow: the notch of the dart
  rightarrow: { tip: 100, solid: 50, hollow: 70 },
  triangle: { tip: 100, solid: 50, hollow: 97.5 }, // hollow: into the base wall
  diamond: { tip: null, solid: 50, hollow: 97.5 },
  openarrow: { tip: 100, solid: 13.5, hollow: 13.5 } // the chevron's inner corner
}

/**
 * Where a head of marker kind `kind` sits at `pos` for `mode`.
 * @param {string} kind the marker's `se_type`, e.g. `rightarrow_o`
 * @param {'start'|'end'} pos
 * @param {'tip'|'extend'|null} mode
 * @returns {{refX: number, inset: number}} `refX` in box units; `inset` is the part of the head
 *   the stroke may run into, in box units (0 when the head points into the line).
 */
export const headPlacement = (kind, pos, mode) => {
  const hollow = kind.endsWith('_o')
  const head = HEADS[hollow ? kind.slice(0, -2) : kind]
  if (!head || !mode) return { refX: CENTRE, inset: 0 }
  // At the end the marker's +x is away from the line, at the start it is into it.
  const outwardTip = pos === 'end' ? BOX : 0
  const tip = head.tip ?? outwardTip
  if (tip !== outwardTip) return { refX: tip, inset: 0 } // points into the line: tip on the end, nothing to trim
  const inset = hollow ? head.hollow : head.solid
  return { refX: mode === 'extend' ? tip + (pos === 'end' ? -inset : inset) : tip, inset }
}

const pt = (x, y) => ({ x, y })
const anchor = (p, hIn = p, hOut = p) => ({ p, hIn, hOut })
const num = (n) => Math.round(n * 1e5) / 1e5

/** The parameter of `c` at arc length `len` from its start. */
const tAt = (c, len) => {
  const n = 40
  let prev = c.p0
  let acc = 0
  for (let k = 1; k <= n; k++) {
    const q = evalCubic(c, k / n)
    const step = Math.hypot(q.x - prev.x, q.y - prev.y)
    if (acc + step >= len) return ((k - 1) + (step ? (len - acc) / step : 0)) / n
    acc += step
    prev = q
  }
  return 1
}

/**
 * The open subpath without its first `start` and last `end` units of arc length.
 * @param {import('./anchor-path.js').SubPath} sp
 * @param {number} start
 * @param {number} end
 * @returns {import('./anchor-path.js').SubPath}
 */
export const trimSubpath = (sp, start, end) => {
  const segs = []
  let total = 0
  for (let i = 0; i < segmentCount(sp); i++) {
    const straight = isLineSegment(sp.anchors[i], sp.anchors[i + 1])
    const c = segCubic(sp, i)
    const len = straight ? Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) : cubicLength(c)
    segs.push({ c, len, straight })
    total += len
  }
  const room = total * MAX_TRIMMED
  const want = start + end
  const k = want > room && want > 0 ? room / want : 1
  const from = start * k
  const to = total - end * k
  const kept = []
  let at = 0
  for (const { c, len, straight } of segs) {
    const s0 = at
    at += len
    if (at <= from || s0 >= to) continue
    const a = from > s0 ? from - s0 : 0
    const b = to < at ? to - s0 : len
    if (straight) {
      const lerp = (u) => pt(c.p0.x + (c.p3.x - c.p0.x) * u, c.p0.y + (c.p3.y - c.p0.y) * u)
      const p0 = lerp(a / len)
      const p3 = lerp(b / len)
      kept.push({ p0, p1: p0, p2: p3, p3, straight })
    } else {
      kept.push({ ...splitCubic(c, a > 0 ? tAt(c, a) : 0, b < len ? tAt(c, b) : 1), straight })
    }
  }
  if (!kept.length) return sp
  const anchors = [anchor(kept[0].p0, kept[0].p0, kept[0].straight ? kept[0].p0 : kept[0].p1)]
  kept.forEach((s, i) => {
    const next = kept[i + 1]
    anchors.push(anchor(s.p3, s.straight ? s.p3 : s.p2, next && !next.straight ? next.p1 : s.p3))
  })
  return { closed: false, anchors }
}

const parsePoints = (str) => {
  const n = (str || '').trim().split(/[\s,]+/).map(Number)
  const out = []
  for (let i = 0; i + 1 < n.length; i += 2) out.push(pt(n[i], n[i + 1]))
  return out.length === n.length / 2 && out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? out : []
}
const pointsToStr = (anchors) => anchors.map((a) => `${num(a.p.x)},${num(a.p.y)}`).join(' ')

const isPathTag = (elem) => elem.tagName === 'path'

/** The element's current geometry as one open subpath, or null. */
const readSubpath = (elem, attr) => {
  if (isPathTag(elem)) {
    const sps = parseAnchors(attr ?? elem.getAttribute('d') ?? '', 0.1)
    return sps.length === 1 && !sps[0].closed && sps[0].anchors.length >= 2 ? sps[0] : null
  }
  const pts = elem.tagName === 'line'
    ? (attr ? parsePoints(attr) : [pt(Number(elem.getAttribute('x1')), Number(elem.getAttribute('y1'))), pt(Number(elem.getAttribute('x2')), Number(elem.getAttribute('y2')))])
    : parsePoints(attr ?? elem.getAttribute('points'))
  if (pts.length < 2 || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  return { closed: false, anchors: pts.map((p) => anchor(p)) }
}

const writeGeometry = (elem, sp) => {
  if (isPathTag(elem)) {
    elem.setAttribute('d', anchorsToD([sp]))
  } else if (elem.tagName === 'line') {
    const a = sp.anchors[0].p
    const b = sp.anchors[sp.anchors.length - 1].p
    elem.setAttribute('x1', num(a.x)); elem.setAttribute('y1', num(a.y))
    elem.setAttribute('x2', num(b.x)); elem.setAttribute('y2', num(b.y))
  } else {
    elem.setAttribute('points', pointsToStr(sp.anchors))
  }
}

const sourceAttr = (elem) => (isPathTag(elem) ? ARROW_D_ATTR : ARROW_PTS_ATTR)

/** A string that changes when the element's geometry does. */
const geometryKey = (elem) => ['d', 'points', 'x1', 'y1', 'x2', 'y2'].map((a) => elem.getAttribute(a)).join('|')

const sameGeometry = (a, b) => a.anchors.length === b.anchors.length && a.anchors.every((an, i) => {
  const bn = b.anchors[i]
  return ['p', 'hIn', 'hOut'].every((k) => Math.abs(an[k].x - bn[k].x) <= SAME_TOL && Math.abs(an[k].y - bn[k].y) <= SAME_TOL)
})

/** The element's untrimmed geometry: its stored source, or what it has now. */
const sourceOf = (elem) => {
  const attr = elem.getAttribute(sourceAttr(elem))
  return attr ? readSubpath(elem, attr) : readSubpath(elem)
}

export const init = (canvas) => {
  const svgCanvas = canvas

  /** The `se_type` of the marker linked at `pos` (`marker-start`/`-end`), by marker element. */
  const markerAt = (elem, pos) => {
    const m = /\(#(.+)\)/.exec(elem.getAttribute(`marker-${pos}`) || '')
    const marker = m && svgCanvas.getElement(m[1])
    const kind = marker?.getAttribute('se_type')
    return kind ? { marker, kind } : null
  }

  const strokeWidth = (elem) => {
    const sw = parseFloat(elem.getAttribute('stroke-width'))
    return Number.isFinite(sw) ? sw : 1
  }

  /** The unit one box unit of the marker is worth, in the element's user units. */
  const boxUnit = (elem, marker) => strokeWidth(elem) * (parseFloat(marker.getAttribute('markerWidth')) || DEFAULT_MARKER_SIZE) / BOX

  /**
   * Whether the element's start and end can carry an aligned head: a line, a polyline or a path
   * of one open subpath, whose geometry is its own (no live effect, taper or corner source).
   * @param {?Element} elem
   * @returns {boolean}
   */
  const canAlignArrows = (elem) => {
    if (!elem || !['line', 'polyline', 'path'].includes(elem.tagName)) return false
    if (LIVE_ATTRS.some((a) => elem.hasAttribute(a) && a !== ARROW_D_ATTR)) return false
    return !!readSubpath(elem, elem.getAttribute(sourceAttr(elem)) ?? undefined)
  }

  /**
   * @param {Element} elem
   * @returns {'tip'|'extend'|null}
   */
  const getArrowAlign = (elem) => {
    const mode = elem?.getAttribute(ARROW_ALIGN_ATTR)
    return mode === 'tip' || mode === 'extend' ? mode : null
  }

  const restore = (elem) => {
    const src = elem.getAttribute(sourceAttr(elem))
    if (src) {
      const sp = readSubpath(elem, src)
      if (sp) writeGeometry(elem, sp)
    }
    elem.removeAttribute(sourceAttr(elem))
    elem.removeAttribute(ARROW_TRIM_ATTR)
  }

  /**
   * Make the element's markers and geometry follow its alignment: `refX` of both end markers, and for
   * Tip the stroke trimmed by each outward head's inset. Idempotent; records no history (callers
   * run it inside a transaction or as part of a change that is already recorded).
   * @param {Element} elem
   * @param {boolean} [trusted] the source was just rewritten by the caller: skip the staleness check
   * @returns {boolean} Whether the element's geometry changed.
   */
  const syncArrowAlign = (elem, trusted = false) => {
    if (!elem?.hasAttribute?.(ARROW_ALIGN_ATTR)) return false
    // Not in the drawing (an undo just took it out), or its marker is not there (yet): its state is not ours to judge.
    if (!elem.isConnected || ['start', 'end'].some((pos) => {
      const ref = /\(#(.+)\)/.exec(elem.getAttribute(`marker-${pos}`) || '')
      return ref && !svgCanvas.getElement(ref[1])
    })) return false
    let mode = getArrowAlign(elem)
    const before = geometryKey(elem)
    const ends = { start: markerAt(elem, 'start'), end: markerAt(elem, 'end') }
    let hasSource = elem.hasAttribute(sourceAttr(elem))

    if (mode === 'tip' && hasSource && !trusted) {
      // The geometry must still be the source minus the trim we applied.
      const [ts = 0, te = 0] = (elem.getAttribute(ARROW_TRIM_ATTR) || '').split(',').map(Number)
      const src = readSubpath(elem, elem.getAttribute(sourceAttr(elem)))
      const now = readSubpath(elem)
      if (!src || !now || !sameGeometry(trimSubpath(src, ts, te), now)) {
        elem.removeAttribute(sourceAttr(elem)) // edited from outside: keep what is drawn, as Extend
        elem.removeAttribute(ARROW_TRIM_ATTR)
        elem.setAttribute(ARROW_ALIGN_ATTR, 'extend')
        mode = 'extend'
        hasSource = false
      }
    }

    if (!mode || !canAlignArrows(elem)) { // not ours any more (a closed path, or another feature took the geometry over)
      if (LIVE_ATTRS.some((a) => elem.hasAttribute(a))) { // the geometry is theirs now: leave it as it is
        elem.removeAttribute(sourceAttr(elem))
        elem.removeAttribute(ARROW_TRIM_ATTR)
      } else {
        restore(elem)
      }
      elem.removeAttribute(ARROW_ALIGN_ATTR)
      for (const pos of ['start', 'end']) ends[pos]?.marker.setAttribute('refX', CENTRE)
      mode = null
      hasSource = false
    }

    // Heads: refX, and the trims they ask for.
    const trims = { start: 0, end: 0 }
    for (const pos of ['start', 'end']) {
      const e = ends[pos]
      if (!e) continue
      const { refX, inset } = headPlacement(e.kind, pos, mode)
      e.marker.setAttribute('refX', refX)
      e.marker.setAttribute('refY', CENTRE)
      if (mode === 'tip') trims[pos] = inset * boxUnit(elem, e.marker)
    }

    if (mode === 'tip' && (trims.start > 1e-9 || trims.end > 1e-9)) {
      const src = sourceOf(elem)
      if (src) {
        if (!hasSource) elem.setAttribute(sourceAttr(elem), isPathTag(elem) ? anchorsToD([src]) : pointsToStr(src.anchors))
        elem.setAttribute(ARROW_TRIM_ATTR, `${num(trims.start)},${num(trims.end)}`)
        // A saved drawing's geometry is rounded: leave it be while it is the trim, so a sync that changes nothing writes nothing.
        const trimmed = trimSubpath(src, trims.start, trims.end)
        const now = readSubpath(elem)
        if (!now || !sameGeometry(trimmed, now)) writeGeometry(elem, trimmed)
      }
    } else if (hasSource) {
      restore(elem)
    }

    return before !== geometryKey(elem)
  }

  /**
   * Set (or with `null`, clear) the element's head alignment, re-deriving markers and geometry.
   * Records no history: run it in `transact` or alongside a recorded change.
   * @param {Element} elem
   * @param {'tip'|'extend'|null} mode
   * @returns {boolean} Whether the element took it.
   */
  const setArrowAlign = (elem, mode) => {
    if (!mode) {
      if (!elem?.hasAttribute(ARROW_ALIGN_ATTR)) return true
      restore(elem)
      elem.removeAttribute(ARROW_ALIGN_ATTR)
      for (const pos of ['start', 'end']) markerAt(elem, pos)?.marker.setAttribute('refX', CENTRE)
      return true
    }
    if (!canAlignArrows(elem)) return false
    elem.setAttribute(ARROW_ALIGN_ATTR, mode)
    syncArrowAlign(elem)
    return true
  }

  /**
   * How far a connector's endpoint must stay from the shape it is bound to, in user units, for an aligned head
   * (0 for Tip: the tip is the endpoint; the inset for Extend: the stroke stops short and the tip lands on the edge).
   * @param {Element} elem
   * @param {'start'|'end'} pos
   * @returns {?number} null when the element is not aligned (the caller keeps its own offset).
   */
  const getArrowOffset = (elem, pos) => {
    const mode = getArrowAlign(elem)
    if (!mode) return null
    const e = markerAt(elem, pos)
    if (!e) return 0
    return mode === 'extend' ? headPlacement(e.kind, pos, 'extend').inset * boxUnit(elem, e.marker) : 0
  }

  /**
   * The untrimmed geometry of a line or polyline as points, so that code that moves its ends
   * (the connector) works on the real ends.
   * @param {Element} elem
   * @returns {?Array<{x: number, y: number}>}
   */
  const getArrowSourcePoints = (elem) => {
    if (!elem?.hasAttribute?.(ARROW_PTS_ATTR)) return null
    return parsePoints(elem.getAttribute(ARROW_PTS_ATTR))
  }

  /**
   * Replace the untrimmed geometry of an aligned line or polyline (a connector re-routing) and trim again.
   * @param {Element} elem
   * @param {Array<{x: number, y: number}>} pts
   * @returns {boolean} false when the element holds no source (nothing was done).
   */
  const setArrowSourcePoints = (elem, pts) => {
    if (!elem?.hasAttribute?.(ARROW_PTS_ATTR) || pts.length < 2) return false
    elem.setAttribute(ARROW_PTS_ATTR, pts.map((p) => `${num(p.x)},${num(p.y)}`).join(' '))
    syncArrowAlign(elem, true)
    return true
  }

  // A transform baked into the element: its own geometry was remapped by coords.js, the source is ours.
  const remapSource = (elem, remap) => {
    const sp = readSubpath(elem, elem.getAttribute(sourceAttr(elem)))
    if (!sp) return
    const map = (p) => remap(p.x, p.y)
    const moved = { closed: false, anchors: sp.anchors.map((a) => anchor(map(a.p), map(a.hIn), map(a.hOut))) }
    elem.setAttribute(sourceAttr(elem), isPathTag(elem) ? anchorsToD([moved]) : pointsToStr(moved.anchors))
    syncArrowAlign(elem, true)
  }
  registerGeometryRemap(ARROW_D_ATTR, remapSource)
  registerGeometryRemap(ARROW_PTS_ATTR, remapSource)

  registerAttrValidator(ARROW_D_ATTR, pathDataValidator)
  registerAttrValidator(ARROW_PTS_ATTR, (value) => (parsePoints(value).length >= 2 ? true : 'is not a list of points'))
  registerAttrValidator(ARROW_TRIM_ATTR, (value) => (/^[\d.]+,[\d.]+$/.test(value) ? true : 'is not "start,end"'))
  registerAttrValidator(ARROW_ALIGN_ATTR, (value) => (value === 'tip' || value === 'extend' ? true : 'is not "tip" or "extend"'))

  svgCanvas.canAlignArrows = canAlignArrows
  svgCanvas.getArrowAlign = getArrowAlign
  svgCanvas.setArrowAlign = setArrowAlign
  svgCanvas.syncArrowAlign = syncArrowAlign
  svgCanvas.getArrowOffset = getArrowOffset
  svgCanvas.getArrowSourcePoints = getArrowSourcePoints
  svgCanvas.setArrowSourcePoints = setArrowSourcePoints
}
