// cmenuDialog.ts — Canvas quick-action menu (`se-cmenu_canvas-dialog`) — replaces the old static right-click menu
import cMenuDialogHTML from './cmenuDialog.html'
import { positionContextMenu } from './positionContextMenu.ts'
import { closestRoot, requireOwnerEditor } from '../domScope.ts'
import { syncDialogTheme } from '../themeUtil.ts'
import { fetchSvgEl } from '../components/svgIconLoader.ts'
import { loadFavorites } from '../favorites.ts'
import { formatHotkey } from '../Hotkeys.ts'
import {
  getFavoriteMeta,
  isValueControl,
  VALUE_CONTROLS,
  runFavoriteTrigger
} from '../favoriteActions.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import type { i18n } from 'i18next'

const template = document.createElement('template')
template.innerHTML = cMenuDialogHTML

// Actions that stay available with no selection; everything else is disabled
// when nothing is selected (mirrors the original context menu's behaviour).
const ALWAYS_ENABLED = new Set([
  'paste', 'paste_in_place', 'select_all', 'zoom_in', 'zoom_out', 'zoom_fit'
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
  _shadowRoot: ShadowRoot
  $dialog: HTMLUListElement
  i18next: i18n | null

  _workarea: HTMLElement | null
  _onKeydown: ((e: KeyboardEvent) => void) | undefined

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
    this.$dialog = (this._shadowRoot.querySelector('#cmenu_canvas') as HTMLUListElement)
    this.i18next = null
  }

  init (i18next: import('i18next').i18n): void {
    this.i18next = i18next
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    const current = this
    // Now attached: bind to this editor's own workarea (see domScope.js).
    const workarea = closestRoot(this).querySelector('[id="workarea"]') as HTMLElement
    this._workarea = workarea
    const onMenuOpenHandler = (e: MouseEvent) => {
      e.preventDefault()
      syncDialogTheme(current)
      current._build()
      positionContextMenu(current.$dialog, e.clientX, e.clientY)
    }
    const onMenuCloseHandler = (e: MouseEvent) => {
      // Right-clicks (button 2) reposition rather than close.
      if (e.button !== 2) current._hide()
    }
    workarea.addEventListener('contextmenu', onMenuOpenHandler)
    workarea.addEventListener('mousedown', onMenuCloseHandler)
    // Escape dismisses an open menu (capture, so it wins over other Escape handlers).
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && current.$dialog.style.display === 'block') {
        current._hide()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', this._onKeydown, true)
  }

  disconnectedCallback (): void {
    if (this._onKeydown) document.removeEventListener('keydown', this._onKeydown, true)
  }

  _hide (): void {
    this.$dialog.style.display = 'none'
  }

  /** Rebuild the menu contents from the user's favorites. */
  _build () {
    const editor = requireOwnerEditor(this)
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

  /** A one-shot trigger row (icon + label). */
  _triggerRow (editor: EditorInstance, id: string, meta: NonNullable<ReturnType<typeof getFavoriteMeta>>, disabled: boolean): HTMLLIElement {
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
    const key = editor.hotkeys.effectiveKeys(id)[0]
    if (key) {
      const sc = document.createElement('span')
      sc.className = 'qa-shortcut'
      sc.textContent = formatHotkey(key)
      a.append(sc)
    }
    if (meta.src) this._loadIcon(icon, meta.src)
    li.append(a)
    $click(a, (e) => {
      e.preventDefault()
      this._hide()
      runFavoriteTrigger(editor, id)
    })
    return li
  }

  /** A value-control row hosting a live widget seeded from the selection. */
  _valueRow (editor: EditorInstance, id: string, meta: NonNullable<ReturnType<typeof getFavoriteMeta>>, disabled: boolean): HTMLLIElement {
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
        logError(`Failed to seed favorite value control ${id}`, err, 'cmenuDialog')
      }
    })
    return li
  }

  /** Inject an inline icon (cached) into a row's icon slot. */
  async _loadIcon (host: HTMLElement, src: string): Promise<void> {
    const url = `${requireOwnerEditor(this).configObj.curConfig.imgPath}/${src}`
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
