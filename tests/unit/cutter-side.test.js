import { describe, expect, it } from 'vitest'
import { flattenCut, sideOfCut } from '../../packages/svgcanvas/core/cutter.ts'

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

describe('flattenCut', () => {
  it('keeps a polyline of bare points as it is', () => {
    const zig = [{ x: 0, y: 100 }, { x: 100, y: 40 }, { x: 200, y: 100 }]
    expect(flattenCut(zig)).toEqual(zig)
  })

  it('samples a curved stretch along its cubic, ending on the vertex', () => {
    // a bulge upward: the out handle of the start and the in handle of the end both point up
    const arc = [{ x: 0, y: 100, handleOut: { x: 0, y: -80 } }, { x: 200, y: 100, handleIn: { x: 0, y: -80 } }]
    const line = flattenCut(arc)
    expect(line.length).toBeGreaterThan(2)
    expect(line[0]).toEqual({ x: 0, y: 100 })
    expect(line[line.length - 1].x).toBeCloseTo(200)
    expect(line[line.length - 1].y).toBeCloseTo(100)
    expect(Math.min(...line.map((p) => p.y))).toBeCloseTo(40) // the cubic's apex: 100 - 0.75 * 80
  })

  it('lets sideOfCut follow a curve: a point under its apex is on the other side from one above it', () => {
    const arc = flattenCut([{ x: 0, y: 100, handleOut: { x: 0, y: -80 } }, { x: 200, y: 100, handleIn: { x: 0, y: -80 } }])
    // (100, 60) is above the chord but under the curve: the straight chord would get it wrong
    expect(sideOfCut(arc, { x: 100, y: 60 })).not.toBe(sideOfCut(arc, { x: 100, y: 10 }))
  })
})
