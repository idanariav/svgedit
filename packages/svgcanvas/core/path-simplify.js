/**
 * Path simplification / smoothing via paper.js curve fitting.
 *
 *  - `simplifyFreehand(element, tolerance)` — replaces the freehand pencil
 *    polyline with a fitted-cubic `<path>` (used by the fhpath commit in
 *    event.js instead of the legacy every-3-points smoothing).
 *  - `smoothSelectedPath(tolerance)` — one-click smoothing of the selected
 *    `<path>`: flattens curves to dense samples, then refits an optimal set
 *    of cubic segments (paper.js flatten → simplify round-trip, which keeps
 *    the drawn shape while removing jitter and excess nodes).
 *
 * @module path-simplify
 * @license MIT
 */

import paper from 'paper/dist/paper-core.js'
import { warn } from '../common/logger.js'

// Flattening tolerance (user units) when resampling an existing path's curves.
const FLATTEN_TOLERANCE = 0.25
// Default curve-fitting tolerance — paper.js' recommended default for
// mouse/touch freehand input is 2.5.
const DEFAULT_TOLERANCE = 2.5
// The explicit "Smooth" action uses a stronger tolerance so each click gives a
// visible cleanup (paper compares squared distances, so 10 ≈ ~3px max error).
const SMOOTH_ACTION_TOLERANCE = 10

export const init = (canvas) => {
  const svgCanvas = canvas

  // Lazy-initialised paper.js scope — created once per instance on first use
  let paperScope = null
  const getPaperScope = () => {
    if (!paperScope) {
      paperScope = new paper.PaperScope()
      paperScope.setup(document.createElement('canvas'))
    }
    return paperScope
  }

  /**
   * Fit smooth cubic curves through a freehand polyline's points and swap it
   * for a `<path>`. Mirrors the contract of pathActions.smoothPolylineIntoPath:
   * reuses the polyline's id so addSVGElementsFromJson replaces it in place.
   * @param {Element} element - The `<polyline>` created by the fhpath tool.
   * @param {number} [tolerance]
   * @returns {Element} The new `<path>` (or the original element on failure).
   */
  const simplifyFreehand = (element, tolerance = DEFAULT_TOLERANCE) => {
    try {
      const { points } = element
      const n = points.numberOfItems
      if (n < 2) return element

      const scope = getPaperScope()
      const path = new scope.Path()
      for (let i = 0; i < n; i++) {
        const pt = points.getItem(i)
        path.add(new scope.Point(pt.x, pt.y))
      }
      path.simplify(tolerance)
      const d = path.pathData
      path.remove()
      if (!d) return element

      return svgCanvas.addSVGElementsFromJson({
        element: 'path',
        curStyles: true,
        attr: {
          id: svgCanvas.getId(),
          d,
          fill: 'none'
        }
      })
    } catch (err) {
      warn('Pencil simplify failed; keeping legacy smoothing', err, 'path-simplify')
      return svgCanvas.pathActions.smoothPolylineIntoPath(element)
    }
  }

  /**
   * Smooth one path's `d` (local space; transforms untouched): flatten curves
   * to dense line samples, then refit optimal cubics through them.
   * @param {string} d
   * @param {number} tolerance
   * @returns {string|null} The smoothed `d`, or null when nothing usable.
   */
  const smoothPathD = (d, tolerance) => {
    const scope = getPaperScope()
    const compound = new scope.CompoundPath(d)
    const children = compound.children?.length ? compound.children : [compound]
    const parts = []
    for (const child of children) {
      if (!child.segments?.length) continue
      child.flatten(FLATTEN_TOLERANCE)
      child.simplify(tolerance)
      parts.push(child.pathData)
    }
    compound.remove()
    return parts.length ? parts.join(' ') : null
  }

  /**
   * Smooth the currently selected `<path>` element, recording one undo step.
   * @param {number} [tolerance]
   * @returns {void}
   */
  const smoothSelectedPath = (tolerance = SMOOTH_ACTION_TOLERANCE) => {
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!elem || elem.tagName !== 'path') {
      warn('Smooth requires a selected path', null, 'path-simplify')
      return
    }

    let d
    try {
      d = smoothPathD(elem.getAttribute('d'), tolerance)
    } catch (err) {
      warn('Smooth path failed', err, 'path-simplify')
      return
    }
    if (!d || d === elem.getAttribute('d')) return

    svgCanvas.undoMgr.beginUndoableChange('d', [elem])
    elem.setAttribute('d', d)
    const cmd = svgCanvas.undoMgr.finishUndoableChange()
    if (!cmd.isEmpty()) {
      svgCanvas.addCommandToHistory(cmd)
    }
    svgCanvas.gettingSelectorManager().requestSelector(elem).resize()
    svgCanvas.call('changed', [elem])
  }

  svgCanvas.simplifyFreehand = simplifyFreehand
  svgCanvas.smoothSelectedPath = smoothSelectedPath
}
