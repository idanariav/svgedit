import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extBrush from '../../src/editor/extensions/ext-brush/ext-brush.js'

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
  let extInstance
  let zoom

  beforeEach(async () => {
    zoom = 1
    const brushParams = { thickness: 0.02, angle: 0, roundness: 100, taperStart: 0, taperEnd: 0, opacity: 1, smoothness: 0 }

    svgCanvas = {
      $id: vi.fn(),
      $click: vi.fn(),
      getZoom: () => zoom,
      getMode: () => 'brush',
      getBrushParams: () => brushParams,
      getColor: () => '#000000',
      getNextId: () => 'brush_1',
      svgroot: document.createElement('div'),
      addSVGElementsFromJson: ({ attr }) => {
        const el = document.createElementNS(NS.SVG, 'path')
        Object.entries(attr).forEach(([k, v]) => el.setAttribute(k, v))
        return el
      }
    }

    svgEditor = { svgCanvas }

    extInstance = await extBrush.init.call(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  // mouseDown opts (start_x/start_y) are already in canvas coordinates;
  // mouseMove opts (mouse_x/mouse_y) are screen-pixel coordinates that must
  // be divided by zoom — same convention as ext-cutter/ext-curvature/etc.
  it('draws in real canvas coordinates at 100% zoom', () => {
    extInstance.mouseDown({ start_x: 10, start_y: 20 })
    extInstance.mouseMove({ mouse_x: 40, mouse_y: 80 })
    const { element } = extInstance.mouseUp()

    const pts = parsePoints(element.getAttribute('d'))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    expect(Math.max(...xs)).toBeCloseTo(40, 1)
    expect(Math.max(...ys)).toBeCloseTo(80, 1)
  })

  it('divides mouse_x/mouse_y by zoom so the stroke tracks the real cursor position, not the raw screen pixel', () => {
    zoom = 2
    extInstance.mouseDown({ start_x: 10, start_y: 20 })
    // At 200% zoom, a screen position of (80, 160) corresponds to the real
    // canvas point (40, 80) — the same point the cursor is actually over.
    extInstance.mouseMove({ mouse_x: 80, mouse_y: 160 })
    const { element } = extInstance.mouseUp()

    const pts = parsePoints(element.getAttribute('d'))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    // Before the fix this asserted 80/160 (the raw, undivided screen pixel),
    // which is exactly the "stroke jumps far from the cursor" bug.
    expect(Math.max(...xs)).toBeCloseTo(40, 1)
    expect(Math.max(...ys)).toBeCloseTo(80, 1)
  })
})
