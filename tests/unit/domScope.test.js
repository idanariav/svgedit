import { describe, it, expect, afterEach } from 'vitest'
import { setActiveEditor, clearActiveEditor, isActiveEditor, getActiveRoot } from '../../src/editor/domScope.js'

describe('domScope active-editor tracking', () => {
  afterEach(() => {
    // activeEditor is module-level state; reset between tests.
    setActiveEditor(null)
  })

  it('isActiveEditor allows every editor when none has been activated yet', () => {
    const editorA = {}
    const editorB = {}
    expect(isActiveEditor(editorA)).toBe(true)
    expect(isActiveEditor(editorB)).toBe(true)
  })

  it('isActiveEditor only allows the activated editor once one is set', () => {
    const editorA = {}
    const editorB = {}
    setActiveEditor(editorA)
    expect(isActiveEditor(editorA)).toBe(true)
    expect(isActiveEditor(editorB)).toBe(false)
  })

  it('clearActiveEditor only clears if the given editor is the active one', () => {
    // Regression guard: Editor.destroy() used to call setActiveEditor(null)
    // unconditionally. With 3+ editors mounted, destroying a background
    // (non-active) editor would null out the active editor anyway, which
    // makes isActiveEditor() return true for every remaining editor (it
    // treats null as "unclaimed, all editors allowed") until the next
    // interaction -- a keyboard shortcut or paste in that window would fire
    // in every mounted editor instead of just the focused one.
    const editorA = {}
    const editorB = {}
    const editorC = {}
    setActiveEditor(editorA)

    clearActiveEditor(editorB) // destroying a non-active editor...
    expect(isActiveEditor(editorA)).toBe(true) // ...must not affect the active one
    expect(isActiveEditor(editorC)).toBe(false)

    clearActiveEditor(editorA) // destroying the actual active editor...
    expect(isActiveEditor(editorB)).toBe(true) // ...correctly reopens "no one is active"
    expect(isActiveEditor(editorC)).toBe(true)
  })

  describe('live focus overrides a stale activeEditor pointer', () => {
    let containerA
    let containerB

    afterEach(() => {
      containerA?.remove()
      containerB?.remove()
    })

    const makeContainer = () => {
      const el = document.createElement('div')
      el.setAttribute('data-svgedit-root', '')
      el.setAttribute('tabindex', '-1')
      document.body.appendChild(el)
      return el
    }

    it('an editor whose container holds live focus is active even if a stale pointer names someone else', () => {
      containerA = makeContainer()
      containerB = makeContainer()
      const editorA = { $container: containerA }
      const editorB = { $container: containerB }

      // Regression guard: a background/leaked editor (or a host that moved
      // focus without a pointerdown/focusin landing in containerB) squats the
      // cached pointer on editorA, while the user is actually interacting
      // with editorB right now.
      setActiveEditor(editorA)
      containerB.focus()

      expect(isActiveEditor(editorB)).toBe(true)
      expect(isActiveEditor(editorA)).toBe(false)
    })

    it('falls back to the cached pointer when nothing inside any editor has focus', () => {
      containerA = makeContainer()
      const editorA = { $container: containerA }
      const editorB = { $container: makeContainer() }
      setActiveEditor(editorA)
      document.body.focus?.()

      expect(isActiveEditor(editorA)).toBe(true)
      expect(isActiveEditor(editorB)).toBe(false)
    })
  })

  describe('getActiveRoot', () => {
    let svgEditorA
    let svgEditorB

    afterEach(() => {
      svgEditorA?.remove()
      svgEditorB?.remove()
    })

    const makeMountedEditor = () => {
      const container = document.createElement('div')
      container.setAttribute('data-svgedit-root', '')
      const svgEditorEl = document.createElement('div')
      svgEditorEl.className = 'svg_editor'
      container.append(svgEditorEl)
      document.body.append(container)
      return { container, svgEditorEl }
    }

    it('prefers the active editor over the first .svg_editor in DOM order', () => {
      const a = makeMountedEditor()
      const b = makeMountedEditor()
      svgEditorA = a.container
      svgEditorB = b.container

      // Regression guard: themeUtil.applyTheme / uiMode.applyUiMode used to
      // default to `document.querySelector('.svg_editor')`, which always
      // resolves to `a` here regardless of which editor a host meant.
      setActiveEditor({ $container: b.container })

      expect(getActiveRoot()).toBe(b.svgEditorEl)
    })

    it('falls back to the first .svg_editor when no editor is active yet', () => {
      const a = makeMountedEditor()
      svgEditorA = a.container

      expect(getActiveRoot()).toBe(a.svgEditorEl)
    })
  })
})
