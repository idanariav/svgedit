// @ts-check
/**
 * Per-object state for the Layers panel's object rows: hidden (`display="none"`,
 * the same mechanism as a hidden layer), locked (`se:locked="true"`, the same
 * attribute a locked layer carries) and moving objects between parents.
 *
 * A locked object, or one inside a locked group, cannot be selected: not by a
 * click, a rubber band, select-all nor from its panel row (unlock it first).
 * The check lives in `addToSelection` and the hit-testing helpers of
 * `selection.js`, which import `isObjectLocked` from here.
 *
 * Hide / lock / move are each one undo step (`svgCanvas.transact`).
 *
 * Ported idea: VectorCraft's layer panel (`crates/ui-egui/src/panels/layers.rs`,
 * MIT OR Apache-2.0): rows per object, eye and lock per row, drag to re-parent.
 * @module object-state
 * @license MIT
 */

import Layer from './layer.js'
import { NS } from './namespaces.js'
import {
  getMatrixToContent, getTransformList, isIdentity, matrixMultiply, transformListToTransform
} from './math.js'

/** @param {any} el @returns {boolean} */
const isLayer = (el) => !!Layer.isLayer(el)

/** Tags that are never user objects. */
const NON_OBJECT_TAGS = new Set(['title', 'defs', 'desc', 'metadata', 'style', 'script', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'clipPath', 'mask', 'symbol'])

/** Groups whose children are generated from a source: shown as one row, not expandable. */
const LEAF_GROUP_ATTRS = ['se:blend', 'se:art-brush', 'se:repeat']

/**
 * Is `el` something the Layers panel lists as an object row? Excludes
 * non-rendering tags, `data-se-ephemeral` overlays and generated repeat copies.
 * @param {Element} el
 * @returns {boolean}
 */
export const isPanelObject = (el) => {
  if (!el || el.nodeType !== 1) return false
  if (NON_OBJECT_TAGS.has(el.tagName)) return false
  if (el.hasAttribute('data-se-ephemeral') || el.hasAttribute('se:repeat-copy')) return false
  return true
}

/**
 * Does the group list its children as rows? (A plain `<g>`/`<a>`; not a blend,
 * brushed path or repeat, whose children are generated.)
 * @param {Element} el
 * @returns {boolean}
 */
export const isExpandableGroup = (el) =>
  (el.tagName === 'g' || el.tagName === 'a') && !isLayer(el) &&
  !LEAF_GROUP_ATTRS.some((a) => el.hasAttribute(a))

/**
 * Is the object itself marked locked? (Layers carry the same attribute; this
 * looks at the element only.)
 * @param {Element} el
 * @returns {boolean}
 */
export const hasLockMark = (el) => el.getAttributeNS(NS.SE, 'locked') === 'true'

/**
 * Is the layer a tracing template (`se:template`)? Its objects cannot be selected.
 * @param {Element} el
 * @returns {boolean}
 */
const isTemplateLayer = (el) => el.getAttributeNS(NS.SE, 'template') === 'true'

/**
 * Is the object, or a group above it (up to the layer), locked? A locked
 * *layer* does not make its objects unselectable (a layer lock only redirects
 * newly drawn objects), but a tracing-template layer does.
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
export const isObjectLocked = (el) => {
  let cur = el
  while (cur && cur.nodeType === 1 && !isLayer(cur) && cur.tagName !== 'svg') {
    if (hasLockMark(cur)) return true
    cur = cur.parentNode instanceof Element ? cur.parentNode : null
  }
  return !!cur && isLayer(cur) && isTemplateLayer(cur)
}

/**
 * Is the object itself hidden?
 * @param {Element} el
 * @returns {boolean}
 */
export const isObjectHidden = (el) => el.getAttribute('display') === 'none'

/**
 * Can `parent` receive moved objects? A layer, or a plain group.
 * @param {Element|null} parent
 * @returns {boolean}
 */
export const canHoldObjects = (parent) => !!parent && (isLayer(parent) || isExpandableGroup(parent))

/**
 * Re-express `el`'s transform so that it stays where it is on screen after it
 * moves from `oldParent` to `newParent`: `new⁻¹ · old · own`.
 * @param {Element} el
 * @param {Element} oldParent
 * @param {Element} newParent
 * @returns {void}
 */
const keepPosition = (el, oldParent, newParent) => {
  const oldM = getMatrixToContent(/** @type {any} */ (oldParent))
  const newM = getMatrixToContent(/** @type {any} */ (newParent))
  if (isIdentity(oldM) && isIdentity(newM)) return
  const own = transformListToTransform(/** @type {any} */ (getTransformList(el))).matrix
  const m = matrixMultiply(newM.inverse(), oldM, own)
  if (isIdentity(m)) el.removeAttribute('transform')
  else el.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`)
}

/**
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = /** @type {any} */ (canvas)

  /**
   * Drop `elems` (and anything inside them) from the selection.
   * @param {Element[]} elems
   * @returns {void}
   */
  const unselect = (elems) => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.some((/** @type {Element} */ s) => elems.some((e) => e === s || e.contains(s)))) return
    svgCanvas.selectOnly(selected.filter((/** @type {Element} */ s) => !elems.some((e) => e === s || e.contains(s))))
  }

  /**
   * Hide or show objects as one undo step. Hidden objects leave the selection.
   * @function module:object-state.SvgCanvas#setObjectsHidden
   * @param {Element[]} elems
   * @param {boolean} hidden
   * @returns {boolean} false when nothing changed
   */
  svgCanvas.setObjectsHidden = (elems, hidden) => {
    const todo = elems.filter((e) => isPanelObject(e) && isObjectHidden(e) !== hidden)
    if (!todo.length) return false
    if (hidden) unselect(todo)
    svgCanvas.transact(hidden ? 'Hide' : 'Show', () => {
      for (const el of todo) {
        if (hidden) el.setAttribute('display', 'none')
        else el.removeAttribute('display')
      }
    })
    return true
  }

  /**
   * Lock or unlock objects as one undo step. Locked objects leave the selection.
   * @function module:object-state.SvgCanvas#setObjectsLocked
   * @param {Element[]} elems
   * @param {boolean} locked
   * @returns {boolean} false when nothing changed
   */
  svgCanvas.setObjectsLocked = (elems, locked) => {
    const todo = elems.filter((e) => isPanelObject(e) && hasLockMark(e) !== locked)
    if (!todo.length) return false
    if (locked) unselect(todo)
    svgCanvas.transact(locked ? 'Lock' : 'Unlock', () => {
      for (const el of todo) {
        if (locked) el.setAttributeNS(NS.SE, 'se:locked', 'true')
        else el.removeAttributeNS(NS.SE, 'locked')
      }
    })
    return true
  }

  /**
   * The objects the Layers panel lists, at any depth (layers themselves excluded; a generated group is one object),
   * that satisfy `test`.
   * @param {(el: Element) => boolean} test
   * @param {boolean} [firstOnly] stop at the first match
   * @returns {Element[]}
   */
  const collectObjects = (test, firstOnly = false) => {
    /** @type {Element[]} */
    const found = []
    /** @param {Element} parent @returns {boolean} true to stop */
    const walk = (parent) => {
      for (const el of parent.children) {
        if (!isPanelObject(el)) continue
        if (test(el)) {
          found.push(el)
          if (firstOnly) return true
        }
        if (isExpandableGroup(el) && walk(el)) return true
      }
      return false
    }
    for (const layer of svgCanvas.getSvgContent().children) {
      if (isLayer(layer) && walk(layer)) break
    }
    return found
  }

  /**
   * Is any object locked? (Cheap: stops at the first.)
   * @function module:object-state.SvgCanvas#hasLockedObjects
   * @returns {boolean}
   */
  svgCanvas.hasLockedObjects = () => collectObjects(hasLockMark, true).length > 0

  /**
   * Is any object hidden? (Cheap: stops at the first.)
   * @function module:object-state.SvgCanvas#hasHiddenObjects
   * @returns {boolean}
   */
  svgCanvas.hasHiddenObjects = () => collectObjects(isObjectHidden, true).length > 0

  /**
   * Unlock every locked object as one undo step.
   * @function module:object-state.SvgCanvas#unlockAllObjects
   * @returns {boolean} false when nothing was locked
   */
  svgCanvas.unlockAllObjects = () => svgCanvas.setObjectsLocked(collectObjects(hasLockMark), false)

  /**
   * Show every hidden object as one undo step.
   * @function module:object-state.SvgCanvas#showAllObjects
   * @returns {boolean} false when nothing was hidden
   */
  svgCanvas.showAllObjects = () => svgCanvas.setObjectsHidden(collectObjects(isObjectHidden), false)

  /**
   * Give an object a name (`data-name`, what group names already use) as one undo step.
   * An empty name removes it.
   * @function module:object-state.SvgCanvas#setObjectName
   * @param {Element} el
   * @param {string} name
   * @returns {boolean} false when nothing changed
   */
  svgCanvas.setObjectName = (el, name) => {
    const clean = String(name ?? '').trim()
    if ((el.getAttribute('data-name') ?? '') === clean) return false
    svgCanvas.transact('Rename', () => {
      if (clean) el.setAttribute('data-name', clean)
      else el.removeAttribute('data-name')
    })
    return true
  }

  /**
   * Why `elems` cannot be moved into `parent` (before `before`), or null when
   * they can. A target must be a layer or plain group that is not one of the
   * moved objects or inside one.
   * @function module:object-state.SvgCanvas#objectMoveIssue
   * @param {Element[]} elems
   * @param {Element} parent
   * @param {Node|null} [before]
   * @returns {string|null}
   */
  svgCanvas.objectMoveIssue = (elems, parent, before = null) => {
    if (!elems.length) return 'nothing to move'
    if (!canHoldObjects(parent)) return 'target cannot hold objects'
    if (elems.some((e) => e === parent || e.contains(parent))) return 'cannot move a group into itself'
    if (before && before.parentNode !== parent) return 'bad insertion point'
    return null
  }

  /**
   * Move objects into `parent`, in front of `before` (the end when null), as one
   * undo step, keeping their place on the page (the parents' transforms are
   * folded into each object's own). The order among `elems` is the document order.
   * @function module:object-state.SvgCanvas#moveObjects
   * @param {Element[]} elems
   * @param {Element} parent a layer or plain group
   * @param {Node|null} [before]
   * @returns {boolean} false when refused or nothing moved
   */
  svgCanvas.moveObjects = (elems, parent, before = null) => {
    if (svgCanvas.objectMoveIssue(elems, parent, before)) return false
    const ordered = [...elems].sort((a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
    // Moving a node in front of itself is a no-op insertion point.
    let anchor = before
    while (anchor && ordered.includes(/** @type {Element} */ (anchor))) anchor = anchor.nextSibling
    const unchanged = ordered.every((e, i) => e.parentNode === parent &&
      e.nextSibling === (ordered[i + 1] ?? anchor))
    if (unchanged) return false
    svgCanvas.transact('Move', () => {
      for (const el of ordered) {
        const oldParent = /** @type {Element} */ (el.parentNode)
        parent.insertBefore(el, anchor)
        if (oldParent !== parent) keepPosition(el, oldParent, parent)
      }
    })
    return true
  }
}
