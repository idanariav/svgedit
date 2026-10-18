import { describe, it, expect } from 'vitest'
import { parseSvg, getAt } from '../../packages/svgcanvas/core/model/index.ts'
import { pathOfId, findById, moveToEnd, moveToStart, moveNextTo, swapSiblings, removeIds, withChildren } from '../../packages/svgcanvas/core/model/edit.ts'

const doc = (inner) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g id="L" class="layer"><title>L</title>${inner}</g><g id="M" class="layer"><title>M</title><rect id="m1"/></g></svg>`).root
const idsIn = (root, layer) => findById(root, layer).children.filter((c) => c.kind === 'element').map((c) => c.attrs.find((a) => a.name === 'id')?.value ?? c.name)

describe('model edits', () => {
  const base = doc('<rect id="a"/><rect id="b"/><rect id="c"/><rect id="d"/>')

  it('finds an element by id, with its path', () => {
    expect(pathOfId(base, 'c')).toEqual([0, 3])
    expect(getAt(base, pathOfId(base, 'c')).attrs[0].value).toBe('c')
    expect(pathOfId(base, 'nope')).toBeUndefined()
    expect(findById(base, 'm1').name).toBe('rect')
  })

  it('moveToEnd keeps the order among the moved ones and shares what it did not touch', () => {
    const out = moveToEnd(base, ['b', 'a'])
    expect(idsIn(out, 'L')).toEqual(['title', 'c', 'd', 'a', 'b'])
    expect(out.children[1]).toBe(base.children[1]) // layer M untouched
    expect(moveToEnd(base, ['d'])).toBe(base) // already on top: the same root
  })

  it('moveToStart goes under the title and the defs, keeping the order among the moved ones', () => {
    const withDefs = doc('<defs id="df"/><rect id="a"/><rect id="b"/><rect id="c"/>')
    expect(idsIn(moveToStart(withDefs, ['c', 'b']), 'L')).toEqual(['title', 'df', 'b', 'c', 'a'])
    expect(moveToStart(withDefs, ['a'])).toBe(withDefs)
  })

  it('moves per parent when the selection spans parents, including a parent inside a parent', () => {
    const nested = doc('<g id="G"><rect id="x"/><rect id="y"/></g><rect id="z"/>')
    const out = moveToEnd(nested, ['G', 'x'])
    expect(idsIn(out, 'L')).toEqual(['title', 'z', 'G'])
    expect(idsIn(out, 'G')).toEqual(['y', 'x'])
  })

  it('moveNextTo puts an element before or after another, and refuses to move into itself', () => {
    expect(idsIn(moveNextTo(base, 'a', 'c', 'after'), 'L')).toEqual(['title', 'b', 'c', 'a', 'd'])
    expect(idsIn(moveNextTo(base, 'd', 'b', 'before'), 'L')).toEqual(['title', 'a', 'd', 'b', 'c'])
    const nested = doc('<g id="G"><rect id="x"/></g>')
    expect(moveNextTo(nested, 'G', 'x', 'after')).toBe(nested)
    expect(moveNextTo(base, 'a', 'a', 'after')).toBe(base)
  })

  it('swaps siblings only', () => {
    expect(idsIn(swapSiblings(base, 'a', 'd'), 'L')).toEqual(['title', 'd', 'b', 'c', 'a'])
    expect(swapSiblings(base, 'a', 'm1')).toBe(base)
  })

  it('removes elements with what is inside them', () => {
    const nested = doc('<g id="G"><rect id="x"/></g><rect id="z"/>')
    const out = removeIds(nested, ['G'])
    expect(idsIn(out, 'L')).toEqual(['title', 'z'])
    expect(findById(out, 'x')).toBeUndefined()
    expect(removeIds(nested, ['nope'])).toBe(nested)
  })

  it('withChildren returns the same root for the same list', () => {
    expect(withChildren(base, [0], (kids) => kids)).toBe(base)
  })
})

describe('wrapIds', () => {
  it('moves the elements into a new last child of the container, in the order given', async () => {
    const { wrapIds, findById } = await import('../../packages/svgcanvas/core/model/edit.ts')
    const { parseSvg, element } = await import('../../packages/svgcanvas/core/model/index.ts')
    const root = parseSvg('<svg><g id="l"><rect id="a"/><rect id="b"/><rect id="c"/></g></svg>').root
    const out = wrapIds(root, 'l', element('g', [{ name: 'id', value: 'grp' }], []), ['c', 'a'])
    const layer = findById(out, 'l')
    expect(layer.children.map((n) => n.attrs.find((x) => x.name === 'id').value)).toEqual(['b', 'grp'])
    expect(findById(out, 'grp').children.map((n) => n.attrs.find((x) => x.name === 'id').value)).toEqual(['c', 'a'])
    expect(wrapIds(root, 'l', element('g', [], []), ['nope'])).toBe(root)
  })
})

describe('wrapIds with a group and a child of it', () => {
  it('wraps the inner one once', async () => {
    const { wrapIds, findById } = await import('../../packages/svgcanvas/core/model/edit.ts')
    const { parseSvg, element } = await import('../../packages/svgcanvas/core/model/index.ts')
    const root = parseSvg('<svg><g id="l"><g id="p"><rect id="k"/></g></g></svg>').root
    const out = wrapIds(root, 'l', element('g', [{ name: 'id', value: 'grp' }], []), ['k', 'p'])
    expect(findById(out, 'grp').children.map((n) => n.attrs.find((x) => x.name === 'id').value)).toEqual(['k', 'p'])
    expect(findById(out, 'p').children).toHaveLength(0)
  })
})
