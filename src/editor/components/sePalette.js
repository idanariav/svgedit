/* globals svgEditor */
/* eslint-disable max-len */
import Paint from '@svgedit/svgcanvas/core/paint.js'
import { getUserDataAdapter } from '../userDataAdapter.js'
import { closestRoot } from '../domScope.js'

const DEFAULT_PALETTE = [
  'none',
  '#000000',
  '#3f3f3f',
  '#7f7f7f',
  '#bfbfbf',
  '#ffffff',
  '#ff0000',
  '#ff7f00',
  '#ffff00',
  '#7fff00',
  '#00ff00',
  '#00ff7f',
  '#00ffff',
  '#007fff',
  '#0000ff',
  '#7f00ff',
  '#ff00ff',
  '#ff007f',
  '#7f0000',
  '#7f3f00',
  '#7f7f00',
  '#3f7f00',
  '#007f00',
  '#007f3f',
  '#007f7f',
  '#003f7f',
  '#00007f',
  '#3f007f',
  '#7f007f',
  '#7f003f',
  '#ffaaaa',
  '#ffd4aa',
  '#ffffaa',
  '#d4ffaa',
  '#aaffaa',
  '#aaffd4',
  '#aaffff',
  '#aad4ff',
  '#aaaaff',
  '#d4aaff',
  '#ffaaff',
  '#ffaad4'
]

const STORAGE_KEY = 'svg-edit-custom-palette'

const loadOverrides = () => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getPalette()
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveOverrides = (overrides) => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    // Always hand the host the full overrides map (including `{}` on reset);
    // the host decides how to clear its own store.
    adapter.setPalette(overrides)
    return
  }
  if (Object.keys(overrides).length === 0) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  }
}

const NONE_SWATCH_SVG = 'data:image/svg+xml;charset=utf-8;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgY2xhc3M9InN2Z19pY29uIj48c3ZnIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+CiAgICA8bGluZSBmaWxsPSJub25lIiBzdHJva2U9IiNkNDAwMDAiIGlkPSJzdmdfOTAiIHkyPSIyNCIgeDI9IjI0IiB5MT0iMCIgeDE9IjAiLz4KICAgIDxsaW5lIGlkPSJzdmdfOTIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2Q0MDAwMCIgeTI9IjI0IiB4Mj0iMCIgeTE9IjAiIHgxPSIyNCIvPgogIDwvc3ZnPjwvc3ZnPg=='

const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  #palette_holder {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 36px;
    padding: 4px 6px;
    background: var(--group-bg, #F6F7F9);
    border: 1px solid var(--group-border, #E6E8EC);
    border-radius: 10px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    position: relative;
  }
  #js-se-palette {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    height: 22px;
  }
  div.palette_item {
    flex: 1;
    min-width: 0;
    max-width: 22px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid rgba(0,0,0,0.12);
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s, outline-color 0.12s;
    flex-shrink: 0;
    position: relative;
  }
  div.palette_item:hover {
    transform: translateY(-2px);
    box-shadow: 0 3px 8px -2px rgba(0,0,0,0.25);
    z-index: 1;
  }
  div.palette_item:first-child {
    background: var(--field-bg, #FFFFFF);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  div.palette_item img {
    width: 14px;
    height: 14px;
    display: block;
  }
  div.palette_item.is-customised::after {
    content: '';
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent, #2563EB);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.7);
    pointer-events: none;
  }
  :host(.edit-mode) div.palette_item {
    outline: 1px dashed var(--accent, #2563EB);
    outline-offset: 1px;
    cursor: crosshair;
  }
  button.revert_btn {
    display: none;
    position: absolute;
    top: -6px;
    right: -6px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--chrome-border, #E6E8EC);
    background: var(--chrome-bg, #FFFFFF);
    color: var(--accent, #2563EB);
    font-size: 11px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.18);
    z-index: 2;
  }
  button.revert_btn:hover {
    background: var(--accent-soft, #E0EAFD);
  }
  :host(.edit-mode) div.palette_item.is-customised button.revert_btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .palette_edit_btn,
  .palette_expand_btn {
    background: transparent;
    border: none;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
    user-select: none;
    color: var(--muted, #6B7280);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
    padding: 0;
  }
  .palette_edit_btn:hover,
  .palette_expand_btn:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .palette_edit_btn.is-active {
    background: var(--accent-soft, #E0EAFD);
    color: var(--accent, #2563EB);
  }
  #palette_popup {
    padding: 8px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    min-width: 200px;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: absolute;
    bottom: 48px;
    right: 0;
    z-index: 100;
  }
  #palette_popup_grid {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  #palette_popup div.palette_item {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }
  .reset_btn {
    background: transparent;
    border: none;
    color: var(--muted, #6B7280);
    font-size: 11px;
    padding: 2px 0 0;
    cursor: pointer;
    align-self: flex-start;
    text-decoration: underline;
  }
  .reset_btn:hover {
    color: var(--fg, #0F172A);
  }
  </style>
  <div id="palette_holder" title="">
    <div id="js-se-palette"></div>
  </div>
  <button class="palette_edit_btn" title="Edit palette colors" aria-pressed="false">${PENCIL_SVG}</button>
  <button class="palette_expand_btn" title="Show whole palette">▾</button>
  <!-- hidden popup -->
  <div id="palette_popup" style="display:none">
    <div id="palette_popup_grid"></div>
    <button class="reset_btn" style="display:none">Reset palette</button>
  </div>
`

/**
 * @class SEPalette
 */
export class SEPalette extends HTMLElement {
  /**
   * @function constructor
   */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$holder = this._shadowRoot.getElementById('palette_holder')
    this.$strip = this._shadowRoot.getElementById('js-se-palette')
    this.$editBtn = this._shadowRoot.querySelector('button.palette_edit_btn')
    this.$expandBtn = this._shadowRoot.querySelector('button.palette_expand_btn')
    this.$popUp = this._shadowRoot.getElementById('palette_popup')
    this.$popupGrid = this._shadowRoot.getElementById('palette_popup_grid')
    this.$resetBtn = this._shadowRoot.querySelector('.reset_btn')

    this._overrides = loadOverrides()
    this._editMode = false

    svgEditor.$click(this.$expandBtn, (e) => {
      e.stopPropagation()
      if (this.$popUp.style.display === 'none') {
        this.showPopUp()
      } else {
        this.hidePopUp()
      }
    })

    svgEditor.$click(this.$editBtn, (e) => {
      e.stopPropagation()
      this._toggleEditMode()
    })

    svgEditor.$click(this.$resetBtn, (e) => {
      e.stopPropagation()
      this._resetAll()
    })

    svgEditor.svgCanvas.container.addEventListener('click', () =>
      this.hidePopUp()
    )

    this.renderSwatches()
  }

  /**
   * @function init
   * @param {any} i18next
   * @returns {void}
   */
  init (i18next) {
    this.setAttribute('ui-palette_info', i18next.t('ui.palette_info'))
  }

  static get observedAttributes () {
    return ['ui-palette_info']
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (name === 'ui-palette_info') {
      this._shadowRoot.getElementById('palette_holder').setAttribute('title', newValue)
    }
  }

  connectedCallback () {}

  /**
   * Re-read the override map from the host adapter (or localStorage fallback)
   * and re-render the swatches. Lets a host live-refresh this palette instance
   * after another editor instance wrote to the shared store.
   * @returns {void}
   */
  reload () {
    this._overrides = loadOverrides()
    this.renderSwatches()
  }

  // ── Palette state ────────────────────────────────────────────────────────
  getColor (i) {
    const override = this._overrides[i]
    return override ?? DEFAULT_PALETTE[i]
  }

  isCustomised (i) {
    return Object.prototype.hasOwnProperty.call(this._overrides, i)
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  renderSwatches () {
    this.$strip.replaceChildren()
    this.$popupGrid.replaceChildren()
    DEFAULT_PALETTE.forEach((_, i) => {
      this.$strip.append(this._buildSwatch(i))
      this.$popupGrid.append(this._buildSwatch(i))
    })
    const hasOverrides = Object.keys(this._overrides).length > 0
    this.$resetBtn.style.display = hasOverrides ? '' : 'none'
  }

  _buildSwatch (i) {
    const color = this.getColor(i)
    const swatch = document.createElement('div')
    swatch.classList.add('palette_item')
    const customised = this.isCustomised(i)
    if (customised) swatch.classList.add('is-customised')
    if (color === 'none') {
      const img = document.createElement('img')
      img.src = NONE_SWATCH_SVG
      img.style.width = '15px'
      img.style.height = '15px'
      img.alt = 'No color'
      swatch.append(img)
    } else {
      swatch.style.backgroundColor = color
    }
    swatch.dataset.rgb = color
    swatch.dataset.index = String(i)
    svgEditor.$click(swatch, (evt) => this._onSwatchClick(evt, i))
    swatch.addEventListener('contextmenu', (evt) => this._onSwatchContextMenu(evt, i))
    if (customised) {
      const revert = document.createElement('button')
      revert.className = 'revert_btn'
      revert.type = 'button'
      revert.title = 'Revert to default color'
      revert.setAttribute('aria-label', 'Revert to default color')
      revert.textContent = '↺'
      svgEditor.$click(revert, (evt) => {
        evt.preventDefault()
        evt.stopPropagation()
        this._revert(i)
      })
      swatch.append(revert)
    }
    return swatch
  }

  _revert (i) {
    if (!this.isCustomised(i)) return
    delete this._overrides[i]
    saveOverrides(this._overrides)
    this.renderSwatches()
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  _toggleEditMode () {
    this._editMode = !this._editMode
    this.classList.toggle('edit-mode', this._editMode)
    this.$editBtn.classList.toggle('is-active', this._editMode)
    this.$editBtn.setAttribute('aria-pressed', String(this._editMode))
  }

  _onSwatchClick (evt, i) {
    evt.preventDefault()
    if (this._editMode) {
      if (DEFAULT_PALETTE[i] === 'none') return
      this._openEditDialog(i)
      return
    }
    const picker = evt.shiftKey || evt.button === 2 ? 'stroke' : 'fill'
    let color = this.getColor(i)
    if (color === 'none' || color === 'transparent' || color === 'initial') {
      color = 'none'
    }
    this.dispatchEvent(new CustomEvent('change', {
      detail: { picker, color },
      bubbles: false
    }))
  }

  _onSwatchContextMenu (evt, i) {
    if (!this._editMode) return
    evt.preventDefault()
    this._revert(i)
  }

  _openEditDialog (i) {
    const root = closestRoot(this) // keep the dialog within this editor (see domScope.js)
    root.querySelector('se-color-dialog')?.remove()
    const color = this.getColor(i)
    const dialog = document.createElement('se-color-dialog')
    dialog.paint = new Paint({ alpha: 100, solidColor: color.slice(1) })
    dialog.type = 'fill'
    dialog.i18next = svgEditor.i18next
    ;(root.body ?? root).appendChild(dialog)
    dialog.addEventListener('change', (evt) => {
      const paint = evt.detail.paint
      if (paint?.type !== 'solidColor' || !paint.solidColor) return
      this._overrides[i] = '#' + paint.solidColor
      saveOverrides(this._overrides)
      this.renderSwatches()
    }, { once: true })
  }

  _resetAll () {
    this._overrides = {}
    saveOverrides(this._overrides)
    this.renderSwatches()
  }

  /**
   * Shows popUp window with the whole palette
   */
  showPopUp () {
    this.$popUp.style.display = 'flex'
    this.$expandBtn.textContent = '▲'
    this.$expandBtn.setAttribute('title', 'Hide palette window')
  }

  hidePopUp () {
    this.$popUp.style.display = 'none'
    this.$expandBtn.textContent = '▼'
    this.$expandBtn.setAttribute('title', 'Show palette window')
  }
}

// Register
customElements.define('se-palette', SEPalette)
