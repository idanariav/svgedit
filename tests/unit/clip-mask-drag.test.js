import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { init as initEventSelect } from '../../packages/svgcanvas/core/event-select.js'
import { init as initClipMask } from '../../packages/svgcanvas/core/clip-mask.js'

// Regression test for a bug where dragging an element with a clip-path (or
// mask) baked the move into its x/y geometry via recalculateDimensions() ->
// remapElement(), while the clip/mask's silhouette clone in <defs> (created
// by setClip()/setMask(), see clip-mask.js) stayed exactly where it was.
// clipPathUnits="userSpaceOnUse" (and maskContentUnits, same default) is
// evaluated in the *parent's* coordinate system, unaffected by the element's
// own x/y attributes but carried along rigidly by a `transform` on the
// element. Baking the drag into x/y therefore silently detached the visible
// clip window from the shape: the shape could end up entirely outside its
// own (now stale) clip region and disappear, while remaining selectable
// since selection uses the element's own geometry, not the clipped paint
// region. See packages/svgcanvas/core/recalculate.js's recalculateDimensions
// clip-path/mask guard.
describe('dragging a clipped/masked element (event-select.js up handler)', () => {
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
    initClipMask(svgCanvas)
    up = initEventSelect(svgCanvas).up
  }

  // Simulate the mouseUp end of a drag: `elem`'s transform attribute is set
  // once (as event-select.js's move() would have left it mid-drag) to a lone
  // translate, then the real production `up` handler is driven directly.
  const finishDrag = (elem, dx, dy) => {
    elem.setAttribute('transform', `translate(${dx} ${dy})`)
    svgCanvas.selectOnly([elem], true)
    svgCanvas.dragStartTransforms = new Map([[elem, '']])
    svgCanvas.setCurrentMode('select')
    up({}, {
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

  it('keeps the drag as a transform= instead of baking it into x/y, and leaves the clip-path silhouette untouched', () => {
    const bottom = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'bottom', x: 10, y: 10, width: 100, height: 100, fill: '#00f' }
    })
    const top = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'top', x: 20, y: 20, width: 150, height: 150, fill: '#f00' }
    })
    svgCanvas.selectOnly([bottom, top], true)
    svgCanvas.setClip()

    const clipRef = top.getAttribute('clip-path')
    expect(clipRef).toMatch(/^url\(#/)
    const clipId = clipRef.replace(/^url\(["']?#/, '').replace(/["']?\)$/, '')
    const silhouette = document.getElementById(clipId).firstElementChild

    finishDrag(top, 200, 200)

    expect(top.getAttribute('x')).toBe('20')
    expect(top.getAttribute('y')).toBe('20')
    expect(top.getAttribute('transform')).toBeTruthy()
    expect(top.getAttribute('clip-path')).toBe(clipRef)

    // The static silhouette clone in <defs> must not have been touched.
    expect(silhouette.getAttribute('x')).toBe('10')
    expect(silhouette.getAttribute('y')).toBe('10')
  })

  it('same protection applies to mask', () => {
    const bottom = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'bottom-m', x: 10, y: 10, width: 100, height: 100, fill: '#00f' }
    })
    const top = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'top-m', x: 20, y: 20, width: 150, height: 150, fill: '#f00' }
    })
    svgCanvas.selectOnly([bottom, top], true)
    svgCanvas.setMask()

    const maskRef = top.getAttribute('mask')
    expect(maskRef).toMatch(/^url\(#/)

    finishDrag(top, 75, -30)

    expect(top.getAttribute('x')).toBe('20')
    expect(top.getAttribute('y')).toBe('20')
    expect(top.getAttribute('transform')).toBeTruthy()
    expect(top.getAttribute('mask')).toBe(maskRef)
  })

  it('control: dragging a plain element (no clip-path/mask) still bakes the move into x/y as before', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'plain', x: 20, y: 20, width: 150, height: 150, fill: '#f00' }
    })

    finishDrag(rect, 200, 200)

    expect(rect.getAttribute('x')).toBe('220')
    expect(rect.getAttribute('y')).toBe('220')
    expect(rect.getAttribute('transform')).toBeFalsy()
  })
})

// Regression test for a second bug found alongside the one above: setSvgString()'s
// "give ID to any visible layer children missing one" pass (svg-exec.js) walked
// content.children, which includes <defs> — so it reached into a clipPath/mask's
// silhouette clone (deliberately left id-less by clip-mask.js's stripIds(), since
// nothing is meant to reference it) and assigned it a stray id. Harmless in
// isolation, but it's an id-assignment pass leaking into a subtree it was never
// meant to touch. Confirmed via a double save/reload round-trip (the id is added
// on the load *after* the clip was created, since it's absent from the first save).
describe('setSvgString() id-assignment does not reach into <defs>', () => {
  let svgCanvas

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
    initClipMask(svgCanvas)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('leaves the clip-path silhouette clone id-less across repeated save/reload cycles', () => {
    const bottom = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'bottom', x: 10, y: 10, width: 100, height: 100, fill: '#00f' }
    })
    const top = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'top', x: 20, y: 20, width: 150, height: 150, fill: '#f00' }
    })
    svgCanvas.selectOnly([bottom, top], true)
    svgCanvas.setClip()

    // Save -> reload -> save -> reload, mirroring closing and reopening the
    // file (twice, since the original bug only showed up on the 2nd load).
    svgCanvas.setSvgString(svgCanvas.getSvgString())
    svgCanvas.setSvgString(svgCanvas.getSvgString())

    const clipPath = document.querySelector('clipPath')
    expect(clipPath).toBeTruthy()
    const silhouette = clipPath.firstElementChild
    expect(silhouette.hasAttribute('id')).toBe(false)
  })
})
