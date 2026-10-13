import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { parseAnchors } from '../../packages/svgcanvas/core/anchor-path.js'
import { parseDashes, validateDashFit, fitDashes, fitDashesCornered, outlineCorners, MAX_DASH_ENTRIES, dashFitIssue, DASH_FIT_ATTR } from '../../packages/svgcanvas/core/dash-fit.js'

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

  it('accepts shapes with corners: a rectangle, a polygon, a polyline, a path with sharp turns', () => {
    const dashed = { 'stroke-dasharray': '5,5' }
    expect(dashFitIssue(el('rect', { x: 0, y: 0, width: 100, height: 50, ...dashed }))).toBeNull()
    expect(dashFitIssue(el('rect', { x: 0, y: 0, width: 100, height: 50, rx: 8, ...dashed }))).toBeNull() // rounded: smooth
    expect(dashFitIssue(el('polygon', { points: '0,0 50,0 25,40', ...dashed }))).toBeNull()
    expect(dashFitIssue(el('polyline', { points: '0,0 50,0 50,50', ...dashed }))).toBeNull()
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 L50,50', ...dashed }))).toBeNull()
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 L50,50 Z', ...dashed }))).toBeNull()
  })

  it('refuses what has no outline to fit, several pieces, no dashes, or too many dashes', () => {
    expect(dashFitIssue(el('text', { 'stroke-dasharray': '5,5' }))).toMatch(/line, a path/)
    expect(dashFitIssue(el('polygon', { points: '3', 'stroke-dasharray': '5,5' }))).toMatch(/at least two points/)
    expect(dashFitIssue(el('path', { d: 'M0,0 L50,0 M0,10 L50,10', 'stroke-dasharray': '5,5' }))).toMatch(/one piece/)
    expect(dashFitIssue(el('rect', { x: 0, y: 0, width: 50, height: 50 }))).toMatch(/dash pattern/)
    expect(dashFitIssue(el('path', { d: 'M0,0 L100000,0 L100000,100', 'stroke-dasharray': '1,1' }))).toMatch(/Too many dashes/)
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
      element: 'rect', attr: { id: svgCanvas.getNextId(), x: 0, y: 0, width: 10, height: 10, stroke: '#000' } // no pattern
    })
    select(a, rect)
    expect(svgCanvas.setDashFit(true)).toBe(1)
    expect(rect.hasAttribute(DASH_FIT_ATTR)).toBe(false)
    expect(rect.hasAttribute('stroke-dasharray')).toBe(false)
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

// ---------------------------------------------------------------------------
// Corners: one fit per run between two corners
// ---------------------------------------------------------------------------

/** Whether the stroke at arc length `s` of a path is painted, for a fitted `array` / `offset`. */
const isOn = (array, offset, s) => {
  const total = array.reduce((a, b) => a + b, 0)
  let q = (s + offset) % total
  for (let i = 0; i < array.length; i++) {
    if (q < array[i] - 1e-9 || (q <= array[i] + 1e-9 && i % 2 === 0)) return i % 2 === 0
    q -= array[i]
  }
  return false
}
const sum = (a) => a.reduce((x, y) => x + y, 0)
const sub = (d) => parseAnchors(d, 0.1)[0]

describe('outlineCorners', () => {
  it('finds the corners of an open path (its ends are not corners) and its length', () => {
    expect(outlineCorners(sub('M0,0 L100,0 L100,50'))).toEqual({ total: 150, closed: false, cuts: [100] })
    expect(outlineCorners(sub('M0,0 L100,0 L200,0'))).toEqual({ total: 200, closed: false, cuts: [] })
  })

  it('a closed path counts its start when it is a corner', () => {
    const square = outlineCorners(sub('M0,0 L50,0 L50,50 L0,50 Z'))
    expect(square.closed).toBe(true)
    expect(square.total).toBeCloseTo(200, 6)
    expect(square.cuts.map((c) => Math.round(c))).toEqual([0, 50, 100, 150])
  })

  it('a smooth closed path has none', () => {
    const d = 'M50,0 C77,0 100,22 100,50 C100,77 77,100 50,100 C22,100 0,77 0,50 C0,22 22,0 50,0 Z'
    expect(outlineCorners(sub(d)).cuts).toEqual([])
  })
})

describe('fitDashesCornered', () => {
  it('open: half a dash at each end, a dash round the corner, whole periods on each side', () => {
    const sp = sub('M0,0 L100,0 L100,50')
    const { total, closed, cuts } = outlineCorners(sp)
    const { array, offset } = fitDashesCornered([10, 10], total, closed, cuts)
    expect(offset).toBe(0)
    expect(array.length % 2).toBe(0)
    expect(sum(array)).toBeCloseTo(150, 3)
    expect(array[0]).toBeCloseTo(5, 3) // half a dash at the start
    expect(array.at(-1)).toBe(0) // ends on a dash
    expect(isOn(array, offset, 0.001)).toBe(true)
    expect(isOn(array, offset, 149.999)).toBe(true)
    expect(isOn(array, offset, 100)).toBe(true) // the corner is inside a dash...
    expect(isOn(array, offset, 97)).toBe(true) // ...which reaches both ways
    expect(isOn(array, offset, 103)).toBe(true)
    // the first side keeps its own period: 100 / 20 = 5 whole periods, so dashes are 10 long there
    expect(array[1]).toBeCloseTo(10, 3)
    expect(array[2]).toBeCloseTo(10, 3)
  })

  it('closed: a dash round every corner, the dash at the start joined and the stroke start shifted into it', () => {
    const sp = sub('M0,0 L50,0 L50,50 L0,50 Z')
    const { total, closed, cuts } = outlineCorners(sp)
    const { array, offset } = fitDashesCornered([10, 10], total, closed, cuts)
    expect(array.length % 2).toBe(0)
    expect(sum(array)).toBeCloseTo(200, 3)
    // 50 per side = 2.5 periods → 3, so the pattern is squeezed to 50 / 60: dashes 8.33 long
    expect(array[0]).toBeCloseTo(8.3333, 3) // the dash round the start corner, in one piece
    expect(offset).toBeCloseTo(4.1667, 3) // the path starts half way into it
    for (const corner of [0, 50, 100, 150]) {
      expect(isOn(array, offset, corner + 0.001), `corner ${corner}`).toBe(true)
      expect(isOn(array, offset, corner - 0.001 + (corner === 0 ? 200 : 0)), `before corner ${corner}`).toBe(true)
    }
  })

  it('a closed path whose start is not a corner is walked from its first corner', () => {
    // a triangle drawn from the middle of its base
    const sp = sub('M25,0 L50,0 L25,40 L0,0 Z')
    const { total, closed, cuts } = outlineCorners(sp)
    expect(cuts[0]).toBeGreaterThan(0)
    const { array, offset } = fitDashesCornered([6, 4], total, closed, cuts)
    expect(sum(array)).toBeCloseTo(total, 3)
    for (const corner of cuts) expect(isOn(array, offset, corner), `corner at ${corner}`).toBe(true)
  })

  it('every corner is inside a dash, whatever the shape and the pattern', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let n = 0; n < 150; n++) {
      const pts = Array.from({ length: 3 + Math.floor(rnd() * 4) }, () => `${Math.round(rnd() * 300)},${Math.round(rnd() * 300)}`)
      const closed = rnd() < 0.5
      const sp = sub(`M${pts.join(' L')}${closed ? ' Z' : ''}`)
      if (!sp) continue
      const { total, closed: c, cuts } = outlineCorners(sp)
      if (!cuts.length || !(total > 30)) continue
      const pattern = [1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 12)]
      const fit = fitDashesCornered(pattern, total, c, cuts)
      expect(fit.array.length % 2).toBe(0)
      expect(fit.array.every((v) => v >= 0)).toBe(true)
      expect(Math.abs(sum(fit.array) - total)).toBeLessThan(0.01)
      for (const corner of cuts) expect(isOn(fit.array, fit.offset, corner), `${pts.join(' ')} pattern ${pattern} corner ${corner}`).toBe(true)
    }
  })

  it('has nothing to fit with an empty pattern, an empty length or no corners', () => {
    expect(fitDashesCornered([0, 0], 100, false, [50])).toBeNull()
    expect(fitDashesCornered([5, 5], 0, false, [50])).toBeNull()
    expect(fitDashesCornered([5, 5], 100, false, [])).toBeNull()
  })

  it('the list stays under the cap for an ordinary drawing', () => {
    const { total, closed, cuts } = outlineCorners(sub('M0,0 L800,0 L800,600 L0,600 Z'))
    expect(fitDashesCornered([6, 4], total, closed, cuts).array.length).toBeLessThan(MAX_DASH_ENTRIES)
  })
})

describe('corners on the canvas', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    document.body.append(workarea)
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
  afterEach(() => { document.body.textContent = '' })

  const shape = (element, attr) => svgCanvas.addSVGElementsFromJson({
    element, attr: { id: svgCanvas.getNextId(), fill: 'none', stroke: '#000', 'stroke-dasharray': '5,5', ...attr }
  })
  const list = (el) => el.getAttribute('stroke-dasharray').split(',').map(Number)

  it('fits a rectangle round its corners, in one undo step, and turning the fit off puts the pattern back', () => {
    const rect = shape('rect', { x: 10, y: 10, width: 100, height: 60 })
    svgCanvas.selectOnly([rect], true)
    const undo = svgCanvas.undoMgr.getUndoStackSize()
    expect(svgCanvas.setDashFit(true)).toBe(1)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undo + 1)
    expect(rect.getAttribute(DASH_FIT_ATTR)).toBe('5,5')
    const array = list(rect)
    expect(sum(array)).toBeCloseTo(320, 3) // the perimeter
    const offset = Number(rect.getAttribute('stroke-dashoffset'))
    for (const corner of [0, 100, 160, 260]) expect(isOn(array, offset, corner + 0.001), `corner ${corner}`).toBe(true)
    expect(svgCanvas.setDashFit(false)).toBe(1)
    expect(rect.getAttribute('stroke-dasharray')).toBe('5,5')
    expect(rect.hasAttribute('stroke-dashoffset')).toBe(false)
    svgCanvas.undoMgr.undo()
    svgCanvas.undoMgr.undo()
    expect(rect.getAttribute(DASH_FIT_ATTR)).toBeNull()
  })

  it('fits a polygon, a polyline and a cornered path; the fit does not compound', () => {
    const polygon = shape('polygon', { points: '0,0 80,0 40,60' })
    const polyline = shape('polyline', { points: '0,0 80,0 80,40' })
    const path = shape('path', { d: 'M0,0 L80,0 L80,40 L0,40' })
    svgCanvas.selectOnly([polygon, polyline, path], true)
    expect(svgCanvas.setDashFit(true)).toBe(3)
    const first = [polygon, polyline, path].map((e) => e.getAttribute('stroke-dasharray'))
    expect(sum(list(polygon))).toBeCloseTo(80 + 2 * Math.hypot(40, 60), 2)
    expect(sum(list(polyline))).toBeCloseTo(120, 3)
    expect(sum(list(path))).toBeCloseTo(200, 3)
    svgCanvas.setDashFit(true)
    expect([polygon, polyline, path].map((e) => e.getAttribute('stroke-dasharray'))).toEqual(first)
  })

  it('a new dash style for a fitted rectangle is fitted round its corners too', () => {
    const rect = shape('rect', { x: 0, y: 0, width: 100, height: 60 })
    svgCanvas.selectOnly([rect], true)
    svgCanvas.setDashFit(true)
    expect(svgCanvas.setDashPattern('10,4')).toBe(true)
    expect(rect.getAttribute(DASH_FIT_ATTR)).toBe('10,4')
    expect(sum(list(rect))).toBeCloseTo(320, 3)
  })

  it('a rounded rectangle is one smooth closed run: a periodic pattern with no offset', () => {
    const rect = shape('rect', { x: 0, y: 0, width: 100, height: 60, rx: 10 })
    rect.getTotalLength = () => 300
    svgCanvas.selectOnly([rect], true)
    expect(svgCanvas.setDashFit(true)).toBe(1)
    expect(list(rect)).toHaveLength(2)
    expect(rect.hasAttribute('stroke-dashoffset')).toBe(false)
  })

  it('a shape that needs too many dashes is left alone', () => {
    const path = shape('path', { d: 'M0,0 L100000,0 L100000,100', 'stroke-dasharray': '1,1' })
    svgCanvas.selectOnly([path], true)
    expect(svgCanvas.setDashFit(true)).toBe(0)
    expect(path.getAttribute('stroke-dasharray')).toBe('1,1')
  })
})
