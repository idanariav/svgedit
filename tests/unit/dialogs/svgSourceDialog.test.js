import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../../../src/editor/dialogs/svgSourceDialog.ts'

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
}

const mount = () => {
  const container = document.createElement('div')
  container.setAttribute('data-svgedit-root', '')
  container.innerHTML = '<div class="svg_editor theme-light"></div>'
  const dialog = document.createElement('se-svg-source-editor-dialog')
  container.append(dialog)
  document.body.append(container)
  const changes = vi.fn()
  dialog.addEventListener('change', (e) => changes(e.detail))
  return { dialog, changes, native: dialog.shadowRoot.querySelector('dialog') }
}

describe('se-svg-source-editor-dialog native close', () => {
  // the constructor reads the owning editor's config (falls back to window.svgEditor)
  beforeEach(() => { window.svgEditor = { configObj: { curConfig: { dynamicOutput: false } } } })
  afterEach(() => {
    document.body.innerHTML = ''
    delete window.svgEditor
  })

  it('cancels when the browser closes it (Escape) while it is open', () => {
    const { dialog, changes, native } = mount()
    dialog.setAttribute('dialog', 'open')
    native.removeAttribute('open') // what Escape does, before the queued close event
    native.dispatchEvent(new Event('close'))
    expect(changes).toHaveBeenCalledWith({ dialog: 'closed' })
  })

  it('ignores the close event that follows its own close', () => {
    const { dialog, changes, native } = mount()
    dialog.setAttribute('dialog', 'open')
    dialog.setAttribute('dialog', 'closed')
    native.dispatchEvent(new Event('close'))
    expect(changes).not.toHaveBeenCalled()
  })

  it('a stale close event from before a reopen leaves the reopened dialog alone', () => {
    const { dialog, changes, native } = mount()
    dialog.setAttribute('dialog', 'open')
    dialog.setAttribute('dialog', 'closed')
    dialog.setAttribute('dialog', 'open') // reopened before the queued close event ran
    native.dispatchEvent(new Event('close'))
    expect(changes).not.toHaveBeenCalled()
    expect(native.open).toBe(true)
  })
})
