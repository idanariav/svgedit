/**
 * Path simplification / smoothing via paper.js curve fitting.
 *
 *  - `simplifyFreehand(element, tolerance)` — replaces the freehand pencil
 *    polyline with a fitted-cubic `<path>` (used by the fhpath commit in
 *    event.js instead of the legacy every-3-points smoothing).
 *  - `previewSmoothPath(strength)` / `commitSmoothPath()` / `cancelSmoothPath()`
 *    — non-destructive smoothing of the selected `<path>` for the
 *    `se-smooth-path-settings` popover: flattens curves to dense samples,
 *    then refits an optimal set of cubic segments (paper.js flatten →
 *    simplify round-trip). `strength` (0-1) always re-fits from the shape as
 *    it was when the popover opened, not from the live (possibly
 *    already-smoothed) `d` — repeated adjustments within one session cannot
 *    compound.
 *
 * @module path-simplify
 * @license MIT
 */

import { warn } from '../common/logger.js'
import { getPaperScope } from './paper-utils.js'

// Flattening tolerance (user units) when resampling an existing path's curves.
const FLATTEN_TOLERANCE = 0.25
// Default curve-fitting tolerance — paper.js' recommended default for
// mouse/touch freehand input is 2.5.
const DEFAULT_TOLERANCE = 2.5
// Strength (0-1, from the "Smooth Path" popover) maps linearly onto this
// tolerance range (paper compares squared distances, so tolerance 10 ≈ ~3px
// max error).
const MIN_TOLERANCE = 1
const MAX_TOLERANCE = 25
const DEFAULT_STRENGTH = 0.4

// Exported for direct unit testing — pure math, no paper.js dependency.
export const strengthToTolerance = (strength) =>
  MIN_TOLERANCE + Math.max(0, Math.min(1, strength)) * (MAX_TOLERANCE - MIN_TOLERANCE)

export const init = (canvas) => {
  const svgCanvas = canvas

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
          fill: 'none',
          'data-freehand': '1'
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

  // Non-destructive smoothing session state for the se-smooth-path-settings
  // popover: `previewBaseline` is the path's `d` as of the moment smoothing
  // was first previewed for `previewElem`, so repeated strength adjustments
  // always re-fit from the same untouched shape instead of compounding.
  // `previewLastD` is the most recent previewed result, needed so
  // commitSmoothPath can record a single undo step from baseline -> final.
  let previewElem = null
  let previewBaseline = null
  let previewLastD = null

  const getSelectedPath = () => {
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    return (elem && elem.tagName === 'path') ? elem : null
  }

  const refreshSelector = (elem) => {
    svgCanvas.gettingSelectorManager().requestSelector(elem).resize()
    svgCanvas.call('changed', [elem])
  }

  /**
   * Live-preview smoothing the selected path at the given strength, without
   * recording undo history. Safe to call on every strength-slider tick.
   * @param {number} [strength] - 0 (barely-there cleanup) to 1 (aggressive).
   * @returns {void}
   */
  const previewSmoothPath = (strength = DEFAULT_STRENGTH) => {
    const elem = getSelectedPath()
    if (!elem) {
      warn('Smooth requires a selected path', null, 'path-simplify')
      return
    }
    if (previewElem !== elem) {
      previewElem = elem
      previewBaseline = elem.getAttribute('d')
    }

    let d
    try {
      d = smoothPathD(previewBaseline, strengthToTolerance(strength))
    } catch (err) {
      warn('Smooth path preview failed', err, 'path-simplify')
      return
    }
    if (!d) return

    previewLastD = d
    elem.setAttribute('d', d)
    refreshSelector(elem)
  }

  /**
   * Commit the current preview as one undoable change (baseline -> last
   * previewed result), then clear the preview session.
   * @returns {void}
   */
  const commitSmoothPath = () => {
    const elem = previewElem
    const baseline = previewBaseline
    const finalD = previewLastD
    previewElem = null
    previewBaseline = null
    previewLastD = null
    if (!elem || !finalD || finalD === baseline) return

    elem.setAttribute('d', baseline)
    svgCanvas.undoMgr.beginUndoableChange('d', [elem])
    elem.setAttribute('d', finalD)
    const cmd = svgCanvas.undoMgr.finishUndoableChange()
    if (!cmd.isEmpty()) {
      svgCanvas.addCommandToHistory(cmd)
    }
    refreshSelector(elem)
  }

  /**
   * Discard the current preview, restoring the path to its pre-preview `d`
   * with no undo step recorded (used when the popover is dismissed without
   * applying).
   * @returns {void}
   */
  const cancelSmoothPath = () => {
    const elem = previewElem
    const baseline = previewBaseline
    previewElem = null
    previewBaseline = null
    previewLastD = null
    if (!elem) return

    elem.setAttribute('d', baseline)
    refreshSelector(elem)
  }

  svgCanvas.simplifyFreehand = simplifyFreehand
  svgCanvas.previewSmoothPath = previewSmoothPath
  svgCanvas.commitSmoothPath = commitSmoothPath
  svgCanvas.cancelSmoothPath = cancelSmoothPath
}
