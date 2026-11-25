import { describe, it, expect } from 'vitest'
import { planPlacement, moveEdit, snapEdit } from '../../packages/svgcanvas/core/placement.ts'

// Roadmap R12: one placement policy. A drag, its preview and nudge all write a move the way this table says.
const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  e.append(...children)
  return e
}
const move = (e, dx = 10, dy = 5) => {
  const entry = planPlacement(e)
  return entry && moveEdit(e, entry, dx, dy)
}

describe('placement policy', () => {
  it.each([
    ['a plain shape bakes the move into its coordinates', el('rect', { id: 'r', x: 1, y: 2, width: 3, height: 4 }), { x: '11', y: '7', width: '3', height: '4' }],
    ['a shape with a translation bakes both, dropping the transform', el('rect', { id: 'r', x: 1, y: 2, width: 3, height: 4, transform: 'translate(100 0)' }), { x: '111', y: '7', width: '3', height: '4', transform: null }],
    ['a turned shape moves its geometry and turns about the moved centre', el('rect', { id: 'r', x: 0, y: 0, width: 10, height: 10, transform: 'rotate(30 5 5)' }), { x: '10', y: '5', width: '10', height: '10', transform: 'rotate(30 15 10)' }],
    ['a group keeps the move as its transform', el('g', { id: 'g' }, [el('rect')]), { transform: 'matrix(1 0 0 1 10 5)' }],
    ['a turned group keeps the rotation as a term, its position after it', el('g', { id: 'g', transform: 'rotate(45 0 0) translate(2 3)' }), { transform: 'rotate(45 10 5) matrix(1 0 0 1 12 8)' }],
    ['a skewed shape keeps one matrix, the move in front', el('rect', { id: 'r', width: 1, height: 1, transform: 'skewX(45)' }), { transform: 'matrix(1 0 1 1 10 5)' }],
    ['a masked shape is never baked (its silhouette in <defs> is static)', el('rect', { id: 'r', width: 1, height: 1, mask: 'url(#m)' }), { transform: 'matrix(1 0 0 1 10 5)' }]
  ])('%s', (_name, e, expected) => {
    expect(move(e)).toEqual(expected)
  })

  it('a shape with feature data is planned to be baked on a copy', () => {
    expect(planPlacement(el('path', { id: 'p', d: 'M0 0L1 1', 'se:fx': 'x' }))).toMatchObject({ scratch: true })
  })

  it('has no plan for what it cannot place: no id, a value with units', () => {
    expect(planPlacement(el('rect', { x: 1, y: 1, width: 1, height: 1 }))).toBeNull()
    expect(planPlacement(el('rect', { id: 'r', x: '1mm', y: 1, width: 1, height: 1 }))).toBeNull()
  })

  it('without rotations allowed, a turned shape has no plan (a resize of it is the rotate-aware path\'s)', () => {
    expect(planPlacement(el('rect', { id: 'r', width: 1, height: 1, transform: 'rotate(30)' }), false)).toBeNull()
  })
})

describe('placement on the grid', () => {
  const grid = { point: (x, y) => ({ x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }), value: (v) => Math.round(v / 10) * 10 }
  const inLayer = (e) => {
    const svg = el('svg')
    const layer = el('g', { class: 'layer' })
    layer.append(e)
    svg.append(layer)
    return e
  }

  it('puts a shape directly in a layer on grid points, its sizes on grid steps', () => {
    const r = inLayer(el('rect', { id: 'r' }))
    expect(snapEdit(r, { x: '43', y: '47', width: '58', height: '40' }, grid)).toEqual({ x: '40', y: '50', width: '60', height: '40' })
    const c = inLayer(el('circle', { id: 'c' }))
    expect(snapEdit(c, { cx: '12', cy: '18', r: '6' }, grid)).toEqual({ cx: '10', cy: '20', r: '10' })
  })

  it('leaves a shape inside a group alone (the grid is not the group\'s) and what is not a number', () => {
    const g = inLayer(el('g'))
    const r = el('rect', { id: 'r' })
    g.append(r)
    expect(snapEdit(r, { x: '43', y: '47' }, grid)).toEqual({ x: '43', y: '47' })
    const p = inLayer(el('path', { id: 'p' }))
    expect(snapEdit(p, { d: 'M3 3L7 7', transform: null }, grid)).toEqual({ d: 'M3 3L7 7', transform: null })
  })
})
