/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'
import { isMac } from '@svgedit/svgcanvas/common/browser'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  div {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--icon, #4B5563);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
    position: relative;
    box-sizing: border-box;
  }
  div:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .pressed {
    background: var(--accent-soft, #E8EFFF) !important;
    color: var(--accent, #2962FF) !important;
    border-color: var(--accent-border, #C7D7FF) !important;
    box-shadow: var(--active-shadow, 0 1px 2px rgba(41,98,255,0.18)) !important;
  }
  .disabled {
    opacity: 0.35;
    cursor: default;
    pointer-events: none;
  }
  .icon-wrap {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .icon-wrap svg {
    width: 22px;
    height: 22px;
    display: block;
    overflow: visible;
  }
  /* Small variant */
  .small {
    width: 30px;
    height: 30px;
    border-radius: 7px;
  }
  .small .icon-wrap {
    width: 16px;
    height: 16px;
  }
  .small .icon-wrap svg {
    width: 16px;
    height: 16px;
  }
  </style>
  <div title="title">
    <span class="icon-wrap"></span>
  </div>
`
/**
 * @class ToolButton
 */
export class ToolButton extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$div = this._shadowRoot.querySelector('div')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'src', 'pressed', 'disabled', 'size', 'style']
  }

  /**
   * @function attributeChangedCallback
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'title': {
        const shortcut = this.getAttribute('shortcut')
        this.$div.setAttribute('title', `${t(newValue)} ${shortcut ? `[${t(shortcut)}]` : ''}`)
        break
      }
      case 'style':
        this.$div.style = newValue
        break
      case 'src':
        this._loadIcon(newValue)
        break
      case 'pressed':
        if (newValue === null) {
          this.$div.classList.remove('pressed')
        } else {
          this.$div.classList.add('pressed')
        }
        break
      case 'size':
        if (newValue === 'small') {
          this.$div.classList.add('small')
        } else {
          this.$div.classList.remove('small')
        }
        break
      case 'disabled':
        if (newValue) {
          this.$div.classList.add('disabled')
        } else {
          this.$div.classList.remove('disabled')
        }
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
  }

  /**
   * Load an SVG icon by URL, injecting it inline into the shadow DOM.
   * Falls back to an <img> if fetch fails.
   */
  async _loadIcon (src) {
    if (!src) return
    const url = src.indexOf('data:') !== -1 ? src : `${this.imgPath}/${src}`

    // Inline SVG for theme-aware currentColor icons
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      this.$iconWrap.replaceChildren(svgEl)
    } else {
      // Fallback to img
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      img.style.width = '100%'
      img.style.height = '100%'
      this.$iconWrap.replaceChildren(img)
    }
  }

  get title () { return this.getAttribute('title') }
  set title (value) { this.setAttribute('title', value) }

  get pressed () { return this.hasAttribute('pressed') }
  set pressed (value) {
    if (value) {
      this.setAttribute('pressed', 'true')
    } else {
      this.removeAttribute('pressed')
    }
  }

  get disabled () { return this.hasAttribute('disabled') }
  set disabled (value) {
    if (value) {
      this.setAttribute('disabled', 'true')
    } else {
      this.removeAttribute('disabled')
    }
  }

  get src () { return this.getAttribute('src') }
  set src (value) { this.setAttribute('src', value) }

  get size () { return this.getAttribute('size') }
  set size (value) { this.setAttribute('size', value) }

  connectedCallback () {
    const shortcut = this.getAttribute('shortcut')
    if (shortcut) {
      document.addEventListener('keydown', (e) => {
        if (e.target.nodeName !== 'BODY') return
        // Treat the platform "command" modifier as the shortcut's `ctrl+`
        // prefix: Cmd (metaKey) on Mac, Ctrl (ctrlKey) elsewhere.
        const cmdDown = isMac() ? e.metaKey : e.ctrlKey
        const key = `${cmdDown ? 'ctrl+' : ''}${e.key.toUpperCase()}`
        if (shortcut !== key) return
        this.click()
        e.preventDefault()
      })
    }
  }
}

// Register
customElements.define('se-button', ToolButton)
