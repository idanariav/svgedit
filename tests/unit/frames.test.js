import { describe, it, expect, beforeEach } from 'vitest'
import { createFrames } from '../../packages/svgcanvas/core/frames.ts'

// Roadmap R12: the canvas's coordinate frames in one module. jsdom lays nothing out, so each element is given the screen
// matrix a browser would report.
const NS = 'http://www.w3.org/2000/svg'
const el = (tag, ctm) => {
  const e = document.createElementNS(NS, tag)
  if (ctm) e.getScreenCTM = () => new DOMMatrix(...ctm)
  return e
}
/** (x, y) through matrix m */
const apply = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })
const close = (p, q) => {
  expect(p.x).toBeCloseTo(q.x, 9)
  expect(p.y).toBeCloseTo(q.y, 9)
}

describe('frames', () => {
  let content
  let layer
  let group
  let shape
  let current = null
  let frames

  beforeEach(() => {
    // zoom 2, the drawing's origin at (100, 50) on screen; a group turned 90° and moved; a shape scaled 3× inside it
    content = el('svg', [9, 0, 0, 9, 0, 0]) // what an inner <svg> may report: never read
    layer = el('g', [2, 0, 0, 2, 100, 50])
    group = el('g', [0, 2, -2, 0, 100 + 2 * 10, 50 + 2 * 20]) // rotate(90) then translate(10 20), at zoom 2
    shape = el('rect', [0, 6, -6, 0, 120, 90])
    content.append(layer)
    layer.append(group)
    group.append(shape)
    current = null
    frames = createFrames({ getSvgContent: () => content, getCurrentGroup: () => current, getCurrentDrawing: () => ({ getCurrentLayer: () => layer }) })
  })

  it('maps the screen to document units through the first layer, not the inner <svg>', () => {
    close(frames.docPoint(100, 50), { x: 0, y: 0 })
    close(frames.docPoint(120, 70), { x: 10, y: 10 })
  })

  it('round-trips a known point: document → screen → document, local → document → local', () => {
    const doc = { x: 37.5, y: -12.25 }
    const s = apply(frames.docToScreen(), doc.x, doc.y)
    close(frames.docPoint(s.x, s.y), doc)
    const local = { x: 4, y: 7 }
    const d = apply(frames.localToDoc(shape), local.x, local.y)
    close(apply(frames.docToLocal(shape), d.x, d.y), local)
  })

  it('takes every group above an element into account', () => {
    // the shape's (1, 0) is 3 units along the group's x axis, which the 90° turn points down; the group sits at (10, 20)
    close(apply(frames.localToDoc(shape), 1, 0), { x: 10, y: 23 })
    close(apply(frames.between(shape, group), 1, 0), { x: 3, y: 0 })
  })

  it('draws in the entered group, else the current layer', () => {
    expect(frames.drawingSpace()).toBe(layer)
    close(frames.drawingPoint(120, 70), { x: 10, y: 10 })
    current = group
    expect(frames.drawingSpace()).toBe(group)
    close(frames.drawingPoint(120, 90), { x: 0, y: 0 })
  })

  it('has nothing to say before anything is rendered, or for a collapsed element', () => {
    const empty = createFrames({ getSvgContent: () => el('svg'), getCurrentGroup: () => null, getCurrentDrawing: () => null })
    expect(empty.docPoint(1, 1)).toBeNull()
    expect(frames.localToDoc(el('rect', [0, 0, 0, 0, 5, 5]))).toBeNull()
  })
})
