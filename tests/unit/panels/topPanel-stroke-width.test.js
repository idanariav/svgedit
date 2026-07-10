import { describe, expect, it, vi } from 'vitest'

// See topPanel-image-panel.test.js for why @svgedit/svgcanvas is mocked here.
vi.mock('@svgedit/svgcanvas', () => ({
  default: {
    $click: () => {},
    isValidUnit: () => true,
    getTypeMap: () => ({}),
    convertUnit: (v) => v
  }
}))

const { default: TopPanel } = await import('../../../src/editor/panels/TopPanel.js')

const buildContainer = () => {
  const container = document.createElement('div')
  const ids = ['stroke_width', 'opacity', 'elem_id']
  ids.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    container.append(el)
  })
  const elemClass = document.createElement('div')
  elemClass.setAttribute('id', 'elem_class')
  elemClass.refresh = () => {}
  container.append(elemClass)
  const titlePanel = document.createElement('div')
  titlePanel.setAttribute('id', 'title_panel')
  titlePanel.append(document.createElement('p'))
  container.append(titlePanel)
  document.body.append(container)
  return container
}

const makeTopPanel = (container, elem) => {
  const $id = (id) => container.querySelector(`[id="${id}"]`)
  const $qa = (sel) => [...container.querySelectorAll(sel)]
  const editor = {
    $id,
    $qa,
    selectedElement: elem,
    bottomPanel: {
      updateColorpickers: () => {},
      updateToolButtonState: () => {}
    }
  }
  return new TopPanel(editor)
}

const createEl = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)))
  return el
}

describe('TopPanel: stroke_width field for a selected group', () => {
  it('shows the shared width when every child consistently lacks a stroke-width attribute (default 1)', () => {
    // cleanupElement strips stroke-width="1" (the SVG initial value), leaving
    // real, visible 1px strokes with no stroke-width attribute at all. A null
    // read used to collide with the "mixed values" sentinel and blank the field.
    const container = buildContainer()
    const g = createEl('g')
    g.append(createEl('rect', { x: 0, y: 0, width: 10, height: 10, stroke: 'black' }))
    g.append(createEl('rect', { x: 20, y: 0, width: 10, height: 10, stroke: 'black' }))
    document.body.append(g)

    const topPanel = makeTopPanel(container, g)
    topPanel.update()

    expect(container.querySelector('[id="stroke_width"]').value).toBe('1')
  })

  it('still blanks the field when children have genuinely different stroke-width values', () => {
    const container = buildContainer()
    const g = createEl('g')
    g.append(createEl('rect', { x: 0, y: 0, width: 10, height: 10, stroke: 'black', 'stroke-width': 3 }))
    g.append(createEl('rect', { x: 20, y: 0, width: 10, height: 10, stroke: 'black' }))
    document.body.append(g)

    const topPanel = makeTopPanel(container, g)
    topPanel.update()

    expect(container.querySelector('[id="stroke_width"]').value).toBe('')
  })
})
