// hotkeyDialog.ts — Hotkey Manager modal (`se-hotkey-dialog`) — grouped list of every action with add (key recorder) / remove / reset / reset-all, conflict feedback
import { t } from '../locale.ts'
import { formatHotkey } from '../Hotkeys.ts'
import hotkeyDialogHTML from './hotkeyDialog.html'
import { ownerEditor, requireOwnerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'

const template = document.createElement('template')
template.innerHTML = hotkeyDialogHTML

const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => (
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
))

/**
 * Hotkey Manager dialog. Lists every registered action grouped by category and
 * lets the user add (record), remove, reset, or reset-all their bindings.
 * Conflicting bindings are blocked. State lives in the central HotkeyManager
 * (see Hotkeys.js); this component is purely the view.
 * @class SeHotkeyDialog
 */
export class SeHotkeyDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $list: HTMLDivElement
  $title: HTMLSpanElement
  $close: HTMLButtonElement
  $done: HTMLButtonElement
  $resetAll: HTMLButtonElement
  $search: HTMLInputElement
  $filterAssigned: HTMLInputElement
  $filterText: HTMLSpanElement
  _recording: { id: string; error: string; } | null
  _captureHandler: ((e: KeyboardEvent) => void) | null
  _query: string
  _assignedOnly: boolean

  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#hotkey_dialog') as HTMLDialogElement)
    this.$list = (this._shadowRoot.querySelector('#hk_list') as HTMLDivElement)
    this.$title = (this._shadowRoot.querySelector('#hk_title') as HTMLSpanElement)
    this.$close = (this._shadowRoot.querySelector('#hk_close') as HTMLButtonElement)
    this.$done = (this._shadowRoot.querySelector('#hk_done') as HTMLButtonElement)
    this.$resetAll = (this._shadowRoot.querySelector('#hk_reset_all') as HTMLButtonElement)
    this.$search = (this._shadowRoot.querySelector('#hk_search') as HTMLInputElement)
    this.$filterAssigned = (this._shadowRoot.querySelector('#hk_filter_assigned') as HTMLInputElement)
    this.$filterText = (this._shadowRoot.querySelector('#hk_filter_text') as HTMLSpanElement)
    // When set, the dialog is recording a new key for { id }; { error } holds
    // a transient conflict message to show under that row.
    this._recording = null
    this._captureHandler = null
    // Search / filter state.
    this._query = ''
    this._assignedOnly = false
  }

  init (i18next: import('i18next').i18n): void {
    this.$title.textContent = i18next.t('hotkeys.title')
    this.$done.textContent = i18next.t('common.ok')
    this.$resetAll.textContent = i18next.t('hotkeys.reset_all')
    this.$close.setAttribute('aria-label', i18next.t('common.cancel'))
    this.$search.setAttribute('placeholder', i18next.t('hotkeys.search'))
    this.$filterText.textContent = i18next.t('hotkeys.assigned_only')
  }

  static get observedAttributes () {
    return ['dialog']
  }

  attributeChangedCallback (name: string, oldValue: string | null, newValue: string) {
    if (oldValue === newValue) return
    if (name === 'dialog') {
      if (newValue === 'open') {
        this._render()
        syncDialogTheme(this)
        this.$dialog.showModal()
      } else {
        this._cancelRecording()
        this.$dialog.close()
      }
    }
  }

  get dialog (): string | null { return this.getAttribute('dialog') }

  set dialog (value: string) { this.setAttribute('dialog', value) }

  connectedCallback () {
    const close = () => this.setAttribute('dialog', 'close')
    $click(this.$close, close)
    $click(this.$done, close)
    this.$dialog.addEventListener('close', () => this._cancelRecording())
    $click(this.$resetAll, () => {
      requireOwnerEditor(this).hotkeys.resetAll()
      this._render()
    })
    // Delegate row actions (add / remove / reset).
    this.$list.addEventListener('click', (e) => this._onListClick(e))
    this.$search.addEventListener('input', () => {
      this._query = this.$search.value
      this._render()
    })
    this.$filterAssigned.addEventListener('change', () => {
      this._assignedOnly = this.$filterAssigned.checked
      this._render()
    })
  }

  /** Build the grouped list of actions, applying the search / filter. */
  _render () {
    const hk = ownerEditor(this)?.hotkeys
    if (!hk) return
    const q = this._query.trim().toLowerCase()
    const groups = hk.listForUi()
      .map((g) => ({
        group: g.group,
        actions: g.actions.filter((a) => {
          // "Assigned" = has an effective binding or a fixed (readonly) one.
          if (this._assignedOnly && !(a.keys.length || a.readonly)) return false
          if (q && !a.label.toLowerCase().includes(q)) return false
          return true
        })
      }))
      .filter((g) => g.actions.length)
    if (!groups.length) {
      this.$list.innerHTML = `<div class="hk-empty">${escapeHtml(t('hotkeys.no_results'))}</div>`
      return
    }
    this.$list.innerHTML = groups.map((g) => {
      const rows = g.actions.map((a) => this._rowHtml(a)).join('')
      return `<div class="hk-group-title">${escapeHtml(g.group)}</div>${rows}`
    }).join('')
  }

  /** @param a a UI action snapshot */
  _rowHtml (a: { id: string, label: string, keys: string[], decorative: (string | null), readonly: boolean, customised: boolean }) {
    const recording = this._recording && this._recording.id === a.id
    let keysHtml
    if (a.readonly) {
      keysHtml = `<span class="hk-readonly">${escapeHtml(a.decorative)}</span>`
    } else if (recording) {
      keysHtml = `<span class="hk-recording">${escapeHtml(t('hotkeys.press_key'))}</span>`
    } else if (a.keys.length) {
      keysHtml = a.keys.map((k: string) => (
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
    const conflict = (recording && this._recording?.error)
      ? `<div class="hk-conflict">${escapeHtml(this._recording?.error)}</div>`
      : ''
    return '<div class="hk-row">' +
      `<span class="hk-label">${escapeHtml(a.label)}</span>` +
      `<div class="hk-keys">${keysHtml}</div>` +
      `<div class="hk-row-actions">${actions}</div>` +
      `</div>${conflict}`
  }

  _onListClick (e: MouseEvent) {
    const btn = (e.target as Element).closest('[data-act]') as HTMLElement | null
    if (!btn) return
    const { act, id, key } = btn.dataset
    const hk = requireOwnerEditor(this).hotkeys
    if (act === 'remove') {
      hk.removeKey(id ?? '', key ?? '')
      this._render()
    } else if (act === 'reset') {
      hk.resetAction(id ?? '')
      this._render()
    } else if (act === 'add') {
      if (this._recording && this._recording.id === id) this._cancelRecording()
      else this._startRecording(id ?? '')
    }
  }

  /** Begin capturing a key combination for action `id`. */
  _startRecording (id: string) {
    this._cancelRecording()
    this._recording = { id, error: '' }
    this._captureHandler = (e: KeyboardEvent) => this._onCapture(e)
    document.addEventListener('keydown', this._captureHandler, true)
    this._render()
  }

  _onCapture (e: KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { this._cancelRecording(); this._render(); return }
    const hk = requireOwnerEditor(this).hotkeys
    const key = (hk.constructor as typeof import('../Hotkeys.ts').default).keyFromEvent(e)
    if (!key) return // lone modifier — keep waiting for the full combo
    if (!this._recording) return
    const { id } = this._recording
    const result = hk.addKey(id, key)
    if (!result.ok) {
      const a = hk.actions.get(result.conflict ?? '')
      const name = a ? hk.labelFor(a) : result.conflict
      this._recording.error = t('hotkeys.conflict').replace('%s', name ?? '')
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
