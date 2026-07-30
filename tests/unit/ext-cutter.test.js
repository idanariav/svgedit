import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extCutter from '../../src/editor/extensions/ext-cutter/ext-cutter.js'

describe('ext-cutter', () => {
  let svgCanvas
  let svgContent
  let svgEditor
  let extInstance
  let workarea
  let origSetModeMock

  const click = (x, y) => {
    extInstance.mouseDown({ start_x: x, start_y: y })
    extInstance.mouseUp({ mouse_x: x, mouse_y: y, event: {} })
  }

  const previewD = () => svgContent.querySelector('#cutter_preview_line')?.getAttribute('d')

  beforeEach(async () => {
    svgContent = document.createElementNS(NS.SVG, 'svg')
    svgContent.id = 'svgcontent'
    document.body.append(svgContent)
    workarea = document.createElement('div')
    document.body.append(workarea)

    origSetModeMock = vi.fn()
    svgCanvas = {
      $id: vi.fn(),
      $click: vi.fn(),
      getZoom: () => 1,
      getSvgContent: () => svgContent,
      getMode: () => 'cutter',
      setMode: origSetModeMock,
      insertChildAtIndex: vi.fn(),
      cutShapes: vi.fn(),
      getSelectedElements: vi.fn(() => []),
      clearSelection: vi.fn(),
      selectOnly: vi.fn()
    }

    svgEditor = {
      svgCanvas,
      workarea,
      leftPanel: { clickSelect: vi.fn(), updateLeftPanel: vi.fn(() => true) },
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() }
    }

    extInstance = await extCutter.init.call(svgEditor)
    extInstance.callback()
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('does not snap the preview line when shift is not held', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: false } })

    expect(previewD()).toBe('M100,100 L250,110')
  })

  it('snaps the preview line to the nearest 15-degree angle when shift is held', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: true } })

    // Nearly horizontal drag snaps flat onto the 0-degree line from the start point.
    const d = previewD()
    expect(d).toMatch(/^M100,100 L\d/)
    expect(d).toMatch(/,100$/)
  })

  it('performs an instant straight cut on a plain drag (legacy behavior)', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: false } })
    extInstance.mouseUp({ mouse_x: 250, mouse_y: 110, event: { shiftKey: false } })

    expect(svgCanvas.cutShapes).toHaveBeenCalledTimes(1)
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 250, y: 110 }
    ])
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
    expect(svgContent.querySelector('#cutter_preview_line')).toBeNull()
  })

  it('cuts along the snapped endpoint when shift is held on a drag', () => {
    extInstance.mouseDown({ start_x: 100, start_y: 100 })
    extInstance.mouseMove({ mouse_x: 250, mouse_y: 110, event: { shiftKey: true } })
    extInstance.mouseUp({ mouse_x: 250, mouse_y: 110, event: { shiftKey: true } })

    expect(svgCanvas.cutShapes).toHaveBeenCalledTimes(1)
    const [p1, p2] = svgCanvas.cutShapes.mock.calls[0][0]
    expect(p1).toEqual({ x: 100, y: 100 })
    expect(p2.y).toBeCloseTo(100)
    expect(p2.x).toBeGreaterThan(100)
  })

  it('a plain click starts multi-point mode instead of cutting', () => {
    click(100, 100)

    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
    expect(svgEditor.leftPanel.clickSelect).not.toHaveBeenCalled()
    expect(previewD()).toBe('M100,100')
  })

  it('clears the selection while drawing (so Backspace only edits the cut line) and restores it before cutting', () => {
    const shape = document.createElementNS(NS.SVG, 'rect')
    svgCanvas.getSelectedElements = vi.fn(() => [shape])

    click(100, 100)
    expect(svgCanvas.clearSelection).toHaveBeenCalledTimes(1)

    click(150, 80)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(svgCanvas.selectOnly).toHaveBeenCalledWith([shape], true)
    // Must be restored before cutShapes runs, since cutShapes scopes to the selection.
    expect(svgCanvas.selectOnly.mock.invocationCallOrder[0])
      .toBeLessThan(svgCanvas.cutShapes.mock.invocationCallOrder[0])
  })

  it('click, click, click, Enter cuts along the resulting zigzag', () => {
    click(100, 100)
    click(150, 80)
    click(200, 130)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(svgCanvas.cutShapes).toHaveBeenCalledTimes(1)
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 150, y: 80 },
      { x: 200, y: 130 }
    ])
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
    expect(svgContent.querySelector('#cutter_preview_line')).toBeNull()
  })

  it('double-click finishes the line without adding a stray duplicate point', () => {
    click(100, 100)
    click(150, 80)
    // Double-click at (200, 60): first mousedown/up adds the 3rd vertex,
    // the second mousedown/up lands on the same spot and must be ignored.
    extInstance.mouseDown({ start_x: 200, start_y: 60 })
    extInstance.mouseUp({ mouse_x: 200, mouse_y: 60, event: {} })
    extInstance.mouseDown({ start_x: 200, start_y: 60 })
    extInstance.mouseUp({ mouse_x: 200, mouse_y: 60, event: {} })
    workarea.dispatchEvent(new MouseEvent('dblclick'))

    expect(svgCanvas.cutShapes).toHaveBeenCalledTimes(1)
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 150, y: 80 },
      { x: 200, y: 60 }
    ])
  })

  it('Backspace removes the last vertex without finishing', () => {
    click(100, 100)
    click(150, 80)
    click(200, 130)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))

    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
    expect(previewD()).toBe('M100,100 L150,80')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 150, y: 80 }
    ])
  })

  it('leaving cutter mode (e.g. Escape) cancels the in-progress line', () => {
    click(100, 100)
    click(150, 80)

    svgCanvas.setMode('select')

    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
    expect(svgContent.querySelector('#cutter_preview_line')).toBeNull()
    expect(origSetModeMock).toHaveBeenCalledWith('select')

    // A stray Enter afterwards must not resurrect the cancelled line.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
  })

  // Regression guard: mouseUp used to gate only on the local `active` flag,
  // unlike every other extension's mouseUp hook (ext-brush, ext-shape-builder,
  // ext-connector, ...), which all check svgCanvas.getMode() too. `active` is
  // only reset by the setMode() monkey-patch above; if mode ever changes away
  // from 'cutter' through some other route (core has several direct
  // setCurrentMode() call sites), `active` is left stale and this hook would
  // fire for whatever tool's mouseUp comes next -- returning an object with
  // no `element`, which the core mouseUp epilogue (event.js) uses to
  // unconditionally overwrite its own `element`, discarding that tool's result.
  it('does not act on mouseUp once mode has changed away from cutter, even if `active` is still stale', () => {
    click(100, 100)
    click(150, 80)
    expect(previewD()).toBe('M100,100 L150,80')

    // Simulate mode having changed via a route that bypasses the setMode()
    // monkey-patch, leaving `active` stale (true).
    svgCanvas.getMode = () => 'path'

    const result = extInstance.mouseUp({ mouse_x: 200, mouse_y: 130, event: {} })

    expect(result).toBeUndefined()
    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
  })
})
