import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { init as pathInit } from '../../packages/svgcanvas/core/path.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { attachUnits } from './unitsMock.js'

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
  attachUnits(svgCanvas)
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

  // getSvgString() (every save/export) also tears down a path-edit session via
  // pathActions.clear(true), but it calls that directly rather than through
  // setMode() -- so it needs its own isolation. Before this fix, a throwing
  // clear() here made getSvgString() throw too, and since the Obsidian plugin
  // (and any other host) serializes on every save, this made the drawing
  // permanently unsaveable until reload, not just stuck on a tool.
  it('still returns output when pathActions.clear() throws during serialization', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    svgCanvas.pathActions.clear = () => { throw new Error('boom') }

    expect(() => svgCanvas.getSvgString()).not.toThrow()
    expect(typeof svgCanvas.getSvgString()).toBe('string')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  // The three tests above all replace pathActions.clear() with a throwing
  // stub, proving each *caller* survives a throwing clear(). This test
  // exercises the real, unmocked clear() in the actual broken state found in
  // the wild: currentMode committed to 'pathedit' without toEditMode() ever
  // running, so the module-private path-edit session was never set up.
  // toSelectMode() then dereferenced that missing session's `.elem` and threw
  // straight out of clear() -- and because svgCanvasToString() (every save)
  // calls clear() directly, this made saving fail every single time until
  // reload. Guards against a regression of the *source* bug, not just the
  // caller-side isolation.
  it('getSvgString() does not throw when pathedit mode was committed without an active path session', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    svgCanvas.setMode('pathedit')

    expect(svgCanvas.getMode()).toBe('pathedit')
    expect(() => svgCanvas.getSvgString()).not.toThrow()
    expect(typeof svgCanvas.getSvgString()).toBe('string')
    warn.mockRestore()
  })
})

// svgCanvasToString() (every save/export, including a host's periodic
// autosave) used to tear down an in-progress path draw the same way it tears
// down a stale path-edit session: pathActions.clear(true) removed the
// not-yet-committed drawnPath element outright. currentMode stayed 'path'
// (clear() doesn't change mode), so the user's very next click created a
// brand-new path from scratch instead of continuing the one already several
// points in — silently discarding their progress, with no error and no
// visual feedback, just because a background save happened to land mid-draw.
describe('svgCanvasToString preserves an in-progress path draw', () => {
  let svgCanvas

  beforeEach(() => {
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
  })
  afterEach(() => { document.body.textContent = '' })

  it('leaves the drawn-path session intact across a save mid-draw', () => {
    svgCanvas.setMode('path')
    // `target` must resolve inside the canvas container (mouseDown's
    // "clicked outside canvas" guard checks svgCanvas.getMouseTarget(evt)).
    const evt = { shiftKey: false, target: svgCanvas.getSvgRoot() }
    // Three points, far enough apart that none registers as clicking back
    // onto an existing one (which would finish the path instead of drawing).
    svgCanvas.pathActions.mouseDown(evt, svgCanvas.getSvgRoot(), 10, 10)
    svgCanvas.pathActions.mouseUp(evt, null, 10, 10)
    svgCanvas.pathActions.mouseDown(evt, svgCanvas.getSvgRoot(), 50, 10)
    svgCanvas.pathActions.mouseUp(evt, null, 50, 10)
    svgCanvas.pathActions.mouseDown(evt, svgCanvas.getSvgRoot(), 50, 50)
    svgCanvas.pathActions.mouseUp(evt, null, 50, 50)

    const drawnPath = svgCanvas.getDrawnPath()
    expect(drawnPath).toBeTruthy()
    expect(drawnPath.pathSegList.numberOfItems).toBe(3)

    // Simulates a background save (e.g. the Obsidian plugin's autosave)
    // landing exactly while the user is mid-click on their next point.
    const output = svgCanvas.getSvgString()

    // The session must survive: same mode, same element, still in the DOM,
    // so the user's next click continues this path instead of starting a
    // silent new one.
    expect(svgCanvas.getMode()).toBe('path')
    expect(svgCanvas.getDrawnPath()).toBe(drawnPath)
    expect(svgCanvas.getSvgContent().contains(drawnPath)).toBe(true)

    // The saved output must NOT contain the not-yet-committed path -- it
    // isn't part of the drawing yet, just excluded rather than destroyed.
    expect(output).not.toContain('<path')

    // Drawing can continue after the save: a further point extends the SAME
    // element (proves the live session, not a silent new phantom path).
    const segCountBefore = drawnPath.pathSegList.numberOfItems
    svgCanvas.pathActions.mouseDown(evt, svgCanvas.getSvgRoot(), 90, 90)
    expect(svgCanvas.getDrawnPath()).toBe(drawnPath)
    expect(drawnPath.pathSegList.numberOfItems).toBeGreaterThan(segCountBefore)
  })
})

// svgCanvasToString() had the same hazard for the *other* path session --
// editing an existing path's nodes -- but wasn't excluded the way the
// drawnPath case above was fixed: pathActions.clear() unconditionally calls
// toSelectMode() when currentMode is 'pathedit', so a background save (e.g.
// this plugin host's own autosave) landing mid-node-drag silently exited
// node-edit, hiding the grips and dropping the selection, with no user
// action. Since the Obsidian plugin defaults to a 15s autosave, this was
// very reachable in real usage: edit a path's nodes for more than 15
// uninterrupted seconds and the very next save would kick you out.
describe('svgCanvasToString preserves an in-progress pathedit session', () => {
  let svgCanvas

  beforeEach(() => {
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
  })
  afterEach(() => { document.body.textContent = '' })

  it('leaves a pathedit session (mode + shown grips) intact across a save mid-edit', () => {
    svgCanvas.setSvgString(
      '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="layer"><title>Layer 1</title><path id="p1" d="M10,10 L50,10 L50,50"/></g>' +
      '</svg>'
    )
    const pathEl = svgCanvas.getSvgContent().querySelector('#p1')
    svgCanvas.pathActions.toEditMode(pathEl)
    expect(svgCanvas.getMode()).toBe('pathedit')

    const grip = svgCanvas.getSvgRoot().querySelector('rect[id^="pathpointgrip_"]')
    expect(grip.getAttribute('display')).toBe('inline')

    // Simulates a background save (e.g. the Obsidian plugin's autosave)
    // landing while the user is mid-drag on one of this path's nodes.
    const output = svgCanvas.getSvgString()

    // The session must survive: still in pathedit, grips still shown -- not
    // silently dropped back to select mode with everything hidden/deselected
    // just because a save happened to run.
    expect(svgCanvas.getMode()).toBe('pathedit')
    expect(grip.getAttribute('display')).toBe('inline')
    expect(output).toContain('id="p1"')
  })
})
