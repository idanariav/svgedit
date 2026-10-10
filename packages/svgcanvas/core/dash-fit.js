/**
 * Fitted dashes: stretch or squeeze a dash pattern so a whole number of periods fits the
 * stroke's length, with a dash centred on both ends of an open path. One `stroke-dasharray`
 * serves the whole element, so this works for a single run only: an open path, line or closed
 * curve without corners (a circle, an ellipse, a smooth closed path). A shape with corners
 * would need one pattern per side; it is refused, with the reason.
 *
 * The user's pattern is kept in `se:dash-fit` (comma-separated, as typed), so fitting again, or
 * turning the fit off, starts from it and fits never compound. `stroke-dasharray` and
 * `stroke-dashoffset` hold the fitted result.
 *
 * Dash fitting after VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/effects/src/stroke/dash.rs`, MIT OR Apache-2.0 (its `align_corners`, for one run).
 *
 * @module dash-fit
 * @license MIT
 */

import { registerAttrValidator } from './drawing-invariants.js'
import { parseAnchors, segCubic, segmentCount } from './anchor-path.js'
import { startTangent, endTangent } from './bezier-fit.js'
import { TAPER_ATTR } from './taper-stroke.js'

export const DASH_FIT_ATTR = 'se:dash-fit'

/** A turn of more than this many degrees where two segments meet is a corner. */
const CORNER_DEG = 3

const round5 = (/** @type {number} */ n) => Math.round(n * 100000) / 100000

/**
 * @param {?string|undefined} text a `stroke-dasharray` or `se:dash-fit` value
 * @returns {?number[]} the lengths, at least one, none negative; null for `none` or anything unreadable
 */
export const parseDashes = (text) => {
  if (!text || /^\s*none\s*$/i.test(text)) return null
  const nums = text.trim().split(/[\s,]+/).map(Number)
  if (!nums.length || nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  return nums
}

/**
 * Validator for `se:dash-fit` (see `drawing-invariants.js`).
 * @param {string} value
 * @returns {true|string}
 */
export const validateDashFit = (value) => {
  const nums = parseDashes(value)
  if (!nums) return 'is not a list of dash lengths'
  return nums.some((n) => n > 0) ? true : 'has no dash length'
}

/**
 * Fit a dash pattern to a stroke.
 * @param {number[]} pattern the pattern as the user wrote it (an odd count repeats, as in SVG)
 * @param {number} length the stroke's length
 * @param {boolean} closed a closed curve has no ends to centre a dash on
 * @returns {?{array: number[], offset: number}} `array` is a whole number of periods long in total;
 *   null when the pattern or the length is empty
 */
export const fitDashes = (pattern, length, closed) => {
  const base = pattern.length % 2 ? [...pattern, ...pattern] : pattern
  const period = base.reduce((a, b) => a + b, 0)
  if (!(period > 0) || !(length > 0)) return null
  const periods = Math.max(1, Math.round(length / period))
  const scale = length / (periods * period)
  const array = base.map((v) => round5(v * scale))
  // Start the stroke halfway through the first dash, so it is centred there and, a whole number of
  // periods later, on the last end too.
  return { array, offset: closed ? 0 : round5(array[0] / 2) }
}

/**
 * Why the element cannot have its dashes fitted.
 * @param {Element} elem
 * @returns {?string} null when it can
 */
export const dashFitIssue = (elem) => {
  const tag = elem?.tagName?.toLowerCase()
  if (!['path', 'line', 'circle', 'ellipse'].includes(tag)) {
    return 'Fitting dashes works on a line, a circle, an ellipse or a path without corners'
  }
  if (elem.hasAttribute(TAPER_ATTR)) return 'A tapered stroke has no dashes'
  if (tag === 'path') {
    const subpaths = parseAnchors(elem.getAttribute('d') || '', 0.1)
    if (subpaths.length !== 1) return 'Fitting dashes needs a path of one piece'
    const [sp] = subpaths
    const n = segmentCount(sp)
    // Corners: where a segment arrives at a different heading than the next one leaves.
    for (let i = sp.closed ? 0 : 1; i < n; i++) {
      const before = endTangent(segCubic(sp, (i + n - 1) % n))
      const after = startTangent(segCubic(sp, i % n))
      const turn = Math.acos(Math.max(-1, Math.min(1, before.x * after.x + before.y * after.y))) * 180 / Math.PI
      if (turn > CORNER_DEG) return 'Fitting dashes needs a path without corners'
    }
  }
  if (!parseDashes(elem.getAttribute(DASH_FIT_ATTR)) && !parseDashes(elem.getAttribute('stroke-dasharray'))) {
    return 'Pick a dash pattern first'
  }
  return null
}

/**
 * @param {any} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas
  registerAttrValidator(DASH_FIT_ATTR, validateDashFit)

  /**
   * Write the fit of `pattern` onto `elem`.
   * @param {Element} elem
   * @param {number[]} pattern
   * @returns {boolean} false (nothing written) when the pattern or the length is empty
   */
  const applyFit = (elem, pattern) => {
    const length = /** @type {SVGGeometryElement} */ (elem).getTotalLength()
    const closed = elem.tagName === 'circle' || elem.tagName === 'ellipse' ||
      (elem.tagName === 'path' && Boolean(parseAnchors(elem.getAttribute('d') || '', 0.1)[0]?.closed))
    const fit = fitDashes(pattern, length, closed)
    if (!fit) return false
    elem.setAttribute(DASH_FIT_ATTR, pattern.join(','))
    elem.setAttribute('stroke-dasharray', fit.array.join(','))
    if (fit.offset) elem.setAttribute('stroke-dashoffset', String(fit.offset))
    else elem.removeAttribute('stroke-dashoffset')
    return true
  }

  /** Put the user's own pattern back. */
  const clearFit = (/** @type {Element} */ elem, /** @type {?string} */ pattern) => {
    if (pattern) elem.setAttribute('stroke-dasharray', pattern)
    else elem.removeAttribute('stroke-dasharray')
    elem.removeAttribute('stroke-dashoffset')
    elem.removeAttribute(DASH_FIT_ATTR)
  }

  /**
   * Whether dashes are fitted on every one of the elements.
   * @function module:dash-fit.SvgCanvas#isDashFitted
   * @param {Element[]} [elems] default: the selection
   * @returns {boolean}
   */
  svgCanvas.isDashFitted = (elems = svgCanvas.getSelectedElements()) => {
    const list = elems.filter(Boolean)
    return list.length > 0 && list.every((el) => el.hasAttribute(DASH_FIT_ATTR))
  }

  svgCanvas.dashFitIssue = dashFitIssue

  /**
   * Fit the dashes of the elements (or turn the fit off), as one undo step. Elements that cannot be
   * fitted are left alone.
   * @function module:dash-fit.SvgCanvas#setDashFit
   * @param {boolean} on
   * @param {Element[]} [elems] default: the selection
   * @returns {number} how many elements changed
   */
  svgCanvas.setDashFit = (on, elems = svgCanvas.getSelectedElements()) => {
    const list = elems.filter(Boolean).filter((el) => (on ? dashFitIssue(el) === null : el.hasAttribute(DASH_FIT_ATTR)))
    if (!list.length) return 0
    let changed = 0
    svgCanvas.transact(on ? 'Fit dashes' : 'Unfit dashes', () => {
      for (const el of list) {
        const nominal = parseDashes(el.getAttribute(DASH_FIT_ATTR)) ?? parseDashes(el.getAttribute('stroke-dasharray'))
        if (on) {
          if (nominal && applyFit(el, nominal)) changed++
        } else {
          clearFit(el, el.getAttribute(DASH_FIT_ATTR))
          changed++
        }
      }
    })
    svgCanvas.call('changed', list)
    return changed
  }

  /**
   * Choose a dash pattern for the selection. Fitted elements take it as their new pattern and are
   * fitted again; the rest get it as a plain `stroke-dasharray`. One undo step.
   * @function module:dash-fit.SvgCanvas#setDashPattern
   * @param {string} value a `stroke-dasharray` value, `none` for solid
   * @returns {boolean} false when nothing is fitted (the caller sets the attribute as usual)
   */
  svgCanvas.setDashPattern = (value) => {
    const list = svgCanvas.getSelectedElements().filter(Boolean)
    if (!list.some((el) => el.hasAttribute(DASH_FIT_ATTR))) return false
    const pattern = parseDashes(value)
    svgCanvas.transact('Change dash', () => {
      for (const el of list) {
        if (!el.hasAttribute(DASH_FIT_ATTR)) {
          el.setAttribute('stroke-dasharray', value)
        } else if (!pattern || !applyFit(el, pattern)) {
          clearFit(el, pattern ? value : null)
          if (!pattern) el.setAttribute('stroke-dasharray', value)
        }
      }
    })
    svgCanvas.call('changed', list)
    return true
  }
}
