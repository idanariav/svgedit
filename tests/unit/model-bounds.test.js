import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { parseSvg } from '../../packages/svgcanvas/core/model/index.ts'
import { geometricBounds, strokedBounds, subpathsOf } from '../../packages/svgcanvas/core/model/bounds.ts'
import { inheritedProperty, ownProperty, userLength } from '../../packages/svgcanvas/core/model/style.ts'

const el = (markup) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).root.children.find((c) => c.kind === 'element')
const chainOf = (markup) => {
  const root = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).root
  const chain = []
  let node = root.children.find((c) => c.kind === 'element')
  while (node) { chain.push(node); node = node.children.find((c) => c.kind === 'element') }
  return chain
}
const box = (b) => b && [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 1000) / 1000)

describe('style', () => {
  it('reads a style declaration before an attribute, and inherits from the nearest ancestor', () => {
    const chain = chainOf('<g stroke="red" style="stroke-width: 4"><rect id="r" stroke-width="2"/></g>')
    expect(ownProperty(chain[1], 'stroke-width')).toBe('2')
    expect(inheritedProperty(chain, 'stroke')).toBe('red')
    expect(inheritedProperty(chain, 'stroke-width')).toBe('2')
    expect(inheritedProperty(chain.slice(0, 1), 'stroke-width')).toBe('4')
  })
  it('userLength takes plain numbers and px only', () => {
    expect(userLength('12')).toBe(12)
    expect(userLength('1.5px')).toBe(1.5)
    expect(userLength('50%')).toBeUndefined()
    expect(userLength('2em')).toBeUndefined()
  })
})

describe('geometricBounds', () => {
  it('covers the basic shapes', () => {
    expect(box(geometricBounds(el('<rect x="10" y="20" width="30" height="40"/>')))).toEqual([10, 20, 30, 40])
    expect(box(geometricBounds(el('<rect x="10" y="20" width="30" height="40" rx="5"/>')))).toEqual([10, 20, 30, 40])
    expect(box(geometricBounds(el('<circle cx="50" cy="50" r="10"/>')))).toEqual([40, 40, 20, 20])
    expect(box(geometricBounds(el('<ellipse cx="50" cy="50" rx="10" ry="5"/>')))).toEqual([40, 45, 20, 10])
    expect(box(geometricBounds(el('<line x1="5" y1="9" x2="1" y2="2"/>')))).toEqual([1, 2, 4, 7])
    expect(box(geometricBounds(el('<polygon points="0,0 10,0 5,8"/>')))).toEqual([0, 0, 10, 8])
    expect(box(geometricBounds(el('<polyline points="0 0 10 5 3 9"/>')))).toEqual([0, 0, 10, 9])
  })

  it('finds the extrema of curves, not their control points', () => {
    // a quadratic from (0,0) to (10,0) with control (5,10) peaks at y = 5
    expect(box(geometricBounds(el('<path d="M0 0 Q5 10 10 0"/>')))).toEqual([0, 0, 10, 5])
    // a cubic bulging to x = 0.75 * 10 at t = 0.5 between control x = 10
    expect(box(geometricBounds(el('<path d="M0 0 C10 0 10 10 0 10"/>')))).toEqual([0, 0, 7.5, 10])
  })

  it('reads relative commands, H, V, shorthand and arcs', () => {
    expect(box(geometricBounds(el('<path d="m10 10 h20 v10 z"/>')))).toEqual([10, 10, 20, 10])
    expect(box(geometricBounds(el('<path d="M0 0 A10 10 0 0 1 20 0"/>')))).toEqual([0, -10, 20, 10])
  })

  it('has no box for a group, text or a bad value', () => {
    expect(geometricBounds(el('<g/>'))).toBeUndefined()
    expect(geometricBounds(el('<text>a</text>'))).toBeUndefined()
    expect(geometricBounds(el('<rect x="10%" y="0" width="1" height="1"/>'))).toBeUndefined()
    expect(subpathsOf('not a path')).toEqual([])
  })
})

describe('strokedBounds', () => {
  it('is the geometry when there is no stroke', () => {
    expect(box(strokedBounds(chainOf('<rect x="0" y="0" width="10" height="10" fill="red"/>')))).toEqual([0, 0, 10, 10])
    expect(box(strokedBounds(chainOf('<rect x="0" y="0" width="10" height="10" stroke="none" stroke-width="8"/>')))).toEqual([0, 0, 10, 10])
  })

  it('takes a missing stroke-width as 1, and half of it on each side', () => {
    expect(box(strokedBounds(chainOf('<rect x="0" y="0" width="10" height="10" stroke="#000" stroke-linejoin="round"/>')))).toEqual([-0.5, -0.5, 11, 11])
  })

  it('reaches a miter tip: a right angle spikes to the corner of the offset square', () => {
    // a square with miter joins: tips at 45 degrees, side / sin(45deg) away along the diagonal = (w/2, w/2) out
    expect(box(strokedBounds(chainOf('<rect x="0" y="0" width="10" height="10" stroke="#000" stroke-width="4"/>')))).toEqual([-2, -2, 14, 14])
    // a sharp spike: 20-degree wedge, stroke 2, limit 4 -> beveled (limit * sin(half) < 1), no tip beyond the margin
    const wedge = strokedBounds(chainOf('<polyline points="0,0 100,0 0,17.6" fill="none" stroke="#000" stroke-width="2" stroke-miterlimit="4"/>'))
    expect(wedge.x + wedge.width).toBeLessThan(102.5)
    // the same with a limit high enough to keep the spike
    const spike = strokedBounds(chainOf('<polyline points="0,0 100,0 0,17.6" fill="none" stroke="#000" stroke-width="2" stroke-miterlimit="40"/>'))
    expect(spike.x + spike.width).toBeGreaterThan(105)
  })

  it('reaches the corners of square caps but not round or butt ones', () => {
    // a diagonal line with square caps: the cap corners go beyond the half-width margin on both axes
    const sq = strokedBounds(chainOf('<line x1="0" y1="0" x2="10" y2="10" stroke="#000" stroke-width="4" stroke-linecap="square"/>'))
    const butt = strokedBounds(chainOf('<line x1="0" y1="0" x2="10" y2="10" stroke="#000" stroke-width="4" stroke-linecap="butt"/>'))
    // square: a cap corner is side*(1/sqrt2 + 1/sqrt2) = 2*sqrt2 past the end along x; the margin alone is 2
    expect(sq.x).toBeCloseTo(-2 * Math.SQRT2, 6)
    expect(butt.x).toBeCloseTo(-2, 6)
  })

  it('inherits the stroke from a group', () => {
    const chain = chainOf('<g stroke="#000" stroke-width="6"><circle cx="10" cy="10" r="5"/></g>')
    expect(box(strokedBounds(chain))).toEqual([2, 2, 16, 16])
  })

  it('runs in a bare Node process (no document, no window)', () => {
    const script = `
      import { parseSvg } from './packages/svgcanvas/core/model/index.ts'
      import { strokedBounds } from './packages/svgcanvas/core/model/bounds.ts'
      const r = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L10 10" stroke="#000" stroke-width="2"/></svg>').root
      console.log(JSON.stringify(strokedBounds([r.children[0]])))
    `
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: process.cwd() })
    expect(JSON.parse(out).width).toBeGreaterThan(10)
  })
})
