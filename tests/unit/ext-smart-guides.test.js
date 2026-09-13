import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { assignAttributes } from '../../packages/svgcanvas/core/dom-utils.js'
import extSmartGuides from '../../src/editor/extensions/ext-smart-guides/ext-smart-guides.js'

describe('ext-smart-guides', () => {
  let svgCanvas
  let svgEditor
  let svgroot
  let svgcontentEl
  let editorPanel

  const overlay = () => svgroot.querySelector('#smartGuides')

  beforeEach(async () => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    svgroot = document.createElementNS(NS.SVG, 'svg')
    svgroot.id = 'svgroot'
    document.getElementById('svgcanvas').append(svgroot)

    svgcontentEl = document.createElementNS(NS.SVG, 'svg')
    svgcontentEl.id = 'svgcontent'
    assignAttributes(svgcontentEl, { x: 0, y: 0, width: 640, height: 480 })

    editorPanel = document.createElement('div')
    editorPanel.id = 'editor_panel'
    document.body.append(editorPanel)

    svgCanvas = {
      $id: vi.fn((id) => document.getElementById(id)),
      NS,
      assignAttributes,
      getCurConfig: vi.fn(() => ({})),
      getSvgRoot: vi.fn(() => svgroot),
      getSvgContent: vi.fn(() => svgcontentEl),
      getZoom: vi.fn(() => 1)
    }

    svgEditor = {
      svgCanvas,
      configObj: { pref: vi.fn(() => 'en') },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() }
    }

    const extInstance = await extSmartGuides.init.call(svgEditor)
    extInstance.callback.call(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
    vi.restoreAllMocks()
  })

  describe('showPathNodeGuides', () => {
    it('clears the overlay when there is no match', () => {
      svgCanvas.showPathNodeGuides({ x: null, y: null, from: { x: 5, y: 5 } })
      expect(overlay().children.length).toBe(0)

      svgCanvas.showPathNodeGuides(null)
      expect(overlay().children.length).toBe(0)
    })

    it('draws a guide line and a ring around the exact target node', () => {
      svgCanvas.showPathNodeGuides({
        x: { pos: 50, target: { x: 50, y: 50, index: 1 } },
        y: null,
        from: { x: 50, y: 10 }
      })

      const lines = overlay().querySelectorAll('line')
      const rings = overlay().querySelectorAll('circle')
      expect(lines.length).toBe(1)
      expect(rings.length).toBe(1)

      const ring = rings[0]
      expect(ring.getAttribute('cx')).toBe('50')
      expect(ring.getAttribute('cy')).toBe('50')
      expect(ring.getAttribute('fill')).toBe('none')
    })

    it('draws one ring per distinct target node when x and y snap to different nodes', () => {
      svgCanvas.showPathNodeGuides({
        x: { pos: 50, target: { x: 50, y: 50, index: 1 } },
        y: { pos: 10, target: { x: 10, y: 10, index: 0 } },
        from: { x: 52, y: 10 }
      })

      expect(overlay().querySelectorAll('line').length).toBe(2)
      expect(overlay().querySelectorAll('circle').length).toBe(2)
    })

    it('draws a single ring when x and y both snap to the same target node', () => {
      const target = { x: 50, y: 50, index: 1 }
      svgCanvas.showPathNodeGuides({
        x: { pos: 50, target },
        y: { pos: 50, target },
        from: { x: 52, y: 52 }
      })

      expect(overlay().querySelectorAll('circle').length).toBe(1)
    })
  })
})
