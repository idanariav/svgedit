import { beforeEach, describe, expect, it, vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

const doc = (id) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title><rect id="${id}" x="1" y="1" width="5" height="5"/></g></svg>`

describe('setSvgString failure handling', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const container = document.createElement('div')
    container.id = 'svgcanvas'
    workarea.append(container)
    document.body.append(workarea)
    svgCanvas = new SvgCanvas(container, {
      canvas_expansion: 3,
      dimensions: [640, 480],
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
    svgCanvas.setSvgString(doc('original'))
  })

  it('leaves the previous drawing intact when a pass after the swap throws', () => {
    const before = svgCanvas.getSvgString()
    const oldContent = svgCanvas.getSvgContent()
    const oldDrawing = svgCanvas.current_drawing_
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(svgCanvas, 'identifyLayers').mockImplementation(() => { throw new Error('boom') })

    expect(svgCanvas.setSvgString(doc('replacement'))).toBe(false)

    expect(svgCanvas.getSvgContent()).toBe(oldContent)
    expect(svgCanvas.current_drawing_).toBe(oldDrawing)
    expect(svgCanvas.getSvgString()).toBe(before)
    expect(document.querySelectorAll('#svgcontent')).toHaveLength(1)
    expect(document.querySelector('#replacement')).toBeNull()
  })

  it('still loads normally afterwards', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const spy = vi.spyOn(svgCanvas, 'identifyLayers').mockImplementationOnce(() => { throw new Error('boom') })
    expect(svgCanvas.setSvgString(doc('replacement'))).toBe(false)
    spy.mockRestore()
    expect(svgCanvas.setSvgString(doc('second'))).toBe(true)
    expect(document.querySelector('#second')).not.toBeNull()
  })
})
