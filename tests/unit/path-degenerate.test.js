import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { init as pathInit } from '../../packages/svgcanvas/core/path.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

const makeBareCanvas = () => {
  const svg = createSvgElement('svg')
  const selectorParentGroup = createSvgElement('g')
  selectorParentGroup.setAttribute('id', 'selectorParentGroup')
  svg.append(selectorParentGroup)
  const svgCanvas = {
    getSvgRoot () { return svg },
    getZoom () { return 1 },
    getElement (id) { return svg.querySelector(`#${id}`) },
    addPtsToSelection () {}
  }
  pathInit(svgCanvas)
  return { svgCanvas, svg }
}

// A degenerate path is a sub-path with no drawable point after its `M`
// (`M x,y` or `M x,y Z`). init() never assigns `first_seg` for it, so the
// old `show(true)` -> `this.first_seg.index` threw. Such paths reach the editor
// via imported/pasted SVG or a node-delete/undo that reduced a sub-path to a
// single point; entering node-edit or undoing/redoing then wedged the editor.
describe('Path#show on a degenerate (single-point) path', () => {
  it('does not throw on a lone-M path', () => {
    const { svgCanvas } = makeBareCanvas()
    const pathEl = createSvgElement('path')
    pathEl.setAttribute('d', 'M10,10')
    const path = new svgCanvas.PathClass(pathEl)
    expect(() => path.show(true)).not.toThrow()
  })

  it('does not throw on an M...Z single-point closed path', () => {
    const { svgCanvas } = makeBareCanvas()
    const pathEl = createSvgElement('path')
    pathEl.setAttribute('d', 'M10,10 Z')
    const path = new svgCanvas.PathClass(pathEl)
    expect(() => path.show(true)).not.toThrow()
  })

  it('still auto-selects the first node on a normal path', () => {
    const { svgCanvas } = makeBareCanvas()
    const pathEl = createSvgElement('path')
    pathEl.setAttribute('d', 'M0,0 L10,0 L10,10 Z')
    const path = new svgCanvas.PathClass(pathEl)
    path.show(true)
    expect(path.selected_pts.length).toBeGreaterThan(0)
  })
})

describe('setMode is resilient to a throwing path/text teardown', () => {
  let svgCanvas

  const build = () => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)

    svgCanvas = new SvgCanvas(svgcanvas, {
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
  }

  beforeEach(build)
  afterEach(() => { document.body.textContent = '' })

  it('still commits the new mode when pathActions.clear() throws', () => {
    // Simulate a corrupt path-edit session whose teardown blows up. Before the
    // fix this exception propagated out of setMode() (which runs teardown
    // before assigning currentMode), so every toolbar tool click threw and the
    // mode stayed stuck -- the "can't select any other tool, only a reload
    // fixes it" freeze.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    svgCanvas.pathActions.clear = () => { throw new Error('boom') }

    expect(() => svgCanvas.setMode('rect')).not.toThrow()
    expect(svgCanvas.getMode()).toBe('rect')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still commits the new mode when textActions.clear() throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    svgCanvas.textActions.clear = () => { throw new Error('boom') }

    expect(() => svgCanvas.setMode('ellipse')).not.toThrow()
    expect(svgCanvas.getMode()).toBe('ellipse')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
