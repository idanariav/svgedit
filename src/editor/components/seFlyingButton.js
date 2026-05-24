/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

/**
 * @class FlyingButton
 */
export class FlyingButton extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.template = this.createTemplate(this.imgPath)
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(this.template.content.cloneNode(true))
    // locate the component
    this.$button = this._shadowRoot.querySelector('.menu-button')
    this.$handle = this._shadowRoot.querySelector('.handle')
    this.$overall = this._shadowRoot.querySelector('.overall')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$menu = this._shadowRoot.querySelector('.menu')
    // the last element of the div is the slot
    // we retrieve all elements added in the slot (i.e. se-buttons)
    this.$elements = this.$menu.lastElementChild.assignedElements()

    // Closes opened menu on click
    document.addEventListener('click', e => {
      if (this.opened) {
        this.opened = false
      }
    })
  }

  /**
   * @function createTemplate
   * @param {string} imgPath
   * @returns {any} template
   */

  createTemplate (imgPath) {
    const template = document.createElement('template')
    template.innerHTML = `
      <style>
        :host {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .overall {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .menu-button {
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
          position: relative;
          box-sizing: border-box;
          transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
        }
        .menu-button:hover {
          background: var(--icon-hover-bg, #EEF1F5);
          color: var(--icon-hover, #0F172A);
        }
        .overall.pressed .menu-button {
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
          pointer-events: none;
        }
        .icon-wrap svg,
        .icon-wrap img {
          width: 22px;
          height: 22px;
          display: block;
        }
        .handle {
          position: absolute;
          bottom: 4px;
          right: 3px;
          width: 6px;
          height: 6px;
          pointer-events: all;
          cursor: pointer;
        }
        /* triangle handle indicator */
        .handle::after {
          content: '';
          display: block;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 0 6px 6px;
          border-color: transparent transparent var(--icon, #4B5563) transparent;
        }
        .menu {
          position: fixed;
          background: var(--chrome-bg, #fff);
          border: 1px solid var(--chrome-border, #E6E8EC);
          border-radius: 10px;
          padding: 6px;
          display: none;
          flex-direction: column;
          gap: 2px;
          margin-left: 44px;
          z-index: 100;
          box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
        }
        .open {
          display: flex;
        }
      </style>

      <div class="overall">
        <div class="menu">
          <slot></slot>
        </div>
        <div class="menu-button" title="">
          <span class="icon-wrap"></span>
          <div class="handle"></div>
        </div>
      </div>`
    return template
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'pressed', 'disabled', 'opened']
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
          this.$button.setAttribute('title', `${t(newValue)} ${shortcut ? `[${t(shortcut)}]` : ''}`)
        }
        break
      case 'pressed':
        if (newValue) {
          this.$overall.classList.add('pressed')
        } else {
          this.$overall.classList.remove('pressed')
        }
        break
      case 'opened':
        if (newValue) {
          this.$menu.classList.add('open')
        } else {
          this.$menu.classList.remove('open')
        }
        break
      case 'disabled':
        if (newValue) {
          this.$overall.classList.add('disabled')
        } else {
          this.$overall.classList.remove('disabled')
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
  get pressed () {
    return this.hasAttribute('pressed')
  }

  /**
   * @function set
   * @returns {void}
   */
  set pressed (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('pressed', 'true')
    } else {
      this.removeAttribute('pressed', '')
      // close also the menu if open
      this.removeAttribute('opened')
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get opened () {
    return this.hasAttribute('opened')
  }

  /**
   * @function set
   * @returns {void}
   */
  set opened (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('opened', 'opened')
    } else {
      this.removeAttribute('opened')
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get disabled () {
    return this.hasAttribute('disabled')
  }

  /**
   * @function set
   * @returns {void}
   */
  set disabled (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('disabled', 'true')
    } else {
      this.removeAttribute('disabled', '')
    }
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
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

  connectedCallback () {
    this.activeSlot = this.shadowRoot.querySelector('slot').assignedElements()[0]
    const initialSrc = this.activeSlot?.getAttribute('src')
    if (initialSrc) this._loadIcon(initialSrc)

    // capture click event on the button to manage the logic
    const onClickHandler = (ev) => {
      ev.stopPropagation()
      switch (ev.target.nodeName) {
        case 'SE-FLYINGBUTTON':
          if (this.pressed) {
            this.setAttribute('opened', 'opened')
          } else {
            this.activeSlot.click()
            this.setAttribute('pressed', 'pressed')
          }
          break
        case 'SE-BUTTON': {
          const newSrc = ev.target.getAttribute('src')
          if (newSrc) this._loadIcon(newSrc)
          this.activeSlot = ev.target
          this.setAttribute('pressed', 'pressed')
          this.$menu.classList.remove('open')
          break
        }
        case 'DIV':
          if (this.opened) {
            this.removeAttribute('opened')
          } else {
            this.setAttribute('opened', 'opened')
            const rect = this.getBoundingClientRect()
            this.$menu.style.top = rect.top + 'px'
          }
          break
        default:
          console.error('unknown nodeName for:', ev.target, ev.target.className)
      }
    }
    svgEditor.$click(this, onClickHandler)
    svgEditor.$click(this.$handle, onClickHandler)
  }
}

// Register
customElements.define('se-flyingbutton', FlyingButton)
