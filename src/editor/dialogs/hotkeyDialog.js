/* globals svgEditor */
import { t } from '../locale.js'
import { formatHotkey } from '../Hotkeys.js'
import hotkeyDialogHTML from './hotkeyDialog.html'

const template = document.createElement('template')
template.innerHTML = hotkeyDialogHTML

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

/**
 * Hotkey Manager dialog. Lists every registered action grouped by category and
 * lets the user add (record), remove, reset, or reset-all their bindings.
 * Conflicting bindings are blocked. State lives in the central HotkeyManager
 * (see Hotkeys.js); this component is purely the view.
 * @class SeHotkeyDialog
 */
export class SeHotkeyDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#hotkey_dialog')
    this.$list = this._shadowRoot.querySelector('#hk_list')
    this.$title = this._shadowRoot.querySelector('#hk_title')
    this.$close = this._shadowRoot.querySelector('#hk_close')
    this.$done = this._shadowRoot.querySelector('#hk_done')
    this.$resetAll = this._shadowRoot.querySelector('#hk_reset_all')
    // When set, the dialog is recording a new key for { id }; { error } holds
    // a transient conflict message to show under that row.
    this._recording = null
    this._captureHandler = null
  }

  /**
   * @param {object} i18next
   * @returns {void}
   */
  init (i18next) {
    this.$title.textContent = i18next.t('hotkeys.title')
    this.$done.textContent = i18next.t('common.ok')
    this.$resetAll.textContent = i18next.t('hotkeys.reset_all')
    this.$close.setAttribute('aria-label', i18next.t('common.cancel'))
  }

  static get observedAttributes () {
    return ['dialog']
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    if (name === 'dialog') {
      if (newValue === 'open') {
        this._render()
        this.$dialog.open()
      } else {
        this._cancelRecording()
        this.$dialog.close()
      }
    }
  }

  get dialog () { return this.getAttribute('dialog') }
  set dialog (value) { this.setAttribute('dialog', value) }

  connectedCallback () {
    const close = () => this.setAttribute('dialog', 'close')
    svgEditor.$click(this.$close, close)
    svgEditor.$click(this.$done, close)
    this.$dialog.addEventListener('close', () => this._cancelRecording())
    svgEditor.$click(this.$resetAll, () => {
      svgEditor.hotkeys.resetAll()
      this._render()
    })
    // Delegate row actions (add / remove / reset).
    this.$list.addEventListener('click', (e) => this._onListClick(e))
  }

  /** Build the grouped list of actions. */
  _render () {
    const hk = svgEditor?.hotkeys
    if (!hk) return
    const groups = hk.listForUi()
    const html = groups.map((g) => {
      const rows = g.actions.map((a) => this._rowHtml(a)).join('')
      return `<div class="hk-group-title">${escapeHtml(g.group)}</div>${rows}`
    }).join('')
    this.$list.innerHTML = html
  }

  /** @param {object} a a UI action snapshot */
  _rowHtml (a) {
    const recording = this._recording && this._recording.id === a.id
    let keysHtml
    if (a.readonly) {
      keysHtml = `<span class="hk-readonly">${escapeHtml(a.decorative)}</span>`
    } else if (recording) {
      keysHtml = `<span class="hk-recording">${escapeHtml(t('hotkeys.press_key'))}</span>`
    } else if (a.keys.length) {
      keysHtml = a.keys.map((k) => (
        `<span class="hk-chip">${escapeHtml(formatHotkey(k))}` +
        `<button class="hk-chip-remove" data-act="remove" data-id="${escapeHtml(a.id)}" ` +
        `data-key="${escapeHtml(k)}" title="${escapeHtml(t('hotkeys.remove'))}">✕</button></span>`
      )).join('')
    } else {
      keysHtml = `<span class="hk-none">${escapeHtml(t('hotkeys.unassigned'))}</span>`
    }

    let actions = ''
    if (!a.readonly) {
      actions = `<button class="hk-btn" data-act="add" data-id="${escapeHtml(a.id)}">` +
        `${escapeHtml(recording ? t('common.cancel') : t('hotkeys.add'))}</button>`
      if (a.customised) {
        actions += `<button class="hk-btn" data-act="reset" data-id="${escapeHtml(a.id)}">` +
          `${escapeHtml(t('hotkeys.reset'))}</button>`
      }
    }
    const conflict = (recording && this._recording.error)
      ? `<div class="hk-conflict">${escapeHtml(this._recording.error)}</div>`
      : ''
    return '<div class="hk-row">' +
      `<span class="hk-label">${escapeHtml(a.label)}</span>` +
      `<div class="hk-keys">${keysHtml}</div>` +
      `<div class="hk-row-actions">${actions}</div>` +
      `</div>${conflict}`
  }

  /** @param {MouseEvent} e */
  _onListClick (e) {
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const { act, id, key } = btn.dataset
    const hk = svgEditor.hotkeys
    if (act === 'remove') {
      hk.removeKey(id, key)
      this._render()
    } else if (act === 'reset') {
      hk.resetAction(id)
      this._render()
    } else if (act === 'add') {
      if (this._recording && this._recording.id === id) this._cancelRecording()
      else this._startRecording(id)
    }
  }

  /** Begin capturing a key combination for action `id`. */
  _startRecording (id) {
    this._cancelRecording()
    this._recording = { id, error: '' }
    this._captureHandler = (e) => this._onCapture(e)
    document.addEventListener('keydown', this._captureHandler, true)
    this._render()
  }

  /** @param {KeyboardEvent} e */
  _onCapture (e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { this._cancelRecording(); this._render(); return }
    const hk = svgEditor.hotkeys
    const key = hk.constructor.keyFromEvent(e)
    if (!key) return // lone modifier — keep waiting for the full combo
    const { id } = this._recording
    const result = hk.addKey(id, key)
    if (!result.ok) {
      const a = hk.actions.get(result.conflict)
      const name = a ? hk.labelFor(a) : result.conflict
      this._recording.error = t('hotkeys.conflict').replace('%s', name)
      this._render()
      return
    }
    this._cancelRecording()
    this._render()
  }

  /** Stop recording and detach the capture listener. */
  _cancelRecording () {
    if (this._captureHandler) {
      document.removeEventListener('keydown', this._captureHandler, true)
      this._captureHandler = null
    }
    this._recording = null
  }
}

// Register
customElements.define('se-hotkey-dialog', SeHotkeyDialog)
