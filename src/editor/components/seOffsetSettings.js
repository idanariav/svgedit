/* globals svgEditor */
import { SeSettingsPopover } from './seSettingsPopover.js'
import './seSpinInput.js'

const TEMPLATE_HTML = `
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
class SeOffsetSettings extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)
    this._direction = 'outset'

    this.$dist = this._shadowRoot.querySelector('#offset_dist')
    this.$out = this._shadowRoot.querySelector('.dir-out')
    this.$in = this._shadowRoot.querySelector('.dir-in')
    this.$apply = this._shadowRoot.querySelector('.apply')

    this.$out.addEventListener('click', () => this._setDirection('outset'))
    this.$in.addEventListener('click', () => this._setDirection('inset'))
    this.$apply.addEventListener('click', () => this.apply())
  }

  _setDirection (dir) {
    this._direction = dir
    this.$out.setAttribute('aria-pressed', String(dir === 'outset'))
    this.$in.setAttribute('aria-pressed', String(dir === 'inset'))
  }

  open () {
    if (!this.$dist.value) this.$dist.value = 10
    super.open()
  }

  apply () {
    const dist = parseFloat(this.$dist.value)
    if (!Number.isFinite(dist) || dist <= 0) return
    const delta = this._direction === 'inset' ? -dist : dist
    svgEditor.svgCanvas.offsetPath(delta)
    this.close()
  }
}

// Register
customElements.define('se-offset-settings', SeOffsetSettings)
