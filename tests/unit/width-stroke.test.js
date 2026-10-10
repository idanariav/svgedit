import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { presetPoints, parseProfile } from '../../packages/svgcanvas/core/width-profile.js'

describe('width profiles on the canvas', () => {
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

  const make = (element, attr) => svgCanvas.addSVGElementsFromJson({
    element, attr: { id: svgCanvas.getNextId(), stroke: '#336699', 'stroke-width': 10, fill: 'none', ...attr }
  })

  it('which elements can take a profile', () => {
    expect(svgCanvas.canWidthStroke(make('line', { x1: 0, y1: 0, x2: 50, y2: 0 }))).toBe(true)
    expect(svgCanvas.canWidthStroke(make('polyline', { points: '0,0 10,10 30,0' }))).toBe(true)
    expect(svgCanvas.canWidthStroke(make('path', { d: 'M0,0 L10,0 L10,10 Z' }))).toBe(true) // closed is fine
    expect(svgCanvas.canWidthStroke(make('path', { d: 'M0,0 L10,0', fill: '#ff0000' }))).toBe(false)
    expect(svgCanvas.canWidthStroke(make('path', { d: 'M0,0 L10,0', stroke: 'none' }))).toBe(false)
    // effects or corners underneath are fine (live-stack.js), not both and not Scribble
    expect(svgCanvas.canWidthStroke(make('path', { d: 'M0,0 L10,0', 'se:fx-d': 'M0,0 L10,0' }))).toBe(true)
    expect(svgCanvas.canWidthStroke(make('path', { d: 'M0,0 L10,0', 'se:orig-d': 'M0,0 L10,0' }))).toBe(true)
    expect(svgCanvas.canWidthStroke(make('path', { d: 'M0,0 L10,0', 'se:orig-d': 'M0,0 L10,0', 'se:fx-d': 'M0,0 L10,0' }))).toBe(false)
    expect(svgCanvas.canWidthStroke(make('rect', { x: 0, y: 0, width: 5, height: 5 }))).toBe(false)
    expect(svgCanvas.canWidthStroke(null)).toBe(false)
  })

  it('a profile turns a line into a filled outline path, keeping its id, in one undo step', () => {
    const line = make('line', { x1: 0, y1: 0, x2: 100, y2: 0, 'stroke-linecap': 'butt' })
    svgCanvas.selectOnly([line], true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const [path] = svgCanvas.applyWidthProfile(presetPoints('lens'))
    expect(path.tagName).toBe('path')
    expect(path.id).toBe(line.id)
    expect(path.getAttribute('fill')).toBe('#336699')
    expect(path.getAttribute('stroke')).toBe('none')
    expect(path.getAttribute('se:taper-d')).toBe('M0,0 L100,0')
    expect(path.getAttribute('se:taper-style')).toBe('10|#336699')
    expect(path.getAttribute('se:width-profile')).toBe('0:0:0;0.5:1:1;1:0:0')
    expect(path.getAttribute('se:taper')).toBe('0,0') // what code that only asks "is it tapered" reads
    expect(svgCanvas.getWidthProfile(path)).toEqual(presetPoints('lens'))
    expect(path.getAttribute('d')).toMatch(/^M[-\d., L]+ Z$/)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)

    svgCanvas.undoMgr.undo()
    const back = document.getElementById(line.id)
    expect(back.tagName).toBe('line')
    expect(back.getAttribute('stroke')).toBe('#336699')
    expect(back.hasAttribute('se:width-profile')).toBe(false)
    svgCanvas.undoMgr.redo()
    expect(document.getElementById(line.id).getAttribute('se:width-profile')).toBe('0:0:0;0.5:1:1;1:0:0')
  })

  it('a closed path takes a profile: two loops', () => {
    const sq = make('path', { d: 'M0,0 L100,0 L100,100 L0,100 Z' })
    svgCanvas.selectOnly([sq], true)
    const [path] = svgCanvas.applyWidthProfile([[0, 1, 1], [1, 1, 1]])
    expect(path.getAttribute('d').match(/Z/g)).toHaveLength(2)
  })

  it('the stroke width and the line cap are read from the element', () => {
    const wide = make('path', { d: 'M0,0 L100,0', 'stroke-width': 20, 'stroke-linecap': 'square' })
    svgCanvas.selectOnly([wide], true)
    const [path] = svgCanvas.applyWidthProfile([[0, 1, 1], [1, 1, 1]])
    const xs = [...path.getAttribute('d').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => +m[1])
    expect(Math.min(...xs)).toBeCloseTo(-10, 3) // a square cap reaches half the width past the end
    expect(Math.max(...xs)).toBeCloseTo(110, 3)
  })

  it('profiling a profiled stroke starts from its centerline, never compounding', () => {
    const line = make('line', { x1: 0, y1: 0, x2: 100, y2: 0 })
    svgCanvas.selectOnly([line], true)
    const [first] = svgCanvas.applyWidthProfile(presetPoints('lens'))
    const lens = first.getAttribute('d')
    const [second] = svgCanvas.applyWidthProfile([[0, 1, 1], [1, 1, 1]])
    expect(second.getAttribute('d')).not.toBe(lens)
    expect(second.getAttribute('se:taper-d')).toBe('M0,0 L100,0')
    const [third] = svgCanvas.applyWidthProfile(presetPoints('lens'))
    expect(third.getAttribute('d')).toBe(lens)
  })

  it('a tipped line is profiled from its real ends, and loses the alignment', () => {
    const line = make('line', { x1: 0, y1: 0, x2: 100, y2: 0 })
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
    m.setAttribute('id', 'mk')
    m.setAttribute('se_type', 'rightarrow')
    svgCanvas.findDefs().append(m)
    line.setAttribute('marker-end', 'url(#mk)')
    svgCanvas.setArrowAlign(line, 'tip')
    expect(Number(line.getAttribute('x2'))).toBeLessThan(100)
    svgCanvas.selectOnly([line], true)
    const [path] = svgCanvas.applyWidthProfile(presetPoints('lens'))
    expect(path.getAttribute('se:taper-d')).toBe('M0,0 L100,0')
    expect([...path.attributes].some((a) => a.name.startsWith('se:arrow'))).toBe(false)
  })

  it('an invalid profile or nothing selected does nothing', () => {
    const line = make('line', { x1: 0, y1: 0, x2: 100, y2: 0 })
    expect(svgCanvas.applyWidthProfile(presetPoints('lens'))).toEqual([])
    svgCanvas.selectOnly([line], true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    expect(svgCanvas.applyWidthProfile([[0, 1, 1]])).toEqual([])
    expect(svgCanvas.applyWidthProfile([[1, 1, 1], [0, 1, 1]])).toEqual([])
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before)
    expect(parseProfile(line.getAttribute('se:width-profile'))).toBeNull()
  })

  it('checkDrawing accepts a profile and flags a broken one', () => {
    const line = make('line', { x1: 0, y1: 0, x2: 100, y2: 0 })
    svgCanvas.selectOnly([line], true)
    const [path] = svgCanvas.applyWidthProfile(presetPoints('lens'))
    expect(svgCanvas.checkDrawing().filter((f) => f.code === 'se-attr-parse')).toEqual([])
    path.setAttribute('se:width-profile', 'nonsense')
    expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-attr-parse')).toBe(true)
  })
})
