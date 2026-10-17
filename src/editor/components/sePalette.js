// sePalette.js — `<se-palette>` — Color palette swatch grid: per-swatch overrides, removable/re-addable swatches (`removed` key in the overrides map), and a labelled "Recent" row (`setDocumentColors`, last 5, fed by…
/* eslint-disable max-len */
import Paint from '@svgedit/svgcanvas/core/paint.ts'
import { getUserDataAdapter } from '../userDataAdapter.js'
import { closestRoot, requireOwnerEditor } from '../domScope.js'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'

// Curated default: "none", five neutrals, then twelve hues in three tones (mid, deep,
// soft). Fewer, related colours push drawings toward a coherent limited palette.
// Customised swatches are stored by index, so keep the length and order stable.
const DEFAULT_PALETTE = [
  'none',
  '#111827',
  '#4b5563',
  '#9ca3af',
  '#e5e7eb',
  '#ffffff',
  // mid tones
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
  // deep tones
  '#b91c1c', '#c2410c', '#b45309', '#a16207', '#4d7c0f', '#15803d',
  '#0f766e', '#0e7490', '#1d4ed8', '#4338ca', '#7e22ce', '#be185d',
  // soft tones
  '#fecaca', '#fed7aa', '#fde68a', '#fef08a', '#d9f99d', '#bbf7d0',
  '#99f6e4', '#a5f3fc', '#bfdbfe', '#c7d2fe', '#e9d5ff', '#fbcfe8'
]

const STORAGE_KEY = 'svg-edit-custom-palette'

// Indices of default swatches the user took out of the palette. Kept inside the same
// overrides map (next to the `{index: color}` entries) so a host adapter that stores the
// map verbatim persists it without changes.
const REMOVED_KEY = 'removed'
// "none" always stays: it is the only way to clear a fill or stroke from the palette.
const KEEP_INDEX = 0
const RECENT_LIMIT = 5

/** @typedef {Record<string, *>} Overrides */

/** @returns {Overrides} */
const loadOverrides = () => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getPalette?.()
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

const saveOverrides = (/** @type {{}} */ overrides) => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    // Always hand the host the full overrides map (including `{}` on reset);
    // the host decides how to clear its own store.
    adapter.setPalette?.(overrides)
    return
  }
  if (Object.keys(overrides).length === 0) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// A solid override is a hex/'none' string; a gradient override is a JSON-safe
// object so it survives the localStorage / host-adapter round-trip.
const isGradientOverride = (/** @type {*} */ val) =>
  !!val && typeof val === 'object' && typeof val.xml === 'string'

// Rehydrate a stored gradient definition into a live SVG element. Wrapping the
// markup in an <svg> guarantees the element lands in the SVG namespace.
const gradientElFromXml = (/** @type {string} */ xml) => {
  try {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="${SVG_NS}">${xml}</svg>`, 'image/svg+xml'
    )
    return doc.querySelector('linearGradient, radialGradient')
  } catch {
    return null
  }
}

// Build a CSS gradient string so a swatch can preview the stored gradient.
const gradientToCss = (/** @type {Element | null} */ el) => {
  if (!el) return null
  const stops = Array.from(el.querySelectorAll('stop')).map((stop) => {
    const offset = parseFloat(stop.getAttribute('offset') || '0')
    const style = stop.getAttribute('style') || ''
    const colorMatch = style.match(/stop-color:\s*(#?[0-9a-fA-F]{3,8})/)
    const color = colorMatch
      ? colorMatch[1]
      : (stop.getAttribute('stop-color') || '#000000')
    const hex = color.startsWith('#') ? color : `#${color}`
    return `${hex} ${Math.round(offset * 100)}%`
  })
  if (stops.length < 2) return null
  const list = stops.join(', ')
  if (el.tagName.toLowerCase() === 'radialgradient') {
    return `radial-gradient(circle, ${list})`
  }
  // SVG x1/y1→x2/y2 (y axis points down) → CSS angle (0deg = to top, clockwise).
  const dx = parseFloat(el.getAttribute('x2') ?? '1') - parseFloat(el.getAttribute('x1') ?? '0')
  const dy = parseFloat(el.getAttribute('y2') ?? '0') - parseFloat(el.getAttribute('y1') ?? '0')
  const deg = (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360
  return `linear-gradient(${deg}deg, ${list})`
}

// Reconstruct a Paint from a stored override (gradient object or color string).
const paintFromOverride = (/** @type {*} */ val) => {
  if (isGradientOverride(val)) {
    const el = gradientElFromXml(val.xml)
    if (el) {
      return new Paint(
        val.type === 'radialGradient'
          ? { radialGradient: /** @type {SVGRadialGradientElement} */ (el), alpha: val.alpha ?? 100 }
          : { linearGradient: /** @type {SVGLinearGradientElement} */ (el), alpha: val.alpha ?? 100 }
      )
    }
  }
  const color = typeof val === 'string' ? val : 'none'
  return new Paint({
    alpha: 100,
    solidColor: color === 'none' ? null : color.slice(1)
  })
}

// The "none" slash: inline so its colour follows the theme (`--none-slash`: dark red on light, a lighter red on dark).
const NONE_SWATCH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-label="No color" role="img"><path d="M0 0L24 24M24 0L0 24" fill="none" stroke-width="2" style="stroke: var(--none-slash, #d40000)"/></svg>'

const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>'

// A plain click paints the fill; holding Alt/Option or Shift paints the stroke.
// Background has its own dedicated color picker (bg_color) instead.
const targetOf = (/** @type {Event} */ evt) => {
  const { altKey, shiftKey } = /** @type {MouseEvent} */ (evt)
  return altKey || shiftKey ? 'stroke' : 'fill'
}

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
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    height: 22px;
  }
  #js-se-palette::-webkit-scrollbar { display: none; }
  #js-se-doc {
    display: none;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding-right: 6px;
    margin-right: 2px;
    border-right: 1px solid var(--group-border, #E6E8EC);
  }
  #js-se-doc.has-colors { display: flex; }
  #js-se-recent {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  /* Same swatch size as the palette at full width, so the two groups line up. */
  #js-se-recent div.palette_item { flex: 0 0 22px; min-width: 22px; max-width: 22px; }
  .group_label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted, #6B7280);
    user-select: none;
    flex: 0 0 auto;
  }
  div.palette_item {
    flex: 1;
    /* grows to fill the strip when swatches are removed; never shrinks to a sliver in a narrow pane (the strip scrolls) */
    min-width: 14px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid rgba(0,0,0,0.12);
    border: 1px solid var(--swatch-inset, rgba(0,0,0,0.12));
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
  div.palette_item img, div.palette_item svg {
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
  :host(.edit-mode) #js-se-palette div.palette_item {
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
  /* Inside the swatch (the strip clips anything poking out of it). */
  button.remove_btn {
    display: none;
    position: absolute;
    top: 1px;
    left: 1px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1px solid var(--chrome-border, #E6E8EC);
    background: var(--chrome-bg, #FFFFFF);
    color: var(--fg, #0F172A);
    font-size: 8px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    z-index: 2;
  }
  button.remove_btn:hover {
    background: var(--accent-soft, #E0EAFD);
  }
  :host(.edit-mode) div.palette_item button.remove_btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* A removed swatch is invisible until editing, when it shows dimmed with a "+" to add it back. */
  div.palette_item.is-removed { display: none; }
  :host(.edit-mode) div.palette_item.is-removed {
    display: block;
    opacity: 0.45;
    outline: none;
    border-style: dashed;
    border-color: var(--muted, #6B7280);
    cursor: pointer;
  }
  :host(.edit-mode) div.palette_item.is-removed::after {
    content: '+';
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    bottom: auto;
    right: auto;
    border-radius: 0;
    background: none;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    color: var(--fg, #0F172A);
    text-shadow: 0 0 2px var(--chrome-bg, #FFFFFF);
    pointer-events: none;
  }
  :host(.edit-mode) div.palette_item.is-customised button.revert_btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .palette_edit_btn,
  .reset_btn {
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
  .reset_btn:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .palette_edit_btn.is-active {
    background: var(--accent-soft, #E0EAFD);
    color: var(--accent, #2563EB);
  }
  .reset_btn {
    display: none;
    font-size: 13px;
    line-height: 1;
  }
  /* Global reset only matters while editing and only if something was changed. */
  :host(.edit-mode) .reset_btn.has-overrides {
    display: flex;
  }
  </style>
  <div id="palette_holder" title="">
    <div id="js-se-doc" title="Latest colors used in this drawing">
      <span class="group_label">Recent</span>
      <div id="js-se-recent"></div>
    </div>
    <div id="js-se-palette"></div>
  </div>
  <button class="palette_edit_btn" title="Edit palette colors" aria-pressed="false">${PENCIL_SVG}</button>
  <button class="reset_btn" title="Reset palette colors" aria-label="Reset palette colors">↺</button>
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
    this.$holder = /** @type {HTMLDivElement} */ (this._shadowRoot.getElementById('palette_holder'))
    this.$strip = /** @type {HTMLDivElement} */ (this._shadowRoot.getElementById('js-se-palette'))
    this.$doc = /** @type {HTMLDivElement} */ (this._shadowRoot.getElementById('js-se-doc'))
    this.$recent = /** @type {HTMLDivElement} */ (this._shadowRoot.getElementById('js-se-recent'))
    // Narrow panes: the strip scrolls; let the plain mouse wheel do it.
    this.$strip.addEventListener('wheel', (e) => {
      if (this.$strip.scrollWidth <= this.$strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      this.$strip.scrollLeft += e.deltaY
      e.preventDefault()
    }, { passive: false })
    this.$editBtn = /** @type {HTMLButtonElement} */ (this._shadowRoot.querySelector('button.palette_edit_btn'))
    this.$resetBtn = /** @type {HTMLButtonElement} */ (this._shadowRoot.querySelector('.reset_btn'))
    /** @type {string|undefined} */
    this._docKey = undefined
    /** @type {Overrides} */
    this._overrides = loadOverrides()
    this._editMode = false

    $click(this.$editBtn, (e) => {
      e.stopPropagation()
      this._toggleEditMode()
    })

    $click(this.$resetBtn, (e) => {
      e.stopPropagation()
      this._resetAll()
    })

    this.renderSwatches()
  }

  /**
   * @function init
   * @param {any} i18next
   * @returns {void}
   */
  init (/** @type {import('i18next').i18n} */ i18next) {
    this.setAttribute('ui-palette_info', i18next.t('ui.palette_info'))
  }

  static get observedAttributes () {
    return ['ui-palette_info']
  }

  attributeChangedCallback (/** @type {string} */ name, /** @type {?string} */ oldValue, /** @type {string} */ newValue) {
    if (name === 'ui-palette_info') {
      this._shadowRoot.getElementById('palette_holder')?.setAttribute('title', newValue)
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
  /**
* @param {number} i
*/
  getColor (i) {
    const override = this._overrides[i]
    return override ?? DEFAULT_PALETTE[i]
  }

  /**
* @param {number} i
*/
  isCustomised (i) {
    return Object.prototype.hasOwnProperty.call(this._overrides, i)
  }

  /**
* @param {number} i
*/
  isRemoved (i) {
    const removed = this._overrides[REMOVED_KEY]
    return Array.isArray(removed) && removed.includes(i)
  }

  /**
* @param {number} i
* @param {boolean} removed
*/
  _setRemoved (i, removed) {
    if (i === KEEP_INDEX) return
    const list = (this._overrides[REMOVED_KEY] || []).filter((/** @type {number} */ n) => n !== i)
    if (removed) list.push(i)
    if (list.length) this._overrides[REMOVED_KEY] = list.sort((/** @type {number} */ a, /** @type {number} */ b) => a - b)
    else delete this._overrides[REMOVED_KEY]
    saveOverrides(this._overrides)
    this.renderSwatches()
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  renderSwatches () {
    this.$strip.replaceChildren()
    DEFAULT_PALETTE.forEach((_, i) => {
      this.$strip.append(this._buildSwatch(i))
    })
    const hasOverrides = Object.keys(this._overrides).length > 0
    this.$resetBtn.classList.toggle('has-overrides', hasOverrides)
  }

  /**
   * Show the drawing's latest colours as a labelled "Recent" row of swatches.
   * They are plain shortcuts (not customisable); clicking one applies it like
   * any palette swatch.
   * @param {string[]} colors `#rrggbb` values, most recent first (only the first five show)
   * @returns {void}
   */
  setDocumentColors (colors) {
    const list = (colors || []).slice(0, RECENT_LIMIT)
    const key = list.join(',')
    if (key === this._docKey) return
    this._docKey = key
    this.$recent.replaceChildren(...list.map((color) => {
      const swatch = document.createElement('div')
      swatch.classList.add('palette_item', 'doc_item')
      swatch.style.backgroundColor = color
      swatch.dataset.rgb = color
      swatch.title = color
      $click(swatch, (evt) => {
        evt.preventDefault()
        if (this._editMode) return
        this.dispatchEvent(new CustomEvent('change', {
          detail: { picker: targetOf(evt), color },
          bubbles: false
        }))
      })
      return swatch
    }))
    this.$doc.classList.toggle('has-colors', list.length > 0)
  }

  /**
* @param {number} i
*/
  _buildSwatch (i) {
    const color = this.getColor(i)
    const swatch = document.createElement('div')
    swatch.classList.add('palette_item')
    const removed = this.isRemoved(i)
    const customised = this.isCustomised(i) && !removed
    if (removed) swatch.classList.add('is-removed')
    if (customised) swatch.classList.add('is-customised')
    if (isGradientOverride(color)) {
      const cssGrad = gradientToCss(gradientElFromXml(color.xml))
      if (cssGrad) swatch.style.backgroundImage = cssGrad
      swatch.dataset.rgb = 'gradient'
    } else if (color === 'none') {
      swatch.insertAdjacentHTML('beforeend', NONE_SWATCH_SVG)
      swatch.dataset.rgb = color
    } else {
      swatch.style.backgroundColor = color
      swatch.dataset.rgb = color
    }
    swatch.dataset.index = String(i)
    $click(swatch, (evt) => this._onSwatchClick(evt, i))
    swatch.addEventListener('contextmenu', (evt) => this._onSwatchContextMenu(evt, i))
    if (removed) {
      swatch.title = 'Add back to the palette'
    } else if (i !== KEEP_INDEX) {
      const remove = document.createElement('button')
      remove.className = 'remove_btn'
      remove.type = 'button'
      remove.title = 'Remove from the palette'
      remove.setAttribute('aria-label', 'Remove from the palette')
      remove.textContent = '✕'
      $click(remove, (evt) => {
        evt.preventDefault()
        evt.stopPropagation()
        this._setRemoved(i, true)
      })
      swatch.append(remove)
    }
    if (customised) {
      const revert = document.createElement('button')
      revert.className = 'revert_btn'
      revert.type = 'button'
      revert.title = 'Revert to default color'
      revert.setAttribute('aria-label', 'Revert to default color')
      revert.textContent = '↺'
      $click(revert, (evt) => {
        evt.preventDefault()
        evt.stopPropagation()
        this._revert(i)
      })
      swatch.append(revert)
    }
    return swatch
  }

  /**
* @param {number} i
*/
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

  /**
* @param {Event} evt
* @param {number} i
*/
  _onSwatchClick (evt, i) {
    evt.preventDefault()
    if (this.isRemoved(i)) {
      if (this._editMode) this._setRemoved(i, false)
      return
    }
    if (this._editMode) {
      if (DEFAULT_PALETTE[i] === 'none') return
      this._openEditDialog(i)
      return
    }
    const val = this.getColor(i)
    if (isGradientOverride(val)) {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { picker: targetOf(evt), paint: paintFromOverride(val) },
        bubbles: false
      }))
      return
    }
    let color = val
    if (color === 'none' || color === 'transparent' || color === 'initial') {
      color = 'none'
    }
    this.dispatchEvent(new CustomEvent('change', {
      detail: { picker: targetOf(evt), color },
      bubbles: false
    }))
  }

  /**
* @param {PointerEvent} evt
* @param {number} i
*/
  _onSwatchContextMenu (evt, i) {
    if (!this._editMode || this.isRemoved(i)) return
    evt.preventDefault()
    this._revert(i)
  }

  /**
* @param {number} i
*/
  _openEditDialog (i) {
    const root = closestRoot(this) // keep the dialog within this editor (see domScope.js)
    root.querySelector('se-color-dialog')?.remove()
    const dialog = document.createElement('se-color-dialog')
    // Seed with the swatch's current value so the dialog opens on the matching
    // tab (solid / linear / radial) and gradients stay editable.
    dialog.paint = paintFromOverride(this.getColor(i))
    dialog.type = 'fill'
    dialog.i18next = requireOwnerEditor(this).i18next
    ;(/** @type {Document} */ (root).body ?? root).appendChild(dialog)
    dialog.addEventListener('change', /** @type {EventListener} */ (/** @type {unknown} */ ((/** @type {CustomEvent} */ evt) => {
      const paint = evt.detail.paint
      if (paint?.type === 'solidColor' && paint.solidColor) {
        this._overrides[i] = '#' + paint.solidColor
      } else if (paint?.type === 'linearGradient' || paint?.type === 'radialGradient') {
        const el = paint[paint.type]
        if (!el) return
        this._overrides[i] = { type: paint.type, xml: el.outerHTML, alpha: paint.alpha ?? 100 }
      } else {
        return
      }
      saveOverrides(this._overrides)
      this.renderSwatches()
    })), { once: true })
  }

  _resetAll () {
    this._overrides = {}
    saveOverrides(this._overrides)
    this.renderSwatches()
  }
}

// Register
customElements.define('se-palette', SEPalette)
