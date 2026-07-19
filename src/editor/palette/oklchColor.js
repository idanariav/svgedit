/**
 * oklchColor.js — thin culori wrapper for OKLCH color-space math.
 *
 * Every color produced here comes from `clampChroma`, which bisects chroma
 * downward at a fixed L/h until the result is sRGB-displayable. That is what
 * guarantees gamut-safety and hue-preservation for the whole palette
 * generator: hue is never rotated to escape the gamut, only chroma is traded.
 */

import { converter, formatHex, wcagContrast, clampChroma } from 'culori'

const toRgb = converter('rgb')

/**
 * @param {number} l - OKLCH lightness, 0..1
 * @param {number} h - OKLCH hue, degrees
 * @param {number} [c] - chroma ceiling to search down from
 * @returns {{mode: 'oklch', l: number, c: number, h: number}} max in-gamut chroma at l,h
 */
export function maxChromaAt (l, h, c = 0.4) {
  return clampChroma({ mode: 'oklch', l, c, h }, 'oklch')
}

/**
 * @param {object} oklchColor - a culori oklch color object
 * @returns {string} '#rrggbb'
 */
export function toRgbHex (oklchColor) {
  return formatHex(oklchColor)
}

/**
 * @param {object} oklchColor - a culori oklch color object
 * @returns {string} 'oklch(L C H)' CSS Color 4 string
 */
export function toOklchString (oklchColor) {
  const l = oklchColor.l.toFixed(3)
  const c = oklchColor.c.toFixed(3)
  const h = Number.isFinite(oklchColor.h) ? oklchColor.h.toFixed(1) : '0'
  return `oklch(${l} ${c} ${h})`
}

/**
 * WCAG relative-luminance contrast ratio between a candidate OKLCH color and
 * a background hex string.
 * @param {object} oklchColor - a culori oklch color object
 * @param {string} backgroundHex - '#rrggbb'
 * @returns {number} contrast ratio, 1..21
 */
export function contrastAgainst (oklchColor, backgroundHex) {
  return wcagContrast(oklchColor, backgroundHex)
}

/**
 * Convert an OKLCH color to Cartesian (l, a, b)-style coordinates so that a
 * plain Euclidean distance is a valid perceptual-distance metric (hue is
 * cyclic, so a naive scalar hue diff is not).
 * @param {object} oklchColor - a culori oklch color object
 * @returns {[number, number, number]}
 */
export function oklchToCartesian ({ l, c, h }) {
  const hRad = (h ?? 0) * Math.PI / 180
  return [l, c * Math.cos(hRad), c * Math.sin(hRad)]
}

/**
 * Euclidean distance between two OKLCH colors in Cartesian space.
 * @param {object} a - a culori oklch color object
 * @param {object} b - a culori oklch color object
 * @returns {number}
 */
export function oklchDistance (a, b) {
  const [al, aa, ab] = oklchToCartesian(a)
  const [bl, ba, bb] = oklchToCartesian(b)
  return Math.sqrt((al - bl) ** 2 + (aa - ba) ** 2 + (ab - bb) ** 2)
}

/**
 * Normalize an SVG `fill` attribute value to a plain hex string.
 * `none`, gradient refs (`url(#...)`), and unparseable values fall back to
 * black with a console warning — the palette feature only deals in solid
 * colors.
 * @param {string|null} fillAttr - raw `fill` attribute value
 * @returns {string} '#rrggbb'
 */
export function normalizeFillToHex (fillAttr) {
  if (!fillAttr || fillAttr === 'none' || fillAttr.startsWith('url(')) {
    if (fillAttr && fillAttr !== 'none') {
      console.warn(`[eyedropper] Cannot sample a solid color from fill="${fillAttr}", defaulting to black`)
    }
    return '#000000'
  }
  const rgb = toRgb(fillAttr)
  if (!rgb) {
    console.warn(`[eyedropper] Unrecognized fill value "${fillAttr}", defaulting to black`)
    return '#000000'
  }
  return formatHex(rgb)
}
