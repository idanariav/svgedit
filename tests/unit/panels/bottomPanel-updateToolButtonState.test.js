import { describe, expect, it } from 'vitest'

const { default: BottomPanel } = await import('../../../src/editor/panels/BottomPanel.js')

// Buttons referenced by updateToolButtonState must match the real ids in
// LeftPanel.html. The left-panel "merge shape tools" refactor collapsed the
// separate tools_rect/tools_ellipse flyouts into a single tools_shapes
// flyout, but this list still pointed at the old ids — $id() returned null
// and `.disabled = ...` threw, aborting TopPanel.update() mid-selection and
// leaving the right panel stuck showing only stroke width/opacity.
const buildContainer = () => {
  const container = document.createElement('div')
  const ids = ['tool_fhpath', 'tool_line', 'tools_shapes', 'tool_text', 'tool_path']
  ids.forEach((id) => {
    const el = document.createElement('div')
    el.setAttribute('id', id)
    el.disabled = false
    el.pressed = false
    container.append(el)
  })
  document.body.append(container)
  return container
}

const makeBottomPanel = (container, { fill = '#000000', stroke = '#000000' } = {}) => {
  const $id = (id) => container.querySelector(`[id="${id}"]`)
  const editor = {
    $id,
    leftPanel: { clickSelect: () => {} },
    svgCanvas: {
      getColor: (type) => (type === 'fill' ? fill : stroke),
      runExtensions: () => {}
    }
  }
  return new BottomPanel(editor)
}

describe('BottomPanel.updateToolButtonState', () => {
  it('does not throw and disables shape/text/path tools when fill and stroke are both none', () => {
    const container = buildContainer()
    const bottomPanel = makeBottomPanel(container, { fill: 'none', stroke: 'none' })

    expect(() => bottomPanel.updateToolButtonState()).not.toThrow()

    ;['tools_shapes', 'tool_text', 'tool_path'].forEach((id) => {
      expect(container.querySelector(`[id="${id}"]`).disabled).toBe(true)
    })
  })

  it('re-enables shape/text/path tools once fill or stroke is set', () => {
    const container = buildContainer()
    const bottomPanel = makeBottomPanel(container, { fill: '#ff0000', stroke: 'none' })

    bottomPanel.updateToolButtonState()

    ;['tools_shapes', 'tool_text', 'tool_path'].forEach((id) => {
      expect(container.querySelector(`[id="${id}"]`).disabled).toBe(false)
    })
  })
})
