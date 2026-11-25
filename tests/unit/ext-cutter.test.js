import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import extCutter from '../../src/editor/extensions/ext-cutter/ext-cutter.ts'
import { mockCommands } from './helpers/commands.js'

describe('ext-cutter', () => {
  let svgCanvas
  let svgContent
  let svgEditor
  let tool
  let workarea

  // The registry hands tools document-space events (see tool-registry.js) and
  // a context whose overlays live outside #svgcontent.
  let overlay
  const ctx = {
    zoom: 1,
    addOverlay: (el) => overlay.append(el),
    clearOverlays: () => overlay.replaceChildren()
  }
  const ev = (x, y, shift = false) => ({ x, y, rawX: x, rawY: y, mods: { shift } })
  const click = (x, y) => {
    tool.pointerDown(ctx, ev(x, y))
    tool.pointerUp(ctx, ev(x, y))
  }

  const previewD = () => overlay.querySelector('#cutter_preview_line')?.getAttribute('d')

  beforeEach(async () => {
    svgContent = document.createElementNS(NS.SVG, 'svg')
    svgContent.id = 'svgcontent'
    document.body.append(svgContent)
    overlay = document.createElementNS(NS.SVG, 'svg')
    document.body.append(overlay)
    workarea = document.createElement('div')
    document.body.append(workarea)

    svgCanvas = {
      $id: vi.fn(),
      $req: vi.fn(),
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

    const extInstance = await extCutter.init(svgEditor)
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
    expect(overlay.querySelector('#cutter_preview_line')).toBeNull()
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
    expect(overlay.querySelector('#cutter_preview_line')).toBeNull()
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

  it('press and drag while placing a vertex pulls symmetric handles, curving the cut', () => {
    click(100, 100)
    tool.pointerDown(ctx, ev(200, 100))
    tool.pointerMove(ctx, ev(240, 70)) // still pressed: pulls the handles
    tool.pointerUp(ctx, ev(240, 70))
    expect(previewD()).toBe('M100,100 C100,100 160,130 200,100')

    click(300, 100)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 200, y: 100, handleIn: { x: -40, y: 30 }, handleOut: { x: 40, y: -30 } },
      { x: 300, y: 100 }
    ])
  })

  it('after a curved vertex, the hover rubber band continues the curve', () => {
    click(100, 100)
    tool.pointerDown(ctx, ev(200, 100))
    tool.pointerMove(ctx, ev(240, 70))
    tool.pointerUp(ctx, ev(240, 70))
    tool.pointerMove(ctx, ev(300, 120)) // hover
    expect(previewD()).toBe('M100,100 C100,100 160,130 200,100 C240,70 300,120 300,120')
  })

  it('shows the last vertex\'s handles as lines with tips, hidden for a corner and gone after the cut', () => {
    const guide = () => overlay.querySelector('#cutter_preview_handles')
    const shown = () => Boolean(guide())
    click(100, 100)
    expect(shown()).toBeFalsy()

    tool.pointerDown(ctx, ev(200, 100))
    tool.pointerMove(ctx, ev(240, 70))
    expect(shown()).toBe(true)
    const [line, inGrip, outGrip] = guide().children
    expect(line.getAttribute('d')).toBe('M160,130 L200,100 L240,70')
    expect([inGrip.getAttribute('cx'), inGrip.getAttribute('cy')]).toEqual(['160', '130'])
    expect([outGrip.getAttribute('cx'), outGrip.getAttribute('cy')]).toEqual(['240', '70'])
    tool.pointerUp(ctx, ev(240, 70))
    tool.pointerMove(ctx, ev(300, 120)) // hover: still the last vertex's handles
    expect(shown()).toBe(true)

    click(300, 100) // a corner becomes the last vertex
    expect(shown()).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' })) // the curved vertex is last again
    expect(shown()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(guide()).toBeNull()
  })

  it('dragging back onto the vertex makes it a corner again', () => {
    click(100, 100)
    tool.pointerDown(ctx, ev(200, 100))
    tool.pointerMove(ctx, ev(240, 70))
    tool.pointerMove(ctx, ev(200.5, 100))
    tool.pointerUp(ctx, ev(200.5, 100))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).toHaveBeenCalledWith([{ x: 100, y: 100 }, { x: 200, y: 100 }])
  })

  it('Shift snaps a pulled handle to 15 degrees', () => {
    click(100, 100)
    tool.pointerDown(ctx, ev(200, 100))
    tool.pointerMove(ctx, ev(250, 103, true))
    tool.pointerUp(ctx, ev(250, 103, true))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    const [, curved] = svgCanvas.cutShapes.mock.calls[0][0]
    expect(curved.handleOut.y).toBeCloseTo(0)
    expect(curved.handleIn.x).toBeCloseTo(-curved.handleOut.x)
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
    expect(overlay.querySelector('#cutter_preview_line')).toBeNull()

    // A stray Enter afterwards must not resurrect the cancelled line.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
  })

  it('a cancelled gesture (Escape, an error) tears the line down and forgets it', () => {
    click(100, 100)
    click(150, 80)
    tool.cancel(ctx)

    expect(overlay.querySelector('#cutter_preview_line')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(svgCanvas.cutShapes).not.toHaveBeenCalled()
  })

  it('the preview is a tool overlay, never in the drawing', () => {
    click(100, 100)
    tool.pointerDown(ctx, ev(200, 100))
    tool.pointerMove(ctx, ev(240, 70))
    expect(overlay.querySelector('#cutter_preview_line')).not.toBeNull()
    expect(overlay.querySelector('#cutter_preview_handles')).not.toBeNull()
    expect(svgContent.children).toHaveLength(0)
  })

  it('registers as the cutter tool and follows the pointer between clicks', () => {
    expect(tool.id).toBe('cutter')
    expect(tool.wantsHover).toBe(true)
    expect(tool.snap).toBe(true)
    click(100, 100)
    tool.pointerMove(ctx, ev(180, 90)) // hover: no button down
    expect(previewD()).toBe('M100,100 L180,90')
  })
})
