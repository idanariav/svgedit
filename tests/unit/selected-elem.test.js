import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

describe('selected-elem', () => {
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

  it('copies selection without requiring context menu DOM', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: {
        id: 'rect-copy',
        x: 10,
        y: 20,
        width: 30,
        height: 40
      }
    })

    svgCanvas.selectOnly([rect], true)

    expect(() => svgCanvas.copySelectedElements()).not.toThrow()

    const raw = sessionStorage.getItem(svgCanvas.getClipboardID())
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].element).toBe('rect')
    expect(parsed[0].attr.id).toBe('rect-copy')
  })

  it('dispatches a document-level event so other same-window editor instances can re-check clipboard state', () => {
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect-copy-event', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.selectOnly([rect], true)

    const listener = vi.fn()
    document.addEventListener('svgedit:clipboardchange', listener)
    try {
      svgCanvas.copySelectedElements()
    } finally {
      document.removeEventListener('svgedit:clipboardchange', listener)
    }

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('moves element to bottom even with whitespace/title/defs nodes', () => {
    const rect1 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: {
        id: 'rect-bottom-1',
        x: 10,
        y: 10,
        width: 10,
        height: 10
      }
    })
    const rect2 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: {
        id: 'rect-bottom-2',
        x: 30,
        y: 10,
        width: 10,
        height: 10
      }
    })

    const parent = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'move-bottom-container' }
    })
    parent.append(rect1, rect2)
    parent.insertBefore(document.createTextNode('\n'), parent.firstChild)
    const title = document.createElementNS(NS.SVG, 'title')
    title.textContent = 'Layer'
    parent.insertBefore(title, rect1)
    const defs = document.createElementNS(NS.SVG, 'defs')
    parent.insertBefore(defs, rect1)

    svgCanvas.selectOnly([rect2], true)
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    expect(() => svgCanvas.moveToBottomSelectedElement()).not.toThrow()
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)

    const order = Array.from(parent.childNodes)
      .filter((n) => n.nodeType === 1)
      .map((n) => (n.tagName === 'title' || n.tagName === 'defs') ? n.tagName : n.id)

    expect(order).toEqual(['title', 'defs', 'rect-bottom-2', 'rect-bottom-1'])
  })

  const layerOrder = () => {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    return Array.from(layer.children)
      .filter((n) => n.tagName !== 'title')
      .map((n) => n.id)
  }

  it('moves every selected element to the front, preserving their relative order, in one undo step', () => {
    const rect1 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'front-1', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'front-2', x: 20, y: 0, width: 10, height: 10 }
    })
    const rect3 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'front-3', x: 40, y: 0, width: 10, height: 10 }
    })

    svgCanvas.selectOnly([rect1, rect3], true)
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    svgCanvas.moveToTopSelectedElement()

    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)
    expect(layerOrder()).toEqual(['front-2', 'front-1', 'front-3'])

    svgCanvas.undoMgr.undo()
    expect(layerOrder()).toEqual(['front-1', 'front-2', 'front-3'])
  })

  it('moves every selected element to the back, preserving their relative order, in one undo step', () => {
    const rect1 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'back-1', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'back-2', x: 20, y: 0, width: 10, height: 10 }
    })
    const rect3 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'back-3', x: 40, y: 0, width: 10, height: 10 }
    })

    svgCanvas.selectOnly([rect1, rect3], true)
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    svgCanvas.moveToBottomSelectedElement()

    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)
    expect(layerOrder()).toEqual(['back-1', 'back-3', 'back-2'])

    svgCanvas.undoMgr.undo()
    expect(layerOrder()).toEqual(['back-1', 'back-2', 'back-3'])
  })

  it('moves an entire selected group (not just the group wrapper) to the front as one unit', () => {
    svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'group-front-outside', x: 0, y: 0, width: 10, height: 10 }
    })
    const group = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'group-front-group' }
    })
    const memberRect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'group-front-member', x: 0, y: 0, width: 5, height: 5 }
    })
    group.append(memberRect)

    svgCanvas.selectOnly([group], true)
    svgCanvas.moveToTopSelectedElement()

    expect(layerOrder()).toEqual(['group-front-outside', 'group-front-group'])
    expect(group.contains(memberRect)).toBe(true)
  })

  it('steps every selected element forward/backward, not just the first one selected', () => {
    // Three mutually overlapping rects stacked bottom-to-top: rect1, rect2, rect3.
    const rect1 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'step-1', x: 0, y: 0, width: 10, height: 10 }
    })
    svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'step-2', x: 0, y: 0, width: 10, height: 10 }
    })
    const rect3 = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'step-3', x: 0, y: 0, width: 10, height: 10 }
    })

    // Select the bottom (rect1) and top (rect3) elements, skipping rect2.
    svgCanvas.selectOnly([rect1, rect3], true)
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    // Send Backward: rect1 is already at the bottom of its overlap set (no-op),
    // but rect3 must step down past rect2 - which the old single-element
    // implementation (acting only on the bottommost selected element) missed
    // entirely.
    svgCanvas.moveUpDownSelected('Down')

    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)
    expect(layerOrder()).toEqual(['step-1', 'step-3', 'step-2'])
  })

  it('ungroups a <use> when it is the first element child', () => {
    const defs = svgCanvas.getSvgContent().querySelector('defs') ||
      svgCanvas.getSvgContent().appendChild(document.createElementNS(NS.SVG, 'defs'))

    const symbol = document.createElementNS(NS.SVG, 'symbol')
    symbol.id = 'symbol-test'
    const symRect = document.createElementNS(NS.SVG, 'rect')
    symRect.setAttribute('x', '10')
    symRect.setAttribute('y', '20')
    symRect.setAttribute('width', '30')
    symRect.setAttribute('height', '40')
    symbol.append(symRect)
    defs.append(symbol)

    const container = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'use-container' }
    })
    const use = svgCanvas.addSVGElementsFromJson({
      element: 'use',
      attr: { id: 'use-test', href: '#symbol-test' }
    })
    container.append(use)
    svgCanvas.setUseData(use)
    svgCanvas.selectOnly([use], true)

    expect(() => svgCanvas.ungroupSelectedElement()).not.toThrow()

    expect(container.querySelector('use')).toBeNull()
    const group = container.firstElementChild
    expect(group).toBeTruthy()
    expect(group.tagName).toBe('g')
    expect(group.querySelector('rect')).toBeTruthy()
  })

  it('does not crash ungrouping a <use> without href', () => {
    const use = svgCanvas.addSVGElementsFromJson({
      element: 'use',
      attr: { id: 'use-no-href' }
    })
    svgCanvas.selectOnly([use], true)

    const originalWarn = console.warn
    console.warn = () => {}
    try {
      expect(() => svgCanvas.ungroupSelectedElement()).not.toThrow()
    } finally {
      console.warn = originalWarn
    }
    expect(svgCanvas.getSvgContent().querySelector('#use-no-href')).toBeTruthy()
  })

  it('records an undoable step when ungrouping an embedded <svg> (gsvg)', () => {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    const nestedSvg = document.createElementNS(NS.SVG, 'svg')
    nestedSvg.setAttribute('x', '10')
    nestedSvg.setAttribute('y', '20')
    const wrapperG = document.createElementNS(NS.SVG, 'g')
    const rect = document.createElementNS(NS.SVG, 'rect')
    rect.setAttribute('id', 'gsvg-rect')
    rect.setAttribute('width', '5')
    rect.setAttribute('height', '5')
    wrapperG.append(rect)
    nestedSvg.append(wrapperG)
    layer.append(nestedSvg)

    svgCanvas.groupSvgElem(nestedSvg)
    const group = nestedSvg.parentNode
    expect(svgCanvas.getDataStorage().has(group, 'gsvg')).toBe(true)

    svgCanvas.selectOnly([group], true)
    const undoSize = svgCanvas.undoMgr.getUndoStackSize()

    svgCanvas.ungroupSelectedElement()

    // The unwrap actually happened: the wrapper <g> inside the nested <svg>
    // is gone, so the <rect> is now a direct child of it...
    expect(svgCanvas.getDataStorage().has(group, 'gsvg')).toBe(false)
    expect(group.getAttribute('transform')).toBe('matrix(1 0 0 1 10 20)')
    expect(nestedSvg.firstElementChild.tagName).toBe('rect')
    // ...and it was recorded so it can be undone.
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)

    svgCanvas.undoMgr.undo()

    // The DOM structure and transform revert (the in-memory 'gsvg' data-storage
    // flag is not part of the undo stack, same as every other data-storage tag
    // in this codebase, e.g. 'symbol').
    expect(group.getAttribute('transform')).toBeFalsy()
    expect(nestedSvg.firstElementChild.tagName).toBe('g')
    expect(nestedSvg.firstElementChild.firstElementChild.id).toBe('gsvg-rect')
  })

  it('duplicating an element inside a group produces an independent, ungrouped copy in the same visual spot', () => {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    const group = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'group-dup', transform: 'translate(50,60)' }
    })
    const rect = svgCanvas.addSVGElementsFromJson({
      element: 'rect',
      attr: { id: 'rect-in-group', x: 10, y: 20, width: 30, height: 40 }
    })
    group.append(rect)

    svgCanvas.selectOnly([rect], true)
    const originalBox = svgCanvas.getStrokedBBoxDefaultVisible([rect])

    svgCanvas.cloneSelectedElements(0, 0)

    const clone = svgCanvas.getSelectedElements()[0]
    expect(clone).toBeTruthy()
    expect(clone.id).not.toBe('rect-in-group')
    // The clone is independent — a direct child of the layer, not the group —
    // and the original group is untouched.
    expect(clone.parentNode).toBe(layer)
    expect(group.children).toHaveLength(1)
    expect(group.firstElementChild).toBe(rect)

    // Detaching from the group's transform must not move the clone visually.
    const cloneBox = svgCanvas.getStrokedBBoxDefaultVisible([clone])
    expect(cloneBox.x).toBeCloseTo(originalBox.x)
    expect(cloneBox.y).toBeCloseTo(originalBox.y)
    expect(cloneBox.width).toBeCloseTo(originalBox.width)
    expect(cloneBox.height).toBeCloseTo(originalBox.height)
  })

  it('duplicating an element inside nested groups fully detaches it to the layer', () => {
    const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    const outer = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: 'group-outer', transform: 'translate(20,0)' }
    })
    const inner = document.createElementNS(NS.SVG, 'g')
    inner.setAttribute('id', 'group-inner')
    inner.setAttribute('transform', 'translate(0,30)')
    outer.append(inner)
    const rect = document.createElementNS(NS.SVG, 'rect')
    rect.setAttribute('id', 'rect-in-nested-group')
    rect.setAttribute('x', '5')
    rect.setAttribute('y', '5')
    rect.setAttribute('width', '10')
    rect.setAttribute('height', '10')
    inner.append(rect)

    svgCanvas.selectOnly([rect], true)
    const originalBox = svgCanvas.getStrokedBBoxDefaultVisible([rect])

    svgCanvas.cloneSelectedElements(0, 0)

    const clone = svgCanvas.getSelectedElements()[0]
    expect(clone.parentNode).toBe(layer)

    const cloneBox = svgCanvas.getStrokedBBoxDefaultVisible([clone])
    expect(cloneBox.x).toBeCloseTo(originalBox.x)
    expect(cloneBox.y).toBeCloseTo(originalBox.y)
  })
})
