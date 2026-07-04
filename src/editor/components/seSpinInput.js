/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'
import { attachIdleBlur } from './fieldAutoBlur.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  /* Direction A field: stacked label above a single bordered field.
     :host stretches to fill its grid cell so every field aligns. */
  :host {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
  }
  .top-label {
    display: none; /* shown only when [label] is set */
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted, #6B7280);
    margin: 0 0 5px 2px;
    white-space: nowrap;
  }
  .field {
    display: flex;
    align-items: center;
    height: 34px;
    background: var(--field-bg, #F7F8FA);
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color .12s, box-shadow .12s, background .12s;
  }
  .field:hover { border-color: var(--field-border-h, #C8CDD6); }
  .field:focus-within {
    border-color: var(--accent, #2962FF);
    background: var(--chrome-bg, #FFFFFF);
    box-shadow: 0 0 0 3px var(--accent-ring, rgba(41,98,255,0.16));
  }
  /* leading icon only used as a fallback when no text label is set */
  .icon-wrap {
    width: 30px;
    height: 100%;
    display: none;
    align-items: center;
    justify-content: center;
    color: var(--muted, #6B7280);
    border-right: 1px solid var(--field-border, #E2E5EA);
    flex-shrink: 0;
  }
  :host([src]:not([label])) .icon-wrap { display: flex; }
  .icon-wrap svg,
  .icon-wrap img {
    width: 16px;
    height: 16px;
    display: block;
  }
  .num-input {
    background: transparent;
    border: none;
    outline: none;
    height: 32px;
    flex: 1;
    min-width: 0;
    width: 100%;
    color: inherit;
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    font-family: var(--ui-font, inherit);
    padding: 0 8px;
    box-sizing: border-box;
    text-align: left;
  }
  .spin-buttons {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    flex-shrink: 0;
    border-left: 1px solid var(--field-border, #E2E5EA);
  }
  .spin-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    padding: 0 2px;
    border: none;
    background: transparent;
    color: var(--muted, #6B7280);
    cursor: pointer;
    user-select: none;
  }
  .spin-btn:not(:first-child) { border-top: 1px solid var(--field-border, #E2E5EA); }
  .spin-btn:hover:not(:disabled) {
    color: var(--accent, #2962FF);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  .spin-btn:disabled { opacity: 0.4; cursor: default; }
  .spin-btn svg { width: 8px; height: 8px; display: block; }
  </style>
  <label class="top-label"></label>
  <div class="field">
    <span class="icon-wrap" aria-hidden="true"></span>
    <input class="num-input" type="text" inputmode="decimal" />
    <div class="spin-buttons">
      <button type="button" class="spin-btn spin-up" tabindex="-1" aria-label="Increase">
        <svg viewBox="0 0 8 8"><polygon points="0,6 8,6 4,1" fill="currentColor"/></svg>
      </button>
      <button type="button" class="spin-btn spin-down" tabindex="-1" aria-label="Decrease">
        <svg viewBox="0 0 8 8"><polygon points="0,2 8,2 4,7" fill="currentColor"/></svg>
      </button>
    </div>
  </div>
`

/**
 * @class SESpinInput
 * Plain numeric spin input: a text field plus up/down step buttons —
 * single-click step (no press-and-hold repeat), ArrowUp/ArrowDown keyboard
 * stepping, min/max clamping, and step-precision value formatting.
 */
export class SESpinInput extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    // locate the component
    this.$div = this._shadowRoot.querySelector('.field')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$label = this._shadowRoot.querySelector('.top-label')
    this.$event = new CustomEvent('change')
    this.$input = this._shadowRoot.querySelector('.num-input')
    this.$upBtn = this._shadowRoot.querySelector('.spin-up')
    this.$downBtn = this._shadowRoot.querySelector('.spin-down')
    this.imgPath = svgEditor.configObj.curConfig.imgPath

    // Matches the previous spin-box template's hardcoded defaults
    // (min="1" step="1") for consumers that don't set their own
    // min/max/step attributes.
    this._min = 1
    this._max = null
    this._stepValue = 1
    this._updateButtonState()
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['value', 'label', 'src', 'size', 'min', 'max', 'step', 'title']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        {
          const shortcut = this.getAttribute('shortcut')
          this.$div.setAttribute('title', `${t(newValue)} ${shortcut ? `[${t(shortcut)}]` : ''}`)
        }
        break
      case 'src':
        this._loadIcon(newValue)
        break
      case 'size':
        this.$input.size = newValue
        this.$input.style.width = 'unset'
        break
      case 'step':
        this._stepValue = parseFloat(newValue)
        this._updateButtonState()
        break
      case 'min':
        this._min = newValue === null || newValue === '' ? null : parseFloat(newValue)
        this._updateButtonState()
        break
      case 'max':
        this._max = newValue === null || newValue === '' ? null : parseFloat(newValue)
        this._updateButtonState()
        break
      case 'label':
        if (newValue) {
          this.$label.textContent = t(newValue)
          this.$label.style.display = 'block'
          // a text label takes precedence over the fallback icon
          this.$iconWrap.style.display = 'none'
        } else {
          this.$label.style.display = 'none'
        }
        break
      case 'value':
        this.$input.value = newValue
        this._updateButtonState()
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
  }

  async _loadIcon (src) {
    if (!src) return
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      this.$iconWrap.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      this.$iconWrap.replaceChildren(img)
    }
  }

  // Number of digits after the decimal point in the step value, used to
  // format stepped values at matching precision.
  get _precision () {
    const match = /\.(\d)+$/.exec(String(this._stepValue))
    return match && match[1] ? match[1].length : 0
  }

  // Mirrors NumberSpinBox.parseValue: whole steps parse as integers, else float.
  _parseValue (value, precision) {
    const parsed = precision === 0 ? parseInt(value) : parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }

  _updateButtonState () {
    const parsed = parseFloat(this.$input.value)
    const canGoUp = isNaN(parsed) || this._max === null || parsed < this._max
    const canGoDown = isNaN(parsed) || this._min === null || parsed > this._min
    this.$upBtn.disabled = !canGoUp
    this.$downBtn.disabled = !canGoDown
  }

  _step (direction) {
    const precision = this._precision
    const current = this._parseValue(this.$input.value, precision)
    let result = current + direction * this._stepValue
    if (this._max !== null) result = Math.min(result, this._max)
    if (this._min !== null) result = Math.max(result, this._min)
    this.value = Number(result).toFixed(precision)
    this.dispatchEvent(this.$event)
  }

  /**
   * @function get
   * @returns {any}
   */
  get title () {
    return this.getAttribute('title')
  }

  /**
   * @function set
   * @returns {void}
   */
  set title (value) {
    this.setAttribute('title', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get label () {
    return this.getAttribute('label')
  }

  /**
   * @function set
   * @returns {void}
   */
  set label (value) {
    this.setAttribute('label', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get value () {
    return this.$input.value
  }

  /**
   * @function set
   * @returns {void}
   */
  set value (value) {
    this.$input.value = value
    this._updateButtonState()
  }

  /**
   * @function get
   * @returns {any}
   */
  get src () {
    return this.getAttribute('src')
  }

  /**
   * @function set
   * @returns {void}
   */
  set src (value) {
    this.setAttribute('src', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get size () {
    return this.getAttribute('size')
  }

  /**
   * @function set
   * @returns {void}
   */
  set size (value) {
    this.setAttribute('size', value)
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    this.$upBtn.addEventListener('mousedown', (e) => {
      e.preventDefault() // keep focus on the input, not the button
      this._step(1)
    })
    this.$downBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._step(-1)
    })
    this.$input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        this._step(1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this._step(-1)
      }
    })
    this.$input.addEventListener('keyup', (e) => {
      e.preventDefault()
      if (!isNaN(e.target.value)) {
        this.value = e.target.value
        this.dispatchEvent(this.$event)
      }
    })
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = e.target.value
      this.dispatchEvent(this.$event)
    })
    // Release focus after a short idle period so tool shortcuts / Delete reach
    // the canvas instead of being swallowed by this field.
    attachIdleBlur(this)
  }
}

// Register
customElements.define('se-spin-input', SESpinInput)
