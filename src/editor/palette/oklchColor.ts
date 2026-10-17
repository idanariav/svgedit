/**
 * oklchColor.ts — thin culori wrapper for OKLCH color-space math.
 *
 * Every color produced here comes from `clampChroma`, which bisects chroma
 * downward at a fixed L/h until the result is sRGB-displayable. That is what
 * guarantees gamut-safety and hue-preservation for the whole palette
 * generator: hue is never rotated to escape the gamut, only chroma is traded.
 */

import { converter, formatHex, wcagContrast, clampChroma } from 'culori'
import { warn as logWarn } from '@svgedit/svgcanvas/common/logger.ts'

/** A culori oklch color. */
export interface Oklch { l: number, c: number, h?: number }

const toRgb = converter('rgb')

/**
 * @param l - OKLCH lightness, 0..1
 * @param h - OKLCH hue, degrees
 * @param c - chroma ceiling to search down from
 * @returns max in-gamut chroma at l,h
 */
export function maxChromaAt (l: number, h: number, c = 0.4): { mode: 'oklch', l: number, c: number, h: number } {
  return clampChroma({ mode: 'oklch', l, c, h }, 'oklch')
}

/** @returns '#rrggbb' */
export function toRgbHex (oklchColor: Oklch): string {
  return formatHex(oklchColor)
}

/** @returns 'oklch(L C H)' CSS Color 4 string */
export function toOklchString (oklchColor: Oklch): string {
  const l = oklchColor.l.toFixed(3)
  const c = oklchColor.c.toFixed(3)
  const h = oklchColor.h !== undefined && Number.isFinite(oklchColor.h) ? oklchColor.h.toFixed(1) : '0'
  return `oklch(${l} ${c} ${h})`
}

/**
 * WCAG relative-luminance contrast ratio between a candidate OKLCH color and
 * a background hex string.
 * @param backgroundHex - '#rrggbb'
 * @returns contrast ratio, 1..21
 */
export function contrastAgainst (oklchColor: Oklch, backgroundHex: string): number {
  return wcagContrast(oklchColor, backgroundHex)
}

/**
 * Convert an OKLCH color to Cartesian (l, a, b)-style coordinates so that a
 * plain Euclidean distance is a valid perceptual-distance metric (hue is
 * cyclic, so a naive scalar hue diff is not).
 */
export function oklchToCartesian ({ l, c, h }: Oklch): [number, number, number] {
  const hRad = (h ?? 0) * Math.PI / 180
  return [l, c * Math.cos(hRad), c * Math.sin(hRad)]
}

/**
 * Euclidean distance between two OKLCH colors in Cartesian space.
 */
export function oklchDistance (a: Oklch, b: Oklch): number {
  const [al, aa, ab] = oklchToCartesian(a)
  const [bl, ba, bb] = oklchToCartesian(b)
  return Math.sqrt((al - bl) ** 2 + (aa - ba) ** 2 + (ab - bb) ** 2)
}

/**
 * Normalize an SVG `fill` attribute value to a plain hex string.
 * `none`, gradient refs (`url(#...)`), and unparseable values fall back to
 * black with a console warning — the palette feature only deals in solid
 * colors.
 * @param fillAttr - raw `fill` attribute value
 * @returns '#rrggbb'
 */
export function normalizeFillToHex (fillAttr: string | null): string {
  if (!fillAttr || fillAttr === 'none' || fillAttr.startsWith('url(')) {
    if (fillAttr && fillAttr !== 'none') {
      logWarn(`[eyedropper] Cannot sample a solid color from fill="${fillAttr}", defaulting to black`, undefined, 'oklchColor')
    }
    return '#000000'
  }
  const rgb = toRgb(fillAttr)
  if (!rgb) {
    logWarn(`[eyedropper] Unrecognized fill value "${fillAttr}", defaulting to black`, undefined, 'oklchColor')
    return '#000000'
  }
  return formatHex(rgb)
}
