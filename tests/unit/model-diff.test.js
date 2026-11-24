import { describe, expect, it } from 'vitest'
import { changedPaths } from '../../packages/svgcanvas/core/model/diff.ts'
import { share } from '../../packages/svgcanvas/core/snapshot-history.ts'
import { parseSvg } from '../../packages/svgcanvas/core/model/index.ts'

// What differs between two models of a drawing, as paths in the newer one (the announcer resolves them to elements).
const root = (inner) => parseSvg(`<svg><g id="l">${inner}</g></svg>`).root
const diff = (a, b) => { const prev = root(a); return changedPaths(prev, share(prev, root(b))) }

describe('changedPaths', () => {
  it('is empty for the same model', () => {
    const a = root('<rect id="a"/>')
    expect(changedPaths(a, a)).toEqual([])
    expect(diff('<rect id="a"/>', '<rect id="a"/>')).toEqual([])
  })

  it('names an element whose attributes changed, and nothing it shares', () => {
    expect(diff('<rect id="a" x="1"/><rect id="b"/>', '<rect id="a" x="2"/><rect id="b"/>')).toEqual([[0, 0]])
  })

  it('names an added element, and the parent of a removed one', () => {
    expect(diff('<rect id="a"/>', '<rect id="a"/><rect id="b"/>')).toEqual([[0, 1]])
    expect(diff('<rect id="a"/><rect id="b"/>', '<rect id="b"/>')).toEqual([[0]])
  })

  it('pairs children by id, so a reorder is a change of the parent and not of the children', () => {
    expect(diff('<rect id="a"/><rect id="b"/>', '<rect id="b"/><rect id="a"/>')).toEqual([[0]])
    expect(diff('<rect id="a"/><rect id="b" x="1"/>', '<rect id="b" x="2"/><rect id="a"/>')).toEqual([[0], [0, 0]])
  })

  it('names the element holding changed text, and a child without an id by position', () => {
    expect(diff('<text id="t"><tspan>one</tspan></text>', '<text id="t"><tspan>two</tspan></text>')).toEqual([[0, 0, 0]])
    expect(diff('<text id="t"><tspan x="1">a</tspan></text>', '<text id="t"><tspan x="2">a</tspan></text>')).toEqual([[0, 0, 0]])
  })

  it('names an added layer (a child of the root)', () => {
    const prev = parseSvg('<svg><g id="l"/></svg>').root
    const next = share(prev, parseSvg('<svg><g id="l"/><g id="m"/></svg>').root)
    expect(changedPaths(prev, next)).toEqual([[1]])
  })

  it('does not count a change of attribute order (it means nothing in SVG)', () => {
    expect(diff('<rect id="a" x="1" y="2"/>', '<rect id="a" y="2" x="1"/>')).toEqual([])
    const prev = root('<rect id="a" x="1" y="2"/>')
    expect(share(prev, root('<rect id="a" y="2" x="1"/>'))).toBe(prev)
  })
})
