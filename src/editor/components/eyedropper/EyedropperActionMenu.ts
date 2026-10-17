/**
 * EyedropperActionMenu.ts — <se-eyedropper-menu> web component.
 * A small, fixed 6-item action menu shown at the eyedropper tool's click
 * point after a color is sampled. Not a reuse of SeCMenuDialog (that class
 * is tightly coupled to the user's favorites system); this menu reuses only
 * `positionContextMenu` for click-anchored, viewport-clamped placement.
 */

import { css } from './EyedropperActionMenu.css.js'
import { positionContextMenu } from '../../dialogs/positionContextMenu.ts'

const ACTIONS = [
  { id: 'fill', labelKey: 'eyedropper:menu.fill', fallback: 'Set as fill color', callback: 'onFill' },
  { id: 'stroke', labelKey: 'eyedropper:menu.stroke', fallback: 'Set as outline color', callback: 'onStroke' },
  { id: 'background', labelKey: 'eyedropper:menu.background', fallback: 'Set as background color', callback: 'onBackground' },
  { id: 'palette', labelKey: 'eyedropper:menu.palette', fallback: 'Generate matching palette', callback: 'onPalette' },
  { id: 'styleToSelection', labelKey: 'eyedropper:menu.styleToSelection', fallback: 'Apply style to selection', callback: 'onStyleToSelection', separator: true },
  { id: 'styleFromSelection', labelKey: 'eyedropper:menu.styleFromSelection', fallback: 'Apply selection\u2019s style to this', callback: 'onStyleFromSelection' }
]

/**
 * @class SeEyedropperMenu
 * @property {object} i18next
 */
export class SeEyedropperMenu extends HTMLElement {
  _shadowRoot: ShadowRoot
  _disabled: Set<any>

  _i18next: import('i18next').i18n | null
  _callbacks: Record<string, Function | undefined>
  _outsideClickHandler: ((e: MouseEvent) => void) | null
  _keyHandler: ((e: KeyboardEvent) => void) | null
  $menu: HTMLUListElement

  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._i18next = null
    this._callbacks = {}
    this._disabled = new Set()
    this._outsideClickHandler = null
    this._keyHandler = null
    this._render()
  }

  set i18next (i) { this._i18next = i }
  get i18next () { return this._i18next }

  _t (key: string, fallback: string) {
    try { return this._i18next?.t(key) || fallback } catch { return fallback }
  }

  _render () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    this._shadowRoot.adoptedStyleSheets = [sheet]

    const list = document.createElement('ul')
    list.className = 'contextMenu'
    list.setAttribute('role', 'menu')
    ACTIONS.forEach(({ id, labelKey, fallback, separator }) => {
      const li = document.createElement('li')
      if (separator) li.className = 'separator'
      const a = document.createElement('a')
      a.href = '#'
      a.setAttribute('role', 'menuitem')
      a.dataset.action = id
      const label = document.createElement('span')
      label.className = 'qa-label'
      label.textContent = this._t(labelKey, fallback)
      a.append(label)
      a.addEventListener('click', (e) => {
        e.preventDefault()
        this._runAction(id)
      })
      li.append(a)
      list.append(li)
    })
    this._shadowRoot.replaceChildren(list)
    this.$menu = list
  }

  _runAction (id: string) {
    const action = ACTIONS.find((a) => a.id === id)
    if (!action || this._disabled.has(id)) return
    this.close()
    this._callbacks[action.callback]?.()
  }

  /**
   * Show the menu anchored at a viewport point.
 * @param options `disabled`: action ids shown greyed out and inert
   */
  open (clientX: number, clientY: number, callbacks: { onFill?: Function, onStroke?: Function, onBackground?: Function, onPalette?: Function, onStyleToSelection?: Function, onStyleFromSelection?: Function } = {}, options: { disabled?: string[] } = {}): void {
    this._callbacks = callbacks
    this._disabled = new Set(options.disabled ?? [])
    ;(this._shadowRoot.querySelectorAll('a[data-action]') as NodeListOf<HTMLElement>).forEach((a) => {
      const off = this._disabled.has(String(a.dataset.action))
      a.parentElement?.classList.toggle('disabled', off)
      a.setAttribute('aria-disabled', String(off))
    })
    this.classList.add('is-open')
    positionContextMenu(this.$menu, clientX, clientY)

    this._outsideClickHandler = (e) => {
      if (e.composedPath().includes(this)) return
      this.close()
    }
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    }
    // Deferred so the click that opened the menu doesn't immediately close it.
    setTimeout(() => {
      if (this._outsideClickHandler) document.addEventListener('mousedown', this._outsideClickHandler)
      if (this._keyHandler) document.addEventListener('keydown', this._keyHandler)
    }, 0)
  }

  close (): void {
    this.classList.remove('is-open')
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler)
      this._outsideClickHandler = null
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }
    this.remove()
  }

  disconnectedCallback () {
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler)
      this._outsideClickHandler = null
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }
  }
}

customElements.define('se-eyedropper-menu', SeEyedropperMenu)
