import { describe, it, expect, beforeEach } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import {
  getTextWithNewlines, setMultilineText, isAreaText, getWrapWidth, getWrapHeight, getValign, getAreaBox,
  areaAttrsForBox, writeAreaAttrs, reflowAreaText, makeAreaText, makePointText, areaTextAtPoint, TEXT_ASCENT, TEXT_LINE_HEIGHT
} from '../../packages/svgcanvas/core/text-rows.js'

// jsdom has no SVG text metrics, so layout uses the character-count estimate: 0.55 × font-size per character.
// With font-size 20 every character is 11 wide.
const SIZE = 20
const CHAR = SIZE * 0.55

const makeText = (attrs = {}) => {
  const svg = document.createElementNS(NS.SVG, 'svg')
  const text = document.createElementNS(NS.SVG, 'text')
  const all = { x: 100, y: 50, 'font-size': SIZE, ...attrs }
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('se:')) text.setAttributeNS(NS.SE, k, String(v))
    else text.setAttribute(k, String(v))
  }
  svg.append(text)
  document.body.append(svg)
  return text
}

const rows = (text) => Array.from(text.children).map((t) => t.textContent)
const softOf = (text) => Array.from(text.children).map((t) => t.getAttributeNS(NS.SE, 'soft'))

describe('point text rows', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('keeps a single line as plain text', () => {
    const t = makeText()
    setMultilineText(t, 'hello')
    expect(t.children.length).toBe(0)
    expect(t.textContent).toBe('hello')
  })

  it('writes one tspan per hard row and reads them back', () => {
    const t = makeText()
    setMultilineText(t, 'one\ntwo\n\nfour')
    expect(rows(t)).toEqual(['one', 'two', '', 'four'])
    expect(Array.from(t.children).map((c) => c.getAttribute('y'))).toEqual(['50', '74', '98', '122'])
    expect(getTextWithNewlines(t)).toBe('one\ntwo\n\nfour')
  })

  it('is not area text, so a stray soft marker still reads as a line break', () => {
    const t = makeText()
    setMultilineText(t, 'a\nb')
    t.children[1].setAttributeNS(NS.SE, 'se:soft', '1')
    expect(isAreaText(t)).toBe(false)
    expect(getTextWithNewlines(t)).toBe('a\nb')
  })
})

describe('area text rows', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('wraps to the box width and marks the soft rows', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 7 + 1 })
    setMultilineText(t, 'aaa bbb ccc ddd')
    expect(isAreaText(t)).toBe(true)
    expect(rows(t)).toEqual(['aaa bbb', 'ccc ddd'])
    expect(softOf(t)).toEqual([null, '1'])
  })

  it('reads the content back without the soft breaks', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 7 + 1 })
    setMultilineText(t, 'aaa bbb ccc ddd\nsecond paragraph')
    expect(t.children.length).toBeGreaterThan(2)
    expect(getTextWithNewlines(t)).toBe('aaa bbb ccc ddd\nsecond paragraph')
  })

  it('always writes tspans, even for one short row', () => {
    const t = makeText({ 'se:wrap-width': 500 })
    setMultilineText(t, 'short')
    expect(rows(t)).toEqual(['short'])
    expect(getTextWithNewlines(t)).toBe('short')
  })

  it('clears an emptied area text', () => {
    const t = makeText({ 'se:wrap-width': 500 })
    setMultilineText(t, 'something')
    setMultilineText(t, '')
    expect(t.children.length).toBe(0)
    expect(getTextWithNewlines(t)).toBe('')
  })

  it('steps rows by the line height from the first baseline', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 3 + 1 })
    setMultilineText(t, 'aaa bbb ccc')
    expect(Array.from(t.children).map((c) => Number(c.getAttribute('y')))).toEqual([50, 74, 98])
  })

  it('re-wraps when the width changes and keeps the content', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 3 + 1 })
    setMultilineText(t, 'aaa bbb ccc')
    expect(rows(t).length).toBe(3)
    writeAreaAttrs(t, { 'se:wrap-width': CHAR * 11 + 1 })
    expect(reflowAreaText(t)).toBe(true)
    expect(rows(t)).toEqual(['aaa bbb ccc'])
  })

  it('re-wraps when the font grows', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 11 + 1 })
    setMultilineText(t, 'aaa bbb ccc')
    expect(rows(t)).toEqual(['aaa bbb ccc'])
    t.setAttribute('font-size', String(SIZE * 2))
    reflowAreaText(t)
    expect(rows(t).length).toBeGreaterThan(1)
    expect(getTextWithNewlines(t)).toBe('aaa bbb ccc')
  })

  it('does nothing for point text', () => {
    const t = makeText()
    setMultilineText(t, 'a\nb')
    expect(reflowAreaText(t)).toBe(false)
  })

  it('is never area text on a path', () => {
    const t = makeText({ 'se:wrap-width': 100 })
    t.append(document.createElementNS(NS.SVG, 'textPath'))
    expect(isAreaText(t)).toBe(false)
  })
})

describe('vertical alignment', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  const lineHeight = SIZE * TEXT_LINE_HEIGHT
  const firstY = (t) => Number(t.children[0].getAttribute('y'))

  it('top is the default, middle and bottom move the rows into the free height', () => {
    const t = makeText({ 'se:wrap-width': 500, 'se:wrap-height': lineHeight * 5 })
    setMultilineText(t, 'a\nb')
    expect(getValign(t)).toBe('top')
    expect(firstY(t)).toBe(50)
    writeAreaAttrs(t, { 'se:valign': 'middle' })
    reflowAreaText(t)
    expect(firstY(t)).toBe(50 + lineHeight * 1.5)
    writeAreaAttrs(t, { 'se:valign': 'bottom' })
    reflowAreaText(t)
    expect(firstY(t)).toBe(50 + lineHeight * 3)
    expect(getTextWithNewlines(t)).toBe('a\nb')
  })

  it('stays at the top when the text overflows the box', () => {
    const t = makeText({ 'se:wrap-width': 500, 'se:wrap-height': lineHeight, 'se:valign': 'bottom' })
    setMultilineText(t, 'a\nb\nc')
    expect(firstY(t)).toBe(50)
  })
})

describe('area box', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('puts the box left of x for start, centred for middle, right of x for end', () => {
    const t = makeText({ 'se:wrap-width': 200, 'se:wrap-height': 80 })
    expect(getAreaBox(t)).toEqual({ x: 100, y: 50 - TEXT_ASCENT * SIZE, width: 200, height: 80 })
    t.setAttribute('text-anchor', 'middle')
    expect(getAreaBox(t).x).toBe(0)
    t.setAttribute('text-anchor', 'end')
    expect(getAreaBox(t).x).toBe(-100)
  })

  it('takes the height from the rows when it is not fixed', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 3 + 1 })
    setMultilineText(t, 'aaa bbb ccc')
    expect(getWrapHeight(t)).toBe(0)
    expect(getAreaBox(t).height).toBeCloseTo(3 * SIZE * TEXT_LINE_HEIGHT)
  })

  it('areaAttrsForBox is the inverse of getAreaBox for every anchor', () => {
    for (const anchor of ['start', 'middle', 'end']) {
      const t = makeText({ 'text-anchor': anchor })
      const box = { x: 30, y: 40, width: 150, height: 90 }
      writeAreaAttrs(t, areaAttrsForBox(box, anchor, SIZE))
      expect(getAreaBox(t)).toEqual(box)
    }
  })

  it('a null height removes the fixed height', () => {
    const t = makeText({ 'se:wrap-width': 100, 'se:wrap-height': 50 })
    writeAreaAttrs(t, areaAttrsForBox({ x: 0, y: 0, width: 100, height: 0 }, 'start', SIZE))
    expect(getWrapHeight(t)).toBe(0)
    expect(t.hasAttributeNS(NS.SE, 'wrap-height')).toBe(false)
  })

  it('replaces a namespace-less se: twin instead of duplicating it', () => {
    const t = makeText()
    t.setAttribute('se:wrap-width', '120') // what a plain setAttribute (undo) leaves behind
    writeAreaAttrs(t, { 'se:wrap-width': 200 })
    expect(getWrapWidth(t)).toBe(200)
    expect(Array.from(t.attributes).filter((a) => a.name === 'se:wrap-width').length).toBe(1)
  })
})

describe('area / point conversion', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('point to area keeps the rows and the position', () => {
    const t = makeText()
    setMultilineText(t, 'one two\nthree')
    expect(makeAreaText(t, 80)).toBe(true)
    expect(isAreaText(t)).toBe(true)
    expect(getWrapWidth(t)).toBe(82)
    expect(t.getAttribute('x')).toBe('100')
    expect(getTextWithNewlines(t)).toBe('one two\nthree')
    expect(makeAreaText(t, 80)).toBe(false)
  })

  it('area to point turns the soft rows into hard rows', () => {
    const t = makeText({ 'se:wrap-width': CHAR * 7 + 1 })
    setMultilineText(t, 'aaa bbb ccc ddd')
    expect(makePointText(t)).toBe(true)
    expect(isAreaText(t)).toBe(false)
    expect(t.hasAttributeNS(NS.SE, 'wrap-width')).toBe(false)
    expect(rows(t)).toEqual(['aaa bbb', 'ccc ddd'])
    expect(getTextWithNewlines(t)).toBe('aaa bbb\nccc ddd')
    expect(makePointText(t)).toBe(false)
  })
})

describe('areaTextAtPoint', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  // jsdom has no layout: give the texts an identity-plus-offset screen matrix and DOMPoint
  const identity = { inverse: () => ({}) }
  const stub = (text, ctm = identity) => { text.getScreenCTM = () => ctm }
  class Point {
    constructor (x, y) { this.x = x; this.y = y }
    matrixTransform () { return new Point(this.x, this.y) }
  }
  beforeEach(() => { globalThis.DOMPoint = Point })

  it('hits the box, not the glyphs', () => {
    const t = makeText({ x: 100, y: 50, 'se:wrap-width': 200, 'se:wrap-height': 100, 'text-anchor': 'start' })
    stub(t)
    const root = t.ownerSVGElement
    const box = getAreaBox(t)
    expect(areaTextAtPoint(root, box.x + 5, box.y + box.height - 5)).toBe(t)
    expect(areaTextAtPoint(root, box.x + box.width + 5, box.y + 5)).toBe(null)
    expect(areaTextAtPoint(root, box.x + 5, box.y + box.height + 5)).toBe(null)
  })

  it('ignores point text and takes the topmost of overlapping boxes', () => {
    const point = makeText({ x: 100, y: 50 })
    const under = makeText({ x: 100, y: 50, 'se:wrap-width': 200, 'se:wrap-height': 100, 'text-anchor': 'start' })
    const over = makeText({ x: 100, y: 50, 'se:wrap-width': 200, 'se:wrap-height': 100, 'text-anchor': 'start' })
    for (const t of [point, under, over]) { stub(t); under.ownerSVGElement.append(t) }
    const box = getAreaBox(under)
    expect(areaTextAtPoint(under.ownerSVGElement, box.x + 10, box.y + 10)).toBe(over)
    over.remove()
    expect(areaTextAtPoint(under.ownerSVGElement, box.x + 10, box.y + 10)).toBe(under)
  })

  it('skips a text that is not rendered', () => {
    const t = makeText({ x: 100, y: 50, 'se:wrap-width': 200, 'se:wrap-height': 100, 'text-anchor': 'start' })
    stub(t)
    t.checkVisibility = () => false
    const box = getAreaBox(t)
    expect(areaTextAtPoint(t.ownerSVGElement, box.x + 10, box.y + 10)).toBe(null)
  })
})
