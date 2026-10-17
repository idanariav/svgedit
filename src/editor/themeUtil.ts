// themeUtil.ts — `applyTheme(theme, rootEl)` — canonical theme helper
import { getActiveRoot } from './domScope.ts'

/**
 * Apply a named theme to the editor root element.
 * Toggles `theme-light` / `theme-dark` classes on `.svg_editor`.
 * Hosts (e.g. obsidian-svgedit-plugin) can also toggle these classes directly
 * without going through the preference dialog.
 * @param theme - 'light' | 'dark'
 * @param rootEl - optional override; defaults to the active editor
(or the first `.svg_editor` in the document if none is active yet)
 */
export const applyTheme = (theme: string, rootEl?: Element) => {
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
 */
export const editorRootFor = (el: Node | null): Element | null => {
  let node = el
  while (node) {
    const container = (node as Element).closest?.('[data-svgedit-root]')
    if (container) return container.querySelector('.svg_editor')
    node = (node.getRootNode?.() as ShadowRoot).host
  }
  return getActiveRoot()
}

/** Design tokens (see CLAUDE.md "Theming conventions") a dialog inherits from its editor. */
export const DIALOG_TOKENS = [
  '--ui-font', '--fg', '--muted', '--icon', '--icon-hover', '--icon-hover-bg', '--icon-active-bg',
  '--accent', '--accent-soft', '--accent-border', '--chrome-bg', '--chrome-border',
  '--field-bg', '--field-border', '--group-bg', '--group-border', '--canvas-bg'
]

/**
 * Mirror the owning editor's light/dark theme onto a dialog host as
 * `theme-dark` / `theme-light`. Dialogs are mounted beside `.svg_editor`, not
 * inside it, so they get their design tokens from the dialog-tag selectors in
 * `svgedit.css` (see `tests/unit/dialog-theme-tokens.test.js`); this class is
 * what picks the dark set. Call it each time the dialog opens, since the theme
 * can change between opens.
 * @param host - the dialog custom element
 */
export const syncDialogTheme = (host: Element): void => {
  const root = editorRootFor(host)
  const isDark = !!root?.classList.contains('theme-dark')
  host.classList.toggle('theme-dark', isDark)
  host.classList.toggle('theme-light', !isDark)
  // A host that overrides tokens on `.svg_editor` (inline or via a stylesheet rule)
  // can't reach a dialog that sits outside it, so carry the resolved values across.
  if (root) {
    const computed = getComputedStyle(root)
    for (const token of DIALOG_TOKENS) {
      const value = computed.getPropertyValue(token).trim()
      if (value) (host as HTMLElement).style.setProperty(token, value)
    }
  }
}
