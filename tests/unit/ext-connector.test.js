import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extConnector from '../../src/editor/extensions/ext-connector/ext-connector.js'

describe('ext-connector', () => {
  let svgCanvas
  let svgEditor
  let svgContent
  let svgroot

  beforeEach(() => {
    svgContent = document.createElementNS(NS.SVG, 'svg')
    svgroot = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svgroot)

    svgCanvas = {
      getElement: vi.fn(),
      $id: vi.fn(() => null),
      addSVGElementsFromJson: vi.fn(),
      getEditorNS: () => 'http://svg-edit.googlecode.com',
      getSvgContent: () => svgContent,
      getDataStorage: () => ({ put: vi.fn(), get: vi.fn() }),
      groupSelectedElements: vi.fn(),
      moveSelectedElements: vi.fn(),
      getMode: () => 'select'
    }

    svgEditor = {
      svgCanvas,
      i18next: { t: (key) => key, addResourceBundle: vi.fn() },
      configObj: { pref: () => 'en' }
    }
  })

  afterEach(() => {
    document.body.textContent = ''
    vi.restoreAllMocks()
  })

  it('re-routes connectors for every changed element, not just the first', async () => {
    // Regression guard: elementChanged only ever looked at opts.elems[0].
    // After a multi-shape drag commit or multi-delete fires 'changed' with
    // several elements at once, every shape *after* the first silently kept
    // its bound connector line wherever it last was -- a real "object left
    // misplaced" bug for a diagram with several connected boxes.
    const seNs = 'http://svg-edit.googlecode.com'
    const boxA = document.createElementNS(NS.SVG, 'rect')
    boxA.id = 'boxA'
    const boxB = document.createElementNS(NS.SVG, 'rect')
    boxB.id = 'boxB'
    const lineA = document.createElementNS(NS.SVG, 'line')
    lineA.id = 'lineA'
    lineA.setAttributeNS(seNs, 'se:bind-start', 'boxA')
    const lineB = document.createElementNS(NS.SVG, 'line')
    lineB.id = 'lineB'
    lineB.setAttributeNS(seNs, 'se:bind-start', 'boxB')
    svgContent.append(boxA, boxB, lineA, lineB)

    svgCanvas.getElement = vi.fn((id) => svgContent.querySelector(`#${id}`))
    svgCanvas.$id = vi.fn((id) => svgContent.querySelector(`#${id}`))
    svgCanvas.getParents = vi.fn(() => [])
    svgCanvas.getStrokedBBox = vi.fn((elems) => {
      const el = elems[0]
      return { x: el === boxA ? 10 : 20, y: 0, width: 5, height: 5 }
    })
    const store = new Map()
    svgCanvas.getDataStorage = () => ({
      put: (el, key, val) => store.set(`${el.id}:${key}`, val),
      get: (el, key) => store.get(`${el.id}:${key}`),
      has: (el, key) => store.has(`${el.id}:${key}`)
    })

    const ext = await extConnector.init.call(svgEditor, { svgroot, selectorManager: {} })
    ext.elementChanged({ elems: [boxA, boxB] })

    expect(lineA.getAttribute('x1')).toBeTruthy()
    expect(lineB.getAttribute('x1')).toBeTruthy()
  })

  it('wires the idle-hover listener to the scoped workarea, not the first #workarea in the document', async () => {
    // Simulate a second, unrelated mounted editor whose #workarea is already
    // in the document -- a bare document.querySelector('#workarea') resolves
    // to this one regardless of which editor is calling in.
    const foreignWorkarea = document.createElement('div')
    foreignWorkarea.id = 'workarea'
    document.body.append(foreignWorkarea)
    const foreignListener = vi.spyOn(foreignWorkarea, 'addEventListener')

    const ownWorkarea = document.createElement('div')
    const ownListener = vi.spyOn(ownWorkarea, 'addEventListener')
    svgCanvas.$id.mockImplementation((id) => (id === 'workarea' ? ownWorkarea : null))

    const ext = await extConnector.init.call(svgEditor, { svgroot, selectorManager: {} })
    ext.callback()

    expect(ownListener).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(foreignListener).not.toHaveBeenCalled()
  })
})
