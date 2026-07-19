/**
 * EyedropperActionMenu.js — <se-eyedropper-menu> web component.
 * A small, fixed 4-item action menu shown at the eyedropper tool's click
 * point after a color is sampled. Not a reuse of SeCMenuDialog (that class
 * is tightly coupled to the user's favorites system); this menu reuses only
 * `positionContextMenu` for click-anchored, viewport-clamped placement.
 */

import { css } from './EyedropperActionMenu.css.js'
import { positionContextMenu } from '../../dialogs/positionContextMenu.js'

const ACTIONS = [
  { id: 'fill', labelKey: 'eyedropper:menu.fill', fallback: 'Set as fill color', callback: 'onFill' },
  { id: 'stroke', labelKey: 'eyedropper:menu.stroke', fallback: 'Set as outline color', callback: 'onStroke' },
  { id: 'background', labelKey: 'eyedropper:menu.background', fallback: 'Set as background color', callback: 'onBackground' },
  { id: 'palette', labelKey: 'eyedropper:menu.palette', fallback: 'Generate matching palette', callback: 'onPalette' }
]

/**
 * @class SeEyedropperMenu
 * @property {object} i18next
 */
export class SeEyedropperMenu extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._i18next = null
    this._callbacks = {}
    this._outsideClickHandler = null
    this._keyHandler = null
    this._render()
  }

  set i18next (i) { this._i18next = i }
  get i18next () { return this._i18next }

  _t (key, fallback) {
    try { return this._i18next?.t(key) || fallback } catch { return fallback }
  }

  _render () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    this._shadowRoot.adoptedStyleSheets = [sheet]

    const list = document.createElement('ul')
    list.className = 'contextMenu'
    list.setAttribute('role', 'menu')
    ACTIONS.forEach(({ id, labelKey, fallback }) => {
      const li = document.createElement('li')
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

  _runAction (id) {
    const action = ACTIONS.find((a) => a.id === id)
    this.close()
    this._callbacks[action.callback]?.()
  }

  /**
   * Show the menu anchored at a viewport point.
   * @param {number} clientX
   * @param {number} clientY
   * @param {{onFill?: Function, onStroke?: Function, onBackground?: Function, onPalette?: Function}} callbacks
   * @returns {void}
   */
  open (clientX, clientY, callbacks = {}) {
    this._callbacks = callbacks
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
      document.addEventListener('mousedown', this._outsideClickHandler)
      document.addEventListener('keydown', this._keyHandler)
    }, 0)
  }

  /** @returns {void} */
  close () {
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
