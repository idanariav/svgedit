// @ts-check
/**
 * Path simplification / smoothing, on the corner-keeping Bézier fit in
 * `path-fit.js` (sharp turns stay corners; tolerances are distances in user
 * units).
 *
 *  - `simplifyFreehand(element, fidelity)` — replaces the freehand pencil
 *    polyline with a fitted-cubic `<path>` (used by the fhpath commit in
 *    event.js instead of the legacy every-3-points smoothing).
 *  - `previewSmoothPath(strength)` / `commitSmoothPath()` / `cancelSmoothPath()`
 *    — non-destructive smoothing of the selected `<path>` for the
 *    `se-smooth-path-settings` popover: refits each run of the path between
 *    its corners with as few cubics as fit within the tolerance. `strength`
 *    (0-1) always re-fits from the shape as it was when the popover opened,
 *    not from the live (possibly already-smoothed) `d` — repeated adjustments
 *    within one session cannot compound.
 *
 * @module path-simplify
 * @license MIT
 */

import { warn } from '../common/logger.js'
import { parseAnchors, anchorsToD } from './anchor-path.js'
import { simplifyWith, fitFreehand } from './path-fit.js'
import { findPenEnd, extendWith } from './pen-continue.js'

// The pencil's default fidelity: the most the committed curve may stray from
// the drawn stroke, in user units (about 2 px at 100% zoom).
const DEFAULT_FIDELITY = 2
// Strength (0-1, from the "Smooth Path" popover) maps linearly onto this
// tolerance range, in user units.
const MIN_TOLERANCE = 0.5
const MAX_TOLERANCE = 10
const DEFAULT_STRENGTH = 0.4
// Turns sharper than this stay corners when smoothing an existing path.
const SMOOTH_CORNER_ANGLE = 30
// A pencil press this close (screen px) to an end of the selected open path carries that path on.
const CONTINUE_REACH = 6

// Exported for direct unit testing — pure math, no paper.js dependency.
export const strengthToTolerance = (strength) =>
  MIN_TOLERANCE + Math.max(0, Math.min(1, strength)) * (MAX_TOLERANCE - MIN_TOLERANCE)

export const init = (canvas) => {
  const svgCanvas = canvas

  /**
   * Fit smooth cubic curves through a freehand polyline's points (sharp turns
   * of the pen stay corners) and swap it for a `<path>`. Mirrors the contract
   * of pathActions.smoothPolylineIntoPath: reuses the polyline's id so
   * addSVGElementsFromJson replaces it in place.
   * @param {Element} element - The `<polyline>` created by the fhpath tool.
   * @param {number} [fidelity] - Largest distance, in user units, the curve may stray from the stroke.
   * @returns {Element} The new `<path>` (or the original element on failure).
   */
  const simplifyFreehand = (element, fidelity = DEFAULT_FIDELITY) => {
    try {
      const { points } = /** @type {SVGPolylineElement} */ (element)
      const n = points.numberOfItems
      if (n < 2) return element

      const stroke = []
      for (let i = 0; i < n; i++) {
        const pt = points.getItem(i)
        stroke.push({ x: pt.x, y: pt.y })
      }
      const fitted = fitFreehand(stroke, Number.isFinite(fidelity) && fidelity > 0 ? fidelity : DEFAULT_FIDELITY)
      if (fitted.anchors.length < 2) return element

      return svgCanvas.addSVGElementsFromJson({
        element: 'path',
        curStyles: true,
        attr: {
          id: svgCanvas.getId(),
          d: anchorsToD([fitted]),
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
   * Smooth one path's `d` (local space; transforms untouched): refit each run
   * between its corners with as few cubics as fit within `tolerance`.
   * @param {string} d
   * @param {number} tolerance - Largest distance, in user units, the result may stray from `d`.
   * @returns {string|null} The smoothed `d`, or null when nothing usable.
   */
  const smoothPathD = (d, tolerance) => {
    const subpaths = parseAnchors(d).filter((sp) => sp.anchors.length > 0)
    if (!subpaths.length) return null
    return anchorsToD(simplifyWith(subpaths, { tolerance, cornerAngleDeg: SMOOTH_CORNER_ANGLE }))
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

  /**
   * The end of the selected open path a pencil press at (x, y) would carry on, if any: exactly one plain,
   * untransformed, single-subpath open path selected in the current layer, pressed within `CONTINUE_REACH`.
   * @param {number} x
   * @param {number} y
   * @returns {?import('./pen-continue.js').PenEnd}
   */
  const pencilEnd = (x, y) => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (selected.length !== 1 || svgCanvas.getCurrentGroup()) return null
    if (selected[0].parentNode !== svgCanvas.getCurrentDrawing().getCurrentLayer()) return null
    return findPenEnd(/** @type {any} */ ({ children: [selected[0]] }), x, y, CONTINUE_REACH / (svgCanvas.getZoom() || 1))
  }

  /**
   * Finish a pencil stroke that started on `end` by adding it to that path (one undo step) instead of
   * creating a new element. The stroke's `<polyline>` is thrown away; a stroke that ends near the path's
   * other end closes the path.
   * @param {Element} polyline - The `<polyline>` created by the fhpath tool; its first point is `end.point`.
   * @param {import('./pen-continue.js').PenEnd} end
   * @param {number} [fidelity] - As for `simplifyFreehand`.
   * @returns {Element} The continued path.
   */
  const continueFreehand = (polyline, end, fidelity = DEFAULT_FIDELITY) => {
    const { points } = /** @type {SVGPolylineElement} */ (polyline)
    const stroke = []
    for (let i = 0; i < points.numberOfItems; i++) stroke.push({ x: points.getItem(i).x, y: points.getItem(i).y })
    svgCanvas.getCurrentDrawing().releaseId(svgCanvas.getId())
    polyline.remove()
    const tolerance = Number.isFinite(fidelity) && fidelity > 0 ? fidelity : DEFAULT_FIDELITY
    const fitted = fitFreehand(stroke, tolerance)
    if (fitted.anchors.length >= 2) {
      const closeTol = Math.max(4 * tolerance, CONTINUE_REACH / (svgCanvas.getZoom() || 1))
      const d = anchorsToD([extendWith(end, fitted, closeTol)])
      svgCanvas.transact('Continue path', () => end.elem.setAttribute('d', d))
    }
    if (!svgCanvas.getToolLocked()) {
      svgCanvas.setMode('select')
      svgCanvas.selectOnly([end.elem], true)
    }
    svgCanvas.call('changed', [end.elem])
    return end.elem
  }

  svgCanvas.pencilEnd = pencilEnd
  svgCanvas.continueFreehand = continueFreehand
  svgCanvas.simplifyFreehand = simplifyFreehand
  svgCanvas.previewSmoothPath = previewSmoothPath
  svgCanvas.commitSmoothPath = commitSmoothPath
  svgCanvas.cancelSmoothPath = cancelSmoothPath
  // Reusable one-shot refit for any tool holding a raw `d` (e.g. puppet-warp's
  // dense warped polylines): flatten curves to samples, then fit optimal cubic
  // béziers. Returns absolute path data, or null when nothing usable.
  svgCanvas.simplifyPathD = smoothPathD
}
