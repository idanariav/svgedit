// seButton.ts — `<se-button>` — Icon button with pressed/disabled states
import { boundTooltipText } from '../Hotkeys.ts'
import { t } from '../locale.ts'
import { fetchSvgEl } from './svgIconLoader.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { ownerEditor, requireOwnerEditor } from '../domScope.ts'
import { onCommandClick } from './commandBinding.ts'

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
  /* lock mode: tool stays selected after each object (double-click to toggle) */
  .locked {
    outline: 2px solid var(--accent, #2962FF);
    outline-offset: -2px;
  }
  /* still hit-testable: the tooltip explains why it is unavailable (host clicks are blocked in the constructor) */
  .disabled {
    opacity: 0.35;
    cursor: default;
  }
  .disabled:hover {
    background: transparent;
    color: var(--icon, #4B5563);
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
  _onCommandClick: (() => void) | undefined
  _shadowRoot: ShadowRoot
  $div: HTMLDivElement
  $iconWrap: HTMLSpanElement
  imgPath: any
  _unsubscribeHotkeys: (() => void) | undefined

  /**
    * @function constructor
    */
  constructor () {
    super()
    /** the `command=` click listener, made once */
    this._onCommandClick = undefined
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$div = (this._shadowRoot.querySelector('div') as HTMLDivElement)
    this.$iconWrap = (this._shadowRoot.querySelector('.icon-wrap') as HTMLSpanElement)
    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath

    // A disabled button is still hit-testable (its tooltip says why it is
    // unavailable), so an external `addEventListener('click', ...)` (e.g. via
    // the `$click` helper) would fire anyway. Block it here, on the host,
    // before it can reach any other click listener.
    this.addEventListener('click', (e) => {
      if (this.disabled) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }, true)
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): any {
    return ['title', 'src', 'pressed', 'locked', 'disabled', 'disabled-reason', 'size', 'style']
  }

  /**
   * @function attributeChangedCallback
   */
  attributeChangedCallback (name: string, oldValue: string | null, newValue: string) {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
      case 'disabled-reason':
        this._syncTooltip()
        break
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
      case 'locked':
        if (newValue === null) {
          this.$div.classList.remove('locked')
        } else {
          this.$div.classList.add('locked')
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
        this._syncTooltip()
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seButton')
        break
    }
  }

  /**
   * The tooltip: name + shortcut, and while the button is disabled the reason
   * the command is unavailable (`disabled-reason`, set by the command registry).
   */
  _syncTooltip () {
    const title = this.getAttribute('title')
    if (title === null) return
    const text = boundTooltipText(t(title), this.getAttribute('shortcut'), ownerEditor(this)?.hotkeys, this.id)
    const reason = this.disabled ? this.getAttribute('disabled-reason') : null
    this.$div.setAttribute('title', reason ? `${text}\n${reason}` : text)
  }

  /**
* Load an SVG icon by URL, injecting it inline into the shadow DOM.
* Falls back to an <img> if fetch fails.
   */
  async _loadIcon (src: string) {
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

  get title (): string { return (this.getAttribute('title') as string) }

  set title (value: string) { this.setAttribute('title', value) }

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

  get src (): string | null { return this.getAttribute('src') }

  set src (value: string) { this.setAttribute('src', value) }

  get size (): string | null { return this.getAttribute('size') }

  set size (value: string) { this.setAttribute('size', value) }

  connectedCallback () {
    // `command="<id>"` makes this button a view of a registry command (idempotent listener).
    this.addEventListener('click', this._onCommandClick ??= () => onCommandClick(this))
    // Register this button as a hotkey-able action with the central
    // HotkeyManager — whether or not it ships a default `shortcut`, so every
    // toolbar/panel action can be listed and (re)bound from the Hotkey Manager.
    // Late-loading extension buttons register themselves the same way.
    if (this.id) {
      ownerEditor(this)?.hotkeys?.registerEl({
        id: this.id,
        el: this,
        label: this.getAttribute('title'),
        rawKey: this.getAttribute('shortcut')
      })
      // The tooltip names the key the action is bound to now, not the one it shipped with.
      this._unsubscribeHotkeys ??= ownerEditor(this)?.hotkeys?.onChange(() => this._syncTooltip())
      this._syncTooltip()
    }
  }

  disconnectedCallback () {
    this._unsubscribeHotkeys?.()
    this._unsubscribeHotkeys = undefined
  }
}

// Register
customElements.define('se-button', ToolButton)
