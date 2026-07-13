/**
 * pasteClipboardText.js — shared parsing rule for pasted clipboard text.
 *
 * Both the native `paste` DOM event handler and the keydown fallback (see
 * pasteFallbackArmer.js) need to tell apart svgedit's own internal clipboard
 * payload (JSON mirrored onto the system clipboard by `copySelectedElements`)
 * from an external SVG document (e.g. "Copy as SVG" from another app). This
 * module is the single place that classification happens so the two paths
 * can't drift apart.
 *
 * @module pasteClipboardText
 */

/**
 * @param {string|null|undefined} text
 * @returns {{type: 'internal', data: object[]}|{type: 'external-svg'}|null}
 *   `null` when `text` isn't recognized as either kind of pasteable content.
 */
export const classifyClipboardText = (text) => {
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return { type: 'internal', data: parsed }
  } catch { /* not internal JSON, fall through */ }
  if (/<svg[\s\S]*<\/svg>/i.test(text)) return { type: 'external-svg' }
  return null
}
