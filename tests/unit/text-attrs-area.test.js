import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import { init as textAttrsInit } from '../../packages/svgcanvas/core/text-attrs.js'
import { setMultilineText, getTextWithNewlines } from '../../packages/svgcanvas/core/text-rows.ts'
import { runGeometryRemaps } from '../../packages/svgcanvas/core/geometry-remap-registry.ts'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'

// jsdom has no SVG text metrics: every character is font-size × 0.55 wide (11 at size 20).
const CHAR = 11

describe('area text attributes', () => {
  let canvas
  let svg
  let selected = []
  let history = []

  const makeArea = (attrs = {}) => {
    const text = document.createElementNS(NS.SVG, 'text')
    const all = { x: 100, y: 50, 'font-size': 20, 'text-anchor': 'start', ...attrs }
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('se:')) text.setAttributeNS(NS.SE, k, String(v))
      else text.setAttribute(k, String(v))
    }
    svg.append(text)
    return text
  }
  const rows = (t) => Array.from(t.children).map((c) => c.textContent)

  beforeEach(() => {
    document.body.innerHTML = ''
    svg = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svg)
    selected = []
    history = []
    canvas = {
      destroyAbort: new AbortController(),
      getSvgContent: () => svg,
      getSelectedElements: () => selected,
      getCurrentMode: () => 'select',
      getCurText: () => 20,
      setCurText: () => {},
      call: () => {},
      textActions: { setCursor: () => {} },
      selectorManager: { requestSelector: () => ({ resize: () => {} }) },
      // The real ones record undo; here the attribute is just written
      changeSelectedAttribute: (attr, value, elems) => elems.forEach((el) => el.setAttribute(attr, value)),
      changeSelectedAttributeNoUndo: (attr, value, elems) => elems.forEach((el) => el.setAttribute(attr, value)),
      transact: (label, fn) => { history.push(label); return fn() }
    }
    textAttrsInit(canvas)
  })

  afterEach(() => canvas.destroyAbort.abort())

  it('changing the font size keeps the box top where it was', () => {
    const t = makeArea({ 'se:wrap-width': 300, 'se:wrap-height': 100 })
    setMultilineText(t, 'hello')
    selected = [t]
    const top = 50 - 0.8 * 20
    canvas.setFontSize(40)
    expect(Number(t.getAttribute('y'))).toBeCloseTo(top + 0.8 * 40)
    expect(t.getAttribute('font-size')).toBe('40')
    expect(history).toEqual(['Font size'])
  })

  it('changing the alignment keeps the box left edge where it was', () => {
    const t = makeArea({ 'se:wrap-width': 300 })
    setMultilineText(t, 'hello')
    selected = [t]
    canvas.setTextAnchor('middle')
    expect(Number(t.getAttribute('x'))).toBe(250)
    canvas.setTextAnchor('end')
    expect(Number(t.getAttribute('x'))).toBe(400)
    canvas.setTextAnchor('start')
    expect(Number(t.getAttribute('x'))).toBe(100)
  })

  it('point text keeps the plain font size and anchor behaviour', () => {
    const t = document.createElementNS(NS.SVG, 'text')
    t.setAttribute('x', '100')
    t.setAttribute('y', '50')
    t.setAttribute('font-size', '20')
    svg.append(t)
    selected = [t]
    canvas.setFontSize(40)
    expect(t.getAttribute('y')).toBe('50')
    expect(history).toEqual([])
  })

  it('setTextValign writes a namespaced attribute and moves the rows', () => {
    const t = makeArea({ 'se:wrap-width': 300, 'se:wrap-height': 200 })
    setMultilineText(t, 'a')
    selected = [t]
    canvas.setTextValign('bottom')
    expect(t.getAttributeNS(NS.SE, 'valign')).toBe('bottom')
    expect(Number(t.children[0].getAttribute('y'))).toBeCloseTo(50 + 200 - 24)
    canvas.setTextValign('top')
    expect(t.hasAttributeNS(NS.SE, 'valign')).toBe(false)
    expect(Number(t.children[0].getAttribute('y'))).toBe(50)
  })

  it('isAreaText and makeAreaText / makePointText round trip through the canvas', () => {
    const t = document.createElementNS(NS.SVG, 'text')
    t.setAttribute('x', '100')
    t.setAttribute('y', '50')
    t.setAttribute('font-size', '20')
    t.textContent = 'one two'
    svg.append(t)
    selected = [t]
    expect(canvas.isAreaText(t)).toBe(false)
    expect(canvas.makeAreaText()).toBe(true)
    expect(canvas.isAreaText(t)).toBe(true)
    expect(canvas.makeAreaText()).toBe(false)
    expect(getTextWithNewlines(t)).toBe('one two')
    expect(canvas.makePointText()).toBe(true)
    expect(canvas.isAreaText(t)).toBe(false)
  })

  it('a transform bake that scales the type scales the box with it', () => {
    const t = makeArea({ 'se:wrap-width': 200, 'se:wrap-height': 100 })
    setMultilineText(t, 'aaa bbb ccc')
    const scale = (n) => (w) => w * n
    // what remapElement does after it has doubled font-size, x and y
    t.setAttribute('font-size', '40')
    runGeometryRemaps(t, (x, y) => ({ x, y }), scale(2), scale(2), canvas)
    expect(t.getAttributeNS(NS.SE, 'wrap-width')).toBe('400')
    expect(t.getAttributeNS(NS.SE, 'wrap-height')).toBe('200')
    expect(getTextWithNewlines(t)).toBe('aaa bbb ccc')
  })

  it('wraps again when a web font finishes loading', () => {
    const fonts = new EventTarget()
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    try {
      canvas.destroyAbort.abort()
      canvas.destroyAbort = new AbortController()
      textAttrsInit(canvas)
      const t = makeArea({ 'se:wrap-width': CHAR * 11 + 1 })
      setMultilineText(t, 'aaa bbb ccc')
      expect(rows(t)).toEqual(['aaa bbb ccc'])
      t.setAttribute('font-size', '40') // metrics changed behind our back (a font arrived)
      fonts.dispatchEvent(new Event('loadingdone'))
      expect(rows(t).length).toBeGreaterThan(1)
      expect(getTextWithNewlines(t)).toBe('aaa bbb ccc')
    } finally {
      delete document.fonts
    }
  })

  describe('checkDrawing rules', () => {
    const findings = () => checkDrawing(svg).filter((f) => /area-text|wrap|valign|soft/.test(f.code + f.message))

    it('accepts a healthy area text', () => {
      const t = makeArea({ 'se:wrap-width': 55 })
      setMultilineText(t, 'aaa bbb ccc')
      expect(findings()).toEqual([])
    })

    it('flags soft rows in a text that has no box', () => {
      const t = makeArea({ 'se:wrap-width': 55 })
      setMultilineText(t, 'aaa bbb ccc')
      t.removeAttributeNS(NS.SE, 'wrap-width')
      expect(findings().map((f) => f.code)).toContain('area-text')
    })

    it('flags bad values', () => {
      const t = makeArea({ 'se:wrap-width': 'wide', 'se:valign': 'sideways' })
      expect(t).toBeTruthy()
      expect(findings().length).toBeGreaterThanOrEqual(2)
    })
  })
})
