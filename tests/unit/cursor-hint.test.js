import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// `svgCanvas.setCursorHint` is how a tool says what the pointer is over, so the editor can pick a cursor by
// position (core never touches artwork).
describe('svgCanvas.setCursorHint', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    document.body.append(workarea)
    svgCanvas = new SvgCanvas(host, {
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
  })

  afterEach(() => { document.body.textContent = '' })

  it('starts with no hint, and a change fires `cursorHint` once', () => {
    const seen = vi.fn()
    svgCanvas.bind('cursorHint', (_win, hint) => seen(hint))
    expect(svgCanvas.getCursorHint()).toBeNull()
    svgCanvas.setCursorHint('continue')
    svgCanvas.setCursorHint('continue')
    expect(svgCanvas.getCursorHint()).toBe('continue')
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith('continue')
    svgCanvas.setCursorHint('join')
    expect(seen).toHaveBeenLastCalledWith('join')
  })

  it('"" and undefined mean none', () => {
    svgCanvas.setCursorHint('add')
    svgCanvas.setCursorHint('')
    expect(svgCanvas.getCursorHint()).toBeNull()
    svgCanvas.setCursorHint('add')
    svgCanvas.setCursorHint(undefined)
    expect(svgCanvas.getCursorHint()).toBeNull()
  })

  it('a mode change clears the hint, telling the editor', () => {
    const seen = vi.fn()
    svgCanvas.setCursorHint('grab')
    svgCanvas.bind('cursorHint', (_win, hint) => seen(hint))
    svgCanvas.setMode('rect')
    expect(svgCanvas.getCursorHint()).toBeNull()
    expect(seen).toHaveBeenCalledWith(null)
  })
})
