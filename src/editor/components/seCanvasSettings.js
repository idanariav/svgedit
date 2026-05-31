/* globals svgEditor */
import { fetchSvgEl } from './svgIconLoader.js'
import './seSpinInput.js'

// Aspect-ratio presets → fixed pixel sizes (base = longest side = 1000px).
const PRESETS = [
  { label: '4:5', w: 800, h: 1000 },
  { label: '5:4', w: 1000, h: 800 },
  { label: '16:9', w: 1000, h: 563 },
  { label: '1:1', w: 1000, h: 1000 }
]

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
  }
  .trigger {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--icon, #4B5563);
    cursor: pointer;
    transition: background .12s, color .12s;
  }
  .trigger:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .trigger[aria-expanded="true"] {
    background: var(--accent-soft, #E8EFFF);
    border-color: var(--accent-border, #C7D7FF);
    color: var(--accent, #2962FF);
  }
  #icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #icon svg, #icon img {
    width: 18px;
    height: 18px;
    display: block;
  }
  #options-container {
    position: fixed;
    flex-direction: column;
    gap: 12px;
    min-width: 220px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .dims {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .presets {
    display: flex;
    gap: 6px;
  }
  .preset {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 7px;
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s, border-color .12s, color .12s;
  }
  .preset:hover {
    border-color: var(--accent-border, #C7D7FF);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions button {
    flex: 1;
    padding: 7px 0;
    border-radius: 8px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s, border-color .12s, color .12s;
  }
  .reset {
    border: 1px solid var(--field-border, #E2E5EA);
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
  }
  .reset:hover {
    border-color: var(--field-border-h, #C8CDD6);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  .apply {
    border: 1px solid var(--accent-border, #C7D7FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
  }
  .apply:hover {
    border-color: var(--accent, #2962FF);
  }
  </style>
  <button class="trigger" title="Canvas settings" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Canvas settings" style="display:none">
    <div class="dims">
      <se-spin-input id="canvas_w" label="W" min="1" step="1"></se-spin-input>
      <se-spin-input id="canvas_h" label="H" min="1" step="1"></se-spin-input>
    </div>
    <div class="presets"></div>
    <div class="actions">
      <button class="reset">Reset</button>
      <button class="apply">Apply</button>
    </div>
  </div>
`

/**
 * @class SeCanvasSettings
 * Toolbar button that opens a popover for quickly resizing the canvas
 * (explicit width/height plus aspect-ratio presets).
 */
class SeCanvasSettings extends HTMLElement {
  constructor () {
    super()
    this.handleClose = this.handleClose.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)

    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))

    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$icon = this._shadowRoot.querySelector('#icon')
    this.$trigger = this._shadowRoot.querySelector('.trigger')
    this.$popup = this._shadowRoot.querySelector('#options-container')
    this.$w = this._shadowRoot.querySelector('#canvas_w')
    this.$h = this._shadowRoot.querySelector('#canvas_h')
    this.$presets = this._shadowRoot.querySelector('.presets')
    this.$apply = this._shadowRoot.querySelector('.apply')
    this.$reset = this._shadowRoot.querySelector('.reset')

    // Build preset buttons
    PRESETS.forEach(({ label, w, h }) => {
      const btn = document.createElement('button')
      btn.className = 'preset'
      btn.textContent = label
      btn.addEventListener('click', () => {
        this.$w.value = w
        this.$h.value = h
      })
      this.$presets.append(btn)
    })

    this.$trigger.addEventListener('click', e => {
      e.stopPropagation()
      this.toggle()
    })
    this.$apply.addEventListener('click', () => this.apply())
    this.$reset.addEventListener('click', () => this.reset())
    // Light-dismiss: close on outside click / Esc
    document.addEventListener('click', this.handleClose)
    this.addEventListener('keydown', this.handleKeyDown)

    const srcAttr = this.getAttribute('src')
    if (srcAttr) this._loadIcon(srcAttr)
    const titleAttr = this.getAttribute('title')
    if (titleAttr) this.$trigger.setAttribute('title', titleAttr)
  }

  async _loadIcon (src) {
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      // canvas.svg is a filled icon; the shared loader also adds a 2px
      // currentColor stroke which renders the edges heavy. Thin it slightly.
      svgEl.setAttribute('stroke-width', '1.3')
      svgEl.style.cssText = 'width:18px;height:18px;display:block;'
      this.$icon.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      img.style.cssText = 'width:18px;height:18px;display:block;'
      this.$icon.replaceChildren(img)
    }
  }

  get isOpen () {
    return this.$popup.style.display === 'flex'
  }

  toggle () {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  open () {
    // Pre-fill inputs with the current canvas resolution and remember it so
    // Reset can restore the size the canvas had when the popover was opened.
    const res = svgEditor.svgCanvas.getResolution()
    this._original = { w: Math.round(res.w), h: Math.round(res.h) }
    this.$w.value = this._original.w
    this.$h.value = this._original.h
    this.$popup.style.display = 'flex'
    this.$trigger.setAttribute('aria-expanded', 'true')
    this.positionPopup()
  }

  close () {
    this.$popup.style.display = 'none'
    this.$trigger.setAttribute('aria-expanded', 'false')
  }

  /**
   * Position the popover just below the trigger, clamped to the viewport.
   */
  positionPopup () {
    const btn = this.$trigger.getBoundingClientRect()
    const pop = this.$popup.getBoundingClientRect()
    const gap = 6
    let left = btn.left
    if (left + pop.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - pop.width - 8)
    }
    this.$popup.style.top = `${btn.bottom + gap}px`
    this.$popup.style.left = `${left}px`
  }

  apply () {
    const w = parseInt(this.$w.value, 10)
    const h = parseInt(this.$h.value, 10)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return
    }
    svgEditor.svgCanvas.setResolution(w, h)
    svgEditor.updateCanvas()
    this.close()
  }

  /**
   * Restore the inputs to the size captured when the popover was opened,
   * discarding any staged input/preset changes.
   */
  reset () {
    if (!this._original) return
    this.$w.value = this._original.w
    this.$h.value = this._original.h
  }

  handleClose (e) {
    // e.target is the <se-canvas-settings> host for clicks anywhere inside it
    if (this.isOpen && e.target !== this) {
      this.close()
    }
  }

  handleKeyDown (e) {
    if (e.key === 'Escape' && this.isOpen) {
      this.close()
      this.$trigger.focus()
    }
  }
}

// Register
customElements.define('se-canvas-settings', SeCanvasSettings)
