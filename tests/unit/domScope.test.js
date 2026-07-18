import { describe, it, expect, afterEach } from 'vitest'
import { setActiveEditor, clearActiveEditor, isActiveEditor } from '../../src/editor/domScope.js'

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
})
