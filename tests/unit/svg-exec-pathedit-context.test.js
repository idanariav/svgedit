import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Regression: svgCanvasToString() (behind getSvgString(), which hosts call on
// every change/autosave) used to leaveContext() + selectOnly([group]) whenever
// the editor was inside a group. That silently dropped the group context and
// dimming and swapped the selection to the group mid-edit (in 'pathedit' the
// mode even stayed on while the context vanished), so the next edit targeted
// the wrong level.
describe('svgCanvasToString while editing inside a group', () => {
  let svgCanvas
  let group
  let path
  let sibling

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
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>' +
      '<g id="grp"><path id="p1" d="M 100 200 L 200 140 L 200 200 L 100 200 z" fill="none" stroke="#000"/></g>' +
      '<rect id="sib" x="300" y="300" width="40" height="40" fill="red"/>' +
      '</g></svg>'
    )
    group = document.getElementById('grp')
    path = document.getElementById('p1')
    sibling = document.getElementById('sib')
  })

  const enterPathEditInGroup = () => {
    svgCanvas.setMode('select')
    svgCanvas.setContext(group)
    svgCanvas.setCurrentMode('pathedit')
  }

  it('keeps the group context, dimming and mode intact', () => {
    enterPathEditInGroup()
    expect(svgCanvas.getDisabledElems().length).toBeGreaterThan(0)

    svgCanvas.getSvgString()

    expect(svgCanvas.getCurrentMode()).toBe('pathedit')
    expect(svgCanvas.getCurrentGroup()).toBe(group)
    expect(svgCanvas.getDisabledElems()).toContain(sibling)
    expect(sibling.getAttribute('opacity')).toBe('0.33')
    expect(svgCanvas.getSelectedElements().filter(Boolean)).not.toContain(group)
  })

  it('never leaks the synthetic dimming into the output', () => {
    const before = svgCanvas.getSvgString()
    enterPathEditInGroup()

    const during = svgCanvas.getSvgString()

    expect(during).not.toContain('0.33')
    expect(during).toBe(before)
  })

  it('also keeps the group context in plain select mode, with the selection untouched', () => {
    svgCanvas.setMode('select')
    svgCanvas.setContext(group)
    svgCanvas.selectOnly([path], true)

    const out = svgCanvas.getSvgString()

    expect(svgCanvas.getCurrentGroup()).toBe(group)
    expect(svgCanvas.getSelectedElements().filter(Boolean)).toStrictEqual([path])
    expect(svgCanvas.getDisabledElems()).toContain(sibling)
    expect(sibling.getAttribute('opacity')).toBe('0.33')
    expect(out).not.toContain('0.33')
  })

  it('serializing repeatedly never accumulates or loses the dimming state', () => {
    svgCanvas.setMode('select')
    svgCanvas.setContext(group)
    const dimmedCount = svgCanvas.getDisabledElems().length
    const first = svgCanvas.getSvgString()
    const second = svgCanvas.getSvgString()

    expect(second).toBe(first)
    expect(svgCanvas.getDisabledElems()).toHaveLength(dimmedCount)
    svgCanvas.leaveContext()
    expect(sibling.hasAttribute('opacity')).toBe(false)
  })
})
