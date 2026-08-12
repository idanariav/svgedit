import { afterEach, describe, expect, it, vi } from 'vitest'

// RightPanel.js only needs `$click` from `@svgedit/svgcanvas` at module scope
// (used in init(), not populateLayers()). The real package resolves to the
// built dist bundle and drags in `paper`/Canvas 2D, which this test env
// doesn't have — mock it out like the TopPanel image-panel test does.
vi.mock('@svgedit/svgcanvas', () => ({
  default: { $click: () => {} }
}))

const { default: RightPanel } = await import('../../../src/editor/panels/RightPanel.js')

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Minimal DOM + editor stub covering everything `populateLayers()` touches:
 * the layer list table, the "move to" select, and a fake Drawing whose layer
 * groups are real SVG <g> elements (so `getAttribute('id')`/`setAttribute`
 * behave like the genuine canvas groups).
 */
const buildEditor = (layerGroups) => {
  const container = document.createElement('div')

  const layerlist = document.createElement('table')
  layerlist.id = 'layerlist'
  const tbody = document.createElement('tbody')
  layerlist.append(tbody)
  container.append(layerlist)

  const selLayerNames = document.createElement('div')
  selLayerNames.id = 'selLayerNames'
  selLayerNames.setAttribute = selLayerNames.setAttribute.bind(selLayerNames)
  selLayerNames.addOption = vi.fn()
  container.append(selLayerNames)

  document.body.append(container)

  const $id = (id) => container.querySelector(`[id="${id}"]`) || (id === 'selLayerNames' ? selLayerNames : null)

  const names = Object.keys(layerGroups)
  const drawing = {
    getCurrentLayerName: () => names[0],
    getNumLayers: () => names.length,
    getLayerName: (i) => names[i],
    getLayerVisibility: () => true,
    getLayerLocked: () => false,
    getLayerComment: () => false,
    getLayerByName: (name) => layerGroups[name]
  }

  let nextId = 1
  const editor = {
    $id,
    i18next: { t: (key) => key },
    topPanel: { updateContextPanel: () => {} },
    svgCanvas: {
      clearSelection: () => {},
      getCurrentDrawing: () => drawing,
      getNextId: () => `svg_${nextId++}`,
      getResolution: () => ({ w: 640, h: 480 }),
      runExtensions: () => {}
    }
  }
  return editor
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RightPanel: layer preview thumbnail', () => {
  it('renders a <use> pointing at the layer group, stamping an id if missing', () => {
    const group = document.createElementNS(SVG_NS, 'g')
    const editor = buildEditor({ 'Layer 1': group })
    const rightPanel = new RightPanel(editor)

    expect(group.getAttribute('id')).toBeNull()
    rightPanel.populateLayers()

    const row = document.querySelector('#layerlist tr.layer')
    const preview = row.querySelector('td.layerpreview')
    const thumb = preview.querySelector('svg.layerpreview-thumb')
    const use = thumb.querySelector('use')

    expect(thumb.getAttribute('viewBox')).toBe('0 0 640 480')
    const stampedId = group.getAttribute('id')
    expect(stampedId).toBeTruthy()
    expect(use.getAttribute('href')).toBe(`#${stampedId}`)
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(`#${stampedId}`)
  })

  it('reuses an existing group id instead of stamping a new one', () => {
    const group = document.createElementNS(SVG_NS, 'g')
    group.setAttribute('id', 'existing_id')
    const editor = buildEditor({ 'Layer 1': group })
    const rightPanel = new RightPanel(editor)

    rightPanel.populateLayers()

    expect(group.getAttribute('id')).toBe('existing_id')
    const use = document.querySelector('#layerlist td.layerpreview use')
    expect(use.getAttribute('href')).toBe('#existing_id')
  })

  it('builds one preview cell per layer, in reverse z-order', () => {
    const groupA = document.createElementNS(SVG_NS, 'g')
    const groupB = document.createElementNS(SVG_NS, 'g')
    const editor = buildEditor({ 'Layer 1': groupA, 'Layer 2': groupB })
    const rightPanel = new RightPanel(editor)

    rightPanel.populateLayers()

    const rows = [...document.querySelectorAll('#layerlist tr.layer')]
    expect(rows).toHaveLength(2)
    rows.forEach((row) => {
      const preview = row.querySelector('td.layerpreview')
      expect(preview?.querySelector('svg.layerpreview-thumb')).toBeTruthy()
      expect(preview?.querySelector('use')).toBeTruthy()
    })
  })
})
