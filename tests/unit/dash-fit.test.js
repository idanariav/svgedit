import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { parseDashes, validateDashFit, fitDashes, dashFitIssue, DASH_FIT_ATTR } from '../../packages/svgcanvas/core/dash-fit.js'

describe('parseDashes', () => {
  it('reads comma or space separated lengths', () => {
    expect(parseDashes('5,5')).toEqual([5, 5])
    expect(parseDashes(' 2 4  6 ')).toEqual([2, 4, 6])
    expect(parseDashes('0,4')).toEqual([0, 4])
  })

  it('has nothing for none, empty, negative or unreadable values', () => {
    for (const v of ['none', 'NONE', '', null, undefined, '5,-1', '5,x', 'NaN,3']) expect(parseDashes(v), String(v)).toBeNull()
  })

  it('validate: needs a dash length somewhere', () => {
    expect(validateDashFit('5,3')).toBe(true)
    expect(typeof validateDashFit('0,0')).toBe('string')
    expect(typeof validateDashFit('a')).toBe('string')
  })
})

describe('fitDashes', () => {
  it('keeps a pattern that already fits and centres a dash on the start', () => {
    expect(fitDashes([5, 5], 100, false)).toEqual({ array: [5, 5], offset: 2.5 })
  })

  it('stretches the pattern so a whole number of periods fills the length', () => {
    const { array, offset } = fitDashes([5, 5], 103, false)
    expect(array).toEqual([5.15, 5.15])
    expect(array[0] + array[1]).toBeCloseTo(10.3, 6)
    expect(offset).toBeCloseTo(2.575, 6)
    const squeezed = fitDashes([5, 5], 97, false).array
    expect((squeezed[0] + squeezed[1]) * 10).toBeCloseTo(97, 2)
  })

  it('repeats an odd list as SVG does, so the period is the doubled sum', () => {
    expect(fitDashes([5], 100, false).array).toEqual([5, 5])
    const three = fitDashes([4, 2, 2], 120, false)
    expect(three.array).toHaveLength(6)
    expect(three.array.reduce((a, b) => a + b, 0) * Math.round(120 / 16)).toBeCloseTo(120, 1)
  })

  it('a closed curve has no end to centre a dash on', () => {
    expect(fitDashes([5, 5], 103, true).offset).toBe(0)
  })

  it('squeezes into one period when the stroke is shorter than one', () => {
    const { array } = fitDashes([5, 5], 4, false)
    expect(array[0] + array[1]).toBeCloseTo(4, 6)
  })

  it('a dot pattern (zero-length dash) starts on the dot', () => {
    expect(fitDashes([0, 4], 40, false)).toEqual({ array: [0, 4], offset: 0 })
  })

  it('has nothing to fit with an empty pattern or length', () => {
    expect(fitDashes([0, 0], 100, false)).toBeNull()
    expect(fitDashes([5, 5], 0, false)).toBeNull()
  })
})

describe('dashFitIssue', () => {
  const NS = 'http://www.w3.org/2000/svg'
  const el = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    return e
  }

  it('accepts a line, circle, ellipse and a smooth path that have a dash pattern', () => {
    expect(dashFitIssue(el('line', { 'stroke-dasharray': '5,5' }))).toBeNull()
    expect(dashFitIssue(el('circle', { 'stroke-dasharray': '5,5' }))).toBeNull()
    expect(dashFitIssue(el('ellipse', { 'stroke-dasharray': '5,5' }))).toBeNull()
    expect(dashFitIssue(el('path', { d: 'M0,0 C0,30 50,30 50,0 S100,-30 100,0', 'stroke-dasharray': '5,5' }))).toBeNull()
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 L100,0', 'stroke-dasharray': '5,5' }))).toBeNull() // straight through
  })

  it('refuses shapes with corners, several pieces or no dashes', () => {
    expect(dashFitIssue(el('rect', { 'stroke-dasharray': '5,5' }))).toMatch(/line, a circle/)
    expect(dashFitIssue(el('polygon', { 'stroke-dasharray': '5,5' }))).toMatch(/line, a circle/)
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 L50,50', 'stroke-dasharray': '5,5' }))).toMatch(/corners/)
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 L50,50 Z', 'stroke-dasharray': '5,5' }))).toMatch(/corners/)
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 M0,10 L50,10', 'stroke-dasharray': '5,5' }))).toMatch(/one piece/)
    expect(dashFitIssue(el('path', { d: 'M0,0 C0,30 50,30 50,0', 'stroke-dasharray': 'none' }))).toMatch(/dash pattern/)
    expect(dashFitIssue(el('circle'))).toMatch(/dash pattern/)
    expect(dashFitIssue(el('path', { d: 'M0,0 C0,30 50,30 50,0', 'stroke-dasharray': '5,5', 'se:taper': '1' }))).toMatch(/tapered/)
  })

  it('a closed smooth path (no corner anywhere) is fine', () => {
    const d = 'M50,0 C77,0 100,22 100,50 C100,77 77,100 50,100 C22,100 0,77 0,50 C0,22 22,0 50,0 Z'
    expect(dashFitIssue(el('path', { d, 'stroke-dasharray': '5,5' }))).toBeNull()
  })

  it('a fitted element needs no dasharray of its own', () => {
    expect(dashFitIssue(el('circle', { [DASH_FIT_ATTR]: '5,5' }))).toBeNull()
  })
})

describe('on the canvas', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    document.body.append(workarea, toolsLeft)
    svgCanvas = new SvgCanvas(host, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  /** A line that is `length` long as far as getTotalLength is concerned (jsdom has no layout). */
  const line = (length, attrs = {}) => {
    const el = svgCanvas.addSVGElementsFromJson({
      element: 'line',
      attr: { id: svgCanvas.getNextId(), x1: 0, y1: 0, x2: length, y2: 0, stroke: '#000', 'stroke-dasharray': '5,5', ...attrs }
    })
    el.getTotalLength = () => length
    return el
  }
  const select = (...els) => svgCanvas.selectOnly(els, true)

  it('fits the dashes of the selection in one undo step and remembers the pattern', () => {
    const a = line(103)
    select(a)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    expect(svgCanvas.isDashFitted()).toBe(false)
    expect(svgCanvas.setDashFit(true)).toBe(1)
    expect(a.getAttribute('stroke-dasharray')).toBe('5.15,5.15')
    expect(a.getAttribute('stroke-dashoffset')).toBe('2.575')
    expect(a.getAttribute(DASH_FIT_ATTR)).toBe('5,5')
    expect(svgCanvas.isDashFitted()).toBe(true)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    svgCanvas.undoMgr.undo()
    expect(a.getAttribute('stroke-dasharray')).toBe('5,5')
    expect(a.hasAttribute(DASH_FIT_ATTR)).toBe(false)
    expect(a.hasAttribute('stroke-dashoffset')).toBe(false)
    svgCanvas.undoMgr.redo()
    expect(a.getAttribute('stroke-dasharray')).toBe('5.15,5.15')
  })

  it('fitting again starts from the remembered pattern, so it never compounds', () => {
    const a = line(103)
    select(a)
    svgCanvas.setDashFit(true)
    const once = a.getAttribute('stroke-dasharray')
    a.getTotalLength = () => 117 // the stroke grew
    svgCanvas.setDashFit(true)
    expect(a.getAttribute('stroke-dasharray')).not.toBe(once)
    a.getTotalLength = () => 103
    svgCanvas.setDashFit(true)
    expect(a.getAttribute('stroke-dasharray')).toBe(once)
  })

  it('turning the fit off puts the pattern back', () => {
    const a = line(103)
    select(a)
    svgCanvas.setDashFit(true)
    expect(svgCanvas.setDashFit(false)).toBe(1)
    expect(a.getAttribute('stroke-dasharray')).toBe('5,5')
    expect(a.hasAttribute('stroke-dashoffset')).toBe(false)
    expect(a.hasAttribute(DASH_FIT_ATTR)).toBe(false)
    expect(svgCanvas.setDashFit(false)).toBe(0)
  })

  it('leaves out what cannot be fitted', () => {
    const a = line(103)
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect', attr: { id: svgCanvas.getNextId(), x: 0, y: 0, width: 10, height: 10, stroke: '#000', 'stroke-dasharray': '5,5' }
    })
    select(a, rect)
    expect(svgCanvas.setDashFit(true)).toBe(1)
    expect(rect.hasAttribute(DASH_FIT_ATTR)).toBe(false)
    expect(rect.getAttribute('stroke-dasharray')).toBe('5,5')
  })

  it('a new pattern for fitted dashes is fitted too; none turns the fit off', () => {
    const a = line(100)
    select(a)
    expect(svgCanvas.setDashPattern('2,2')).toBe(false) // nothing fitted: the caller sets the attribute
    svgCanvas.setDashFit(true)
    expect(svgCanvas.setDashPattern('4,6')).toBe(true)
    expect(a.getAttribute(DASH_FIT_ATTR)).toBe('4,6')
    expect(a.getAttribute('stroke-dasharray')).toBe('4,6')
    expect(a.getAttribute('stroke-dashoffset')).toBe('2')
    expect(svgCanvas.setDashPattern('none')).toBe(true)
    expect(a.getAttribute('stroke-dasharray')).toBe('none')
    expect(a.hasAttribute(DASH_FIT_ATTR)).toBe(false)
    expect(a.hasAttribute('stroke-dashoffset')).toBe(false)
  })

  it('checkDrawing flags a malformed marker', () => {
    const a = line(100)
    a.setAttribute(DASH_FIT_ATTR, 'oops')
    expect(svgCanvas.checkDrawing().some((p) => /dash-fit/.test(JSON.stringify(p)))).toBe(true)
    a.setAttribute(DASH_FIT_ATTR, '5,5')
    expect(svgCanvas.checkDrawing().some((p) => /dash-fit/.test(JSON.stringify(p)))).toBe(false)
  })
})
