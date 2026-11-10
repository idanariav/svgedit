import { describe, expect, it } from 'vitest'
import { sideOfCut } from '../../packages/svgcanvas/core/cutter.ts'

describe('sideOfCut', () => {
  const across = [{ x: 0, y: 100 }, { x: 200, y: 100 }]

  it('puts the two half-planes of a straight cut on opposite sides', () => {
    const above = sideOfCut(across, { x: 100, y: 50 })
    const below = sideOfCut(across, { x: 100, y: 150 })
    expect(above).not.toBe(below)
    expect([above, below].sort()).toEqual([-1, 1])
  })

  it('extends the cut past its ends, so a point beyond them still has a side', () => {
    expect(sideOfCut(across, { x: 900, y: 40 })).toBe(sideOfCut(across, { x: 100, y: 50 }))
    expect(sideOfCut(across, { x: -900, y: 160 })).toBe(sideOfCut(across, { x: 100, y: 150 }))
  })

  it('follows a zig-zag: a point is judged against the stretch nearest to it', () => {
    const zig = [{ x: 0, y: 100 }, { x: 100, y: 40 }, { x: 200, y: 100 }]
    const top = sideOfCut(zig, { x: 100, y: 10 })
    expect(sideOfCut(zig, { x: 100, y: 60 })).not.toBe(top) // under the peak, though above the cut's ends
    expect(sideOfCut(zig, { x: 30, y: 60 })).toBe(top) // above the first stretch
  })

  it('ignores repeated points', () => {
    const doubled = [{ x: 0, y: 100 }, { x: 0, y: 100 }, { x: 200, y: 100 }]
    expect(sideOfCut(doubled, { x: 100, y: 50 })).toBe(sideOfCut(across, { x: 100, y: 50 }))
  })
})
