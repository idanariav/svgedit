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
    gap: 10px;
    min-width: 200px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .hint {
    font-size: 11px;
    color: var(--muted, #6B7280);
    line-height: 1.4;
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
  <button class="trigger" title="Smooth path" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Smooth path" style="display:none">
    <se-spin-input id="smooth_strength" label="Strength %" min="0" max="100" step="5" value="40"></se-spin-input>
    <div class="hint">Removes jitter and refits smooth curves. Previews live; adjust freely before applying.</div>
    <div class="actions">
      <button class="apply">Apply</button>
    </div>
  </div>
`

/**
 * @class SeSmoothPathSettings
 * Toolbar button that opens a popover for smoothing the selected path's
 * jitter/hand-tremor by a chosen strength. Pure UI — every strength change
 * previews live via `svgCanvas.previewSmoothPath(strength)` (no undo step),
 * re-fitting from the shape as it was when the popover opened so repeated
 * adjustments never compound. `Apply` commits one undo step
 * (`svgCanvas.commitSmoothPath()`); closing without applying reverts
 * (`svgCanvas.cancelSmoothPath()`).
 */
class SeSmoothPathSettings extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)
    this._applied = false

    this.$strength = this._shadowRoot.querySelector('#smooth_strength')
    this.$apply = this._shadowRoot.querySelector('.apply')

    this.$strength.addEventListener('change', () => this._preview())
    this.$apply.addEventListener('click', () => this.apply())
  }

  _preview () {
    const strength = parseFloat(this.$strength.value)
    if (!Number.isFinite(strength)) return
    svgEditor.svgCanvas.previewSmoothPath?.(Math.max(0, Math.min(100, strength)) / 100)
  }

  open () {
    this._applied = false
    super.open()
    this._preview()
  }

  apply () {
    this._applied = true
    svgEditor.svgCanvas.commitSmoothPath?.()
    this.close()
  }

  close () {
    if (!this._applied) {
      svgEditor.svgCanvas.cancelSmoothPath?.()
    }
    super.close()
  }
}

// Register
customElements.define('se-smooth-path-settings', SeSmoothPathSettings)
