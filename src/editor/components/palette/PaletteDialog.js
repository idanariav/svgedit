/**
 * PaletteDialog.js — <se-palette-dialog> web component.
 * Displays the 8-color OKLCH palette generated from a sampled background
 * color. Display-only in v1 (no per-swatch apply-to-canvas) — the purpose,
 * min-contrast, and output-format controls re-run the generator reactively.
 */

import { css } from './PaletteDialog.css.js'
import { generatePalette } from '../../palette/generatePalette.js'
import { closestRoot } from '../../domScope.js'

const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><path d="M6 6l12 12M18 6L6 18"/></svg>'
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"></path></svg>'
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M20 6L9 17l-5-5"></path></svg>'

const PURPOSES = ['icons', 'text', 'charts', 'illustrations', 'buttons', 'notifications']

/**
 * @class SePaletteDialog
 * @property {string} backgroundHex - the sampled color to contrast the palette against
 * @property {string} purpose - one of PURPOSES
 * @property {number} minContrast - WCAG contrast ratio floor
 * @property {string} outputFormat - 'hex' | 'oklch'
 * @property {object} i18next
 */
export class SePaletteDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._backgroundHex = '#ffffff'
    this._purpose = 'icons'
    this._minContrast = 4.5
    this._outputFormat = 'hex'
    this._i18next = null
    this._themeObserver = null
    this._keyHandler = null
  }

  set backgroundHex (v) { this._backgroundHex = v; this._renderSwatches?.() }
  get backgroundHex () { return this._backgroundHex }
  set purpose (v) { this._purpose = v; this._renderSwatches?.() }
  get purpose () { return this._purpose }
  set minContrast (v) { this._minContrast = v; this._renderSwatches?.() }
  get minContrast () { return this._minContrast }
  set outputFormat (v) { this._outputFormat = v; this._renderSwatches?.() }
  get outputFormat () { return this._outputFormat }
  set i18next (i) { this._i18next = i }
  get i18next () { return this._i18next }

  connectedCallback () {
    this._render()
    this._syncTheme()
    this._observeTheme()
    this._bindKeys()
  }

  disconnectedCallback () {
    this._themeObserver?.disconnect()
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler)
  }

  _syncTheme () {
    const root = closestRoot(this).querySelector('.svg_editor')
    const isDark = root?.classList.contains('theme-dark')
    this.classList.toggle('theme-dark', !!isDark)
    this.classList.toggle('theme-light', !isDark)
  }

  _observeTheme () {
    const root = closestRoot(this).querySelector('.svg_editor')
    if (!root) return
    this._themeObserver = new MutationObserver(() => this._syncTheme())
    this._themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
  }

  _t (key, fallback) {
    try { return this._i18next?.t(key) || fallback } catch { return fallback }
  }

  _render () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    this._shadowRoot.adoptedStyleSheets = [sheet]

    this._shadowRoot.innerHTML = `
      <div class="pd-backdrop" part="backdrop"></div>
      <div class="pd-modal" role="dialog" aria-modal="true" aria-label="${this._t('eyedropper:palette.title', 'Matching Palette')}">
        <div class="pd-head">
          <span class="pd-head-title">${this._t('eyedropper:palette.title', 'Matching Palette')}</span>
          <button type="button" class="pd-head-close" aria-label="Close">${CLOSE_SVG}</button>
        </div>
        <div class="pd-controls">
          <div class="pd-field">
            <span class="pd-field-label">${this._t('eyedropper:palette.purpose', 'Purpose')}</span>
            <select class="pd-select" id="pd-purpose">
              ${PURPOSES.map((p) => `<option value="${p}">${this._t(`eyedropper:palette.purposes.${p}`, capitalize(p))}</option>`).join('')}
            </select>
          </div>
          <div class="pd-field">
            <span class="pd-field-label">${this._t('eyedropper:palette.minContrast', 'Min. contrast')}</span>
            <input type="number" class="pd-number" id="pd-min-contrast" min="1" max="21" step="0.1" value="${this._minContrast}">
          </div>
          <div class="pd-field">
            <span class="pd-field-label">${this._t('eyedropper:palette.format', 'Format')}</span>
            <div class="pd-mode" id="pd-format">
              <button type="button" data-format="hex" class="is-active">${this._t('eyedropper:palette.formatHex', 'Hex')}</button>
              <button type="button" data-format="oklch">${this._t('eyedropper:palette.formatOklch', 'OKLCH')}</button>
            </div>
          </div>
        </div>
        <div class="pd-body" id="pd-swatches"></div>
      </div>
    `

    this._shadowRoot.querySelector('.pd-head-close').addEventListener('click', () => this._onClose())
    this._shadowRoot.querySelector('.pd-backdrop').addEventListener('click', () => this._onClose())

    const purposeSelect = this._shadowRoot.querySelector('#pd-purpose')
    purposeSelect.value = this._purpose
    purposeSelect.addEventListener('change', (e) => { this.purpose = e.target.value })

    const minContrastInput = this._shadowRoot.querySelector('#pd-min-contrast')
    minContrastInput.addEventListener('change', (e) => {
      const value = Number.parseFloat(e.target.value)
      this.minContrast = Number.isFinite(value) ? value : this._minContrast
    })

    this._shadowRoot.querySelectorAll('#pd-format button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._shadowRoot.querySelectorAll('#pd-format button').forEach((b) => b.classList.toggle('is-active', b === btn))
        this.outputFormat = btn.dataset.format
      })
    })

    this._renderSwatches()
  }

  _renderSwatches () {
    const slot = this._shadowRoot?.querySelector('#pd-swatches')
    if (!slot) return
    const palette = generatePalette({
      backgroundHex: this._backgroundHex,
      purpose: this._purpose,
      minContrast: this._minContrast,
      outputFormat: this._outputFormat
    })
    slot.replaceChildren(...palette.map((color) => this._buildSwatch(color)))
  }

  _buildSwatch (color) {
    const card = document.createElement('div')
    card.className = 'pd-swatch'
    card.dataset.hue = color.name

    const swatch = document.createElement('div')
    swatch.className = 'pd-swatch-color'
    swatch.style.background = color.hex

    const name = document.createElement('div')
    name.className = 'pd-swatch-name'
    name.textContent = color.name

    const valueText = this._outputFormat === 'oklch' ? color.oklch : color.hex

    const valueRow = document.createElement('div')
    valueRow.className = 'pd-swatch-value-row'

    const value = document.createElement('span')
    value.className = 'pd-swatch-value'
    value.textContent = valueText

    const copyBtn = document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'pd-copy-btn'
    const copyLabel = this._t('eyedropper:palette.copy', 'Copy')
    copyBtn.setAttribute('aria-label', copyLabel)
    copyBtn.title = copyLabel
    copyBtn.innerHTML = COPY_SVG
    copyBtn.addEventListener('click', () => this._copyValue(valueText, copyBtn))

    valueRow.append(value, copyBtn)
    card.append(swatch, name, valueRow)

    if (!color.meetsContrastFloor) {
      const degraded = document.createElement('div')
      degraded.className = 'pd-swatch-degraded'
      degraded.textContent = `~${color.contrast.toFixed(1)}:1 (best achievable)`
      card.append(degraded)
    }

    return card
  }

  /**
   * Copy a swatch's value to the clipboard, flashing a checkmark on the
   * triggering button as feedback.
   * @param {string} text
   * @param {HTMLButtonElement} btn
   * @returns {void}
   */
  _copyValue (text, btn) {
    const markCopied = () => {
      btn.innerHTML = CHECK_SVG
      btn.classList.add('is-copied')
      clearTimeout(btn._copyResetTimer)
      btn._copyResetTimer = setTimeout(() => {
        btn.innerHTML = COPY_SVG
        btn.classList.remove('is-copied')
      }, 1200)
    }
    if (!navigator.clipboard?.writeText) {
      console.warn('[se-palette-dialog] Clipboard API unavailable')
      return
    }
    navigator.clipboard.writeText(text).then(markCopied, (err) => {
      console.warn('[se-palette-dialog] Failed to copy to clipboard', err)
    })
  }

  _onClose () {
    this.remove()
  }

  _bindKeys () {
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this._onClose()
      }
    }
    document.addEventListener('keydown', this._keyHandler)
  }
}

/**
 * @param {string} s
 * @returns {string}
 */
function capitalize (s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

customElements.define('se-palette-dialog', SePaletteDialog)
