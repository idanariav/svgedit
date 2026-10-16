// @ts-check
/**
 * Fitted dashes: stretch or squeeze a dash pattern so a whole number of periods fits the
 * stroke's length, with a dash centred on both ends of an open path.
 *
 * A run without corners (an open path or line, a circle, an ellipse, a smooth closed path) is
 * fitted as one: a periodic `stroke-dasharray` plus a `stroke-dashoffset`. A shape with corners
 * (a rectangle, a polygon, a polyline, a path with sharp turns) is fitted side by side: every
 * run between two corners gets its own whole number of periods, with a dash centred on each
 * corner (one dash bent round it, so the join is drawn) and on the ends of an open stroke. One
 * `stroke-dasharray` still serves the element: it lists the dashes of the whole outline, one
 * after another, which adds up to the length of the stroke (so it is not periodic, and can be
 * long for a long outline; `MAX_DASH_ENTRIES` caps it).
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

import { registerAttrValidator } from './drawing-invariants.ts'
import { parseAnchors, segCubic, segmentCount, cubicLength, polyline } from './anchor-path.ts'
import { startTangent, endTangent } from './bezier-fit.ts'
import { TAPER_ATTR } from './width-profile.ts'

export const DASH_FIT_ATTR = 'se:dash-fit'

/** A turn of more than this many degrees where two segments meet is a corner. */
const CORNER_DEG = 3

/** The most entries a fitted `stroke-dasharray` may have (every dash and every gap is one). */
export const MAX_DASH_ENTRIES = 4000

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
 * The first subpath of a shape as anchors, for the shapes whose corners can be fitted; null for the others.
 * @param {Element} elem
 * @returns {?import('./anchor-path.ts').SubPath} null: not one of them, more than one piece, or a rounded rect
 */
const outlineOf = (elem) => {
  /** @param {string} name */
  const num = (name) => parseFloat(elem.getAttribute(name) ?? '') || 0
  switch (elem.tagName.toLowerCase()) {
    case 'path': {
      const subpaths = parseAnchors(elem.getAttribute('d') || '', 0.1)
      return subpaths.length === 1 ? subpaths[0] : null
    }
    case 'line':
      return polyline([{ x: num('x1'), y: num('y1') }, { x: num('x2'), y: num('y2') }], false)
    case 'polyline':
    case 'polygon': {
      const nums = (elem.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number)
      if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null
      const pts = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      return polyline(pts, elem.tagName.toLowerCase() === 'polygon')
    }
    case 'rect': {
      if (num('rx') || num('ry')) return null // rounded: smooth, fitted as one run
      const [x, y, w, h] = [num('x'), num('y'), num('width'), num('height')]
      // The way a browser strokes a rect: clockwise from the top left corner.
      return polyline([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true)
    }
    default:
      return null
  }
}

/**
 * Where a subpath has corners, and how long it is.
 * @param {import('./anchor-path.ts').SubPath} sp
 * @returns {{total: number, closed: boolean, cuts: number[]}} `cuts`: the arc length of each corner from the start of the
 *   path (a closed path's start counts, at 0, when it is a corner; an open path's ends never do)
 */
export const outlineCorners = (sp) => {
  const n = segmentCount(sp)
  const cum = [0]
  for (let i = 0; i < n; i++) cum.push(cum[i] + cubicLength(segCubic(sp, i)))
  /** @type {number[]} */
  const cuts = []
  for (let i = sp.closed ? 0 : 1; i < n; i++) {
    const before = endTangent(segCubic(sp, (i + n - 1) % n))
    const after = startTangent(segCubic(sp, i % n))
    const turn = Math.acos(Math.max(-1, Math.min(1, before.x * after.x + before.y * after.y))) * 180 / Math.PI
    if (turn > CORNER_DEG) cuts.push(cum[i])
  }
  return { total: cum[n], closed: sp.closed, cuts }
}

/**
 * The stretches (as arc lengths from `s`) that a pattern paints along one run `s`..`e`: a whole number of periods, the
 * run starting and ending half way through the first dash.
 * @param {number[]} base the pattern, an even count
 * @param {number} s
 * @param {number} e
 * @returns {Array<[number, number]>}
 */
const runDashes = (base, s, e) => {
  const length = e - s
  const period = base.reduce((a, b) => a + b, 0)
  const periods = Math.max(1, Math.round(length / period))
  const scale = length / (periods * period)
  const arr = base.map((v) => v * scale)
  const from = arr[0] / 2
  /** @type {Array<[number, number]>} */
  const out = []
  let pos = 0
  for (let k = 0; k <= periods && pos < from + length; k++) {
    for (let j = 0; j < arr.length; j++) {
      const a = Math.max(pos, from)
      const b = Math.min(pos + arr[j], from + length)
      if (j % 2 === 0 && b > a + 1e-9) out.push([a - from + s, b - from + s])
      pos += arr[j]
    }
  }
  return out
}

/**
 * Fit a dash pattern to an outline with corners, run by run (see the module comment).
 * @param {number[]} pattern the pattern as the user wrote it (an odd count repeats, as in SVG)
 * @param {number} total the stroke's length
 * @param {boolean} closed
 * @param {number[]} cuts the arc length of each corner (`outlineCorners`), at least one
 * @returns {?{array: number[], offset: number}} an even number of entries that add up to `total`; null when the
 *   pattern or the length is empty
 */
export const fitDashesCornered = (pattern, total, closed, cuts) => {
  const base = pattern.length % 2 ? [...pattern, ...pattern] : pattern
  if (!(base.reduce((a, b) => a + b, 0) > 0) || !(total > 0) || !cuts.length) return null
  // A closed outline is walked from its first corner, so the dash round that corner is one piece (below).
  const origin = closed ? cuts[0] : 0
  const bounds = closed ? [0, ...cuts.slice(1).map((c) => c - origin), total] : [0, ...cuts, total]
  /** @type {Array<[number, number]>} */
  let on = []
  for (let i = 0; i + 1 < bounds.length; i++) {
    for (const [a, b] of runDashes(base, bounds[i], bounds[i + 1])) {
      const last = on[on.length - 1]
      // The end of one run and the start of the next meet at their corner: one dash.
      if (last && a - last[1] < 1e-6) last[1] = b
      else on.push([a, b])
    }
  }
  let offset = 0
  if (closed) {
    const head = on[0]
    const tail = on[on.length - 1]
    // The dash round the first corner is split by the start of the frame: join its two parts at the front.
    if (on.length > 1 && head[0] < 1e-6 && tail[1] > total - 1e-6) {
      const lead = tail[1] - tail[0]
      on = [[0, head[1] + lead], ...on.slice(1, -1).map(/** @returns {[number, number]} */ ([a, b]) => [a + lead, b + lead])]
      offset = lead
    }
    // Where the path's own start lies in that frame.
    offset = (offset + (total - origin)) % total
  }
  /** @type {number[]} */
  const array = []
  let pos = 0
  for (const [a, b] of on) {
    const gap = a - pos
    if (array.length) array.push(round5(gap))
    else if (gap > 1e-9) array.push(0, round5(gap)) // starts with a gap: an empty dash first
    array.push(round5(b - a))
    pos = b
  }
  array.push(round5(Math.max(0, total - pos))) // a gap (maybe empty) last: an odd count would repeat the other way round
  if (array.length % 2) array.unshift(0)
  return { array, offset: round5(offset) }
}

/**
 * Why the element cannot have its dashes fitted.
 * @param {Element} elem
 * @returns {?string} null when it can
 */
export const dashFitIssue = (elem) => {
  const tag = elem?.tagName?.toLowerCase()
  if (!['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'].includes(tag)) {
    return 'Fitting dashes works on a line, a path, a polyline, a polygon, a rectangle, a circle or an ellipse'
  }
  if (elem.hasAttribute(TAPER_ATTR)) return 'A tapered stroke has no dashes'
  const outline = outlineOf(elem)
  if (tag === 'path' && !outline) return 'Fitting dashes needs a path of one piece'
  if ((tag === 'polyline' || tag === 'polygon') && !outline) return 'Fitting dashes needs a polyline or polygon with at least two points'
  const pattern = parseDashes(elem.getAttribute(DASH_FIT_ATTR)) ?? parseDashes(elem.getAttribute('stroke-dasharray'))
  if (!pattern) return 'Pick a dash pattern first'
  if (outline) {
    const { total, closed, cuts } = outlineCorners(outline)
    const fit = cuts.length ? fitDashesCornered(pattern, total, closed, cuts) : null
    if (fit && fit.array.length > MAX_DASH_ENTRIES) return 'Too many dashes to fit round the corners: use a longer pattern'
  }
  return null
}

/**
 * @param {import('../svgcanvas.js').default} canvas
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
    // Corners: one fit per run, as an explicit list of the outline's dashes.
    const outline = outlineOf(elem)
    const corners = outline ? outlineCorners(outline) : null
    if (corners?.cuts.length) {
      const fit = fitDashesCornered(pattern, corners.total, corners.closed, corners.cuts)
      if (!fit) return false
      elem.setAttribute(DASH_FIT_ATTR, pattern.join(','))
      elem.setAttribute('stroke-dasharray', fit.array.join(','))
      if (fit.offset) elem.setAttribute('stroke-dashoffset', String(fit.offset))
      else elem.removeAttribute('stroke-dashoffset')
      return true
    }
    const length = /** @type {SVGGeometryElement} */ (elem).getTotalLength()
    const closed = ['circle', 'ellipse', 'rect', 'polygon'].includes(elem.tagName) ||
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
    if (!list.some((/** @type {Element} */ el) => el.hasAttribute(DASH_FIT_ATTR))) return false
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
