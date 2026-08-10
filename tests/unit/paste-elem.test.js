import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

describe('paste-elem', () => {
  let svgCanvas

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
      initFill: {
        color: 'FF0000',
        opacity: 1
      },
      initStroke: {
        width: 5,
        color: '000000',
        opacity: 1
      },
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
    sessionStorage.clear()
  })

  afterEach(() => {
    document.body.textContent = ''
    sessionStorage.clear()
  })

  it('pastes copied elements and assigns new IDs', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: {
        id: 'rect-original',
        x: 10,
        y: 20,
        width: 30,
        height: 40
      }
    })

    svgCanvas.selectOnly([rect], true)
    svgCanvas.copySelectedElements()

    const undoSize = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.pasteElements('in_place')

    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)
    const pasted = svgCanvas.getSelectedElements()[0]
    expect(pasted).toBeTruthy()
    expect(pasted.tagName).toBe('rect')
    expect(pasted.id).not.toBe('rect-original')

    expect(svgCanvas.getSvgContent().querySelector('#rect-original')).toBeTruthy()
    expect(svgCanvas.getSvgContent().querySelector('#' + pasted.id)).toBe(pasted)
  })

  it('remaps internal url(#id) references when pasting', () => {
    const group = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'group-original' }
    })

    const defs = document.createElementNS(NS.SVG, 'defs')
    const gradient = document.createElementNS(NS.SVG, 'linearGradient')
    gradient.id = 'grad-original'
    const stop = document.createElementNS(NS.SVG, 'stop')
    stop.setAttribute('offset', '0%')
    stop.setAttribute('stop-color', '#000')
    gradient.append(stop)
    defs.append(gradient)

    const rect = document.createElementNS(NS.SVG, 'rect')
    rect.id = 'rect-with-fill'
    rect.setAttribute('x', '0')
    rect.setAttribute('y', '0')
    rect.setAttribute('width', '10')
    rect.setAttribute('height', '10')
    rect.setAttribute('fill', 'url(#grad-original)')
    group.append(defs, rect)

    svgCanvas.selectOnly([group], true)
    svgCanvas.copySelectedElements()
    svgCanvas.pasteElements('in_place')

    const pastedGroup = svgCanvas.getSelectedElements()[0]
    const pastedGradient = pastedGroup.querySelector('linearGradient')
    const pastedRect = pastedGroup.querySelector('rect')

    expect(pastedGradient).toBeTruthy()
    expect(pastedRect).toBeTruthy()
    expect(pastedGradient.id).not.toBe('grad-original')
    expect(pastedRect.getAttribute('fill')).toBe('url(#' + pastedGradient.id + ')')
  })

  it('does not throw on invalid clipboard JSON', () => {
    sessionStorage.setItem(svgCanvas.getClipboardID(), 'not-json')
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    expect(() => svgCanvas.pasteElements('in_place')).not.toThrow()
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize)
  })

  it('does not throw on empty clipboard', () => {
    sessionStorage.setItem(svgCanvas.getClipboardID(), '[]')
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    expect(() => svgCanvas.pasteElements('in_place')).not.toThrow()
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize)
  })

  it('cascades repeated pastes at the same point like the Duplicate button', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect-cascade', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.selectOnly([rect], true)
    svgCanvas.copySelectedElements()

    svgCanvas.pasteElements('point', 100, 100)
    const first = svgCanvas.getSelectedElements()[0].getBBox()

    svgCanvas.pasteElements('point', 100, 100)
    const second = svgCanvas.getSelectedElements()[0].getBBox()

    svgCanvas.pasteElements('point', 100, 100)
    const third = svgCanvas.getSelectedElements()[0].getBBox()

    expect(second.x).toBeCloseTo(first.x + 20)
    expect(second.y).toBeCloseTo(first.y + 20)
    expect(third.x).toBeCloseTo(first.x + 40)
    expect(third.y).toBeCloseTo(first.y + 40)
  })

  it('resets the paste cascade after a fresh copy or a paste-in-place', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect-reset', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.selectOnly([rect], true)
    svgCanvas.copySelectedElements()

    svgCanvas.pasteElements('point', 100, 100)
    const first = svgCanvas.getSelectedElements()[0].getBBox()

    svgCanvas.pasteElements('in_place')
    svgCanvas.copySelectedElements()

    svgCanvas.pasteElements('point', 100, 100)
    const afterReset = svgCanvas.getSelectedElements()[0].getBBox()

    expect(afterReset.x).toBeCloseTo(first.x)
    expect(afterReset.y).toBeCloseTo(first.y)
  })

  it('pastes an explicit data array instead of the stale sessionStorage snapshot', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect-stale', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.selectOnly([rect], true)
    svgCanvas.copySelectedElements() // writes rect-stale into sessionStorage

    const freshData = [{
      element: 'ellipse',
      attr: { id: 'ellipse-fresh', cx: 5, cy: 5, rx: 5, ry: 5 }
    }]
    svgCanvas.pasteElements('in_place', undefined, undefined, freshData)

    const pasted = svgCanvas.getSelectedElements()[0]
    expect(pasted.tagName).toBe('ellipse')
    expect(pasted.id).not.toBe('ellipse-fresh') // still gets a fresh id via checkIDs
  })

  it('pastes an independent, ungrouped copy even while isolated inside a group', () => {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect-to-copy', x: 10, y: 20, width: 30, height: 40 }
    })
    svgCanvas.selectOnly([rect], true)
    svgCanvas.copySelectedElements()
    const originalBox = svgCanvas.getStrokedBBoxDefaultVisible([rect])

    const group = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'group-isolated', transform: 'translate(100,150)' }
    })
    svgCanvas.setContext(group) // enter isolation mode, as a double-click would

    svgCanvas.pasteElements('in_place')

    expect(svgCanvas.getCurrentGroup()).toBe(group)
    const pasted = svgCanvas.getSelectedElements()[0]
    expect(pasted).toBeTruthy()
    // Independent of the isolated group — a direct child of the layer.
    expect(pasted.parentNode).toBe(layer)
    expect(group.children).toHaveLength(0)

    // Baking in the group's transform keeps it in the same visual spot.
    const pastedBox = svgCanvas.getStrokedBBoxDefaultVisible([pasted])
    expect(pastedBox.x).toBeCloseTo(originalBox.x)
    expect(pastedBox.y).toBeCloseTo(originalBox.y)
  })
})
