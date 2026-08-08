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
  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
  <button class="trigger" title="Segment shape" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Segment shape" style="display:none">
    <div class="mode">
      <button class="mode-radial" aria-pressed="true">Radial</button>
      <button class="mode-grid" aria-pressed="false">Grid</button>
    </div>
    <div class="mode">
      <button class="split-off" aria-pressed="true">Non-split</button>
      <button class="split-on" aria-pressed="false">Split</button>
    </div>
    <div class="fields fields-radial">
      <div class="row2">
        <se-spin-input id="segment_count" label="Lines" min="2" max="72" step="1" value="4"></se-spin-input>
        <se-spin-input id="segment_start_angle" label="Start°" min="-180" max="180" step="15" value="-90"></se-spin-input>
      </div>
    </div>
    <div class="fields fields-grid" style="display:none">
      <div class="row2">
        <se-spin-input id="segment_grid_count" label="Lines" min="1" max="72" step="1" value="1"></se-spin-input>
        <div class="mode" style="align-self:end">
          <button class="axis-vertical" aria-pressed="true">Vertical</button>
          <button class="axis-horizontal" aria-pressed="false">Horizontal</button>
        </div>
      </div>
    </div>
    <div class="actions">
      <button class="apply">Apply</button>
    </div>
  </div>
`

/**
 * @class SeSegmentSettings
 * Toolbar button + popover for the Segment tool (radial/grid dividing
 * lines, split/non-split). Radial mode always divides around the shape's
 * own center (no center-mode picker — see `core/segment.js` `resolveCenter`).
 * Pure UI — reads seed params from `svgCanvas.getSegmentParams()` on open
 * and calls `svgCanvas.segmentSelection(params)` on Apply (both provided by
 * core/segment.js).
 */
class SeSegmentSettings extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)
    this._mode = 'radial'
    this._split = false
    this._axis = 'vertical'

    this.$radial = this._shadowRoot.querySelector('.mode-radial')
    this.$grid = this._shadowRoot.querySelector('.mode-grid')
    this.$splitOff = this._shadowRoot.querySelector('.split-off')
    this.$splitOn = this._shadowRoot.querySelector('.split-on')
    this.$fieldsRadial = this._shadowRoot.querySelector('.fields-radial')
    this.$fieldsGrid = this._shadowRoot.querySelector('.fields-grid')
    this.$axisVertical = this._shadowRoot.querySelector('.axis-vertical')
    this.$axisHorizontal = this._shadowRoot.querySelector('.axis-horizontal')
    this.$apply = this._shadowRoot.querySelector('.apply')

    this.$radial.addEventListener('click', () => this._setMode('radial'))
    this.$grid.addEventListener('click', () => this._setMode('grid'))
    this.$splitOff.addEventListener('click', () => this._setSplit(false))
    this.$splitOn.addEventListener('click', () => this._setSplit(true))
    this.$axisVertical.addEventListener('click', () => this._setAxis('vertical'))
    this.$axisHorizontal.addEventListener('click', () => this._setAxis('horizontal'))

    this.$apply.addEventListener('click', () => this.apply())
  }

  _setMode (mode) {
    this._mode = mode
    this.$radial.setAttribute('aria-pressed', String(mode === 'radial'))
    this.$grid.setAttribute('aria-pressed', String(mode === 'grid'))
    this.$fieldsRadial.style.display = mode === 'radial' ? 'flex' : 'none'
    this.$fieldsGrid.style.display = mode === 'grid' ? 'flex' : 'none'
  }

  _setSplit (split) {
    this._split = split
    this.$splitOff.setAttribute('aria-pressed', String(!split))
    this.$splitOn.setAttribute('aria-pressed', String(split))
  }

  _setAxis (axis) {
    this._axis = axis
    this.$axisVertical.setAttribute('aria-pressed', String(axis === 'vertical'))
    this.$axisHorizontal.setAttribute('aria-pressed', String(axis === 'horizontal'))
  }

  open () {
    // Seed from an existing non-split segment result on the selection, so
    // Apply re-edits it (split results have no live params to seed from).
    const existing = svgEditor.svgCanvas.getSegmentParams?.()
    if (existing) {
      this._setMode(existing.mode)
      this._setSplit(existing.split)
      if (existing.mode === 'radial') {
        this._shadowRoot.querySelector('#segment_count').value = existing.count
        this._shadowRoot.querySelector('#segment_start_angle').value = existing.startAngle
      } else {
        this._shadowRoot.querySelector('#segment_grid_count').value = existing.count
        this._setAxis(existing.axis)
      }
    }
    this.$apply.textContent = existing ? 'Update' : 'Apply'
    super.open()
  }

  apply () {
    const num = (id, fallback) => {
      const v = parseFloat(this._shadowRoot.querySelector(id).value)
      return Number.isFinite(v) ? v : fallback
    }
    let params
    if (this._mode === 'radial') {
      params = {
        mode: 'radial',
        split: this._split,
        count: Math.max(2, Math.round(num('#segment_count', 4))),
        startAngle: num('#segment_start_angle', -90)
      }
    } else {
      params = {
        mode: 'grid',
        split: this._split,
        count: Math.max(1, Math.round(num('#segment_grid_count', 1))),
        axis: this._axis
      }
    }
    svgEditor.svgCanvas.segmentSelection?.(params)
    this.close()
  }
}

// Register
customElements.define('se-segment-settings', SeSegmentSettings)
