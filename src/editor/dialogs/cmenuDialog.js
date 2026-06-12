/* globals svgEditor */
import cMenuDialogHTML from './cmenuDialog.html'
import { positionContextMenu } from './positionContextMenu.js'
import { closestRoot } from '../domScope.js'
import { fetchSvgEl } from '../components/svgIconLoader.js'
import { loadFavorites } from '../favorites.js'
import {
  getFavoriteMeta,
  isValueControl,
  VALUE_CONTROLS,
  runFavoriteTrigger
} from '../favoriteActions.js'

const template = document.createElement('template')
template.innerHTML = cMenuDialogHTML

// Actions that stay available with no selection; everything else is disabled
// when nothing is selected (mirrors the original context menu's behaviour).
const ALWAYS_ENABLED = new Set([
  'paste', 'paste_in_place', 'select_all', 'zoom_in', 'zoom_out'
])

/**
 * Canvas quick-action menu. On right-click it rebuilds itself from the user's
 * favorites (see `favorites.js` / `favoriteActions.js`): trigger actions render
 * as icon + label rows; value controls (stroke width, fill/stroke colour) render
 * as a live widget so the value is adjustable in place. It is intentionally a
 * plain `<ul>` (not `role="menu"`) so embedding inputs does not break screen
 * readers.
 * @class SeCMenuDialog
 */
export class SeCMenuDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    // Resolved in connectedCallback (the element isn't attached yet here, so
    // its owning editor container can't be found at construction time).
    this._workarea = null
    this.$dialog = this._shadowRoot.querySelector('#cmenu_canvas')
    this.i18next = null
  }

  /**
   * @param {object} i18next
   * @returns {void}
   */
  init (i18next) {
    this.i18next = i18next
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    const current = this
    // Now attached: bind to this editor's own workarea (see domScope.js).
    this._workarea = closestRoot(this).querySelector('[id="workarea"]')
    const onMenuOpenHandler = (e) => {
      e.preventDefault()
      current._build()
      positionContextMenu(current.$dialog, e.clientX, e.clientY)
    }
    const onMenuCloseHandler = (e) => {
      // Right-clicks (button 2) reposition rather than close.
      if (e.button !== 2) current._hide()
    }
    this._workarea.addEventListener('contextmenu', onMenuOpenHandler)
    this._workarea.addEventListener('mousedown', onMenuCloseHandler)
  }

  /** @returns {void} */
  _hide () {
    this.$dialog.style.display = 'none'
  }

  /** Rebuild the menu contents from the user's favorites. */
  _build () {
    const editor = svgEditor
    this.$dialog.replaceChildren()
    const hasSelection = !!(editor.selectedElement || editor.multiselected)
    let rendered = 0
    loadFavorites().forEach((id) => {
      const meta = getFavoriteMeta(editor, id)
      if (!meta) return
      const disabled = !hasSelection && !ALWAYS_ENABLED.has(id)
      const li = isValueControl(id)
        ? this._valueRow(editor, id, meta, disabled)
        : this._triggerRow(editor, id, meta, disabled)
      this.$dialog.append(li)
      rendered++
    })
    if (!rendered) {
      const li = document.createElement('li')
      li.className = 'qa-empty'
      li.textContent = '—'
      this.$dialog.append(li)
    }
  }

  /**
   * A one-shot trigger row (icon + label).
   * @returns {HTMLLIElement}
   */
  _triggerRow (editor, id, meta, disabled) {
    const li = document.createElement('li')
    if (disabled) li.classList.add('disabled')
    const a = document.createElement('a')
    a.href = `#${id}`
    const icon = document.createElement('span')
    icon.className = 'qa-icon'
    a.append(icon)
    const label = document.createElement('span')
    label.className = 'qa-label'
    label.textContent = meta.label
    a.append(label)
    if (meta.src) this._loadIcon(icon, meta.src)
    li.append(a)
    svgEditor.$click(a, (e) => {
      e.preventDefault()
      this._hide()
      runFavoriteTrigger(editor, id)
    })
    return li
  }

  /**
   * A value-control row hosting a live widget seeded from the selection.
   * @returns {HTMLLIElement}
   */
  _valueRow (editor, id, meta, disabled) {
    const li = document.createElement('li')
    li.className = 'qa-value'
    if (disabled) li.classList.add('disabled')
    const label = document.createElement('span')
    label.className = 'qa-vlabel'
    label.textContent = meta.label
    li.append(label)
    const ctrl = VALUE_CONTROLS[id]
    const widget = ctrl.create(editor)
    li.append(widget)
    widget.addEventListener('change', ctrl.onChange(editor))
    // Seed after the widget is connected so its shadow DOM / paintBox exist.
    requestAnimationFrame(() => {
      try {
        ctrl.seed(widget, editor)
      } catch (err) {
        console.error('Failed to seed favorite value control', id, err)
      }
    })
    return li
  }

  /**
   * Inject an inline icon (cached) into a row's icon slot.
   * @returns {Promise<void>}
   */
  async _loadIcon (host, src) {
    const url = `${svgEditor.configObj.curConfig.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      host.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      host.replaceChildren(img)
    }
  }
}

// Register
customElements.define('se-cmenu_canvas-dialog', SeCMenuDialog)
