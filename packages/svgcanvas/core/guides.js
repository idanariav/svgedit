// @ts-check
/**
 * Ruler guides: horizontal and vertical lines the user drags out of the rulers
 * to align things by. They are drawing data, not graphics: one attribute on the
 * drawing root, `se:guides="v:120,350;h:300.5"` (`v` = vertical lines, at those
 * x positions; `h` = horizontal lines, at those y positions, in document
 * units). It is saved with the file (the `se:` namespace survives sanitize and
 * the round trip), never exported as artwork, and every change is an undo step.
 *
 * Whether guides are shown / locked is the user's view setting, not the
 * drawing's: `curConfig.showGuides` / `curConfig.lockGuides`, managed by the
 * ruler-guides extension. A hidden guide neither draws nor snaps.
 *
 * @module guides
 * @license MIT
 */

import { registerAttrValidator } from './drawing-invariants.js'

export const GUIDES_ATTR = 'se:guides'

/** @typedef {{v: number[], h: number[]}} Guides */

const round = (/** @type {number} */ n) => Math.round(n * 100) / 100

/**
 * @param {unknown} list
 * @returns {number[]} finite numbers, rounded to 0.01, ascending, no duplicates
 */
const clean = (list) => {
  const nums = (Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite).map(round)
  return [...new Set(nums)].sort((a, b) => a - b)
}

/**
 * @param {?string|undefined} text an `se:guides` value
 * @returns {Guides} what it holds; anything unreadable is dropped
 */
export const parseGuides = (text) => {
  /** @type {Guides} */
  const guides = { v: [], h: [] }
  for (const part of String(text ?? '').split(';')) {
    const m = /^\s*([vh])\s*:\s*(.*)$/.exec(part)
    if (m) guides[/** @type {'v'|'h'} */ (m[1])] = clean(guides[/** @type {'v'|'h'} */ (m[1])].concat(m[2].split(',').map((s) => (s.trim() === '' ? NaN : Number(s)))))
  }
  return guides
}

/**
 * @param {Partial<Guides>} guides
 * @returns {string} the attribute value, '' when there are no guides
 */
export const formatGuides = (guides) => {
  const v = clean(guides.v)
  const h = clean(guides.h)
  return [v.length ? `v:${v.join(',')}` : '', h.length ? `h:${h.join(',')}` : ''].filter(Boolean).join(';')
}

/**
 * Whether an `se:guides` value is well formed (for `checkDrawing`).
 * @param {string} value
 * @returns {true|string}
 */
export const validateGuides = (value) => {
  if (value.trim() === '') return true
  for (const part of value.split(';')) {
    if (!/^\s*[vh]\s*:\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)*\s*$/.test(part)) return `has a bad entry "${part.trim().slice(0, 30)}" (expected v:x,x;h:y,y)`
  }
  return true
}

/**
 * Guides that count right now: none while the user hides them.
 * @param {any} svgCanvas
 * @returns {Guides}
 */
export const visibleGuides = (svgCanvas) =>
  svgCanvas.getCurConfig?.().showGuides === false ? { v: [], h: [] } : (svgCanvas.getGuides?.() ?? { v: [], h: [] })

/**
 * @param {any} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas
  registerAttrValidator(GUIDES_ATTR, validateGuides)

  /**
   * The drawing's guides, hidden or not.
   * @function module:guides.SvgCanvas#getGuides
   * @returns {Guides}
   */
  svgCanvas.getGuides = () => parseGuides(svgCanvas.getSvgContent().getAttribute(GUIDES_ATTR))

  /**
   * Replace the drawing's guides as one undo step.
   * @function module:guides.SvgCanvas#setGuides
   * @param {Partial<Guides>} guides
   * @param {string} [label] undo-menu text
   * @returns {boolean} whether anything changed
   */
  svgCanvas.setGuides = (guides, label = 'Edit guides') => {
    const root = svgCanvas.getSvgContent()
    const next = formatGuides(guides)
    if (next === formatGuides(parseGuides(root.getAttribute(GUIDES_ATTR)))) return false
    svgCanvas.transact(label, () => {
      if (next) root.setAttribute(GUIDES_ATTR, next)
      else root.removeAttribute(GUIDES_ATTR)
    })
    return true
  }
}
