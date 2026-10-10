import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extCutter from '../../src/editor/extensions/ext-cutter/ext-cutter.js'
import { mockCommands } from './helpers/commands.js'

describe('ext-cutter', () => {
  let svgCanvas
  let svgContent
  let svgEditor
  let tool
  let workarea

  // The registry hands tools document-space events (see tool-registry.js).
  const ctx = {}
  const ev = (x, y, shift = false) => ({ x, y, rawX: x, rawY: y, mods: { shift } })
  const click = (x, y) => {
    tool.pointerDown(ctx, ev(x, y))
    tool.pointerUp(ctx, ev(x, y))
  }

  const previewD = () => svgContent.querySelector('#cutter_preview_line')?.getAttribute('d')

  beforeEach(async () => {
    svgContent = document.createElementNS(NS.SVG, 'svg')
    svgContent.id = 'svgcontent'
    document.body.append(svgContent)
    workarea = document.createElement('div')
    document.body.append(workarea)

    svgCanvas = {
      $id: vi.fn(),
      $click: vi.fn(),
      getZoom: () => 1,
      getSvgContent: () => svgContent,
      getMode: () => 'cutter',
      setMode: vi.fn(),
      registerTool: vi.fn((def) => { tool = def }),
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

    mockCommands(svgEditor)

    const extInstance = await extCutter.init.call(svgEditor)
    extInstance.callback()
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  it('does not snap the preview line when shift is not held', () => {
    tool.pointerDown(ctx, ev(100, 100))
    tool.pointerMove(ctx, ev(250, 110, false))

    expect(previewD()).toBe('M100,100 L250,110')
  })

  it('snaps the preview line to the nearest 15-degree angle when shift is held', () => {
    tool.pointerDown(ctx, ev(100, 100))
    tool.pointerMove(ctx, ev(250, 110, true))

    // Nearly horizontal drag snaps flat onto the 0-degree line from the start point.
    const d = previewD()
    expect(d).toMatch(/^M100,100 L\d/)
    expect(d).toMatch(/,100$/)
  })

  it('performs an instant straight cut on a plain drag (legacy behavior)', () => {
    tool.pointerDown(ctx, ev(100, 100))
    tool.pointerMove(ctx, ev(250, 110, false))
    tool.pointerUp(ctx, ev(250, 110, false))

    expect(svgCanvas.cutShapes).toHaveBeenCalledTimes(1)
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 250, y: 110 }
    ])
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
    expect(svgContent.querySelector('#cutter_preview_line')).toBeNull()
  })

  it('cuts along the snapped endpoint when shift is held on a drag', () => {
    tool.pointerDown(ctx, ev(100, 100))
    tool.pointerMove(ctx, ev(250, 110, true))
    tool.pointerUp(ctx, ev(250, 110, true))

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
    tool.pointerDown(ctx, ev(200, 60))
    tool.pointerUp(ctx, ev(200, 60))
    tool.pointerDown(ctx, ev(200, 60))
    tool.pointerUp(ctx, ev(200, 60))
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

    tool.deactivate(ctx) // the registry calls this when the mode changes away from 'cutter'

    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
    expect(svgContent.querySelector('#cutter_preview_line')).toBeNull()

    // A stray Enter afterwards must not resurrect the cancelled line.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
  })

  it('a cancelled gesture (Escape, an error) tears the line down and forgets it', () => {
    click(100, 100)
    click(150, 80)
    tool.cancel(ctx)

    expect(svgContent.querySelector('#cutter_preview_line')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
  })

  it('the preview line is scaffolding: marked ephemeral so it is never saved or recorded', () => {
    click(100, 100)
    expect(svgContent.querySelector('#cutter_preview_line').hasAttribute('data-se-ephemeral')).toBe(true)
  })

  it('registers as the cutter tool and follows the pointer between clicks', () => {
    expect(tool.id).toBe('cutter')
    expect(tool.wantsHover).toBe(true)
    click(100, 100)
    tool.pointerMove(ctx, ev(180, 90)) // hover: no button down
    expect(previewD()).toBe('M100,100 L180,90')
  })
})
