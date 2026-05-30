/* globals svgEditor */
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
label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted, #6B7280);
  white-space: nowrap;
  display: none; /* hidden by default; shown when label attr is set */
}
select {
  background-color: var(--field-bg, #FFFFFF);
  color: var(--fg, #1B1F24);
  border: 1px solid var(--field-border, #DDE1E7);
  border-radius: 7px;
  height: 26px;
  padding: 0 4px 0 8px;
  font-size: 12.5px;
  font-weight: 500;
  font-family: var(--ui-font, inherit);
  appearance: none;
  outline: none;
  cursor: pointer;
}
::slotted(*) {
  padding: 0;
  width: 100%;
}
</style>
  <div class="wrap">
    <span class="icon-wrap" aria-hidden="true"></span>
    <label></label>
    <select></select>
  </div>
`
/**
 * @class SeList
 */
export class SeSelect extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$select = this._shadowRoot.querySelector('select')
    this.$label = this._shadowRoot.querySelector('label')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$wrap = this._shadowRoot.querySelector('.wrap')
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'src', 'width', 'height', 'options', 'values', 'title', 'disabled']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    let options
    if (oldValue === newValue) return
    switch (name) {
      case 'label':
        this.$label.textContent = t(newValue)
        this.$label.style.display = newValue ? 'inline' : 'none'
        break
      case 'src':
        this._loadIcon(newValue)
        break
      case 'title':
        this.$select.setAttribute('title', t(newValue))
        break
      case 'disabled':
        if (newValue === null) {
          this.$select.removeAttribute('disabled')
        } else {
          this.$select.setAttribute('disabled', newValue)
        }
        break
      case 'height':
        this.$select.style.height = newValue
        break
      case 'width':
        this.$select.style.width = newValue
        break
      case 'options':
        if (newValue === '') {
          while (this.$select.firstChild) { this.$select.removeChild(this.$select.firstChild) }
        } else {
          options = newValue.split(',')
          options.forEach((option) => {
            const optionNode = document.createElement('OPTION')
            const text = document.createTextNode(t(option))
            optionNode.appendChild(text)
            this.$select.appendChild(optionNode)
          })
        }
        break
      case 'values':
        if (newValue === '') {
          while (this.$select.firstChild) { this.$select.removeChild(this.$select.firstChild) }
        } else {
          options = newValue.split('::')
          options.forEach((option, index) => {
            this.$select.children[index].setAttribute('value', option)
          })
        }
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
  get width () {
    return this.getAttribute('width')
  }

  /**
   * @function set
   * @returns {void}
   */
  set width (value) {
    this.setAttribute('width', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get height () {
    return this.getAttribute('height')
  }

  /**
   * @function set
   * @returns {void}
   */
  set height (value) {
    this.setAttribute('height', value)
  }

  /**
   * Append an <option> to the select if it is not already present.
   * Used to inject custom (downloaded) fonts into the font-family dropdown.
   * @param {string} value
   * @param {string} [text]
   * @returns {void}
   */
  addOption (value, text = value) {
    const exists = Array.from(this.$select.options).some(o => o.value === value)
    if (exists) return
    const optionNode = document.createElement('OPTION')
    optionNode.value = value
    optionNode.appendChild(document.createTextNode(text))
    this.$select.appendChild(optionNode)
  }

  /**
   * @function get
   * @returns {any}
   */
  get value () {
    return this.$select.value
  }

  /**
   * @function set
   * @returns {void}
   */
  set value (value) {
    this.$select.value = value
  }

  /**
   * @function get
   * @returns {any}
   */
  get disabled () {
    return this.$select.getAttribute('disabled')
  }

  /**
   * @function set
   * @returns {void}
   */
  set disabled (value) {
    this.$select.setAttribute('disabled', value)
  }

  async _loadIcon (src) {
    if (!src) return
    this.imgPath = this.imgPath || svgEditor?.configObj?.curConfig?.imgPath
    if (!this.imgPath) return
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
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    // Reload icon now that imgPath is available (attributeChangedCallback fires before connectedCallback)
    if (this.getAttribute('src') && !this.$iconWrap.firstChild) {
      this._loadIcon(this.getAttribute('src'))
    }
    const currentObj = this
    this.$select.addEventListener('change', () => {
      const value = this.$select.value
      const closeEvent = new CustomEvent('change', { detail: { value } })
      currentObj.dispatchEvent(closeEvent)
      currentObj.value = value
    })
  }
}

// Register
customElements.define('se-select', SeSelect)
