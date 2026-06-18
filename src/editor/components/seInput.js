import 'elix/define/Input.js'
import { t } from '../locale.js'
import { attachIdleBlur } from './fieldAutoBlur.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
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
  elix-input {
    background: transparent;
    color: var(--fg, #1B1F24);
    border: none;
    border-radius: 0;
    height: 32px;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--ui-font, inherit);
  }
  elix-input::part(inner),
  elix-input::part(input) {
    padding: 0 8px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
  }
  </style>
  <label class="top-label"></label>
  <div class="field">
    <elix-input></elix-input>
  </div>
`

/**
 * @class SEInput
 */
export class SEInput extends HTMLElement {
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
    this.$label = this.shadowRoot.querySelector('.top-label')
    this.$event = new CustomEvent('change')
    this.$input = this._shadowRoot.querySelector('elix-input')
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['value', 'label', 'src', 'size', 'title']
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
        this.$div.setAttribute('title', `${t(newValue)}`)
        break
      case 'src':
        // seInput doesn't typically show an icon; silently ignore
        break
      case 'size':
        this.$input.setAttribute('size', newValue)
        break
      case 'label':
        if (newValue) {
          this.$label.textContent = t(newValue)
          this.$label.style.display = 'block'
        } else {
          this.$label.style.display = 'none'
        }
        break
      case 'value':
        this.$input.value = newValue
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
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
    // Inject color fix directly into elix-input's shadow DOM so the native
    // <input> inherits the correct foreground color even when the system
    // appearance would otherwise force black text.
    if (this.$input.shadowRoot) {
      const s = document.createElement('style')
      s.textContent = '[part~="inner"],input{color:inherit;-webkit-text-fill-color:inherit}'
      this.$input.shadowRoot.appendChild(s)
    }
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = e.target.value
      this.dispatchEvent(this.$event)
    })
    this.$input.addEventListener('keyup', (e) => {
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
customElements.define('se-input', SEInput)
