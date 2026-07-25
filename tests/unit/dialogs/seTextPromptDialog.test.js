import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from '../components/testUtils.js'
import '../../../src/editor/dialogs/seTextPromptDialog.js'

// jsdom doesn't implement <dialog>'s showModal()/close() (only the plain
// `open` attribute reflection). Polyfill just enough for prompt()'s
// showModal()/close() calls to be testable.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

function makeMountedEditor () {
  const container = document.createElement('div')
  container.setAttribute('data-svgedit-root', '')
  const dialog = document.createElement('se-text-prompt-dialog')
  container.append(dialog)
  document.body.append(container)
  return { container, dialog }
}

describe('sePrompt (window.sePrompt, defined in seTextPromptDialog.js)', () => {
  beforeEach(() => {
    installMockSvgEditor()
  })

  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('opens the scoped editor\'s own dialog, not another mounted editor\'s', async () => {
    const editorA = makeMountedEditor()
    const editorB = makeMountedEditor()

    // Regression guard: sePrompt used to fall back to a bare
    // document.querySelector('se-text-prompt-dialog') whenever the scoped
    // lookup came up empty, which -- with 2+ editors mounted -- silently
    // grabbed whichever editor's dialog happened to be first in the document,
    // instead of the caller's own.
    window.sePrompt('Enter a name', '', {}, editorB.container)

    expect(editorB.dialog.$dialog.hasAttribute('open')).toBe(true)
    expect(editorA.dialog.$dialog.hasAttribute('open')).toBe(false)
  })

  it('resolves null instead of falling through to a different editor when the scoped container has no dialog of its own', async () => {
    // A container with a root marker but no se-text-prompt-dialog inside it
    // (e.g. called before EditorStartup finishes mounting dialogs).
    const bareContainer = document.createElement('div')
    bareContainer.setAttribute('data-svgedit-root', '')
    document.body.append(bareContainer)
    // A different, fully-mounted editor also in the document.
    const other = makeMountedEditor()

    const result = await window.sePrompt('Enter a name', '', {}, bareContainer)

    expect(result).toBeNull()
    expect(other.dialog.$dialog.hasAttribute('open')).toBe(false)
  })

  it('falls back to the document-wide dialog for standalone (no scopeEl) use', () => {
    const solo = makeMountedEditor()

    window.sePrompt('Enter a name', '', {})

    expect(solo.dialog.$dialog.hasAttribute('open')).toBe(true)
  })
})
