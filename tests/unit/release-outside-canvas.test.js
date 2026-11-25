import { describe, it, expect, beforeEach, vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.ts'

// Roadmap R13: a press released outside the canvas (over a panel, another drawing, after its tab was hidden) never reached
// the canvas's own mouseup, so its gesture stayed open until the next press cancelled it, and the move was lost.
describe('a release outside the canvas', () => {
  let canvas
  let container
  let releases

  beforeEach(() => {
    document.body.textContent = ''
    const editor = document.createElement('div')
    editor.id = 'svg_editor'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    container = document.createElement('div')
    container.id = 'svgcanvas'
    workarea.append(container)
    const panel = document.createElement('div')
    panel.id = 'tools_left'
    editor.append(workarea, panel)
    document.body.append(editor)
    canvas = new SvgCanvas(container, {
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
    // jsdom lays nothing out: the canvas counts as rendered unless a test says otherwise
    container.getClientRects = () => [{}]
    releases = []
    container.addEventListener('mouseup', (e) => releases.push({ x: e.clientX, y: e.clientY }))
    // the last point the canvas saw
    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 40 }))
  })

  const releaseOver = (el) => el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 500, clientY: 9 }))

  it('finishes a press in progress on the canvas, at the last point the canvas saw', () => {
    canvas.setStarted(true)
    releaseOver(document.getElementById('tools_left'))
    expect(releases).toEqual([{ x: 30, y: 40 }])
  })

  it('cancels it when the canvas is no longer rendered (its tab was hidden)', () => {
    container.getClientRects = () => []
    canvas.setStarted(true)
    const cancel = vi.spyOn(canvas, 'cancelGesture')
    releaseOver(document.body)
    expect(releases).toEqual([])
    expect(cancel).toHaveBeenCalledWith('focus lost')
    expect(canvas.getStarted()).toBe(false)
  })

  it('leaves a release on the canvas to the canvas, and one with no press in progress alone', () => {
    canvas.setStarted(true)
    releaseOver(container)
    expect(releases).toHaveLength(1) // its own, not a second one
    canvas.setStarted(false)
    releases = []
    releaseOver(document.body)
    expect(releases).toEqual([])
  })

  it('stops listening when the canvas is destroyed', () => {
    canvas.destroy()
    canvas.setStarted(true)
    releaseOver(document.body)
    expect(releases).toEqual([])
  })
})
