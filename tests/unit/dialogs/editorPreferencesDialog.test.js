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

describe('se-edit-prefs-dialog theme preference', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('reflects the theme attribute and reports the chosen theme on save', () => {
    const dialog = mount(false)
    dialog.setAttribute('theme', 'dark')
    expect(dialog.$theme.value).toBe('dark')
    let detail
    dialog.addEventListener('change', (e) => { detail = e.detail })
    dialog.$theme.value = 'light'
    dialog.$saveBtn.click()
    expect(detail.theme).toBe('light')
  })
})

describe('se-edit-prefs-dialog scrub preference', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('shows the translated label and reports the checkbox on save', () => {
    const dialog = mount(false)
    dialog.init({ t: (key) => key })
    expect(dialog.shadowRoot.querySelector('#svginfo_scrub').textContent).toBe('config.scrub_fields')
    dialog.scrubFields = true
    expect(dialog.scrubFields).toBe(true)
    let detail
    dialog.addEventListener('change', (e) => { detail = e.detail })
    dialog.$saveBtn.click()
    expect(detail.scrubfields).toBe(true)
    dialog.scrubFields = false
    dialog.$saveBtn.click()
    expect(detail.scrubfields).toBe(false)
  })
})
