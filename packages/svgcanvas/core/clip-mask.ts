/**
 * Clip & mask creation: confine the top selected object to the silhouette of the
 * object below it, and release an existing clip/mask.
 *
 * Set operations require exactly 2 selected shapes. The lower shape (earlier in
 * DOM order) is the silhouette — it is cloned into a `<clipPath>`/`<mask>` and
 * stays fully visible on the canvas. The upper shape (the overlay/highlight)
 * receives the `clip-path`/`mask` reference so it is trimmed to that silhouette.
 * Release operates on a single element carrying a `clip-path` or `mask` attribute
 * and simply drops the reference and its definition.
 *
 * Undo/redo is fully supported via the history BatchCommand system.
 *
 * @module clip-mask
 * @license MIT
 */

import { removeIds } from './model/edit.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { BatchCommand } from './history.js'
import { warn } from '../common/logger.ts'
import { getTransformList, transformListToTransform } from './math.ts'

// Stateless helpers (no per-instance state) stay at module scope and are shared.

/** Sort two selected elements by DOM order: earlier = bottom, later = top. */
const sortByDomOrder = (elems: Element[]): [bottomElem: Element, topElem: Element] => {
  return [...elems].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  ) as [Element, Element]
}

/** Strip ids from a cloned subtree so it never collides with live canvas ids. */
const stripIds = (el: Element): void => {
  el.removeAttribute('id')
  el.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
}

/** Extract the id from a `url(#id)` reference string. */
const refId = (val: string): string => val.replace(/^url\(["']?#/, '').replace(/["']?\)$/, '')

/**
 * Paint an element fully opaque white so it reads as a full-strength silhouette
 * inside a mask. Forced via inline style so it wins over the element's own paint
 * (attribute or style) and any host CSS.
 */
const whiten = (el: SVGElement): void => {
  el.removeAttribute('fill-opacity')
  el.removeAttribute('opacity')
  el.setAttribute('fill', '#ffffff')
  el.setAttribute('stroke', 'none')
  el.style.setProperty('fill', '#ffffff', 'important')
  el.style.setProperty('fill-opacity', '1', 'important')
  el.style.setProperty('opacity', '1', 'important')
  el.style.setProperty('stroke', 'none', 'important')
}

/**
 * Make the silhouette clone align with the top element's coordinate system.
 * A clip-path/mask with userSpaceOnUse is interpreted in the local space of the
 * element referencing it (i.e. after the top element's own transform). The clone
 * carries the bottom element's transform (parent/layer space), so when the top
 * element has its own transform we pre-multiply by its inverse to keep the
 * silhouette where the bottom shape visually sits.
 */
const compensateTransform = (clone: Element, topElem: Element, bottomElem: Element): void => {
  if (!topElem.getAttribute('transform')) return // top in layer space — clone already correct
  const tTop = transformListToTransform(getTransformList(topElem)).matrix
  const tBottom = transformListToTransform(getTransformList(bottomElem)).matrix
  const m = tTop.inverse().multiply(tBottom)
  clone.setAttribute('transform', `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`)
}

// Interior luminance for an inverse feather — the masked shape stays partly
// visible inside (soft) while the rim is full white (strong).
const INVERSE_INTERIOR = '#666666'

/**
 * Paint a mask silhouette for a given (signed) feather amount.
 *   px > 0 : soft edge — solid white silhouette, blurred so it fades out at the rim.
 *   px < 0 : inverse rim — grey interior (soft) with a blurred white edge band (strong).
 *   px = 0 : plain hard-edged white silhouette.
 */
const applyFeatherTo = (child: SVGElement, px: number): void => {
  child.style.setProperty('fill-opacity', '1', 'important')
  child.style.setProperty('opacity', '1', 'important')
  if (px < 0) {
    const a = Math.abs(px)
    child.style.setProperty('fill', INVERSE_INTERIOR, 'important')
    child.style.setProperty('stroke', '#ffffff', 'important')
    child.style.setProperty('stroke-width', String(a), 'important')
    child.style.setProperty('filter', `blur(${(a * 0.6).toFixed(1)}px)`)
  } else {
    child.style.setProperty('fill', '#ffffff', 'important')
    child.style.setProperty('stroke', 'none', 'important')
    child.style.removeProperty('stroke-width')
    if (px > 0) child.style.setProperty('filter', `blur(${px}px)`)
    else child.style.removeProperty('filter')
  }
}

/** Current (signed) feather amount of the selected clipped/masked element, or 0. */
const getFeather = (elem: Element | null | undefined): number => {
  const v = elem && elem.getAttribute('data-feather')
  return v ? Number(v) : 0
}

/** What the clip / mask operations read from their canvas. */
type Host = Pick<SvgCanvas, 'getElement' | 'getSvgContent' | 'getNextId' | 'addSVGElementsFromJson' | 'findDefs' | 'history' | 'clearSelection' | 'addCommandToHistory' | 'transact' | 'insertLooseElements' | 'buildElementFromJson' | 'setElementAttributes' | 'snapshotHistory' | 'selectOnly' | 'getSelectedElements'>

/** The clip / mask / feather operations of one canvas (`svgCanvas.clipMask`). */
export interface ClipMask {
  /** Confine the top of two selected shapes to the silhouette of the bottom one (a `<clipPath>`). */
  setClip (): void
  /** Same, with a `<mask>` (the silhouette can be feathered). */
  setMask (): void
  /** Drop the clip / mask reference of the selected element and its definition. */
  releaseClipMask (): void
  /** Feather the confinement edge of the selected clipped / masked element; 0 removes it. */
  setFeather (px: number): void
  /** Current (signed) feather amount of an element, or 0. */
  getFeather (elem: Element): number
}

/**
 * The clip / mask operations of one canvas, closed over its own `svgCanvas`, so several editors can coexist in
 * one realm. The stateless helpers above are shared.
 */
export const createClipMask = (svgCanvas: Host): ClipMask => {
  /**
   * The silhouette children of the element's mask, or [] if it has no mask.
   */
  const maskChildrenOf = (elem: Element): SVGElement[] => {
    const ref = elem.getAttribute('mask')
    if (!ref) return []
    const mask = svgCanvas.getElement(refId(ref))
    return mask ? [...mask.children] as SVGElement[] : []
  }

  /**
   * Confine the top of exactly two selected shapes to the silhouette of the bottom
   * shape, via a clip path or mask. Both originals remain visible.
   */
  const performSet = (type: 'clip' | 'mask'): void => {
    const elems = svgCanvas.getSelectedElements().filter(Boolean)

    if (elems.length !== 2) {
      warn('Clip/Mask requires exactly 2 selected shapes', null, 'clip-mask')
      return
    }

    const [bottomElem, topElem] = sortByDomOrder(elems)
    const refAttr = type === 'clip' ? 'clip-path' : 'mask'
    const id = svgCanvas.getNextId()

    // Create the container and relocate it into <defs>
    const container = svgCanvas.buildElementFromJson(
      type === 'clip'
        // clipPathUnits defaults to userSpaceOnUse; set it explicitly for clarity.
        ? { element: 'clipPath', attr: { id, clipPathUnits: 'userSpaceOnUse' } }
        // Leave mask units at their defaults: maskUnits=objectBoundingBox gives a
        // region that always covers the masked element, and maskContentUnits
        // defaults to userSpaceOnUse so the silhouette clone stays in user space.
        // Setting maskUnits=userSpaceOnUse without an explicit region is fragile
        // across renderers (the region can collapse and hide everything).
        : { element: 'mask', attr: { id } }
    )
    // addSVGElementsFromJson() can return null (e.g. no live document yet).
    // Appending that straight into <defs> wouldn't throw — Element.append()
    // silently coerces it into a literal "undefined" text node instead of
    // failing loudly — so guard explicitly rather than let it corrupt <defs>.
    if (!container) {
      warn('Unable to create clip/mask container', null, 'clip-mask')
      return
    }

    // Clone the bottom shape as the silhouette; it stays visible on the canvas
    const clone = bottomElem.cloneNode(true) as SVGElement
    stripIds(clone)
    if (type === 'mask') {
      // A mask uses luminance: paint the silhouette white so the overlay shows at
      // full strength inside it (and soft/feathered once the clone is blurred).
      whiten(clone)
    }
    compensateTransform(clone, topElem, bottomElem)
    container.append(clone)

    // The definition goes into <defs> and the reference onto the top element (the overlay being trimmed), through the model
    if (container.id && topElem.id) {
      svgCanvas.clearSelection()
      svgCanvas.transact(type === 'clip' ? 'Set clip' : 'Set mask', () => {
        svgCanvas.insertLooseElements([{ parent: svgCanvas.findDefs(), el: container }])
        svgCanvas.setElementAttributes('Set reference', topElem, { [refAttr]: `url(#${id})` })
      })
      svgCanvas.selectOnly([topElem], true)
      return
    }
    svgCanvas.findDefs().append(container)
    const oldRefValue = topElem.getAttribute(refAttr)
    topElem.setAttribute(refAttr, `url(#${id})`)

    const { BatchCommand, InsertElementCommand, ChangeElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand(type === 'clip' ? 'Set clip' : 'Set mask')
    batchCmd.addSubCommand(new InsertElementCommand(container))
    batchCmd.addSubCommand(new ChangeElementCommand(topElem, { [refAttr]: oldRefValue }))

    svgCanvas.clearSelection()
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([topElem], true)
  }

  /**
   * Release the clip path or mask from the single selected element. The silhouette
   * was a throwaway clone, so the definition is simply discarded — nothing is
   * restored to the canvas (the original silhouette shape was never consumed).
   */
  const releaseClipMask = (): void => {
    const elem = svgCanvas.getSelectedElements().filter(Boolean)[0]
    if (!elem) {
      warn('Release requires a selected element', null, 'clip-mask')
      return
    }

    const refAttr = elem.getAttribute('clip-path')
      ? 'clip-path'
      : elem.getAttribute('mask')
        ? 'mask'
        : null
    if (!refAttr) {
      warn('Selected element has no clip or mask to release', null, 'clip-mask')
      return
    }

    const refValue = elem.getAttribute(refAttr)
    const id = (refValue as string).replace(/^url\(["']?#/, '').replace(/["']?\)$/, '')
    const container = svgCanvas.getElement(id)

    if (elem.id) {
      // The reference goes, and the definition with it unless something else uses it: one step, through the model
      const stillUsed = container && svgCanvas.getSvgContent()
        .querySelector(`[clip-path="url(#${id})"]:not([id="${elem.id}"]), [mask="url(#${id})"]:not([id="${elem.id}"])`)
      svgCanvas.transact('Release clip/mask', () => {
        svgCanvas.setElementAttributes('Release', elem, { [refAttr]: null })
        if (container?.id && !stillUsed) svgCanvas.snapshotHistory.edit('Release', (root) => removeIds(root, [container.id]))
      })
      svgCanvas.selectOnly([elem], true)
      return
    }
    const { BatchCommand, RemoveElementCommand, ChangeElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Release clip/mask')

    // Drop the reference from the element. The command is built after the change:
    // it reads the new value from the DOM at construction, so building it first
    // made redo restore the reference to a definition that redo then removes.
    elem.removeAttribute(refAttr)
    batchCmd.addSubCommand(new ChangeElementCommand(elem, { [refAttr]: refValue }))

    // Discard the definition only if nothing else references it
    if (container) {
      const stillReferenced = svgCanvas
        .getSvgContent()
        .querySelector(`[clip-path="url(#${id})"], [mask="url(#${id})"]`)
      if (!stillReferenced) {
        const containerNext = container.nextSibling
        const containerParent = container.parentNode
        batchCmd.addSubCommand(new RemoveElementCommand(container, containerNext, containerParent))
        container.remove()
      }
    }

    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([elem], true)
  }

  /**
   * Convert a hard clip on `elem` into an equivalent mask, so it can be feathered.
   * The clip's silhouette children are whitened and moved into a new `<mask>`.
   */
  const convertClipToMask = (elem: Element, batchCmd: BatchCommand): void => {
    const { InsertElementCommand, RemoveElementCommand, MoveElementCommand, ChangeElementCommand } =
      svgCanvas.history
    const clipEl = svgCanvas.getElement(refId(elem.getAttribute('clip-path') as string))

    const maskId = svgCanvas.getNextId()
    const mask = svgCanvas.addSVGElementsFromJson({ element: 'mask', attr: { id: maskId } })
    // See performSet()'s matching guard: addSVGElementsFromJson() can return
    // null, and appending that would silently corrupt <defs> with a literal
    // "undefined" text node rather than throw.
    if (!mask) {
      warn('Unable to create mask', null, 'clip-mask')
      return
    }
    svgCanvas.findDefs().append(mask)
    batchCmd.addSubCommand(new InsertElementCommand(mask))

    if (clipEl) {
      ;([...clipEl.children] as SVGElement[]).forEach((child) => {
        const oldNext = child.nextSibling
        const oldParent = child.parentNode
        const oldPaint = {
          fill: child.getAttribute('fill'),
          stroke: child.getAttribute('stroke'),
          'fill-opacity': child.getAttribute('fill-opacity'),
          opacity: child.getAttribute('opacity'),
          style: child.getAttribute('style')
        }
        whiten(child)
        mask.append(child)
        batchCmd.addSubCommand(new ChangeElementCommand(child, oldPaint))
        batchCmd.addSubCommand(new MoveElementCommand(child, oldNext, oldParent))
      })
    }

    const oldClip = elem.getAttribute('clip-path')
    elem.removeAttribute('clip-path')
    elem.setAttribute('mask', `url(#${maskId})`)
    batchCmd.addSubCommand(new ChangeElementCommand(elem, { 'clip-path': oldClip, mask: null }))

    if (clipEl && !clipEl.children.length) {
      const cNext = clipEl.nextSibling
      const cParent = clipEl.parentNode
      batchCmd.addSubCommand(new RemoveElementCommand(clipEl, cNext, cParent))
      clipEl.remove()
    }
  }

  /**
   * Feather the confinement edge of the selected clipped/masked element by shaping
   * its mask silhouette. Positive softens the edge; negative gives a strong rim
   * with a soft interior. A hard clip is auto-converted to a mask first. 0 removes
   * the feather.
   */
  const setFeather = (px: number): void => {
    const elem = svgCanvas.getSelectedElements().filter(Boolean)[0]
    if (!elem) return

    const { BatchCommand, ChangeElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Feather')

    if (!elem.getAttribute('mask')) {
      if (elem.getAttribute('clip-path')) {
        convertClipToMask(elem, batchCmd)
      } else {
        warn('Select a clipped or masked shape to feather', null, 'clip-mask')
        return
      }
    }

    maskChildrenOf(elem).forEach((child) => {
      const oldStyle = child.getAttribute('style')
      applyFeatherTo(child, px)
      batchCmd.addSubCommand(new ChangeElementCommand(child, { style: oldStyle }))
    })

    const oldDF = elem.getAttribute('data-feather')
    if (px === 0) elem.removeAttribute('data-feather')
    else elem.setAttribute('data-feather', String(px))
    batchCmd.addSubCommand(new ChangeElementCommand(elem, { 'data-feather': oldDF }))

    if (!batchCmd.isEmpty()) svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([elem], true)
  }

  return {
    setClip: () => performSet('clip'),
    setMask: () => performSet('mask'),
    releaseClipMask,
    setFeather,
    getFeather
  }
}
