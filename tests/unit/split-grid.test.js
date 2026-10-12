import { describe, it, expect, beforeEach } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { gridCells, canSplitIntoGrid, init, MAX_CELLS } from '../../packages/svgcanvas/core/split-grid.js'

describe('gridCells', () => {
  const box = { x: 10, y: 20, width: 100, height: 60 }

  it('fills the box row-major from the top left', () => {
    const cells = gridCells(box, 2, 3)
    expect(cells).toHaveLength(6)
    expect(cells[0]).toEqual({ x: 10, y: 20, width: 100 / 3, height: 30 })
    expect(cells[2].x).toBeCloseTo(10 + 200 / 3)
    expect(cells[3]).toEqual({ x: 10, y: 50, width: 100 / 3, height: 30 })
  })

  it('cell size is (size - (n - 1) × gutter) / n', () => {
    const cells = gridCells(box, 2, 2, 10)
    expect(cells[0].width).toBe(45)
    expect(cells[0].height).toBe(25)
    expect(cells[1].x).toBe(10 + 45 + 10)
    expect(cells[2].y).toBe(20 + 25 + 10)
  })

  it('the last cell ends on the box edge', () => {
    const cells = gridCells(box, 3, 4, 5)
    const last = cells[cells.length - 1]
    expect(last.x + last.width).toBeCloseTo(110)
    expect(last.y + last.height).toBeCloseTo(80)
  })

  it('refuses what cannot make cells', () => {
    expect(gridCells(box, 0, 2)).toBeNull()
    expect(gridCells(box, 2, 1.5)).toBeNull()
    expect(gridCells(box, 2, 2, 60)).toBeNull() // the gutter swallows the height
    expect(gridCells({ ...box, width: 0 }, 1, 1)).toBeNull()
    expect(gridCells(box, MAX_CELLS, 2)).toBeNull()
  })
})

describe('splitIntoGrid', () => {
  let canvas
  let svg
  let selection
  let counter

  beforeEach(() => {
    document.body.innerHTML = ''
    svg = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svg)
    counter = 0
    selection = []
    canvas = {
      getSelectedElements: () => selection,
      getNextId: () => `svg_${++counter}`,
      transact: (label, fn) => fn(),
      selectOnly: (els) => { selection = els }
    }
    init(canvas)
  })

  const rect = (attrs) => {
    const el = document.createElementNS(NS.SVG, 'rect')
    for (const [k, v] of Object.entries({ id: 'r', x: 10, y: 20, width: 100, height: 60, ...attrs })) el.setAttribute(k, v)
    svg.append(el)
    selection = [el]
    return el
  }

  it('replaces a rect with a group of cells that keep its style', () => {
    const r = rect({ fill: '#ff0000', stroke: '#000000', 'stroke-width': 3, opacity: 0.5, rx: 4 })
    const group = canvas.splitIntoGrid({ rows: 2, cols: 2, gutter: 10 })
    expect(r.isConnected).toBe(false)
    expect(group.localName).toBe('g')
    expect(group.children).toHaveLength(4)
    for (const cell of group.children) {
      expect(cell.getAttribute('fill')).toBe('#ff0000')
      expect(cell.getAttribute('stroke-width')).toBe('3')
      expect(cell.getAttribute('opacity')).toBe('0.5')
      expect(cell.getAttribute('rx')).toBe('4')
    }
    expect(group.children[0].getAttribute('width')).toBe('45')
    expect(selection).toEqual([group])
  })

  it('gives every cell and the group a fresh id', () => {
    rect()
    const group = canvas.splitIntoGrid({ rows: 2, cols: 3 })
    const ids = [group.id, ...Array.from(group.children, (c) => c.id)]
    expect(new Set(ids).size).toBe(7)
    expect(ids).not.toContain('r')
  })

  it('keeps the rect\'s own transform on the group so a rotated rect stays rotated', () => {
    rect({ transform: 'rotate(30 60 50)' })
    const group = canvas.splitIntoGrid({ rows: 1, cols: 2 })
    expect(group.getAttribute('transform')).toBe('rotate(30 60 50)')
    for (const cell of group.children) expect(cell.hasAttribute('transform')).toBe(false)
  })

  it('does not copy live-feature state or geometry to the cells', () => {
    rect({ 'se:corner-radius': '5', 'data-name': 'x', fill: '#00f' })
    const group = canvas.splitIntoGrid({ rows: 1, cols: 1 })
    const cell = group.children[0]
    expect([...cell.attributes].some((a) => a.name.startsWith('se:') || a.name.startsWith('data-'))).toBe(false)
  })

  it('does nothing for a refused grid, a non-shape or several selected elements', () => {
    const r = rect()
    expect(canvas.splitIntoGrid({ rows: 0, cols: 1 })).toBeNull()
    expect(r.isConnected).toBe(true)
    const g = document.createElementNS(NS.SVG, 'g')
    svg.append(g)
    selection = [g]
    expect(canvas.splitIntoGrid({ rows: 2, cols: 2 })).toBeNull()
    selection = [r, g]
    expect(canvas.splitIntoGrid({ rows: 2, cols: 2 })).toBeNull()
  })

  it('canSplitIntoGrid takes plain shapes only', () => {
    expect(canSplitIntoGrid(rect())).toBe(true)
    expect(canSplitIntoGrid(document.createElementNS(NS.SVG, 'g'))).toBe(false)
    expect(canSplitIntoGrid(document.createElementNS(NS.SVG, 'text'))).toBe(false)
    expect(canSplitIntoGrid(null)).toBe(false)
    expect(canSplitIntoGrid(rect({ 'data-frame': '1' }))).toBe(false)
  })
})
