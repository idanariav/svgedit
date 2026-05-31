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
    gap: 12px;
    min-width: 200px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .dir {
    display: flex;
    gap: 6px;
  }
  .dir button {
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
  .dir button[aria-pressed="true"] {
    border-color: var(--accent-border, #C7D7FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
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
  <button class="trigger" title="Offset path" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Offset path" style="display:none">
    <se-spin-input id="offset_dist" label="Distance" min="0" step="1"></se-spin-input>
    <div class="dir">
      <button class="dir-out" aria-pressed="true">Outset</button>
      <button class="dir-in" aria-pressed="false">Inset</button>
    </div>
    <div class="actions">
      <button class="apply">Apply</button>
    </div>
  </div>
`

/**
 * @class SeOffsetSettings
 * Toolbar button that opens a popover for offsetting (outset) or insetting the
 * selected shape's outline by a chosen distance.
 */
class SeOffsetSettings extends HTMLElement {
  constructor () {
    super()
    this.handleClose = this.handleClose.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this._direction = 'outset'

    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))

    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$icon = this._shadowRoot.querySelector('#icon')
    this.$trigger = this._shadowRoot.querySelector('.trigger')
    this.$popup = this._shadowRoot.querySelector('#options-container')
    this.$dist = this._shadowRoot.querySelector('#offset_dist')
    this.$out = this._shadowRoot.querySelector('.dir-out')
    this.$in = this._shadowRoot.querySelector('.dir-in')
    this.$apply = this._shadowRoot.querySelector('.apply')

    this.$out.addEventListener('click', () => this._setDirection('outset'))
    this.$in.addEventListener('click', () => this._setDirection('inset'))

    this.$trigger.addEventListener('click', e => {
      e.stopPropagation()
      this.toggle()
    })
    this.$apply.addEventListener('click', () => this.apply())
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

  _setDirection (dir) {
    this._direction = dir
    this.$out.setAttribute('aria-pressed', String(dir === 'outset'))
    this.$in.setAttribute('aria-pressed', String(dir === 'inset'))
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
    if (!this.$dist.value) this.$dist.value = 10
    this.$popup.style.display = 'flex'
    this.$trigger.setAttribute('aria-expanded', 'true')
    this.positionPopup()
  }

  close () {
    this.$popup.style.display = 'none'
    this.$trigger.setAttribute('aria-expanded', 'false')
  }

  /**
   * Position the popover near the trigger, flipping above it when there isn't
   * room below (this button lives low in the right panel), and clamping to the
   * viewport so the Apply button stays visible.
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

    // Prefer below; flip above if it would overflow the bottom of the viewport.
    let top = btn.bottom + gap
    if (top + pop.height > window.innerHeight - margin) {
      const aboveTop = btn.top - gap - pop.height
      top = aboveTop >= margin
        ? aboveTop
        : Math.max(margin, window.innerHeight - pop.height - margin)
    }

    this.$popup.style.top = `${top}px`
    this.$popup.style.left = `${left}px`
  }

  apply () {
    const dist = parseFloat(this.$dist.value)
    if (!Number.isFinite(dist) || dist <= 0) return
    const delta = this._direction === 'inset' ? -dist : dist
    svgEditor.svgCanvas.offsetPath(delta)
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
customElements.define('se-offset-settings', SeOffsetSettings)
