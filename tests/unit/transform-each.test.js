import { describe, it, expect } from 'vitest'
import {
  multiply, referenceFraction, resolveAmounts, eachMatrix, REFERENCE_POINTS
} from '../../packages/svgcanvas/core/transform-each.js'

const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })
const neutral = { sx: 1, sy: 1, dx: 0, dy: 0, angle: 0, flipX: false, flipY: false }

describe('referenceFraction', () => {
  it('maps the nine points row by row', () => {
    expect(REFERENCE_POINTS).toHaveLength(9)
    expect(referenceFraction('tl')).toEqual({ x: 0, y: 0 })
    expect(referenceFraction('r')).toEqual({ x: 1, y: 0.5 })
    expect(referenceFraction('b')).toEqual({ x: 0.5, y: 1 })
    expect(referenceFraction('br')).toEqual({ x: 1, y: 1 })
    expect(referenceFraction('c')).toEqual({ x: 0.5, y: 0.5 })
  })
  it('defaults to the centre', () => {
    expect(referenceFraction(undefined)).toEqual({ x: 0.5, y: 0.5 })
    expect(referenceFraction('nonsense')).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('eachMatrix', () => {
  it('does nothing for neutral amounts', () => {
    expect(eachMatrix(neutral, 30, 40)).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('scales about the reference point, which stays put', () => {
    const m = eachMatrix({ ...neutral, sx: 2, sy: 0.5 }, 100, 50)
    expect(apply(m, 100, 50)).toEqual({ x: 100, y: 50 })
    expect(apply(m, 110, 70)).toEqual({ x: 120, y: 60 })
  })

  it('rotates about the reference point, clockwise as on screen', () => {
    const m = eachMatrix({ ...neutral, angle: 90 }, 10, 10)
    const p = apply(m, 20, 10)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(20)
    expect(apply(m, 10, 10).x).toBeCloseTo(10)
  })

  it('reflects about the reference point', () => {
    const m = eachMatrix({ ...neutral, flipX: true }, 50, 0)
    expect(apply(m, 60, 7)).toEqual({ x: 40, y: 7 })
    const v = eachMatrix({ ...neutral, flipY: true }, 0, 5)
    expect(apply(v, 3, 9)).toEqual({ x: 3, y: 1 })
  })

  it('moves after the other steps', () => {
    const m = eachMatrix({ ...neutral, sx: 2, dx: 7, dy: -3 }, 0, 0)
    expect(apply(m, 10, 10)).toEqual({ x: 27, y: 7 })
  })

  it('each object uses its own point, not the selection\'s', () => {
    const a = eachMatrix({ ...neutral, angle: 180 }, 10, 10)
    const b = eachMatrix({ ...neutral, angle: 180 }, 100, 10)
    expect(apply(a, 10, 10).x).toBeCloseTo(10)
    expect(apply(b, 100, 10).x).toBeCloseTo(100)
  })
})

describe('resolveAmounts', () => {
  it('reads percent as a factor and keeps unset values neutral', () => {
    expect(resolveAmounts({ scaleH: 150, moveV: 12 })).toEqual({ ...neutral, sx: 1.5, dy: 12 })
  })

  it('random is a fraction of each entered amount, from a seeded source', () => {
    const rng = () => 0.25
    const a = resolveAmounts({ scaleH: 200, moveH: 40, rotate: 80, random: true }, rng)
    expect(a.sx).toBeCloseTo(1.25) // 100 → 200 at 25 %
    expect(a.sy).toBe(1)
    expect(a.dx).toBe(10)
    expect(a.angle).toBe(20)
  })

  it('random draws a value per amount', () => {
    // draws, in order: scaleH, scaleV, moveH, moveV, rotate
    const seq = [0.9, 0.9, 0, 0.5, 1]
    let i = 0
    const a = resolveAmounts({ moveH: 10, moveV: 10, rotate: 10, random: true }, () => seq[i++])
    expect([a.dx, a.dy, a.angle]).toEqual([0, 5, 10])
  })

  it('a checked reflection applies to about half when random', () => {
    expect(resolveAmounts({ reflectX: true, random: true }, () => 0.2).flipX).toBe(true)
    expect(resolveAmounts({ reflectX: true, random: true }, () => 0.9).flipX).toBe(false)
    expect(resolveAmounts({ reflectX: true }).flipX).toBe(true)
    expect(resolveAmounts({ reflectY: false, random: true }, () => 0).flipY).toBe(false)
  })
})

describe('multiply', () => {
  it('applies the right-hand matrix first', () => {
    const scale = [2, 0, 0, 2, 0, 0]
    const move = [1, 0, 0, 1, 5, 0]
    expect(apply(multiply(move, scale), 1, 1)).toEqual({ x: 7, y: 2 })
    expect(apply(multiply(scale, move), 1, 1)).toEqual({ x: 12, y: 2 })
  })
})
