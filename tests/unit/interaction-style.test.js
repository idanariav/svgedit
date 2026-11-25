import { describe, it, expect, beforeEach } from 'vitest'
import { createInteractionStyle, pathFrom } from '../../packages/svgcanvas/core/interaction-style.ts'
import { releasePreviewPointer } from '../../packages/svgcanvas/core/dom-utils.ts'

// Roadmap R11: the editor's interaction state on the drawing is CSS in one sheet per canvas, outside the drawing.
const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

describe('interaction style', () => {
  let svgroot
  let content
  let a
  let b
  let style

  beforeEach(() => {
    document.body.textContent = ''
    svgroot = el('svg')
    content = el('svg', { id: 'svgcontent' })
    a = el('g', { class: 'layer' })
    b = el('g', { class: 'layer' })
    b.append(el('rect'), el('rect'))
    content.append(el('defs'), a, b)
    svgroot.append(content)
    document.body.append(svgroot)
    style = createInteractionStyle(svgroot, () => content)
  })

  const sheet = () => svgroot.querySelector('style[data-se-interaction]')

  it('lives in the svg root, outside the drawing, scoped to its own canvas', () => {
    expect(sheet().parentNode).toBe(svgroot)
    expect(content.querySelector('style')).toBeNull()
    const other = createInteractionStyle(el('svg'), () => null)
    other.mark('x', () => [], 'opacity: 1')
    expect(svgroot.getAttribute('data-se-canvas')).toMatch(/^\d+$/)
    style.mark('m', () => [a], 'pointer-events: none')
    expect(style.text()).toContain(`[data-se-canvas="${svgroot.getAttribute('data-se-canvas')}"] > #svgcontent > :nth-child(2)`)
  })

  it('selects an element by its path from the content root, writing nothing on it', () => {
    expect(pathFrom(content, b.children[1])).toBe(':nth-child(3) > :nth-child(2)')
    expect(pathFrom(content, el('rect'))).toBeNull()
    style.mark('dim', () => [b.children[1]], 'opacity: 0.33 !important')
    expect(style.text()).toMatch(/\/\* dim \*\/ .*#svgcontent > :nth-child\(3\) > :nth-child\(2\) \{ opacity: 0\.33 !important \}/)
    expect(b.children[1].attributes.length).toBe(0)
  })

  it('asks a mark for its elements on every refresh, and leaves out what is gone', () => {
    let targets = [a]
    style.mark('m', () => targets, 'pointer-events: none')
    expect(style.text()).toContain(':nth-child(2) {')
    targets = [b, el('rect')]
    style.refresh()
    expect(style.text()).toContain(':nth-child(3) {')
    expect(style.text()).not.toContain(':nth-child(2) {')
    targets = []
    style.refresh()
    expect(style.text()).toBe('')
  })

  it('suspends a mark until resumed, nested, each resume once', () => {
    style.mark('dim', () => [a], 'opacity: 0.33')
    const r1 = style.suspend('dim')
    const r2 = style.suspend('dim')
    expect(style.text()).toBe('')
    r1()
    r1()
    expect(style.text()).toBe('')
    r2()
    expect(style.text()).toContain('/* dim */')
  })

  it('follows the content root a load puts in its place', () => {
    style.mark('m', () => [content.children[0]], 'pointer-events: none')
    const fresh = el('svg', { id: 'svgcontent' })
    fresh.append(el('g'))
    content.replaceWith(fresh)
    content = fresh
    style.refresh()
    expect(style.text()).toContain('#svgcontent > :nth-child(1)')
  })
})

describe('releasePreviewPointer', () => {
  it('takes off only the pointer-events a shape being drawn had', () => {
    const r = el('rect', { style: 'pointer-events:none; fill: red' })
    releasePreviewPointer(r)
    expect(r.getAttribute('style')).toBe('fill: red;')
    const q = el('rect', { style: 'pointer-events:none' })
    releasePreviewPointer(q)
    expect(q.hasAttribute('style')).toBe(false)
    const plain = el('rect', { style: 'fill: blue' })
    releasePreviewPointer(plain)
    expect(plain.getAttribute('style')).toBe('fill: blue')
  })
})

describe('the canvas\'s interaction sheet', () => {
  let canvas

  beforeEach(async () => {
    const { default: SvgCanvas } = await import('../../packages/svgcanvas/svgcanvas.ts')
    document.body.textContent = ''
    const editor = document.createElement('div')
    editor.id = 'svg_editor'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const container = document.createElement('div')
    container.id = 'svgcanvas'
    workarea.append(container)
    editor.append(workarea)
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
    canvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
      '<g class="layer"><title>A</title><rect id="ra" width="5" height="5"/></g>' +
      '<g class="layer"><title>B</title><g id="grp"><rect id="rb" width="5" height="5"/></g><rect id="sib" width="5" height="5"/></g></svg>')
  })

  /** the rule of mark `name`, or '' */
  const rule = (name) => canvas.interactionStyle.text().split('\n').find((l) => l.startsWith(`/* ${name} */`)) ?? ''
  const layerChild = (title) => {
    const groups = [...canvas.getSvgContent().children]
    return new RegExp(`#svgcontent > :nth-child\\(${groups.findIndex((g) => g.querySelector(':scope > title')?.textContent === title) + 1}\\)(,| \\{)`)
  }

  it('lets the current layer take presses, and the others not', () => {
    expect(rule('layers-active')).toMatch(layerChild('B'))
    expect(rule('layers-inactive')).toMatch(layerChild('A'))
    canvas.setCurrentLayer('A')
    expect(rule('layers-active')).toMatch(layerChild('A'))
    expect(rule('layers-inactive')).toMatch(layerChild('B'))
  })

  it('lets every layer take presses in All Layers mode', () => {
    canvas.getCurrentDrawing().setAllLayersMode(true)
    expect(rule('layers-inactive')).toBe('')
    expect(rule('layers-active')).toMatch(layerChild('A'))
  })

  it('dims what lies outside the group being edited, until the group is left', () => {
    canvas.setContext(canvas.getElement('grp'))
    expect(rule('context-dim')).toContain('opacity: 0.33 !important')
    canvas.leaveContext()
    expect(rule('context-dim')).toBe('')
  })

  it('writes none of it on the drawing, and saving carries none of it', () => {
    canvas.setContext(canvas.getElement('grp'))
    const marked = [...canvas.getSvgContent().querySelectorAll('[style]')]
    expect(marked).toEqual([])
    expect(canvas.getSvgString()).not.toMatch(/pointer-events|opacity="0\.33"/)
    expect(canvas.checkDrawing()).toEqual([])
  })
})
