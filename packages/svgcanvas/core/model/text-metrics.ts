/**
 * Text geometry for the document model: the box a `<text>` element occupies, from a cache the renderer fills by measuring the
 * DOM, or from an estimate when nothing was measured (R1: the model never waits for a layout engine, as VectorCraft's
 * `TextObject::bounds` falls back to `estimate_bounds` when its layout cache is empty).
 *
 * The cache is keyed by the identity of the (immutable, structurally shared) model element, so an edit that does not touch a
 * text keeps its entry, and one that does gets a new object and so a miss. What the element does not hold itself is what it
 * inherits (font size and family from a `<g>` above it), so an entry also carries the inherited style it was measured under
 * and counts as a miss when that differs. A font that finishes loading changes every measurement: `clear()`.
 *
 * No DOM and no `window` here: this runs in Node (the headless engine) as well as in the browser.
 * @module model/text-metrics
 * @license MIT
 */
import { ownProperty, userLength } from './style.ts'
import type { ModelElement, ModelNode } from './node.ts'

export interface TextBox { x: number, y: number, width: number, height: number }

/** What a text takes from itself and its ancestors that changes its box (the properties `text-rows.ts` calls layout attributes). */
export interface TextStyle {
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  letterSpacing: number
  anchor: 'start' | 'middle' | 'end'
}

/** The default size of a text with no `font-size` anywhere above it (the browser's `medium`). */
const DEFAULT_FONT_SIZE = 16
/** Average advance of a glyph as a fraction of the font size, and the distance from a baseline up to the top of a row. */
const AVERAGE_ADVANCE = 0.55
const ASCENT = 0.8
const LINE_HEIGHT = 1.2

const attr = (el: ModelElement, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value

/**
 * The text style in force on the last element of `chain` (root first): a presentation attribute or a `style` declaration on
 * an element overrides what it inherits, the declaration winning, as in CSS. A size with a unit other than `px` is not
 * resolved (it keeps what was inherited); the renderer's measurement is the truth for those.
 */
export const resolveTextStyle = (chain: readonly ModelElement[]): TextStyle => {
  let s: TextStyle = { fontSize: DEFAULT_FONT_SIZE, fontFamily: '', fontWeight: '', fontStyle: '', letterSpacing: 0, anchor: 'start' }
  for (const el of chain) {
    const pick = (name: string): string | undefined => ownProperty(el, name)
    const anchor = pick('text-anchor')
    s = {
      fontSize: userLength(pick('font-size')) ?? s.fontSize,
      fontFamily: pick('font-family') ?? s.fontFamily,
      fontWeight: pick('font-weight') ?? s.fontWeight,
      fontStyle: pick('font-style') ?? s.fontStyle,
      letterSpacing: userLength(pick('letter-spacing')) ?? s.letterSpacing,
      anchor: anchor === 'middle' || anchor === 'end' || anchor === 'start' ? anchor : s.anchor
    }
  }
  return s
}

const textOf = (el: ModelElement): string =>
  el.children.map((c: ModelNode) => (c.kind === 'text' || c.kind === 'cdata' ? c.value : c.kind === 'element' ? textOf(c) : '')).join('')

/** The rows of a text: one per `<tspan>` child when it has them (the editor's multi-line storage), else its lines. */
const rowsOf = (el: ModelElement): string[] => {
  const tspans = el.children.filter((c): c is ModelElement => c.kind === 'element' && c.name === 'tspan')
  return tspans.length ? tspans.map(textOf) : textOf(el).split('\n')
}

/** The box of `el` (a `<text>`) estimated from its characters alone, in its own coordinate system, as `getBBox` would give it. */
export const estimateTextBounds = (el: ModelElement, style: TextStyle): TextBox => {
  const rows = rowsOf(el)
  const chars = Math.max(...rows.map((r) => r.length))
  const width = Math.max(0, chars * (style.fontSize * AVERAGE_ADVANCE + style.letterSpacing))
  const x = userLength(attr(el, 'x')) ?? 0
  const y = userLength(attr(el, 'y')) ?? 0
  const left = style.anchor === 'middle' ? x - width / 2 : style.anchor === 'end' ? x - width : x
  return { x: left, y: y - style.fontSize * ASCENT, width, height: rows.length * style.fontSize * LINE_HEIGHT }
}

const signature = (s: TextStyle): string => `${s.fontSize}|${s.fontFamily}|${s.fontWeight}|${s.fontStyle}|${s.letterSpacing}|${s.anchor}`

export interface TextBounds { box: TextBox, measured: boolean }

export class TextMetricsCache {
  private entries = new WeakMap<ModelElement, { sig: string, box: TextBox }>()

  /** The measured box of `el` under `style`, or undefined when it was not measured (or under another style). */
  get (el: ModelElement, style: TextStyle): TextBox | undefined {
    const hit = this.entries.get(el)
    return hit && hit.sig === signature(style) ? hit.box : undefined
  }

  /** Record what the renderer measured for `el` under `style`. */
  put (el: ModelElement, style: TextStyle, box: TextBox): void {
    this.entries.set(el, { sig: signature(style), box })
  }

  /** The measured box if there is one, else the estimate; `measured` says which. */
  bounds (el: ModelElement, style: TextStyle): TextBounds {
    const box = this.get(el, style)
    return box ? { box, measured: true } : { box: estimateTextBounds(el, style), measured: false }
  }

  /** Every measurement is stale (a font finished loading). */
  clear (): void {
    this.entries = new WeakMap()
  }
}

/** Every `<text>` under `root` with the chain of its ancestors (root first, the text last). */
export const textsIn = (root: ModelElement): Array<{ el: ModelElement, chain: ModelElement[] }> => {
  const out: Array<{ el: ModelElement, chain: ModelElement[] }> = []
  const visit = (el: ModelElement, chain: ModelElement[]): void => {
    const here = [...chain, el]
    if (el.name === 'text') { out.push({ el, chain: here }); return }
    for (const c of el.children) if (c.kind === 'element') visit(c, here)
  }
  visit(root, [])
  return out
}
