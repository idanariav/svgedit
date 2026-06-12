/**
 * favoriteActions.js — the catalog of favoritable actions and their execution.
 *
 * The right-click quick-action menu and the Favorites dialog are both thin views
 * over this catalog. It is a *superset* of the hotkey registry (see
 * `Hotkeys.js`):
 *   - every registered hotkey action is favoritable (trigger actions), plus
 *   - `EXTRA_TRIGGERS` — context-menu staples the registry lacks (paste), plus
 *   - `VALUE_CONTROLS` — stateful controls (stroke width, fill/stroke colour)
 *     that render as a live widget so the value is adjustable in place.
 *
 * Trigger actions execute through the same path hotkeys use (`run()` /
 * `el.click()`); value controls reuse the real panel handlers in `BottomPanel`.
 *
 * @module favoriteActions
 */
import { t } from './locale.js'
import { GROUP_ORDER } from './Hotkeys.js'

/**
 * Catalog-only trigger actions the hotkey registry does not contain (the canvas
 * context menu historically owned paste, which has no toolbar button).
 */
const EXTRA_TRIGGERS = {
  paste: {
    group: 'Edit',
    labelKey: 'tools.paste',
    exec: (editor) => editor.svgCanvas.pasteElements()
  },
  paste_in_place: {
    group: 'Edit',
    labelKey: 'tools.paste_in_place',
    exec: (editor) => editor.svgCanvas.pasteElements('in_place')
  }
}

/**
 * Build a colour-picker value-control descriptor.
 * @param {('fill'|'stroke')} type
 * @param {string} labelKey
 * @param {string} src
 * @returns {object}
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
  seed: (el, editor) => {
    el.init(editor.i18next)
    el.update(editor.svgCanvas, editor.selectedElement)
  },
  onChange: (editor) => (evt) => editor.bottomPanel.handleColorPicker(type, evt)
})

/**
 * Value controls — rendered as a live widget inside the quick-action menu. Each
 * `create`s a fresh instance (web components can't be cloned: their shadow DOM
 * and listeners don't survive `cloneNode`), `seed`s it from the current
 * selection, and routes its `change` through the same `BottomPanel` handler the
 * real panel control uses.
 */
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
    seed: (el, editor) => {
      const sel = editor.selectedElement
      el.value = (sel && sel.getAttribute('stroke-width')) || 1
    },
    onChange: (editor) => (e) => editor.bottomPanel.changeStrokeWidth(e)
  },
  fill_color: makeColorControl('fill', 'favorites.label_fill_color', 'fill.svg'),
  stroke_color: makeColorControl('stroke', 'favorites.label_stroke_color', 'stroke.svg')
}

/** @param {string} id @returns {boolean} */
export const isValueControl = (id) =>
  Object.prototype.hasOwnProperty.call(VALUE_CONTROLS, id)

/**
 * Resolve display + render metadata for a favorite id, or null if unknown.
 * @param {object} editor
 * @param {string} id
 * @returns {?{id:string, group:string, label:string, src:?string, kind:('trigger'|'value')}}
 */
export const getFavoriteMeta = (editor, id) => {
  const v = VALUE_CONTROLS[id]
  if (v) return { id, group: v.group, label: t(v.labelKey) || v.labelKey, src: v.src, kind: 'value' }
  const x = EXTRA_TRIGGERS[id]
  if (x) return { id, group: x.group, label: t(x.labelKey) || x.labelKey, src: null, kind: 'trigger' }
  const a = editor.hotkeys.getAction(id)
  if (a) {
    return {
      id,
      group: a.group,
      label: editor.hotkeys.labelFor(a),
      src: a.el ? a.el.getAttribute('src') : null,
      kind: 'trigger'
    }
  }
  return null
}

/**
 * Grouped, display-ready catalog of every favoritable action, for the Favorites
 * dialog. Merges the hotkey registry with the extra triggers and value
 * controls, ordered by `GROUP_ORDER` (unknown groups appended alphabetically).
 * @param {object} editor
 * @returns {Array<{group:string, actions:Array<{id:string, label:string}>}>}
 */
export const buildFavoritesCatalog = (editor) => {
  const groups = new Map()
  const push = (group, entry) => {
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(entry)
  }
  for (const g of editor.hotkeys.listForUi()) {
    for (const a of g.actions) push(g.group, { id: a.id, label: a.label })
  }
  for (const [id, x] of Object.entries(EXTRA_TRIGGERS)) {
    push(x.group, { id, label: t(x.labelKey) || x.labelKey })
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
    actions: groups.get(group).sort((a, b) => a.label.localeCompare(b.label))
  }))
}

/**
 * Execute a trigger favorite, reusing the same dispatch hotkeys use.
 * @param {object} editor
 * @param {string} id
 * @returns {void}
 */
export const runFavoriteTrigger = (editor, id) => {
  const x = EXTRA_TRIGGERS[id]
  if (x) { x.exec(editor); return }
  const a = editor.hotkeys.getAction(id)
  if (!a) return
  if (a.run) a.run()
  else if (a.el) a.el.click()
}
