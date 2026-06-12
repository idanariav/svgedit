/* globals svgEditor */
import { t } from '../locale.js'
import { buildFavoritesCatalog } from '../favoriteActions.js'
import { loadFavorites, toggleFavorite } from '../favorites.js'
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
    // Search / filter state.
    this._query = ''
    this._favOnly = false
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
  }

  /** Build the grouped list of favoritable actions, applying search / filter. */
  _render () {
    const editor = svgEditor
    if (!editor?.hotkeys) return
    const favs = new Set(loadFavorites())
    const q = this._query.trim().toLowerCase()
    const groups = buildFavoritesCatalog(editor)
      .map((g) => ({
        group: g.group,
        actions: g.actions.filter((a) => {
          if (this._favOnly && !favs.has(a.id)) return false
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
}

// Register
customElements.define('se-favorites-dialog', SeFavoritesDialog)
