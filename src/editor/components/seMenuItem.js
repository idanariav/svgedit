/* globals svgEditor */
import 'elix/define/Menu.js'
import 'elix/define/MenuItem.js'
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'
const template = document.createElement('template')
template.innerHTML = `
  <style>
  elix-menu-item {
    display: block;
    padding: 7px 10px;
    border-radius: 7px;
    color: var(--fg, #1B1F24);
    font-family: var(--ui-font, inherit);
    font-size: 13px;
    cursor: pointer;
  }
  elix-menu-item:hover {
    background: var(--icon-hover-bg, #EEF1F5);
  }
  .item-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .icon-wrap {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--icon, #4B5563);
  }
  .icon-wrap svg,
  .icon-wrap img {
    width: 18px;
    height: 18px;
    display: block;
  }
  .item-label {
    flex: 1;
  }
  </style>
  <elix-menu-item>
    <div class="item-row">
      <span class="icon-wrap"></span>
      <span class="item-label"></span>
    </div>
  </elix-menu-item>
`
/**
 * @class SeMenuItem
 */
export class SeMenuItem extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$label = this._shadowRoot.querySelector('.item-label')
    this.$menuitem = this._shadowRoot.querySelector('elix-menu-item')
    // Hide the elix checkmark if present
    const checkmark = this.$menuitem.shadowRoot?.querySelector('#checkmark')
    if (checkmark) checkmark.setAttribute('style', 'display: none;')
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
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    let shortcut = ''
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        this._loadIcon(newValue)
        break
      case 'label':
        shortcut = this.getAttribute('shortcut')
        this.$label.textContent = `${t(newValue)} ${shortcut ? `(${shortcut})` : ''}`
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

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    // capture shortcuts
    const shortcut = this.getAttribute('shortcut')
    if (shortcut) {
      // register the keydown event
      document.addEventListener('keydown', (e) => {
        // only track keyboard shortcuts for the body containing the SVG-Editor
        if (e.target.nodeName !== 'BODY') return
        // normalize key
        const key = `${(e.metaKey) ? 'meta+' : ''}${(e.ctrlKey) ? 'ctrl+' : ''}${(e.shiftKey) ? 'shift+' : ''}${e.key.toUpperCase()}`
        if (shortcut !== key) return
        // launch the click event
        if (this.id) {
          // Click this very menu item (a global getElementById(this.id) could
          // resolve to another editor's item with the same id).
          this.click()
        }
        e.preventDefault()
      })
    }
  }
}

// Register
customElements.define('se-menu-item', SeMenuItem)
