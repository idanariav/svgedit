/* globals svgEditor */
import 'elix/define/MenuItem.js'
import './sePlainMenuButton.js'
import { fetchSvgEl } from './svgIconLoader.js'
import { getRawIcon } from '../images/iconRegistry.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    padding: 0;
    display: inline-flex;
    align-items: center;
  }
  elix-menu-button::part(menu) {
    background-color: var(--chrome-bg, #fff) !important;
    border: 1px solid var(--chrome-border, #E6E8EC) !important;
    border-radius: 10px !important;
    padding: 6px !important;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12) !important;
    color: var(--fg, #1B1F24) !important;
  }
  elix-menu-button::part(popup-toggle) {
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
  }
  :host ::slotted([current]) {
    background: var(--icon-hover-bg, #EEF1F5) !important;
    border-radius: 7px !important;
  }
  :host ::slotted(*) {
    padding: 7px 10px !important;
    margin: 0 !important;
    border-radius: 7px !important;
    color: var(--fg, #1B1F24) !important;
    font-family: var(--ui-font, inherit) !important;
    font-size: 13px !important;
  }
  </style>

  <elix-menu-button id="MenuButton" aria-label="Main Menu">
    <slot></slot>
  </elix-menu-button>
`
/**
 * @class SeMenu
 */
export class SeMenu extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$menu = this._shadowRoot.querySelector('elix-menu-button')
    this.$label = this.$menu.shadowRoot.querySelector('#popupToggle').shadowRoot
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'src']
  }

  /**
   * @function attributeChangedCallback
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        this._loadIcon(newValue)
        break
      case 'label':
        this.$label.prepend(newValue)
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
  }

  async _loadIcon (src) {
    if (!src) return
    const url = `${this.imgPath}/${src}`
    // The brand logo is a full-color mark — inline it raw so it keeps its own
    // colors, rather than running it through the monochrome currentColor
    // normaliser used for toolbar icons.
    const raw = getRawIcon(url)
    if (raw) {
      const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
      const svgEl = doc.querySelector('svg')
      if (svgEl) {
        svgEl.style.cssText = 'width:22px;height:22px;display:block;'
        this.$label.prepend(svgEl)
        return
      }
    }
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      svgEl.style.cssText = 'width:22px;height:22px;display:block;'
      this.$label.prepend(svgEl)
    } else {
      const img = new Image()
      img.src = url
      img.width = 22
      img.height = 22
      img.alt = 'logo'
      this.$label.prepend(img)
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
}

// Register
customElements.define('se-menu', SeMenu)
