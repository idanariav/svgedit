import { describe, it, expect, afterEach } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import { objectRows, ROW_LIMIT } from '../../src/editor/panels/layerTree.js'

const make = (tag, attrs = {}, parent = document.body) => {
  const el = document.createElementNS(NS.SVG, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('se:')) el.setAttributeNS(NS.SE, k, v)
    else el.setAttribute(k, v)
  }
  parent.append(el)
  return el
}
const open = new Set()
const ctx = { isExpanded: (el) => open.has(el), limitOf: () => ROW_LIMIT }

afterEach(() => { document.body.textContent = ''; open.clear() })

describe('objectRows', () => {
  it('lists children front to back and skips non-objects', () => {
    const layer = make('g', { class: 'layer' })
    make('title', {}, layer)
    make('rect', { id: 'back' }, layer)
    make('defs', {}, layer)
    make('rect', { id: 'ephemeral', 'data-se-ephemeral': '1' }, layer)
    make('ellipse', { id: 'front' }, layer)
    expect(objectRows(layer, 0, ctx).map((r) => r.el.id)).toEqual(['front', 'back'])
  })

  it('opens only the groups that are expanded, one depth further', () => {
    const layer = make('g', { class: 'layer' })
    const g = make('g', { id: 'g' }, layer)
    make('rect', { id: 'in' }, g)
    make('g', { id: 'empty' }, layer)
    let rows = objectRows(layer, 0, ctx)
    expect(rows.map((r) => [r.el.id, r.depth, r.group, r.expanded])).toEqual([
      ['empty', 0, false, false], ['g', 0, true, false]
    ])
    open.add(g)
    rows = objectRows(layer, 0, ctx)
    expect(rows.map((r) => [r.el.id, r.depth])).toEqual([['empty', 0], ['g', 0], ['in', 1]])
  })

  it('does not expand generated groups (blend, brush, repeat)', () => {
    const layer = make('g', { class: 'layer' })
    const blend = make('g', { id: 'b', 'se:blend': '1' }, layer)
    make('path', {}, blend)
    open.add(blend)
    const rows = objectRows(layer, 0, ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ group: false, expanded: false })
  })

  it('cuts a long parent at the limit with a "more" row for the rest, back-most hidden', () => {
    const layer = make('g', { class: 'layer' })
    for (let i = 0; i < 5; i++) make('rect', { id: `r${i}` }, layer)
    const rows = objectRows(layer, 0, { ...ctx, limitOf: () => 3 })
    expect(rows.map((r) => r.el?.id ?? `more${r.hidden}`)).toEqual(['r4', 'r3', 'r2', 'more2'])
    expect(rows[3].more).toBe(layer)
  })
})
