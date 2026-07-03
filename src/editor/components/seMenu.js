/* globals svgEditor */
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
  #popupToggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    font-family: var(--ui-font, inherit);
    font-size: 13px;
    color: var(--fg, #1B1F24);
  }
  #menuPopup {
    margin: 0;
    padding: 6px;
    background-color: var(--chrome-bg, #fff);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    color: var(--fg, #1B1F24);
  }
  /* The popover attribute leaves default UA sizing/positioning off; anchor
     it below the trigger, matching the previous popup placement. */
  #menuPopup:popover-open {
    position: fixed;
    inset: unset;
  }
  ::slotted([current]) {
    background: var(--icon-hover-bg, #EEF1F5) !important;
    border-radius: 7px !important;
  }
  ::slotted(*) {
    padding: 7px 10px !important;
    margin: 0 !important;
    border-radius: 7px !important;
    color: var(--fg, #1B1F24) !important;
    font-family: var(--ui-font, inherit) !important;
    font-size: 13px !important;
  }
  </style>

  <button type="button" id="popupToggle" popovertarget="menuPopup" aria-haspopup="menu"></button>
  <div id="menuPopup" popover role="menu">
    <slot></slot>
  </div>
`
/**
 * @class SeMenu
 * Toolbar hamburger-menu button + popup. The popup is a native Popover
 * (light-dismiss on outside click/Escape, no JS needed for that part);
 * `#popupToggle`'s `popovertarget` attribute wires the open/close toggle
 * declaratively. A click on any slotted `<se-menu-item>` closes the popup
 * (menu actions are wired directly to each item's own click listener in
 * MainMenu.js, unaffected by this).
 */
export class SeMenu extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$toggle = this._shadowRoot.querySelector('#popupToggle')
    this.$popup = this._shadowRoot.querySelector('#menuPopup')
    this.$label = this.$toggle
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    this._closeOnItemClick = (e) => {
      if (e.target.closest('se-menu-item')) this.$popup.hidePopover()
    }
    this.addEventListener('click', this._closeOnItemClick)
    this._positionPopup = () => this.positionPopup()
    this.$popup.addEventListener('toggle', (e) => {
      if (e.newState === 'open') this.positionPopup()
    })
  }

  /**
   * @function disconnectedCallback
   * @returns {void}
   */
  disconnectedCallback () {
    this.removeEventListener('click', this._closeOnItemClick)
  }

  /**
   * Position the popup just below the trigger, clamped to the viewport
   * (same placement the previous menu popup used). Called from the 'toggle'
   * event, by which point the popover is already in the top layer and its
   * dimensions can be measured.
   * @returns {void}
   */
  positionPopup () {
    const btn = this.$toggle.getBoundingClientRect()
    const pop = this.$popup.getBoundingClientRect()
    const gap = 4
    const margin = 8
    let left = btn.left
    if (left + pop.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - pop.width - margin)
    }
    this.$popup.style.top = `${btn.bottom + gap}px`
    this.$popup.style.left = `${left}px`
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
