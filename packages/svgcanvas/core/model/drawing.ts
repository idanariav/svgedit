/**
 * Document model, layer 2: a typed, read-only view of a drawing over the tree in `node.ts`.
 *
 * `readDrawing(doc)` follows the editor's own conventions (`draw.js` `identifyLayers`, `object-state.js`): a layer is a
 * top-level `<g class="layer">` named by its `<title>`; objects are what the Layers panel lists (not `<title>`,
 * `<defs>`, paint servers…); a hidden object has `display="none"`, a locked one `se:locked="true"`, a tracing-template
 * layer `se:template="true"`. Every item keeps its `path` (child indexes from the root, whitespace text nodes
 * included), so a change is `updateAt(doc.root, item.path, …)` and the view is read again.
 *
 * Every `se:*` attribute is kept verbatim in `item.se`. Features get typed fields here as their owning module's parser
 * becomes DOM-free (done: ruler guides, path anchors via `pathAnchors`); the rest is read from `se` by the caller.
 * @module model/drawing
 * @license MIT
 */
import { parseAnchors } from '../anchor-path.ts'
import { parseGuides } from '../guides.ts'
import { getAttr } from './node.ts'
import { readFeatures } from './features.ts'

import type { ModelNode, ModelElement, ModelDocument, NodePath } from './node.ts'
import type { Features } from './features.ts'

interface ItemBase {
  /** child indexes from the root element */
  path: NodePath
  tag: string
  id?: string
  /** `data-name`, the Layers panel label */
  name?: string
  /** the `transform` attribute as written */
  transform?: string
  /** `display="none"` */
  hidden: boolean
  /** `se:locked="true"` on the object itself (a locked group above it is not looked at) */
  locked: boolean
  /** a copy made by a repeat (`se:repeat-copy`), rebuilt from its source */
  generated: boolean
  /** every `se:*` attribute, verbatim */
  se: Readonly<Record<string, string>>
  /** the `se:*` attributes that have a typed reader (see `features.ts`) */
  features: Features
}
export type GroupItem = ItemBase & { kind: 'group', role: 'group' | 'blend' | 'art-brush' | 'repeat', children: Item[] }
export type ShapeItem = ItemBase & { kind: 'shape', tag: 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon', geometry: Readonly<Record<string, number>>, points?: [number, number][] }
export type PathItem = ItemBase & { kind: 'path', d: string }
export type TextItem = ItemBase & { kind: 'text', content: string, onPath: boolean }
export type ImageItem = ItemBase & { kind: 'image', href: string, geometry: Readonly<Record<string, number>> }
export type UseItem = ItemBase & { kind: 'use', href: string }
export type OtherItem = ItemBase & { kind: 'other' }
export type Item = GroupItem | ShapeItem | PathItem | TextItem | ImageItem | UseItem | OtherItem

export interface LayerView {
  path: NodePath
  name: string
  id?: string
  hidden: boolean
  /** a locked layer only stops new objects landing in it */
  locked: boolean
  /** a tracing template: its objects cannot be selected */
  template: boolean
  se: Readonly<Record<string, string>>
  items: Item[]
}

/**
 * One child of the top-level `<defs>`: gradients, filters, markers, clip paths, masks, patterns, symbols, styles and
 * the brush library (`<g se:brush>`).
 */
export interface DefView {
  path: NodePath
  tag: string
  id?: string
  se: Readonly<Record<string, string>>
  features: Features
}

export interface Drawing {
  root: ModelElement
  /** as written (`640`, `100%`, `12cm`…) */
  size: { width?: string, height?: string, viewBox?: string }
  /** ruler guides (`se:guides` on the root) */
  guides: { v: number[], h: number[] }
  /** every `se:*` attribute of the root */
  se: Readonly<Record<string, string>>
  layers: LayerView[]
  /** visible top-level elements outside any layer; the editor gathers them into a new layer on load */
  orphans: Item[]
  defs: DefView[]
}

const SHAPE_TAGS = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'] as const
const GEOMETRY_ATTRS = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2']
/** Tags the Layers panel never lists as objects (`object-state.js` NON_OBJECT_TAGS). */
const NON_OBJECT_TAGS = new Set(['title', 'defs', 'desc', 'metadata', 'style', 'script', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'clipPath', 'mask', 'symbol'])
/** Groups whose children are generated from a source: one row, not expandable (`object-state.js` LEAF_GROUP_ATTRS). */
const GROUP_ROLES = ['blend', 'art-brush', 'repeat'] as const

const isElement = (node: ModelNode): node is ModelElement => node.kind === 'element'

const seAttrs = (el: ModelElement): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const a of el.attrs) if (a.name.startsWith('se:')) out[a.name] = a.value
  return out
}

const textOf = (el: ModelElement): string => el.children.map((c) => (c.kind === 'text' || c.kind === 'cdata' ? c.value : c.kind === 'element' ? textOf(c) : '')).join('')

const hasClass = (el: ModelElement, cls: string): boolean => (getAttr(el, 'class') ?? '').split(/\s+/).includes(cls)

/** The attributes that hold a plain number. */
const numbers = (el: ModelElement, names: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const n of names) {
    const v = getAttr(el, n)
    if (v === undefined || v.trim() === '') continue
    const num = Number(v)
    if (Number.isFinite(num)) out[n] = num
  }
  return out
}

/** `value` is a `points` attribute. */
const parsePoints = (value: string): [number, number][] => {
  const nums = value.trim().split(/[\s,]+/).filter(Boolean).map(Number)
  const pts: [number, number][] = []
  for (let i = 0; i + 1 < nums.length; i += 2) if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) pts.push([nums[i], nums[i + 1]])
  return pts
}

const base = (el: ModelElement, path: NodePath): ItemBase => {
  const se = seAttrs(el)
  const id = getAttr(el, 'id')
  const name = getAttr(el, 'data-name')
  const transform = getAttr(el, 'transform')
  return {
    path,
    tag: el.name,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    ...(transform === undefined ? {} : { transform }),
    hidden: getAttr(el, 'display') === 'none',
    locked: getAttr(el, 'se:locked') === 'true',
    generated: getAttr(el, 'se:repeat-copy') !== undefined,
    se,
    features: readFeatures(se)
  }
}

/** Is `el` something the Layers panel lists as an object row (`object-state.js` `isPanelObject`)? */
const isObject = (el: ModelElement): boolean => !NON_OBJECT_TAGS.has(el.name) && getAttr(el, 'data-se-ephemeral') === undefined

const readItem = (el: ModelElement, path: NodePath): Item => {
  const b = base(el, path)
  const tag = el.name
  if (tag === 'g' || tag === 'a') {
    const role = GROUP_ROLES.find((r) => getAttr(el, `se:${r}`) !== undefined) ?? 'group'
    return { ...b, kind: 'group', role, children: readItems(el, path) }
  }
  const shape = SHAPE_TAGS.find((t) => t === tag)
  if (shape) {
    const points = getAttr(el, 'points')
    return { ...b, kind: 'shape', tag: shape, geometry: numbers(el, GEOMETRY_ATTRS), ...(points === undefined ? {} : { points: parsePoints(points) }) }
  }
  if (tag === 'path') return { ...b, kind: 'path', d: getAttr(el, 'd') ?? '' }
  if (tag === 'text') {
    const rows = el.children.filter((c) => c.kind === 'element' && c.name === 'tspan' && getAttr(c, 'se:soft') === undefined)
    const hasText = el.children.some((c) => c.kind === 'text' && c.value.trim() !== '')
    const content = rows.length && !hasText ? rows.map((r) => textOf(r as ModelElement)).join('\n') : textOf(el)
    return { ...b, kind: 'text', content, onPath: el.children.some((c) => c.kind === 'element' && c.name === 'textPath') }
  }
  if (tag === 'image') return { ...b, kind: 'image', href: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '', geometry: numbers(el, GEOMETRY_ATTRS) }
  if (tag === 'use') return { ...b, kind: 'use', href: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '' }
  return { ...b, kind: 'other' }
}

const readItems = (parent: ModelElement, parentPath: NodePath): Item[] => {
  const items: Item[] = []
  parent.children.forEach((child, i) => {
    if (isElement(child) && isObject(child)) items.push(readItem(child, [...parentPath, i]))
  })
  return items
}

/** Read the typed view of a drawing. Throws a TypeError when the root element is not an `<svg>`. */
export const readDrawing = (doc: ModelDocument): Drawing => {
  const root = doc.root
  if (root.name !== 'svg') throw new TypeError(`the root element is <${root.name}>, not <svg>`)
  const layers: LayerView[] = []
  const orphans: Item[] = []
  const defs: DefView[] = []
  root.children.forEach((child, i) => {
    if (!isElement(child)) return
    const path = [i]
    if (child.name === 'defs') {
      child.children.forEach((d, k) => {
        if (!isElement(d)) return
        const id = getAttr(d, 'id')
        const se = seAttrs(d)
        defs.push({ path: [i, k], tag: d.name, ...(id === undefined ? {} : { id }), se, features: readFeatures(se) })
      })
    } else if (child.name === 'g' && hasClass(child, 'layer')) {
      const title = child.children.find((c) => isElement(c) && c.name === 'title')
      const id = getAttr(child, 'id')
      layers.push({
        path,
        name: title && isElement(title) ? textOf(title) : '',
        ...(id === undefined ? {} : { id }),
        hidden: getAttr(child, 'display') === 'none',
        locked: getAttr(child, 'se:locked') === 'true',
        template: getAttr(child, 'se:template') === 'true',
        se: seAttrs(child),
        items: readItems(child, path)
      })
    } else if (isObject(child)) {
      orphans.push(readItem(child, path))
    }
  })
  const width = getAttr(root, 'width')
  const height = getAttr(root, 'height')
  const viewBox = getAttr(root, 'viewBox')
  const guides = parseGuides(getAttr(root, 'se:guides'))
  return {
    root,
    size: { ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }), ...(viewBox === undefined ? {} : { viewBox }) },
    guides: { v: guides.v, h: guides.h },
    se: seAttrs(root),
    layers,
    orphans,
    defs
  }
}

/**
 * Visit every item of the drawing in document order (layers, then orphans), groups before their children.
 * `generated: false` leaves out the copies a repeat makes (and what is inside them), as the Layers panel does.
 */
export const walkItems = (drawing: Drawing, visit: (item: Item, layer: LayerView | null) => void, { generated = true }: { generated?: boolean } = {}): void => {
  const go = (item: Item, layer: LayerView | null) => {
    if (!generated && item.generated) return
    visit(item, layer)
    if (item.kind === 'group') for (const c of item.children) go(c, layer)
  }
  for (const layer of drawing.layers) for (const item of layer.items) go(item, layer)
  for (const item of drawing.orphans) go(item, null)
}

/** The first item with this id (duplicate ids are a `checkDrawing` finding). */
export const findItem = (drawing: Drawing, id: string): Item | undefined => {
  let found: Item | undefined
  walkItems(drawing, (item) => { if (!found && item.id === id) found = item })
  return found
}

/** The anchor model of a path item (`anchor-path.js`), parsed on demand. */
export const pathAnchors = (item: PathItem): ReturnType<typeof parseAnchors> => parseAnchors(item.d)
