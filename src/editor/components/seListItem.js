/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: block;
  }
  [aria-label="option"] {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--icon, #4B5563);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    box-sizing: border-box;
  }
  [aria-label="option"]:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .selected {
    background: var(--accent-soft, #E8EFFF) !important;
    color: var(--accent, #2962FF) !important;
    border-color: var(--accent-border, #C7D7FF) !important;
  }
  .icon-wrap {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .icon-wrap svg,
  .icon-wrap img {
    width: 22px;
    height: 22px;
    display: block;
  }
  </style>
  <div aria-label="option">
    <span class="icon-wrap"></span>
    <slot></slot>
  </div>
`
/**
 * @class SeListItem
 */
export class SeListItem extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$menuitem = this._shadowRoot.querySelector('[aria-label=option]')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$menuitem.addEventListener('mousedown', e => {
      this.$menuitem.dispatchEvent(new CustomEvent('selectedindexchange', {
        bubbles: true,
        composed: true,
        detail: { selectedItem: this.getAttribute('value') }
      }))
    })
  }

  static get observedAttributes () {
    return ['option', 'src', 'title', 'img-height', 'selected']
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'option':
        this.$menuitem.setAttribute('option', newValue)
        this.$menuitem.textContent = t(newValue)
        break
      case 'src':
        this._loadIcon(newValue)
        break
      case 'title':
        this.$menuitem.setAttribute('title', t(newValue))
        break
      case 'img-height':
        // handled in _loadIcon via the attr at load time
        break
      case 'selected':
        if (newValue === 'true') {
          this.$menuitem.classList.add('selected')
        } else {
          this.$menuitem.classList.remove('selected')
        }
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

  get option () { return this.getAttribute('option') }
  set option (value) { this.setAttribute('option', value) }

  get title () { return this.getAttribute('title') }
  set title (value) { this.setAttribute('title', value) }

  get imgHeight () { return this.getAttribute('img-height') }
  set imgHeight (value) { this.setAttribute('img-height', value) }

  get src () { return this.getAttribute('src') }
  set src (value) { this.setAttribute('src', value) }
}

// Register
customElements.define('se-list-item', SeListItem)
