/**
 * Apply the editor UI mode (desktop vs. touch-first tablet shell).
 *
 * Toggles the `ui-tablet` class on `.svg_editor`. When the class is present the
 * desktop panels are hidden and the `.tablet-shell` command bar + sheet are
 * shown (see `tablet.css`). Mirrors `themeUtil.applyTheme` — this helper is the
 * single source of truth for the flip; persistence of the `tabletMode`
 * preference is the caller's responsibility (same split as the theme toggle).
 *
 * Hosts can also toggle the class directly without going through the menu.
 *
 * @param {boolean} on - `true` for tablet mode, `false` for desktop
 * @param {Element} [rootEl] - optional override; defaults to first `.svg_editor`
 */
export const applyUiMode = (on, rootEl) => {
  const el = rootEl ?? document.querySelector('.svg_editor')
  if (!el) return
  el.classList.toggle('ui-tablet', isTabletMode(on))
}

/**
 * Normalise a `tabletMode` value into a real boolean.
 *
 * The pref is persisted to `localStorage` as a string, so desktop mode comes
 * back as the string `'false'` — which is truthy under a plain `Boolean()`
 * cast. Both the startup apply and the menu toggle must read it through here so
 * a saved desktop choice survives a reload.
 *
 * @param {boolean|string} val - the stored or in-memory `tabletMode` value
 * @returns {boolean}
 */
export const isTabletMode = (val) => val === true || val === 'true'
