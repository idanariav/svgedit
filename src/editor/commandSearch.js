/**
 * commandSearch.js — data + activation logic for the Command Search popup.
 *
 * Reuses the existing favoritable-action catalog (`favoriteActions.js`,
 * itself a superset of the hotkey registry) rather than building a second
 * one. The only new piece here is *activation*: a plain trigger action
 * (button/menu item) is run in place, but a "value control" (stroke width,
 * fill/stroke colour) is *revealed* instead — switching the Right Panel to
 * whichever tab hosts it (auto-detected via the closest `.sidepanel_tabpanel`
 * ancestor, so no per-setting tab map needs to be maintained), then either
 * opening its picker dialog (fill/stroke colour) or scrolling/focusing/
 * flashing the field in place (stroke width).
 *
 * @module commandSearch
 */
import { buildFavoritesCatalog, isValueControl, runFavoriteTrigger } from './favoriteActions.js'

/** Value controls whose "reveal" is opening a colour picker dialog directly. */
const COLOR_VALUE_CONTROLS = new Set(['fill_color', 'stroke_color'])

const FLASH_CLASS = 'cmd-search-flash'
const FLASH_DURATION_MS = 900

/**
 * Grouped, display-ready catalog of every searchable command, for the
 * Command Search popup. Thin wrapper over `buildFavoritesCatalog` so this
 * module owns its own seam (e.g. future filtering) without coupling callers
 * directly to the favorites module.
 * @param {object} editor
 * @returns {Array<{group:string, actions:Array<{id:string, label:string}>}>}
 */
export const buildCommandSearchCatalog = (editor) => buildFavoritesCatalog(editor)

/**
 * Match rank of a label for a query: 0 = label starts with it, 1 = a word in
 * the label starts with it, 2 = substring anywhere, null = no match.
 * @param {string} label
 * @param {string} q lower-cased, trimmed query
 * @returns {?number}
 */
const rankLabel = (label, q) => {
  const l = label.toLowerCase()
  if (l.startsWith(q)) return 0
  if (l.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1
  return l.includes(q) ? 2 : null
}

/**
 * Filter + rank a catalog for a query. Within a group, exact-prefix matches
 * come first, then word-start, then substring; groups are ordered by their
 * best match. An empty query returns the catalog unchanged.
 * @param {Array<{group:string, actions:Array<{id:string, label:string}>}>} catalog
 * @param {string} query
 * @returns {Array<{group:string, actions:Array<{id:string, label:string}>}>}
 */
export const filterCommandCatalog = (catalog, query) => {
  const q = query.trim().toLowerCase()
  if (!q) return catalog
  return catalog
    .map((g, order) => {
      const ranked = g.actions
        .map((a, i) => ({ a, r: rankLabel(a.label, q), i }))
        .filter((x) => x.r !== null)
        .sort((x, y) => x.r - y.r || x.i - y.i)
      return { group: g.group, actions: ranked.map((x) => x.a), best: ranked[0]?.r ?? 3, order }
    })
    .filter((g) => g.actions.length)
    .sort((x, y) => x.best - y.best || x.order - y.order)
    .map(({ group, actions }) => ({ group, actions }))
}

/**
 * Scroll a field into view, briefly flash-highlight it, and focus it.
 * @param {?Element} el
 * @returns {void}
 */
const revealField = (el) => {
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add(FLASH_CLASS)
  setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_DURATION_MS)
  el.focus?.()
}

/**
 * Activate a Command Search result: reveal the Right Panel tab that hosts
 * the target element (if any), then either run the action (trigger) or
 * reveal the setting (value control).
 * @param {object} editor
 * @param {string} id
 * @returns {void}
 */
export const activateCommandSearchResult = (editor, id) => {
  // Scoped to the editor's own container (editor.$id), not a global
  // getElementById: svgedit's chrome ids repeat across every open editor
  // instance, so a global lookup could resolve to another pane's element.
  const el = editor.$id(id) ?? editor.hotkeys.getAction(id)?.el
  const tabPanel = el?.closest?.('.sidepanel_tabpanel')
  if (tabPanel) {
    editor.rightPanel.toggleSidePanel(true)
    editor.rightPanel.activateTab(tabPanel.id.replace('tab_', ''))
  }

  if (isValueControl(id)) {
    if (COLOR_VALUE_CONTROLS.has(id)) {
      editor.$id(id)?.openColorDialog()
    } else {
      revealField(editor.$id(id))
    }
    return
  }

  runFavoriteTrigger(editor, id)
}
