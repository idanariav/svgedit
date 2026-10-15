// @ts-check
/**
 * Helpers for the discrete debug-event channel (`svgCanvas.logDebugEvent`):
 * compact, privacy-safe descriptions of elements and input, so a host log can
 * be read — by a person or an LLM — as the sequence of things the user did.
 *
 * Nothing here records artwork content: elements are named `tag#id`, text
 * content is never read, and long / `data:` values are cut by {@link redact}.
 *
 * @module debug-events
 * @license MIT
 */

/**
 * `tag#id` of an element (or `tag` when it has no id); null for a non-element.
 * @param {any} el
 * @returns {?string}
 */
export const describeElement = (el) => {
  if (!el || typeof el.tagName !== 'string') return null
  return el.id ? `${el.tagName}#${el.id}` : el.tagName
}

const MAX_STRING = 80

/**
 * A log-safe copy of a value: strings are cut to 80 characters and `data:` URIs
 * reduced to their size, arrays/objects are walked (depth-limited), elements are
 * described rather than serialised.
 * @param {any} value
 * @param {number} [depth]
 * @returns {any}
 */
export const redact = (value, depth = 3) => {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return `data:…(${value.length} chars)`
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})` : value
  }
  if (value === null || typeof value !== 'object') return value
  if (typeof value.tagName === 'string') return describeElement(value)
  if (depth <= 0) return Array.isArray(value) ? `[${value.length} items]` : '{…}'
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth - 1))
  /** @type {Record<string, any>} */
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = redact(v, depth - 1)
  return out
}

/**
 * What a mouse event did, without the event itself.
 * @param {MouseEvent} evt
 * @returns {{target: ?string, button: number, mods: string, client: number[]}}
 */
export const describePointer = (evt) => ({
  target: describeElement(evt.target),
  button: evt.button,
  mods: `${evt.shiftKey ? 'shift+' : ''}${evt.altKey ? 'alt+' : ''}${evt.ctrlKey ? 'ctrl+' : ''}${evt.metaKey ? 'meta+' : ''}`.replace(/\+$/, ''),
  client: [Math.round(evt.clientX), Math.round(evt.clientY)]
})
