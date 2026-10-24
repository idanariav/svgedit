// uiMode.ts — `applyUiMode(mode, rootEl)` — sets the `ui-tablet` / `ui-mobile` class on `.svg_editor` (desktop ⇄ tablet shell ⇄ mobile shell)
import { getActiveRoot } from './domScope.ts'

/** The editor's UI shell: the desktop panels, the touch-first tablet shell or the minimal mobile shell. */
export type UiMode = 'desktop' | 'tablet' | 'mobile'

/**
 * Normalise a `uiMode` value into a `UiMode`.
 * Also reads the legacy boolean `tabletMode` (`true` / `'true'` → `'tablet'`):
 * prefs come back from `localStorage` as strings, and hosts still pass
 * `tabletMode`. Anything else is desktop.
 * @param val - the stored or in-memory `uiMode` (or legacy `tabletMode`) value
 */
export const toUiMode = (val: unknown): UiMode => {
  if (val === 'tablet' || val === 'mobile') return val
  return val === true || val === 'true' ? 'tablet' : 'desktop'
}

/**
 * Apply the editor UI mode.
 * Sets `ui-tablet` or `ui-mobile` on `.svg_editor` (neither for desktop). With a
 * class present the desktop panels are hidden and that shell is shown (see
 * `tablet.css`, `mobile.css`). Mirrors `themeUtil.applyTheme` — this helper is
 * the single source of truth for the flip; persistence of the `uiMode`
 * preference is the caller's responsibility (same split as the theme toggle).
 * Hosts can also toggle the class directly without going through the menu.
 * @param mode - a `UiMode`, or a legacy `tabletMode` boolean (see `toUiMode`)
 * @param rootEl - optional override; defaults to the active editor
(or the first `.svg_editor` in the document if none is active yet)
 */
export const applyUiMode = (mode: unknown, rootEl?: Element) => {
  const el = rootEl ?? getActiveRoot()
  if (!el) return
  const m = toUiMode(mode)
  el.classList.toggle('ui-tablet', m === 'tablet')
  el.classList.toggle('ui-mobile', m === 'mobile')
}
