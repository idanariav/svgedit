import { describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

const makeCanvas = (dimensions, roundDigits) => {
  const workarea = document.createElement('div')
  const container = document.createElement('div')
  workarea.append(container)
  document.body.append(workarea)
  const canvas = new SvgCanvas(container, {
    canvas_expansion: 3,
    dimensions,
    initFill: { color: 'FF0000', opacity: 1 },
    initStroke: { width: 5, color: '000000', opacity: 1 },
    initOpacity: 1,
    imgPath: '../editor/images',
    langPath: 'locale/',
    extPath: 'extensions/',
    extensions: [],
    initTool: 'select',
    wireframe: false
  })
  canvas.saveOptions.round_digits = roundDigits
  return canvas
}

// Regression: units.js kept its container in module state, so with two canvases
// every conversion used whichever was constructed last — including one already
// destroyed after its pane closed.
describe('units are per canvas', () => {
  it('each canvas converts with its own size, rounding and ids, regardless of construction order', () => {
    const a = makeCanvas([200, 100], 1)
    const b = makeCanvas([800, 400], 4)

    // '%' resolves against the *owning* canvas' size
    expect(a.convertToNum('width', '50%')).toBe(100)
    expect(b.convertToNum('width', '50%')).toBe(400)
    // rounding digits come from the owning canvas
    expect(a.units.shortFloat(1.23456)).toBe(1.2)
    expect(b.units.shortFloat(1.23456)).toBe(1.2346)
    // id lookup (isValidUnit) is scoped to the owning canvas' document
    const rectB = b.addSVGElementsFromJson({ element: 'rect', attr: { id: 'only_in_b', x: 0, y: 0, width: 1, height: 1 } })
    expect(rectB.id).toBe('only_in_b')
    expect(a.isValidUnit('id', 'only_in_b')).toBe(true)
    expect(b.isValidUnit('id', 'only_in_b')).toBe(false)
  })

  it('stays correct for the survivor after the other canvas is destroyed', () => {
    const a = makeCanvas([200, 100], 1)
    const b = makeCanvas([800, 400], 4)
    b.destroy()
    expect(a.convertToNum('height', '50%')).toBe(50)
    expect(a.units.shortFloat(2.718)).toBe(2.7)
  })
})
