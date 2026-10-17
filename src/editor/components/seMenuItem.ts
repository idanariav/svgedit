// seMenuItem.ts — `<se-menu-item>` — one row of a `<se-menu>` popup, with an icon, a label and a shortcut hint
import { t } from '../locale.ts'
import { fetchSvgEl } from './svgIconLoader.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { ownerEditor, requireOwnerEditor } from '../domScope.ts'
import { formatShortcutAttr } from '../Hotkeys.ts'
import { onCommandClick } from './commandBinding.ts'
const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: block;
    padding: 7px 10px;
    border-radius: 7px;
    color: var(--fg, #1B1F24);
    font-family: var(--ui-font, inherit);
    font-size: 13px;
    cursor: pointer;
  }
  :host(:hover) {
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
  .item-shortcut {
    margin-left: 16px;
    color: var(--muted, #6B7280);
    font-size: 12px;
    text-align: right;
  }
  </style>
  <div class="item-row">
    <span class="icon-wrap"></span>
    <span class="item-label"></span>
    <span class="item-shortcut"></span>
  </div>
`
/**
 * @class SeMenuItem
 * A single row inside a `<se-menu>` popup: plain hover/selection styling and
 * a `menuitem` ARIA role via `:host(:hover)` + `role="menuitem"`. The actual
 * click action is wired directly to this element (see MainMenu.js), not
 * through any menu-selection machinery.
 */
export class SeMenuItem extends HTMLElement {
  _onCommandClick: (() => void) | undefined
  _shadowRoot: ShadowRoot
  $iconWrap: HTMLSpanElement
  $label: HTMLSpanElement
  $shortcut: HTMLSpanElement
  imgPath: any

  /**
    * @function constructor
    */
  constructor () {
    super()
    /** the `command=` click listener, made once */
    this._onCommandClick = undefined
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$iconWrap = (this._shadowRoot.querySelector('.icon-wrap') as HTMLSpanElement)
    this.$label = (this._shadowRoot.querySelector('.item-label') as HTMLSpanElement)
    this.$shortcut = (this._shadowRoot.querySelector('.item-shortcut') as HTMLSpanElement)
    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): any {
    return ['label', 'src']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    let shortcut = ''
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        this._loadIcon(newValue)
        break
      case 'label':
        shortcut = this.getAttribute('shortcut') ?? ''
        this.$label.textContent = t(newValue)
        this.$shortcut.textContent = formatShortcutAttr(shortcut)
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seMenuItem')
        break
    }
  }

  async _loadIcon (src: string) {
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

  /** @function connectedCallback */
  connectedCallback (): void {
    // `command="<id>"` makes this item a view of a registry command (idempotent listener).
    this.addEventListener('click', this._onCommandClick ??= () => onCommandClick(this))
    if (!this.hasAttribute('role')) this.setAttribute('role', 'menuitem')
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0')
    // Shortcut dispatch is owned by the central HotkeyManager; register this
    // menu item's action so it can be listed, rebound, or removed — even
    // without a default `shortcut` (mirrors seButton.js's unconditional
    // registration, so unbound menu items are still searchable/bindable).
    if (this.id) {
      ownerEditor(this)?.hotkeys?.registerEl({
        id: this.id,
        el: this,
        label: this.getAttribute('label'),
        rawKey: this.getAttribute('shortcut')
      })
    }
  }
}

// Register
customElements.define('se-menu-item', SeMenuItem)
