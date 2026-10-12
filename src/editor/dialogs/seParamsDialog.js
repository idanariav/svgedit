import { dialogSkin } from './dialogSkin.css.js'
import { syncDialogTheme } from '../themeUtil.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
    ${dialogSkin('#pd_card')}
    #pd_card { width: 380px; max-width: 94vw; }
    h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
    #pd_fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-bottom: 4px; }
    .pd_field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted, #6B7280); min-width: 0; }
    .pd_field > span { color: var(--muted, #6B7280); }
    .pd_field input[type=number], .pd_field select { width: 100%; }
    .pd_field.pd_check { flex-direction: row; align-items: center; gap: 6px; grid-column: 1 / -1; }
    .pd_field.pd_check > span { color: var(--fg, #1B1F24); }
    .pd_field.pd_origin { grid-column: 1 / -1; }
    .pd_grid { display: grid; grid-template-columns: repeat(3, 22px); gap: 4px; }
    .pd_grid input { margin: 0; width: 22px; height: 22px; }
    #pd_buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  </style>
  <dialog>
    <div id="pd_card">
      <h2 id="pd_title"></h2>
      <div id="pd_fields"></div>
      <div id="pd_buttons">
        <button id="pd_cancel" type="button"></button>
        <button id="pd_ok" type="button" class="dlg-primary"></button>
      </div>
    </div>
  </dialog>
`

/** Reference points of the `origin` field, row by row. */
const ORIGINS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']

/**
 * @typedef {object} ParamField
 * @property {string} id key in the values object
 * @property {string} label
 * @property {'number'|'checkbox'|'select'|'origin'} type `origin` is a 3 × 3 locator whose value is `tl` … `br`
 * @property {number|boolean|string} value
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {{value: string, label: string}[]} [options] for `select`
 */

/**
 * @typedef {object} ParamsOptions
 * @property {string} title
 * @property {ParamField[]} fields
 * @property {string} okLabel
 * @property {string} cancelLabel
 * @property {(values: Record<string, number|boolean|string>) => void} [onChange] on open and after every edit (a preview)
 * @property {(values: Record<string, number|boolean|string>) => void} onOk
 * @property {() => void} [onCancel] Cancel or Escape
 */

/**
 * @class SeParamsDialog
 * A small modal form built from field descriptors: numbers, checkboxes, selects and a 9-point locator. It knows
 * nothing about the drawing; the opener previews each `onChange` and commits or rolls back on OK / Cancel.
 */
export class SeParamsDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('dialog')
    this.$title = this._shadowRoot.querySelector('#pd_title')
    this.$fields = this._shadowRoot.querySelector('#pd_fields')
    this.$cancel = this._shadowRoot.querySelector('#pd_cancel')
    this.$ok = this._shadowRoot.querySelector('#pd_ok')
    /** @type {ParamsOptions|null} */
    this._opts = null
    /** @type {ParamField[]} */
    this._fields = []
    this._finished = false
  }

  connectedCallback () {
    this.$cancel.addEventListener('click', () => this.dismiss())
    this.$ok.addEventListener('click', () => {
      this._finished = true
      this._opts?.onOk(this.values())
      this.close()
    })
    this.$dialog.addEventListener('close', () => this.dismiss())
    // Enter in a field confirms
    this.$fields.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') { evt.preventDefault(); this.$ok.click() }
    })
  }

  get opened () {
    return this.$dialog.open
  }

  /**
   * @param {ParamsOptions} opts
   * @returns {void}
   */
  open (opts) {
    this._opts = opts
    this._fields = opts.fields
    this._finished = false
    this.$title.textContent = opts.title
    this.$cancel.textContent = opts.cancelLabel
    this.$ok.textContent = opts.okLabel
    this.$fields.replaceChildren(...opts.fields.map((f) => this._build(f)))
    syncDialogTheme(this)
    this.$dialog.showModal()
    this._opts.onChange?.(this.values())
  }

  /** @returns {Record<string, number|boolean|string>} the current value of every field */
  values () {
    /** @type {Record<string, number|boolean|string>} */
    const out = {}
    for (const f of this._fields) {
      if (f.type === 'origin') {
        out[f.id] = this.$fields.querySelector(`input[name="${f.id}"]:checked`)?.getAttribute('value') ?? String(f.value)
        continue
      }
      const input = /** @type {HTMLInputElement|HTMLSelectElement} */ (this.$fields.querySelector(`#pd_${f.id}`))
      if (f.type === 'checkbox') out[f.id] = /** @type {HTMLInputElement} */ (input).checked
      else if (f.type === 'number') out[f.id] = Number(input.value) || 0
      else out[f.id] = input.value
    }
    return out
  }

  /** Cancel: tell the opener once. @returns {void} */
  dismiss () {
    if (!this._finished) {
      this._finished = true
      this._opts?.onCancel?.()
    }
    this.close()
  }

  /** @returns {void} */
  close () {
    if (this.$dialog.open) this.$dialog.close()
  }

  /**
   * @param {ParamField} f
   * @returns {HTMLElement}
   */
  _build (f) {
    const wrap = document.createElement('label')
    wrap.className = 'pd_field'
    const text = document.createElement('span')
    text.textContent = f.label
    let control
    if (f.type === 'checkbox') {
      wrap.classList.add('pd_check')
      control = document.createElement('input')
      control.type = 'checkbox'
      control.checked = !!f.value
      wrap.append(control, text)
    } else if (f.type === 'select') {
      control = document.createElement('select')
      control.replaceChildren(...(f.options ?? []).map((o) => new Option(o.label, o.value)))
      control.value = String(f.value)
      wrap.append(text, control)
    } else if (f.type === 'origin') {
      wrap.classList.add('pd_origin')
      const grid = document.createElement('span')
      grid.className = 'pd_grid'
      for (const o of ORIGINS) {
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = f.id
        radio.value = o
        radio.checked = o === f.value
        radio.title = o
        grid.append(radio)
      }
      wrap.append(text, grid)
      wrap.addEventListener('change', () => this._opts?.onChange?.(this.values()))
      return wrap
    } else {
      control = document.createElement('input')
      control.type = 'number'
      if (f.min !== undefined) control.min = String(f.min)
      if (f.max !== undefined) control.max = String(f.max)
      control.step = String(f.step ?? 1)
      control.value = String(f.value)
      wrap.append(text, control)
    }
    control.id = `pd_${f.id}`
    control.addEventListener('input', () => this._opts?.onChange?.(this.values()))
    control.addEventListener('change', () => this._opts?.onChange?.(this.values()))
    return wrap
  }
}

if (!customElements.get('se-params-dialog')) customElements.define('se-params-dialog', SeParamsDialog)
export default SeParamsDialog
