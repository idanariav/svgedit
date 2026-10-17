// seMenu.ts — `<se-menu>` — menu button with a popup that holds `<se-menu-item>` rows
import { fetchSvgEl } from './svgIconLoader.ts'
import { getRawIcon } from '../images/iconRegistry.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { requireOwnerEditor } from '../domScope.ts'

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
  /* Chevron: signals the logo is a menu trigger */
  #popupToggle::after {
    content: '';
    width: 6px;
    height: 6px;
    margin: -3px 2px 0 0;
    border-right: 1.5px solid var(--muted, #6B7280);
    border-bottom: 1.5px solid var(--muted, #6B7280);
    transform: rotate(45deg);
  }
  #popupToggle:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    border-radius: 7px;
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
  ::slotted([role="separator"]) {
    height: 1px;
    padding: 0 !important;
    margin: 4px 6px !important;
    background: var(--chrome-border, #E6E8EC);
    pointer-events: none;
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

  <button type="button" id="popupToggle" popovertarget="menuPopup" aria-haspopup="menu" title="Menu"></button>
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
  _shadowRoot: ShadowRoot
  $toggle: HTMLButtonElement
  $popup: HTMLDivElement
  $label: HTMLButtonElement
  imgPath: unknown
  _closeOnItemClick: ((e: Event) => void) | undefined
  _positionPopup: (() => void) | undefined

  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$toggle = (this._shadowRoot.querySelector('#popupToggle') as HTMLButtonElement)
    this.$popup = (this._shadowRoot.querySelector('#menuPopup') as HTMLDivElement)
    this.$label = this.$toggle
    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    this._closeOnItemClick = (e: Event) => {
      if ((e.target as Element).closest('se-menu-item')) this.$popup.hidePopover()
    }
    this.addEventListener('click', this._closeOnItemClick)
    this._positionPopup = () => this.positionPopup()
    this.$popup.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState === 'open') this.positionPopup()
    })
  }

  /** @function disconnectedCallback */
  disconnectedCallback (): void {
    this.removeEventListener('click', (this._closeOnItemClick as EventListener))
  }

  /**
   * Position the popup just below the trigger, clamped to the viewport
   * (same placement the previous menu popup used). Called from the 'toggle'
   * event, by which point the popover is already in the top layer and its
   * dimensions can be measured.
   */
  positionPopup (): void {
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
 * @returns observed
   */
  static get observedAttributes (): string[] {
    return ['label', 'src']
  }

  /**
   * @function attributeChangedCallback
   */
  attributeChangedCallback (name: string, oldValue: string | null, newValue: string) {
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        this._loadIcon(newValue)
        break
      case 'label':
        this.$label.prepend(newValue)
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seMenu')
        break
    }
  }

  async _loadIcon (src: string) {
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

  /** @function get */
  get label (): any {
    return this.getAttribute('label')
  }

  /** @function set */
  set label (value) {
    this.setAttribute('label', value)
  }

  /** @function get */
  get src (): any {
    return this.getAttribute('src')
  }

  /** @function set */
  set src (value) {
    this.setAttribute('src', value)
  }
}

// Register
customElements.define('se-menu', SeMenu)
