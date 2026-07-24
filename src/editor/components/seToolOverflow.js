/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

/**
 * `<se-tool-overflow>` — the left panel's "Additional tools" drawer.
 *
 * Visually modeled on `se-flyingbutton` (same button/menu/handle shell and
 * design tokens), but it isn't a tool selector: it has no "active sub-tool"
 * concept, and clicking its own face always just opens/closes the popover
 * (never invokes a tool). Its slotted children are real `se-button`/
 * `se-flyingbutton` tools the user dragged in from the main row — see
 * `toolDragReorder.js` — each keeps working exactly as it did in the main
 * row (own click handler, own hotkey registration, own lock gesture).
 * @class ToolOverflow
 */
export class ToolOverflow extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.template = this.createTemplate()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(this.template.content.cloneNode(true))
    this.$button = this._shadowRoot.querySelector('.menu-button')
    this.$overall = this._shadowRoot.querySelector('.overall')
    this.$iconWrap = this._shadowRoot.querySelector('.icon-wrap')
    this.$menu = this._shadowRoot.querySelector('.menu')

    // Close on an outside click (mirrors se-flyingbutton) or Escape.
    document.addEventListener('click', () => {
      if (this.opened) this.opened = false
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.opened) this.opened = false
    })
  }

  /**
   * @function createTemplate
   * @returns {any} template
   */
  createTemplate () {
    const template = document.createElement('template')
    template.innerHTML = `
      <style>
        :host {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 6px;
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
          box-sizing: border-box;
          transition: background 0.12s, color 0.12s, border-color 0.12s;
        }
        .menu-button:hover {
          background: var(--icon-hover-bg, #EEF1F5);
          color: var(--icon-hover, #0F172A);
        }
        .overall.open .menu-button {
          background: var(--accent-soft, #E8EFFF);
          color: var(--accent, #2962FF);
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
        .open .menu {
          display: flex;
        }
      </style>

      <div class="overall">
        <div class="menu">
          <slot></slot>
        </div>
        <div class="menu-button" title="">
          <span class="icon-wrap"></span>
        </div>
      </div>`
    return template
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'opened', 'src']
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
        this.$button.setAttribute('title', t(newValue))
        break
      case 'opened':
        this.$overall.classList.toggle('open', Boolean(newValue))
        break
      case 'src':
        this._loadIcon(newValue)
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
  get opened () {
    return this.hasAttribute('opened')
  }

  /**
   * @function set
   * @returns {void}
   */
  set opened (value) {
    if (value) {
      this.setAttribute('opened', 'opened')
    } else {
      this.removeAttribute('opened')
    }
  }

  /**
   * Load an SVG icon by URL, injecting it inline into the shadow DOM.
   * Falls back to an <img> if fetch fails.
   * @param {string} src
   * @returns {Promise<void>}
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
    // Slotted tools (real se-button/se-flyingbutton elements the user dragged
    // in) are genuine light-DOM children of this host, so a single listener
    // here catches both the drawer's own button (retargeted to
    // SE-TOOL-OVERFLOW, since that click originates inside the shadow root)
    // and clicks on the slotted content (un-retargeted, same light DOM tree)
    // — mirroring se-flyingbutton's identical single-listener pattern.
    const onClickHandler = (ev) => {
      ev.stopPropagation()
      if (ev.target.nodeName === 'SE-TOOL-OVERFLOW') {
        this.opened = !this.opened
        if (this.opened) {
          const rect = this.getBoundingClientRect()
          const menuRect = this.$menu.getBoundingClientRect()
          const vh = window.innerHeight
          const top = menuRect.height > 0 && rect.top + menuRect.height > vh - 8
            ? Math.max(8, vh - 8 - menuRect.height)
            : rect.top
          this.$menu.style.top = top + 'px'
        }
      } else {
        // A slotted tool handled its own click — close the drawer after,
        // mirroring se-flyingbutton's close-after-pick behavior.
        this.opened = false
      }
    }
    svgEditor.$click(this, onClickHandler)
  }
}

// Register
customElements.define('se-tool-overflow', ToolOverflow)
