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
