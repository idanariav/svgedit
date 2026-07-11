import { describe, it, expect } from 'vitest'
import { buildBrushOutline, createSmoother, finalizeBrushOutline } from '../../packages/svgcanvas/core/brush-stroke.js'

// Outline `d` strings from this module are plain 'M x y L x y ... Z' (no
// curve commands), so parsing them back into points for geometric
// assertions is just splitting on whitespace.
const parsePoints = (d) => {
  const tokens = d.split(/\s+/).filter((t) => t !== 'M' && t !== 'L' && t !== 'Z')
  const pts = []
  for (let i = 0; i < tokens.length; i += 2) {
    pts.push({ x: parseFloat(tokens[i]), y: parseFloat(tokens[i + 1]) })
  }
  return pts
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Perpendicular half-width at a centerline point: nearest distance from that
// point to the outline's boundary polyline.
const halfWidthNear = (outlinePts, center) =>
  Math.min(...outlinePts.map((p) => dist(p, center)))

const straightLine = (n, length = 100) =>
  Array.from({ length: n }, (_, i) => ({ x: (i / (n - 1)) * length, y: 0, pressure: 1 }))

describe('buildBrushOutline', () => {
  it('returns empty string for no points', () => {
    expect(buildBrushOutline([], { thickness: 10, angle: 0, roundness: 100, taperStart: 100, taperEnd: 100 })).toBe('')
  })

  it('a fully round brush has a constant width regardless of nib angle', () => {
    const points = straightLine(6)
    const outline = parsePoints(buildBrushOutline(points, {
      thickness: 10, angle: 0, roundness: 100, taperStart: 100, taperEnd: 100
    }))
    const midWidth = halfWidthNear(outline, points[3])
    const outlineAt90 = parsePoints(buildBrushOutline(points, {
      thickness: 10, angle: 90, roundness: 100, taperStart: 100, taperEnd: 100
    }))
    const midWidthAt90 = halfWidthNear(outlineAt90, points[3])
    expect(midWidth).toBeCloseTo(5, 0)
    expect(midWidthAt90).toBeCloseTo(5, 0)
  })

  it('a fully chiseled (roundness 0) brush is thin when the nib runs parallel to travel', () => {
    const points = straightLine(6) // travel direction is along the x-axis (0 rad)
    const outline = parsePoints(buildBrushOutline(points, {
      thickness: 10, angle: 0, roundness: 0, taperStart: 100, taperEnd: 100
    }))
    const midWidth = halfWidthNear(outline, points[3])
    expect(midWidth).toBeLessThan(1) // clamped to MIN_NIB (0.08) * halfWidth
  })

  it('a fully chiseled brush is at full width when the nib runs perpendicular to travel', () => {
    const points = straightLine(6)
    const outline = parsePoints(buildBrushOutline(points, {
      thickness: 10, angle: 90, roundness: 0, taperStart: 100, taperEnd: 100
    }))
    const midWidth = halfWidthNear(outline, points[3])
    expect(midWidth).toBeCloseTo(5, 0)
  })

  it('angle has no visible effect once roundness is 100 but does once roundness is 0', () => {
    const points = straightLine(6)
    const round0 = halfWidthNear(
      parsePoints(buildBrushOutline(points, { thickness: 10, angle: 0, roundness: 0, taperStart: 100, taperEnd: 100 })),
      points[3]
    )
    const round90 = halfWidthNear(
      parsePoints(buildBrushOutline(points, { thickness: 10, angle: 90, roundness: 0, taperStart: 100, taperEnd: 100 })),
      points[3]
    )
    expect(round90).toBeGreaterThan(round0 * 2)
  })

  it('taper start/end shrink the tip widths relative to a full-width middle', () => {
    const points = straightLine(10)
    const outline = parsePoints(buildBrushOutline(points, {
      thickness: 10, angle: 0, roundness: 100, taperStart: 0, taperEnd: 100
    }))
    const startWidth = halfWidthNear(outline, points[0])
    const endWidth = halfWidthNear(outline, points[points.length - 1])
    expect(startWidth).toBeLessThan(endWidth)
  })

  it('a zero-length stroke (a tap) renders a small closed dab instead of throwing', () => {
    const d = buildBrushOutline([{ x: 5, y: 5, pressure: 1 }], {
      thickness: 10, angle: 30, roundness: 50, taperStart: 100, taperEnd: 100
    })
    expect(d).toMatch(/^M/)
    expect(d.trim().endsWith('Z')).toBe(true)
    expect(parsePoints(d).length).toBeGreaterThan(3)
  })

  it('lower pen pressure produces a thinner stroke than full pressure', () => {
    const full = straightLine(6).map((p) => ({ ...p, pressure: 1 }))
    const light = straightLine(6).map((p) => ({ ...p, pressure: 0.1 }))
    const fullWidth = halfWidthNear(
      parsePoints(buildBrushOutline(full, { thickness: 10, angle: 0, roundness: 100, taperStart: 100, taperEnd: 100 })),
      full[3]
    )
    const lightWidth = halfWidthNear(
      parsePoints(buildBrushOutline(light, { thickness: 10, angle: 0, roundness: 100, taperStart: 100, taperEnd: 100 })),
      light[3]
    )
    expect(lightWidth).toBeLessThan(fullWidth)
  })
})

describe('createSmoother', () => {
  it('smoothness 0 passes raw points straight through', () => {
    const smoother = createSmoother(0)
    smoother.push({ x: 0, y: 0, pressure: 1 })
    const p = smoother.push({ x: 10, y: 10, pressure: 1 })
    expect(p.x).toBe(10)
    expect(p.y).toBe(10)
  })

  it('high smoothness lags behind a sudden jump in raw input', () => {
    const smoother = createSmoother(0.9)
    smoother.push({ x: 0, y: 0, pressure: 1 })
    const p = smoother.push({ x: 100, y: 0, pressure: 1 })
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(50)
  })
})

describe('finalizeBrushOutline', () => {
  it('never throws and always returns a string, even without a working paper.js canvas', () => {
    const d = 'M0,0 L10,0 L10,10 L0,10 Z'
    expect(() => finalizeBrushOutline(d, {})).not.toThrow()
    expect(typeof finalizeBrushOutline(d, {})).toBe('string')
  })

  it('passes empty input through unchanged', () => {
    expect(finalizeBrushOutline('', {})).toBe('')
  })
})
