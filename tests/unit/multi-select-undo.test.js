import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { init as initEventSelect } from '../../packages/svgcanvas/core/event-select.js'

// Regression test: undoing a drag of multiple ungrouped selected elements
// used to distort every element except the one the mouse actually went down
// on. event-select.js's mouseUp handler bakes each dragged element's move
// into geometry via recalculateDimensions(), which records the undo command's
// "old transform" from svgCanvas.getStartTransform() — a single shared slot
// set once at mousedown to the clicked element's own pre-drag transform (see
// event.js's mouseDownEvent). For every OTHER selected element in the drag,
// that slot held the wrong element's original transform, so undo overwrote
// their `transform` attribute with it instead of their own original value —
// e.g. wiping out a pre-existing rotation. The fix threads each element's own
// captured pre-drag transform (svgCanvas.dragStartTransforms) through
// setStartTransform() right before recalculateDimensions() runs for it.
describe('undoing a multi-element drag (event-select.js up handler)', () => {
  let svgCanvas
  let up
  let move

  const createSvgCanvas = () => {
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
    const handlers = initEventSelect(svgCanvas)
    up = handlers.up
    move = handlers.move
  }

  beforeEach(() => {
    createSvgCanvas()
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('restores each element\'s own original transform, not the clicked element\'s', () => {
    // rect1 has no pre-existing transform; rect2 is pre-rotated. Only rect1
    // is the mousedown target (mirrors event.js setting getStartTransform()
    // from the single clicked element).
    const rect1 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect1', x: 50, y: 50, width: 40, height: 40, fill: '#f00' }
    })
    const rect2 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: {
        id: 'rect2',
        x: 300,
        y: 300,
        width: 40,
        height: 40,
        fill: '#0f0',
        transform: 'rotate(30 320 320)'
      }
    })

    svgCanvas.selectOnly([rect1, rect2], true)
    // Mousedown lands on rect1 only — svgCanvas.getStartTransform() gets set
    // from just this one element (mirrors event.js's mouseDownEvent).
    svgCanvas.setStartTransform(rect1.getAttribute('transform'))
    svgCanvas.setStartX(70)
    svgCanvas.setStartY(70)
    svgCanvas.setRStartX(70)
    svgCanvas.setRStartY(70)
    svgCanvas.setCurrentMode('select')

    const svgRoot = svgCanvas.getSvgRoot()
    const moveCtx = {
      selectedElements: [rect1, rect2],
      selected: true,
      zoom: 1,
      svgRoot,
      x: 70,
      y: 70
    }
    // First move: inserts the dummy drag transform and snapshots each
    // element's pre-drag transform into svgCanvas.dragStartTransforms via
    // the live transform-list API (as a real drag would).
    move({}, moveCtx)
    // Second move: drags the selection by (60, 40) using the same live API.
    move({}, { ...moveCtx, x: 130, y: 110 })

    up({}, {
      realX: 130,
      realY: 110,
      selectedElements: [rect1, rect2],
      operationMode: 'select',
      pendingMove: null,
      tempJustSelected: null
    })

    svgCanvas.undoMgr.undo()

    expect(rect1.getAttribute('transform')).toBeNull()
    expect(rect2.getAttribute('transform')).toBe('rotate(30 320 320)')
  })
})
