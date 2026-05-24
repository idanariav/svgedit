import 'elix/define/Input.js'
import { t } from '../locale.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
  }
  .wrap {
    display: inline-flex;
    align-items: center;
    height: 36px;
    gap: 5px;
    padding: 0 8px;
    background: var(--group-bg, #F6F7F9);
    border: 1px solid var(--group-border, #E6E8EC);
    border-radius: 10px;
  }
  span#label {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted, #6B7280);
    white-space: nowrap;
  }
  elix-input {
    background-color: var(--field-bg, #FFFFFF);
    color: var(--fg, #1B1F24);
    border: 1px solid var(--field-border, #DDE1E7);
    border-radius: 7px;
    height: 26px;
    font-size: 12.5px;
    font-weight: 500;
  }
  </style>
  <div class="wrap">
    <span id="label"></span>
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
    this.$div = this._shadowRoot.querySelector('.wrap')
    this.$label = this.shadowRoot.getElementById('label')
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
        this.$label.textContent = t(newValue)
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
  }
}
// Register
customElements.define('se-input', SEInput)
