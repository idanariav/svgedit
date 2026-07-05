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
  const el = document.getElementById(id) ?? editor.hotkeys.getAction(id)?.el
  const tabPanel = el?.closest?.('.sidepanel_tabpanel')
  if (tabPanel) {
    editor.rightPanel.toggleSidePanel(true)
    editor.rightPanel.activateTab(tabPanel.id.replace('tab_', ''))
  }

  if (isValueControl(id)) {
    if (COLOR_VALUE_CONTROLS.has(id)) {
      document.getElementById(id)?.openColorDialog()
    } else {
      revealField(document.getElementById(id))
    }
    return
  }

  runFavoriteTrigger(editor, id)
}
