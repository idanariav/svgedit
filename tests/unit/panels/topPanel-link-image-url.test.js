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

/**
 * Builds the minimal DOM `TopPanel#updateContextPanel()`/`#setImageURL()`
 * touch. `tool_make_link`, `tool_make_link_multi` and `image_url` carry both
 * an `id` and a matching class, mirroring RightPanel.html —
 * `hideTool`/`displayTool` select elements by class, not id.
 */
const buildContainer = () => {
  const container = document.createElement('div')
  const ids = [
    'se-cmenu_canvas', 'angle', 'blur', 'selected_x', 'selected_y',
    'tool_undo', 'tool_redo', 'selLayerNames', 'link_url', 'g_title'
  ]
  ids.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    container.append(el)
  })

  const classIds = [
    'tool_topath', 'tool_smooth_path', 'tool_stroke_to_path',
    'tool_path_offset', 'g_panel', 'a_panel', 'container_panel', 'tool_make_link',
    'tool_make_link_multi', 'image_url'
  ]
  classIds.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    el.className = id
    container.append(el)
  })

  const selectedPanel = document.createElement('div')
  selectedPanel.className = 'selected_panel'
  container.append(selectedPanel)

  document.body.append(container)
  return container
}

const makeTopPanel = (container, elem, extraSvgCanvas = {}) => {
  const $id = (id) => container.querySelector(`[id="${id}"]`)
  const $qa = (sel) => [...container.querySelectorAll(sel)]
  const editor = {
    $id,
    $qa,
    selectedElement: elem,
    multiselected: false,
    defaultImageURL: '',
    configObj: { curConfig: { baseUnit: 'px' } },
    svgCanvas: {
      getRotationAngle: () => 0,
      setRotationAngle: () => {},
      getBlur: () => 0,
      getCurrentDrawing: () => ({ getCurrentLayerName: () => 'Layer 1' }),
      getMode: () => 'select',
      getSelectedElements: () => [],
      getStrokedBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      hasVisibleStroke: () => false,
      getHref: () => null,
      getTitle: () => '',
      setImageURL: () => {},
      undoMgr: { getUndoStackSize: () => 0, getRedoStackSize: () => 0 },
      ...extraSvgCanvas
    }
  }
  return new TopPanel(editor)
}

const createSvgEl = (tagName, attrs = {}, parent) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tagName)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)))
  if (parent) {
    parent.append(el)
  } else {
    document.body.append(el)
  }
  return el
}

describe('TopPanel: make_link button visibility (class-selector fix)', () => {
  it('shows tool_make_link/tool_make_link_multi for a selected <a> element', () => {
    const container = buildContainer()
    const a = createSvgEl('a')
    const topPanel = makeTopPanel(container, a, { getHref: () => 'https://example.com' })

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_make_link').style.display).not.toBe('none')
    expect(container.querySelector('.tool_make_link_multi').style.display).not.toBe('none')
  })

  it('shows tool_make_link/tool_make_link_multi for the sole child of an <a>', () => {
    const container = buildContainer()
    const a = createSvgEl('a')
    const group = createSvgEl('g', {}, a)
    const topPanel = makeTopPanel(container, group, { getHref: () => 'https://example.com' })

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_make_link').style.display).not.toBe('none')
    expect(container.querySelector('.tool_make_link_multi').style.display).not.toBe('none')
  })

  it('hides tool_make_link/tool_make_link_multi for a non-linked element', () => {
    const container = buildContainer()
    const group = createSvgEl('g')
    const topPanel = makeTopPanel(container, group)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_make_link').style.display).toBe('none')
    expect(container.querySelector('.tool_make_link_multi').style.display).toBe('none')
  })
})

describe('TopPanel: image_url field visibility (class-selector fix)', () => {
  it('hides image_url for a data URI', () => {
    const container = buildContainer()
    const topPanel = makeTopPanel(container, null)

    topPanel.setImageURL('data:image/png;base64,AAAA')

    expect(container.querySelector('.image_url').style.display).toBe('none')
  })

  it('shows image_url for a regular URL', () => {
    const container = buildContainer()
    const topPanel = makeTopPanel(container, null, {
      embedImage: () => Promise.resolve(),
      setMode: () => {},
      selectOnly: () => {}
    })

    topPanel.setImageURL('https://example.com/image.png')

    expect(container.querySelector('.image_url').style.display).not.toBe('none')
  })
})
