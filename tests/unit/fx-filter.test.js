import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { createFxComposer } from '../../src/editor/extensions/fx-filter.js'

describe('fx-filter', () => {
  let svgCanvas
  let fx

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
  }

  beforeEach(() => {
    createSvgCanvas()
    fx = createFxComposer(svgCanvas)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  const addRect = (id, attrs = {}) =>
    svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id, x: 10, y: 10, width: 20, height: 20, ...attrs }
    })

  it('marks a freshly built filter with the data-fx ownership attribute', () => {
    const rect = addRect('rect1')
    const batchCmd = new svgCanvas.history.BatchCommand('fx')
    fx.writeEffects(rect, { outline: null, shadow: { dx: 4, dy: 4, blur: 2, color: '#000', opacity: 0.5 } }, batchCmd)

    const filter = svgCanvas.getElement(/url\(#([^)]+)\)/.exec(rect.getAttribute('filter'))[1])
    expect(filter.getAttribute('data-fx')).toBe('1')
  })

  it('refreshes the region of a filter cloned onto a duplicate, even though its id no longer matches the element', () => {
    const rect = addRect('rect1')
    const batchCmd = new svgCanvas.history.BatchCommand('fx')
    fx.writeEffects(rect, { outline: null, shadow: { dx: 4, dy: 4, blur: 2, color: '#000', opacity: 0.5 } }, batchCmd)

    // Simulate what cloneSelectedElements now does: clone the filter onto a
    // duplicate element under a fresh id that does NOT follow the
    // `${elemId}_fx` convention (mirrors remapElementIdsAndRefs's plain
    // getNextId() scheme), then move the duplicate elsewhere.
    const dupe = addRect('rect2', { x: 200, y: 200 })
    const origFilter = svgCanvas.getElement(/url\(#([^)]+)\)/.exec(rect.getAttribute('filter'))[1])
    const clonedFilter = origFilter.cloneNode(true)
    clonedFilter.id = 'svg_99'
    svgCanvas.findDefs().append(clonedFilter)
    dupe.setAttribute('filter', 'url(#svg_99)')

    fx.refreshRegion(dupe)

    // Missing stroke-width defaults to the SVG initial value of 1 (see
    // fx-filter's setRegion), contributing sw/2 = 0.5 to the pad.
    const pad = 0.5 + Math.hypot(4, 4) + 2 * 3
    const bbox = dupe.getBBox()
    expect(Number(clonedFilter.getAttribute('x'))).toBeCloseTo(bbox.x - pad)
    expect(Number(clonedFilter.getAttribute('y'))).toBeCloseTo(bbox.y - pad)
  })

  it('does not refresh the region of a filter the element does not own', () => {
    const rect = addRect('rect1')
    const foreignFilter = svgCanvas.addSVGElementsFromJson({
      element: 'filter',
      attr: { id: 'foreign-filter' },
      children: [{ element: 'feGaussianBlur', attr: { stdDeviation: 3 } }]
    })
    svgCanvas.findDefs().append(foreignFilter)
    rect.setAttribute('filter', 'url(#foreign-filter)')
    foreignFilter.setAttribute('x', '-999')

    fx.refreshRegion(rect)

    expect(foreignFilter.getAttribute('x')).toBe('-999')
  })

  it('still recognizes a legacy filter (no data-fx marker) via its id suffix', () => {
    const rect = addRect('rect1')
    const legacyFilter = svgCanvas.addSVGElementsFromJson({
      element: 'filter',
      attr: { id: 'rect1_shadow' },
      children: [{ element: 'feDropShadow', attr: { dx: 4, dy: 4, stdDeviation: 2 } }]
    })
    svgCanvas.findDefs().append(legacyFilter)
    rect.setAttribute('filter', 'url(#rect1_shadow)')

    fx.refreshRegion(rect)

    const pad = 0.5 + Math.hypot(4, 4) + 2 * 3
    const bbox = rect.getBBox()
    expect(Number(legacyFilter.getAttribute('x'))).toBeCloseTo(bbox.x - pad)
  })

  it('convertDropShadowFilters (run on load) retrofits the data-fx marker onto legacy filters', () => {
    const rect = addRect('rect1')
    const legacyFilter = svgCanvas.addSVGElementsFromJson({
      element: 'filter',
      attr: { id: 'rect1_shadow' },
      children: [{ element: 'feDropShadow', attr: { dx: 4, dy: 4, stdDeviation: 2 } }]
    })
    svgCanvas.findDefs().append(legacyFilter)
    rect.setAttribute('filter', 'url(#rect1_shadow)')

    expect(legacyFilter.hasAttribute('data-fx')).toBe(false)
    svgCanvas.convertDropShadowFilters(svgCanvas.getSvgContent())
    expect(legacyFilter.getAttribute('data-fx')).toBe('1')
  })
})
