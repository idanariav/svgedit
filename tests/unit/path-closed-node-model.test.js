import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// The node editor models a closed subpath as `M start ... L(back to start) Z`:
// the explicit closing lineto is the start vertex's one and only grip, and
// `M` itself has none (Path#init links them as `seg.mate`). An earlier change
// mistook that lineto for a "duplicate node" and stripped it, which left the
// start vertex with no grip and made the last real node drag the start point
// along with it. These tests pin the correct model, plus the tolerance for
// `Z`-only closed paths (valid SVG from other tools, or saved by that
// earlier change) via Path#init's ensureExplicitClosingSegments().
describe('closed paths keep one grip per vertex, with the start vertex owned by the closing lineto', () => {
  let svgCanvas
  const fakeEvt = { shiftKey: false, target: {} }

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)

    svgCanvas = new SvgCanvas(document.getElementById('svgcanvas'), {
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

  const gripCount = (path) => path.segs.filter(seg => seg.ptgrip).length

  it('closing a drawn path with straight edges emits an explicit lineto-to-start plus Z', () => {
    svgCanvas.setMode('path')
    // 3 points, closed by clicking back on the start point (300,200).
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 340, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 320, 240)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)

    const pathEl = svgCanvas.getSvgContent().querySelector('path')
    const segs = pathEl.pathSegList
    // M + 2 L (placed points) + L back to start + Z
    expect(segs.numberOfItems).toBe(5)
    expect(segs.getItem(4).pathSegType).toBe(1) // ClosePath
    const closing = segs.getItem(3)
    expect(closing.pathSegType).toBe(4) // LinetoAbs
    expect(closing.x).toBe(segs.getItem(0).x)
    expect(closing.y).toBe(segs.getItem(0).y)
    // 3 clicked points -> 3 grips (M has none; the closing lineto is its grip)
    expect(gripCount(svgCanvas.getPath_(pathEl))).toBe(3)
  })

  it('a Z-only closed path gets a grip for every vertex, and the start vertex is a mate of the last node', () => {
    svgCanvas.setSvgString(
      '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="layer"><title>Layer 1</title>' +
        '<path id="p1" d="M10,10 L50,10 L50,50 L10,50 Z"/>' +
        '</g></svg>'
    )
    const pathEl = svgCanvas.getSvgContent().querySelector('#p1')
    const path = svgCanvas.getPath_(pathEl)

    // 4 vertices -> 4 grips (previously 3: the start vertex had none).
    expect(gripCount(path)).toBe(4)
    const segs = pathEl.pathSegList
    // Geometry is unchanged: an explicit lineto back to (10,10) was inserted before Z.
    expect(segs.numberOfItems).toBe(6)
    expect(segs.getItem(4).x).toBe(10)
    expect(segs.getItem(4).y).toBe(10)
    expect(segs.getItem(5).pathSegType).toBe(1)

    // Dragging the last real vertex (10,50) must not drag the start vertex.
    path.segs[3].move(5, 5)
    expect(segs.getItem(0).x).toBe(10)
    expect(segs.getItem(0).y).toBe(10)
    expect(segs.getItem(3).x).toBe(15)
    expect(segs.getItem(3).y).toBe(55)
  })

  it('does not touch a closed path that already has its explicit closing lineto', () => {
    svgCanvas.setSvgString(
      '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="layer"><title>Layer 1</title>' +
        '<path id="p1" d="M10,10 L50,10 L50,50 L10,10 Z"/>' +
        '</g></svg>'
    )
    const pathEl = svgCanvas.getSvgContent().querySelector('#p1')
    svgCanvas.getPath_(pathEl)
    expect(pathEl.pathSegList.numberOfItems).toBe(5)
  })

  it('still closes with a real curve when the closing edge was dragged into one', () => {
    svgCanvas.setMode('path')
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 340, 200)

    // Simulates the rubber-band "stretchy" preview segment being a curve at
    // the moment of the closing click.
    const stretchy = svgCanvas.getElement('path_stretch_line')
    svgCanvas.replacePathSeg(6, 1, [300, 200, 320, 180, 300, 200], stretchy)

    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)

    const pathEl = svgCanvas.getSvgContent().querySelector('path')
    const segs = pathEl.pathSegList
    expect(segs.numberOfItems).toBe(4)
    expect(segs.getItem(2).pathSegType).toBe(6) // CurvetoCubicAbs, preserved
    expect(segs.getItem(3).pathSegType).toBe(1) // ClosePath
  })
})
