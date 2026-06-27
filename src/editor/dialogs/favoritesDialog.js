/* globals svgEditor */
import { t } from '../locale.js'
import { buildFavoritesCatalog, getFavoriteMeta } from '../favoriteActions.js'
import { loadFavorites, saveFavorites, toggleFavorite } from '../favorites.js'
import favoritesDialogHTML from './favoritesDialog.html'

const template = document.createElement('template')
template.innerHTML = favoritesDialogHTML

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// Inline star (currentColor, fill toggled via the .is-fav class).
const STAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 ' +
  '5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>'

/**
 * Favorites manager dialog. Lists every favoritable action (see
 * `favoriteActions.js`) grouped by category and lets the user star/unstar each.
 * Starred actions populate the right-click quick-action menu. State lives in the
 * favorites store (see `favorites.js`); this component is purely the view.
 *
 * When "Favorited only" is active the list switches to a flat, ordered view that
 * mirrors the context-menu order, with drag handles so the user can reorder entries.
 * @class SeFavoritesDialog
 */
export class SeFavoritesDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#favorites_dialog')
    this.$list = this._shadowRoot.querySelector('#fav_list')
    this.$title = this._shadowRoot.querySelector('#fav_title')
    this.$hint = this._shadowRoot.querySelector('#fav_hint')
    this.$close = this._shadowRoot.querySelector('#fav_close')
    this.$done = this._shadowRoot.querySelector('#fav_done')
    this.$search = this._shadowRoot.querySelector('#fav_search')
    this.$filterFav = this._shadowRoot.querySelector('#fav_filter_fav')
    this.$filterText = this._shadowRoot.querySelector('#fav_filter_text')
    this.$reorderHint = this._shadowRoot.querySelector('#fav_reorder_hint')
    // Search / filter state.
    this._query = ''
    this._favOnly = false
    // Drag-reorder state.
    this._dragId = null
  }

  /**
   * @param {object} i18next
   * @returns {void}
   */
  init (i18next) {
    this.$title.textContent = i18next.t('favorites.title')
    this.$hint.textContent = i18next.t('favorites.hint')
    this.$done.textContent = i18next.t('common.ok')
    this.$close.setAttribute('aria-label', i18next.t('common.cancel'))
    this.$search.setAttribute('placeholder', i18next.t('favorites.search'))
    this.$filterText.textContent = i18next.t('favorites.favorited_only')
    this.$reorderHint.textContent = i18next.t('favorites.drag_to_reorder')
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
    this.$list.addEventListener('click', (e) => this._onListClick(e))
    this.$search.addEventListener('input', () => {
      this._query = this.$search.value
      this._render()
    })
    this.$filterFav.addEventListener('change', () => {
      this._favOnly = this.$filterFav.checked
      this._render()
    })
    // Drag-to-reorder (only active in favorites-only view).
    this.$list.addEventListener('dragstart', (e) => this._onDragStart(e))
    this.$list.addEventListener('dragover', (e) => this._onDragOver(e))
    this.$list.addEventListener('dragleave', (e) => this._onDragLeave(e))
    this.$list.addEventListener('drop', (e) => this._onDrop(e))
    this.$list.addEventListener('dragend', () => this._onDragEnd())
  }

  /**
   * Build the list, applying search / filter.
   *
   * Favorites-only mode: shows the user's favorites in stored (= menu) order as a
   * flat list with drag handles so the order can be rearranged.
   * Normal mode: shows the full grouped catalog for browsing and starring.
   */
  _render () {
    const editor = svgEditor
    if (!editor?.hotkeys) return
    const q = this._query.trim().toLowerCase()

    if (this._favOnly) {
      this.$reorderHint.hidden = false
      const favIds = loadFavorites()
      const rows = favIds
        .filter((id) => {
          if (!q) return true
          const meta = getFavoriteMeta(editor, id)
          return meta && meta.label.toLowerCase().includes(q)
        })
        .map((id) => {
          const meta = getFavoriteMeta(editor, id)
          return this._reorderRowHtml(id, meta ? meta.label : id)
        })
      if (!rows.length) {
        this.$list.innerHTML = `<div class="fav-empty">${escapeHtml(t('favorites.no_results'))}</div>`
        return
      }
      this.$list.innerHTML = rows.join('')
      return
    }

    this.$reorderHint.hidden = true
    const favs = new Set(loadFavorites())
    const groups = buildFavoritesCatalog(editor)
      .map((g) => ({
        group: g.group,
        actions: g.actions.filter((a) => {
          if (q && !a.label.toLowerCase().includes(q)) return false
          return true
        })
      }))
      .filter((g) => g.actions.length)
    if (!groups.length) {
      this.$list.innerHTML = `<div class="fav-empty">${escapeHtml(t('favorites.no_results'))}</div>`
      return
    }
    this.$list.innerHTML = groups.map((g) => {
      const rows = g.actions.map((a) => this._rowHtml(a, favs.has(a.id))).join('')
      return `<div class="fav-group-title">${escapeHtml(g.group)}</div>${rows}`
    }).join('')
  }

  /** Row for the reorder (favorites-only) view — always starred, has drag handle. */
  _reorderRowHtml (id, label) {
    return '<div class="fav-row" draggable="true" data-id="' + escapeHtml(id) + '">' +
      '<span class="fav-drag" aria-hidden="true">⠿</span>' +
      '<span class="fav-label">' + escapeHtml(label) + '</span>' +
      '<button class="fav-star is-fav" data-id="' + escapeHtml(id) + '" ' +
      'aria-pressed="true" title="' + escapeHtml(t('favorites.toggle')) + '">' + STAR_SVG + '</button>' +
      '</div>'
  }

  /** @param {{id:string, label:string}} a @param {boolean} isFav */
  _rowHtml (a, isFav) {
    return '<div class="fav-row">' +
      `<span class="fav-label">${escapeHtml(a.label)}</span>` +
      `<button class="fav-star${isFav ? ' is-fav' : ''}" data-id="${escapeHtml(a.id)}" ` +
      `aria-pressed="${isFav}" title="${escapeHtml(t('favorites.toggle'))}">${STAR_SVG}</button>` +
      '</div>'
  }

  /** @param {MouseEvent} e */
  _onListClick (e) {
    const btn = e.target.closest('.fav-star')
    if (!btn) return
    toggleFavorite(btn.dataset.id)
    this._render()
  }

  // ── Drag-to-reorder handlers ────────────────────────────────────────────────

  _onDragStart (e) {
    const row = e.target.closest('.fav-row[draggable]')
    if (!row) return
    this._dragId = row.dataset.id
    row.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
  }

  _onDragOver (e) {
    if (!this._dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const row = e.target.closest('.fav-row[draggable]')
    if (!row || row.dataset.id === this._dragId) return
    this.$list.querySelectorAll('.fav-row.drag-over')
      .forEach((r) => r.classList.remove('drag-over'))
    row.classList.add('drag-over')
  }

  _onDragLeave (e) {
    const row = e.target.closest('.fav-row[draggable]')
    if (row) row.classList.remove('drag-over')
  }

  _onDrop (e) {
    e.preventDefault()
    const targetRow = e.target.closest('.fav-row[draggable]')
    if (!targetRow || !this._dragId || targetRow.dataset.id === this._dragId) return
    const targetId = targetRow.dataset.id
    const favs = loadFavorites()
    const reordered = favs.filter((id) => id !== this._dragId)
    const toIdx = reordered.indexOf(targetId)
    const rect = targetRow.getBoundingClientRect()
    const insertIdx = e.clientY < rect.top + rect.height / 2 ? toIdx : toIdx + 1
    reordered.splice(insertIdx, 0, this._dragId)
    saveFavorites(reordered)
    this._render()
  }

  _onDragEnd () {
    this._dragId = null
    this.$list.querySelectorAll('.fav-row.dragging, .fav-row.drag-over')
      .forEach((r) => r.classList.remove('dragging', 'drag-over'))
  }
}

// Register
customElements.define('se-favorites-dialog', SeFavoritesDialog)
