/* globals svgEditor */
import { buildCommandSearchCatalog, activateCommandSearchResult } from '../commandSearch.js'
import commandSearchDialogHTML from './commandSearchDialog.html'

const template = document.createElement('template')
template.innerHTML = commandSearchDialogHTML

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

/**
 * Command Search popup. Live-filters every searchable action/setting
 * (`commandSearch.js`) by label; Enter/click activates the highlighted
 * result — running the action in place, or revealing the setting (switching
 * the Right Panel tab and/or opening its picker) when it's a value control.
 * Opened via `open()` (bound to Ctrl/Cmd+K, see `Editor.js`, and to the
 * "Command search" Main Menu item).
 * @class SeCommandSearchDialog
 */
export class SeCommandSearchDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#cs_dialog')
    this.$search = this._shadowRoot.querySelector('#cs_search')
    this.$list = this._shadowRoot.querySelector('#cs_list')
    this.$hint = this._shadowRoot.querySelector('#cs_hint')
    // Flat, in-render-order list of result ids, kept in sync with `_render()`
    // so arrow-key navigation can move a single index into it.
    this._flatIds = []
    this._selectedIndex = 0
    this._query = ''
  }

  /**
   * @param {object} i18next
   * @returns {void}
   */
  init (i18next) {
    this.$search.setAttribute('placeholder', i18next.t('command_search.search'))
    this.$dialog.setAttribute('aria-label', i18next.t('command_search.title'))
    this.$hint.textContent = i18next.t('command_search.hint')
  }

  connectedCallback () {
    this.$search.addEventListener('input', () => {
      this._query = this.$search.value
      this._selectedIndex = 0
      this._render()
    })
    this.$search.addEventListener('keydown', (e) => this._onKeyDown(e))
    this.$list.addEventListener('click', (e) => this._onListClick(e))
    // Native <dialog> closes on Escape by itself but not on a backdrop click.
    this.$dialog.addEventListener('click', (e) => {
      if (e.target === this.$dialog) this.close()
    })
  }

  /** Open the popup: reset query/selection, render, and focus the search field. */
  open () {
    this._query = ''
    this._selectedIndex = 0
    this.$search.value = ''
    this._render()
    this.$dialog.showModal()
    requestAnimationFrame(() => this.$search.focus())
  }

  /** Close the popup. */
  close () {
    if (this.$dialog.open) this.$dialog.close()
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown (e) {
    if (!this._flatIds.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this._selectedIndex = (this._selectedIndex + 1) % this._flatIds.length
      this._render()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      this._selectedIndex = (this._selectedIndex - 1 + this._flatIds.length) % this._flatIds.length
      this._render()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      this._activate(this._flatIds[this._selectedIndex])
    }
  }

  /** @param {MouseEvent} e */
  _onListClick (e) {
    const row = e.target.closest('[data-id]')
    if (!row) return
    this._activate(row.dataset.id)
  }

  /** @param {string} id */
  _activate (id) {
    if (!id) return
    activateCommandSearchResult(svgEditor, id)
    this.close()
  }

  /** Build the grouped, filtered result list and keep `_flatIds` in sync. */
  _render () {
    if (!svgEditor) return
    const q = this._query.trim().toLowerCase()
    const groups = buildCommandSearchCatalog(svgEditor)
      .map((g) => ({
        group: g.group,
        actions: g.actions.filter((a) => !q || a.label.toLowerCase().includes(q))
      }))
      .filter((g) => g.actions.length)

    this._flatIds = groups.flatMap((g) => g.actions.map((a) => a.id))
    if (this._selectedIndex >= this._flatIds.length) this._selectedIndex = 0

    if (!groups.length) {
      this.$list.innerHTML = `<div class="cs-empty">${escapeHtml(svgEditor.i18next.t('command_search.no_results'))}</div>`
      return
    }

    let flatIndex = 0
    this.$list.innerHTML = groups.map((g) => {
      const rows = g.actions.map((a) => {
        const row = this._rowHtml(a, flatIndex === this._selectedIndex)
        flatIndex += 1
        return row
      }).join('')
      return `<div class="cs-group-title">${escapeHtml(g.group)}</div>${rows}`
    }).join('')

    this.$list.querySelector('.cs-row.selected')?.scrollIntoView({ block: 'nearest' })
  }

  /**
   * @param {{id:string, label:string}} a
   * @param {boolean} selected
   * @returns {string}
   */
  _rowHtml (a, selected) {
    return `<div class="cs-row${selected ? ' selected' : ''}" data-id="${escapeHtml(a.id)}">` +
      `<span class="cs-label">${escapeHtml(a.label)}</span>` +
      '</div>'
  }
}

// Register
customElements.define('se-command-search-dialog', SeCommandSearchDialog)
