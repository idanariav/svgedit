import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Regression guard for the bug documented in .claude/techdebt.md ("Orphaned
// path-node grips left visible after freehand path drawing"), first found
// via svgCanvas.getDebugSnapshot(): grip DOM elements are cached/reused by
// segment index only (`pathpointgrip_${index}`, see path-method.js), and
// entering pathedit mode (Path#init()) hides every grip before showing only
// the current path's own -- but freehand-drawing a *new* path had no
// equivalent step, so finishing a path with N points and starting another
// with fewer left the old path's higher-index grips stuck `display:inline`
// at their stale screen position for the whole time the new path was drawn.
describe('freehand path drawing does not leak grips from a previous path', () => {
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

  it('hides a shorter new path\'s leftover higher-index grip from a longer previous one', () => {
    svgCanvas.setMode('path')
    // Path B: 2 points, closed by clicking back on the start point.
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 340, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)

    // Path B's own commit now hides its grips synchronously (see the "hides
    // a path's own grips immediately on commit" test below) -- force one
    // back to display:inline here to stand in for any *other* leak source
    // (a leftover grip from a still-earlier path, an extension, hand-edited
    // state) and verify the start-of-a-new-path guard hides it regardless
    // of why it was left visible, not just for the one path this bug was
    // originally found on.
    const grip1BeforeA = svgCanvas.getElement('pathpointgrip_1')
    grip1BeforeA.setAttribute('display', 'inline')
    expect(grip1BeforeA.getAttribute('display')).toBe('inline')

    // Path A: starts fresh, elsewhere on the canvas.
    svgCanvas.setMode('path')
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 10, 10)

    const snapshot = svgCanvas.getDebugSnapshot()
    const grip1 = snapshot.pathEditing.grips.find((g) => g.id === 'pathpointgrip_1')
    expect(grip1.display).toBe('none')
    expect(snapshot.pathEditing.grips.every((g) => !g.stale)).toBe(true)
  })

  it('hides a path\'s own grips immediately on commit, before the next path starts', () => {
    svgCanvas.setMode('path')
    // 3 points, closed by clicking back on the start point.
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 340, 200)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 320, 240)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 300, 200)

    // Commit happens synchronously inside mouseDown -- assert right after it
    // returns, without waiting for the mouseup-driven cleanup in event.js
    // (which never runs at all in tool-locked "draw multiple" mode, and
    // otherwise fires as a separate, later event).
    const snapshot = svgCanvas.getDebugSnapshot()
    expect(snapshot.pathEditing.grips.every((g) => g.display === 'none')).toBe(true)
    expect(snapshot.pathEditing.grips.every((g) => !g.stale)).toBe(true)
  })

  it('keeps extending the same path\'s grips visible when adding a subpath', () => {
    svgCanvas.setSvgString(
      '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="layer"><title>Layer 1</title><path id="p1" d="M10,10 L50,10 L50,50"/></g>' +
      '</svg>'
    )
    const pathEl = svgCanvas.getSvgContent().querySelector('#p1')
    svgCanvas.pathActions.toEditMode(pathEl)
    svgCanvas.pathActions.addSubPath(true)
    svgCanvas.pathActions.mouseDown(fakeEvt, null, 20, 20)

    const grip0 = svgCanvas.getElement('pathpointgrip_0')
    expect(grip0.getAttribute('display')).toBe('inline')
  })
})
