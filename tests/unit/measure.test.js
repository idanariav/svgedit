import { describe, it, expect } from 'vitest'
import { measureSegment, constrainAngle, trimNumber, readoutLines } from '../../packages/svgcanvas/core/measure.js'

describe('measureSegment', () => {
  it('reports distance, offsets and the angle counter-clockwise as on paper', () => {
    const m = measureSegment({ x: 10, y: 10 }, { x: 40, y: -30 })
    expect(m.distance).toBeCloseTo(50)
    expect(m.dx).toBe(30)
    expect(m.dy).toBe(-40)
    expect(m.angle).toBeCloseTo(53.130102, 5) // up and to the right
  })

  it('reads the axes as 0, 90, 180 and -90', () => {
    const o = { x: 0, y: 0 }
    expect(measureSegment(o, { x: 5, y: 0 }).angle).toBe(0)
    expect(Object.is(measureSegment(o, { x: 5, y: 0 }).angle, 0)).toBe(true)
    expect(measureSegment(o, { x: 0, y: -5 }).angle).toBeCloseTo(90)
    expect(measureSegment(o, { x: -5, y: 0 }).angle).toBeCloseTo(180)
    expect(measureSegment(o, { x: 0, y: 5 }).angle).toBeCloseTo(-90)
  })

  it('a zero-length segment is all zeros', () => {
    expect(measureSegment({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ distance: 0, angle: 0, dx: 0, dy: 0 })
  })
})

describe('constrainAngle', () => {
  const o = { x: 10, y: 10 }

  it('keeps the distance and snaps to the nearest 45°', () => {
    const p = constrainAngle(o, { x: 40, y: 18 })
    expect(Math.hypot(p.x - 10, p.y - 10)).toBeCloseTo(Math.hypot(30, 8))
    expect(p.y - 10).toBeCloseTo(0) // 15° is nearer 0° than 45°
    const q = constrainAngle(o, { x: 30, y: 28 })
    expect(q.x - 10).toBeCloseTo(q.y - 10) // 42° snaps to 45°
  })

  it('is exact on the axes', () => {
    const p = constrainAngle(o, { x: 10.2, y: 50 })
    expect(p.x).toBe(10)
    expect(p.y).toBeCloseTo(10 + Math.hypot(0.2, 40))
  })

  it('honours another step', () => {
    const p = constrainAngle(o, { x: 40, y: 18 }, 15)
    const angle = Math.atan2(p.y - 10, p.x - 10) * 180 / Math.PI
    expect(angle).toBeCloseTo(15)
  })
})

describe('readout', () => {
  it('trims trailing zeros', () => {
    expect(trimNumber(12.5)).toBe('12.5')
    expect(trimNumber(3)).toBe('3')
    expect(trimNumber(1 / 3)).toBe('0.33')
    expect(trimNumber(-0.001)).toBe('0')
  })

  it('converts the lengths and not the angle', () => {
    const lines = readoutLines({ distance: 96, angle: 45, dx: 48, dy: -48 }, (px) => px / 96, 'in')
    expect(lines).toEqual(['D: 1 in', 'Angle: 45°', 'Δx: 0.5 in', 'Δy: -0.5 in'])
  })
})
