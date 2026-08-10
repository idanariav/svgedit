import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyLayout } from '../../src/editor/canvasLayouts.js'

// Regression test: applyLayout() overwrites both the canvas resolution and
// the background color, but only ever recorded the resolution change to
// undo history. Editor.setBackground()'s `recordUndo` parameter defaults to
// false, and applyLayout was calling it with a single argument — so the
// background change from applying a layout could never be undone, even
// though the resolution change right next to it could. The fix passes
// `true` explicitly.
describe('canvasLayouts applyLayout', () => {
  let svgCanvas
  let svgEditor

  beforeEach(() => {
    svgCanvas = {
      getCurrentDrawing: vi.fn(() => ({ getCurrentLayerName: () => 'Layer 1' })),
      setResolution: vi.fn()
    }
    svgEditor = {
      svgCanvas,
      updateCanvas: vi.fn(),
      setBackground: vi.fn()
    }
    global.svgEditor = svgEditor
  })

  afterEach(() => {
    delete global.svgEditor
  })

  it('applies the background with recordUndo=true so it can be undone', () => {
    const layout = {
      name: 'Test Layout',
      w: 200,
      h: 150,
      bg: '#ff0000',
      // Empty canvas: no g.layer/defs content, so applyLayout returns right
      // after step 1 (resolution + background) without needing layer/JSON
      // insertion mocks.
      svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    }

    applyLayout(layout)

    expect(svgCanvas.setResolution).toHaveBeenCalledWith(200, 150)
    expect(svgEditor.setBackground).toHaveBeenCalledWith('#ff0000', undefined, undefined, true)
  })
})
