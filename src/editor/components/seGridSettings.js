/* globals svgEditor */
import { fetchSvgEl } from './svgIconLoader.js'

// Grid shapes offered in the popover. `value` is stored in
// `curConfig.gridShape`; `label` is shown in the <select>.
const SHAPES = [
  { value: 'square', label: 'Square' },
  { value: 'isometric', label: 'Isometric' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'perspective1', label: '1-point perspective' },
  { value: 'perspective2', label: '2-point perspective' }
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
  .trigger[aria-expanded="true"],
  .trigger[data-active="true"] {
    background: var(--accent-soft, #E8EFFF);
    border-color: var(--accent-border, #C7D7FF);
    color: var(--accent, #2962FF);
  }
  #icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; }
  #icon svg, #icon img { width: 18px; height: 18px; display: block; }
  #options-container {
    position: fixed;
    flex-direction: column;
    gap: 10px;
    min-width: 230px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .row label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg, #1B1F24);
    white-space: nowrap;
  }
  .toggle { cursor: pointer; }
  select, input[type="number"] {
    box-sizing: border-box;
    height: 30px;
    min-width: 0;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 7px;
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    font: inherit;
    font-size: 12.5px;
    padding: 0 8px;
    outline: none;
  }
  select { flex: 1; cursor: pointer; }
  input[type="number"] { width: 72px; }
  select:focus, input:focus {
    border-color: var(--accent, #2962FF);
    background: var(--chrome-bg, #FFFFFF);
    box-shadow: 0 0 0 3px var(--accent-ring, rgba(41,98,255,0.16));
  }
  input[type="color"] {
    width: 34px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 7px;
    background: var(--field-bg, #F7F8FA);
    cursor: pointer;
  }
  .sep { height: 1px; background: var(--chrome-border, #E6E8EC); margin: 2px 0; border: 0; }
  </style>
  <button class="trigger" title="Grid settings" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Grid settings" style="display:none">
    <div class="row">
      <label for="grid_show">Show grid</label>
      <input class="toggle" type="checkbox" id="grid_show" />
    </div>
    <div class="row">
      <label for="grid_shape_sel">Shape</label>
      <select id="grid_shape_sel"></select>
    </div>
    <hr class="sep" />
    <div class="row">
      <label for="grid_snap">Snap to grid</label>
      <input class="toggle" type="checkbox" id="grid_snap" />
    </div>
    <div class="row">
      <label for="grid_step">Step size</label>
      <input type="number" id="grid_step" min="1" step="1" />
    </div>
    <div class="row">
      <label for="grid_col">Grid color</label>
      <input type="color" id="grid_col" />
    </div>
  </div>
`

/**
 * @class SeGridSettings
 * Toolbar button that opens a popover housing all grid controls: show/hide,
 * grid shape, snap-to-grid, snapping step, and grid color. Values are written
 * straight to `svgEditor.configObj.curConfig` and mirrored to the persisted
 * `grid_*` preferences; a `change` event is dispatched so `ext-grid` re-renders.
 */
class SeGridSettings extends HTMLElement {
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
    this.$show = this._shadowRoot.querySelector('#grid_show')
    this.$shape = this._shadowRoot.querySelector('#grid_shape_sel')
    this.$snap = this._shadowRoot.querySelector('#grid_snap')
    this.$step = this._shadowRoot.querySelector('#grid_step')
    this.$color = this._shadowRoot.querySelector('#grid_col')

    SHAPES.forEach(({ value, label }) => {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = label
      this.$shape.append(opt)
    })

    this.$trigger.addEventListener('click', e => {
      e.stopPropagation()
      this.toggle()
    })
    this.$show.addEventListener('change', () => this._commit('showGrid', 'grid_show', this.$show.checked))
    this.$snap.addEventListener('change', () => this._commit('gridSnapping', 'grid_snapping', this.$snap.checked))
    this.$shape.addEventListener('change', () => this._commit('gridShape', 'grid_shape', this.$shape.value))
    this.$color.addEventListener('input', () => this._commit('gridColor', 'grid_color', this.$color.value))
    this.$step.addEventListener('change', () => {
      const step = parseFloat(this.$step.value)
      if (Number.isFinite(step) && step > 0) this._commit('snappingStep', 'grid_snapping_step', step)
    })

    // Light-dismiss: close on outside click / Esc
    document.addEventListener('click', this.handleClose)
    this.addEventListener('keydown', this.handleKeyDown)

    const srcAttr = this.getAttribute('src')
    if (srcAttr) this._loadIcon(srcAttr)
    const titleAttr = this.getAttribute('title')
    if (titleAttr) this.$trigger.setAttribute('title', titleAttr)
  }

  connectedCallback () {
    this._syncFromConfig()
  }

  /**
   * Write a value to both the runtime config and the persisted preference,
   * then notify listeners (ext-grid) to re-render.
   * @param {string} cfgKey curConfig key
   * @param {string} prefKey persisted preference key
   * @param {boolean|string|number} value
   * @returns {void}
   */
  _commit (cfgKey, prefKey, value) {
    svgEditor.configObj.curConfig[cfgKey] = value
    svgEditor.configObj.pref(prefKey, String(value), true)
    this._updateTriggerState()
    this.dispatchEvent(new CustomEvent('change', { detail: { key: cfgKey, value } }))
  }

  _syncFromConfig () {
    const cfg = svgEditor.configObj.curConfig
    this.$show.checked = !!cfg.showGrid
    this.$snap.checked = !!cfg.gridSnapping
    this.$shape.value = cfg.gridShape || 'square'
    this.$step.value = cfg.snappingStep ?? 10
    this.$color.value = this._toHex(cfg.gridColor || '#000000')
    this._updateTriggerState()
  }

  // <input type="color"> requires a 6-digit hex; expand shorthand like #000.
  _toHex (c) {
    const m = /^#([0-9a-f]{3})$/i.exec(c)
    if (m) return '#' + m[1].split('').map(ch => ch + ch).join('')
    return /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000'
  }

  _updateTriggerState () {
    this.$trigger.setAttribute('data-active', String(!!svgEditor.configObj.curConfig.showGrid))
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

  get isOpen () {
    return this.$popup.style.display === 'flex'
  }

  toggle () {
    if (this.isOpen) { this.close() } else { this.open() }
  }

  open () {
    this._syncFromConfig()
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
customElements.define('se-grid-settings', SeGridSettings)
