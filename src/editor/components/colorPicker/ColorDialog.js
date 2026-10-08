/**
 * ColorDialog.js — <se-color-dialog> web component.
 * Replaces the legacy jGraduate/jPicker modal with a themed, accessible dialog.
 */

import { css } from './ColorDialog.css.js'
import { stateToPaint } from './PaintModel.js'
import { createSolidPanel } from './panels/SolidPanel.js'
import { createLinearPanel } from './panels/LinearPanel.js'
import { createRadialPanel } from './panels/RadialPanel.js'
import { fetchSvgEl } from '../svgIconLoader.js'
import { closestRoot, ownerEditor } from '../../domScope.js'
import { warn as logWarn } from '@svgedit/svgcanvas/common/logger.js'

const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><path d="M6 6l12 12M18 6L6 18"/></svg>'

/**
 * @class SeColorDialog
 * @property {object} paint  - Set before appending to DOM
 * @property {string} type   - 'fill' | 'stroke' | 'background'
 * @property {object} i18next
 */
export class SeColorDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._paint = null
    this._type = 'fill'
    this._i18next = null
    this._currentPanel = null
    this._activeTab = 'solid'
    this._themeObserver = null
    this._keyHandler = null
  }

  set paint (p) { this._paint = p }
  get paint () { return this._paint }
  set type (t) { this._type = t }
  get type () { return this._type }
  set i18next (i) { this._i18next = i }
  get i18next () { return this._i18next }
  /**
   * Swatch this dialog belongs to. When set before the dialog is attached it opens as
   * a popover next to that element (no backdrop; outside click applies, Escape
   * cancels) instead of a centred modal with Apply/Cancel.
   * @type {?Element}
   */
  set anchor (el) { this._anchor = el }
  get anchor () { return this._anchor ?? null }

  connectedCallback () {
    this._activeTab = this._inferTab()
    this._popover = !!this._anchor
    this.classList.toggle('popover', this._popover)
    this._render()
    this._syncTheme()
    this._observeTheme()
    this._bindKeys()
    if (this._popover) this._setupPopover()
  }

  disconnectedCallback () {
    this._themeObserver?.disconnect()
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
    }
    this._teardownPopover()
  }

  // ── Popover mode ───────────────────────────────────────────────────────────
  _setupPopover () {
    this._dirty = false
    // Pointer-down anywhere outside the popover (and its own swatch, whose click
    // toggles it) commits it — and the click still reaches whatever was hit, so
    // "pick a colour, then click the next shape" is one gesture.
    this._outsideHandler = (e) => {
      if (this._picking) return
      const path = e.composedPath()
      if (path.includes(this) || (this._anchor && path.includes(this._anchor))) return
      this._commit()
    }
    document.addEventListener('pointerdown', this._outsideHandler, true)
    this._resizeHandler = () => this._position()
    window.addEventListener('resize', this._resizeHandler)
    const modal = this._shadowRoot.querySelector('.cp-modal')
    if (typeof ResizeObserver !== 'undefined') {
      // Switching tabs changes the popover's height: keep it on screen.
      this._sizeObserver = new ResizeObserver(this._resizeHandler)
      this._sizeObserver.observe(modal)
    }
    this._position()
  }

  _teardownPopover () {
    if (this._outsideHandler) document.removeEventListener('pointerdown', this._outsideHandler, true)
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler)
    this._sizeObserver?.disconnect()
    this._outsideHandler = this._resizeHandler = this._sizeObserver = null
  }

  /** Place the popover beside its swatch: above it in the lower half of the window, else below; clamped on-screen. */
  _position () {
    const modal = this._shadowRoot.querySelector('.cp-modal')
    if (!modal || !this._anchor?.isConnected) return
    const a = this._anchor.getBoundingClientRect()
    const M = 8
    const mw = modal.offsetWidth
    const mh = modal.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))
    const left = clamp(a.left, M, vw - mw - M)
    const below = a.bottom + M
    const above = a.top - M - mh
    const preferAbove = a.top > vh / 2
    const top = clamp(preferAbove ? (above >= M ? above : below) : (below + mh <= vh - M ? below : above), M, Math.max(M, vh - mh - M))
    this.style.setProperty('--cp-left', `${Math.round(left)}px`)
    this.style.setProperty('--cp-top', `${Math.round(top)}px`)
  }

  /** Popover: keep what the user changed, drop an untouched dialog without a no-op apply. */
  _commit () {
    if (this._popover && !this._dirty) this._onCancel()
    else this._onApply()
  }

  // ── Theme sync ─────────────────────────────────────────────────────────────
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

  // ── Tab inference ──────────────────────────────────────────────────────────
  _inferTab () {
    const type = this._paint?.type
    if (type === 'linearGradient') return 'linear'
    if (type === 'radialGradient') return 'radial'
    return 'solid'
  }

  _t (key) {
    try { return this._i18next?.t(key) || key } catch { return key }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _render () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    this._shadowRoot.adoptedStyleSheets = [sheet]

    // Title text
    const typeLabel = this._type === 'background'
      ? 'Background'
      : this._type === 'stroke' ? 'Stroke' : 'Fill'

    this._shadowRoot.innerHTML = `
      <div class="cp-backdrop" part="backdrop"></div>
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Change ${typeLabel} color">
        <div class="cp-head">
          <span class="cp-head-title">
            <span class="cp-head-pre">Change</span>
            <strong class="cp-head-target">${typeLabel}</strong>
            <span>color</span>
          </span>
          <button type="button" class="cp-head-close" aria-label="Close">${CLOSE_SVG}</button>
        </div>
        <div class="cp-tabsrow">
          <div class="cp-tabs" role="tablist">
            <button type="button" class="cp-tab ${this._activeTab === 'solid' ? 'is-active' : ''}" data-tab="solid" role="tab" aria-selected="${this._activeTab === 'solid'}">
              ${this._t('config.jgraduate_solid_color') || 'Solid Color'}
            </button>
            <button type="button" class="cp-tab ${this._activeTab === 'linear' ? 'is-active' : ''}" data-tab="linear" role="tab" aria-selected="${this._activeTab === 'linear'}">
              ${this._t('config.jgraduate_linear_gradient') || 'Linear Gradient'}
            </button>
            <button type="button" class="cp-tab ${this._activeTab === 'radial' ? 'is-active' : ''}" data-tab="radial" role="tab" aria-selected="${this._activeTab === 'radial'}">
              ${this._t('config.jgraduate_radial_gradient') || 'Radial Gradient'}
            </button>
          </div>
          <button type="button" class="cp-eyedropper" title="Pick color from canvas" aria-label="Pick color from canvas"></button>
        </div>
        <div class="cp-body-slot"></div>
        <div class="cp-foot">
          <div class="cp-foot-spacer"></div>
          <button type="button" class="cp-btn cp-btn-ghost">${this._t('common.cancel') || 'Cancel'}</button>
          <button type="button" class="cp-btn cp-btn-primary">${this._t('common.apply') || this._t('common.ok') || 'Apply'}</button>
        </div>
      </div>
    `

    // Wire tab buttons
    this._shadowRoot.querySelectorAll('.cp-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab))
    })

    // Wire eyedropper button and load icon
    const eyedropperBtn = this._shadowRoot.querySelector('.cp-eyedropper')
    eyedropperBtn.addEventListener('click', () => this._startEyedropper())
    const imgPath = ownerEditor(this)?.configObj?.curConfig?.imgPath
    if (imgPath) {
      fetchSvgEl(`${imgPath}/eye_dropper.svg`).then(svgEl => {
        if (svgEl && eyedropperBtn.isConnected) {
          svgEl.setAttribute('width', '15')
          svgEl.setAttribute('height', '15')
          eyedropperBtn.replaceChildren(svgEl)
        }
      })
    }

    // Wire header close
    this._shadowRoot.querySelector('.cp-head-close').addEventListener('click', () => (this._popover ? this._commit() : this._onCancel()))

    // Wire footer
    this._shadowRoot.querySelector('.cp-btn-ghost').addEventListener('click', () => this._onCancel())
    this._shadowRoot.querySelector('.cp-btn-primary').addEventListener('click', () => this._onApply())

    // Wire backdrop (close only if no field has focus)
    this._shadowRoot.querySelector('.cp-backdrop').addEventListener('click', () => {
      if (!this._shadowRoot.activeElement) this._onCancel()
    })

    // Live preview: report every colour tweak (solid or gradient) so the host can
    // show it on the drawing before Apply (Cancel/Escape reverts).
    this._shadowRoot.querySelector('.cp-body-slot').addEventListener('color-change', () => {
      if (!this._currentPanel) return
      this._dirty = true
      this.dispatchEvent(new CustomEvent('preview', {
        detail: { paint: stateToPaint(this._currentPanel.getPaintState()) }
      }))
    })

    // Mount initial panel
    this._switchTab(this._activeTab)
  }

  // ── Tab switching ──────────────────────────────────────────────────────────
  _switchTab (tab) {
    if (this._currentPanel) this._dirty = true // choosing another paint type is a change
    this._activeTab = tab

    // Update tab button states
    this._shadowRoot.querySelectorAll('.cp-tab').forEach(btn => {
      const active = btn.dataset.tab === tab
      btn.classList.toggle('is-active', active)
      btn.setAttribute('aria-selected', active)
    })

    // Create the appropriate panel
    let panel
    if (tab === 'linear') {
      panel = createLinearPanel(this._paint, this._i18next)
    } else if (tab === 'radial') {
      panel = createRadialPanel(this._paint, this._i18next)
    } else {
      panel = createSolidPanel(this._paint)
    }

    // Mount panel
    const slot = this._shadowRoot.querySelector('.cp-body-slot')
    slot.innerHTML = ''
    slot.appendChild(panel)
    this._currentPanel = panel
  }

  // ── Eyedropper pick ────────────────────────────────────────────────────────
  async _startEyedropper () {
    if (!window.EyeDropper) {
      logWarn('[se-color-dialog] EyeDropper API not available in this environment', undefined, 'ColorDialog')
      return
    }
    // Hide the dialog so the user can see the canvas while picking, and undo the
    // in-group dimming so the sampled pixels are the drawing's real colours.
    this.style.display = 'none'
    this._picking = true
    const resumeDimming = ownerEditor(this)?.svgCanvas?.suspendContextDimming?.()
    try {
      const result = await new window.EyeDropper().open()
      const hex = result.sRGBHex.replace('#', '')
      this._currentPanel?.setFromHex?.(hex)
    } catch {
      // User cancelled (Escape) — no-op.
    } finally {
      resumeDimming?.()
      this._picking = false
      this.style.display = ''
    }
  }

  // ── Apply / Cancel ─────────────────────────────────────────────────────────
  _onApply () {
    if (!this._currentPanel) { this.remove(); return }
    const state = this._currentPanel.getPaintState()
    const paint = stateToPaint(state)
    this.dispatchEvent(new CustomEvent('change', {
      detail: { paint },
      bubbles: false
    }))
    this.remove()
  }

  _onCancel () {
    this.dispatchEvent(new CustomEvent('cancel'))
    this.remove()
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  _bindKeys () {
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this._onCancel()
      } else if (e.key === 'Enter' && this._popover && !e.composedPath().some(n => n.tagName === 'INPUT' || n.tagName === 'BUTTON')) {
        // Enter inside a field commits that field; elsewhere it commits the popover.
        e.preventDefault()
        this._commit()
      }
    }
    document.addEventListener('keydown', this._keyHandler)
  }
}
