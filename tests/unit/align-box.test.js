import { describe, it, expect, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import {
  alignBoxChild, canBeAlignBox, clearAlignBoxMarks, createAlignBox, getAlignBox, getAlignBoxOf, isAlignBoxMark
} from '../../packages/svgcanvas/core/align-box.ts'
import { collectSnapTargets } from '../../packages/svgcanvas/core/smart-guides.ts'
import { readDom } from '../../packages/svgcanvas/core/model-render.ts'
import { findById } from '../../packages/svgcanvas/core/model/edit.ts'
import { getAttr } from '../../packages/svgcanvas/core/model/node.ts'

const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElementNS(NS.SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  e.append(...kids)
  return e
}
const mark = (e) => { e.setAttributeNS(NS.SE, 'se:align-box', 'true'); return e }

// Boxes by element, as the canvas's painted-box measure would give them (in each element's parent space)
const measureOf = (boxes) => ({
  getStrokedBBoxDefaultVisible: (elems) => {
    const list = elems.map((e) => boxes.get(e)).filter(Boolean)
    if (!list.length) return null
    const x = Math.min(...list.map((b) => b.x))
    const y = Math.min(...list.map((b) => b.y))
    return { x, y, width: Math.max(...list.map((b) => b.x + b.width)) - x, height: Math.max(...list.map((b) => b.y + b.height)) - y }
  }
})

/** A desk with its shadow: the group paints 0..140 wide, the desk is 0..100. */
const deskWithShadow = (attrs = {}) => {
  const desk = el('rect', { id: 'desk' })
  const shadow = el('rect', { id: 'shadow' })
  const g = el('g', { id: 'grp', ...attrs }, [desk, shadow])
  el('g', { class: 'layer' }, [g])
  const boxes = new Map([
    [g, { x: 0, y: 0, width: 140, height: 80 }],
    [desk, { x: 0, y: 0, width: 100, height: 50 }],
    [shadow, { x: 20, y: 20, width: 120, height: 60 }]
  ])
  return { g, desk, shadow, boxes, measure: measureOf(boxes) }
}

describe('alignment box marks', () => {
  it('finds the marked child of a group, not of a layer', () => {
    const { g, desk } = deskWithShadow()
    expect(alignBoxChild(g)).toBe(null)
    mark(desk)
    expect(isAlignBoxMark(desk)).toBe(true)
    expect(alignBoxChild(g)).toBe(desk)
    expect(canBeAlignBox(desk)).toBe(true)
    expect(canBeAlignBox(g)).toBe(false) // its parent is a layer
    expect(alignBoxChild(g.parentElement)).toBe(null)
  })

  it('clearAlignBoxMarks is a model edit dropping every mark in the group', () => {
    const { g, desk, shadow } = deskWithShadow()
    mark(desk); mark(shadow)
    const next = clearAlignBoxMarks(g)(readDom(g.parentElement))
    for (const id of ['desk', 'shadow']) expect(getAttr(findById(next, id), 'se:align-box')).toBe(undefined)
    expect(isAlignBoxMark(desk)).toBe(true) // the DOM is the renderer's to change
  })
})

describe('getAlignBox', () => {
  it('is the painted box without a mark', () => {
    const { g, measure } = deskWithShadow()
    expect(getAlignBox(measure, g)).toEqual({ x: 0, y: 0, width: 140, height: 80 })
  })

  it("is the marked child's box with one", () => {
    const { g, desk, measure } = deskWithShadow()
    mark(desk)
    expect(getAlignBox(measure, g)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it("takes the child's box through the group's transform", () => {
    const { g, desk, measure } = deskWithShadow({ transform: 'translate(10 20) scale(2)' })
    mark(desk)
    const bb = getAlignBox(measure, g)
    expect(bb.x).toBeCloseTo(10)
    expect(bb.y).toBeCloseTo(20)
    expect(bb.width).toBeCloseTo(200)
    expect(bb.height).toBeCloseTo(100)
  })

  it('follows nested alignment boxes', () => {
    const { g, boxes } = deskWithShadow()
    const top = el('rect', { id: 'top' })
    const inner = el('g', { id: 'inner' }, [top])
    g.append(inner)
    boxes.set(inner, { x: 0, y: 0, width: 60, height: 60 })
    boxes.set(top, { x: 5, y: 5, width: 10, height: 10 })
    mark(inner); mark(top)
    expect(getAlignBox(measureOf(boxes), g)).toEqual({ x: 5, y: 5, width: 10, height: 10 })
  })

  it('falls back to the painted box when the marked child has none', () => {
    const { g, desk, boxes } = deskWithShadow()
    mark(desk)
    boxes.delete(desk)
    expect(getAlignBox(measureOf(boxes), g)).toEqual({ x: 0, y: 0, width: 140, height: 80 })
  })

  it('getAlignBoxOf unions the alignment boxes', () => {
    const { g, desk, boxes } = deskWithShadow()
    const other = el('rect', { id: 'other' })
    g.parentElement.append(other)
    boxes.set(other, { x: 200, y: 0, width: 10, height: 10 })
    mark(desk)
    expect(getAlignBoxOf(measureOf(boxes), [g, other])).toEqual({ x: 0, y: 0, width: 210, height: 50 })
  })
})

describe('svgCanvas.alignBox', () => {
  // The edits are model edits: apply each one to a model read from the DOM and write the result's marks back.
  const host = (measure, layer) => {
    const resize = vi.fn()
    const edit = vi.fn((label, fn) => {
      const next = fn(readDom(layer))
      for (const e of layer.querySelectorAll('[id]')) {
        const v = getAttr(findById(next, e.id), 'se:align-box')
        if (v) e.setAttributeNS(NS.SE, 'se:align-box', v)
        else e.removeAttributeNS(NS.SE, 'align-box')
      }
      return true
    })
    return {
      ...measure,
      snapshotHistory: { edit },
      selectorManager: { requestSelector: () => ({ resize }) },
      getSelectedElements: () => []
    }
  }

  it('set marks one child per group, one edit each', () => {
    const { desk, shadow, g, measure } = deskWithShadow()
    const h = host(measure, g.parentElement)
    const api = createAlignBox(h)
    api.set(shadow)
    api.set(desk)
    expect(alignBoxChild(g)).toBe(desk)
    expect(isAlignBoxMark(shadow)).toBe(false)
    expect(h.snapshotHistory.edit).toHaveBeenCalledTimes(2)
    api.set(desk) // already the box: nothing to record
    expect(h.snapshotHistory.edit).toHaveBeenCalledTimes(2)
  })

  it('set ignores an element whose parent is a layer; clear removes the mark', () => {
    const { g, desk, measure } = deskWithShadow()
    const api = createAlignBox(host(measure, g.parentElement))
    api.set(g)
    expect(isAlignBoxMark(g)).toBe(false)
    api.set(desk)
    expect(alignBoxChild(g)).toBe(desk)
    api.clear(g)
    expect(alignBoxChild(g)).toBe(null)
  })
})

describe('smart snapping', () => {
  it('snaps to the alignment box of a group', () => {
    const { g, desk, boxes } = deskWithShadow()
    mark(desk)
    const svgcontent = el('svg', {}, [g.parentElement])
    const targets = collectSnapTargets({
      ...measureOf(boxes),
      getSvgContent: () => svgcontent,
      getResolution: () => ({ w: 640, h: 480 }),
      getCurConfig: () => ({}),
      getGuides: () => ({ v: [], h: [] })
    }, [])
    expect(targets[0]).toMatchObject({ left: 0, right: 100, top: 0, bottom: 50 })
  })
})
