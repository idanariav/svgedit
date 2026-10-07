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

/**
 * The `.svg_editor` that owns `el`: found by walking up to its
 * `[data-svgedit-root]` container (across shadow-DOM boundaries), falling back
 * to the active editor's root for an element that isn't mounted in one (e.g. a
 * standalone alert appended to `document.body`).
 * @param {?Node} el
 * @returns {?Element}
 */
export const editorRootFor = (el) => {
  let node = el
  while (node) {
    const container = node.closest?.('[data-svgedit-root]')
    if (container) return container.querySelector('.svg_editor')
    node = node.getRootNode?.().host
  }
  return getActiveRoot()
}

/**
 * Mirror the owning editor's light/dark theme onto a dialog host as
 * `theme-dark` / `theme-light`. Dialogs are mounted beside `.svg_editor`, not
 * inside it, so they get their design tokens from the dialog-tag selectors in
 * `svgedit.css` (see `tests/unit/dialog-theme-tokens.test.js`); this class is
 * what picks the dark set. Call it each time the dialog opens, since the theme
 * can change between opens.
 * @param {Element} host - the dialog custom element
 * @returns {void}
 */
export const syncDialogTheme = (host) => {
  const isDark = !!editorRootFor(host)?.classList.contains('theme-dark')
  host.classList.toggle('theme-dark', isDark)
  host.classList.toggle('theme-light', !isDark)
}
