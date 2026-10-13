import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Guards for behaviour tightened while svgcanvas.js moved under the strict typecheck
// (noImplicitAny + strictNullChecks): the null cases the old code let through.
describe('SvgCanvas strict-typing guards', function () {
  const CLIPBOARD_KEY = 'svgedit_clipboard'
  let canvas

  beforeEach(() => {
    document.body.textContent = ''
    const container = document.createElement('div')
    container.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(container)
    document.body.append(workarea)
    canvas = new SvgCanvas(container, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    sessionStorage.removeItem(CLIPBOARD_KEY)
    localStorage.removeItem(CLIPBOARD_KEY)
  })

  afterEach(() => {
    canvas.destroy()
    sessionStorage.removeItem(CLIPBOARD_KEY)
    localStorage.removeItem(CLIPBOARD_KEY)
  })

  it('flashStorage copies the clipboard to localStorage for other tabs, then clears it', () => {
    vi.useFakeTimers()
    try {
      sessionStorage.setItem(CLIPBOARD_KEY, 'payload')
      canvas.flashStorage()
      expect(localStorage.getItem(CLIPBOARD_KEY)).toBe('payload')
      vi.advanceTimersByTime(5)
      expect(localStorage.getItem(CLIPBOARD_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('flashStorage sends nothing when there is no clipboard (not the string "null")', () => {
    canvas.flashStorage()
    expect(localStorage.getItem(CLIPBOARD_KEY)).toBeNull()
  })

  it('restoreRefElements ignores a malformed url( reference instead of throwing', () => {
    canvas.removedElements.some_id = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('fill', 'url(')
    expect(() => canvas.restoreRefElements(rect)).not.toThrow()
    expect(canvas.removedElements.some_id).toBeDefined()
  })

  it('restoreRefElements puts a purged paint server back into defs', () => {
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    grad.id = 'g_purged'
    canvas.removedElements.g_purged = grad
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('fill', 'url(#g_purged)')
    canvas.restoreRefElements(rect)
    expect(canvas.findDefs().contains(grad)).toBe(true)
    expect(canvas.removedElements.g_purged).toBeUndefined()
  })

  it('cursor hint starts null and only fires on a change', () => {
    expect(canvas.getCursorHint()).toBeNull()
    const seen = []
    canvas.bind('cursorHint', (_win, hint) => { seen.push(hint) })
    canvas.setCursorHint('grab')
    canvas.setCursorHint('grab')
    canvas.setCursorHint(null)
    expect(seen).toEqual(['grab', null])
  })

  it('getParents returns null when nothing matches', () => {
    const el = document.createElement('div')
    expect(canvas.getParents(el, '.nope')).toBeNull()
  })

  it('typed state accessors round-trip', () => {
    canvas.setStartX(12)
    canvas.setEnd('x', 3)
    canvas.setFreehand('minx', 5)
    canvas.setCurText('font_size', 22)
    expect(canvas.getStartX()).toBe(12)
    expect(canvas.getEnd('x')).toBe(3)
    expect(canvas.getFreehand('minx')).toBe(5)
    expect(canvas.getCurText('font_size')).toBe(22)
  })
})
