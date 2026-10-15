// @ts-check
/**
 * Document model, layer 2: a typed, read-only view of a drawing over the tree in `node.js`.
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
import { parseAnchors } from '../anchor-path.js'
import { parseGuides } from '../guides.js'
import { getAttr } from './node.js'

/** @typedef {import('./node.js').ModelNode} ModelNode */
/** @typedef {import('./node.js').ModelElement} ModelElement */
/** @typedef {import('./node.js').ModelDocument} ModelDocument */
/** @typedef {import('./node.js').NodePath} NodePath */

/**
 * @typedef {object} ItemBase
 * @property {NodePath} path child indexes from the root element
 * @property {string} tag
 * @property {string} [id]
 * @property {string} [name] `data-name`, the Layers panel label
 * @property {string} [transform] the `transform` attribute as written
 * @property {boolean} hidden `display="none"`
 * @property {boolean} locked `se:locked="true"` on the object itself (a locked group above it is not looked at)
 * @property {boolean} generated a copy made by a repeat (`se:repeat-copy`), rebuilt from its source
 * @property {Readonly<Record<string, string>>} se every `se:*` attribute, verbatim
 */
/** @typedef {ItemBase & {kind: 'group', role: 'group' | 'blend' | 'art-brush' | 'repeat', children: Item[]}} GroupItem */
/** @typedef {ItemBase & {kind: 'shape', tag: 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon', geometry: Readonly<Record<string, number>>, points?: [number, number][]}} ShapeItem */
/** @typedef {ItemBase & {kind: 'path', d: string}} PathItem */
/** @typedef {ItemBase & {kind: 'text', content: string, onPath: boolean}} TextItem */
/** @typedef {ItemBase & {kind: 'image', href: string, geometry: Readonly<Record<string, number>>}} ImageItem */
/** @typedef {ItemBase & {kind: 'use', href: string}} UseItem */
/** @typedef {ItemBase & {kind: 'other'}} OtherItem */
/** @typedef {GroupItem | ShapeItem | PathItem | TextItem | ImageItem | UseItem | OtherItem} Item */

/**
 * @typedef {object} LayerView
 * @property {NodePath} path
 * @property {string} name
 * @property {string} [id]
 * @property {boolean} hidden
 * @property {boolean} locked a locked layer only stops new objects landing in it
 * @property {boolean} template a tracing template: its objects cannot be selected
 * @property {Readonly<Record<string, string>>} se
 * @property {Item[]} items
 */
/**
 * One child of the top-level `<defs>`: gradients, filters, markers, clip paths, masks, patterns, symbols, styles and
 * the brush library (`<g se:brush>`).
 * @typedef {object} DefView
 * @property {NodePath} path
 * @property {string} tag
 * @property {string} [id]
 * @property {Readonly<Record<string, string>>} se
 */
/**
 * @typedef {object} Drawing
 * @property {ModelElement} root
 * @property {{width?: string, height?: string, viewBox?: string}} size as written (`640`, `100%`, `12cm`…)
 * @property {{v: number[], h: number[]}} guides ruler guides (`se:guides` on the root)
 * @property {Readonly<Record<string, string>>} se every `se:*` attribute of the root
 * @property {LayerView[]} layers
 * @property {Item[]} orphans visible top-level elements outside any layer; the editor gathers them into a new layer on load
 * @property {DefView[]} defs
 */

const SHAPE_TAGS = /** @type {const} */ (['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const GEOMETRY_ATTRS = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2']
/** Tags the Layers panel never lists as objects (`object-state.js` NON_OBJECT_TAGS). */
const NON_OBJECT_TAGS = new Set(['title', 'defs', 'desc', 'metadata', 'style', 'script', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'clipPath', 'mask', 'symbol'])
/** Groups whose children are generated from a source: one row, not expandable (`object-state.js` LEAF_GROUP_ATTRS). */
const GROUP_ROLES = /** @type {const} */ (['blend', 'art-brush', 'repeat'])

/**
 * @param {ModelNode} node
 * @returns {node is ModelElement}
 */
const isElement = (node) => node.kind === 'element'

/**
 * @param {ModelElement} el
 * @returns {Record<string, string>}
 */
const seAttrs = (el) => {
  /** @type {Record<string, string>} */
  const out = {}
  for (const a of el.attrs) if (a.name.startsWith('se:')) out[a.name] = a.value
  return out
}

/**
 * @param {ModelElement} el
 * @returns {string}
 */
const textOf = (el) => el.children.map((c) => (c.kind === 'text' || c.kind === 'cdata' ? c.value : c.kind === 'element' ? textOf(c) : '')).join('')

/**
 * @param {ModelElement} el
 * @param {string} cls
 * @returns {boolean}
 */
const hasClass = (el, cls) => (getAttr(el, 'class') ?? '').split(/\s+/).includes(cls)

/**
 * @param {ModelElement} el
 * @param {readonly string[]} names
 * @returns {Record<string, number>} the attributes that hold a plain number
 */
const numbers = (el, names) => {
  /** @type {Record<string, number>} */
  const out = {}
  for (const n of names) {
    const v = getAttr(el, n)
    if (v === undefined || v.trim() === '') continue
    const num = Number(v)
    if (Number.isFinite(num)) out[n] = num
  }
  return out
}

/**
 * @param {string} value `points` attribute
 * @returns {[number, number][]}
 */
const parsePoints = (value) => {
  const nums = value.trim().split(/[\s,]+/).filter(Boolean).map(Number)
  /** @type {[number, number][]} */
  const pts = []
  for (let i = 0; i + 1 < nums.length; i += 2) if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) pts.push([nums[i], nums[i + 1]])
  return pts
}

/**
 * @param {ModelElement} el
 * @param {NodePath} path
 * @returns {ItemBase}
 */
const base = (el, path) => {
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
    se: seAttrs(el)
  }
}

/**
 * Is `node` something the Layers panel lists as an object row (`object-state.js` `isPanelObject`)?
 * @param {ModelElement} el
 * @returns {boolean}
 */
const isObject = (el) => !NON_OBJECT_TAGS.has(el.name) && getAttr(el, 'data-se-ephemeral') === undefined

/**
 * @param {ModelElement} el
 * @param {NodePath} path
 * @returns {Item}
 */
const readItem = (el, path) => {
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
    const content = rows.length && !hasText ? rows.map((r) => textOf(/** @type {ModelElement} */ (r))).join('\n') : textOf(el)
    return { ...b, kind: 'text', content, onPath: el.children.some((c) => c.kind === 'element' && c.name === 'textPath') }
  }
  if (tag === 'image') return { ...b, kind: 'image', href: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '', geometry: numbers(el, GEOMETRY_ATTRS) }
  if (tag === 'use') return { ...b, kind: 'use', href: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '' }
  return { ...b, kind: 'other' }
}

/**
 * @param {ModelElement} parent
 * @param {NodePath} parentPath
 * @returns {Item[]}
 */
const readItems = (parent, parentPath) => {
  /** @type {Item[]} */
  const items = []
  parent.children.forEach((child, i) => {
    if (isElement(child) && isObject(child)) items.push(readItem(child, [...parentPath, i]))
  })
  return items
}

/**
 * Read the typed view of a drawing.
 * @param {ModelDocument} doc
 * @returns {Drawing}
 * @throws {TypeError} when the root element is not an `<svg>`
 */
export const readDrawing = (doc) => {
  const root = doc.root
  if (root.name !== 'svg') throw new TypeError(`the root element is <${root.name}>, not <svg>`)
  /** @type {LayerView[]} */
  const layers = []
  /** @type {Item[]} */
  const orphans = []
  /** @type {DefView[]} */
  const defs = []
  root.children.forEach((child, i) => {
    if (!isElement(child)) return
    const path = [i]
    if (child.name === 'defs') {
      child.children.forEach((d, k) => {
        if (!isElement(d)) return
        const id = getAttr(d, 'id')
        defs.push({ path: [i, k], tag: d.name, ...(id === undefined ? {} : { id }), se: seAttrs(d) })
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
 * @param {Drawing} drawing
 * @param {(item: Item, layer: LayerView | null) => void} visit
 * @param {{generated?: boolean}} [options]
 * @returns {void}
 */
export const walkItems = (drawing, visit, { generated = true } = {}) => {
  /**
   * @param {Item} item
   * @param {LayerView | null} layer
   */
  const go = (item, layer) => {
    if (!generated && item.generated) return
    visit(item, layer)
    if (item.kind === 'group') for (const c of item.children) go(c, layer)
  }
  for (const layer of drawing.layers) for (const item of layer.items) go(item, layer)
  for (const item of drawing.orphans) go(item, null)
}

/**
 * @param {Drawing} drawing
 * @param {string} id
 * @returns {Item | undefined} the first item with this id (duplicate ids are a `checkDrawing` finding)
 */
export const findItem = (drawing, id) => {
  /** @type {Item | undefined} */
  let found
  walkItems(drawing, (item) => { if (!found && item.id === id) found = item })
  return found
}

/**
 * The anchor model of a path item (`anchor-path.js`), parsed on demand.
 * @param {PathItem} item
 * @returns {ReturnType<typeof parseAnchors>}
 */
export const pathAnchors = (item) => parseAnchors(item.d)
