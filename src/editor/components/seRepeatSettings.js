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
  .pick-center {
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
  .pick-center:hover {
    background: var(--icon-hover-bg, #EEF1F5);
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
  <button class="trigger" title="Repeat" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Repeat" style="display:none">
    <div class="mode">
      <button class="mode-radial" aria-pressed="true">Radial</button>
      <button class="mode-grid" aria-pressed="false">Grid</button>
      <button class="mode-path" aria-pressed="false">Path</button>
    </div>
    <div class="fields fields-radial">
      <div class="row2">
        <se-spin-input id="repeat_count" label="Copies" min="1" max="36" step="1" value="6"></se-spin-input>
        <se-spin-input id="repeat_sweep" label="Sweep°" min="15" max="360" step="15" value="360"></se-spin-input>
      </div>
      <div class="mode">
        <button class="center-canvas" aria-pressed="true">Canvas center</button>
        <button class="center-selection" aria-pressed="false">Own center</button>
        <button class="center-custom" aria-pressed="false">Custom</button>
      </div>
      <div class="row2 custom-center-row" style="display:none">
        <button class="pick-center" style="flex:1">Pick center</button>
        <span class="center-readout" style="flex:1; font-size:11px; color:var(--muted, #6B7280); align-self:center; text-align:right">not set</span>
      </div>
    </div>
    <div class="fields fields-grid" style="display:none">
      <div class="row2">
        <se-spin-input id="repeat_rows" label="Rows" min="1" max="30" step="1" value="2"></se-spin-input>
        <se-spin-input id="repeat_cols" label="Cols" min="1" max="30" step="1" value="3"></se-spin-input>
      </div>
      <div class="row2">
        <se-spin-input id="repeat_gap_x" label="Gap X" min="-500" max="1000" step="1" value="20"></se-spin-input>
        <se-spin-input id="repeat_gap_y" label="Gap Y" min="-500" max="1000" step="1" value="20"></se-spin-input>
      </div>
    </div>
    <div class="fields fields-path" style="display:none">
      <div class="row2">
        <se-spin-input id="repeat_path_count" label="Copies" min="1" max="72" step="1" value="8"></se-spin-input>
        <se-spin-input id="repeat_path_offset" label="Start %" min="0" max="100" step="1" value="0"></se-spin-input>
      </div>
      <div class="row2">
        <se-spin-input id="repeat_path_span" label="Span %" min="1" max="100" step="1" value="100"></se-spin-input>
        <div class="mode" style="align-self:end">
          <button class="path-follow" aria-pressed="true">Rotate along</button>
        </div>
      </div>
    </div>
    <div class="actions">
      <button class="apply">Apply</button>
    </div>
  </div>
`

/**
 * @class SeRepeatSettings
 * Toolbar button + popover for the radial / grid repeat (array) tool. Pure
 * UI — reads seed params from `svgCanvas.getRepeatParams()` on open and calls
 * `svgCanvas.repeatSelection(params)` on Apply (both provided by ext-repeat).
 */
class SeRepeatSettings extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)
    this._mode = 'radial'
    this._center = 'canvas'
    this._centerX = null
    this._centerY = null
    this._pendingReopen = null

    this.$radial = this._shadowRoot.querySelector('.mode-radial')
    this.$grid = this._shadowRoot.querySelector('.mode-grid')
    this.$path = this._shadowRoot.querySelector('.mode-path')
    this.$fieldsRadial = this._shadowRoot.querySelector('.fields-radial')
    this.$fieldsGrid = this._shadowRoot.querySelector('.fields-grid')
    this.$fieldsPath = this._shadowRoot.querySelector('.fields-path')
    this.$centerCanvas = this._shadowRoot.querySelector('.center-canvas')
    this.$centerSelection = this._shadowRoot.querySelector('.center-selection')
    this.$centerCustom = this._shadowRoot.querySelector('.center-custom')
    this.$customCenterRow = this._shadowRoot.querySelector('.custom-center-row')
    this.$pickCenter = this._shadowRoot.querySelector('.pick-center')
    this.$centerReadout = this._shadowRoot.querySelector('.center-readout')
    this.$follow = this._shadowRoot.querySelector('.path-follow')
    this.$apply = this._shadowRoot.querySelector('.apply')

    this.$radial.addEventListener('click', () => this._setMode('radial'))
    this.$grid.addEventListener('click', () => this._setMode('grid'))
    this.$path.addEventListener('click', () => this._setMode('path'))
    this.$centerCanvas.addEventListener('click', () => this._setCenter('canvas'))
    this.$centerSelection.addEventListener('click', () => this._setCenter('selection'))
    this.$centerCustom.addEventListener('click', () => this._setCenter('custom'))
    this.$pickCenter.addEventListener('click', () => this._beginPickCenter())
    this.$follow.addEventListener('click', () => {
      this.$follow.setAttribute('aria-pressed',
        String(this.$follow.getAttribute('aria-pressed') !== 'true'))
    })

    this.$apply.addEventListener('click', () => this.apply())
  }

  _setMode (mode) {
    this._mode = mode
    this.$radial.setAttribute('aria-pressed', String(mode === 'radial'))
    this.$grid.setAttribute('aria-pressed', String(mode === 'grid'))
    this.$path.setAttribute('aria-pressed', String(mode === 'path'))
    this.$fieldsRadial.style.display = mode === 'radial' ? 'flex' : 'none'
    this.$fieldsGrid.style.display = mode === 'grid' ? 'flex' : 'none'
    this.$fieldsPath.style.display = mode === 'path' ? 'flex' : 'none'
  }

  _updateCenterReadout () {
    this.$centerReadout.textContent =
      Number.isFinite(this._centerX) && Number.isFinite(this._centerY)
        ? `${Math.round(this._centerX)}, ${Math.round(this._centerY)}`
        : 'not set'
  }

  /**
   * Snapshot the in-progress radial fields, close the popover (so the canvas
   * is clickable), and arm a one-shot canvas click to set the custom center.
   * On pick, reopen seeded from the snapshot rather than from
   * `svgCanvas.getRepeatParams()` so in-progress edits aren't clobbered.
   */
  _beginPickCenter () {
    const pending = {
      mode: this._mode,
      count: this._shadowRoot.querySelector('#repeat_count').value,
      sweep: this._shadowRoot.querySelector('#repeat_sweep').value
    }
    this.close()
    svgEditor.svgCanvas.armRepeatCenterPick?.((x, y) => {
      this._centerX = x
      this._centerY = y
      this._pendingReopen = pending
      this._setCenter('custom')
      // ext-repeat's mouseDown hook already swallows the trailing click that
      // completes this same gesture, so it's safe to reopen synchronously.
      this.open()
    })
  }

  _setCenter (center) {
    this._center = center
    this.$centerCanvas.setAttribute('aria-pressed', String(center === 'canvas'))
    this.$centerSelection.setAttribute('aria-pressed', String(center === 'selection'))
    this.$centerCustom.setAttribute('aria-pressed', String(center === 'custom'))
    this.$customCenterRow.style.display = center === 'custom' ? 'flex' : 'none'
  }

  open () {
    // Reopening right after a center pick: restore only the snapshotted
    // in-progress fields + the new coordinates, skip the normal reseed below
    // (which would clobber whatever the user had already typed in).
    if (this._pendingReopen) {
      const p = this._pendingReopen
      this._pendingReopen = null
      this._setMode(p.mode)
      if (p.mode === 'radial') {
        this._shadowRoot.querySelector('#repeat_count').value = p.count
        this._shadowRoot.querySelector('#repeat_sweep').value = p.sweep
      }
      this._updateCenterReadout()
      this.$apply.textContent = svgEditor.svgCanvas.getRepeatParams?.() ? 'Update' : 'Apply'
      super.open()
      return
    }

    // Seed from an existing repeat on the selection so Apply re-edits it.
    const existing = svgEditor.svgCanvas.getRepeatParams?.()
    if (existing) {
      this._setMode(existing.mode)
      if (existing.mode === 'radial') {
        this._shadowRoot.querySelector('#repeat_count').value = existing.count
        this._shadowRoot.querySelector('#repeat_sweep').value = existing.sweep
        this._setCenter(existing.center)
        if (existing.center === 'custom') {
          this._centerX = existing.centerX
          this._centerY = existing.centerY
        }
      } else if (existing.mode === 'grid') {
        this._shadowRoot.querySelector('#repeat_rows').value = existing.rows
        this._shadowRoot.querySelector('#repeat_cols').value = existing.cols
        this._shadowRoot.querySelector('#repeat_gap_x').value = existing.gapX
        this._shadowRoot.querySelector('#repeat_gap_y').value = existing.gapY
      } else {
        this._shadowRoot.querySelector('#repeat_path_count').value = existing.count
        this._shadowRoot.querySelector('#repeat_path_offset').value = existing.offset
        this._shadowRoot.querySelector('#repeat_path_span').value = existing.span
        this.$follow.setAttribute('aria-pressed', String(!!existing.follow))
      }
    }
    this._updateCenterReadout()
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
        count: Math.max(1, Math.round(num('#repeat_count', 6))),
        sweep: num('#repeat_sweep', 360),
        center: this._center,
        centerX: this._centerX,
        centerY: this._centerY
      }
    } else if (this._mode === 'grid') {
      params = {
        mode: 'grid',
        rows: Math.max(1, Math.round(num('#repeat_rows', 2))),
        cols: Math.max(1, Math.round(num('#repeat_cols', 3))),
        gapX: num('#repeat_gap_x', 20),
        gapY: num('#repeat_gap_y', 20)
      }
    } else {
      params = {
        mode: 'path',
        count: Math.max(1, Math.round(num('#repeat_path_count', 8))),
        offset: num('#repeat_path_offset', 0),
        span: num('#repeat_path_span', 100),
        follow: this.$follow.getAttribute('aria-pressed') === 'true'
      }
    }
    svgEditor.svgCanvas.repeatSelection?.(params)
    this.close()
  }
}

// Register
customElements.define('se-repeat-settings', SeRepeatSettings)
