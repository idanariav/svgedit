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
const { hasVisibleStroke } = await import('../../../packages/svgcanvas/core/path-offset.js')

/**
 * Builds the minimal DOM `TopPanel#updateContextPanel()` touches for a
 * single rect/path selection. `tool_topath`, `tool_reorient`,
 * `tool_smooth_path` and `tool_stroke_to_path` carry both an `id` and a
 * matching class, mirroring RightPanel.html — `hideTool`/`displayTool`
 * select elements by class, not id.
 */
const buildContainer = () => {
  const container = document.createElement('div')
  const ids = [
    'se-cmenu_canvas', 'angle', 'blur', 'selected_x', 'selected_y',
    'tool_undo', 'tool_redo', 'selLayerNames', 'rect_rx', 'rect_width', 'rect_height'
  ]
  ids.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    container.append(el)
  })

  const classIds = ['tool_topath', 'tool_reorient', 'tool_smooth_path', 'tool_stroke_to_path', 'tool_path_offset']
  classIds.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    el.className = id
    container.append(el)
  })

  const selectedPanel = document.createElement('div')
  selectedPanel.className = 'selected_panel'
  container.append(selectedPanel)

  const rectPanel = document.createElement('div')
  rectPanel.className = 'rect_panel'
  rectPanel.append(container.querySelector('[id="rect_rx"]'))
  rectPanel.append(container.querySelector('[id="rect_width"]'))
  rectPanel.append(container.querySelector('[id="rect_height"]'))
  container.append(rectPanel)

  document.body.append(container)
  return container
}

const makeTopPanel = (container, elem, { angle = 0 } = {}) => {
  const $id = (id) => container.querySelector(`[id="${id}"]`)
  const $qa = (sel) => [...container.querySelectorAll(sel)]
  const editor = {
    $id,
    $qa,
    selectedElement: elem,
    multiselected: false,
    configObj: { curConfig: { baseUnit: 'px' } },
    svgCanvas: {
      getRotationAngle: () => angle,
      setRotationAngle: () => {},
      getBlur: () => 0,
      getCurrentDrawing: () => ({ getCurrentLayerName: () => 'Layer 1' }),
      getMode: () => 'select',
      getSelectedElements: () => [],
      getStrokedBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      hasVisibleStroke,
      undoMgr: { getUndoStackSize: () => 0, getRedoStackSize: () => 0 }
    }
  }
  return new TopPanel(editor)
}

const createSvgEl = (tagName, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tagName)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)))
  document.body.append(el)
  return el
}

describe('TopPanel: path/stroke tool visibility', () => {
  it('shows tool_topath and hides tool_reorient/tool_smooth_path for a rect', () => {
    const container = buildContainer()
    const rect = createSvgEl('rect', { x: 0, y: 0, width: 50, height: 50 })
    const topPanel = makeTopPanel(container, rect)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_topath').style.display).not.toBe('none')
    expect(container.querySelector('.tool_reorient').style.display).toBe('none')
    expect(container.querySelector('.tool_smooth_path').style.display).toBe('none')
    expect(container.querySelector('.tool_path_offset').style.display).toBe('none')
  })

  it('hides tool_topath and shows tool_reorient/tool_path_offset for a path', () => {
    const container = buildContainer()
    const path = createSvgEl('path', { d: 'M0,0 L10,10' })
    const topPanel = makeTopPanel(container, path)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_topath').style.display).toBe('none')
    expect(container.querySelector('.tool_reorient').style.display).not.toBe('none')
    expect(container.querySelector('.tool_path_offset').style.display).not.toBe('none')
  })

  it('hides tool_smooth_path for a regular (non-freehand) path', () => {
    const container = buildContainer()
    // e.g. drawn node-by-node with the Path tool, or produced by Convert to
    // Path — curve-fit smoothing distorts its deliberately-placed nodes.
    const path = createSvgEl('path', { d: 'M0,0 L10,10' })
    const topPanel = makeTopPanel(container, path)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_smooth_path').style.display).toBe('none')
  })

  it('shows tool_smooth_path for a freehand-drawn path', () => {
    const container = buildContainer()
    const path = createSvgEl('path', { d: 'M0,0 L10,10', 'data-freehand': '1' })
    const topPanel = makeTopPanel(container, path)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_smooth_path').style.display).not.toBe('none')
  })

  it('hides tool_stroke_to_path for a path even with a visible stroke', () => {
    const container = buildContainer()
    const path = createSvgEl('path', { d: 'M0,0 L10,10', stroke: 'blue', 'stroke-width': 2 })
    const topPanel = makeTopPanel(container, path)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_stroke_to_path').style.display).toBe('none')
  })

  it('shows tool_stroke_to_path for a non-path element with a visible stroke', () => {
    const container = buildContainer()
    const rect = createSvgEl('rect', {
      x: 0, y: 0, width: 50, height: 50, stroke: 'blue', 'stroke-width': 2
    })
    const topPanel = makeTopPanel(container, rect)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_stroke_to_path').style.display).not.toBe('none')
  })

  it('hides tool_stroke_to_path when stroke is none', () => {
    const container = buildContainer()
    const rect = createSvgEl('rect', {
      x: 0, y: 0, width: 50, height: 50, stroke: 'none', 'stroke-width': 2
    })
    const topPanel = makeTopPanel(container, rect)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_stroke_to_path').style.display).toBe('none')
  })

  it('hides tool_stroke_to_path when stroke-width is 0', () => {
    const container = buildContainer()
    const rect = createSvgEl('rect', {
      x: 0, y: 0, width: 50, height: 50, stroke: 'blue', 'stroke-width': 0
    })
    const topPanel = makeTopPanel(container, rect)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_stroke_to_path').style.display).toBe('none')
  })

  it('hides tool_stroke_to_path when stroke-opacity is 0', () => {
    const container = buildContainer()
    const rect = createSvgEl('rect', {
      x: 0, y: 0, width: 50, height: 50, stroke: 'blue', 'stroke-width': 2, 'stroke-opacity': 0
    })
    const topPanel = makeTopPanel(container, rect)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_stroke_to_path').style.display).toBe('none')
  })

  it('shows tool_stroke_to_path when stroke-width is absent (defaults to the SVG initial value of 1)', () => {
    const container = buildContainer()
    // cleanupElement() strips stroke-width="1" entirely, since that's the
    // SVG spec's initial value — the element still has a visible 1px stroke.
    const rect = createSvgEl('rect', { x: 0, y: 0, width: 50, height: 50, stroke: 'blue' })
    const topPanel = makeTopPanel(container, rect)

    topPanel.updateContextPanel()

    expect(container.querySelector('.tool_stroke_to_path').style.display).not.toBe('none')
  })

  it('disables tool_reorient for a path with no rotation', () => {
    const container = buildContainer()
    const path = createSvgEl('path', { d: 'M0,0 L10,10' })
    const topPanel = makeTopPanel(container, path, { angle: 0 })

    topPanel.updateContextPanel()

    expect(container.querySelector('[id="tool_reorient"]').disabled).toBe(true)
  })

  it('enables tool_reorient for a rotated path', () => {
    const container = buildContainer()
    const path = createSvgEl('path', { d: 'M0,0 L10,10', transform: 'rotate(30)' })
    const topPanel = makeTopPanel(container, path, { angle: 30 })

    topPanel.updateContextPanel()

    expect(container.querySelector('[id="tool_reorient"]').disabled).toBe(false)
  })

  it('changeRotationAngle sets tool_reorient.disabled via the property, not classList', () => {
    const container = buildContainer()
    const path = createSvgEl('path', { d: 'M0,0 L10,10' })
    const topPanel = makeTopPanel(container, path)

    topPanel.changeRotationAngle({ target: { value: '0' } })
    expect(container.querySelector('[id="tool_reorient"]').disabled).toBe(true)

    topPanel.changeRotationAngle({ target: { value: '45' } })
    expect(container.querySelector('[id="tool_reorient"]').disabled).toBe(false)
  })
})
