/**
 * favoriteActions.js — the catalog of favoritable actions and their execution.
 *
 * The right-click quick-action menu and the Favorites dialog are both thin views
 * over this catalog. It is a *superset* of the hotkey registry (see
 * `Hotkeys.js`):
 *   - every registered command is favoritable (trigger actions; paste / paste in
 *     place / zoom fit are now real commands in `coreCommands.js`), plus
 *   - `VALUE_CONTROLS` — stateful controls (stroke width, fill/stroke colour)
 *     that render as a live widget so the value is adjustable in place.
 *
 * Trigger actions execute through `editor.commands`, the same path hotkeys
 * and buttons use; value controls reuse the real panel handlers in `BottomPanel`.
 *
 * @module favoriteActions
 */
import { t } from './locale.js'
import { GROUP_ORDER } from './Hotkeys.js'

/**
 * Icons for actions that have no toolbar button of their own (keyboard-only
 * shortcuts and the paste/fit entries below), so every context-menu row has one.
 */
/** @type {Record<string, string>} */
const ACTION_ICONS = {
  paste: 'paste.svg',
  paste_in_place: 'paste_in_place.svg',
  select_all: 'select_all.svg',
  zoom_fit: 'zoom_fit.svg',
  zoom_in: 'zoom.svg',
  zoom_out: 'zoom_out.svg',
  copy: 'copy.svg',
  cut: 'cut.svg'
}

/**
 * @typedef {object} ValueControl a stateful control the quick-action menu renders as a live widget
 * @property {string} group
 * @property {string} labelKey
 * @property {string} src
 * @property {(editor?: EditorInstance) => HTMLElement} create a fresh widget
 * @property {(el: *, editor: EditorInstance) => void} seed set it from the selection
 * @property {(editor: EditorInstance) => EventListener} onChange the handler of its `change` event
 */

/**
 * Build a colour-picker value-control descriptor.
 * @param {('fill'|'stroke')} type
 * @param {string} labelKey
 * @param {string} src
 * @returns {ValueControl}
 */
const makeColorControl = (type, labelKey, src) => ({
  group: 'Style',
  labelKey,
  src,
  create: () => {
    const el = document.createElement('se-colorpicker')
    el.setAttribute('type', type)
    el.setAttribute('src', src)
    return el
  },
  seed: (/** @type {*} */ el, /** @type {EditorInstance} */ editor) => {
    el.init(editor.i18next)
    el.update(editor.svgCanvas, editor.selectedElement)
  },
  onChange: (/** @type {EditorInstance} */ editor) => (evt) => editor.bottomPanel.handleColorPicker(type, evt)
})

/**
 * Value controls — rendered as a live widget inside the quick-action menu. Each
 * `create`s a fresh instance (web components can't be cloned: their shadow DOM
 * and listeners don't survive `cloneNode`), `seed`s it from the current
 * selection, and routes its `change` through the same `BottomPanel` handler the
 * real panel control uses.
 */
/** @type {Record<string, ValueControl>} */
export const VALUE_CONTROLS = {
  stroke_width: {
    group: 'Style',
    labelKey: 'favorites.label_stroke_width',
    src: 'stroke-width.svg',
    create: () => {
      const el = document.createElement('se-spin-input')
      el.setAttribute('min', '0')
      el.setAttribute('max', '99')
      el.setAttribute('step', '1')
      el.setAttribute('src', 'stroke-width.svg')
      return el
    },
    seed: (/** @type {HTMLInputElement} */ el, /** @type {EditorInstance} */ editor) => {
      const sel = editor.selectedElement
      el.value = String((sel && sel.getAttribute('stroke-width')) || 1)
    },
    onChange: (/** @type {EditorInstance} */ editor) => (e) => editor.bottomPanel.changeStrokeWidth(e)
  },
  fill_color: makeColorControl('fill', 'favorites.label_fill_color', 'fill.svg'),
  stroke_color: makeColorControl('stroke', 'favorites.label_stroke_color', 'stroke.svg')
}

/** @param {string} id @returns {boolean} */
export const isValueControl = (id) =>
  Object.prototype.hasOwnProperty.call(VALUE_CONTROLS, id)

/**
 * Resolve display + render metadata for a favorite id, or null if unknown.
 * @param {EditorInstance} editor
 * @param {string} id
 * @returns {?{id:string, group:string, label:string, src:?string, kind:('trigger'|'value')}}
 */
export const getFavoriteMeta = (editor, id) => {
  const v = VALUE_CONTROLS[id]
  if (v) return { id, group: v.group, label: t(v.labelKey) || v.labelKey, src: v.src, kind: 'value' }
  const a = editor.commands.get(id)
  if (a) {
    return {
      id,
      group: a.group,
      label: editor.commands.labelFor(a),
      src: (a.el ? a.el.getAttribute('src') : null) ?? a.icon ?? ACTION_ICONS[id] ?? null,
      kind: 'trigger'
    }
  }
  return null
}

/**
 * Grouped, display-ready catalog of every favoritable action, for the Favorites
 * dialog. Merges the hotkey registry with the extra triggers and value
 * controls, ordered by `GROUP_ORDER` (unknown groups appended alphabetically).
 * @param {EditorInstance} editor
 * @returns {Array<{group:string, actions:Array<{id:string, label:string}>}>}
 */
export const buildFavoritesCatalog = (editor) => {
  /** @type {Map<string, Array<{id: string, label: string}>>} */
  const groups = new Map()
  const push = (/** @type {string} */ group, /** @type {{id: string, label: string}} */ entry) => {
    const list = groups.get(group) ?? []
    list.push(entry)
    groups.set(group, list)
  }
  for (const g of editor.hotkeys.listForUi()) {
    for (const a of g.actions) push(g.group, { id: a.id, label: a.label })
  }
  for (const [id, v] of Object.entries(VALUE_CONTROLS)) {
    push(v.group, { id, label: t(v.labelKey) || v.labelKey })
  }
  const ordered = [...groups.keys()].sort((x, y) => {
    const ix = GROUP_ORDER.indexOf(x); const iy = GROUP_ORDER.indexOf(y)
    if (ix === -1 && iy === -1) return x.localeCompare(y)
    if (ix === -1) return 1
    if (iy === -1) return -1
    return ix - iy
  })
  return ordered.map((group) => ({
    group,
    actions: (groups.get(group) ?? []).sort((a, b) => a.label.localeCompare(b.label))
  }))
}

/**
 * Execute a trigger favorite through the command registry (the same path
 * hotkeys and buttons use). A disabled or unknown command is a no-op.
 * @param {EditorInstance} editor
 * @param {string} id
 * @returns {void}
 */
export const runFavoriteTrigger = (editor, id) => {
  editor.commands.tryRun(id, {}, 'favorites')
}
