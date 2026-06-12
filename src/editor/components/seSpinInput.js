/* globals svgEditor */
import '../dialogs/se-elix/define/NumberSpinBox.js'
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

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
  elix-number-spin-box {
    background: transparent;
    border: none;
    border-radius: 0;
    height: 32px;
    width: auto;
    flex: 1;
    min-width: 0;
    color: var(--fg, #1B1F24);
  }
  elix-number-spin-box::part(spin-button) {
    padding: 0 2px;
    color: var(--muted, #6B7280);
    border-left: 1px solid var(--field-border, #E2E5EA);
  }
  elix-number-spin-box::part(spin-button):hover {
    color: var(--accent, #2962FF);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  elix-number-spin-box::part(input) {
    width: 100%;
    color: inherit;
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    font-family: var(--ui-font, inherit);
    background: transparent;
    border: none;
    padding: 0 8px;
    box-sizing: border-box;
    text-align: left;
  }
  </style>
  <label class="top-label"></label>
  <div class="field">
    <span class="icon-wrap" aria-hidden="true"></span>
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
    this.$div = this._shadowRoot.querySelector('.field')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$label = this._shadowRoot.querySelector('.top-label')
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
          this.$label.style.display = 'block'
          // a text label takes precedence over the fallback icon
          this.$iconWrap.style.display = 'none'
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
    if (!shadow) {
      // Dynamically-created instances (e.g. in the quick-action menu) connect
      // before the inner elix spin box has upgraded; retry next frame once its
      // shadow root exists.
      requestAnimationFrame(() => this.connectedCallback())
      return
    }
    const childNodes = Array.from(shadow.childNodes)
    childNodes.forEach((childNode) => {
      if (childNode?.id === 'input') {
        // Inject color fix directly into the PlainInput shadow DOM so the
        // native <input> inside inherits the correct foreground color even when
        // the system appearance would otherwise force black text.
        if (childNode.shadowRoot) {
          const s = document.createElement('style')
          s.textContent = '[part~="inner"],input{color:inherit;-webkit-text-fill-color:inherit}'
          childNode.shadowRoot.appendChild(s)
        }
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
