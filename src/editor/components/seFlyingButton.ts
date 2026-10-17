// seFlyingButton.ts — `<se-flying-button>` — Button with sub-tool flyout
import { boundTooltipText } from '../Hotkeys.ts'
import { t } from '../locale.ts'
import { fetchSvgEl } from './svgIconLoader.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { ownerEditor, requireOwnerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'

/**
 * @class FlyingButton
 */
export class FlyingButton extends HTMLElement {
  staticIcon: boolean
  imgPath: string
  template: HTMLTemplateElement
  _shadowRoot: ShadowRoot
  $button: HTMLDivElement
  $handle: HTMLDivElement
  $overall: HTMLDivElement
  $iconWrap: HTMLSpanElement
  $menu: HTMLDivElement
  $elements: Element[]
  _unsubscribeHotkeys: (() => void) | undefined
  _globalAbort: AbortController | undefined

  /** the sub-tool the button stands for (the first until one is picked) */ activeSlot: Element | undefined

  /**
    * @function constructor
    */
  constructor () {
    super()
    // Fixed trigger icon opt-in (see the 'src' case in attributeChangedCallback)
    this.staticIcon = false
    // create the shadowDom and insert the template
    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath
    this.template = this.createTemplate(this.imgPath)
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(this.template.content.cloneNode(true))
    // locate the component
    this.$button = (this._shadowRoot.querySelector('.menu-button') as HTMLDivElement)
    this.$handle = (this._shadowRoot.querySelector('.handle') as HTMLDivElement)
    this.$overall = (this._shadowRoot.querySelector('.overall') as HTMLDivElement)
    this.$iconWrap = (this._shadowRoot.querySelector('.icon-wrap') as HTMLSpanElement)
    this.$menu = (this._shadowRoot.querySelector('.menu') as HTMLDivElement)
    // the last element of the div is the slot
    // we retrieve all elements added in the slot (i.e. se-buttons)
    this.$elements = (this.$menu.lastElementChild as HTMLSlotElement).assignedElements()
  }

  /**
   * @function createTemplate
 * @returns template
   */

  createTemplate (imgPath: string): HTMLTemplateElement {
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
        /* lock mode: tool stays selected after each object (double-click to toggle) */
        .overall.locked .menu-button {
          outline: 2px solid var(--accent, #2962FF);
          outline-offset: -2px;
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
 * @returns observed
   */
  static get observedAttributes (): string[] {
    return ['title', 'pressed', 'locked', 'disabled', 'opened', 'src']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        this._syncTooltip()
        break
      case 'pressed':
        if (newValue) {
          this.$overall.classList.add('pressed')
        } else {
          this.$overall.classList.remove('pressed')
        }
        break
      case 'locked':
        if (newValue) {
          this.$overall.classList.add('locked')
        } else {
          this.$overall.classList.remove('locked')
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
      case 'src':
        // Opt-in "fixed trigger icon" mode (mirrors se-list's static-icon
        // lists): the flyout's face icon never swaps to the last-picked
        // sub-tool's icon — used by flyouts that group unrelated tools
        // (e.g. the combined shapes flyout) rather than variants of one tool.
        this.staticIcon = true
        this._loadIcon(newValue)
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seFlyingButton')
        break
    }
  }

  /** @function get */
  get title (): string {
    return this.getAttribute('title') as string
  }

  /** @function set */
  set title (value: string | number) {
    this.setAttribute('title', String(value))
  }

  /** @function get */
  get pressed (): unknown {
    return this.hasAttribute('pressed')
  }

  /** @function set */
  set pressed (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('pressed', 'true')
    } else {
      this.removeAttribute('pressed')
      // close also the menu if open
      this.removeAttribute('opened')
    }
  }

  /** @function get */
  get opened (): unknown {
    return this.hasAttribute('opened')
  }

  /** @function set */
  set opened (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('opened', 'opened')
    } else {
      this.removeAttribute('opened')
    }
  }

  /** @function get */
  get disabled (): unknown {
    return this.hasAttribute('disabled')
  }

  /** @function set */
  set disabled (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('disabled', 'true')
    } else {
      this.removeAttribute('disabled')
    }
  }

  async _loadIcon (src: string): Promise<void> {
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

  /** The tooltip: name + the key the action is bound to now (the authored `shortcut` until the Hotkey Manager knows it). */
  _syncTooltip (): void {
    const title = this.getAttribute('title')
    if (title === null) return
    this.$button.setAttribute('title', boundTooltipText(t(title), this.getAttribute('shortcut'), ownerEditor(this)?.hotkeys, this.id))
  }

  disconnectedCallback () {
    this._globalAbort?.abort()
    this._unsubscribeHotkeys?.()
    this._unsubscribeHotkeys = undefined
  }

  connectedCallback () {
    // Like se-button: a hotkey-able action (clicking the flyout re-arms its last tool), so the Hotkey Manager can bind it.
    if (this.id) {
      ownerEditor(this)?.hotkeys?.registerEl({
        id: this.id,
        el: this,
        label: this.getAttribute('title'),
        rawKey: this.getAttribute('shortcut')
      })
      this._unsubscribeHotkeys ??= ownerEditor(this)?.hotkeys?.onChange(() => this._syncTooltip())
      this._syncTooltip()
    }
    // Closes opened menu on click
    this._globalAbort = new AbortController()
    document.addEventListener('click', e => {
      if (this.opened) {
        this.opened = false
      }
    }, { signal: this._globalAbort.signal })
    this.activeSlot = (this._shadowRoot.querySelector('slot') as HTMLSlotElement).assignedElements()[0]
    // A static-icon flyout (see the 'src' case above) already has its fixed
    // face icon loaded — don't let the first sub-tool's icon override it.
    if (!this.staticIcon) {
      const initialSrc = this.activeSlot?.getAttribute('src')
      if (initialSrc) this._loadIcon(initialSrc)
    }

    // capture click event on the button to manage the logic
    const onClickHandler = (ev: Event) => {
      ev.stopPropagation()
      const target = ev.target as HTMLElement
      switch (target.nodeName) {
        case 'SE-FLYINGBUTTON':
          if (this.pressed) {
            this.setAttribute('opened', 'opened')
          } else {
            ;(this.activeSlot as HTMLElement).click()
            this.setAttribute('pressed', 'pressed')
          }
          break
        case 'SE-BUTTON': {
          const newSrc = target.getAttribute('src')
          if (newSrc && !this.staticIcon) this._loadIcon(newSrc)
          this.activeSlot = target
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
            const menuRect = this.$menu.getBoundingClientRect()
            const vh = window.innerHeight
            const top = menuRect.height > 0 && rect.top + menuRect.height > vh - 8
              ? Math.max(8, vh - 8 - menuRect.height)
              : rect.top
            this.$menu.style.top = top + 'px'
          }
          break
        default:
          logError('unknown nodeName for: ' + target.className, target, 'seFlyingButton')
      }
    }
    $click(this, onClickHandler)
    $click(this.$handle, onClickHandler)
  }
}

// Register
customElements.define('se-flyingbutton', FlyingButton)
