import { describe, it, expect } from 'vitest'
import { axisMap, clampAxisDelta, crossesMiddle } from '../../packages/svgcanvas/core/stretch.ts'

const apply = ({ k, t }, v) => k * v + t

describe('crossesMiddle', () => {
  it('is true only for a part strictly across the middle line', () => {
    expect(crossesMiddle(100, 300, 200)).toBe(true)
    expect(crossesMiddle(200, 300, 200)).toBe(false)
    expect(crossesMiddle(100, 200, 200)).toBe(false)
    expect(crossesMiddle(250, 250, 200)).toBe(false)
  })
})

describe('axisMap', () => {
  // a pencil along x: eraser 100–140, body 140–300, tip 300–340; middle 220
  const grow = { mid: 220, side: 'max', d: 40 }

  it('moves a part on the dragged side with the grip', () => {
    const m = axisMap(300, 340, grow)
    expect(m.span).toBe(false)
    expect([apply(m, 300), apply(m, 340)]).toEqual([340, 380])
  })

  it('leaves a part on the fixed side alone', () => {
    const m = axisMap(100, 140, grow)
    expect(m).toEqual({ k: 1, t: 0, span: false })
  })

  it('stretches a part across the middle from its fixed edge, so the seams stay joined', () => {
    const m = axisMap(140, 300, grow)
    expect(m.span).toBe(true)
    expect(apply(m, 140)).toBeCloseTo(140)
    expect(apply(m, 300)).toBeCloseTo(340)
  })

  it('mirrors for a grip on the low side', () => {
    const left = { mid: 220, side: 'min', d: -40 } // the west grip dragged outward
    expect(axisMap(100, 140, left)).toEqual({ k: 1, t: -40, span: false })
    expect(axisMap(300, 340, left)).toEqual({ k: 1, t: 0, span: false })
    const body = axisMap(140, 300, left)
    expect(apply(body, 300)).toBeCloseTo(300)
    expect(apply(body, 140)).toBeCloseTo(100)
  })

  it('shrinks too', () => {
    const body = axisMap(140, 300, { mid: 220, side: 'max', d: -80 })
    expect(apply(body, 140)).toBeCloseTo(140)
    expect(apply(body, 300)).toBeCloseTo(220)
  })
})

describe('clampAxisDelta', () => {
  it('keeps the narrowest stretched part at least 1 unit wide', () => {
    expect(clampAxisDelta([160, 50], { mid: 0, side: 'max', d: -500 })).toBe(-49)
    expect(clampAxisDelta([160, 50], { mid: 0, side: 'min', d: 500 })).toBe(49)
  })

  it('passes a growing drag through', () => {
    expect(clampAxisDelta([160], { mid: 0, side: 'max', d: 30 })).toBe(30)
    expect(clampAxisDelta([160], { mid: 0, side: 'min', d: -30 })).toBe(-30)
  })

  it('does not limit a drag with nothing to stretch', () => {
    expect(clampAxisDelta([], { mid: 0, side: 'max', d: -500 })).toBe(-500)
  })

  it('never widens a part already under 1 unit', () => {
    expect(clampAxisDelta([0.5], { mid: 0, side: 'max', d: -3 })).toBeCloseTo(0)
  })
})
