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

import type SvgCanvas from '../svgcanvas.ts'
import Layer from './layer.ts'
import { NS } from './namespaces.ts'
import {
  getMatrixToContent, getTransformList, isIdentity, matrixMultiply, transformListToTransform
} from './math.ts'

const isLayer = (el: Element | null | undefined): boolean => Layer.isLayer(el)

/** Tags that are never user objects. */
const NON_OBJECT_TAGS = new Set(['title', 'defs', 'desc', 'metadata', 'style', 'script', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'clipPath', 'mask', 'symbol'])

/** Groups whose children are generated from a source: shown as one row, not expandable. */
const LEAF_GROUP_ATTRS = ['se:blend', 'se:art-brush', 'se:repeat']

/**
 * Is `el` something the Layers panel lists as an object row? Excludes
 * non-rendering tags, `data-se-ephemeral` overlays and generated repeat copies.
 */
export const isPanelObject = (el: Element | null | undefined): boolean => {
  if (!el || el.nodeType !== 1) return false
  if (NON_OBJECT_TAGS.has(el.tagName)) return false
  if (el.hasAttribute('data-se-ephemeral') || el.hasAttribute('se:repeat-copy')) return false
  return true
}

/**
 * Does the group list its children as rows? (A plain `<g>`/`<a>`; not a blend,
 * brushed path or repeat, whose children are generated.)
 */
export const isExpandableGroup = (el: Element): boolean =>
  (el.tagName === 'g' || el.tagName === 'a') && !isLayer(el) &&
  !LEAF_GROUP_ATTRS.some((a) => el.hasAttribute(a))

/**
 * Is the object itself marked locked? (Layers carry the same attribute; this
 * looks at the element only.)
 */
export const hasLockMark = (el: Element): boolean => el.getAttributeNS(NS.SE, 'locked') === 'true'

/** Is the layer a tracing template (`se:template`)? Its objects cannot be selected. */
const isTemplateLayer = (el: Element): boolean => el.getAttributeNS(NS.SE, 'template') === 'true'

/**
 * Is the object, or a group above it (up to the layer), locked? A locked
 * *layer* does not make its objects unselectable (a layer lock only redirects
 * newly drawn objects), but a tracing-template layer does.
 */
export const isObjectLocked = (el: Element | null | undefined): boolean => {
  let cur: Element | null | undefined = el
  while (cur && cur.nodeType === 1 && !isLayer(cur) && cur.tagName !== 'svg') {
    if (hasLockMark(cur)) return true
    cur = cur.parentNode instanceof Element ? cur.parentNode : null
  }
  return !!cur && isLayer(cur) && isTemplateLayer(cur)
}

/** Is the object itself hidden? */
export const isObjectHidden = (el: Element): boolean => el.getAttribute('display') === 'none'

/** Can `parent` receive moved objects? A layer, or a plain group. */
export const canHoldObjects = (parent: Element | null): boolean => !!parent && (isLayer(parent) || isExpandableGroup(parent))

/**
 * Re-express `el`'s transform so that it stays where it is on screen after it
 * moves from `oldParent` to `newParent`: `new⁻¹ · old · own`.
 */
const keepPosition = (el: Element, oldParent: Element, newParent: Element): void => {
  const oldM = getMatrixToContent(oldParent)
  const newM = getMatrixToContent(newParent)
  if (isIdentity(oldM) && isIdentity(newM)) return
  const own = transformListToTransform(getTransformList(el)).matrix
  const m = matrixMultiply(newM.inverse(), oldM, own)
  if (isIdentity(m)) el.removeAttribute('transform')
  else el.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`)
}

/** The members `object-state.ts` gives its canvas. */
export interface ObjectStateApi {
  /** Every element (current group, else visible layers) sharing the criterion with `ref`, `ref` included; selects nothing. */
  /** Replace the selected shape with a group of rows × cols rects over its bounding box (one undo step); null when nothing was done. */
  /** Whether `elem` is a plain shape that Split Into Grid can take. */
  /** Scale / move / rotate / reflect every selected object about its own reference point (one undo step); returns the transformed elements. */
  /** Hide (`display="none"`) or show objects as one undo step; hidden objects leave the selection. False when nothing changed. */
  setObjectsHidden(elems: Element[], hidden: boolean): boolean
  /** Lock (`se:locked`) or unlock objects as one undo step; locked objects (and what is inside a locked group) cannot be selected. False when nothing changed. */
  setObjectsLocked(elems: Element[], locked: boolean): boolean
  hasLockedObjects(): boolean
  hasHiddenObjects(): boolean
  unlockAllObjects(): boolean
  showAllObjects(): boolean
  /** Set or clear an object's `data-name` as one undo step. */
  setObjectName(el: Element, name: string): boolean
  /** Why the objects cannot be moved into `parent` (a layer or plain group) in front of `before`, or null. */
  objectMoveIssue(elems: Element[], parent: Element, before?: Node | null): string | null
  /** Move objects into `parent` in front of `before` (the end when null) as one undo step, keeping their place on the page. False when refused or nothing moved. */
  moveObjects(elems: Element[], parent: Element, before?: Node | null): boolean
}

export const createObjectState = (canvas: SvgCanvas): ObjectStateApi => {
  const svgCanvas = canvas

  /** Drop `elems` (and anything inside them) from the selection. */
  const unselect = (elems: Element[]): void => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.some((s) => elems.some((e) => e === s || e.contains(s)))) return
    svgCanvas.selectOnly(selected.filter((s) => !elems.some((e) => e === s || e.contains(s))))
  }

  /**
   * Hide or show objects as one undo step. Hidden objects leave the selection.
   * @returns false when nothing changed
   */

  /**
   * Lock or unlock objects as one undo step. Locked objects leave the selection.
   * @returns false when nothing changed
   */

  /**
   * The objects the Layers panel lists, at any depth (layers themselves excluded; a generated group is one object),
   * that satisfy `test`.
   * @param firstOnly stop at the first match
   */
  const collectObjects = (test: (el: Element) => boolean, firstOnly = false): Element[] => {
    const found: Element[] = []
    /** @returns true to stop */
    const walk = (parent: Element): boolean => {
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
   */

  /**
   * Is any object hidden? (Cheap: stops at the first.)
   */

  /**
   * Unlock every locked object as one undo step.
   * @returns false when nothing was locked
   */

  /**
   * Show every hidden object as one undo step.
   * @returns false when nothing was hidden
   */

  /**
   * Give an object a name (`data-name`, what group names already use) as one undo step.
   * An empty name removes it.
   * @returns false when nothing changed
   */

  /**
   * Why `elems` cannot be moved into `parent` (before `before`), or null when
   * they can. A target must be a layer or plain group that is not one of the
   * moved objects or inside one.
   */

  /**
   * Move objects into `parent`, in front of `before` (the end when null), as one
   * undo step, keeping their place on the page (the parents' transforms are
   * folded into each object's own). The order among `elems` is the document order.
   * @param parent a layer or plain group
   * @returns false when refused or nothing moved
   */

  return {
    setObjectsHidden: (elems, hidden) => {
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
    },
    setObjectsLocked: (elems, locked) => {
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
    },
    hasLockedObjects: () => collectObjects(hasLockMark, true).length > 0,
    hasHiddenObjects: () => collectObjects(isObjectHidden, true).length > 0,
    unlockAllObjects: () => svgCanvas.setObjectsLocked(collectObjects(hasLockMark), false),
    showAllObjects: () => svgCanvas.setObjectsHidden(collectObjects(isObjectHidden), false),
    setObjectName: (el, name) => {
      const clean = String(name ?? '').trim()
      if ((el.getAttribute('data-name') ?? '') === clean) return false
      svgCanvas.transact('Rename', () => {
        if (clean) el.setAttribute('data-name', clean)
        else el.removeAttribute('data-name')
      })
      return true
    },
    objectMoveIssue: (elems, parent, before = null) => {
      if (!elems.length) return 'nothing to move'
      if (!canHoldObjects(parent)) return 'target cannot hold objects'
      if (elems.some((e) => e === parent || e.contains(parent))) return 'cannot move a group into itself'
      if (before && before.parentNode !== parent) return 'bad insertion point'
      return null
    },
    moveObjects: (elems, parent, before = null) => {
      if (svgCanvas.objectMoveIssue(elems, parent, before)) return false
      const ordered = [...elems].sort((a, b) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
      // Moving a node in front of itself is a no-op insertion point.
      let anchor = before
      while (anchor && ordered.includes(anchor as Element)) anchor = anchor.nextSibling
      const unchanged = ordered.every((e, i) => e.parentNode === parent &&
        e.nextSibling === (ordered[i + 1] ?? anchor))
      if (unchanged) return false
      svgCanvas.transact('Move', () => {
        for (const el of ordered) {
          const oldParent = el.parentNode as Element
          parent.insertBefore(el, anchor)
          if (oldParent !== parent) keepPosition(el, oldParent, parent)
        }
      })
      return true
    }
  }
}
