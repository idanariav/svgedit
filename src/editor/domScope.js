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
 */
let activeEditor = null

/**
 * Mark an editor instance as the active one.
 * @param {object} editor
 * @returns {void}
 */
export const setActiveEditor = (editor) => { activeEditor = editor }

/**
 * Whether the given editor should handle a document-level shortcut: true if it
 * is the active editor, or if no editor has been activated yet.
 * @param {object} editor
 * @returns {boolean}
 */
export const isActiveEditor = (editor) => activeEditor === null || activeEditor === editor
