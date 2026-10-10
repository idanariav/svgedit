import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extCurvature from '../../src/editor/extensions/ext-curvature/ext-curvature.js'

describe('ext-curvature', () => {
  let svgCanvas
  let svgEditor
  let tool
  let layer

  beforeEach(async () => {
    layer = document.createElementNS(NS.SVG, 'g')
    document.body.append(layer)

    svgCanvas = {
      $id: vi.fn(),
      registerTool: vi.fn((def) => { tool = def }),
      insertChildAtIndex: vi.fn(),
      getMode: () => 'curvature',
      getCurrentDrawing: () => ({ getCurrentLayer: () => layer }),
      getZoom: () => 1,
      getColor: () => '#000',
      getStrokeWidth: () => 1,
      getNextId: () => 'path1',
      getCurShape: () => ({ opacity: 1 }),
      addSVGElementsFromJson: vi.fn((opts) => {
        const el = document.createElementNS(NS.SVG, opts.element)
        for (const [k, v] of Object.entries(opts.attr)) el.setAttribute(k, v)
        layer.append(el)
        return el
      }),
      history: { InsertElementCommand: class {} },
      undoMgr: { addCommandToHistory: vi.fn() }
    }

    svgEditor = {
      svgCanvas,
      listenerAbort: new AbortController(),
      leftPanel: { clickSelect: vi.fn(), updateLeftPanel: vi.fn(() => true) },
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() }
    }

    await extCurvature.init.call(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  // Document-space events, as the tool registry hands them out.
  const ctx = {}
  const ev = (x, y, { detail = 1, shift = false, alt = false } = {}) =>
    ({ x, y, rawX: x, rawY: y, mods: { shift, alt }, event: { detail } })
  const down = (x, y, opts) => tool.pointerDown(ctx, ev(x, y, opts))
  const up = (x, y) => tool.pointerUp(ctx, ev(x, y))
  const click = (x, y, opts) => { down(x, y, opts); up(x, y) }

  it('switching tools mid-session cleans up the preview and anchor dots instead of leaving them in the layer', () => {
    click(10, 10)
    click(50, 10)

    expect(layer.querySelector('#curvature_preview')).not.toBeNull()
    expect(layer.querySelectorAll('circle').length).toBe(2)

    // Regression guard: switching tools used to leave the dashed preview path
    // and anchor-dot circles behind as real layer content -- getSvgString()
    // would then serialize them and a host autosave would persist them into
    // the drawing.
    document.dispatchEvent(new CustomEvent('modeChange', { detail: { getMode: () => 'select' } }))

    expect(layer.querySelector('#curvature_preview')).toBeNull()
    expect(layer.querySelectorAll('circle').length).toBe(0)
  })

  it('finalizes the in-progress path (mirrors Escape) rather than discarding it on tool switch', () => {
    click(10, 10)
    click(50, 10)

    document.dispatchEvent(new CustomEvent('modeChange', { detail: { getMode: () => 'select' } }))

    expect(svgCanvas.addSVGElementsFromJson).toHaveBeenCalledTimes(1)
    expect(svgCanvas.undoMgr.addCommandToHistory).toHaveBeenCalledTimes(1)
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
  })

  it('a mode change to curvature itself (e.g. re-selecting the tool) does not finalize an idle session', () => {
    document.dispatchEvent(new CustomEvent('modeChange', { detail: { getMode: () => 'curvature' } }))

    expect(svgCanvas.addSVGElementsFromJson).not.toHaveBeenCalled()
  })

  it('hovers: the tentative segment follows the pointer between clicks', () => {
    expect(tool.id).toBe('curvature')
    expect(tool.wantsHover).toBe(true)
    click(10, 10)
    tool.pointerMove(ctx, ev(80, 40))
    expect(layer.querySelector('#curvature_preview').getAttribute('d')).toContain('80,40')
  })

  it('the preview and anchor dots are ephemeral scaffolding (not recorded, not saved)', () => {
    click(10, 10)
    expect(layer.querySelector('#curvature_preview').hasAttribute('data-se-ephemeral')).toBe(true)
    expect(layer.querySelector('circle').hasAttribute('data-se-ephemeral')).toBe(true)
  })

  it('a double-click finalizes on release (finishing switches tool, which would cancel the gesture)', () => {
    click(10, 10)
    click(50, 10)
    down(50, 10, { detail: 2 })
    expect(svgCanvas.addSVGElementsFromJson).not.toHaveBeenCalled()
    expect(svgEditor.leftPanel.clickSelect).not.toHaveBeenCalled()
    up(50, 10)
    expect(svgCanvas.addSVGElementsFromJson).toHaveBeenCalledTimes(1)
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
    expect(layer.querySelector('#curvature_preview')).toBeNull()
  })

  it('clicking the start anchor again closes the path', () => {
    click(10, 10)
    click(60, 10)
    click(60, 60)
    click(10, 10) // back on the first anchor, no drag
    const path = [...layer.querySelectorAll('path')].find((p) => p.id !== 'curvature_preview')
    expect(path.getAttribute('d')).toMatch(/Z\s*$/i)
  })
})
