// @ts-check
/**
 * The Pen's "continue" and "join" gestures: pressing on an end of an existing
 * open path carries that path on (or, while drawing, joins the drawing to it).
 * This module is the lookup and the geometry; `path-actions.js` drives the
 * gesture. Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/tools/src/pen.rs` (fix #776), MIT OR Apache-2.0.
 *
 * @module pen-continue
 * @license MIT
 */

import { parseAnchors, anchorsToD } from './anchor-path.js'
import { joinEnds, joinSubpaths, reversedSubpath } from './path-edit.js'
import { LIVE_ATTRS } from './path-join.js'
import { getTransformList, transformListToTransform, isIdentity } from './math.ts'

/**
 * @typedef {object} PenEnd
 * @property {Element} elem the open path
 * @property {boolean} atEnd `true` for its last anchor, `false` for its first
 * @property {{x: number, y: number}} point the end's position
 * @property {import('./anchor-path.js').SubPath} subpath the path's only subpath
 */

/** The stroke's first anchor sits on the path's end; this much apart still counts as the same point (user units). */
const MERGE_TOLERANCE = 0.5

/** Parsed open single-subpath paths, by element (a mouse move asks about every path in the layer). */
const parsed = new WeakMap()

/** @param {Element} elem */
const openSubpath = (elem) => {
  const d = elem.getAttribute('d') || ''
  let hit = parsed.get(elem)
  if (!hit || hit.d !== d) {
    const subpaths = parseAnchors(d, 0.1)
    hit = { d, subpath: subpaths.length === 1 && !subpaths[0].closed ? subpaths[0] : null }
    parsed.set(elem, hit)
  }
  return hit.subpath
}

/** @param {Element} elem */
const isPlain = (elem) => {
  if (LIVE_ATTRS.some((a) => elem.hasAttribute(a))) return false
  const tlist = getTransformList(elem)
  return !(tlist && tlist.numberOfItems && !isIdentity(transformListToTransform(tlist).matrix))
}

/**
 * The open, plain, untransformed path whose end is within `tolerance` of (x, y).
 * Paths with live geometry (`se:taper-d`, `se:orig-d`, `se:fx-d`) are skipped:
 * extending them would desync their source. So are paths with several subpaths
 * and closed ones (they have no end).
 * @param {Element} container the layer or group that new shapes are drawn into
 * @param {number} x
 * @param {number} y
 * @param {number} tolerance
 * @param {Element[]} [exclude]
 * @returns {?PenEnd} The closest end, or null.
 */
export const findPenEnd = (container, x, y, tolerance, exclude = []) => {
  let best = null
  for (const elem of container?.children ?? []) {
    if (elem.tagName !== 'path' || exclude.includes(elem)) continue
    const subpath = openSubpath(elem)
    if (!subpath) continue
    for (const atEnd of [false, true]) {
      const { p } = subpath.anchors[atEnd ? subpath.anchors.length - 1 : 0]
      const dist = Math.hypot(p.x - x, p.y - y)
      if (dist <= tolerance && (!best || dist < best.dist) && isPlain(elem)) best = { elem, atEnd, point: p, subpath, dist }
    }
  }
  if (!best) return null
  const { dist, ...end } = best
  return end
}

/**
 * Path data for `end`'s path with the pressed end last, so a drawing carries on
 * from it.
 * @param {PenEnd} end
 * @returns {string}
 */
export const continuationD = (end) =>
  anchorsToD([end.atEnd ? end.subpath : reversedSubpath(end.subpath)])

/**
 * The unit direction the path was travelling when it reached the pressed end, or null when it has no
 * direction there (a single anchor).
 * @param {PenEnd} end
 * @returns {?{x: number, y: number}}
 */
export const endDirection = (end) => {
  const { anchors } = end.atEnd ? end.subpath : reversedSubpath(end.subpath)
  const last = anchors[anchors.length - 1]
  const prev = anchors[anchors.length - 2]
  const same = (/** @type {{x: number, y: number}} */ a, /** @type {{x: number, y: number}} */ b) => a.x === b.x && a.y === b.y
  const from = !same(last.hIn, last.p) ? last.hIn : prev && (!same(prev.hOut, prev.p) ? prev.hOut : prev.p)
  if (!from) return null
  const dx = last.p.x - from.x
  const dy = last.p.y - from.y
  const len = Math.hypot(dx, dy)
  return len > 1e-9 ? { x: dx / len, y: dy / len } : null
}

/** @param {{x: number, y: number}} p */
const lone = (p) => ({ closed: false, anchors: [{ p, hIn: { ...p }, hOut: { ...p } }] })

/**
 * The drawing's anchors: its path data may be a lone `M` (one click), which the
 * parser drops.
 * @param {string} d
 * @returns {?import('./anchor-path.js').SubPath}
 */
export const drawnSubpath = (d) => {
  const [sp] = parseAnchors(d || '', 0.1)
  if (sp) return sp
  const m = /M\s*(-?[\d.e+-]+)[\s,]+(-?[\d.e+-]+)/i.exec(d || '')
  return m ? lone({ x: Number(m[1]), y: Number(m[2]) }) : null
}

/**
 * Which element survives a join and what it becomes.
 *
 * `drawn` is the Pen's drawing, its last anchor being the latest click, and
 * `other` is the path that was pressed. When the drawing carries on a path
 * (`continued`), that path survives and the other one is absorbed. Otherwise
 * the pressed path keeps its id, style and direction.
 * @param {import('./anchor-path.js').SubPath} drawn
 * @param {PenEnd} other
 * @param {boolean} continued
 * @returns {{subpath: import('./anchor-path.js').SubPath, keepsDrawing: boolean}}
 */
export const joinDrawn = (drawn, other, continued) => {
  if (continued || !other.atEnd) {
    return { subpath: joinEnds(drawn, true, other.subpath, other.atEnd), keepsDrawing: continued }
  }
  return { subpath: joinEnds(other.subpath, true, drawn, true), keepsDrawing: false }
}

/**
 * Carry `end`'s path on with a pencil stroke. The stroke's first anchor is expected to sit on the pressed
 * end (the pencil snaps its first point there) and merges into it. When the stroke finishes within `closeTol`
 * of the path's other end the path is closed instead. A path continued from its first anchor comes back the
 * way round it started (so markers and dashes keep their direction); a closed one has no direction to keep.
 * @param {PenEnd} end
 * @param {import('./anchor-path.js').SubPath} stroke the fitted stroke, starting at the pressed end
 * @param {number} closeTol
 * @returns {import('./anchor-path.js').SubPath}
 */
export const extendWith = (end, stroke, closeTol) => {
  const base = end.atEnd ? end.subpath : reversedSubpath(end.subpath)
  const joined = joinEnds(base, true, stroke, false, MERGE_TOLERANCE)
  const first = joined.anchors[0].p
  const last = joined.anchors[joined.anchors.length - 1].p
  if (joined.anchors.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) <= closeTol) {
    return joinSubpaths([joined], closeTol)[0]
  }
  return end.atEnd ? joined : reversedSubpath(joined)
}
