import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { init as initEventSelect } from '../../packages/svgcanvas/core/event-select.js'

// Regression test for a bug where dragging (translating) an already-rotated
// element via the mouse would corrupt its geometry: event-select.js's mouseUp
// handler collapsed the whole transform list (drag translate + existing
// rotate) into a single opaque matrix whenever numberOfItems > 1, which made
// getRotationAngle() blind to the rotation. recalculateDimensions then fell
// into its matrix-as-scale branch and used the rotation matrix's cos/sin
// terms as if they were a uniform scale factor (e.g. font-size *= |cos(90°)|
// ≈ 0). See packages/svgcanvas/core/event-select.js's mouseUp `up` handler.
//
// This drives event-select.js's real `up` handler directly (bound to a real
// SvgCanvas instance, so recalculateDimensions/remapElement are the actual
// production code) against a transform list built by setting the `transform`
// attribute once — mirroring the mid-drag state
// `translate(dx dy) matrix(1 0 0 1 0 0) rotate(angle cx cy)` that
// event-select.js's move() handler produces (dummy identity transform
// inserted at drag-start, drag translate kept in sync at index 0).
describe('dragging a rotated element (event-select.js up handler)', () => {
  let svgCanvas
  let up

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
    up = initEventSelect(svgCanvas).up
  }

  // Simulate the mouseUp end of a drag on an already-rotated `elem`: its
  // transform attribute (set once, as event-select.js's move() would have
  // left it mid-drag) is `translate(dx dy) matrix(1 0 0 1 0 0) rotate(...)`.
  const finishDrag = (elem) => {
    svgCanvas.selectOnly([elem], true)
    svgCanvas.dragStartTransforms = new Map([[elem, '']])
    svgCanvas.setCurrentMode('select')
    up({}, {
      // realX/realY: anything != getRStartX/Y so the "was dragged" branch runs
      realX: 999,
      realY: 999,
      selectedElements: [elem],
      operationMode: 'select',
      pendingMove: null,
      tempJustSelected: null
    })
  }

  beforeEach(() => {
    createSvgCanvas()
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('preserves font-size when finishing a drag on a rotated, stroked text element', () => {
    const text = svgCanvas.addSVGElementsFromJson({
      element: 'text',
      attr: {
        id: 'text-rotated',
        x: 100,
        y: 100,
        width: 80,
        height: 30,
        'font-size': 24,
        stroke: '#000',
        'stroke-width': 2,
        fill: '#000',
        transform: 'translate(60 40) matrix(1 0 0 1 0 0) rotate(90 140 115)'
      }
    })
    text.textContent = 'Hello'

    finishDrag(text)

    expect(Number(text.getAttribute('font-size'))).toBe(24)
  })

  it('preserves width/height when finishing a drag on a rotated, stroked rect', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: {
        id: 'rect-rotated',
        x: 100,
        y: 100,
        width: 150,
        height: 80,
        stroke: '#000',
        'stroke-width': 3,
        fill: '#f00',
        transform: 'translate(60 40) matrix(1 0 0 1 0 0) rotate(90 175 140)'
      }
    })

    finishDrag(rect)

    expect(Number(rect.getAttribute('width'))).toBe(150)
    expect(Number(rect.getAttribute('height'))).toBe(80)
  })
})
