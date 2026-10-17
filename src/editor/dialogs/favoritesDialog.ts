// favoritesDialog.ts — Favorites manager modal (`se-favorites-dialog`) — grouped list of every favoritable action (via `buildFavoritesCatalog`) with a star toggle each
import { t } from '../locale.ts'
import { buildFavoritesCatalog, getFavoriteMeta } from '../favoriteActions.ts'
import { loadFavorites, saveFavorites, toggleFavorite } from '../favorites.ts'
import favoritesDialogHTML from './favoritesDialog.html'
import { ownerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'

const template = document.createElement('template')
template.innerHTML = favoritesDialogHTML

const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => (
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
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
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $list: HTMLDivElement
  $title: HTMLSpanElement
  $hint: HTMLDivElement
  $close: HTMLButtonElement
  $done: HTMLButtonElement
  $search: HTMLInputElement
  $filterFav: HTMLInputElement
  $filterText: HTMLSpanElement
  $reorderHint: HTMLDivElement
  _query: string
  _favOnly: boolean
  _dragId: string | null | undefined

  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#favorites_dialog') as HTMLDialogElement)
    this.$list = (this._shadowRoot.querySelector('#fav_list') as HTMLDivElement)
    this.$title = (this._shadowRoot.querySelector('#fav_title') as HTMLSpanElement)
    this.$hint = (this._shadowRoot.querySelector('#fav_hint') as HTMLDivElement)
    this.$close = (this._shadowRoot.querySelector('#fav_close') as HTMLButtonElement)
    this.$done = (this._shadowRoot.querySelector('#fav_done') as HTMLButtonElement)
    this.$search = (this._shadowRoot.querySelector('#fav_search') as HTMLInputElement)
    this.$filterFav = (this._shadowRoot.querySelector('#fav_filter_fav') as HTMLInputElement)
    this.$filterText = (this._shadowRoot.querySelector('#fav_filter_text') as HTMLSpanElement)
    this.$reorderHint = (this._shadowRoot.querySelector('#fav_reorder_hint') as HTMLDivElement)
    // Search / filter state.
    this._query = ''
    this._favOnly = false
    // Drag-reorder state.
    this._dragId = null
  }

  init (i18next: any): void {
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

  attributeChangedCallback (name: string, oldValue: string | null, newValue: string) {
    if (oldValue === newValue) return
    if (name === 'dialog') {
      if (newValue === 'open') {
        this._render()
        syncDialogTheme(this)
        this.$dialog.showModal()
      } else {
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
    const editor = ownerEditor(this)
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
  _reorderRowHtml (id: string, label: string) {
    return '<div class="fav-row" draggable="true" data-id="' + escapeHtml(id) + '">' +
      '<span class="fav-drag" aria-hidden="true">⠿</span>' +
      '<span class="fav-label">' + escapeHtml(label) + '</span>' +
      '<button class="fav-star is-fav" data-id="' + escapeHtml(id) + '" ' +
      'aria-pressed="true" title="' + escapeHtml(t('favorites.toggle')) + '">' + STAR_SVG + '</button>' +
      '</div>'
  }

  _rowHtml (a: { id: string, label: string }, isFav: boolean) {
    return '<div class="fav-row">' +
      `<span class="fav-label">${escapeHtml(a.label)}</span>` +
      `<button class="fav-star${isFav ? ' is-fav' : ''}" data-id="${escapeHtml(a.id)}" ` +
      `aria-pressed="${isFav}" title="${escapeHtml(t('favorites.toggle'))}">${STAR_SVG}</button>` +
      '</div>'
  }

  _onListClick (e: MouseEvent) {
    const btn = (e.target as Element).closest('.fav-star') as HTMLElement | null
    if (!btn) return
    toggleFavorite(btn.dataset.id ?? '')
    this._render()
  }

  // ── Drag-to-reorder handlers ────────────────────────────────────────────────

  _onDragStart (e: DragEvent) {
    const row = (e.target as Element).closest('.fav-row[draggable]') as HTMLElement | null
    if (!row) return
    this._dragId = row.dataset.id
    row.classList.add('dragging')
    ;(e.dataTransfer as DataTransfer).effectAllowed = 'move'
  }

  _onDragOver (e: DragEvent) {
    if (!this._dragId) return
    e.preventDefault()
    ;(e.dataTransfer as DataTransfer).dropEffect = 'move'
    const row = (e.target as Element).closest('.fav-row[draggable]') as HTMLElement | null
    if (!row || row.dataset.id === this._dragId) return
    this.$list.querySelectorAll('.fav-row.drag-over')
      .forEach((r) => r.classList.remove('drag-over'))
    row.classList.add('drag-over')
  }

  _onDragLeave (e: DragEvent) {
    const row = (e.target as Element).closest('.fav-row[draggable]')
    if (row) row.classList.remove('drag-over')
  }

  _onDrop (e: DragEvent) {
    e.preventDefault()
    const targetRow = (e.target as Element).closest('.fav-row[draggable]') as HTMLElement | null
    if (!targetRow || !this._dragId || targetRow.dataset.id === this._dragId) return
    const targetId = targetRow.dataset.id ?? ''
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
