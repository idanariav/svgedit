import { describe, it, expect, afterEach } from 'vitest'
import { applyTheme, syncDialogTheme } from '../../src/editor/themeUtil.js'
import { setActiveEditor } from '../../src/editor/domScope.js'

describe('themeUtil.applyTheme', () => {
  afterEach(() => {
    setActiveEditor(null)
    document.body.textContent = ''
  })

  it('applies to an explicit rootEl regardless of what else is mounted', () => {
    const explicit = document.createElement('div')
    explicit.className = 'svg_editor'
    document.body.append(explicit)

    applyTheme('dark', explicit)

    expect(explicit.classList.contains('theme-dark')).toBe(true)
    expect(explicit.classList.contains('theme-light')).toBe(false)
  })

  it('toggling back to light removes theme-dark and adds theme-light', () => {
    const explicit = document.createElement('div')
    explicit.className = 'svg_editor theme-dark'
    document.body.append(explicit)

    applyTheme('light', explicit)

    expect(explicit.classList.contains('theme-dark')).toBe(false)
    expect(explicit.classList.contains('theme-light')).toBe(true)
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

    // Regression guard: this used to always resolve to `first` via a bare
    // document.querySelector('.svg_editor'), even when `second` is the editor
    // the host actually meant.
    setActiveEditor({ $container: second.container })

    applyTheme('dark')

    expect(second.svgEditorEl.classList.contains('theme-dark')).toBe(true)
    expect(first.svgEditorEl.classList.contains('theme-dark')).toBe(false)
  })

  it('without a rootEl and no active editor, falls back to the first .svg_editor', () => {
    const first = document.createElement('div')
    first.className = 'svg_editor'
    document.body.append(first)

    applyTheme('dark')

    expect(first.classList.contains('theme-dark')).toBe(true)
  })

  it('is a no-op when no .svg_editor can be resolved', () => {
    expect(() => applyTheme('dark')).not.toThrow()
  })
})

describe('themeUtil.syncDialogTheme', () => {
  afterEach(() => {
    setActiveEditor(null)
    document.body.textContent = ''
  })

  const mount = (rootStyle = '') => {
    const container = document.createElement('div')
    container.setAttribute('data-svgedit-root', '')
    const editor = document.createElement('div')
    editor.className = 'svg_editor theme-dark'
    editor.setAttribute('style', rootStyle)
    const dialog = document.createElement('div')
    container.append(editor, dialog) // a sibling of .svg_editor, like the real dialogs
    document.body.append(container)
    return { editor, dialog }
  }

  it('mirrors the editor theme class onto the dialog', () => {
    const { dialog } = mount()
    syncDialogTheme(dialog)
    expect(dialog.classList.contains('theme-dark')).toBe(true)
    expect(dialog.classList.contains('theme-light')).toBe(false)
  })

  it('carries a host\'s token overrides from .svg_editor onto the dialog', () => {
    const { dialog } = mount('--accent: #ff00aa; --fg: rgb(1, 2, 3)')
    syncDialogTheme(dialog)
    expect(dialog.style.getPropertyValue('--accent')).toBe('#ff00aa')
    expect(dialog.style.getPropertyValue('--fg')).toBe('rgb(1, 2, 3)')
    // tokens the host didn't set are left to the dialog's own stylesheet rules
    expect(dialog.style.getPropertyValue('--muted')).toBe('')
  })
})
