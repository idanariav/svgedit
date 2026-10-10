import { describe, expect, it } from 'vitest'
import { sanitizeLegacyNaNTspans } from '../../packages/svgcanvas/core/legacy-repairs.js'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'

const parse = (inner) =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" id="svgcontent"><g class="layer"><title>L</title>${inner}</g></svg>`,
    'image/svg+xml'
  ).documentElement

describe('sanitizeLegacyNaNTspans', () => {
  it('drops NaN coordinates from tspans so they inherit, and leaves valid ones alone', () => {
    const root = parse('<text x="10" y="20"><tspan x="NaN" y="NaN">a</tspan><tspan x="10" y="40">b</tspan><tspan x="12" y="NaN">c</tspan></text>')
    expect(checkDrawing(root).some((f) => f.code === 'bad-number')).toBe(true)
    sanitizeLegacyNaNTspans(root)
    const [a, b, c] = root.querySelectorAll('tspan')
    expect(a.hasAttribute('x') || a.hasAttribute('y')).toBe(false)
    expect([b.getAttribute('x'), b.getAttribute('y')]).toEqual(['10', '40'])
    expect([c.getAttribute('x'), c.hasAttribute('y')]).toEqual(['12', false])
    expect(checkDrawing(root)).toEqual([])
  })

  it('does not touch the parent <text> or non-tspan elements', () => {
    const root = parse('<text x="NaN" y="5">t</text><rect x="NaN" y="1" width="1" height="1"/>')
    sanitizeLegacyNaNTspans(root)
    expect(root.querySelector('text').getAttribute('x')).toBe('NaN')
    expect(root.querySelector('rect').getAttribute('x')).toBe('NaN')
  })
})
