/**
 * generatePalette.ts — OKLCH palette generator orchestrator.
 *
 * Given a background color, produces one optimized OKLCH color per target
 * hue by (1) building each hue's full achievable (L, maxChroma, contrast)
 * frontier via a real search over L, (2) shortlisting the best/most diverse
 * candidates per hue, then (3) running a mandatory whole-palette
 * harmonization pass so the 8 colors read as one cohesive set rather than 8
 * independently-optimized swatches. See paletteObjectives.js for the
 * per-purpose harmonization shapes.
 */

import { maxChromaAt, toRgbHex, toOklchString, contrastAgainst } from './oklchColor.ts'
import type { Candidate } from './paletteObjectives.ts'
import {
  DEFAULT_TARGET_HUES,
  DEFAULT_PREFERRED_CHROMA,
  SHORTLIST_SIZE,
  weightsForHue,
  scoreCandidate,
  harmonizeEqualWeight,
  harmonizePairwiseDistinct,
  harmonizeVarianceMin
} from './paletteObjectives.ts'

export { DEFAULT_TARGET_HUES, DEFAULT_PREFERRED_CHROMA }

const L_MIN = 0.05
const L_MAX = 0.95
const L_STEP = 0.01

const DIVERSE_PURPOSES = new Set(['charts', 'illustrations'])

/**
 * Sample the full (L, maxChroma, contrast) frontier for a single hue against
 * a background. Each sample's chroma is the max sRGB-in-gamut chroma at that
 * L,h — this is the per-hue candidate search the optimizer works from.
 * @param h - OKLCH hue, degrees
 * @param preferredChroma - chroma ceiling to search down from
 */
export function buildHueCurve (
  h: number,
  backgroundHex: string,
  preferredChroma = DEFAULT_PREFERRED_CHROMA
): { curve: Candidate[], hueMaxChroma: number } {
  const searchCeiling = Math.max(preferredChroma, 0.4)
  const curve: Candidate[] = []
  let hueMaxChroma = 0
  for (let l = L_MIN; l <= L_MAX + 1e-9; l += L_STEP) {
    const clamped = maxChromaAt(l, h, searchCeiling)
    const contrast = contrastAgainst(clamped, backgroundHex)
    curve.push({ mode: 'oklch', l: clamped.l, c: clamped.c, h, contrast })
    if (clamped.c > hueMaxChroma) hueMaxChroma = clamped.c
  }
  return { curve, hueMaxChroma }
}

/**
 * Filter a hue's curve to the candidates worth handing to the harmonization
 * pass. Falls back to the single max-contrast point (flagged via the
 * returned `meetsFloor`) if nothing clears `minContrast` — never silently
 * fails. For Charts/Illustrations (which need a diverse spread of (L,C)
 * options to search over, not just the single best), an evenly-spaced
 * sample across the qualifying range is kept instead of a score-ranked top-N.
 */
export function shortlistCandidates (
  curve: Candidate[],
  hueMaxChroma: number,
  minContrast: number,
  context: { purpose: string, hueName: string, size?: number }
): { shortlist: Candidate[], meetsFloor: boolean } {
  const { purpose, hueName, size = SHORTLIST_SIZE } = context
  const qualifying = curve.filter((cand) => cand.contrast >= minContrast)

  if (qualifying.length === 0) {
    const bestContrast = curve.reduce((best, cand) => (cand.contrast > best.contrast ? cand : best), curve[0])
    return { shortlist: [bestContrast], meetsFloor: false }
  }

  if (DIVERSE_PURPOSES.has(purpose) || qualifying.length <= size) {
    return { shortlist: evenlySpaced(qualifying, size), meetsFloor: true }
  }

  const weights = weightsForHue(purpose, hueName)
  const ranked = [...qualifying].sort((a, b) =>
    scoreCandidate(b, hueMaxChroma, minContrast, weights, { hueName, purpose }) -
    scoreCandidate(a, hueMaxChroma, minContrast, weights, { hueName, purpose })
  )
  return { shortlist: ranked.slice(0, size), meetsFloor: true }
}

function evenlySpaced (pool: Candidate[], size: number): Candidate[] {
  if (pool.length <= size) return pool
  const step = (pool.length - 1) / (size - 1)
  const result: Candidate[] = []
  for (let i = 0; i < size; i++) {
    result.push(pool[Math.round(i * step)])
  }
  return result
}

export interface PaletteOptions {
  /** '#rrggbb' background to contrast against */
  backgroundHex: string
  purpose?: 'icons' | 'text' | 'charts' | 'illustrations' | 'buttons' | 'notifications'
  /** WCAG contrast ratio floor */
  minContrast?: number
  /** display-only; both are always computed */
  outputFormat?: 'hex' | 'oklch'
  /** not exposed in v1 UI */
  targetHues?: Array<{ name: string, h: number }>
  /** not exposed in v1 UI */
  preferredChroma?: number
}

export interface PaletteColor {
  name: string
  hue: number
  l: number
  c: number
  h: number
  hex: string
  oklch: string
  contrast: number
  meetsContrastFloor: boolean
}

/** Generate an 8-color OKLCH palette optimized against a background color. */
export function generatePalette ({
  backgroundHex,
  purpose = 'icons',
  minContrast = 4.5,
  outputFormat = 'hex',
  targetHues = DEFAULT_TARGET_HUES,
  preferredChroma = DEFAULT_PREFERRED_CHROMA
}: PaletteOptions): PaletteColor[] {
  if (outputFormat !== 'hex' && outputFormat !== 'oklch') {
    throw new Error(`generatePalette: invalid outputFormat "${outputFormat}", expected "hex" or "oklch"`)
  }

  const effectiveMinContrast = purpose === 'illustrations'
    ? Math.max(1.0, minContrast * 0.85)
    : minContrast

  const hueMaxChromas: number[] = []
  const shortlists: Candidate[][] = []
  const meetsFloorFlags: boolean[] = []

  targetHues.forEach(({ h, name }) => {
    const { curve, hueMaxChroma } = buildHueCurve(h, backgroundHex, preferredChroma)
    const { shortlist, meetsFloor } = shortlistCandidates(curve, hueMaxChroma, effectiveMinContrast, {
      purpose,
      hueName: name
    })
    hueMaxChromas.push(hueMaxChroma)
    shortlists.push(shortlist)
    meetsFloorFlags.push(meetsFloor)
  })

  const hueNames = targetHues.map((t) => t.name)
  let picks
  if (purpose === 'charts') {
    picks = harmonizePairwiseDistinct(shortlists)
  } else if (purpose === 'illustrations') {
    picks = harmonizeVarianceMin(shortlists)
  } else {
    const weightsPerHue = hueNames.map((name) => weightsForHue(purpose, name))
    picks = harmonizeEqualWeight(shortlists, hueMaxChromas, effectiveMinContrast, weightsPerHue, {
      hueNames,
      purpose
    })
  }

  return targetHues.map(({ h, name }, i) => {
    const pick = picks[i]
    return {
      name,
      hue: h,
      l: pick.l,
      c: pick.c,
      h: pick.h,
      hex: toRgbHex(pick),
      oklch: toOklchString(pick),
      contrast: pick.contrast,
      meetsContrastFloor: meetsFloorFlags[i]
    }
  })
}

export default generatePalette
