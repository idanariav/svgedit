import { describe, it, expect, afterEach } from 'vitest'
import { applyUiMode, toUiMode } from '../../src/editor/uiMode.ts'
import { setActiveEditor } from '../../src/editor/domScope.ts'

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

describe('uiMode.applyUiMode mobile', () => {
  afterEach(() => { document.body.textContent = '' })

  it('sets exactly one shell class, and none for desktop', () => {
    const el = document.createElement('div')
    el.className = 'svg_editor'
    document.body.append(el)

    applyUiMode('mobile', el)
    expect(el.classList.contains('ui-mobile')).toBe(true)
    expect(el.classList.contains('ui-tablet')).toBe(false)

    applyUiMode('tablet', el)
    expect(el.classList.contains('ui-mobile')).toBe(false)
    expect(el.classList.contains('ui-tablet')).toBe(true)

    applyUiMode('desktop', el)
    expect(el.classList.contains('ui-mobile')).toBe(false)
    expect(el.classList.contains('ui-tablet')).toBe(false)
  })
})

describe('uiMode.toUiMode', () => {
  it('passes the three modes through', () => {
    expect(toUiMode('desktop')).toBe('desktop')
    expect(toUiMode('tablet')).toBe('tablet')
    expect(toUiMode('mobile')).toBe('mobile')
  })

  it('reads the legacy tabletMode boolean, persisted or real', () => {
    expect(toUiMode('true')).toBe('tablet')
    expect(toUiMode(true)).toBe('tablet')
    // the persisted string "false" is desktop, not truthy
    expect(toUiMode('false')).toBe('desktop')
    expect(toUiMode(false)).toBe('desktop')
  })

  it('falls back to desktop for anything else', () => {
    expect(toUiMode(undefined)).toBe('desktop')
    expect(toUiMode('phone')).toBe('desktop')
  })
})
