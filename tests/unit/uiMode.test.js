import { describe, it, expect, afterEach } from 'vitest'
import { applyUiMode, isTabletMode } from '../../src/editor/uiMode.js'
import { setActiveEditor } from '../../src/editor/domScope.js'

describe('uiMode.applyUiMode', () => {
  afterEach(() => {
    setActiveEditor(null)
    document.body.textContent = ''
  })

  it('applies to an explicit rootEl', () => {
    const explicit = document.createElement('div')
    explicit.className = 'svg_editor'
    document.body.append(explicit)

    applyUiMode(true, explicit)

    expect(explicit.classList.contains('ui-tablet')).toBe(true)
  })

  it('without a rootEl, targets the active editor rather than the first .svg_editor in DOM order', () => {
    // Mirrors EditorStartup's real shape: $container wraps a .svg_editor
    // descendant (this.$svgEditor = this.$container.querySelector('.svg_editor')).
    const makeMountedEditor = () => {
      const container = document.createElement('div')
      const svgEditorEl = document.createElement('div')
      svgEditorEl.className = 'svg_editor'
      container.append(svgEditorEl)
      document.body.append(container)
      return { container, svgEditorEl }
    }
    const first = makeMountedEditor()
    const second = makeMountedEditor()

    setActiveEditor({ $container: second.container })

    applyUiMode(true)

    expect(second.svgEditorEl.classList.contains('ui-tablet')).toBe(true)
    expect(first.svgEditorEl.classList.contains('ui-tablet')).toBe(false)
  })

  it('without a rootEl and no active editor, falls back to the first .svg_editor', () => {
    const first = document.createElement('div')
    first.className = 'svg_editor'
    document.body.append(first)

    applyUiMode(true)

    expect(first.classList.contains('ui-tablet')).toBe(true)
  })
})

describe('uiMode.isTabletMode', () => {
  it('treats the persisted string "true" as tablet mode', () => {
    expect(isTabletMode('true')).toBe(true)
  })

  it('treats the persisted string "false" as desktop mode, not truthy', () => {
    expect(isTabletMode('false')).toBe(false)
  })

  it('passes through real booleans', () => {
    expect(isTabletMode(true)).toBe(true)
    expect(isTabletMode(false)).toBe(false)
  })
})
