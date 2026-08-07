import { describe, expect, it, vi } from 'vitest'

// TopPanel.js imports `@svgedit/svgcanvas` only to destructure a few static
// helpers ($click/isValidUnit/getTypeMap/convertUnit), none of which
// `updateContextPanel()` touches. The real package resolves to the *built*
// dist bundle (packages/svgcanvas/dist/svgcanvas.js), which pulls in the real
// `paper` lib and needs a working Canvas 2D context this test env doesn't
// have — mock it out rather than drag that whole chain in.
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
 * Builds the minimal set of DOM elements `TopPanel#updateContextPanel()`
 * unconditionally touches for a single-image selection and a multi-selection,
 * without pulling in the real TopPanel.html/RightPanel.html templates (which
 * would require registering every `se-*` custom element). Ids mirror the
 * real markup exactly; values are asserted, not the custom-element behavior.
 */
const buildContainer = () => {
  const container = document.createElement('div')
  const ids = [
    'se-cmenu_canvas', 'angle', 'blur', 'selected_x', 'selected_y',
    'image_width', 'image_height', 'tool_image_crop',
    'tool_undo', 'tool_redo', 'selLayerNames', 'arrange_switch'
  ]
  ids.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    container.append(el)
  })
  const imagePanel = document.createElement('div')
  imagePanel.className = 'image_panel'
  imagePanel.append(container.querySelector('[id="image_width"]'))
  imagePanel.append(container.querySelector('[id="image_height"]'))
  imagePanel.append(container.querySelector('[id="tool_image_crop"]'))
  container.append(imagePanel)
  document.body.append(container)
  return container
}

const makeTopPanel = (container, { elem = null, multiselected = false, selectedElements = [], isImageCropEligible = () => false } = {}) => {
  const $id = (id) => container.querySelector(`[id="${id}"]`)
  const $qa = (sel) => [...container.querySelectorAll(sel)]
  const editor = {
    $id,
    $qa,
    selectedElement: elem,
    multiselected,
    configObj: { curConfig: { baseUnit: 'px' } },
    svgCanvas: {
      getRotationAngle: () => 0,
      getBlur: () => 0,
      getCurrentDrawing: () => ({ getCurrentLayerName: () => 'Layer 1' }),
      getMode: () => 'select',
      getSelectedElements: () => selectedElements,
      isImageCropEligible,
      hasVisibleStroke: () => false,
      undoMgr: { getUndoStackSize: () => 0, getRedoStackSize: () => 0 }
    }
  }
  const topPanel = new TopPanel(editor)
  return topPanel
}

const createImage = (attrs = {}) => {
  const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
  Object.entries(attrs).forEach(([k, v]) => image.setAttribute(k, String(v)))
  document.body.append(image)
  return image
}

describe('TopPanel: Image Crop button visibility', () => {
  it('shows tool_image_crop for a single eligible image', () => {
    const container = buildContainer()
    const image = createImage({ x: 0, y: 0, width: 100, height: 50 })
    const topPanel = makeTopPanel(container, { elem: image, isImageCropEligible: () => true })

    topPanel.updateContextPanel()

    expect(container.querySelector('[id="tool_image_crop"]').style.display).toBe('')
    expect(container.querySelector('.image_panel').style.display).not.toBe('none')
  })

  it('hides tool_image_crop for a vault-linked image', () => {
    const container = buildContainer()
    const image = createImage({ x: 0, y: 0, width: 100, height: 50, 'data-vault-link': 'notes/foo.png' })
    const topPanel = makeTopPanel(container, { elem: image, isImageCropEligible: () => false })

    topPanel.updateContextPanel()

    expect(container.querySelector('[id="tool_image_crop"]').style.display).toBe('none')
  })

  it('hides tool_image_crop for a transformed (rotated) image', () => {
    const container = buildContainer()
    const image = createImage({ x: 0, y: 0, width: 100, height: 50, transform: 'rotate(45)' })
    const topPanel = makeTopPanel(container, { elem: image, isImageCropEligible: () => false })

    topPanel.updateContextPanel()

    expect(container.querySelector('[id="tool_image_crop"]').style.display).toBe('none')
  })

  it('hides the whole image_panel tray when nothing is selected', () => {
    const container = buildContainer()
    const topPanel = makeTopPanel(container, { elem: null, multiselected: false })

    topPanel.updateContextPanel()

    expect(container.querySelector('.image_panel').style.display).toBe('none')
  })

  it('hides the whole image_panel tray for a multi-selection of images', () => {
    const container = buildContainer()
    const img1 = createImage({ x: 0, y: 0, width: 100, height: 50 })
    const img2 = createImage({ x: 0, y: 0, width: 100, height: 50 })
    const topPanel = makeTopPanel(container, {
      elem: null,
      multiselected: true,
      selectedElements: [img1, img2]
    })

    topPanel.updateContextPanel()

    expect(container.querySelector('.image_panel').style.display).toBe('none')
  })
})
