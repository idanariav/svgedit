import { describe, it, expect } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import { getBBox, getStrokedBBox } from '../../packages/svgcanvas/core/bbox-utils.ts'

// jsdom has no layout engine: an SVG element there has no getBBox. The model (core/model/bounds.ts) answers from the attributes.
const make = (tag, attrs, parent) => {
  const el = document.createElementNS(NS.SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  ;(parent ?? document.body).appendChild(el)
  return el
}
const round = (b) => b && { x: +b.x.toFixed(3), y: +b.y.toFixed(3), width: +b.width.toFixed(3), height: +b.height.toFixed(3) }
const noop = () => null
const same = (n) => n

describe('getBBox without a layout engine', () => {
  it('reads a path with relative commands and curves exactly', () => {
    expect(round(getBBox(make('path', { d: 'm10 10 h20 v10 z' })))).toEqual({ x: 10, y: 10, width: 20, height: 10 })
    expect(round(getBBox(make('path', { d: 'M0 0 Q5 10 10 0' })))).toEqual({ x: 0, y: 0, width: 10, height: 5 })
  })

  it('knows a circle, an ellipse, a polygon and a polyline', () => {
    expect(round(getBBox(make('circle', { cx: 50, cy: 50, r: 10 })))).toEqual({ x: 40, y: 40, width: 20, height: 20 })
    expect(round(getBBox(make('ellipse', { cx: 50, cy: 50, rx: 10, ry: 5 })))).toEqual({ x: 40, y: 45, width: 20, height: 10 })
    expect(round(getBBox(make('polygon', { points: '0,0 10,0 5,8' })))).toEqual({ x: 0, y: 0, width: 10, height: 8 })
    expect(round(getBBox(make('polyline', { points: '0 0 10 5 3 9' })))).toEqual({ x: 0, y: 0, width: 10, height: 9 })
  })

  it('keeps answering a rect and a line as before', () => {
    expect(round(getBBox(make('rect', { x: 10, y: 20, width: 30, height: 40 })))).toEqual({ x: 10, y: 20, width: 30, height: 40 })
    expect(round(getBBox(make('line', { x1: 5, y1: 9, x2: 1, y2: 2 })))).toEqual({ x: 1, y: 2, width: 4, height: 7 })
  })
})

describe('getStrokedBBox', () => {
  it('grows by half the stroke width when the corners do not spike', () => {
    const rect = make('rect', { x: 0, y: 0, width: 10, height: 10, stroke: '#000', 'stroke-width': 4, 'stroke-linejoin': 'round' })
    expect(round(getStrokedBBox([rect], noop, { resetOrientation: noop }, same))).toEqual({ x: -2, y: -2, width: 14, height: 14 })
  })

  it('reaches the miter tips of a sharp corner, which half the width misses', () => {
    // a 20-degree wedge: with the default miter limit of 4 the tip is kept (1 / sin(10deg) = 5.7 > 4 bevels it), so raise it
    const wedge = make('polygon', { points: '0,0 100,0 0,17.6', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-miterlimit': 40 })
    const box = getStrokedBBox([wedge], noop, { resetOrientation: noop }, same)
    expect(box.x + box.width).toBeGreaterThan(105)
    // the same polygon with round joins is only the half-width margin
    wedge.setAttribute('stroke-linejoin', 'round')
    const plain = getStrokedBBox([wedge], noop, { resetOrientation: noop }, same)
    expect(plain.x + plain.width).toBeCloseTo(101, 6)
  })

  it('reaches the miter tips of a shape under a transform that keeps shapes', () => {
    const wedge = make('polygon', { points: '0,0 100,0 0,17.6', stroke: '#000', 'stroke-width': 2, 'stroke-miterlimit': 40, transform: 'translate(5 5)' })
    wedge.getBBox = () => ({ x: 0, y: 0, width: 100, height: 17.6 })
    const box = getStrokedBBox([wedge], noop, { resetOrientation: noop }, same)
    // the DOM box of the wedge plus the spike the model finds, which is more than the half-width margin of 1 on each side
    expect(box.width).toBeGreaterThan(105)
  })

  it('scales the stroke with a uniform scale instead of keeping its unscaled width', () => {
    const rect = make('rect', { x: 0, y: 0, width: 10, height: 10, stroke: '#000', 'stroke-width': 4, 'stroke-linejoin': 'round', transform: 'scale(3)' })
    rect.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 })
    // the box is scaled to 30 wide, and the stroke (2 each side) is scaled with it to 6 each side, not left at 2
    const box = getStrokedBBox([rect], noop, { resetOrientation: noop }, same)
    expect(box.width).toBeCloseTo(30 + 2 * 6, 6)
  })

  it('keeps the half-width margin under a skew or an uneven scale, which the model does not guess', () => {
    const rect = make('rect', { x: 0, y: 0, width: 10, height: 10, stroke: '#000', 'stroke-width': 4, transform: 'scale(2 1)' })
    rect.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 })
    const box = getStrokedBBox([rect], noop, { resetOrientation: noop }, same)
    // scaled to 20 wide, plus the unscaled 2 on each side
    expect(box.width).toBeCloseTo(24, 6)
  })

  it('includes what the strokes of a group\'s children paint, though the group has none', () => {
    const g = make('g', {})
    make('rect', { x: 10, y: 10, width: 40, height: 30, stroke: '#000', 'stroke-width': 12, fill: 'none' }, g)
    make('rect', { x: 80, y: 20, width: 20, height: 20, stroke: '#000', 'stroke-width': 4, fill: 'none' }, g)
    expect(round(getStrokedBBox([g], noop, { resetOrientation: noop }, same))).toEqual({ x: 4, y: 4, width: 98, height: 42 })
  })

  it('measures a turned group by what it paints, and a union of groups without the first one\'s loose box', () => {
    const turned = make('g', { transform: 'rotate(90)' })
    make('rect', { x: 0, y: 0, width: 40, height: 10, stroke: '#000', 'stroke-width': 2, fill: 'none' }, turned)
    // 41x11 painted ink, quarter-turned: 11 wide, 41 tall, from (-11,-1)
    expect(round(getStrokedBBox([turned], noop, { resetOrientation: noop }, same))).toEqual({ x: -11, y: -1, width: 12, height: 42 })
    const other = make('g', {})
    make('rect', { x: 100, y: 0, width: 10, height: 10, fill: 'none' }, other)
    expect(round(getStrokedBBox([turned, other], noop, { resetOrientation: noop }, same))).toEqual({ x: -11, y: -1, width: 121, height: 42 })
  })

  it('leaves a group holding text to the DOM box and its own half-width', () => {
    const g = make('g', { stroke: '#000', 'stroke-width': 4 })
    make('text', {}, g)
    g.getBBox = () => ({ x: 0, y: 0, width: 50, height: 10 })
    expect(round(getStrokedBBox([g], noop, { resetOrientation: noop }, same))).toEqual({ x: -2, y: -2, width: 54, height: 14 })
  })
})
