import { describe, expect, it, vi } from 'vitest'
import {
  maxChromaAt,
  toRgbHex,
  toOklchString,
  contrastAgainst,
  oklchToCartesian,
  oklchDistance,
  normalizeFillToHex
} from '../../../src/editor/palette/oklchColor.js'

describe('maxChromaAt', () => {
  it('returns an sRGB-displayable color at the exact requested L,h', () => {
    for (const l of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const color = maxChromaAt(l, 29)
      expect(color.mode).toBe('oklch')
      expect(color.l).toBeCloseTo(l, 5)
      expect(color.h).toBe(29)
      const hex = toRgbHex(color)
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('never returns negative or unbounded chroma', () => {
    for (const l of [0.05, 0.5, 0.95]) {
      const color = maxChromaAt(l, 195)
      expect(color.c).toBeGreaterThanOrEqual(0)
      expect(color.c).toBeLessThanOrEqual(0.4)
    }
  })
})

describe('contrastAgainst', () => {
  it('matches known WCAG contrast values', () => {
    const black = maxChromaAt(0, 0, 0)
    const white = maxChromaAt(1, 0, 0)
    expect(contrastAgainst(black, '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastAgainst(white, '#ffffff')).toBeCloseTo(1, 0)
  })
})

describe('toOklchString', () => {
  it('formats a valid CSS Color 4 oklch() string', () => {
    const color = maxChromaAt(0.5, 258)
    expect(toOklchString(color)).toMatch(/^oklch\(0\.5\d* 0\.\d+ 258\.0\)$/)
  })
})

describe('oklchToCartesian / oklchDistance', () => {
  it('is a true metric: distance from a color to itself is zero', () => {
    const color = maxChromaAt(0.6, 100)
    expect(oklchDistance(color, color)).toBe(0)
  })

  it('increases with hue separation at equal L/C', () => {
    const a = { l: 0.6, c: 0.15, h: 0 }
    const near = { l: 0.6, c: 0.15, h: 10 }
    const far = { l: 0.6, c: 0.15, h: 170 }
    expect(oklchDistance(a, far)).toBeGreaterThan(oklchDistance(a, near))
  })

  it('projects to Cartesian coordinates consistent with polar (l, c, h)', () => {
    const [l, x, y] = oklchToCartesian({ l: 0.5, c: 0.2, h: 90 })
    expect(l).toBe(0.5)
    expect(x).toBeCloseTo(0, 5) // cos(90deg) ~ 0
    expect(y).toBeCloseTo(0.2, 5) // sin(90deg) = 1
  })
})

describe('normalizeFillToHex', () => {
  it('passes through a solid hex fill', () => {
    expect(normalizeFillToHex('#336699')).toBe('#336699')
  })

  it('resolves a CSS named color to hex', () => {
    expect(normalizeFillToHex('red')).toBe('#ff0000')
  })

  it('falls back to black for "none" without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizeFillToHex('none')).toBe('#000000')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('falls back to black and warns for a gradient reference', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizeFillToHex('url(#grad1)')).toBe('#000000')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('falls back to black without warning for null/missing fill', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizeFillToHex(null)).toBe('#000000')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
