/**
 * Join for the select tool: two selected open paths become one (the upper one is
 * merged into the lower one, which keeps its id and style), or one open path is
 * closed. The geometry is `path-edit.js`'s `joinSubpaths`; this module is the
 * DOM side — eligibility, coordinate-space alignment and one undo step.
 *
 * @module path-join
 * @license MIT
 */

import { parseAnchors, anchorsToD } from './anchor-path.js'
import { joinSubpaths } from './path-edit.js'
import { getTransformList, transformListToTransform, matrixMultiply, transformPoint } from './math.js'

/** Endpoints closer than this (user units, at 100% zoom) merge into one anchor. */
const JOIN_TOLERANCE = 0.5

/** Source-geometry attributes of the live features: a path carrying one is not plain path data. */
export const LIVE_ATTRS = ['se:fx-d', 'se:orig-d', 'se:taper-d', 'se:arrow-d']

const isPlainPath = (elem) =>
  !!elem && elem.tagName === 'path' && !LIVE_ATTRS.some((a) => elem.hasAttribute(a))

const matrixOf = (elem) => {
  const tlist = getTransformList(elem)
  return tlist ? transformListToTransform(tlist).matrix : null
}

export const init = (canvas) => {
  const svgCanvas = canvas

  /**
   * Whether the elements can be joined: one plain path with an open subpath
   * (it will be closed), or two plain paths in the same parent.
   * @param {Element[]} elems
   * @returns {boolean}
   */
  const canJoinPaths = (elems) => {
    const list = (elems || []).filter(Boolean)
    if (list.length < 1 || list.length > 2 || !list.every(isPlainPath)) return false
    if (list.length === 2 && list[0].parentNode !== list[1].parentNode) return false
    return list.some((el) => parseAnchors(el.getAttribute('d') || '').some((sp) => !sp.closed))
  }

  /**
   * Join the selected paths (or close the selected open path) as one undo step.
   * @returns {?Element} The resulting path, or null when not eligible.
   */
  const joinSelectedPaths = () => {
    // The lower element in the document keeps its id and style.
    const selected = svgCanvas.getSelectedElements().filter(Boolean).sort((a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    if (!canJoinPaths(selected)) return null
    const { BatchCommand, ChangeElementCommand, RemoveElementCommand } = svgCanvas.history
    const [first, second] = selected
    const subpaths = parseAnchors(first.getAttribute('d') || '', 0.1)
    if (second) {
      // Bring the second path into the first one's coordinate system.
      const m1 = matrixOf(first)
      const m2 = matrixOf(second)
      const toFirst = m1 && m2 ? matrixMultiply(m1.inverse(), m2) : (m2 || (m1 ? m1.inverse() : null))
      const map = (pt) => (toFirst ? transformPoint(pt.x, pt.y, toFirst) : pt)
      for (const sp of parseAnchors(second.getAttribute('d') || '', 0.1)) {
        subpaths.push({
          closed: sp.closed,
          anchors: sp.anchors.map((a) => ({ p: map(a.p), hIn: map(a.hIn), hOut: map(a.hOut) }))
        })
      }
    }
    const zoom = svgCanvas.getZoom?.() || 1
    const d = anchorsToD(joinSubpaths(subpaths, JOIN_TOLERANCE / zoom))
    if (!d) return null

    const batchCmd = new BatchCommand(second ? 'Join paths' : 'Close path')
    const oldD = first.getAttribute('d')
    first.setAttribute('d', d)
    // The command reads the new value when it is created, so it follows the change.
    batchCmd.addSubCommand(new ChangeElementCommand(first, { d: oldD }))
    if (second) {
      batchCmd.addSubCommand(new RemoveElementCommand(second, second.nextSibling, second.parentNode))
      second.remove()
    }
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([first], true)
    svgCanvas.call('changed', [first])
    return first
  }

  svgCanvas.canJoinPaths = canJoinPaths
  svgCanvas.joinSelectedPaths = joinSelectedPaths
}
