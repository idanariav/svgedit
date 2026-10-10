import { describe, it, expect } from 'vitest'
import { widthOutline, outlineArea } from '../../packages/svgcanvas/core/width-outline.js'
import { presetPoints } from '../../packages/svgcanvas/core/width-profile.js'

const UNIFORM = [[0, 1, 1], [1, 1, 1]]
const area = (d) => Math.abs(outlineArea(d))
const coords = (d) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }))
const box = (d) => {
  const c = coords(d)
  return { x0: Math.min(...c.map((p) => p.x)), x1: Math.max(...c.map((p) => p.x)), y0: Math.min(...c.map((p) => p.y)), y1: Math.max(...c.map((p) => p.y)) }
}

describe('widthOutline', () => {
  it('a uniform profile is a plain stroke', () => {
    const d = 'M0,0 L100,0'
    expect(area(widthOutline(d, 10, UNIFORM))).toBeCloseTo(1000, 3)
    const round = area(widthOutline(d, 10, UNIFORM, { cap: 'round' }))
    expect(Math.abs(round - (1000 + Math.PI * 25)) / (1000 + Math.PI * 25)).toBeLessThan(0.01)
    expect(area(widthOutline(d, 10, UNIFORM, { cap: 'square' }))).toBeCloseTo(1100, 3)
  })

  it('a lens is a diamond: half the area, thin ends', () => {
    const d = widthOutline('M0,0 L100,0', 10, presetPoints('lens'))
    expect(area(d)).toBeCloseTo(500, 3)
    const b = box(d)
    expect(b.y0).toBeCloseTo(-5, 3)
    expect(b.y1).toBeCloseTo(5, 3)
  })

  it('a one-sided profile stays on its side (travelling +x, the left side is up)', () => {
    const d = widthOutline('M0,0 L100,0', 10, [[0, 1, 0], [1, 1, 0]])
    expect(area(d)).toBeCloseTo(500, 3)
    const b = box(d)
    expect(b.y0).toBeLessThan(-4.99)
    expect(b.y1).toBeLessThanOrEqual(1e-9)
  })

  it('a discontinuous point steps the width instead of ramping', () => {
    const d = widthOutline('M0,0 L100,0', 10, [[0, 1, 1], [0.5, 1, 1], [0.5, 2, 2], [1, 2, 2]])
    expect(area(d)).toBeCloseTo(1500, 3)
    // The step is at x=50: the points before it stay 5 from the line, the ones after are 10 out.
    const c = coords(d)
    expect(c.some((p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y) > 9.9)).toBe(true)
    expect(c.filter((p) => p.x < 49.9).every((p) => Math.abs(p.y) <= 5.0001)).toBe(true)
  })

  it('a closed path is a ring: two loops, the area between them', () => {
    const d = widthOutline('M0,0 L100,0 L100,100 L0,100 Z', 10, UNIFORM)
    expect(d.match(/Z/g)).toHaveLength(2)
    expect(area(d)).toBeCloseTo(110 * 110 - 90 * 90, 3)
  })

  it('a curve is offset along its normal: a circle gives a ring of 2πr·w', () => {
    const r = 50
    const k = 0.5522847498 * r
    const circle = `M${r},0 C${r},${k} ${k},${r} 0,${r} C${-k},${r} ${-r},${k} ${-r},0 C${-r},${-k} ${-k},${-r} 0,${-r} C${k},${-r} ${r},${-k} ${r},0 Z`
    const d = widthOutline(circle, 10, UNIFORM, { tol: 0.01 })
    const want = 2 * Math.PI * r * 10
    expect(Math.abs(area(d) - want) / want).toBeLessThan(0.01)
  })

  it('corners take the join: a miter reaches further than a bevel, which reaches further than nothing', () => {
    const l = 'M0,0 L100,0 L100,100'
    const miter = box(widthOutline(l, 10, UNIFORM, { join: 'miter' }))
    const bevel = box(widthOutline(l, 10, UNIFORM, { join: 'bevel' }))
    const round = box(widthOutline(l, 10, UNIFORM, { join: 'round' }))
    expect(miter.x1).toBeCloseTo(105, 3)
    expect(miter.y0).toBeCloseTo(-5, 3)
    expect(area(widthOutline(l, 10, UNIFORM, { join: 'miter' }))).toBeGreaterThan(area(widthOutline(l, 10, UNIFORM, { join: 'bevel' })))
    expect(bevel.x1).toBeCloseTo(105, 3)
    expect(round.x1).toBeCloseTo(105, 1)
    // The outer corner point (105,-5) is only in the miter.
    expect(coords(widthOutline(l, 10, UNIFORM, { join: 'miter' })).some((p) => Math.abs(p.x - 105) < 1e-3 && Math.abs(p.y + 5) < 1e-3)).toBe(true)
    expect(coords(widthOutline(l, 10, UNIFORM, { join: 'bevel' })).some((p) => Math.abs(p.x - 105) < 1e-3 && Math.abs(p.y + 5) < 1e-3)).toBe(false)
  })

  it('a sharp corner past the miter limit falls back to a bevel', () => {
    const l = 'M0,0 L100,0 L0,5'
    const d = widthOutline(l, 10, UNIFORM, { join: 'miter', miterLimit: 4 })
    expect(box(d).x1).toBeLessThan(100 + 10 * 4)
  })

  it('a width point does not move where a width point is not', () => {
    // The profile is read by arc length: halfway along a 2-segment polyline of equal legs is the corner.
    const d = widthOutline('M0,0 L100,0 L100,100', 20, [[0, 0, 0], [0.5, 1, 1], [1, 0, 0]], { join: 'bevel' })
    const c = coords(d)
    expect(c.some((p) => Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y + 10) < 1e-3)).toBe(true) // full width at the corner
  })

  it('nothing to stroke gives nothing', () => {
    expect(widthOutline('M0,0 L100,0', 0, UNIFORM)).toBeNull()
    expect(widthOutline('M0,0', 10, UNIFORM)).toBeNull()
    expect(widthOutline('', 10, UNIFORM)).toBeNull()
    expect(widthOutline('M0,0 L1,0', 10, [])).toBeNull()
  })

  it('output is absolute M/L/Z path data of finite numbers', () => {
    const d = widthOutline('M0,0 C30,60 70,-60 100,0', 12, presetPoints('wave'), { cap: 'round' })
    expect(d).toMatch(/^M[-\d., L]+ Z$/)
    expect(d).not.toMatch(/NaN|Infinity/)
  })
})

describe('centerline', () => {
  it('locates points by fraction of the length, with the left normal', async () => {
    const { centerline, pointAt, locate } = await import('../../packages/svgcanvas/core/width-outline.js')
    const c = centerline('M0,0 L100,0 L100,100')
    expect(c.total).toBeCloseTo(200, 6)
    const mid = pointAt(c, 0.5)
    expect(mid.p.x).toBeCloseTo(100, 6)
    expect(mid.p.y).toBeCloseTo(0, 6)
    expect(pointAt(c, 0.25).p).toEqual({ x: 50, y: 0 })
    expect(pointAt(c, 0.25).n).toEqual({ x: 0, y: -1 }) // left of +x, y down: up
    expect(pointAt(c, 0.75).p.y).toBeCloseTo(50, 6)
    expect(pointAt(c, 2).p.y).toBeCloseTo(100, 6) // clamped
    const hit = locate(c, { x: 30, y: -8 })
    expect(hit.t).toBeCloseTo(0.15, 6)
    expect(hit.dist).toBeCloseTo(8, 6)
    expect(locate(c, { x: 120, y: 60 }).p).toEqual({ x: 100, y: 60 })
    expect(locate(c, { x: -50, y: 0 }).t).toBe(0)
  })

  it('a closed path includes the closing segment', async () => {
    const { centerline, locate } = await import('../../packages/svgcanvas/core/width-outline.js')
    const c = centerline('M0,0 L100,0 L100,100 L0,100 Z')
    expect(c.closed).toBe(true)
    expect(c.total).toBeCloseTo(400, 6)
    expect(locate(c, { x: -5, y: 50 }).t).toBeCloseTo(0.875, 6) // on the closing side, coming back to the start
  })

  it('nothing to follow gives null', async () => {
    const { centerline } = await import('../../packages/svgcanvas/core/width-outline.js')
    expect(centerline('M0,0')).toBeNull()
    expect(centerline('')).toBeNull()
    expect(centerline('M5,5 L5,5')).toBeNull()
  })
})
