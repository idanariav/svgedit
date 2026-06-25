/* globals svgEditor */
import { fetchSvgEl } from './svgIconLoader.js'
import { getUserDataAdapter } from '../userDataAdapter.js'
import { loadLayouts, saveLayouts, captureCurrentLayout, applyLayout } from '../canvasLayouts.js'
import './seSpinInput.js'

// Built-in canvas size presets, used when the user has not curated their own
// list. Aspect-ratio presets keep the longest side at 1000px; the lower block
// holds the predefined sizes moved out of Document Properties (all 4:3). Each
// button shows ratio + size, e.g. "4:5 (800:1000)".
const DEFAULT_PRESETS = [
  { ratio: '4:5', w: 800, h: 1000 },
  { ratio: '5:4', w: 1000, h: 800 },
  { ratio: '16:9', w: 1000, h: 563 },
  { ratio: '1:1', w: 1000, h: 1000 },
  { ratio: '4:3', w: 640, h: 480 },
  { ratio: '4:3', w: 800, h: 600 },
  { ratio: '4:3', w: 1024, h: 768 },
  { ratio: '4:3', w: 1280, h: 960 },
  { ratio: '4:3', w: 1600, h: 1200 }
]

const STORAGE_KEY = 'svg-edit-canvas-presets'

/**
 * Keep only well-formed preset entries (finite positive w/h, string ratio).
 * @param {Array} arr
 * @returns {Array<{ratio:string,w:number,h:number}>}
 */
const sanitizePresets = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter(p =>
      p && typeof p.ratio === 'string' &&
      Number.isFinite(p.w) && p.w > 0 &&
      Number.isFinite(p.h) && p.h > 0)
    .map(({ ratio, w, h }) => ({ ratio, w, h }))

/**
 * Load the user's canvas presets via the host adapter, else localStorage.
 * Falls back to a copy of DEFAULT_PRESETS when nothing valid is stored.
 * @returns {Array<{ratio:string,w:number,h:number}>}
 */
const loadPresets = () => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.getCanvasPresets === 'function') {
      const stored = sanitizePresets(adapter.getCanvasPresets())
      return stored.length ? stored : DEFAULT_PRESETS.map(p => ({ ...p }))
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      const stored = sanitizePresets(raw ? JSON.parse(raw) : null)
      return stored.length ? stored : DEFAULT_PRESETS.map(p => ({ ...p }))
    }
  } catch (err) {
    console.error('Failed to load canvas presets', err)
  }
  return DEFAULT_PRESETS.map(p => ({ ...p }))
}

/**
 * Persist the canvas presets via the host adapter, else localStorage.
 * @param {Array} presets
 * @returns {void}
 */
const savePresets = (presets) => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.setCanvasPresets === 'function') {
      adapter.setCanvasPresets(presets.map(p => ({ ...p })))
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    }
  } catch (err) {
    console.error('Failed to persist canvas presets', err)
  }
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a)

/**
 * Reduce w:h to a ratio label, e.g. 800x1000 → "4:5".
 * @param {number} w
 * @param {number} h
 * @returns {string}
 */
const computeRatio = (w, h) => {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return ''
  const d = gcd(w, h) || 1
  return `${w / d}:${h / d}`
}

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
    min-width: 250px;
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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .preset {
    padding: 6px 4px;
    white-space: nowrap;
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
  .manage-toggle {
    align-self: flex-end;
    padding: 4px 8px;
    border: none;
    background: transparent;
    color: var(--muted, #6B7280);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: background .12s, color .12s;
  }
  .manage-toggle:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .manage {
    display: none;
    flex-direction: column;
    gap: 6px;
  }
  .manage-row {
    display: grid;
    grid-template-columns: 1fr 64px 64px auto;
    gap: 5px;
    align-items: center;
  }
  .manage-row input {
    min-width: 0;
    padding: 5px 6px;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 6px;
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    font: inherit;
    font-size: 12px;
  }
  .manage-row input:focus {
    outline: none;
    border-color: var(--accent-border, #C7D7FF);
  }
  .del {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 6px;
    background: var(--field-bg, #F7F8FA);
    color: var(--muted, #6B7280);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    transition: background .12s, border-color .12s, color .12s;
  }
  .del:hover {
    border-color: var(--danger, #E5484D);
    color: var(--danger, #E5484D);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  .add-preset {
    padding: 6px 0;
    border: 1px dashed var(--field-border, #E2E5EA);
    border-radius: 7px;
    background: transparent;
    color: var(--fg, #1B1F24);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s, border-color .12s;
  }
  .add-preset:hover {
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
  .section-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--muted, #6B7280);
    border-top: 1px solid var(--chrome-border, #E6E8EC);
    padding-top: 10px;
  }
  .layouts-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .layouts-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .layouts-empty {
    font-size: 11.5px;
    color: var(--muted, #6B7280);
    padding: 2px 0;
  }
  .layout-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 5px;
    align-items: center;
  }
  .layout-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg, #1B1F24);
  }
  .layout-apply {
    padding: 4px 10px;
    border-radius: 6px;
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--accent-border, #C7D7FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
    transition: border-color .12s;
  }
  .layout-apply:hover {
    border-color: var(--accent, #2962FF);
  }
  .layout-overwrite {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 6px;
    background: var(--field-bg, #F7F8FA);
    color: var(--muted, #6B7280);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: background .12s, border-color .12s, color .12s;
  }
  .layout-overwrite:hover {
    border-color: var(--accent-border, #C7D7FF);
    color: var(--accent, #2962FF);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  .layout-add {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 5px;
  }
  .layout-name {
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 6px;
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    font: inherit;
    font-size: 12px;
  }
  .layout-name:focus {
    outline: none;
    border-color: var(--accent-border, #C7D7FF);
  }
  .save-layout {
    white-space: nowrap;
    padding: 0 12px;
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
    <button class="manage-toggle" type="button">✎ Manage presets</button>
    <div class="manage">
      <div class="manage-rows"></div>
      <button class="add-preset" type="button">+ Add preset</button>
    </div>
    <div class="layouts-section">
      <div class="section-label">Layouts</div>
      <div class="layouts-list"></div>
      <div class="layout-add">
        <input class="layout-name" type="text" placeholder="New layout name">
        <button class="add-preset save-layout" type="button">+ Save current</button>
      </div>
    </div>
    <div class="actions">
      <button class="reset">Reset</button>
      <button class="apply">Apply</button>
    </div>
    <div class="actions manage-actions" style="display:none">
      <button class="cancel-manage reset">Cancel</button>
      <button class="save-manage apply">Save</button>
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
    this.$manageToggle = this._shadowRoot.querySelector('.manage-toggle')
    this.$manage = this._shadowRoot.querySelector('.manage')
    this.$manageRows = this._shadowRoot.querySelector('.manage-rows')
    this.$addPreset = this._shadowRoot.querySelector('.add-preset')
    this.$applyActions = this._shadowRoot.querySelector('.actions:not(.manage-actions)')
    this.$manageActions = this._shadowRoot.querySelector('.manage-actions')
    this.$layoutsSection = this._shadowRoot.querySelector('.layouts-section')
    this.$layoutsList = this._shadowRoot.querySelector('.layouts-list')
    this.$layoutName = this._shadowRoot.querySelector('.layout-name')
    this.$saveLayout = this._shadowRoot.querySelector('.save-layout')

    // Current preset list; (re)loaded on open so host/plugin edits are picked up.
    this.presets = []
    // Current saved-layout list; (re)loaded on open.
    this.layouts = []

    this.$trigger.addEventListener('click', e => {
      e.stopPropagation()
      this.toggle()
    })
    this.$apply.addEventListener('click', () => this.apply())
    this.$reset.addEventListener('click', () => this.reset())
    this.$manageToggle.addEventListener('click', () => this.enterManageMode())
    this.$addPreset.addEventListener('click', () => this.addManageRow())
    this._shadowRoot.querySelector('.save-manage').addEventListener('click', () => this.saveManage())
    this._shadowRoot.querySelector('.cancel-manage').addEventListener('click', () => this.exitManageMode())
    this.$saveLayout.addEventListener('click', () => this.saveCurrentLayout())
    this.$layoutName.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.saveCurrentLayout() }
    })
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
    // (Re)load presets each open so host/plugin edits are reflected.
    this.presets = loadPresets()
    this.renderPresets()
    // (Re)load saved layouts each open.
    this.layouts = loadLayouts()
    this.renderLayouts()
    this.exitManageMode()
    this.$popup.style.display = 'flex'
    this.$trigger.setAttribute('aria-expanded', 'true')
    this.positionPopup()
  }

  close () {
    this.$popup.style.display = 'none'
    this.$trigger.setAttribute('aria-expanded', 'false')
  }

  /**
   * Rebuild the preset grid from `this.presets`. Each button stages its size
   * into the W/H inputs on click.
   */
  renderPresets () {
    this.$presets.replaceChildren()
    this.presets.forEach(({ ratio, w, h }) => {
      const btn = document.createElement('button')
      btn.className = 'preset'
      btn.textContent = `${ratio} (${w}:${h})`
      btn.addEventListener('click', () => {
        this.$w.value = w
        this.$h.value = h
      })
      this.$presets.append(btn)
    })
  }

  /**
   * Switch the popover into preset-management mode: hide the grid, show one
   * editable row per preset plus the Add/Save/Cancel controls.
   */
  enterManageMode () {
    this.$manageRows.replaceChildren()
    this.presets.forEach(p => this.addManageRow(p))
    this.$presets.style.display = 'none'
    this.$manageToggle.style.display = 'none'
    this.$applyActions.style.display = 'none'
    this.$layoutsSection.style.display = 'none'
    this.$manage.style.display = 'flex'
    this.$manageActions.style.display = 'flex'
    this.positionPopup()
  }

  /** Leave management mode and restore the normal preset view. */
  exitManageMode () {
    this.$presets.style.display = 'grid'
    this.$manageToggle.style.display = 'block'
    this.$applyActions.style.display = 'flex'
    this.$layoutsSection.style.display = 'flex'
    this.$manage.style.display = 'none'
    this.$manageActions.style.display = 'none'
  }

  /**
   * Append one editable preset row. Pre-fills from `preset` when editing an
   * existing entry, else from the current W/H inputs when adding.
   * @param {{ratio:string,w:number,h:number}} [preset]
   */
  addManageRow (preset) {
    const row = document.createElement('div')
    row.className = 'manage-row'

    const w = preset ? preset.w : parseInt(this.$w.value, 10) || ''
    const h = preset ? preset.h : parseInt(this.$h.value, 10) || ''
    const ratio = preset ? preset.ratio : computeRatio(Number(w), Number(h))

    const labelInput = document.createElement('input')
    labelInput.className = 'r-label'
    labelInput.placeholder = 'ratio'
    labelInput.value = ratio
    // Mark the label as auto so W/H edits keep refreshing it until the user
    // types their own label.
    labelInput.dataset.autoLabel = preset ? '' : 'true'

    const wInput = document.createElement('input')
    wInput.className = 'r-w'
    wInput.type = 'number'
    wInput.min = '1'
    wInput.placeholder = 'W'
    wInput.value = w

    const hInput = document.createElement('input')
    hInput.className = 'r-h'
    hInput.type = 'number'
    hInput.min = '1'
    hInput.placeholder = 'H'
    hInput.value = h

    const refreshLabel = () => {
      if (labelInput.dataset.autoLabel !== 'true') return
      const computed = computeRatio(parseInt(wInput.value, 10), parseInt(hInput.value, 10))
      if (computed) labelInput.value = computed
    }
    wInput.addEventListener('input', refreshLabel)
    hInput.addEventListener('input', refreshLabel)
    labelInput.addEventListener('input', () => { labelInput.dataset.autoLabel = '' })

    const del = document.createElement('button')
    del.className = 'del'
    del.type = 'button'
    del.title = 'Remove preset'
    del.textContent = '×'
    del.addEventListener('click', () => row.remove())

    row.append(labelInput, wInput, hInput, del)
    this.$manageRows.append(row)
  }

  /**
   * Collect valid rows into `this.presets`, persist, and leave manage mode.
   */
  saveManage () {
    const next = []
    this.$manageRows.querySelectorAll('.manage-row').forEach(row => {
      const w = parseInt(row.querySelector('.r-w').value, 10)
      const h = parseInt(row.querySelector('.r-h').value, 10)
      let ratio = row.querySelector('.r-label').value.trim()
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
      if (!ratio) ratio = computeRatio(w, h)
      next.push({ ratio, w, h })
    })
    this.presets = next
    savePresets(next)
    this.renderPresets()
    this.exitManageMode()
    this.positionPopup()
  }

  /**
   * Rebuild the saved-layouts list. Each row applies / overwrites / removes one
   * saved layout (canvas template).
   */
  renderLayouts () {
    this.$layoutsList.replaceChildren()
    if (!this.layouts.length) {
      const empty = document.createElement('div')
      empty.className = 'layouts-empty'
      empty.textContent = 'No saved layouts yet.'
      this.$layoutsList.append(empty)
      return
    }
    this.layouts.forEach((layout, i) => {
      const row = document.createElement('div')
      row.className = 'layout-row'

      const name = document.createElement('span')
      name.className = 'layout-name-text'
      name.textContent = layout.name
      name.title = `${layout.name} (${layout.w}×${layout.h})`

      const applyBtn = document.createElement('button')
      applyBtn.className = 'layout-apply'
      applyBtn.type = 'button'
      applyBtn.textContent = 'Apply'
      applyBtn.title = 'Apply this layout'
      applyBtn.addEventListener('click', () => {
        applyLayout(layout)
        this.close()
      })

      const overwriteBtn = document.createElement('button')
      overwriteBtn.className = 'layout-overwrite'
      overwriteBtn.type = 'button'
      overwriteBtn.textContent = '⤓'
      overwriteBtn.title = 'Overwrite with current canvas'
      overwriteBtn.addEventListener('click', () => this.overwriteLayout(i))

      const del = document.createElement('button')
      del.className = 'del'
      del.type = 'button'
      del.title = 'Remove layout'
      del.textContent = '×'
      del.addEventListener('click', () => this.removeLayout(i))

      row.append(name, applyBtn, overwriteBtn, del)
      this.$layoutsList.append(row)
    })
  }

  /** Save the current canvas as a new layout under the typed name. */
  saveCurrentLayout () {
    const name = this.$layoutName.value.trim()
    if (!name) return
    // Overwrite in place if the name already exists, else append.
    const layout = captureCurrentLayout(name)
    const existing = this.layouts.findIndex(l => l.name === name)
    if (existing >= 0) {
      this.layouts[existing] = layout
    } else {
      this.layouts.push(layout)
    }
    saveLayouts(this.layouts)
    this.$layoutName.value = ''
    this.renderLayouts()
    this.positionPopup()
  }

  /** Re-capture the current canvas into an existing layout, keeping its name. */
  overwriteLayout (index) {
    const existing = this.layouts[index]
    if (!existing) return
    this.layouts[index] = captureCurrentLayout(existing.name)
    saveLayouts(this.layouts)
    this.renderLayouts()
  }

  /** Delete a saved layout. */
  removeLayout (index) {
    this.layouts.splice(index, 1)
    saveLayouts(this.layouts)
    this.renderLayouts()
    this.positionPopup()
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
