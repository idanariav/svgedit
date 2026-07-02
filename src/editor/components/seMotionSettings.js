/* globals svgEditor */
import { fetchSvgEl } from './svgIconLoader.js'
import './seSpinInput.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
  }
  .trigger {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
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
    gap: 10px;
    min-width: 210px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .mode {
    display: flex;
    gap: 6px;
  }
  .mode button {
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
  .mode button[aria-pressed="true"] {
    border-color: var(--accent-border, #C7D7FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
  }
  .row2 {
    display: flex;
    gap: 8px;
  }
  .row2 > * {
    flex: 1;
  }
  .actions {
    display: flex;
  }
  .apply {
    flex: 1;
    padding: 7px 0;
    border-radius: 8px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--accent-border, #C7D7FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
    transition: background .12s, border-color .12s, color .12s;
  }
  .apply:hover {
    border-color: var(--accent, #2962FF);
  }
  </style>
  <button class="trigger" title="Motion lines" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Motion lines" style="display:none">
    <div class="mode" id="dir_row">
      <button data-dir="left" aria-pressed="true">Left</button>
      <button data-dir="right" aria-pressed="false">Right</button>
      <button data-dir="up" aria-pressed="false">Up</button>
      <button data-dir="down" aria-pressed="false">Down</button>
    </div>
    <div class="row2">
      <se-spin-input id="motion_count" label="Lines" min="1" max="9" step="1" value="3"></se-spin-input>
      <se-spin-input id="motion_len" label="Length" min="5" max="2000" step="5" value="80"></se-spin-input>
    </div>
    <div class="row2">
      <se-spin-input id="motion_gap" label="Gap" min="0" max="1000" step="1" value="15"></se-spin-input>
      <se-spin-input id="motion_curve" label="Curve" min="-100" max="100" step="5" value="0"></se-spin-input>
    </div>
    <div class="actions">
      <button class="apply">Apply</button>
    </div>
  </div>
`

/**
 * @class SeMotionSettings
 * Button + popover for the parametric motion-line (speed-line) generator.
 * Pure UI — seeds from `svgCanvas.getMotionParams()` and calls
 * `svgCanvas.applyMotionLines(params)` (both provided by ext-motion-lines).
 */
class SeMotionSettings extends HTMLElement {
  constructor () {
    super()
    this.handleClose = this.handleClose.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this._dir = 'left'

    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))

    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$icon = this._shadowRoot.querySelector('#icon')
    this.$trigger = this._shadowRoot.querySelector('.trigger')
    this.$popup = this._shadowRoot.querySelector('#options-container')
    this.$apply = this._shadowRoot.querySelector('.apply')

    for (const btn of this._shadowRoot.querySelectorAll('#dir_row button')) {
      btn.addEventListener('click', () => this._setDir(btn.dataset.dir))
    }
    this.$trigger.addEventListener('click', e => {
      e.stopPropagation()
      this.toggle()
    })
    this.$apply.addEventListener('click', () => this.apply())
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

  _setDir (dir) {
    this._dir = dir
    for (const btn of this._shadowRoot.querySelectorAll('#dir_row button')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.dir === dir))
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
    // Seed from existing motion lines on the selection so Apply re-edits.
    const existing = svgEditor.svgCanvas.getMotionParams?.()
    if (existing) {
      this._setDir(existing.dir)
      this._shadowRoot.querySelector('#motion_count').value = existing.count
      this._shadowRoot.querySelector('#motion_len').value = existing.len
      this._shadowRoot.querySelector('#motion_gap').value = existing.gap
      this._shadowRoot.querySelector('#motion_curve').value = existing.curve
    }
    this.$apply.textContent = existing ? 'Update' : 'Apply'
    this.$popup.style.display = 'flex'
    this.$trigger.setAttribute('aria-expanded', 'true')
    this.positionPopup()
  }

  close () {
    this.$popup.style.display = 'none'
    this.$trigger.setAttribute('aria-expanded', 'false')
  }

  /**
   * Same containing-block-aware positioning as se-repeat-settings.
   */
  positionPopup () {
    const btn = this.$trigger.getBoundingClientRect()
    const pop = this.$popup.getBoundingClientRect()
    const gap = 6
    const margin = 8

    let left = btn.left
    if (left + pop.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - pop.width - margin)
    }

    let top = btn.bottom + gap
    if (top + pop.height > window.innerHeight - margin) {
      const aboveTop = btn.top - gap - pop.height
      top = aboveTop >= margin
        ? aboveTop
        : Math.max(margin, window.innerHeight - pop.height - margin)
    }

    let styleLeft = left
    let styleTop = top
    for (let i = 0; i < 4; i++) {
      this.$popup.style.left = `${styleLeft}px`
      this.$popup.style.top = `${styleTop}px`
      const after = this.$popup.getBoundingClientRect()
      const dx = left - after.left
      const dy = top - after.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break
      styleLeft += dx
      styleTop += dy
    }
  }

  apply () {
    const num = (id, fallback) => {
      const v = parseFloat(this._shadowRoot.querySelector(id).value)
      return Number.isFinite(v) ? v : fallback
    }
    svgEditor.svgCanvas.applyMotionLines?.({
      dir: this._dir,
      count: Math.max(1, Math.round(num('#motion_count', 3))),
      len: num('#motion_len', 80),
      gap: num('#motion_gap', 15),
      curve: num('#motion_curve', 0)
    })
    this.close()
  }

  handleClose (e) {
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
customElements.define('se-motion-settings', SeMotionSettings)
