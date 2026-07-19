import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TARGET_HUES,
  SEMANTIC_HUE_NAMES,
  weightsForHue,
  normalizedContrastScore,
  scoreCandidate,
  harmonizeEqualWeight,
  harmonizePairwiseDistinct,
  harmonizeVarianceMin
} from '../../../src/editor/palette/paletteObjectives.js'
import { buildHueCurve, shortlistCandidates } from '../../../src/editor/palette/generatePalette.js'

describe('DEFAULT_TARGET_HUES', () => {
  it('has exactly the 8 required hue names', () => {
    const names = DEFAULT_TARGET_HUES.map((h) => h.name)
    expect(names).toEqual(['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'])
  })
})

describe('weightsForHue', () => {
  it('gives notifications a higher chroma weight for semantic hues than others', () => {
    const semantic = weightsForHue('notifications', 'red')
    const other = weightsForHue('notifications', 'orange')
    expect(SEMANTIC_HUE_NAMES.has('red')).toBe(true)
    expect(semantic.wChroma).toBeGreaterThan(other.wChroma)
  })

  it('falls back to icons weights for an unknown purpose', () => {
    expect(weightsForHue('unknown', 'red')).toEqual(weightsForHue('icons', 'red'))
  })
})

describe('normalizedContrastScore', () => {
  it('is 0 right at the floor and saturates at 1 by 2x the floor', () => {
    expect(normalizedContrastScore(4.5, 4.5)).toBe(0)
    expect(normalizedContrastScore(9, 4.5)).toBe(1)
    expect(normalizedContrastScore(20, 4.5)).toBe(1)
  })

  it('clamps below the floor to 0 rather than going negative', () => {
    expect(normalizedContrastScore(2, 4.5)).toBe(0)
  })
})

describe('scoreCandidate', () => {
  it('applies a yellow-specific legibility penalty only for notifications', () => {
    const brightYellow = { l: 0.95, c: 0.15, contrast: 10 }
    const weights = weightsForHue('notifications', 'yellow')
    const withPenalty = scoreCandidate(brightYellow, 0.2, 4.5, weights, { hueName: 'yellow', purpose: 'notifications' })
    const withoutPenalty = scoreCandidate(brightYellow, 0.2, 4.5, weights, { hueName: 'yellow', purpose: 'icons' })
    expect(withPenalty).toBeLessThan(withoutPenalty)
  })
})

// Build real shortlists from the actual curve/shortlist pipeline so the
// harmonization passes are exercised against realistic data, not fixtures
// that might not reflect what generatePalette actually hands them.
function buildShortlists (backgroundHex, minContrast, purpose) {
  const hueNames = DEFAULT_TARGET_HUES.map((h) => h.name)
  const shortlists = []
  const hueMaxChromas = []
  DEFAULT_TARGET_HUES.forEach(({ h, name }) => {
    const { curve, hueMaxChroma } = buildHueCurve(h, backgroundHex)
    const { shortlist } = shortlistCandidates(curve, hueMaxChroma, minContrast, { purpose, hueName: name })
    shortlists.push(shortlist)
    hueMaxChromas.push(hueMaxChroma)
  })
  return { shortlists, hueMaxChromas, hueNames }
}

describe('harmonizeEqualWeight', () => {
  it('converges: never increases max cross-palette weight deviation vs. the naive independent-best init', () => {
    const { shortlists, hueMaxChromas, hueNames } = buildShortlists('#202020', 4.5, 'icons')
    const weightsPerHue = hueNames.map((name) => weightsForHue('icons', name))

    const scoreOf = (cand, i) => scoreCandidate(cand, hueMaxChromas[i], 4.5, weightsPerHue[i], { hueName: hueNames[i], purpose: 'icons' })
    const naiveInit = shortlists.map((list, i) => list.reduce((best, c) => (scoreOf(c, i) > scoreOf(best, i) ? c : best), list[0]))
    const naiveMean = naiveInit.reduce((sum, p, i) => sum + scoreOf(p, i), 0) / naiveInit.length
    const naiveMaxDeviation = Math.max(...naiveInit.map((p, i) => Math.abs(scoreOf(p, i) - naiveMean)))

    const harmonized = harmonizeEqualWeight(shortlists, hueMaxChromas, 4.5, weightsPerHue, { hueNames, purpose: 'icons' })
    const harmonizedMean = harmonized.reduce((sum, p, i) => sum + scoreOf(p, i), 0) / harmonized.length
    const harmonizedMaxDeviation = Math.max(...harmonized.map((p, i) => Math.abs(scoreOf(p, i) - harmonizedMean)))

    expect(harmonizedMaxDeviation).toBeLessThanOrEqual(naiveMaxDeviation + 1e-9)
  })

  it('never returns a candidate outside its own hue shortlist (stays gamut/contrast-safe)', () => {
    const { shortlists, hueMaxChromas, hueNames } = buildShortlists('#f0f0f0', 4.5, 'buttons')
    const weightsPerHue = hueNames.map((name) => weightsForHue('buttons', name))
    const picks = harmonizeEqualWeight(shortlists, hueMaxChromas, 4.5, weightsPerHue, { hueNames, purpose: 'buttons' })
    picks.forEach((pick, i) => {
      expect(shortlists[i]).toContain(pick)
    })
  })
})

describe('harmonizePairwiseDistinct', () => {
  it('terminates within the pass budget and only returns shortlisted candidates', () => {
    const { shortlists } = buildShortlists('#ffffff', 3, 'charts')
    const picks = harmonizePairwiseDistinct(shortlists)
    expect(picks).toHaveLength(8)
    picks.forEach((pick, i) => expect(shortlists[i]).toContain(pick))
  })
})

describe('harmonizeVarianceMin', () => {
  it('terminates and only returns shortlisted candidates', () => {
    const { shortlists } = buildShortlists('#ffffff', 3.825, 'illustrations')
    const picks = harmonizeVarianceMin(shortlists)
    expect(picks).toHaveLength(8)
    picks.forEach((pick, i) => expect(shortlists[i]).toContain(pick))
  })
})
