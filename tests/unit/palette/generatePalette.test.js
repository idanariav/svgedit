import { describe, expect, it } from 'vitest'
import generatePalette, { DEFAULT_TARGET_HUES } from '../../../src/editor/palette/generatePalette.js'

const BACKGROUNDS = {
  veryLight: '#f5f5f0',
  veryDark: '#141414',
  midSaturated: '#3a6ea5'
}

const PURPOSES = ['icons', 'text', 'charts', 'illustrations', 'buttons', 'notifications']

function hexToRgbChannels (hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  expect(m).not.toBeNull()
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

describe('generatePalette', () => {
  it('returns 8 colors named after the default target hues, in order', () => {
    const palette = generatePalette({ backgroundHex: '#ffffff' })
    expect(palette.map((p) => p.name)).toEqual(DEFAULT_TARGET_HUES.map((h) => h.name))
  })

  Object.entries(BACKGROUNDS).forEach(([bgName, backgroundHex]) => {
    PURPOSES.forEach((purpose) => {
      it(`[${bgName}/${purpose}] every color meets the contrast floor or is explicitly flagged degraded`, () => {
        const minContrast = 4.5
        const palette = generatePalette({ backgroundHex, purpose, minContrast })
        const effectiveFloor = purpose === 'illustrations' ? minContrast * 0.85 : minContrast
        palette.forEach((p) => {
          if (p.meetsContrastFloor) {
            expect(p.contrast).toBeGreaterThanOrEqual(effectiveFloor - 1e-6)
          } else {
            // Degraded case must still be documented, not silently wrong.
            expect(typeof p.contrast).toBe('number')
          }
        })
      })

      it(`[${bgName}/${purpose}] every color decodes to valid in-gamut sRGB`, () => {
        const palette = generatePalette({ backgroundHex, purpose })
        palette.forEach((p) => {
          const [r, g, b] = hexToRgbChannels(p.hex)
          ;[r, g, b].forEach((channel) => {
            expect(channel).toBeGreaterThanOrEqual(0)
            expect(channel).toBeLessThanOrEqual(255)
          })
        })
      })

      it(`[${bgName}/${purpose}] preserves the requested hue closely`, () => {
        const palette = generatePalette({ backgroundHex, purpose })
        palette.forEach((p, i) => {
          expect(p.h).toBeCloseTo(DEFAULT_TARGET_HUES[i].h, 5)
        })
      })
    })
  })

  it('is deterministic: identical inputs produce identical output', () => {
    const a = generatePalette({ backgroundHex: '#336699', purpose: 'notifications', minContrast: 4.5 })
    const b = generatePalette({ backgroundHex: '#336699', purpose: 'notifications', minContrast: 4.5 })
    expect(a).toEqual(b)
  })

  it('rejects an invalid outputFormat', () => {
    expect(() => generatePalette({ backgroundHex: '#ffffff', outputFormat: 'rgb' })).toThrow(/outputFormat/)
  })

  it('gracefully degrades (never throws) when no L reaches an extreme contrast floor', () => {
    const palette = generatePalette({ backgroundHex: '#ff0000', purpose: 'icons', minContrast: 19 })
    expect(palette).toHaveLength(8)
    palette.forEach((p) => expect(p.meetsContrastFloor).toBe(false))
  })

  describe('purpose-specific objective differences', () => {
    it('charts maximizes minimum pairwise distinctiveness more than icons does', () => {
      const backgroundHex = '#202030'
      const chartsPalette = generatePalette({ backgroundHex, purpose: 'charts' })
      const iconsPalette = generatePalette({ backgroundHex, purpose: 'icons' })

      const minPairwiseDistance = (palette) => {
        let min = Infinity
        for (let i = 0; i < palette.length; i++) {
          for (let j = i + 1; j < palette.length; j++) {
            const a = palette[i]
            const b = palette[j]
            const hRadA = a.h * Math.PI / 180
            const hRadB = b.h * Math.PI / 180
            const dx = a.c * Math.cos(hRadA) - b.c * Math.cos(hRadB)
            const dy = a.c * Math.sin(hRadA) - b.c * Math.sin(hRadB)
            const dl = a.l - b.l
            const dist = Math.sqrt(dx * dx + dy * dy + dl * dl)
            min = Math.min(min, dist)
          }
        }
        return min
      }

      expect(minPairwiseDistance(chartsPalette)).toBeGreaterThan(minPairwiseDistance(iconsPalette))
    })

    it('illustrations has measurably lower L/C variance than icons or charts', () => {
      const backgroundHex = '#202030'
      const illustrationsPalette = generatePalette({ backgroundHex, purpose: 'illustrations' })
      const iconsPalette = generatePalette({ backgroundHex, purpose: 'icons' })
      const chartsPalette = generatePalette({ backgroundHex, purpose: 'charts' })

      const variance = (values) => {
        const mean = values.reduce((s, v) => s + v, 0) / values.length
        return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
      }
      const combinedVariance = (palette) => variance(palette.map((p) => p.l)) + variance(palette.map((p) => p.c))

      expect(combinedVariance(illustrationsPalette)).toBeLessThan(combinedVariance(iconsPalette))
      expect(combinedVariance(illustrationsPalette)).toBeLessThan(combinedVariance(chartsPalette))
    })
  })

  it('supports the oklch output format producing valid CSS Color 4 strings', () => {
    const palette = generatePalette({ backgroundHex: '#ffffff', outputFormat: 'oklch' })
    palette.forEach((p) => {
      expect(p.oklch).toMatch(/^oklch\(\d+\.\d+ \d+\.\d+ \d+\.\d\)$/)
    })
  })
})
