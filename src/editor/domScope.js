/**
 * Resolve the editor container that owns a given element.
 *
 * svgedit's chrome uses fixed element IDs (workarea, fill_color, the se-*
 * dialogs, …), so a global `getElementById`/`querySelector` returns the first
 * match when several editors share one document. The editor tags its container
 * with `data-svgedit-root` (see EditorStartup constructor); web components and
 * dialogs — which hold no editor reference — call this to walk up to their own
 * container and keep light-DOM lookups within the owning editor.
 *
 * Falls back to the whole document for standalone (single-editor) use.
 * @param {Element} el A component/dialog element somewhere inside an editor.
 * @returns {Element|Document}
 */
export const closestRoot = (el) => el?.closest?.('[data-svgedit-root]') ?? document

/**
 * Track which editor instance is "active" (last interacted with), so
 * document-level keyboard shortcut / paste handlers — which every mounted
 * editor registers — only fire for the focused editor. Until any editor is
 * interacted with, no editor is active and all are allowed (single-editor case).
 *
 * This is a fallback signal only — see `isActiveEditor()` below, which prefers
 * live DOM focus when it's available and only consults this cached pointer
 * when nothing is currently focused inside any editor.
 */
let activeEditor = null

/**
 * Mark an editor instance as the active one.
 * @param {object} editor
 * @returns {void}
 */
export const setActiveEditor = (editor) => { activeEditor = editor }

/**
 * Clear the active editor, but only if `editor` is the one currently active.
 * Use this on destroy instead of `setActiveEditor(null)`: with 3+ editors
 * mounted, unconditionally nulling out the active editor on destroy would
 * make every remaining editor pass `isActiveEditor` (which treats `null` as
 * "unclaimed, all editors allowed") until the next interaction — a
 * background editor that was never focused would start handling shortcuts.
 * @param {object} editor
 * @returns {void}
 */
export const clearActiveEditor = (editor) => {
  if (activeEditor === editor) activeEditor = null
}

/**
 * Whether the given editor should handle a document-level shortcut: true if it
 * is the active editor, or if no editor has been activated yet.
 *
 * Live focus is checked first: if `document.activeElement` currently sits
 * inside some editor's container, that's authoritative and the answer is
 * decided right there, regardless of `activeEditor`. The cached pointer above
 * is only set on pointerdown/focusin *within* a container (see EditorStartup's
 * `activate()`), so it can go stale — e.g. a host that moves focus into a
 * different editor by other means (switching panes/leaves without a click
 * landing inside the target container, a background instance that was never
 * torn down cleanly and squats the pointer) would otherwise leave document
 * shortcuts/paste targeting the wrong instance until the intended editor's
 * container is clicked/focused again. `activeEditor` is only consulted when
 * nothing is focused inside *any* editor (e.g. focus sits on `document.body`,
 * the common case right after a plain click on the canvas).
 * @param {object} editor
 * @returns {boolean}
 */
export const isActiveEditor = (editor) => {
  const focusedRoot = closestRoot(document.activeElement)
  if (focusedRoot !== document) return focusedRoot === editor?.$container
  return activeEditor === null || activeEditor === editor
}

/**
 * Resolve the `.svg_editor` root of the currently active editor, for helpers
 * that operate on "the" editor when no explicit instance is given (see
 * `themeUtil.applyTheme` / `uiMode.applyUiMode`). With 2+ editors mounted, a
 * bare `document.querySelector('.svg_editor')` always resolves to the first
 * one in DOM order regardless of which the caller meant; routing through the
 * same `activeEditor` pointer the rest of this module uses keeps that default
 * consistent with which editor last had focus. Falls back to the first
 * `.svg_editor` in the document for the single-editor/no-interaction-yet case.
 * @returns {Element|null}
 */
export const getActiveRoot = () => activeEditor?.$container?.querySelector('.svg_editor') ?? document.querySelector('.svg_editor')
