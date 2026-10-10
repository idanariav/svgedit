// @ts-check
/**
 * Select Same: extend the selection to every element that shares a property
 * with the primary selected element. Colour criteria take a tolerance, a
 * distance in the OKLab colour space scaled so that black against white is 100
 * (about 2 is the smallest difference an eye notices, 5 reads as "the same
 * colour family"). Tolerance 0 is an exact match of the attribute text.
 *
 * Criteria: `fill`, `stroke`, `fillstroke` (both), `strokeweight`, `opacity`,
 * `type` (the tag name).
 *
 * @module select-same
 * @license MIT
 */

// The modular entry point: only the colour modes and parsers the fills and strokes of a drawing use
// (hex, names, rgb(), hsl()), not all of culori.
import { useMode, useParser, parse, modeRgb, modeOklab, modeHsl, parseHex, parseNamed, parseRgb, parseHsl, parseTransparent } from 'culori/fn'

useMode(modeRgb)
useMode(modeHsl)
const toOklab = useMode(modeOklab)
for (const parser of [parseHex, parseNamed, parseRgb, parseHsl, parseTransparent]) useParser(parser)

/** @typedef {'fill'|'stroke'|'type'|'fillstroke'|'strokeweight'|'opacity'} SelectSameCriterion */
export const SELECT_SAME_CRITERIA = ['fill', 'stroke', 'type', 'fillstroke', 'strokeweight', 'opacity']

/**
 * Distance between two CSS colours in OKLab, black to white = 100.
 * @param {string} a
 * @param {string} b
 * @returns {number} `Infinity` when either is not a plain colour (`none`, `url(#g)`, …)
 */
export const colorDistance = (a, b) => {
  const ca = parse(a)
  const cb = parse(b)
  if (!ca || !cb) return Infinity
  const x = toOklab(ca)
  const y = toOklab(cb)
  return 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}

/**
 * The attributes a viewer sees. A tapered stroke is drawn as a filled outline,
 * so its colour is `fill` and its width and stroke paint are in `se:taper-style`
 * ("width|paint"): read it as the stroked line it stands for.
 * @param {Element} el
 * @returns {{fill: string, stroke: string, strokeWidth: number, opacity: number}}
 */
export const appearanceOf = (el) => {
  const norm = (/** @type {string} */ attr, /** @type {string} */ def) => {
    const v = el.getAttribute(attr)
    return v === null || v.trim() === '' ? def : v.trim().toLowerCase()
  }
  const num = (/** @type {string} */ attr, /** @type {number} */ def) => {
    const n = parseFloat(el.getAttribute(attr) ?? '')
    return Number.isFinite(n) ? n : def
  }
  const taper = el.getAttribute('se:taper-style')
  if (taper) {
    const sep = taper.indexOf('|')
    return {
      fill: 'none',
      stroke: taper.slice(sep + 1).trim().toLowerCase(),
      strokeWidth: parseFloat(taper.slice(0, sep)) || 1,
      opacity: num('opacity', 1)
    }
  }
  const stroke = norm('stroke', 'none')
  return {
    fill: norm('fill', '#000000'),
    stroke,
    // Without a stroke the width is irrelevant: unstroked shapes all have "no weight".
    strokeWidth: stroke === 'none' ? 0 : num('stroke-width', 1),
    opacity: num('opacity', 1)
  }
}

/**
 * @param {string} a normalised paint
 * @param {string} b normalised paint
 * @param {number} tolerance
 * @returns {boolean}
 */
export const samePaint = (a, b, tolerance) => a === b || (tolerance > 0 && colorDistance(a, b) <= tolerance)

/**
 * @param {SelectSameCriterion|string} criterion
 * @param {Element} ref the primary selected element
 * @param {Element} el a candidate
 * @param {number} [tolerance] colour tolerance, 0 = exact
 * @returns {boolean}
 */
export const matchesSame = (criterion, ref, el, tolerance = 0) => {
  if (criterion === 'type') return el.tagName === ref.tagName
  const a = appearanceOf(ref)
  const b = appearanceOf(el)
  switch (criterion) {
    case 'fill': return samePaint(a.fill, b.fill, tolerance)
    case 'stroke': return samePaint(a.stroke, b.stroke, tolerance)
    case 'fillstroke': return samePaint(a.fill, b.fill, tolerance) && samePaint(a.stroke, b.stroke, tolerance)
    case 'strokeweight': return Math.abs(a.strokeWidth - b.strokeWidth) < 1e-6
    case 'opacity': return Math.abs(a.opacity - b.opacity) < 1e-6
    default: return el.tagName === ref.tagName
  }
}

/**
 * @param {any} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  /**
   * Extend the selection to every element (in the current group context, or on
   * any visible layer) that shares a property with the primary selected element.
   * @function module:select-same.SvgCanvas#selectSameAs
   * @param {SelectSameCriterion|string} criterion
   * @param {{tolerance?: number}} [options] `tolerance`: colour distance (see the module comment), default 0 = exact
   * @returns {void}
   */
  const selectSameAs = (criterion, options = {}) => {
    const [ref] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!ref) return
    const tolerance = Math.max(0, Number(options.tolerance) || 0)
    const found = []
    /** @param {Element} parent */
    const scan = (parent) => {
      for (const el of parent.children) {
        if (el.tagName === 'title' || el.hasAttribute('data-frame')) continue
        if (matchesSame(criterion, ref, el, tolerance)) found.push(el)
      }
    }
    const group = svgCanvas.getCurrentGroup()
    if (group) {
      scan(group)
    } else {
      for (const layer of svgCanvas.getSvgContent().children) {
        if (layer.tagName !== 'g') continue
        if (layer.getAttribute('display') === 'none' || /** @type {HTMLElement} */ (layer).style.display === 'none') continue
        scan(layer)
      }
    }
    if (found.length) svgCanvas.selectOnly(found, true)
  }

  svgCanvas.selectSameAs = selectSameAs
}
