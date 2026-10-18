/**
 * DOM/element manipulation, lookup, and misc canvas-state utilities.
 * @module dom-utils
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.ts'
import { setUnitAttr, getTypeMap } from './units.ts'
import { getTransformList } from './math.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { XY } from './canvas-state.ts'

/** The members `dom-utils.ts` gives its canvas. */
export interface DomUtilsApi {
  getElement(id: string): Element | null | undefined
  findDefs(): Element
  getRefElem(attrVal: string | null): Element | null
  getReferencedDefElements(elems: Element[]): Element[]
  /** Round a value to the grid step. */
  snapToGrid(value: number): number
  snapPointToGrid(x: number, y: number): XY
  getRotationAngle(elem?: Element, toRad?: boolean): number
}

/**
 * Attaches the canvas-state-dependent helpers (element/defs lookup, grid
 * snapping) directly onto the given instance, closed over it — per-instance,
 * like every other `core/*.js` module's `init(canvas)`. These have no
 * elem-only equivalent (an id/attr-value lookup or the grid config has
 * nothing to be "pure" against), unlike `getBBox`/`getRotationAngle` below,
 * which stay bare+pure and only get an instance-scoped selection-fallback
 * wrapper here.
 */
export const createDomUtils = (canvas: SvgCanvas): DomUtilsApi => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /** Get a DOM element by ID within the SVG root element. */
  const getElement = (id: string): Element | null | undefined => svgCanvas.getSvgRoot()?.querySelector(`#${CSS.escape(id)}`)

  /** @returns The document's `<defs>` element, creating it first if necessary */
  const findDefs = (): SVGDefsElement => {
    const svgElement = svgCanvas.getSvgContent()
    const existingDefs = svgElement.getElementsByTagNameNS(NS.SVG, 'defs')

    if (existingDefs.length > 0) {
      return existingDefs[0] as SVGDefsElement
    }

    const defs = svgElement.ownerDocument.createElementNS(NS.SVG, 'defs') as SVGDefsElement
    const insertTarget = svgElement.firstChild?.nextSibling

    if (insertTarget) {
      svgElement.insertBefore(defs, insertTarget)
    } else {
      svgElement.append(defs)
    }

    return defs
  }

  /**
   * Get the reference element associated with the given attribute value.
   * @param attrVal - The attribute value as a string
   * @returns Reference element
   */
  const getRefElem = (attrVal: string | null): Element | null => {
    if (!attrVal) return null
    const url = getUrlFromAttr(attrVal)
    if (!url) return null
    const id = url[0] === '#' ? url.slice(1) : url
    return getElement(id) ?? null
  }

  /**
   * Collect the `<defs>` elements (gradients, filters, markers, masks,
   * clip-paths, …) transitively referenced by the given elements, so a
   * copy/paste or shape-library save can carry its paint servers along instead
   * of leaving dangling `url(#…)` references when pasted into another document.
   * @param elems - root elements to scan (descendants are scanned too)
   * @returns de-duplicated referenced def elements, dependencies first
   */
  const getReferencedDefElements = (elems: Element[]): Element[] => {
    const seen = new Set<Element>()
    const ordered: Element[] = []
    const idsOf = (el: Element): string[] => {
      const ids: string[] = []
      REF_ATTRS.forEach((name) => {
        const url = getUrlFromAttr(el.getAttribute?.(name))
        if (url) ids.push(url[0] === '#' ? url.slice(1) : url)
      })
      const href = getHref(el)
      if (href?.startsWith('#')) ids.push(href.slice(1))
      return ids
    }
    const visit = (el: Element): void => {
      idsOf(el).forEach((id) => {
        const ref = getElement(id)
        // Only collect <defs>-resident elements, not on-canvas references.
        if (ref && !seen.has(ref) && ref.closest?.('defs')) {
          seen.add(ref)
          visit(ref) // nested refs (e.g. gradient href→gradient) collected first
          ordered.push(ref)
        }
      })
    }
    elems.forEach((root) => {
      if (!root) return
      visit(root)
      root.querySelectorAll?.('*').forEach(visit)
    })
    return ordered
  }

  /** Snapping step size in px (snappingStep converted from the current base unit). */
  const getSnapStepSize = (): number => {
    const unit = svgCanvas.getBaseUnit() ?? 'px'
    let stepSize = Number(svgCanvas.getSnappingStep())
    if (unit !== 'px') {
      stepSize *= getTypeMap()[unit]
    }
    return stepSize
  }

  /** Round value to for snapping. */
  const snapToGrid = (value: number): number => {
    value = Math.round(value / getSnapStepSize()) * getSnapStepSize()
    return value
  }

  /**
   * Snap a point to the nearest node of the active grid lattice.
   * For the `square` grid (and the non-lattice perspective grids) this is just
   * per-axis rounding, identical to calling `snapToGrid` on each coordinate. For the `isometric` and `triangle` grids the point is
   * snapped to the nearest node of the corresponding skewed lattice by inverting
   * its basis vectors.
   */
  const snapPointToGrid = (x: number, y: number): { x: number, y: number } => {
    const shape = svgCanvas.getGridShape ? svgCanvas.getGridShape() : 'square'
    if (shape === 'isometric' || shape === 'triangle') {
      const s = getSnapStepSize()
      let ax: number, ay: number, bx: number, by: number
      if (shape === 'isometric') {
        // Two axes at ±30° from horizontal.
        const c = Math.cos(Math.PI / 6)
        const sn = Math.sin(Math.PI / 6)
        ax = s * c; ay = s * sn
        bx = s * c; by = -s * sn
      } else {
        // Triangular lattice: horizontal axis + 60° axis.
        ax = s; ay = 0
        bx = s / 2; by = (s * Math.sqrt(3)) / 2
      }
      // Solve (x,y) = m·a + n·b for integers m,n, then recompute the node.
      const det = ax * by - bx * ay
      const m = Math.round((x * by - bx * y) / det)
      const n = Math.round((ax * y - x * ay) / det)
      return { x: m * ax + n * bx, y: m * ay + n * by }
    }
    return { x: snapToGrid(x), y: snapToGrid(y) }
  }

  return {
    getElement,
    findDefs,
    getRefElem,
    getReferencedDefElements,
    snapToGrid,
    snapPointToGrid,
    // getRotationAngle stays a bare, pure (elem-required) export below — every
    // call site already passes an elem — but the public per-instance API keeps
    // the "default to current selection" convenience, correctly scoped now.
    getRotationAngle: (elem?: Element, toRad?: boolean) => getRotationAngle(elem || svgCanvas.getSelectedElements()[0], toRad)
  }
}

// Row storage and area-text layout live in text-rows.js; re-exported so existing imports keep working.
export { TEXT_LINE_HEIGHT, getTextWithNewlines, setMultilineText } from './text-rows.ts'

type TreeWalker = (elem: SVGElement) => void

/**
 * Walks the tree and executes the callback on each element in a top-down fashion.
 * @param elem - DOM element to traverse
 * @param cbFn - Callback function to run on each element
 */
export const walkTree = (elem: Element, cbFn: TreeWalker): void => {
  if (elem?.nodeType === 1) {
    cbFn(elem as SVGElement)
    let i = elem.childNodes.length
    while (i--) {
      walkTree(elem.childNodes.item(i) as Element, cbFn)
    }
  }
}

/**
 * Walks the tree and executes the callback on each element in a depth-first fashion.
 * @todo Shouldn't this be calling walkTreePost?
 * @param elem - DOM element to traverse
 * @param cbFn - Callback function to run on each element
 */
export const walkTreePost = (elem: Element, cbFn: TreeWalker): void => {
  if (elem?.nodeType === 1) {
    let i = elem.childNodes.length
    while (i--) {
      walkTree(elem.childNodes.item(i) as Element, cbFn)
    }
    cbFn(elem as SVGElement)
  }
}

/**
 * Extracts the URL from the `url(...)` syntax of some attributes.
 * Three variants:
 *  - `<circle fill="url(someFile.svg#foo)" />`
 *  - `<circle fill="url('someFile.svg#foo')" />`
 *  - `<circle fill='url("someFile.svg#foo")' />`
 * @param attrVal The attribute value as a string
 * @returns String with just the URL, like "someFile.svg#foo"
 */
export const getUrlFromAttr = (attrVal: string | null | undefined): string | null => {
  if (!attrVal?.startsWith('url(')) return null

  const patterns = [
    { start: 'url("', end: '"', offset: 5 },
    { start: "url('", end: "'", offset: 5 },
    { start: 'url(', end: ')', offset: 4 }
  ]

  for (const { start, end, offset } of patterns) {
    if (attrVal.startsWith(start)) {
      const endIndex = attrVal.indexOf(end, offset + 1)
      return endIndex > 0 ? attrVal.substring(offset, endIndex) : null
    }
  }

  return null
}

/** @returns The given element's `href` value */
export let getHref = (elem: Element): string | null =>
  elem.getAttribute('href') ?? elem.getAttributeNS(NS.XLINK, 'href')

/** Sets the given element's `href` value. */
export let setHref = (elem: Element, val: string): void => {
  elem.setAttribute('href', val)
}

/**
 * Put an element's `transform` back to what it was (a live gesture preview is undone before the gesture is stated on the model).
 * An empty string removes the attribute.
 */
export const restoreTransformAttr = (el: Element, was: string): void => {
  if (was) el.setAttribute('transform', was)
  else el.removeAttribute('transform')
}

/**
 * Get the rotation angle of the given transform list.
 * @param tlist - List of transforms
 * @param toRad - When true returns the value in radians rather than degrees
 * @returns The angle in degrees or radians
 */
export const getRotationAngleFromTransformList = (tlist: SVGTransformList | undefined, toRad?: boolean): number => {
  if (!tlist) {
    return 0
  } // <svg> element have no tlist
  for (let i = 0; i < tlist.numberOfItems; ++i) {
    const xform = tlist.getItem(i)
    if (xform.type === 4) {
      return toRad ? (xform.angle * Math.PI) / 180.0 : xform.angle
    }
  }
  return 0.0
}

/**
 * Get the rotation angle of the given DOM element. Pure — requires an elem
 * (every call site already passes one); the "default to current selection"
 * convenience lives on the per-instance `canvas.getRotationAngle` wrapper
 * attached by {@link module:dom-utils.init} instead, so it resolves against
 * the right editor instance rather than shared module state.
 * @param elem - DOM element to get the angle for
 * @param toRad - When true returns the value in radians rather than degrees
 * @returns The angle in degrees or radians
 */
export let getRotationAngle = (elem: Element, toRad?: boolean): number => {
  const tlist = getTransformList(elem)
  return getRotationAngleFromTransformList(tlist, toRad)
}

/**
 * Attributes whose value may be a `url(#id)` reference to a `<defs>` element
 * (paint servers, filters, markers, masks, clip-paths).
 */
const REF_ATTRS: string[] = [
  'clip-path', 'fill', 'filter', 'marker-end', 'marker-mid',
  'marker-start', 'mask', 'stroke'
]

/**
 * Rewrite every `id` on the given root elements (and their descendants) to a
 * fresh id, then update any internal `url(#…)` / `href="#…"` references so they
 * keep pointing at the renamed elements. Used when inserting a stored shape so
 * repeated insertions don't collide on ids with each other or the canvas.
 * @param rootEls - root elements to remap (self + descendants)
 * @param getNewId - supplies a fresh unique id per call
 * @returns map of old id → new id
 */
export const remapElementIdsAndRefs = (rootEls: Element[], getNewId: () => string): Record<string, string> => {
  const idMap: Record<string, string> = {}
  const allEls: Element[] = []
  rootEls.forEach((root) => {
    if (!root) return
    if (root.getAttribute?.('id')) allEls.push(root)
    root.querySelectorAll?.('*').forEach((e) => allEls.push(e))
  })
  // First pass: assign new ids.
  allEls.forEach((el) => {
    const old = el.getAttribute?.('id')
    if (old) {
      const fresh = getNewId()
      idMap[old] = fresh
      el.setAttribute('id', fresh)
    }
  })
  // Second pass: rewrite references to the renamed ids.
  allEls.forEach((el) => {
    REF_ATTRS.forEach((name) => {
      const val = el.getAttribute?.(name) as string
      const url = getUrlFromAttr(val)
      if (!url) return
      const refId = url[0] === '#' ? url.slice(1) : url
      if (refId in idMap) el.setAttribute(name, val.replace(`#${refId}`, `#${idMap[refId]}`))
    })
    const plainHref = el.getAttribute?.('href')
    if (plainHref?.startsWith('#') && plainHref.slice(1) in idMap) {
      el.setAttribute('href', `#${idMap[plainHref.slice(1)]}`)
    }
    const xlinkHref = el.getAttributeNS?.(NS.XLINK, 'href')
    if (xlinkHref?.startsWith('#') && xlinkHref.slice(1) in idMap) {
      el.setAttributeNS(NS.XLINK, 'href', `#${idMap[xlinkHref.slice(1)]}`)
    }
  })
  return idMap
}
/** The `feGaussianBlur` of a filter element: its first child, else the first one among its children. */
export const getFeGaussianBlur = (ele: Element | null | undefined): SVGFEGaussianBlurElement | null => {
  if (!ele) return null
  const first = ele?.firstElementChild
  if (first?.tagName === 'feGaussianBlur') {
    return first as SVGFEGaussianBlurElement
  }
  for (const child of Array.from(ele.children)) {
    if (child.tagName === 'feGaussianBlur') return child as SVGFEGaussianBlurElement
  }
  return null
}

/**
 * Assigns multiple attributes to an element.
 * @param elem - DOM element to apply new attribute values to
 * @param attrs - Object with attribute keys/values
 * @param suspendLength - Milliseconds to suspend redraw
 * @param unitCheck - Boolean to indicate the need to use units.setUnitAttr
 */
export const assignAttributes = (
  elem: Element, attrs: Record<string, string | number | undefined>, suspendLength?: number, unitCheck?: boolean
): void => {
  for (const [key, value] of Object.entries(attrs)) {
    const ns =
      key.startsWith('xml:')
        ? NS.XML
        : key.startsWith('xlink:')
          ? NS.XLINK
          : null
    if (value === undefined) {
      if (ns) {
        elem.removeAttributeNS(ns, key)
      } else {
        elem.removeAttribute(key)
      }
      continue
    }
    if (ns) {
      elem.setAttributeNS(ns, key, String(value))
    } else if (!unitCheck) {
      elem.setAttribute(key, String(value))
    } else {
      setUnitAttr(elem, key, value)
    }
  }
}

/**
 * Remove unneeded (default) attributes, making resulting SVG smaller.
 * @param element - DOM element to clean up
 */
export const cleanupElement = (element: Element): void => {
  const defaults: Record<string, string | number> = {
    'fill-opacity': 1,
    'stop-opacity': 1,
    opacity: 1,
    stroke: 'none',
    'stroke-dasharray': 'none',
    'stroke-linejoin': 'miter',
    'stroke-linecap': 'butt',
    'stroke-opacity': 1,
    'stroke-width': 1,
    rx: 0,
    ry: 0
  }

  if (element.nodeName === 'ellipse') {
    // Ellipse elements require rx and ry attributes
    delete defaults.rx
    delete defaults.ry
  }

  Object.entries(defaults).forEach(([attr, val]) => {
    if (element.getAttribute(attr) === String(val)) {
      element.removeAttribute(attr)
    }
  })
}

/**
 * Prevents default browser click behaviour on the given element.
 * @param img - The DOM element to prevent the click on
 */
export const preventClickDefault = (img: Element): void => {
  $click(img, (e: Event) => {
    e.preventDefault()
  })
}

/** Whether a value is `null` or `undefined`. */
export const isNullish = (val: unknown): boolean => {
  return val === null || val === undefined
}

/**
 * Overwrite methods for unit testing.
 */
export const mock = ({
  getHref: getHrefUser,
  setHref: setHrefUser,
  getRotationAngle: getRotationAngleUser
}: {
  getHref: typeof getHref
  setHref: typeof setHref
  getRotationAngle: typeof getRotationAngle
}): void => {
  getHref = getHrefUser
  setHref = setHrefUser
  getRotationAngle = getRotationAngleUser
}

export const stringToHTML = (str: string): ChildNode | null => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(str, 'text/html')
  return doc.body.firstChild
}

/** @param child - HTML string */
export const insertChildAtIndex = (parent: Element, child: string, index = 0): void => {
  const doc = stringToHTML(child) as Node
  if (index >= parent.children.length) {
    parent.appendChild(doc)
  } else {
    parent.insertBefore(doc, parent.children[index])
  }
}

// shortcuts to common DOM functions
/** Element types by id, filled in by the host (the editor's `ui-ids.d.ts` lists the ids of its panels), so `$id('angle')` knows what it returns. */
declare global { interface ElementIdMap {} }
export interface IdLookup {
  <K extends keyof ElementIdMap>(id: K): ElementIdMap[K] | null
  (id: string): HTMLElement | null
}
/** `$id` for code that only runs once the element exists: the element, or an error that names the id. */
export interface IdRequire {
  <K extends keyof ElementIdMap>(id: K): ElementIdMap[K]
  (id: string): HTMLElement
}
export const $id: IdLookup = (id: string): HTMLElement | null => document.getElementById(id)
export const $req: IdRequire = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`No element #${id}`)
  return el
}
export const $qq = (sel: string): Element | null => document.querySelector(sel)
export const $qa = (sel: string): Element[] => [...document.querySelectorAll(sel)]
// Scoped variants: resolve within a given root element instead of the whole
// document. svgedit's chrome uses fixed element IDs (svgcanvas, workarea, …),
// so when more than one editor is mounted in the same document a global
// getElementById returns the first instance's element. Binding $id/$qq/$qa to
// the owning editor's container lets multiple editors coexist (see svgcanvas.js
// and the editor's per-instance $id).
export const scopedId = (root: ParentNode): IdLookup => (id: string): HTMLElement | null => root.querySelector(`[id="${CSS.escape(id)}"]`)
export const scopedReq = (root: ParentNode): IdRequire => (id: string): HTMLElement => {
  const el = root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
  if (!el) throw new Error(`No element #${id}`)
  return el
}
export const scopedQq = (root: ParentNode) => (sel: string): Element | null => root.querySelector(sel)
export const scopedQa = (root: ParentNode) => (sel: string): Element[] => [...root.querySelectorAll(sel)]
export const $click = (element: EventTarget, handler: EventListener): void => {
  element.addEventListener('click', handler)
  element.addEventListener('touchend', handler)
}
