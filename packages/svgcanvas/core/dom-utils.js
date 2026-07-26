/**
 * DOM/element manipulation, lookup, and misc canvas-state utilities.
 * @module dom-utils
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { setUnitAttr, getTypeMap } from './units.js'
import { getTransformList } from './math.js'

/**
 * Object with the following keys/values.
 * @typedef {PlainObject} module:utilities.SVGElementJSON
 * @property {string} element - Tag name of the SVG element to create
 * @property {PlainObject<string, string>} attr - Has key-value attributes to assign to the new element.
 *   An `id` should be set so that {@link module:utilities.EditorContext#addSVGElementsFromJson} can later re-identify the element for modification or replacement.
 * @property {boolean} [curStyles=false] - Indicates whether current style attributes should be applied first
 * @property {module:utilities.SVGElementJSON[]} [children] - Data objects to be added recursively as children
 * @property {string} [namespace="http://www.w3.org/2000/svg"] - Indicate a (non-SVG) namespace
 */

/**
 * An object that creates SVG elements for the canvas.
 *
 * @interface module:utilities.EditorContext
 * @property {module:path.pathActions} pathActions
 */
/**
 * @function module:utilities.EditorContext#getSvgContent
 * @returns {SVGSVGElement}
 */
/**
 * Create a new SVG element based on the given object keys/values and add it
 * to the current layer.
 * The element will be run through `cleanupElement` before being returned.
 * @function module:utilities.EditorContext#addSVGElementsFromJson
 * @param {module:utilities.SVGElementJSON} data
 * @returns {Element} The new element
 */
/**
 * @function module:utilities.EditorContext#getSelectedElements
 * @returns {Element[]} the array with selected DOM elements
 */
/**
 * @function module:utilities.EditorContext#getDOMDocument
 * @returns {HTMLDocument}
 */
/**
 * @function module:utilities.EditorContext#getDOMContainer
 * @returns {HTMLElement}
 */
/**
 * @function module:utilities.EditorContext#getSvgRoot
 * @returns {SVGSVGElement}
 */
/**
 * @function module:utilities.EditorContext#getBaseUnit
 * @returns {string}
 */
/**
 * @function module:utilities.EditorContext#getSnappingStep
 * @returns {Float|string}
 */

/**
 * Attaches the canvas-state-dependent helpers (element/defs lookup, grid
 * snapping) directly onto the given instance, closed over it — per-instance,
 * like every other `core/*.js` module's `init(canvas)`. These have no
 * elem-only equivalent (an id/attr-value lookup or the grid config has
 * nothing to be "pure" against), unlike `getBBox`/`getRotationAngle` below,
 * which stay bare+pure and only get an instance-scoped selection-fallback
 * wrapper here.
 * @function module:dom-utils.init
 * @param {module:utilities.EditorContext} canvas
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /**
   * Get a DOM element by ID within the SVG root element.
   * @function module:dom-utils.EditorContext#getElement
   * @param {string} id - String with the element's new ID
   * @returns {?Element}
   */
  const getElement = id => svgCanvas.getSvgRoot()?.querySelector(`#${CSS.escape(id)}`)

  /**
   * @function module:dom-utils.EditorContext#findDefs
   * @returns {SVGDefsElement} The document's `<defs>` element, creating it first if necessary
   */
  const findDefs = () => {
    const svgElement = svgCanvas.getSvgContent()
    const existingDefs = svgElement.getElementsByTagNameNS(NS.SVG, 'defs')

    if (existingDefs.length > 0) {
      return existingDefs[0]
    }

    const defs = svgElement.ownerDocument.createElementNS(NS.SVG, 'defs')
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
   * @function module:dom-utils.EditorContext#getRefElem
   * @param {string} attrVal - The attribute value as a string
   * @returns {Element} Reference element
   */
  const getRefElem = attrVal => {
    if (!attrVal) return null
    const url = getUrlFromAttr(attrVal)
    if (!url) return null
    const id = url[0] === '#' ? url.slice(1) : url
    return getElement(id)
  }

  /**
   * Collect the `<defs>` elements (gradients, filters, markers, masks,
   * clip-paths, …) transitively referenced by the given elements, so a
   * copy/paste or shape-library save can carry its paint servers along instead
   * of leaving dangling `url(#…)` references when pasted into another document.
   * @function module:dom-utils.EditorContext#getReferencedDefElements
   * @param {Element[]} elems - root elements to scan (descendants are scanned too)
   * @returns {Element[]} de-duplicated referenced def elements, dependencies first
   */
  const getReferencedDefElements = (elems) => {
    const seen = new Set()
    const ordered = []
    const idsOf = (el) => {
      const ids = []
      REF_ATTRS.forEach((name) => {
        const url = getUrlFromAttr(el.getAttribute?.(name))
        if (url) ids.push(url[0] === '#' ? url.slice(1) : url)
      })
      const href = getHref(el)
      if (href?.startsWith('#')) ids.push(href.slice(1))
      return ids
    }
    const visit = (el) => {
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

  /**
   * Snapping step size in px (snappingStep converted from the current base unit).
   * @returns {Float}
   */
  const getSnapStepSize = () => {
    const unit = svgCanvas.getBaseUnit()
    let stepSize = svgCanvas.getSnappingStep()
    if (unit !== 'px') {
      stepSize *= getTypeMap()[unit]
    }
    return stepSize
  }

  /**
   * Round value to for snapping.
   * @function module:dom-utils.EditorContext#snapToGrid
   * @param {Float} value
   * @returns {Integer}
   */
  const snapToGrid = value => {
    value = Math.round(value / getSnapStepSize()) * getSnapStepSize()
    return value
  }

  /**
   * Snap a point to the nearest node of the active grid lattice.
   * For the `square` grid (and the non-lattice perspective grids) this is just
   * per-axis rounding, identical to calling {@link module:dom-utils.EditorContext#snapToGrid}
   * on each coordinate. For the `isometric` and `triangle` grids the point is
   * snapped to the nearest node of the corresponding skewed lattice by inverting
   * its basis vectors.
   * @function module:dom-utils.EditorContext#snapPointToGrid
   * @param {Float} x
   * @param {Float} y
   * @returns {{x: Float, y: Float}}
   */
  const snapPointToGrid = (x, y) => {
    const shape = svgCanvas.getGridShape ? svgCanvas.getGridShape() : 'square'
    if (shape === 'isometric' || shape === 'triangle') {
      const s = getSnapStepSize()
      let ax, ay, bx, by
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

  canvas.getElement = getElement
  canvas.findDefs = findDefs
  canvas.getRefElem = getRefElem
  canvas.getReferencedDefElements = getReferencedDefElements
  canvas.snapToGrid = snapToGrid
  canvas.snapPointToGrid = snapPointToGrid
  // getRotationAngle stays a bare, pure (elem-required) export below — every
  // call site already passes an elem — but the public per-instance API keeps
  // the "default to current selection" convenience, correctly scoped now.
  canvas.getRotationAngle = (elem, toRad) => getRotationAngle(elem || svgCanvas.getSelectedElements()[0], toRad)
}

/**
 * Multiplier applied to font-size to derive the row step for multiline text.
 * @type {Float}
 */
export const TEXT_LINE_HEIGHT = 1.2

/**
 * Read a `<text>` element's content as a newline-joined string. Multiline text
 * is stored as one `<tspan>` per row (SVG has no newline character), so this
 * reconstructs the `\n`-separated value used by the edit buffer and undo
 * history. A single-line `<text>` (no tspans) falls back to plain `textContent`.
 * @function module:dom-utils.getTextWithNewlines
 * @param {Element} elem - The `<text>` element
 * @returns {string}
 */
export const getTextWithNewlines = (elem) => {
  if (!elem) { return '' }
  const tspans = Array.from(elem.children).filter((c) => c.tagName === 'tspan')
  if (tspans.length) {
    return tspans.map((t) => t.textContent).join('\n')
  }
  return elem.textContent
}

/**
 * Render a `\n`-separated string onto a `<text>` element. A single line is set
 * as plain `textContent` (no tspans); multiple lines become one absolutely
 * positioned `<tspan>` per row sharing the text's `x` (so `text-anchor` aligns
 * them) and stepping `y` by the line height. Absolute `y` per row (rather than
 * `dy` accumulation) is robust to blank rows and is what `recalculate` bakes.
 * @function module:dom-utils.setMultilineText
 * @param {Element} elem - The `<text>` element
 * @param {string} value - The new content, rows separated by `\n`
 * @param {Float} [fontSizeFallback=16] - Used when the element has no font-size
 * @returns {void}
 */
export const setMultilineText = (elem, value, fontSizeFallback = 16) => {
  const val = value === null || value === undefined ? '' : String(value)
  const lines = val.split('\n')
  if (lines.length <= 1) {
    // Single row — plain text node (also clears any existing tspans)
    elem.textContent = val
    return
  }
  const x = parseFloat(elem.getAttribute('x')) || 0
  const baseY = parseFloat(elem.getAttribute('y')) || 0
  const fontSize = parseFloat(elem.getAttribute('font-size')) || fontSizeFallback
  const lineHeight = fontSize * TEXT_LINE_HEIGHT
  elem.textContent = '' // remove all existing children
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(NS.SVG, 'tspan')
    tspan.setAttribute('x', x)
    tspan.setAttribute('y', baseY + i * lineHeight)
    tspan.textContent = line
    elem.append(tspan)
  })
}

/**
 * @callback module:utilities.TreeWalker
 * @param {Element} elem - DOM element being traversed
 * @returns {void}
 */

/**
 * Walks the tree and executes the callback on each element in a top-down fashion.
 * @function module:dom-utils.walkTree
 * @param {Element} elem - DOM element to traverse
 * @param {module:utilities.TreeWalker} cbFn - Callback function to run on each element
 * @returns {void}
 */
export const walkTree = (elem, cbFn) => {
  if (elem?.nodeType === 1) {
    cbFn(elem)
    let i = elem.childNodes.length
    while (i--) {
      walkTree(elem.childNodes.item(i), cbFn)
    }
  }
}

/**
 * Walks the tree and executes the callback on each element in a depth-first fashion.
 * @function module:dom-utils.walkTreePost
 * @todo Shouldn't this be calling walkTreePost?
 * @param {Element} elem - DOM element to traverse
 * @param {module:utilities.TreeWalker} cbFn - Callback function to run on each element
 * @returns {void}
 */
export const walkTreePost = (elem, cbFn) => {
  if (elem?.nodeType === 1) {
    let i = elem.childNodes.length
    while (i--) {
      walkTree(elem.childNodes.item(i), cbFn)
    }
    cbFn(elem)
  }
}

/**
 * Extracts the URL from the `url(...)` syntax of some attributes.
 * Three variants:
 *  - `<circle fill="url(someFile.svg#foo)" />`
 *  - `<circle fill="url('someFile.svg#foo')" />`
 *  - `<circle fill='url("someFile.svg#foo")' />`
 * @function module:dom-utils.getUrlFromAttr
 * @param {string} attrVal The attribute value as a string
 * @returns {string|null} String with just the URL, like "someFile.svg#foo"
 */
export const getUrlFromAttr = (attrVal) => {
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

/**
 * @function module:dom-utils.getHref
 * @param {Element} elem
 * @returns {string} The given element's `href` value
 */
export let getHref = (elem) =>
  elem.getAttribute('href') ?? elem.getAttributeNS(NS.XLINK, 'href')

/**
 * Sets the given element's `href` value.
 * @function module:dom-utils.setHref
 * @param {Element} elem
 * @param {string} val
 * @returns {void}
 */
export let setHref = (elem, val) => {
  elem.setAttribute('href', val)
}

/**
 * Get the rotation angle of the given transform list.
 * @function module:dom-utils.getRotationAngleFromTransformList
 * @param {SVGTransformList} tlist - List of transforms
 * @param {boolean} toRad - When true returns the value in radians rather than degrees
 * @returns {Float} The angle in degrees or radians
 */
export const getRotationAngleFromTransformList = (tlist, toRad) => {
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
 * @function module:dom-utils.getRotationAngle
 * @param {Element} elem - DOM element to get the angle for
 * @param {boolean} [toRad=false] - When true returns the value in radians rather than degrees
 * @returns {Float} The angle in degrees or radians
 */
export let getRotationAngle = (elem, toRad) => {
  const tlist = getTransformList(elem)
  return getRotationAngleFromTransformList(tlist, toRad)
}

/**
 * Attributes whose value may be a `url(#id)` reference to a `<defs>` element
 * (paint servers, filters, markers, masks, clip-paths).
 * @type {string[]}
 */
const REF_ATTRS = [
  'clip-path', 'fill', 'filter', 'marker-end', 'marker-mid',
  'marker-start', 'mask', 'stroke'
]

/**
 * Rewrite every `id` on the given root elements (and their descendants) to a
 * fresh id, then update any internal `url(#…)` / `href="#…"` references so they
 * keep pointing at the renamed elements. Used when inserting a stored shape so
 * repeated insertions don't collide on ids with each other or the canvas.
 * @function module:dom-utils.remapElementIdsAndRefs
 * @param {Element[]} rootEls - root elements to remap (self + descendants)
 * @param {function(): string} getNewId - supplies a fresh unique id per call
 * @returns {PlainObject<string, string>} map of old id → new id
 */
export const remapElementIdsAndRefs = (rootEls, getNewId) => {
  const idMap = {}
  const allEls = []
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
      const val = el.getAttribute?.(name)
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
/**
 * Get the reference element associated with the given attribute value.
 * @function module:dom-utils.getFeGaussianBlur
 * @param {any} Element
 * @returns {any} Reference element
 */
export const getFeGaussianBlur = ele => {
  if (ele?.firstChild?.tagName === 'feGaussianBlur') {
    return ele.firstChild
  } else {
    const childrens = ele.children
    // eslint-disable-next-line no-unused-vars
    for (const [_, value] of Object.entries(childrens)) {
      if (value.tagName === 'feGaussianBlur') {
        return value
      }
    }
  }
  return null
}

/**
 * Assigns multiple attributes to an element.
 * @function module:dom-utils.assignAttributes
 * @param {Element} elem - DOM element to apply new attribute values to
 * @param {PlainObject<string, string>} attrs - Object with attribute keys/values
 * @param {Integer} [suspendLength] - Milliseconds to suspend redraw
 * @param {boolean} [unitCheck=false] - Boolean to indicate the need to use units.setUnitAttr
 * @returns {void}
 */
export const assignAttributes = (elem, attrs, suspendLength, unitCheck) => {
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
      elem.setAttributeNS(ns, key, value)
    } else if (!unitCheck) {
      elem.setAttribute(key, value)
    } else {
      setUnitAttr(elem, key, value)
    }
  }
}

/**
 * Remove unneeded (default) attributes, making resulting SVG smaller.
 * @function module:dom-utils.cleanupElement
 * @param {Element} element - DOM element to clean up
 * @returns {void}
 */
export const cleanupElement = element => {
  const defaults = {
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
 * @function module:dom-utils.preventClickDefault
 * @param {Element} img - The DOM element to prevent the click on
 * @returns {void}
 */
export const preventClickDefault = img => {
  $click(img, e => {
    e.preventDefault()
  })
}

/**
 * @callback module:utilities.GetNextID
 * @returns {string} The ID
 */

/**
 * Whether a value is `null` or `undefined`.
 * @param {any} val
 * @returns {boolean}
 */
export const isNullish = val => {
  return val === null || val === undefined
}

/**
 * Overwrite methods for unit testing.
 * @function module:dom-utils.mock
 * @param {PlainObject} mockMethods
 * @param {module:dom-utils.getHref} mockMethods.getHref
 * @param {module:dom-utils.setHref} mockMethods.setHref
 * @param {module:dom-utils.getRotationAngle} mockMethods.getRotationAngle
 * @returns {void}
 */
export const mock = ({
  getHref: getHrefUser,
  setHref: setHrefUser,
  getRotationAngle: getRotationAngleUser
}) => {
  getHref = getHrefUser
  setHref = setHrefUser
  getRotationAngle = getRotationAngleUser
}

export const stringToHTML = str => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(str, 'text/html')
  return doc.body.firstChild
}

export const insertChildAtIndex = (parent, child, index = 0) => {
  const doc = stringToHTML(child)
  if (index >= parent.children.length) {
    parent.appendChild(doc)
  } else {
    parent.insertBefore(doc, parent.children[index])
  }
}

// shortcuts to common DOM functions
export const $id = id => document.getElementById(id)
export const $qq = sel => document.querySelector(sel)
export const $qa = sel => [...document.querySelectorAll(sel)]
// Scoped variants: resolve within a given root element instead of the whole
// document. svgedit's chrome uses fixed element IDs (svgcanvas, workarea, …),
// so when more than one editor is mounted in the same document a global
// getElementById returns the first instance's element. Binding $id/$qq/$qa to
// the owning editor's container lets multiple editors coexist (see svgcanvas.js
// and the editor's per-instance $id).
export const scopedId = root => id => root.querySelector(`[id="${CSS.escape(id)}"]`)
export const scopedQq = root => sel => root.querySelector(sel)
export const scopedQa = root => sel => [...root.querySelectorAll(sel)]
export const $click = (element, handler) => {
  element.addEventListener('click', handler)
  element.addEventListener('touchend', handler)
}
