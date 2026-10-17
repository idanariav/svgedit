import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import * as history from '../../packages/svgcanvas/core/history.js'
import dataStorage from '../../packages/svgcanvas/core/dataStorage.ts'
import { createElemGetSet as initElemGetSet } from '../../packages/svgcanvas/core/elem-get-set.ts'
import * as undo from '../../packages/svgcanvas/core/undo.ts'
import { attachUnits } from './unitsMock.js'

const createSvgElement = (name) => {
  return document.createElementNS(NS.SVG, name)
}

describe('elem-get-set', () => {
  /** @type {any} */
  let canvas
  /** @type {any[]} */
  let historyStack
  /** @type {SVGSVGElement} */
  let svgContent

  beforeEach(() => {
    historyStack = []
    svgContent = /** @type {SVGSVGElement} */ (createSvgElement('svg'))
    canvas = {
      history,
      zoom: 1,
      contentW: 100,
      contentH: 100,
      selectorManager: {
        requestSelector () {
          return { resize () {} }
        }
      },
      pathActions: {
        zoomChange () {},
        clear () {}
      },
      runExtensions () {},
      call: vi.fn(),
      changeSelectedAttribute: vi.fn(),
      getDOMDocument () { return document },
      getSvgContent () { return svgContent },
      getCurrentMode () { return 'select' },
      getPathObj () { return null },
      getSelectedElements () { return this.selectedElements || [] },
      getDataStorage () { return dataStorage },
      getZoom () { return this.zoom },
      setZoom (value) { this.zoom = value },
      getResolution () {
        return {
          w: Number(svgContent.getAttribute('width')) / this.zoom,
          h: Number(svgContent.getAttribute('height')) / this.zoom,
          zoom: this.zoom
        }
      },
      addCommandToHistory (cmd) {
        historyStack.push(cmd)
      },
      setCurText () {},
      textActions: {
        setCursor () {}
      }
    }
    svgContent.setAttribute('width', '100')
    svgContent.setAttribute('height', '100')
    attachUnits(canvas)
    Object.assign(canvas, initElemGetSet(canvas))
  })

  afterEach(() => {
    while (svgContent.firstChild) {
      svgContent.firstChild.remove()
    }
  })

  it('setGroupTitle() inserts a title and records one step', () => {
    const g = createSvgElement('g')
    svgContent.append(g)
    canvas.selectedElements = [g]

    canvas.setGroupTitle('Hello')
    expect(g.firstChild?.nodeName).toBe('title')
    expect(g.firstChild?.textContent).toBe('Hello')
    expect(historyStack).toHaveLength(1)
  })

  it('setGroupTitle() updates the title text and records one step', () => {
    const g = createSvgElement('g')
    const title = createSvgElement('title')
    title.textContent = 'Old'
    g.append(title)
    svgContent.append(g)
    canvas.selectedElements = [g]

    canvas.setGroupTitle('New')
    expect(g.querySelector('title')?.textContent).toBe('New')
    expect(historyStack).toHaveLength(1)
  })

  it('setGroupTitle() removes the title and records one step', () => {
    const g = createSvgElement('g')
    const title = createSvgElement('title')
    title.textContent = 'Label'
    g.append(title)
    svgContent.append(g)
    canvas.selectedElements = [g]

    canvas.setGroupTitle('')
    expect(g.querySelector('title')).toBeNull()
    expect(historyStack).toHaveLength(1)
  })

  it('setDocumentTitle() inserts the title and records one step', () => {
    canvas.setDocumentTitle('Doc')
    const docTitle = svgContent.querySelector(':scope > title')
    expect(docTitle?.textContent).toBe('Doc')
    expect(historyStack).toHaveLength(1)
  })

  it('setDocumentTitle() does nothing when empty and no title exists', () => {
    canvas.setDocumentTitle('')
    expect(svgContent.querySelector(':scope > title')).toBeNull()
    expect(historyStack).toHaveLength(0)
  })

  it('setBBoxZoom() returns the computed zoom for zero-size bbox', () => {
    canvas.zoom = 1
    canvas.selectedElements = [createSvgElement('rect')]

    const bbox = { width: 0, height: 0, x: 0, y: 0, factor: 2 }
    const result = canvas.setBBoxZoom(bbox, 100, 100)

    expect(result?.zoom).toBe(2)
    expect(canvas.getZoom()).toBe(2)
  })

  it('setImageURL() records a step even when the image fails to load', () => {
    const originalImage = globalThis.Image
    try {
      globalThis.Image = class FakeImage {
        constructor () {
          this.width = 10
          this.height = 10
          this.onload = null
          this.onerror = null
        }

        get src () {
          return this._src
        }

        set src (value) {
          this._src = value
          this.onerror && this.onerror(new Error('load failed'))
        }
      }

      const image = createSvgElement('image')
      image.setAttribute('href', 'old.png')
      svgContent.append(image)
      canvas.selectedElements = [image]

      canvas.setImageURL('bad.png')
      expect(image.getAttribute('href')).toBe('bad.png')
      expect(historyStack).toHaveLength(1)
    } finally {
      globalThis.Image = originalImage
    }
  })

  it('setRectRadius() sets rx and ry and records one step', () => {
    const rect = createSvgElement('rect')
    svgContent.append(rect)
    canvas.selectedElements = [rect]

    canvas.setRectRadius('5')
    expect(rect.getAttribute('rx')).toBe('5')
    expect(rect.getAttribute('ry')).toBe('5')
    expect(historyStack).toHaveLength(1)
  })

  it('undo and redo of a document size change update contentW/contentH (the document size is the viewBox)', () => {
    const svg = createSvgElement('svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    const root = createSvgElement('svg')
    root.setAttribute('width', '800')
    root.setAttribute('height', '600')

    const localCanvas = {
      contentW: 100,
      contentH: 100,
      getSvgContent () { return svg },
      getSvgRoot () { return root },
      updateCanvas: vi.fn(),
      clearSelection () {},
      getCurrentMode () { return 'select' },
      getPathObj () { return null },
      pathActions: { clear () {} },
      restoreRefElements () {},
      identifyLayers () {},
      inTransaction: () => false,
      destroyAbort: new AbortController(),
      call () {}
    }
    Object.assign(localCanvas, undo.createUndo(localCanvas))
    localCanvas.undoMgr.resetUndoStack()
    svg.setAttribute('viewBox', '0 0 200 150')
    localCanvas.contentW = 200
    localCanvas.contentH = 150
    localCanvas.undoMgr.addCommandToHistory(new history.ChangeElementCommand(svg, { viewBox: '0 0 100 100' }))

    localCanvas.undoMgr.undo()
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100')
    expect(localCanvas.contentW).toBe(100)
    expect(localCanvas.contentH).toBe(100)
    expect(localCanvas.updateCanvas).toHaveBeenCalledWith(800, 600)

    localCanvas.undoMgr.redo()
    expect(localCanvas.contentW).toBe(200)
    expect(localCanvas.contentH).toBe(150)
  })
  it('setBold() emits changed only for modified text elements', () => {
    const text = createSvgElement('text')
    text.textContent = 'Hello'
    const rect = createSvgElement('rect')
    svgContent.append(text, rect)
    canvas.selectedElements = [text, rect]

    canvas.setBold(true)

    expect(canvas.changeSelectedAttribute).toHaveBeenCalledWith('font-weight', 'bold', [text])
    expect(canvas.call).toHaveBeenCalledWith('changed', [text])
  })

  it('setBold() skips changed event for no-op text updates', () => {
    const text = createSvgElement('text')
    text.textContent = 'Hello'
    text.setAttribute('font-weight', 'bold')
    svgContent.append(text)
    canvas.selectedElements = [text]

    canvas.setBold(true)

    expect(canvas.changeSelectedAttribute).not.toHaveBeenCalled()
    expect(canvas.call).not.toHaveBeenCalled()
  })

  it('setFontColor() ignores non-text selections when emitting changed', () => {
    const text = createSvgElement('text')
    text.textContent = 'Hello'
    const rect = createSvgElement('rect')
    svgContent.append(text, rect)
    canvas.selectedElements = [text, rect]

    canvas.setFontColor('#f00')

    expect(canvas.changeSelectedAttribute).toHaveBeenCalledWith('fill', '#f00', [text])
    expect(canvas.call).toHaveBeenCalledWith('changed', [text])
  })

  it('setColor() leaves opacity untouched', () => {
    const rect = createSvgElement('rect')
    rect.setAttribute('fill', '#0000ff')
    rect.setAttribute('fill-opacity', '0.5')
    svgContent.append(rect)

    const localCanvas = {
      zoom: 1,
      selectedElements: [rect],
      getSelectedElements () { return this.selectedElements },
      getZoom () { return this.zoom },
      getCurrentMode () { return 'select' },
      getPathObj () { return null },
      clearSelection () {},
      pathActions: { clear () {} },
      restoreRefElements () {},
      call () {},
      setCurShape () {},
      setCurProperties () {},
      getSvgContent () { return svgContent },
      inTransaction: () => false,
      destroyAbort: new AbortController()
    }
    attachUnits(localCanvas)
    Object.assign(localCanvas, undo.createUndo(localCanvas))
    Object.assign(localCanvas, initElemGetSet(localCanvas))
    localCanvas.undoMgr.resetUndoStack() // the rect was made outside any command
    localCanvas.setColor('fill', '#ff0000')

    expect(rect.getAttribute('fill')).toBe('#ff0000')
    expect(rect.getAttribute('fill-opacity')).toBe('0.5')
    expect(localCanvas.undoMgr.getUndoStackSize()).toBe(1)

    localCanvas.undoMgr.undo()
    expect(rect.getAttribute('fill')).toBe('#0000ff')
    expect(rect.getAttribute('fill-opacity')).toBe('0.5')
  })
})
