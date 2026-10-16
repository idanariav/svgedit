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

interface ElementLike { tagName: string, id?: string }

const isElementLike = (v: unknown): v is ElementLike =>
  typeof v === 'object' && v !== null && typeof (v as ElementLike).tagName === 'string'

/** `tag#id` of an element (or `tag` when it has no id); null for a non-element. */
export const describeElement = (el: unknown): string | null => {
  if (!isElementLike(el)) return null
  return el.id ? `${el.tagName}#${el.id}` : el.tagName
}

const MAX_STRING = 80

/**
 * A log-safe copy of a value: strings are cut to 80 characters and `data:` URIs
 * reduced to their size, arrays/objects are walked (depth-limited), elements are
 * described rather than serialised.
 */
export const redact = (value: unknown, depth = 3): unknown => {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return `data:…(${value.length} chars)`
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})` : value
  }
  if (value === null || typeof value !== 'object') return value
  if (isElementLike(value)) return describeElement(value)
  if (depth <= 0) return Array.isArray(value) ? `[${value.length} items]` : '{…}'
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth - 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, depth - 1)
  return out
}

/** What a mouse event did, without the event itself. */
export const describePointer = (evt: MouseEvent): { target: string | null, button: number, mods: string, client: number[] } => ({
  target: describeElement(evt.target),
  button: evt.button,
  mods: `${evt.shiftKey ? 'shift+' : ''}${evt.altKey ? 'alt+' : ''}${evt.ctrlKey ? 'ctrl+' : ''}${evt.metaKey ? 'meta+' : ''}`.replace(/\+$/, ''),
  client: [Math.round(evt.clientX), Math.round(evt.clientY)]
})
