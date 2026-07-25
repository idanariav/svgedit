import { getActiveRoot } from './domScope.js'

/**
 * Apply a named theme to the editor root element.
 *
 * Toggles `theme-light` / `theme-dark` classes on `.svg_editor`.
 * Hosts (e.g. obsidian-svgedit-plugin) can also toggle these classes directly
 * without going through the preference dialog.
 *
 * @param {string} theme - 'light' | 'dark'
 * @param {Element} [rootEl] - optional override; defaults to the active editor
 *   (or the first `.svg_editor` in the document if none is active yet)
 */
export const applyTheme = (theme, rootEl) => {
  const el = rootEl ?? getActiveRoot()
  if (!el) return
  const isDark = theme === 'dark'
  el.classList.toggle('theme-dark', isDark)
  el.classList.toggle('theme-light', !isDark)
}
