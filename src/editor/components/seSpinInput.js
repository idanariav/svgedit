import { tooltipText } from '../Hotkeys.js'
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'
import { attachIdleBlur } from './fieldAutoBlur.js'
import { error as logError } from '@svgedit/svgcanvas/common/logger.js'
import { ownerEditor } from '../domScope.js'

// Press-and-hold auto-repeat: first repeat after HOLD_DELAY_MS, then every
// HOLD_INTERVAL_MS until the mouse is released or the limit is reached.
const HOLD_DELAY_MS = 400
const HOLD_INTERVAL_MS = 60

// Scrubby labels: a press on the label becomes a drag after SCRUB_THRESHOLD px,
// then every SCRUB_PX_PER_STEP px of travel is one step (Shift x10, Ctrl/Cmd x0.1).
const SCRUB_THRESHOLD = 3
const SCRUB_PX_PER_STEP = 2
/** Preference that turns label scrubbing off (default on). */
export const SCRUB_PREF = 'scrub_numeric_fields'

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
    user-select: none;
  }
  .top-label.scrubbable { cursor: ew-resize; }
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
 * one step per click, press-and-hold auto-repeat, ArrowUp/ArrowDown keyboard
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
    this.imgPath = ownerEditor(this).configObj.curConfig.imgPath

    // Matches the previous spin-box template's hardcoded defaults
    // (min="1" step="1") for consumers that don't set their own
    // min/max/step attributes.
    this._min = 1
    this._max = null
    this._stepValue = 1
    this._holdTimer = null
    this._stopHold = this._stopHold.bind(this)
    this._scrub = null
    this._justScrubbed = false
    this._onScrubMove = this._onScrubMove.bind(this)
    this._onScrubUp = this._onScrubUp.bind(this)
    this._onScrubKey = this._onScrubKey.bind(this)
    this._initScrub()
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
          this.$div.setAttribute('title', tooltipText(t(newValue), shortcut))
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
        logError(`unknown attribute: ${name}`, undefined, 'seSpinInput')
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
    const match = /\.(\d+)$/.exec(String(this._stepValue))
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

  /**
   * Step the value by `direction` steps (scaled by `scale`), clamp it and report a change.
   * A scale below 1 (fine stepping) keeps one more decimal than the step has.
   * @param {number} direction
   * @param {number} [scale]
   * @returns {void}
   */
  _step (direction, scale = 1) {
    const precision = this._precision
    const current = this._parseValue(this.$input.value, precision)
    this._setClamped(current + direction * this._stepValue * scale, precision + (scale < 1 ? 1 : 0))
    this.dispatchEvent(this.$event)
  }

  /**
   * @param {number} result
   * @param {number} digits decimals to keep
   * @returns {void}
   */
  _setClamped (result, digits) {
    if (this._max !== null) result = Math.min(result, this._max)
    if (this._min !== null) result = Math.max(result, this._min)
    this.value = Number(result).toFixed(digits)
  }

  // ---- scrubby labels + wheel stepping ---------------------------------------

  /** Whether dragging the label changes the value (preference, default on). */
  _scrubEnabled () {
    try {
      return String(ownerEditor(this)?.configObj?.pref(SCRUB_PREF)) !== 'false'
    } catch {
      return true
    }
  }

  _initScrub () {
    const label = this.$label
    // The cursor follows the preference without needing a re-render.
    label.addEventListener('pointerenter', () => label.classList.toggle('scrubbable', this._scrubEnabled()))
    label.addEventListener('pointerdown', (e) => this._onScrubDown(e))
    // A plain click on the label focuses the field; the click that ends a drag does not.
    label.addEventListener('click', () => {
      if (!this._justScrubbed) this.$input.focus()
    })
    // The wheel steps the field only while it has focus; otherwise the page scrolls as usual.
    this.$input.addEventListener('wheel', (e) => {
      if (this._shadowRoot.activeElement !== this.$input || !e.deltaY) return
      e.preventDefault()
      this._step(e.deltaY < 0 ? 1 : -1, this._modifierScale(e))
    }, { passive: false })
  }

  /** Shift steps by 10, Ctrl/Cmd by a tenth. */
  _modifierScale (e) {
    if (e.shiftKey) return 10
    return e.ctrlKey || e.metaKey ? 0.1 : 1
  }

  _onScrubDown (e) {
    // Touch would fight page scrolling; the text box itself never scrubs.
    if (e.button !== 0 || e.pointerType === 'touch' || this._scrub || !this._scrubEnabled()) return
    const start = parseFloat(this.$input.value)
    this._scrub = {
      id: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      acc: 0,
      start: isNaN(start) ? 0 : start,
      original: this.$input.value,
      tx: null,
      active: false
    }
    e.preventDefault() // no text selection while dragging
    this.$label.setPointerCapture?.(e.pointerId)
    this.$label.addEventListener('pointermove', this._onScrubMove)
    this.$label.addEventListener('pointerup', this._onScrubUp)
    this.$label.addEventListener('pointercancel', this._onScrubUp)
    window.addEventListener('keydown', this._onScrubKey, true)
  }

  _onScrubMove (e) {
    const s = this._scrub
    if (!s || e.pointerId !== s.id) return
    if (!s.active) {
      if (Math.abs(e.clientX - s.startX) < SCRUB_THRESHOLD) return
      s.active = true
      // The whole drag is one undo step: every change event of the drag lands in one transaction.
      s.tx = ownerEditor(this)?.svgCanvas?.beginTransaction?.('Change value') ?? null
    }
    const scale = this._modifierScale(e)
    s.acc += (e.clientX - s.lastX) / SCRUB_PX_PER_STEP * scale
    s.lastX = e.clientX
    const before = this.$input.value
    this._setClamped(s.start + s.acc * this._stepValue, this._precision + (scale < 1 ? 1 : 0))
    if (this.$input.value !== before) this.dispatchEvent(this.$event)
  }

  _onScrubUp () {
    this._endScrub(true)
  }

  // Escape during the drag puts the original value back and rolls the drawing back with it.
  _onScrubKey (e) {
    if (e.key !== 'Escape' || !this._scrub) return
    e.preventDefault()
    e.stopPropagation()
    this._endScrub(false)
  }

  /**
   * @param {boolean} commit keep the dragged value, or restore the original
   * @returns {void}
   */
  _endScrub (commit) {
    const s = this._scrub
    if (!s) return
    this._scrub = null
    this.$label.removeEventListener('pointermove', this._onScrubMove)
    this.$label.removeEventListener('pointerup', this._onScrubUp)
    this.$label.removeEventListener('pointercancel', this._onScrubUp)
    window.removeEventListener('keydown', this._onScrubKey, true)
    try { this.$label.releasePointerCapture?.(s.id) } catch { /* capture already gone */ }
    if (s.active) {
      this._justScrubbed = true
      setTimeout(() => { this._justScrubbed = false }, 0)
    }
    if (commit) {
      s.tx?.commit()
      return
    }
    s.tx?.cancel()
    this.value = s.original
    // The rollback does not run the consumers' change handlers: refresh the other fields from the drawing.
    const editor = ownerEditor(this)
    editor?.topPanel?.updateContextPanel?.()
  }

  // One step now, then keep stepping while the button stays pressed. Stops on
  // mouseup anywhere (the pointer may have left the button) or once the
  // button's limit disables it.
  _startHold (direction, btn) {
    this._stopHold()
    this._step(direction)
    const repeat = () => {
      if (btn.disabled) return this._stopHold()
      this._step(direction)
      this._holdTimer = setTimeout(repeat, HOLD_INTERVAL_MS)
    }
    this._holdTimer = setTimeout(repeat, HOLD_DELAY_MS)
    window.addEventListener('mouseup', this._stopHold)
  }

  _stopHold () {
    clearTimeout(this._holdTimer)
    this._holdTimer = null
    window.removeEventListener('mouseup', this._stopHold)
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
      this._startHold(1, this.$upBtn)
    })
    this.$downBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._startHold(-1, this.$downBtn)
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

  /**
   * @function disconnectedCallback
   * @returns {void}
   */
  disconnectedCallback () {
    this._stopHold()
  }
}

// Register
customElements.define('se-spin-input', SESpinInput)
