// seBrushSettings.js — `<se-brush-settings>` — Brush-tool settings popover (its trigger is a gear with the text "Brush settings", not a lone icon; thickness/angle/roundness/taper start-end/opacity/smoothness fields + 5…
/* globals sePrompt */
import { SeSettingsPopover } from './seSettingsPopover.js'
import './seSpinInput.js'
import { BRUSH_SLOT_COUNT, getBrushSlot, saveBrushSlot, deleteBrushSlot, renameBrushSlot } from '../customBrushes.js'
import { requireOwnerEditor } from '../domScope.js'

const TEMPLATE_HTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
  }
  .trigger {
    min-width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px 0 6px;
    font: inherit;
    font-size: 12px;
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
    min-width: 240px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .row2 {
    display: flex;
    gap: 8px;
  }
  .row2 > * {
    flex: 1;
  }
  .hint {
    font-size: 11px;
    color: var(--muted, #6B7280);
    line-height: 1.4;
  }
  .slots {
    display: flex;
    gap: 6px;
  }
  .slot {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .slot-btn {
    width: 100%;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--field-border, #E2E5EA);
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 3px;
  }
  .slot-btn.filled {
    border-color: var(--accent-border, #C7D7FF);
  }
  /* the brush in use: solid, unmistakable */
  .slot-btn.active {
    border-color: var(--accent, #2962FF);
    background: var(--accent, #2962FF);
    color: var(--chrome-bg, #fff);
  }
  /* the slot last loaded or saved, whose values were edited since: dashed outline */
  .slot-btn.modified {
    border: 1px dashed var(--accent, #2962FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
  }
  .slot-actions {
    display: flex;
    gap: 3px;
  }
  .slot-actions button {
    flex: 1;
    padding: 2px 0;
    font-size: 10px;
    line-height: 1;
    border-radius: 4px;
    border: 1px solid var(--field-border, #E2E5EA);
    background: var(--field-bg, #F7F8FA);
    color: var(--muted, #6B7280);
    cursor: pointer;
  }
  .slot-actions button:hover {
    border-color: var(--accent, #2962FF);
    color: var(--accent, #2962FF);
  }
  </style>
  <button class="trigger" title="Brush settings" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
    <span class="trigger-label">Brush settings</span>
  </button>
  <div id="options-container" role="dialog" aria-label="Brush settings" style="display:none">
    <div class="row2">
      <se-spin-input id="brush_thickness" label="Thickness" min="1" max="200" step="1" value="6"></se-spin-input>
      <se-spin-input id="brush_angle" label="Angle" min="0" max="180" step="5" value="45"></se-spin-input>
    </div>
    <div class="row2">
      <se-spin-input id="brush_roundness" label="Roundness %" min="0" max="100" step="5" value="100"></se-spin-input>
      <se-spin-input id="brush_smoothness" label="Smoothness %" min="0" max="100" step="5" value="30"></se-spin-input>
    </div>
    <div class="row2">
      <se-spin-input id="brush_taper_start" label="Taper Start %" min="0" max="100" step="5" value="100"></se-spin-input>
      <se-spin-input id="brush_taper_end" label="Taper End %" min="0" max="100" step="5" value="100"></se-spin-input>
    </div>
    <div class="row2">
      <se-spin-input id="brush_opacity" label="Opacity %" min="0" max="100" step="5" value="100"></se-spin-input>
    </div>
    <div class="hint">Roundness 0 is a flat/chiseled nib (Angle matters); 100 is a round tip (Angle has no effect).</div>
    <div class="slots"></div>
  </div>
`

/** @type {[string, string, number][]} each brush field: its brush param, the input id and the display scale */
const FIELDS = [
  ['thickness', 'brush_thickness', 1],
  ['angle', 'brush_angle', 1],
  ['roundness', 'brush_roundness', 1],
  ['taperStart', 'brush_taper_start', 1],
  ['taperEnd', 'brush_taper_end', 1],
  ['opacity', 'brush_opacity', 100],
  ['smoothness', 'brush_smoothness', 100]
]

/**
 * @class SeBrushSettings
 * Button + popover for the freehand brush tool's live settings (thickness,
 * angle, roundness, taper start/end, opacity, smoothness) plus up to 5 saved
 * presets. Unlike se-taper-settings (a one-shot action on a selected
 * element), field changes here write straight into `svgCanvas`'s active
 * brush state (`getBrushParams`/`setBrushParams`, provided by svgcanvas.js)
 * so they take effect on the next stroke — there is no separate Apply step.
 */
class SeBrushSettings extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)

    this.$slots = /** @type {HTMLDivElement} */ (this._shadowRoot.querySelector('.slots'))
    /** @type {number|null} the slot last loaded or saved, to mark it `modified` once the fields drift from it */
    this._lastSlot = null
    this._buildSlots()

    for (const [key, id, scale] of FIELDS) {
      this._input(id).addEventListener('change', () => {
        requireOwnerEditor(this).svgCanvas.setBrushParams?.({ [key]: this._readField(id, scale) })
        this._refreshSlots()
      })
    }
  }

  /** @param {string} id */
  _input (id) {
    return /** @type {HTMLInputElement} */ (this._shadowRoot.querySelector(`#${id}`))
  }

  /**
* @param {string} id
* @param {number} scale
*/
  _readField (id, scale) {
    const raw = parseFloat(this._input(id).value)
    const val = Number.isFinite(raw) ? raw : 0
    return scale === 1 ? val : val / scale
  }

  /**
* @param {Record<string, number>} params
*/
  _writeFields (params) {
    for (const [key, id, scale] of FIELDS) {
      const val = params[key]
      if (val === undefined) continue
      this._input(id).value = String(scale === 1 ? val : val * scale)
    }
  }

  _buildSlots () {
    this.$slots.replaceChildren()
    for (let i = 0; i < BRUSH_SLOT_COUNT; i++) {
      const slot = document.createElement('div')
      slot.className = 'slot'
      slot.innerHTML = `
        <button class="slot-btn" title="Load brush ${i + 1}">${i + 1}</button>
        <div class="slot-actions">
          <button class="slot-save" title="Save current brush to slot ${i + 1}">Save</button>
          <button class="slot-del" title="Delete slot ${i + 1}">Del</button>
        </div>
      `
      const on = (/** @type {string} */ sel, /** @type {string} */ type, /** @type {(e: Event) => void} */ fn) =>
        /** @type {Element} */ (slot.querySelector(sel)).addEventListener(type, fn)
      on('.slot-btn', 'click', () => this._loadSlot(i))
      on('.slot-btn', 'dblclick', (e) => {
        e.stopPropagation()
        this._renameSlot(i)
      })
      on('.slot-save', 'click', () => this._saveSlot(i))
      on('.slot-del', 'click', () => this._deleteSlot(i))
      this.$slots.append(slot)
    }
    this._refreshSlots()
  }

  // Two saved slots can hold the same values, so "active" is whichever slot
  // exactly matches the live brush right now — not "the last one clicked" —
  // recomputed on every refresh rather than tracked as separate state that
  // could drift out of sync with edits/loads/saves/deletes.
  /**
* @param {Record<string, *> | null} a
* @param {unknown} b
*/
  _paramsEqual (a, b) {
    return Boolean(a) && Boolean(b) && FIELDS.every(([key]) => Number(/** @type {Record<string, *>} */ (a)[key]) === Number(/** @type {Record<string, *>} */ (b)[key]))
  }

  _refreshSlots () {
    const active = requireOwnerEditor(this).svgCanvas.getBrushParams?.()
    const saved = Array.from({ length: BRUSH_SLOT_COUNT }, (_, i) => getBrushSlot(i))
    const anyActive = saved.some((slot) => this._paramsEqual(slot, active))
    this.$slots.querySelectorAll('.slot').forEach((slot, i) => {
      const btn = /** @type {HTMLButtonElement} */ (slot.querySelector('.slot-btn'))
      const isActive = this._paramsEqual(saved[i], active)
      btn.classList.toggle('filled', Boolean(saved[i]))
      btn.classList.toggle('active', isActive)
      btn.classList.toggle('modified', !anyActive && this._lastSlot === i && Boolean(saved[i]))
      btn.setAttribute('aria-pressed', String(isActive))
      btn.textContent = saved[i]?.name || String(i + 1)
      btn.title = saved[i]
        ? `${saved[i]?.name || `Brush ${i + 1}`}${isActive ? ' (in use)' : btn.classList.contains('modified') ? ' (edited)' : ''} — double-click to rename`
        : `Load brush ${i + 1}`
    })
  }

  /**
* @param {number} i
*/
  _loadSlot (i) {
    const saved = getBrushSlot(i)
    if (!saved) return
    // Strip `name` — it's slot metadata, not a live brush param.
    /** @type {Record<string, *>} */
    const params = {}
    for (const [key] of FIELDS) if (saved[key] !== undefined) params[key] = saved[key]
    requireOwnerEditor(this).svgCanvas.setBrushParams?.(params)
    this._writeFields(params)
    this._lastSlot = i
    this._refreshSlots()
  }

  /**
* @param {number} i
*/
  _saveSlot (i) {
    /** @type {Record<string, *>} */
    const params = {}
    for (const [key, id, scale] of FIELDS) params[key] = this._readField(id, scale)
    const existingName = getBrushSlot(i)?.name
    if (existingName) params.name = existingName
    saveBrushSlot(i, params)
    this._lastSlot = i
    this._refreshSlots()
  }

  /**
* @param {number} i
*/
  _deleteSlot (i) {
    deleteBrushSlot(i)
    if (this._lastSlot === i) this._lastSlot = null
    this._refreshSlots()
  }

  /**
* @param {number} i
*/
  async _renameSlot (i) {
    const existing = getBrushSlot(i)
    if (!existing) return
    const newName = await sePrompt(`Name for brush ${i + 1}`, existing.name ?? '', {}, this)
    if (newName === null) return
    renameBrushSlot(i, newName.trim())
    this._refreshSlots()
  }

  open () {
    this._writeFields(/** @type {Record<string, number>} */ (/** @type {unknown} */ (requireOwnerEditor(this).svgCanvas.getBrushParams?.() ?? {})))
    this._refreshSlots()
    super.open()
  }
}

// Register
customElements.define('se-brush-settings', SeBrushSettings)

export default SeBrushSettings
