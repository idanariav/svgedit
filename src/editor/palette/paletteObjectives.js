/**
 * paletteObjectives.js — scoring and whole-palette harmonization passes for
 * the OKLCH palette generator. Never scores/optimizes a single hue against
 * the background in isolation without also considering the other 7 — the
 * `harmonize*` functions are the mandatory global pass that makes the
 * result read as one cohesive palette instead of 8 independent picks.
 */

import { oklchDistance } from './oklchColor.js'

export const DEFAULT_TARGET_HUES = [
  { name: 'red', h: 29 },
  { name: 'orange', h: 55 },
  { name: 'yellow', h: 100 },
  { name: 'green', h: 142 },
  { name: 'cyan', h: 195 },
  { name: 'blue', h: 258 },
  { name: 'purple', h: 306 },
  { name: 'pink', h: 340 }
]

export const DEFAULT_PREFERRED_CHROMA = 0.15

export const SEMANTIC_HUE_NAMES = new Set(['red', 'yellow', 'green', 'blue'])

const PURPOSE_WEIGHTS = {
  icons: { wChroma: 0.65, wContrast: 0.35 },
  buttons: { wChroma: 0.6, wContrast: 0.4 },
  text: { wChroma: 1, wContrast: 0 }, // contrast is a hard gate applied upstream in the shortlist
  notifications_semantic: { wChroma: 0.75, wContrast: 0.25 },
  notifications_other: { wChroma: 0.65, wContrast: 0.35 }
}

export const SHORTLIST_SIZE = 12
const MAX_PASSES_EQUAL_WEIGHT = 4
const MAX_PASSES_PAIRWISE = 6
const CONVERGENCE_EPSILON = 0.01

/**
 * @param {string} purpose
 * @param {string} hueName
 * @returns {{wChroma: number, wContrast: number}}
 */
export function weightsForHue (purpose, hueName) {
  if (purpose === 'notifications') {
    return SEMANTIC_HUE_NAMES.has(hueName)
      ? PURPOSE_WEIGHTS.notifications_semantic
      : PURPOSE_WEIGHTS.notifications_other
  }
  return PURPOSE_WEIGHTS[purpose] || PURPOSE_WEIGHTS.icons
}

/**
 * Saturating normalization: contrast right at the floor scores 0, contrast at
 * 2x the floor (or above) scores 1. Prevents the objective from rewarding
 * unbounded contrast overshoot at the expense of chroma.
 * @param {number} contrast
 * @param {number} minContrast
 * @returns {number} 0..1
 */
export function normalizedContrastScore (contrast, minContrast) {
  if (minContrast <= 0) return 1
  return Math.min(1, Math.max(0, (contrast - minContrast) / minContrast))
}

/**
 * A candidate's yellow-specific legibility nudge for the notifications
 * purpose: peak-chroma yellow sits very high in L (~0.9) and reads as
 * "bright", not "warning" — bias the score down as L climbs past a legible
 * ceiling so the harmonization pass prefers a slightly deeper yellow.
 * @param {{l: number}} candidate
 * @param {string} hueName
 * @returns {number}
 */
function legibilityBias (candidate, hueName) {
  if (hueName === 'yellow') {
    const over = Math.max(0, candidate.l - 0.82)
    return -over * 2
  }
  return 0
}

/**
 * Single-hue score for a candidate, purpose-weighted. This is what ranks
 * candidates within one hue's shortlist and (for the equal-weight shapes)
 * what "equal visual weight" is measured against across hues.
 * @param {{l: number, c: number, contrast: number}} candidate
 * @param {number} hueMaxChroma - this hue's own peak achievable chroma
 * @param {number} minContrast
 * @param {{wChroma: number, wContrast: number}} weights
 * @param {{hueName?: string, purpose?: string}} [context]
 * @returns {number}
 */
export function scoreCandidate (candidate, hueMaxChroma, minContrast, weights, context = {}) {
  const normalizedChroma = hueMaxChroma > 0 ? candidate.c / hueMaxChroma : 0
  const normalizedContrast = normalizedContrastScore(candidate.contrast, minContrast)
  let score = weights.wChroma * normalizedChroma + weights.wContrast * normalizedContrast
  if (context.purpose === 'notifications' && context.hueName) {
    score += legibilityBias(candidate, context.hueName)
  }
  return score
}

/**
 * Shape 1/4/5 — "equal visual weight" global harmonization (icons, buttons,
 * text, notifications). Bounded coordinate-descent relaxation: init each hue
 * to its own best-scoring candidate, then repeatedly pull outlier hues toward
 * the cross-palette mean weight, never leaving that hue's own shortlist (so
 * gamut/contrast-floor guarantees from the shortlist step are preserved).
 * @param {Array<Array<object>>} shortlists - per-hue candidate shortlists
 * @param {number[]} hueMaxChromas - per-hue peak chroma
 * @param {number} minContrast
 * @param {Array<{wChroma: number, wContrast: number}>} weightsPerHue
 * @param {{hueNames?: string[], purpose?: string, maxPasses?: number, epsilon?: number}} [opts]
 * @returns {object[]} one chosen candidate per hue
 */
export function harmonizeEqualWeight (shortlists, hueMaxChromas, minContrast, weightsPerHue, opts = {}) {
  const { hueNames = [], purpose, maxPasses = MAX_PASSES_EQUAL_WEIGHT, epsilon = CONVERGENCE_EPSILON } = opts
  const n = shortlists.length
  const scoreOf = (candidate, i) =>
    scoreCandidate(candidate, hueMaxChromas[i], minContrast, weightsPerHue[i], { hueName: hueNames[i], purpose })

  const picks = shortlists.map((list, i) =>
    list.reduce((best, cand) => (scoreOf(cand, i) > scoreOf(best, i) ? cand : best), list[0])
  )

  let prevMaxDeviation = Infinity
  for (let pass = 0; pass < maxPasses; pass++) {
    const meanWeight = picks.reduce((sum, p, i) => sum + scoreOf(p, i), 0) / n
    let maxDeviation = 0
    for (let i = 0; i < n; i++) {
      let bestCandidate = picks[i]
      let bestDeviation = Math.abs(scoreOf(picks[i], i) - meanWeight)
      for (const cand of shortlists[i]) {
        const deviation = Math.abs(scoreOf(cand, i) - meanWeight)
        if (deviation < bestDeviation - epsilon) {
          bestCandidate = cand
          bestDeviation = deviation
        }
      }
      picks[i] = bestCandidate
      maxDeviation = Math.max(maxDeviation, bestDeviation)
    }
    if (Math.abs(prevMaxDeviation - maxDeviation) / (prevMaxDeviation || 1) < 0.01) break
    prevMaxDeviation = maxDeviation
  }
  return picks
}

/**
 * Shape 2 — "pairwise distinctiveness" global harmonization (Charts). A
 * structurally different objective from the other purposes: maximize the
 * *minimum* pairwise OKLCH distance across the 8 chosen colors (with mean
 * distance as a tiebreaker), so adjacent hues can never end up looking
 * confusably similar. Coordinate-ascent hill climb, each hue's candidate is
 * always scored against the other 7 hues' *current* picks.
 * @param {Array<Array<object>>} shortlists
 * @param {{maxPasses?: number}} [opts]
 * @returns {object[]} one chosen candidate per hue
 */
export function harmonizePairwiseDistinct (shortlists, opts = {}) {
  const { maxPasses = MAX_PASSES_PAIRWISE } = opts
  const n = shortlists.length
  const picks = shortlists.map(list => list.reduce((best, cand) => (cand.c > best.c ? cand : best), list[0]))

  const globalObjective = (candidates) => {
    let minDist = Infinity
    let sumDist = 0
    let pairs = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = oklchDistance(candidates[i], candidates[j])
        minDist = Math.min(minDist, d)
        sumDist += d
        pairs++
      }
    }
    return minDist + 0.01 * (sumDist / pairs)
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let bestCandidate = picks[i]
      let bestObjective = globalObjective(picks)
      for (const cand of shortlists[i]) {
        const trial = picks.slice()
        trial[i] = cand
        const objective = globalObjective(trial)
        if (objective > bestObjective) {
          bestObjective = objective
          bestCandidate = cand
        }
      }
      if (bestCandidate !== picks[i]) {
        picks[i] = bestCandidate
        changed = true
      }
    }
    if (!changed) break
  }
  return picks
}

/**
 * Shape 3 — "variance minimization" global harmonization (Illustrations).
 * Pulls every hue toward one shared (L, C) target derived from the common
 * achievable ceiling across all 8 hues, directly minimizing cross-palette
 * variance by construction — the "harmonious over max-contrast" objective.
 * @param {Array<Array<object>>} shortlists - shortlists already built against
 *   the purpose's softened contrast floor
 * @returns {object[]} one chosen candidate per hue
 */
export function harmonizeVarianceMin (shortlists) {
  const targetC = Math.min(...shortlists.map(list => Math.max(...list.map(c => c.c))))
  const peakLs = shortlists.map(list => list.reduce((best, c) => (c.c > best.c ? c : best), list[0]).l)
  const targetL = Math.min(0.75, Math.max(0.4, median(peakLs)))

  return shortlists.map(list =>
    list.reduce((best, cand) => {
      const d = Math.abs(cand.c - targetC) + Math.abs(cand.l - targetL)
      const bestD = Math.abs(best.c - targetC) + Math.abs(best.l - targetL)
      return d < bestD ? cand : best
    }, list[0])
  )
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median (values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
