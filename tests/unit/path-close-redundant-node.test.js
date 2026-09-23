import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Regression guard for a bug found via a real Obsidian-plugin session log
// (debug-snapshot/path-commit events showing a closed path's segCount two
// higher than the number of points the user actually clicked): closing a
// freehand-drawn path by clicking back on its own start point appended an
// explicit LinetoAbs back to the start point *in addition to* the
// ClosePath ('Z') that already draws that exact same straight edge. The
// extra lineto is a fully independent, draggable path node stacked exactly
// on top of the real start node -- indistinguishable on screen from it, but
// separately selectable/movable in the node editor, which is the
// "duplicate/phantom path node" symptom. See .claude/techdebt.md and the
// matching setSvgString()/svgCanvasToString() repair in svg-exec.js
// (sanitizeLegacyRedundantClosingPathNode), tested in test1.test.js.
describe('closing a drawn path does not create a duplicate node on the start point', () => {
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

  it('does not append a redundant lineto-to-start segment when closing with straight edges', () => {
    svgCanvas.setMode('path')
    // 3 points, closed by clicking back on the start point (300,200).
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 340, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 320, 240)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)

    const pathEl = svgCanvas.getSvgContent().querySelector('path')
    expect(pathEl).toBeTruthy()

    const segs = pathEl.pathSegList
    // M + 2 L (the 3 placed points) + Z -- nothing else. Before the fix
    // this was 5: an extra LinetoAbs duplicating the M point was inserted
    // right before the Z.
    expect(segs.numberOfItems).toBe(4)
    expect(segs.getItem(segs.numberOfItems - 1).pathSegType).toBe(1) // ClosePath
    const beforeClose = segs.getItem(segs.numberOfItems - 2)
    const startSeg = segs.getItem(0)
    // The segment right before Z is still the user's real last point
    // (320,240), not a synthetic duplicate of the start point.
    expect(beforeClose.pathSegType).toBe(4) // LinetoAbs
    expect(beforeClose.x === startSeg.x && beforeClose.y === startSeg.y).toBe(false)
  })

  it('still closes with a real curve when the closing edge was dragged into one', () => {
    svgCanvas.setMode('path')
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 340, 200)

    // Simulates the rubber-band "stretchy" preview segment being a curve at
    // the moment of the closing click -- the same runtime state
    // mouseMove()'s curve-drag branch (path-actions.js) leaves it in while
    // the user is dragging a control handle back toward the start point.
    const stretchy = svgCanvas.getElement('path_stretch_line')
    svgCanvas.replacePathSeg(6, 1, [300, 200, 320, 180, 300, 200], stretchy)

    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)

    const pathEl = svgCanvas.getSvgContent().querySelector('path')
    const segs = pathEl.pathSegList
    // M, L(340,200), the curved closing edge (kept -- ClosePath alone can't
    // express curvature), then Z.
    expect(segs.numberOfItems).toBe(4)
    expect(segs.getItem(2).pathSegType).toBe(6) // CurvetoCubicAbs, preserved
    expect(segs.getItem(3).pathSegType).toBe(1) // ClosePath
  })
})
