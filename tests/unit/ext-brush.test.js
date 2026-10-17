import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import extBrush from '../../src/editor/extensions/ext-brush/ext-brush.ts'

// Outline `d` strings are plain 'M x y L x y ... Z' (no curve commands), so
// parsing them back into points is just splitting on whitespace — same
// helper as brush-stroke.test.js.
const parsePoints = (d) => {
  const tokens = d.split(/\s+/).filter((t) => t !== 'M' && t !== 'L' && t !== 'Z')
  const pts = []
  for (let i = 0; i < tokens.length; i += 2) {
    pts.push({ x: parseFloat(tokens[i]), y: parseFloat(tokens[i + 1]) })
  }
  return pts
}

describe('ext-brush', () => {
  let svgCanvas
  let svgEditor
  let tool

  beforeEach(async () => {
    const brushParams = { thickness: 0.02, angle: 0, roundness: 100, taperStart: 0, taperEnd: 0, opacity: 1, smoothness: 0 }

    svgCanvas = {
      $id: vi.fn(),
      registerTool: vi.fn((def) => { tool = def }),
      getMode: () => 'brush',
      getBrushParams: () => brushParams,
      getColor: () => '#000000',
      getNextId: () => 'brush_1',
      svgroot: document.createElement('div'),
      buildElementFromJson: ({ attr }) => {
        const el = document.createElementNS(NS.SVG, 'path')
        Object.entries(attr).forEach(([k, v]) => el.setAttribute(k, v))
        return el
      },
      getJsonFromSvgElements: (el) => ({ element: el.tagName, attr: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])) })
    }

    svgEditor = { svgCanvas }

    await extBrush.init(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  // The registry hands tools document-space events (unzoomed), so the brush no
  // longer divides by zoom itself: the first point is the (snapped) press, the rest are raw.
  const ev = (x, y) => ({ x, y, rawX: x, rawY: y })
  const ctx = { addOverlay: vi.fn() }

  it('registers itself as the brush tool, keeping its own opacity', () => {
    expect(svgCanvas.registerTool).toHaveBeenCalledTimes(1)
    expect(tool.id).toBe('brush')
    expect(tool.keepOpacity).toBe(true)
  })

  it('draws in document coordinates and hands the stroke back to be created through the model', () => {
    tool.pointerDown(ctx, ev(10, 20))
    tool.pointerMove(ctx, ev(40, 80))
    const { create } = tool.pointerUp(ctx, ev(40, 80))

    expect(ctx.addOverlay).toHaveBeenCalledTimes(1) // the stroke is shown as an overlay while it is drawn
    const pts = parsePoints(create.attr.d)
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(40, 1)
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(80, 1)
    expect(create.attr.opacity).toBe('1') // the brush's own opacity param
  })

  it('uses the raw pointer position (not the grid-snapped one) after the press', () => {
    tool.pointerDown(ctx, { x: 10, y: 20, rawX: 11, rawY: 21 })
    tool.pointerMove(ctx, { x: 40, y: 80, rawX: 43, rawY: 83 })
    const { create } = tool.pointerUp(ctx, ev(0, 0))
    expect(Math.max(...parsePoints(create.attr.d).map((p) => p.x))).toBeCloseTo(43, 1)
  })

  it('a cancelled gesture forgets its stroke; a stray release cancels', () => {
    tool.pointerDown(ctx, ev(10, 20))
    tool.cancel(ctx)
    expect(tool.pointerUp(ctx, ev(10, 20))).toBe('cancel')
    tool.pointerMove(ctx, ev(5, 5)) // no element: must not throw
  })
})
