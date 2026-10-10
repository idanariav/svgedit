import { describe, expect, it } from 'vitest'
import { repairNaNTspans, repairSvg } from '../../scripts/repair-drawings.mjs'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'

const doc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" id="svgcontent"><g class="layer"><title>L</title>${inner}</g></svg>`
const parse = (s) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement

describe('repair-drawings: NaN tspans', () => {
  const bad = doc('<text x="10" y="20"><tspan x="NaN" y="NaN">a</tspan><tspan x="10" y="40">b</tspan><tspan x="12" y="NaN" fill="red">c</tspan></text>')

  it('drops NaN coordinates from tspans so they inherit; valid ones are untouched', () => {
    expect(checkDrawing(parse(bad)).some((f) => f.code === 'bad-number')).toBe(true)
    const fixed = repairNaNTspans(bad)
    expect(fixed).toContain('<tspan>a</tspan>')
    expect(fixed).toContain('<tspan x="10" y="40">b</tspan>')
    expect(fixed).toContain('<tspan x="12" fill="red">c</tspan>')
    expect(checkDrawing(parse(fixed))).toEqual([])
  })

  it('leaves a <text> or other elements with NaN alone, and clean files byte-identical', () => {
    const other = doc('<text x="NaN" y="5">t</text>')
    expect(repairNaNTspans(other)).toBe(other)
    const clean = doc('<text x="1" y="2"><tspan x="1" y="2">ok</tspan></text>')
    expect(repairSvg(clean)).toEqual({ source: clean, applied: [] })
  })

  it('reports which repairs applied', () => {
    expect(repairSvg(bad).applied).toEqual(['NaN tspan coordinates'])
  })
})
