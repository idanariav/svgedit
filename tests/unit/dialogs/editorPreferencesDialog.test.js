import { describe, it, expect, afterEach } from 'vitest'
import '../../../src/editor/dialogs/editorPreferencesDialog.js'

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
}

const mount = (dark) => {
  const container = document.createElement('div')
  container.setAttribute('data-svgedit-root', '')
  container.innerHTML = `<div class="svg_editor ${dark ? 'theme-dark' : 'theme-light'}"></div>`
  const dialog = document.createElement('se-edit-prefs-dialog')
  container.append(dialog)
  document.body.append(container)
  return dialog
}

describe('se-edit-prefs-dialog theme', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('mirrors a dark editor onto the host when opened', () => {
    const dialog = mount(true)
    dialog.setAttribute('dialog', 'open')
    expect(dialog.classList.contains('theme-dark')).toBe(true)
  })

  it('drops theme-dark when the editor is light', () => {
    const dialog = mount(false)
    dialog.classList.add('theme-dark')
    dialog.setAttribute('dialog', 'open')
    expect(dialog.classList.contains('theme-dark')).toBe(false)
  })
})
