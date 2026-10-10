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
import { joinEnds, reversedSubpath } from './path-edit.js'
import { LIVE_ATTRS } from './path-join.js'
import { getTransformList, transformListToTransform, isIdentity } from './math.js'

/**
 * @typedef {object} PenEnd
 * @property {Element} elem the open path
 * @property {boolean} atEnd `true` for its last anchor, `false` for its first
 * @property {{x: number, y: number}} point the end's position
 * @property {import('./anchor-path.js').SubPath} subpath the path's only subpath
 */

/** Parsed open single-subpath paths, by element (a mouse move asks about every path in the layer). */
const parsed = new WeakMap()

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
