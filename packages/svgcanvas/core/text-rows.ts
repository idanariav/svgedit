/**
 * How a `<text>` element's rows are stored, read and laid out.
 *
 * SVG has no newline, so multiline text is one absolutely positioned `<tspan>`
 * per row, all sharing the text's `x` (so `text-anchor` aligns the rows) and
 * stepping `y` by the line height. The edit buffer, the undo history and the
 * panels see the content as one `\n`-joined string.
 *
 * **Area text** (`se:wrap-width` on the `<text>`) adds soft line breaks. The
 * box is stored as attributes next to the usual `x` / `y`:
 *  - `se:wrap-width` — the box width (its presence is what makes the text "area");
 *  - `se:wrap-height` — optional box height, used for vertical alignment and the selection box;
 *  - `se:valign` — `top` (default) | `middle` | `bottom` inside that height.
 * `x` is the anchor x (`text-anchor`) and `y` the first row's baseline, as for any text, so
 * moves, nudges and the position fields keep working; the box's left edge is
 * `x − anchorFactor × width` and its top is `y − TEXT_ASCENT × font-size`.
 * The user's own newlines are hard breaks; the rows the wrapping adds carry
 * `se:soft="<n>"` on their `<tspan>` (n = spaces the break swallowed, 0 inside a
 * word), are recomputed on every layout and are *not* part of the content string.
 * The output is plain SVG text with tspans, so it renders anywhere.
 * @module text-rows
 * @license MIT
 */

import { NS } from './namespaces.ts'
import { wrapText } from './text-wrap.ts'
import type { WrappedRow } from './text-wrap.ts'

/** Multiplier applied to font-size to derive the row step for multiline text. */
export const TEXT_LINE_HEIGHT = 1.2

/** Distance from a row's baseline up to its top, as a fraction of the font size (the caret uses it too). */
export const TEXT_ASCENT = 0.8

export const WRAP_WIDTH_ATTR = 'se:wrap-width'
export const WRAP_HEIGHT_ATTR = 'se:wrap-height'
export const VALIGN_ATTR = 'se:valign'
export const SOFT_ATTR = 'se:soft'

/** Attributes whose change means the rows of an area text must be laid out again. */
export const LAYOUT_ATTRS = new Set([
  'font-size', 'font-family', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing',
  'text-anchor', 'x', 'y', 'style', 'xml:space', WRAP_WIDTH_ATTR, WRAP_HEIGHT_ATTR, VALIGN_ATTR
])

const ANCHOR_FACTOR: Record<string, number> = { start: 0, middle: 0.5, end: 1 }

/** @param name Local name in the `se:` namespace */
const getSe = (elem: Element, name: string): string | null => elem.getAttributeNS(NS.SE, name) ?? elem.getAttribute(`se:${name}`)

const hasTextPath = (elem: Element): boolean => elem.getElementsByTagName('textPath').length > 0

/** Box width of an area text, 0 for point text. */
export const getWrapWidth = (elem: Element): number => {
  const w = parseFloat(getSe(elem, 'wrap-width') ?? '')
  return w > 0 ? w : 0
}

/** Whether `elem` is a `<text>` that wraps to a box (text on a path never does). */
export const isAreaText = (elem: Element | null | undefined): boolean =>
  !!elem && elem.localName === 'text' && getWrapWidth(elem) > 0 && !hasTextPath(elem)

/** @returns Box height, 0 when the box grows with its content */
export const getWrapHeight = (elem: Element): number => {
  const h = parseFloat(getSe(elem, 'wrap-height') ?? '')
  return h > 0 ? h : 0
}

export const getValign = (elem: Element): 'top' | 'middle' | 'bottom' => {
  const v = getSe(elem, 'valign')
  return v === 'middle' || v === 'bottom' ? v : 'top'
}

const fontSizeOf = (elem: Element, fallback = 16): number => parseFloat(elem.getAttribute('font-size') ?? '') || fallback

/** @returns 0 / 0.5 / 1 for start / middle / end */
export const anchorFactor = (elem: Element): number => ANCHOR_FACTOR[elem.getAttribute('text-anchor') ?? 'start'] ?? 0

export const rowsOf = (elem: Element): Element[] => Array.from(elem.children).filter((c) => c.tagName === 'tspan')

/** Separator characters a soft row swallowed, or null for a row that starts a paragraph. */
export const softCount = (tspan: Element): number | null => {
  const raw = getSe(tspan, 'soft')
  if (raw === null) return null
  const n = parseInt(raw, 10)
  return n >= 0 ? n : 0
}

/**
 * Read a `<text>` element's content as a newline-joined string. Multiline text
 * is stored as one `<tspan>` per row (SVG has no newline character), so this
 * reconstructs the `\n`-separated value used by the edit buffer and undo
 * history. The soft rows of an area text are joined back with the spaces their
 * break swallowed, not with a newline. A single-line `<text>` (no tspans) falls
 * back to plain `textContent`.
 * @param elem - The `<text>` element
 */
export const getTextWithNewlines = (elem: Element): string => {
  if (!elem) { return '' }
  const tspans = rowsOf(elem)
  if (!tspans.length) { return elem.textContent ?? '' }
  const area = isAreaText(elem)
  let out = ''
  tspans.forEach((t, i) => {
    if (i > 0) {
      const soft = area ? softCount(t) : null
      out += soft === null ? '\n' : ' '.repeat(soft)
    }
    out += t.textContent
  })
  return out
}

/** The outermost `<svg>` above `elem`, where a measuring probe can live. */
const outerSvg = (elem: Element): SVGSVGElement | null => {
  let svg = (elem as SVGElement).ownerSVGElement ?? null
  while (svg?.ownerSVGElement) svg = svg.ownerSVGElement
  return svg
}

const PROBE_STYLES = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch',
  'letter-spacing', 'word-spacing'
]

/**
 * Run `fn` with a function that returns a string's rendered width in `elem`'s
 * font. In a browser a hidden `<text>` probe with the element's computed font
 * is attached for the duration (so letter/word spacing and kerning count); where
 * SVG text metrics do not exist (jsdom) a character-count estimate is used.
 */
export const withMeasure = <T>(elem: Element, fn: (measure: (s: string) => number) => T): T => {
  const svg = outerSvg(elem)
  const probe = svg ? document.createElementNS(NS.SVG, 'text') as SVGTextContentElement : null
  if (svg && probe && typeof probe.getComputedTextLength === 'function') {
    const computed = window.getComputedStyle(elem)
    probe.setAttribute('xml:space', 'preserve')
    probe.setAttribute('visibility', 'hidden')
    probe.setAttribute('data-se-ephemeral', 'true')
    for (const prop of PROBE_STYLES) {
      const value = computed.getPropertyValue(prop)
      if (value) probe.style.setProperty(prop, value)
    }
    svg.append(probe)
    try {
      return fn((s) => {
        probe.textContent = s
        return probe.getComputedTextLength()
      })
    } finally {
      probe.remove()
    }
  }
  const size = fontSizeOf(elem)
  return fn((s) => Array.from(s).length * size * 0.55)
}

interface PlannedRow {
  text: string
  soft: number | null
  x: number
  y: number
}

/** The rows an area text should show for `value`: wrapped to the box, each with its position. */
const planArea = (elem: Element, value: string, fontSizeFallback: number): PlannedRow[] => {
  if (value === '') { return [] }
  const width = getWrapWidth(elem)
  const rows: WrappedRow[] = withMeasure(elem, (measure) => wrapText(value, width, measure))
  const x = parseFloat(elem.getAttribute('x') ?? '') || 0
  const baseY = parseFloat(elem.getAttribute('y') ?? '') || 0
  const lineHeight = fontSizeOf(elem, fontSizeFallback) * TEXT_LINE_HEIGHT
  const free = Math.max(0, getWrapHeight(elem) - rows.length * lineHeight)
  const valign = getValign(elem)
  const offset = valign === 'middle' ? free / 2 : valign === 'bottom' ? free : 0
  return rows.map((row, i) => ({ text: row.text, soft: row.soft, x, y: baseY + offset + i * lineHeight }))
}

/**
 * Write a `\n`-separated string onto an area text: wrap it to the box, then one
 * tspan per row. Rows are reused in order, so their ids survive a re-wrap.
 */
const layoutArea = (elem: Element, value: string, fontSizeFallback: number): void => {
  const plan = planArea(elem, value, fontSizeFallback)
  if (!plan.length) {
    elem.textContent = ''
    return
  }
  const existing = rowsOf(elem)
  Array.from(elem.childNodes).filter((n) => !existing.includes(n as Element)).forEach((n) => n.remove())
  plan.forEach((row, i) => {
    const tspan = existing[i] ?? document.createElementNS(NS.SVG, 'tspan')
    tspan.setAttribute('x', String(row.x))
    tspan.setAttribute('y', String(row.y))
    writeAreaAttrs(tspan, { [SOFT_ATTR]: row.soft })
    tspan.textContent = row.text
    if (!tspan.parentNode) elem.append(tspan)
  })
  existing.slice(plan.length).forEach((t) => t.remove())
}

/**
 * Render a `\n`-separated string onto a `<text>` element. A single line is set
 * as plain `textContent` (no tspans); multiple lines become one absolutely
 * positioned `<tspan>` per row sharing the text's `x` (so `text-anchor` aligns
 * them) and stepping `y` by the line height. Absolute `y` per row (rather than
 * `dy` accumulation) is robust to blank rows and is what `recalculate` bakes.
 * An area text is wrapped to its box first (and always gets tspans).
 * @param elem - The `<text>` element
 * @param value - The new content, rows separated by `\n`
 * @param fontSizeFallback - Used when the element has no font-size
 */
export const setMultilineText = (elem: Element, value: string | null | undefined, fontSizeFallback = 16): void => {
  const val = value === null || value === undefined ? '' : String(value)
  if (isAreaText(elem)) {
    layoutArea(elem, val, fontSizeFallback)
    return
  }
  const lines = val.split('\n')
  if (lines.length <= 1) {
    // Single row — plain text node (also clears any existing tspans)
    elem.textContent = val
    return
  }
  const x = parseFloat(elem.getAttribute('x') ?? '') || 0
  const baseY = parseFloat(elem.getAttribute('y') ?? '') || 0
  const lineHeight = fontSizeOf(elem, fontSizeFallback) * TEXT_LINE_HEIGHT
  elem.textContent = '' // remove all existing children
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(NS.SVG, 'tspan')
    tspan.setAttribute('x', String(x))
    tspan.setAttribute('y', String(baseY + i * lineHeight))
    tspan.textContent = line
    elem.append(tspan)
  })
}

/**
 * Lay an area text out again from its current attributes (box, font, anchor,
 * position), keeping its content. Does nothing for other elements.
 * @returns Whether `elem` was an area text
 */
export const reflowAreaText = (elem: Element): boolean => {
  if (!isAreaText(elem)) { return false }
  setMultilineText(elem, getTextWithNewlines(elem))
  return true
}

/**
 * Lay an area text out again only if its rows are not what its attributes and content call for. Undo and
 * redo use it: a restored text already has the right rows (and its tspans may belong to a recorded command, so
 * they must not be touched), while a restored *attribute* (font, width, …) leaves the old rows behind.
 * @returns Whether the rows were rewritten
 */
export const settleAreaText = (elem: Element): boolean => {
  if (!isAreaText(elem)) { return false }
  const plan = planArea(elem, getTextWithNewlines(elem), 16)
  const current = rowsOf(elem)
  const same = plan.length === current.length && plan.every((row, i) => {
    const t = current[i]
    return t.textContent === row.text && softCount(t) === row.soft &&
      Math.abs(Number(t.getAttribute('x')) - row.x) < 1e-6 && Math.abs(Number(t.getAttribute('y')) - row.y) < 1e-6
  })
  if (same) { return false }
  setMultilineText(elem, getTextWithNewlines(elem))
  return true
}

export interface AreaBox {
  /** Left edge */
  x: number
  /** Top edge */
  y: number
  width: number
  height: number
}

/**
 * The box of an area text in its own coordinates. Without `se:wrap-height` the
 * height is the content's (its rows × the line height).
 */
export const getAreaBox = (elem: Element): AreaBox => {
  const width = getWrapWidth(elem)
  const size = fontSizeOf(elem)
  const x = parseFloat(elem.getAttribute('x') ?? '') || 0
  const y = parseFloat(elem.getAttribute('y') ?? '') || 0
  const rowCount = Math.max(1, rowsOf(elem).length)
  return {
    x: x - anchorFactor(elem) * width,
    y: y - TEXT_ASCENT * size,
    width,
    height: getWrapHeight(elem) || rowCount * size * TEXT_LINE_HEIGHT
  }
}

/**
 * The topmost area text under a screen point, hit on its *box* rather than its glyphs (so the empty part of a
 * box is clickable). The point is mapped into each text's own coordinates, so zoom and transforms are handled.
 * @param root where to look (the drawing's content)
 */
export const areaTextAtPoint = (root: ParentNode, clientX: number, clientY: number): SVGTextElement | null => {
  const texts = Array.from(root.querySelectorAll('text')).filter(isAreaText)
  for (let i = texts.length - 1; i >= 0; i--) {
    const text = texts[i]
    if (text.checkVisibility?.() === false) continue // display:none on it or an ancestor (hidden layer)
    const ctm = text.getScreenCTM?.()
    if (!ctm) continue
    const local = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    const box = getAreaBox(text)
    if (local.x >= box.x && local.x <= box.x + box.width && local.y >= box.y && local.y <= box.y + box.height) return text
  }
  return null
}

/**
 * The attributes that put an area text's box at `box` for the given anchor and
 * font size (`x` / `y` stay the anchor and the first baseline). Pass `height: 0`
 * for a box that grows with its content.
 * @param anchor `start` | `middle` | `end`
 */
export const areaAttrsForBox = (box: AreaBox, anchor: string, fontSize: number): Record<string, number | null> => ({
  x: box.x + (ANCHOR_FACTOR[anchor] ?? 0) * box.width,
  y: box.y + TEXT_ASCENT * fontSize,
  [WRAP_WIDTH_ATTR]: box.width,
  [WRAP_HEIGHT_ATTR]: box.height > 0 ? box.height : null
})

/**
 * Write attributes from {@link areaAttrsForBox} (a `null` value removes it).
 * `se:` attributes are namespaced so a saved drawing declares the prefix.
 */
export const writeAreaAttrs = (elem: Element, attrs: Record<string, number | string | null>): void => {
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('se:')) {
      const local = name.slice(3)
      // A plain `setAttribute('se:…')` (undo does that) leaves a namespace-less twin: drop it first.
      if (elem.hasAttribute(name) && !elem.hasAttributeNS(NS.SE, local)) elem.removeAttribute(name)
      if (value === null) elem.removeAttributeNS(NS.SE, local)
      else elem.setAttributeNS(NS.SE, name, String(value))
    } else if (value === null) {
      elem.removeAttribute(name)
    } else {
      elem.setAttribute(name, String(value))
    }
  }
}

/**
 * Turn point text into area text without moving anything: the box is as wide as
 * the text is now (plus a little slack so measurement jitter does not re-wrap
 * it), its rows stay as they are.
 * @param elem A `<text>` that is not on a path
 * @param contentWidth The text's current width
 * @returns Whether anything changed
 */
export const makeAreaText = (elem: Element, contentWidth: number): boolean => {
  if (elem.localName !== 'text' || hasTextPath(elem) || getWrapWidth(elem)) { return false }
  const value = getTextWithNewlines(elem)
  writeAreaAttrs(elem, { [WRAP_WIDTH_ATTR]: Math.ceil(contentWidth) + 2 })
  setMultilineText(elem, value)
  return true
}

/**
 * Turn area text back into point text: the rows as drawn become hard rows, so it
 * looks the same.
 * @returns Whether anything changed
 */
export const makePointText = (elem: Element): boolean => {
  if (!isAreaText(elem)) { return false }
  const rows = rowsOf(elem).map((t) => t.textContent).join('\n')
  writeAreaAttrs(elem, { [WRAP_WIDTH_ATTR]: null, [WRAP_HEIGHT_ATTR]: null, [VALIGN_ATTR]: null })
  setMultilineText(elem, rows)
  return true
}
