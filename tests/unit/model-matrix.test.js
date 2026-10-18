import { describe, it, expect } from 'vitest'
import { parseSvg } from '../../packages/svgcanvas/core/model/index.ts'
import { parseMatrix, multiply, applyToPoint, similarityScale, isIdentityMatrix } from '../../packages/svgcanvas/core/model/matrix.ts'
import { geometricBounds, strokedBounds } from '../../packages/svgcanvas/core/model/bounds.ts'

const root = (markup) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).root
const first = (markup) => root(markup).children.find((c) => c.kind === 'element')
const chainOf = (markup) => {
  const chain = []
  let node = first(markup)
  while (node) { chain.push(node); node = node.children.find((c) => c.kind === 'element') }
  return chain
}
const box = (b) => b && [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 1000) / 1000)

describe('matrix', () => {
  it('parses a list of transforms, the last term applied first', () => {
    expect(parseMatrix('translate(10 20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20])
    expect(parseMatrix('')).toEqual([1, 0, 0, 1, 0, 0])
    expect(parseMatrix('wobble(1)')).toBeNull()
    const turned = parseMatrix('rotate(90 10 10)')
    expect(applyToPoint(turned, [20, 10]).map((v) => Math.round(v))).toEqual([10, 20])
  })

  it('multiplies with the right-hand matrix applied first', () => {
    expect(multiply([1, 0, 0, 1, 5, 0], [2, 0, 0, 2, 0, 0])).toEqual([2, 0, 0, 2, 5, 0])
    expect(isIdentityMatrix([1, 0, 0, 1, 0, 0])).toBe(true)
  })

  it('tells a shape-keeping map from a skew or an uneven scale', () => {
    expect(similarityScale(parseMatrix('rotate(33) scale(2)'))).toBeCloseTo(2, 9)
    expect(similarityScale(parseMatrix('scale(-1 1)'))).toBeCloseTo(1, 9)
    expect(similarityScale(parseMatrix('scale(2 1)'))).toBeUndefined()
    expect(similarityScale(parseMatrix('skewX(20)'))).toBeUndefined()
  })
})

describe('bounds under a matrix', () => {
  it('takes the exact extent of a turned ellipse and a turned curve', () => {
    // an ellipse rx 20 ry 10 turned by 90 degrees about its center is rx 10 ry 20
    const m = parseMatrix('rotate(90 50 50)')
    expect(box(geometricBounds(first('<ellipse cx="50" cy="50" rx="20" ry="10"/>'), m))).toEqual([40, 30, 20, 40])
    // a quadratic arch turned 90 degrees: the peak (y = 5) becomes the far x
    expect(box(geometricBounds(first('<path d="M0 0 Q5 10 10 0"/>'), parseMatrix('rotate(90)')))).toEqual([-5, 0, 5, 10])
  })

  it('turns a rounded rect through its rounded corners, not the rect corners', () => {
    const plain = geometricBounds(first('<rect x="0" y="0" width="100" height="100" rx="50"/>'), parseMatrix('rotate(45 50 50)'))
    // a circle of radius 50: its box stays 100 wide whatever the turn (the rect's corners would give 141)
    expect(plain.width).toBeCloseTo(100, 1)
  })

  it('unions the children of a group, each under its own transform', () => {
    const g = first('<g><rect x="0" y="0" width="10" height="10"/><g transform="translate(100 0)"><circle cx="5" cy="5" r="5"/></g><defs><rect x="-999" y="0" width="1" height="1"/></defs></g>')
    expect(box(geometricBounds(g))).toEqual([0, 0, 110, 10])
    expect(box(geometricBounds(g, parseMatrix('translate(0 7)')))).toEqual([0, 7, 110, 10])
  })

  it('has no box for a group holding text, and none for an empty group', () => {
    expect(geometricBounds(first('<g><rect x="0" y="0" width="1" height="1"/><text>a</text></g>'))).toBeUndefined()
    expect(geometricBounds(first('<g/>'))).toBeUndefined()
  })

  it('turns the miter tips with the shape, and scales the stroke with it', () => {
    // a square stroked 4 wide: tips are the corner of the offset square. Turned 45 degrees the tip lies on the axis
    const square = chainOf('<rect x="0" y="0" width="10" height="10" stroke="#000" stroke-width="4"/>')
    const flat = strokedBounds(square)
    expect(box(flat)).toEqual([-2, -2, 14, 14])
    const turned = strokedBounds(square, parseMatrix('rotate(45 5 5)'))
    // the offset square (14 wide) turned 45 degrees: half the diagonal, 14 * sqrt(2) / 2 from the center on each side
    expect(turned.width).toBeCloseTo(14 * Math.SQRT2, 6)
    // a uniform scale of 3 scales the stroke too
    expect(box(strokedBounds(square, parseMatrix('scale(3)')))).toEqual([-6, -6, 42, 42])
  })

  it('does not guess for a stroke under a skew or an uneven scale', () => {
    const square = chainOf('<rect x="0" y="0" width="10" height="10" stroke="#000" stroke-width="4"/>')
    expect(strokedBounds(square, parseMatrix('scale(2 1)'))).toBeUndefined()
    // with no stroke there is nothing to scale
    expect(box(strokedBounds(chainOf('<rect x="0" y="0" width="10" height="10"/>'), parseMatrix('scale(2 1)')))).toEqual([0, 0, 20, 10])
  })

  it('gives a group the strokes its children inherit', () => {
    const chain = chainOf('<g stroke="#000" stroke-width="4" stroke-linejoin="round"><rect x="0" y="0" width="10" height="10"/></g>')
    expect(box(strokedBounds(chain))).toEqual([-2, -2, 14, 14])
  })
})
