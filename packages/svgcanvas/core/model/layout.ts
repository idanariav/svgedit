/**
 * Document model, layer 4: where every object of a drawing is, in document coordinates, worked out with no browser (the
 * headless CLI, an LLM that cannot see the canvas).
 *
 * `layoutOf(root)` walks the content root and gives each object with an `id` its box (the geometry, as `getBBox` would give it)
 * and its visual box (with the stroke), both under the transforms of every group above it. A shape or group is measured exactly
 * (`model/bounds.ts`); a text only by estimate (`model/text-metrics.ts`: the browser is the layout engine); a `use` or a group
 * holding one not at all (`source: 'unknown'`).
 *
 * No DOM and no `window` here: this runs in Node (the headless engine) as well as in the browser.
 * @module model/layout
 * @license MIT
 */
import { geometricBounds, paintsNothing, strokedBounds } from './bounds.ts'
import type { Bounds } from './bounds.ts'
import { IDENTITY_MATRIX, applyToPoint, multiply, parseMatrix } from './matrix.ts'
import type { Matrix6 } from './matrix.ts'
import type { ModelElement } from './node.ts'
import { ownProperty } from './style.ts'
import { estimateTextBounds, resolveTextStyle } from './text-metrics.ts'

/** [x, y, width, height] in document units, rounded to a thousandth. */
export type Box = [number, number, number, number]

export interface ObjectBox {
  id: string
  tag: string
  /** the layer's name ('' for an object outside any layer) */
  layer: string
  /** the id of the group the object is in, if it is in one */
  parent?: string
  /** the geometry's box (what `getBBox` gives), or null when `source` is `unknown` */
  box: Box | null
  /** the box with the stroke painted; the same as `box` for a text, null when `source` is `unknown` */
  visual: Box | null
  /** `exact`: worked out from the attributes; `estimate`: a text, from its characters; `unknown`: only a layout engine can say */
  source: 'exact' | 'estimate' | 'unknown'
  /** the object, its group or its layer is not displayed */
  hidden: boolean
  /** its visual box lies entirely outside the page (only said when the drawing has a size) */
  outside: boolean
}

export interface Layout {
  /** the page, from the viewBox or the width and height */
  size: { width: number, height: number } | null
  /** the visual boxes of the displayed objects together, or null when there are none */
  extent: Box | null
  objects: ObjectBox[]
}

const round = (n: number): number => Math.round(n * 1000) / 1000
const toBox = (b: Bounds): Box => [round(b.x), round(b.y), round(b.width), round(b.height)]

const pageSize = (root: ModelElement): Layout['size'] => {
  const attr = (name: string): string | undefined => root.attrs.find((a) => a.name === name)?.value
  const vb = (attr('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] }
  const [width, height] = [attr('width'), attr('height')].map((v) => (v !== undefined && /^\s*[\d.]+(px)?\s*$/.test(v) ? parseFloat(v) : NaN))
  return width > 0 && height > 0 ? { width, height } : null
}

/** The box of a text's estimate after `m`. */
const textBox = (chain: readonly ModelElement[], m: Readonly<Matrix6>): Bounds => {
  const est = estimateTextBounds(chain[chain.length - 1], resolveTextStyle(chain))
  const corners = [[est.x, est.y], [est.x + est.width, est.y], [est.x, est.y + est.height], [est.x + est.width, est.y + est.height]]
    .map((p) => applyToPoint(m, p as [number, number]))
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

const layerName = (layer: ModelElement): string => {
  const title = layer.children.find((c): c is ModelElement => c.kind === 'element' && c.name === 'title')
  return title ? title.children.map((c) => ('value' in c ? c.value : '')).join('') : ''
}

const isLayer = (el: ModelElement): boolean =>
  el.name === 'g' && (el.attrs.find((a) => a.name === 'class')?.value ?? '').split(/\s+/).includes('layer')

/** The boxes of the objects of the drawing whose content root is `root`. */
export const layoutOf = (root: ModelElement): Layout => {
  const size = pageSize(root)
  const objects: ObjectBox[] = []

  const visit = (el: ModelElement, chain: readonly ModelElement[], m: Readonly<Matrix6>, layer: string, parent: string | undefined, hidden: boolean): void => {
    for (const child of el.children) {
      if (child.kind !== 'element' || paintsNothing(child)) continue
      const own = parseMatrix(child.attrs.find((a) => a.name === 'transform')?.value)
      const cm = own ? multiply(m, own) : null
      const cchain = [...chain, child]
      const id = child.attrs.find((a) => a.name === 'id')?.value
      const isHidden = hidden || ownProperty(child, 'display') === 'none'
      if (id !== undefined) {
        let box: Bounds | undefined
        let visual: Bounds | undefined
        let source: ObjectBox['source'] = 'unknown'
        if (cm && child.name === 'text') {
          box = visual = textBox(cchain, cm)
          source = 'estimate'
        } else if (cm) {
          box = geometricBounds(child, cm)
          visual = box && strokedBounds(cchain, cm)
          if (box) source = 'exact'
        }
        const page = size
        const seen = visual ?? box
        const outside = Boolean(page && seen && (seen.x >= page.width || seen.y >= page.height || seen.x + seen.width <= 0 || seen.y + seen.height <= 0))
        objects.push({
          id,
          tag: child.name,
          layer,
          ...(parent === undefined ? {} : { parent }),
          box: box ? toBox(box) : null,
          visual: visual ? toBox(visual) : box ? toBox(box) : null,
          source,
          hidden: isHidden,
          outside
        })
      }
      if ((child.name === 'g' || child.name === 'a') && cm) visit(child, cchain, cm, layer, id ?? parent, isHidden)
    }
  }

  // Layers sit directly under the root; anything else there is an orphan
  for (const child of root.children) {
    if (child.kind !== 'element') continue
    if (isLayer(child)) {
      const own = parseMatrix(child.attrs.find((a) => a.name === 'transform')?.value)
      if (own) visit(child, [root, child], multiply(IDENTITY_MATRIX, own), layerName(child), undefined, ownProperty(child, 'display') === 'none')
    } else if (!paintsNothing(child)) {
      // an object outside any layer: visit a stand-in so it is measured like the rest
      visit({ ...root, children: [child] }, [root], IDENTITY_MATRIX, '', undefined, false)
    }
  }

  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const o of objects) {
    if (o.hidden || !o.visual) continue
    x0 = Math.min(x0, o.visual[0]); y0 = Math.min(y0, o.visual[1])
    x1 = Math.max(x1, o.visual[0] + o.visual[2]); y1 = Math.max(y1, o.visual[1] + o.visual[3])
  }
  return { size, extent: Number.isFinite(x0) ? [round(x0), round(y0), round(x1 - x0), round(y1 - y0)] : null, objects }
}
