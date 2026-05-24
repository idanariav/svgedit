/* globals svgEditor */
import '../dialogs/se-elix/define/NumberSpinBox.js'
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

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
  .icon-wrap {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--icon, #4B5563);
    flex-shrink: 0;
  }
  .icon-wrap svg,
  .icon-wrap img {
    width: 18px;
    height: 18px;
    display: block;
  }
  span#label {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted, #6B7280);
    white-space: nowrap;
  }
  elix-number-spin-box {
    background-color: var(--field-bg, #FFFFFF);
    border: 1px solid var(--field-border, #DDE1E7);
    border-radius: 7px;
    height: 26px;
  }
  elix-number-spin-box::part(spin-button) {
    padding: 0;
    color: var(--muted, #6B7280);
  }
  elix-number-spin-box::part(spin-button):hover {
    color: var(--accent, #2962FF);
  }
  elix-number-spin-box::part(input) {
    width: 3em;
    color: var(--fg, #1B1F24);
    font-size: 12.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    font-family: var(--ui-font, inherit);
    background: transparent;
    border: none;
    padding: 0 4px 0 8px;
  }
  elix-number-spin-box {
    width: 54px;
    height: 26px;
  }
  </style>
  <div class="wrap">
    <span class="icon-wrap" aria-hidden="true"></span>
    <span id="label" style="display:none"></span>
    <elix-number-spin-box min="1" step="1"></elix-number-spin-box>
  </div>
`

/**
 * @class SESpinInput
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
    this.$div = this._shadowRoot.querySelector('.wrap')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$label = this._shadowRoot.getElementById('label')
    this.$event = new CustomEvent('change')
    this.$input = this._shadowRoot.querySelector('elix-number-spin-box')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
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
        this.$label.style.display = 'none'
        break
      case 'size':
      // access to the underlying input box
        this.$input.shadowRoot.getElementById('input').size = newValue
        // below seems mandatory to override the default width style that takes precedence on size
        this.$input.shadowRoot.getElementById('input').style.width = 'unset'
        break
      case 'step':
        this.$input.setAttribute('step', newValue)
        break
      case 'min':
        this.$input.setAttribute('min', newValue)
        break
      case 'max':
        this.$input.setAttribute('max', newValue)
        break
      case 'label':
        if (newValue) {
          this.$label.textContent = t(newValue)
          this.$label.style.display = ''
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
    const shadow = this.$input.shadowRoot
    const childNodes = Array.from(shadow.childNodes)
    childNodes.forEach((childNode) => {
      if (childNode?.id === 'input') {
        childNode.addEventListener('keyup', (e) => {
          e.preventDefault()
          if (!isNaN(e.target.value)) {
            this.value = e.target.value
            this.dispatchEvent(this.$event)
          }
        })
      }
    })
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = e.target.value
      this.dispatchEvent(this.$event)
    })
    svgEditor.$click(this.$input, (e) => {
      e.preventDefault()
      this.value = e.target.value
      this.dispatchEvent(this.$event)
    })
  }
}

// Register
customElements.define('se-spin-input', SESpinInput)
