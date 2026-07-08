import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extCutter from '../../src/editor/extensions/ext-cutter/ext-cutter.js'

describe('ext-cutter', () => {
  let svgCanvas
  let svgContent
  let svgEditor
  let extInstance

  beforeEach(async () => {
    svgContent = document.createElementNS(NS.SVG, 'svg')
    svgContent.id = 'svgcontent'
    document.body.append(svgContent)

    svgCanvas = {
      $id: vi.fn(),
      $click: vi.fn(),
      getZoom: () => 1,
      getSvgContent: () => svgContent,
      getMode: () => 'cutter',
      setMode: vi.fn(),
      insertChildAtIndex: vi.fn(),
      cutShapes: vi.fn()
    }

    svgEditor = {
      svgCanvas,
      leftPanel: { clickSelect: vi.fn(), updateLeftPanel: vi.fn(() => true) },
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() }
    }

    extInstance = await extCutter.init.call(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('does not snap the preview line when shift is not held', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: false } })

    const line = svgContent.querySelector('#cutter_preview_line')
    expect(Number(line.getAttribute('x2'))).toBeCloseTo(250)
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(110)
  })

  it('snaps the preview line to the nearest 15-degree angle when shift is held', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: true } })

    const line = svgContent.querySelector('#cutter_preview_line')
    // Nearly horizontal drag snaps flat onto the 0-degree line from the start point.
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(100)
    expect(Number(line.getAttribute('x2'))).toBeGreaterThan(100)
  })

  it('cuts along the snapped endpoint when shift is held on mouseUp', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: true } })
    extInstance.mouseUp({ mouse_x: 250, mouse_y: 110, event: { shiftKey: true } })

    expect(svgCanvas.cutShapes).toHaveBeenCalledTimes(1)
    const [x1, y1, x2, y2] = svgCanvas.cutShapes.mock.calls[0]
    expect(x1).toBe(100)
    expect(y1).toBe(100)
    expect(y2).toBeCloseTo(100)
    expect(x2).toBeGreaterThan(100)
  })
})
