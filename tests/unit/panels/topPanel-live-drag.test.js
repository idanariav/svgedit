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
  const ids = [
    'se-cmenu_canvas', 'angle', 'blur', 'selected_x', 'selected_y',
    'tool_topath', 'tool_smooth_path', 'tool_stroke_to_path',
    'tool_path_offset', 'clipmask_feather', 'rect_width', 'rect_height',
    'rect_rx', 'circle_cx', 'circle_cy', 'circle_r', 'circle_arc',
    'ellipse_cx', 'ellipse_cy', 'ellipse_rx', 'ellipse_ry', 'ellipse_arc',
    'line_x1', 'line_y1', 'line_x2', 'line_y2', 'image_width', 'image_height',
    'tool_image_crop', 'g_title', 'link_url', 'tool_make_link',
    'tool_make_link_multi', 'frame_name', 'tool_undo', 'tool_redo',
    'selLayerNames', 'arrange_switch'
  ]
  ids.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    container.append(el)
  })
  const rectPanel = document.createElement('div')
  rectPanel.className = 'rect_panel'
  container.append(rectPanel)
  document.body.append(container)
  return container
}

const makeTopPanel = (container, { elem = null, getStrokedBBox = () => null } = {}) => {
  const $id = (id) => container.querySelector(`[id="${id}"]`)
  const $qa = (sel) => [...container.querySelectorAll(sel)]
  const editor = {
    $id,
    $qa,
    selectedElement: elem,
    multiselected: false,
    configObj: { curConfig: { baseUnit: 'px' } },
    svgCanvas: {
      getRotationAngle: () => 0,
      getBlur: () => 0,
      getCurrentDrawing: () => ({ getCurrentLayerName: () => 'Layer 1' }),
      getMode: () => 'select',
      getSelectedElements: () => (elem ? [elem] : []),
      getStrokedBBox,
      hasVisibleStroke: () => false,
      isImageCropEligible: () => false,
      undoMgr: { getUndoStackSize: () => 0, getRedoStackSize: () => 0 }
    }
  }
  return new TopPanel(editor)
}

const createEl = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)))
  document.body.append(el)
  return el
}

describe('TopPanel: live position/dimension readout during drag', () => {
  it('updateLiveMove shifts selected_x/selected_y for a rect by the live delta', () => {
    const container = buildContainer()
    const rect = createEl('rect', { x: 100, y: 100, width: 150, height: 100 })
    const topPanel = makeTopPanel(container, { elem: rect })

    topPanel.updateLiveMove(rect, 30, 20)

    expect(container.querySelector('[id="selected_x"]').value).toBe(130)
    expect(container.querySelector('[id="selected_y"]').value).toBe(120)
    // The real attribute is untouched until mouseup bakes it.
    expect(rect.getAttribute('x')).toBe('100')
  })

  it('updateLiveMove shifts circle_cx/circle_cy for a circle', () => {
    const container = buildContainer()
    const circle = createEl('circle', { cx: 50, cy: 50, r: 20 })
    const topPanel = makeTopPanel(container, { elem: circle })

    topPanel.updateLiveMove(circle, -10, 5)

    expect(container.querySelector('[id="circle_cx"]').value).toBe(40)
    expect(container.querySelector('[id="circle_cy"]').value).toBe(55)
  })

  it('updateLiveMove shifts all four line endpoints', () => {
    const container = buildContainer()
    const line = createEl('line', { x1: 0, y1: 0, x2: 100, y2: 50 })
    const topPanel = makeTopPanel(container, { elem: line })

    topPanel.updateLiveMove(line, 5, 5)

    expect(container.querySelector('[id="line_x1"]').value).toBe(5)
    expect(container.querySelector('[id="line_y1"]').value).toBe(5)
    expect(container.querySelector('[id="line_x2"]').value).toBe(105)
    expect(container.querySelector('[id="line_y2"]').value).toBe(55)
  })

  it('updateLiveResize applies the anchor-based scale to rect x/y/width/height', () => {
    const container = buildContainer()
    const rect = createEl('rect', { x: 100, y: 100, width: 150, height: 100 })
    const topPanel = makeTopPanel(container, { elem: rect })

    // Dragging the SE grip: anchor stays at the NW corner (tx=ty=0).
    topPanel.updateLiveResize(rect, { left: 100, top: 100, width: 150, height: 100, tx: 0, ty: 0, sx: 1.2, sy: 1.1 })

    expect(container.querySelector('[id="selected_x"]').value).toBe(100)
    expect(container.querySelector('[id="selected_y"]').value).toBe(100)
    expect(container.querySelector('[id="rect_width"]').value).toBe(180)
    expect(container.querySelector('[id="rect_height"]').value).toBe(110)
  })

  it('updateLiveResize keeps the opposite corner fixed when dragging the NW grip', () => {
    const container = buildContainer()
    const rect = createEl('rect', { x: 100, y: 100, width: 150, height: 100 })
    const topPanel = makeTopPanel(container, { elem: rect })

    // Dragging the NW grip: anchor is the SE corner (tx=width, ty=height).
    topPanel.updateLiveResize(rect, { left: 100, top: 100, width: 150, height: 100, tx: 150, ty: 100, sx: 0.5, sy: 0.5 })

    // Fixed corner (250,200) minus the new half-size.
    expect(container.querySelector('[id="selected_x"]').value).toBe(175)
    expect(container.querySelector('[id="selected_y"]').value).toBe(150)
    expect(container.querySelector('[id="rect_width"]').value).toBe(75)
    expect(container.querySelector('[id="rect_height"]').value).toBe(50)
  })

  it('rounds long floating-point results to one decimal place', () => {
    const container = buildContainer()
    const rect = createEl('rect', { x: 100, y: 100, width: '200.00000596046448', height: '129.99999523162842' })
    const topPanel = makeTopPanel(container, { elem: rect })

    topPanel.updateContextPanel()

    expect(container.querySelector('[id="rect_width"]').value).toBe(200)
    expect(container.querySelector('[id="rect_height"]').value).toBe(130)
  })
})
