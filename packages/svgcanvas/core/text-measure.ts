/**
 * The renderer's half of the text-metrics cache: measure the `<text>` elements of a drawing the DOM is showing and record
 * their boxes against the model elements that describe them (`model/text-metrics.ts`).
 *
 * The browser is the only text layout engine here, so a text's box is measured once per model element (and inherited style)
 * after the step that made it lands; every later question about it is answered from the cache, and from the estimate when the
 * DOM is not there to ask (the headless engine).
 * @module text-measure
 * @license MIT
 */
import { getBBox } from './bbox-utils.ts'
import { resolveTextStyle, textsIn } from './model/text-metrics.ts'
import type { TextMetricsCache } from './model/text-metrics.ts'
import type { ModelElement } from './model/node.ts'

/**
 * Measure every text of `model` the cache has no box for, in `content` (the DOM showing `model`).
 * @returns how many were measured
 */
export const measureTexts = (content: Element, model: ModelElement, cache: TextMetricsCache): number => {
  const byId = new Map<string, Element>()
  for (const t of Array.from(content.querySelectorAll('text'))) if (t.id) byId.set(t.id, t)
  let measured = 0
  for (const { el, chain } of textsIn(model)) {
    const style = resolveTextStyle(chain)
    if (cache.get(el, style)) continue
    const id = el.attrs.find((a) => a.name === 'id')?.value
    const dom = id ? byId.get(id) : undefined
    // an empty text has no box worth measuring, and `getBBox` (bbox-utils) would empty its children to measure one
    if (!dom || dom.textContent === '') continue
    const box = getBBox(dom)
    if (!box) continue
    cache.put(el, style, { x: box.x, y: box.y, width: box.width, height: box.height })
    measured++
  }
  return measured
}
