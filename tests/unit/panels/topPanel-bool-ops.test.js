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

const makeTopPanel = () => {
  const editor = {
    svgCanvas: {
      booleanUnion: vi.fn(),
      booleanIntersect: vi.fn(),
      booleanSubtract: vi.fn(),
      booleanExclude: vi.fn(),
      booleanDivide: vi.fn()
    }
  }
  return { topPanel: new TopPanel(editor), editor }
}

// The `tool_bool_ops` right-panel dropdown (RightPanel.html) replaced five
// separate se-buttons with one se-list; `clickBoolOps` routes its `change`
// event's `detail.value` to the matching boolean-op call, mirroring
// `clickArrange`'s switch-based dispatch for the `tool_arrange` dropdown.
describe('TopPanel: boolean ops dropdown dispatch', () => {
  it.each([
    ['union', 'booleanUnion'],
    ['intersect', 'booleanIntersect'],
    ['subtract', 'booleanSubtract'],
    ['exclude', 'booleanExclude'],
    ['divide', 'booleanDivide']
  ])('routes "%s" to svgCanvas.%s', (value, method) => {
    const { topPanel, editor } = makeTopPanel()
    topPanel.clickBoolOps({ detail: { value } })
    expect(editor.svgCanvas[method]).toHaveBeenCalledTimes(1)
  })

  it('ignores an unrecognized value', () => {
    const { topPanel, editor } = makeTopPanel()
    topPanel.clickBoolOps({ detail: { value: 'nope' } })
    Object.values(editor.svgCanvas).forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })
})
