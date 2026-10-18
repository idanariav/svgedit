/**
 * Tools for SVG selected element operation.
 * @module selected-elem
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import * as hstry from './history.js'
import { assignAttributes, getUrlFromAttr } from './dom-utils.ts'
import { matrixMultiply, transformListToTransform, getTransformList } from './math.ts'
import { setAttrsById } from './model/edit.ts'
import { translationEdit } from './model-commands.ts'
import { getGroupDetachTarget, applyGroupDetachTransform } from './group-detach.ts'
import { createGroupOps } from './group-ops.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { BBoxObject } from './bbox-utils.ts'
import type { HistoryCommand } from '../svgcanvas.ts'

const {
  BatchCommand,
  ChangeElementCommand
} = hstry

type Box = BBoxObject

/** The members `selected-elem.ts` gives its canvas. */
export interface SelectedElemApi {
  copySelectedElements(): void
  // Element manipulation
  moveSelectedElements(dx: number | number[], dy: number | number[], undoable?: boolean): (HistoryCommand & { isEmpty(): boolean }) | undefined
  cloneSelectedElements(x: number, y: number): void
  transformAgain(): void
  matchStrokes(): void
  alignSelectedElements(type: string, relativeTo: string): void
  updateCanvas(w: number, h: number): { x: number, y: number, old_x: number, old_y: number, d_x: number, d_y: number }
  /** Select the next (true) or previous (false) element in the current layer. */
  cycleElement(next: boolean): void
  flipSelectedElements(scaleX: number, scaleY: number): void
}

export const createSelectedElem = (canvas: SvgCanvas): SelectedElemApi => {
  const svgCanvas = canvas // per-instance; functions below are closed over it
  Object.assign(canvas, createGroupOps(canvas))
  /**
 * Moves selected elements on the X/Y axis.
 * @param dx - number with the distance to move on the x-axis (or one distance per selected element)
 * @param dy - number with the distance to move on the y-axis (or one distance per selected element)
 * @param undoable - Boolean indicating whether or not the action should be undoable
 * @returns Batch command for the move
 */

  const moveSelectedElements = (dx: number | number[], dy: number | number[], undoable = true): hstry.BatchCommand | undefined => {
    const selectedElements = svgCanvas.getSelectedElements()
    const zoom = svgCanvas.getZoom()
    // if undoable is not sent, default to true
    // if single values, scale them to the zoom
    if (!Array.isArray(dx)) {
      dx = (dx as number) / zoom
      dy = (dy as number) / zoom
      // Remember the delta (content units) so transformAgain can repeat it.
      if (undoable && (dx || dy)) svgCanvas.lastMoveDelta = { dx, dy }
    }

    const batchCmd = new BatchCommand('position')
    // Plain shapes without a transform move by editing their own coordinates, which the model states; the rest bake a
    // transform in through the DOM below.
    const shifts: Array<{ id: string, set: Record<string, string | null> }> = []
    const bySelf = new Set<Element>()
    if (undoable || svgCanvas.inTransaction()) {
      selectedElements.forEach((selected, i) => {
        if (!selected?.id) return
        // (callers that pass undoable=false are mid-way through something that placed a transform on purpose: clone, paste)
        if (!undoable && selected.hasAttribute('transform')) return
        const mx = Array.isArray(dx) ? dx[i] : dx
        const my = Array.isArray(dy) ? (dy as number[])[i] : dy as number
        const set = translationEdit(selected, mx, my)
        if (!set) return
        shifts.push({ id: selected.id, set })
        bySelf.add(selected)
      })
    }
    if (shifts.length) {
      svgCanvas.snapshotHistory.edit('position', (root) => {
        let out = root
        for (const { id, set } of shifts) out = setAttrsById(out, id, set)
        return out
      })
      for (const el of bySelf) svgCanvas.selectorManager.requestSelector(el).resize()
    }
    selectedElements.forEach((selected, i) => {
      if (selected && !bySelf.has(selected)) {
      // Store the existing transform before modifying
        const existingTransform = selected.getAttribute('transform') || ''

        const xform = svgCanvas.getSvgRoot().createSVGTransform()
        const tlist = getTransformList(selected) as SVGTransformList

        // dx and dy could be arrays
        if (Array.isArray(dx)) {
          xform.setTranslate(dx[i], (dy as number[])[i])
        } else {
          xform.setTranslate(dx, dy as number)
        }

        if (tlist.numberOfItems) {
          tlist.insertItemBefore(xform, 0)
        } else {
          tlist.appendItem(xform)
        }

        // recalculateDimensions() records this as the "old" transform on its undo command (one shared slot,
        // set by mousedown for drags): without it an element that already had a transform loses it on undo.
        const priorStart = svgCanvas.getStartTransform()
        svgCanvas.setStartTransform(existingTransform)
        const cmd = svgCanvas.recalculateDimensions(selected)
        svgCanvas.setStartTransform(priorStart)
        if (cmd) {
          batchCmd.addSubCommand(cmd)
        } else {
        // recalculateDimensions() declines to bake a group's transform (it
        // would push it down onto the children) or a clip-path/mask-carrying
        // element's transform (the silhouette in <defs> is static, so baking
        // would desync it — see recalculateDimensions()'s own comments) —
        // it just returns null and leaves the transform list untouched. The
        // `xform` inserted above is therefore never merged back in: every
        // nudge on such an element (e.g. holding an arrow key) permanently
        // appends one more raw translate item, forever, with nothing else to
        // ever consolidate them. event-select.js's mouseUp handler already
        // guards the equivalent mouse-drag path this way; do the same here
        // so a long nudging session doesn't leave a huge transform-list
        // chain that both svgedit's own per-frame transform math and the
        // renderer have to multiply through on every later interaction.
          if (tlist.numberOfItems > 1) {
            const consolidatedMatrix = transformListToTransform(tlist).matrix
            while (tlist.numberOfItems > 0) {
              tlist.removeItem(0)
            }
            const newTransform = svgCanvas.getSvgRoot().createSVGTransform()
            newTransform.setMatrix(consolidatedMatrix)
            tlist.appendItem(newTransform)
          }
          if ((selected.getAttribute('transform') || '') !== existingTransform) {
            batchCmd.addSubCommand(
              new ChangeElementCommand(selected, { transform: existingTransform })
            )
          }
        }

        svgCanvas
          .selectorManager
          .requestSelector(selected)
          .resize()
      }
    })
    if (!batchCmd.isEmpty()) {
      if (undoable) {
        svgCanvas.addCommandToHistory(batchCmd)
      }
      svgCanvas.call('changed', selectedElements)
      return batchCmd
    }
    if (shifts.length) {
      svgCanvas.call('changed', selectedElements)
      return batchCmd
    }
    return undefined
  }

  /**
 * Create deep DOM copies (clones) of all selected elements and move them slightly
 * from their originals.
 * @param x number with the distance to move on the x-axis
 * @param y number with the distance to move on the y-axis
 */
  const cloneSelectedElements = (x: number, y: number): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    let i: number
    let elem: Element
    // find all the elements selected (stop at first null)
    const len = selectedElements.length

    const index = (el: Element | null): number => {
      if (!el) return -1
      let i = 0
      let current: Element | null = el
      do {
        i++
        current = current.previousElementSibling
      } while (current)
      return i
    }

    /** Sorts an array numerically and ascending. */
    const sortfunction = (a: Element, b: Element): number => {
      return index(b) - index(a)
    }
    selectedElements.sort(sortfunction)
    for (i = 0; i < len; ++i) {
      elem = selectedElements[i]
      if (!elem) {
        break
      }
    }
    // use slice to quickly get the subset of elements we need
    const copiedElements = selectedElements.slice(0, i)
    svgCanvas.clearSelection(true)
    // note that we loop in the reverse way because of the way elements are added
    // to the selectedElements array (top-first)
    const drawing = svgCanvas.getDrawing()

    // Referenced <defs> elements (filters, gradients, markers, …) must not be
    // shared between the original and its duplicate — copyElem() below clones
    // only the selected element's own subtree, so a shape's filter="url(#…)"
    // would otherwise still point at the original's <filter>. That's most
    // visible with the shadow effect: since its filter region is a snapshot of
    // the referencing element's bbox (fx-filter's setRegion), a duplicate that
    // shares the original's filter renders clipped to the ORIGINAL's position
    // until something touches the original again. Clone the referenced defs
    // once up front and remap each duplicate's references onto its own copy,
    // mirroring what copySelectedElements/pasteElements already do for the
    // clipboard path.
    const originalDefs = svgCanvas.getReferencedDefElements(copiedElements)
    let defIdMap: Record<string, string> = {}
    let defEntries: Array<{ parent: Element, el: Element }> = []
    if (originalDefs.length) {
      const clonedDefs = originalDefs.map((def) => def.cloneNode(true) as Element)
      defIdMap = svgCanvas.remapElementIdsAndRefs(clonedDefs, () => svgCanvas.getNextId())
      const defs = svgCanvas.findDefs()
      defEntries = clonedDefs.map((def) => ({ parent: defs, el: def }))
    }
    // Rewrite an element's (and its descendants') url(#…)/href references from
    // the originals' def ids to the freshly cloned ones above.
    const remapToClonedDefs = (el: Element): void => {
      Array.from(el.attributes).forEach((attr) => {
        if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')) {
          const refId = attr.value.slice(1)
          if (refId in defIdMap) el.setAttribute(attr.name, `#${defIdMap[refId]}`)
          return
        }
        const url = getUrlFromAttr(attr.value)
        if (url) {
          const refId = url[0] === '#' ? url.slice(1) : url
          if (refId in defIdMap) el.setAttribute(attr.name, attr.value.replace(url, `#${defIdMap[refId]}`))
        }
      })
      Array.from(el.children).forEach(remapToClonedDefs)
    }

    const clones: Array<{ parent: Element, el: Element }> = []
    const detach = new Map<string, ReturnType<typeof getGroupDetachTarget>['matrix']>()
    i = copiedElements.length
    while (i--) {
    // Clone each element and replace it within copiedElements, appending the
    // clone back into its own original parent (layer or group) rather than a
    // single shared target — required once a selection can span layers (All
    // Layers mode), and equivalent to the old currentGroup/currentLayer
    // target in every case where a selection can only live in one place.
    //
    // Unlike the original, a duplicate should never inherit group
    // membership: if the original sits inside one or more nested groups,
    // detach the clone all the way out to the layer, baking in the groups'
    // combined transform so it stays in the same visual spot.
      const original = copiedElements[i]
      elem = copiedElements[i] = drawing.copyElem(original)
      if (Object.keys(defIdMap).length) remapToClonedDefs(elem)
      const { targetParent, matrix } = getGroupDetachTarget(original.parentNode as Element)
      clones.push({ parent: targetParent, el: elem })
      if (targetParent !== original.parentNode) detach.set(elem.id, matrix)
    }

    if (clones.length) {
      svgCanvas.transact('Clone Elements', () => {
        // The clones are built detached; the model gets them (and the defs they point at), the renderer shows them
        svgCanvas.insertLooseElements([...defEntries, ...clones])
        const live = copiedElements.map((el) => svgCanvas.getElement(el.id) as Element)
        // baking in the groups' transform needs the element in the drawing
        for (const el of live) { const m = detach.get(el.id); if (m) applyGroupDetachTransform(el, m) }
        svgCanvas.addToSelection(live.reverse(), true) // Need to reverse for correct selection-adding; show grips so the clone is ready to resize
        moveSelectedElements(x, y, false)
      })
    }
  }

  /**
 * Repeat the last duplicate+transform (Illustrator's "Transform Again"):
 * clone the selection and offset it by the most recently committed move
 * delta (drag or nudge, recorded in `svgCanvas.lastMoveDelta` in content
 * units). Because the clones become the selection, pressing it repeatedly
 * builds a chain of evenly spaced copies.
 */
  const transformAgain = (): void => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length) return
    const d = svgCanvas.lastMoveDelta || { dx: 10, dy: 10 }
    // cloneSelectedElements feeds moveSelectedElements, which divides by zoom —
    // pre-multiply so the recorded content-unit delta is applied exactly.
    const zoom = svgCanvas.getZoom()
    cloneSelectedElements(d.dx * zoom, d.dy * zoom)
  }

  /**
 * One-click stroke cleanup across the selection (groups included): every
 * stroked element gets the primary element's stroke-width plus round
 * joins/caps — uniform confident linework in one undo step.
 */
  const matchStrokes = (): void => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length) return
    const skip = new Set(['title', 'desc', 'defs', 'metadata', 'image', 'use'])
    const targets: Element[] = []
    const collect = (el: Element): void => {
      if (skip.has(el.tagName)) return
      if (el.tagName === 'g' || el.tagName === 'a') {
        for (const c of el.children) collect(c)
        return
      }
      if ((el.getAttribute('stroke') || 'none') !== 'none') targets.push(el)
    }
    selected.forEach(collect)
    if (!targets.length) return

    const width = targets[0].getAttribute('stroke-width') || '1'
    const batchCmd = new BatchCommand('Match strokes')
    const changeAttr = (el: Element, attr: string, val: string): void => {
      const old = el.getAttribute(attr)
      if (old === val) return
      el.setAttribute(attr, val)
      batchCmd.addSubCommand(new ChangeElementCommand(el, { [attr]: old }))
    }
    for (const el of targets) {
      changeAttr(el, 'stroke-width', width)
      changeAttr(el, 'stroke-linejoin', 'round')
      changeAttr(el, 'stroke-linecap', 'round')
    }
    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', targets)
    }
  }
  /**
 * Aligns selected elements.
 * @param type - String with single character indicating the alignment type
 */
  const alignSelectedElements = (type: string, relativeTo: 'selected' | 'largest' | 'smallest' | 'page'): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    const bboxes: Box[] = [] // angles = [];
    const len = selectedElements.length
    if (!len) {
      return
    }
    let minx = Number.MAX_VALUE
    let maxx = Number.MIN_VALUE
    let miny = Number.MAX_VALUE
    let maxy = Number.MIN_VALUE

    const isHorizontalAlign = (type: string): boolean => ['l', 'c', 'r', 'left', 'center', 'right'].includes(type)
    const isVerticalAlign = (type: string): boolean => ['t', 'm', 'b', 'top', 'middle', 'bottom'].includes(type)

    for (let i = 0; i < len; ++i) {
      if (!selectedElements[i]) {
        break
      }
      const elem = selectedElements[i]
      bboxes[i] = svgCanvas.getStrokedBBoxDefaultVisible([elem])
    }

    // distribute horizontal and vertical align is not support smallest and largest
    if (['smallest', 'largest'].includes(relativeTo) && ['dh', 'distrib_horiz', 'dv', 'distrib_verti'].includes(type)) {
      relativeTo = 'selected'
    }

    switch (relativeTo) {
      case 'smallest':
        if (isHorizontalAlign(type) || isVerticalAlign(type)) {
          const sortedBboxes = bboxes.slice().sort((a, b) => a.width - b.width)
          const minBbox = sortedBboxes[0]
          minx = minBbox.x
          miny = minBbox.y
          maxx = minBbox.x + minBbox.width
          maxy = minBbox.y + minBbox.height
        }
        break
      case 'largest':
        if (isHorizontalAlign(type) || isVerticalAlign(type)) {
          const sortedBboxes = bboxes.slice().sort((a, b) => a.width - b.width)
          const maxBbox = sortedBboxes[bboxes.length - 1]
          minx = maxBbox.x
          miny = maxBbox.y
          maxx = maxBbox.x + maxBbox.width
          maxy = maxBbox.y + maxBbox.height
        }
        break
      case 'page':
        minx = 0
        miny = 0
        maxx = svgCanvas.getContentW()
        maxy = svgCanvas.getContentH()
        break
      default:
      // 'selected'
        minx = Math.min(...bboxes.map(box => box.x))
        miny = Math.min(...bboxes.map(box => box.y))
        maxx = Math.max(...bboxes.map(box => box.x + box.width))
        maxy = Math.max(...bboxes.map(box => box.y + box.height))
        break
    } // adjust min/max

    let dx: number[] = []
    let dy: number[] = []

    if (['dh', 'distrib_horiz'].includes(type)) { // distribute horizontal align
      [dx, dy] = _getDistributeHorizontalDistances(relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy)
    } else if (['dv', 'distrib_verti'].includes(type)) { // distribute vertical align
      [dx, dy] = _getDistributeVerticalDistances(relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy)
    } else { // normal align (top, left, right, ...)
      [dx, dy] = _getNormalDistances(type, selectedElements, bboxes, minx, maxx, miny, maxy)
    }

    moveSelectedElements(dx, dy)
  }

  /**
 * get distribution horizontal distances.
 * (internal call only)
 *
 * @param selectedElements - the array with selected DOM elements
 * @param bboxes - bounding box objects
 * @param minx - selected area min-x
 * @param maxx - selected area max-x
 * @param miny - selected area min-y
 * @param maxy - selected area max-y
 * @returns x and y distances array, one distance per selected element each
 * @private
 */
  const _getDistributeHorizontalDistances = (relativeTo: string, selectedElements: Element[], bboxes: Box[], minx: number, maxx: number, miny: number, maxy: number): number[][] => {
    const dx: number[] = []
    const dy: number[] = []

    for (let i = 0; i < selectedElements.length; i++) {
      dy[i] = 0
    }

    const bboxesSortedClone = bboxes
      .slice()
      .sort((firstBox, secondBox) => {
        const firstMaxX = firstBox.x + firstBox.width
        const secondMaxX = secondBox.x + secondBox.width

        if (firstMaxX === secondMaxX) { return 0 } else if (firstMaxX > secondMaxX) { return 1 } else { return -1 }
      })

    if (relativeTo === 'page') {
      bboxesSortedClone.unshift({ x: 0, y: 0, width: 0, height: maxy }) // virtual left box
      bboxesSortedClone.push({ x: maxx, y: 0, width: 0, height: maxy }) // virtual right box
    }

    const totalWidth = maxx - minx
    const totalBoxWidth = bboxesSortedClone.map(b => b.width).reduce((w1, w2) => w1 + w2, 0)
    const space = (totalWidth - totalBoxWidth) / (bboxesSortedClone.length - 1)
    const _dx: number[] = []

    for (let i = 0; i < bboxesSortedClone.length; ++i) {
      _dx[i] = 0

      if (i === 0) { continue }

      const orgX = bboxesSortedClone[i].x
      bboxesSortedClone[i].x = bboxesSortedClone[i - 1].x + bboxesSortedClone[i - 1].width + space
      _dx[i] = bboxesSortedClone[i].x - orgX
    }

    bboxesSortedClone.forEach((boxClone, idx) => {
      const orgIdx = bboxes.findIndex(box => box === boxClone)
      if (orgIdx !== -1) {
        dx[orgIdx] = _dx[idx]
      }
    })

    return [dx, dy]
  }

  /**
 * get distribution vertical distances.
 * (internal call only)
 *
 * @param selectedElements - the array with selected DOM elements
 * @param bboxes - bounding box objects
 * @param minx - selected area min-x
 * @param maxx - selected area max-x
 * @param miny - selected area min-y
 * @param maxy - selected area max-y
 * @returns x and y distances array, one distance per selected element each
 * @private
 */
  const _getDistributeVerticalDistances = (relativeTo: string, selectedElements: Element[], bboxes: Box[], minx: number, maxx: number, miny: number, maxy: number): number[][] => {
    const dx: number[] = []
    const dy: number[] = []

    for (let i = 0; i < selectedElements.length; i++) {
      dx[i] = 0
    }

    const bboxesSortedClone = bboxes
      .slice()
      .sort((firstBox, secondBox) => {
        const firstMaxY = firstBox.y + firstBox.height
        const secondMaxY = secondBox.y + secondBox.height

        if (firstMaxY === secondMaxY) { return 0 } else if (firstMaxY > secondMaxY) { return 1 } else { return -1 }
      })

    if (relativeTo === 'page') {
      bboxesSortedClone.unshift({ x: 0, y: 0, width: maxx, height: 0 }) // virtual top box
      bboxesSortedClone.push({ x: 0, y: maxy, width: maxx, height: 0 }) // virtual bottom box
    }

    const totalHeight = maxy - miny
    const totalBoxHeight = bboxesSortedClone.map(b => b.height).reduce((h1, h2) => h1 + h2, 0)
    const space = (totalHeight - totalBoxHeight) / (bboxesSortedClone.length - 1)
    const _dy: number[] = []

    for (let i = 0; i < bboxesSortedClone.length; ++i) {
      _dy[i] = 0

      if (i === 0) { continue }

      const orgY = bboxesSortedClone[i].y
      bboxesSortedClone[i].y = bboxesSortedClone[i - 1].y + bboxesSortedClone[i - 1].height + space
      _dy[i] = bboxesSortedClone[i].y - orgY
    }

    bboxesSortedClone.forEach((boxClone, idx) => {
      const orgIdx = bboxes.findIndex(box => box === boxClone)
      if (orgIdx !== -1) {
        dy[orgIdx] = _dy[idx]
      }
    })

    return [dx, dy]
  }

  /**
 * get normal align distances.
 * (internal call only)
 *
 * @param selectedElements - the array with selected DOM elements
 * @param bboxes - bounding box objects
 * @param minx - selected area min-x
 * @param maxx - selected area max-x
 * @param miny - selected area min-y
 * @param maxy - selected area max-y
 * @returns x and y distances array, one distance per selected element each
 * @private
 */
  const _getNormalDistances = (type: string, selectedElements: Element[], bboxes: Box[], minx: number, maxx: number, miny: number, maxy: number): number[][] => {
    const len = selectedElements.length
    const dx: number[] = new Array(len)
    const dy: number[] = new Array(len)

    for (let i = 0; i < len; ++i) {
      if (!selectedElements[i]) {
        break
      }
      // const elem = selectedElements[i];
      const bbox = bboxes[i]
      dx[i] = 0
      dy[i] = 0

      switch (type) {
        case 'l': // left (horizontal)
        case 'left': // left (horizontal)
          dx[i] = minx - bbox.x
          break
        case 'c': // center (horizontal)
        case 'center': // center (horizontal)
          dx[i] = (minx + maxx) / 2 - (bbox.x + bbox.width / 2)
          break
        case 'r': // right (horizontal)
        case 'right': // right (horizontal)
          dx[i] = maxx - (bbox.x + bbox.width)
          break
        case 't': // top (vertical)
        case 'top': // top (vertical)
          dy[i] = miny - bbox.y
          break
        case 'm': // middle (vertical)
        case 'middle': // middle (vertical)
          dy[i] = (miny + maxy) / 2 - (bbox.y + bbox.height / 2)
          break
        case 'b': // bottom (vertical)
        case 'bottom': // bottom (vertical)
          dy[i] = maxy - (bbox.y + bbox.height)
          break
      }
    }

    return [dx, dy]
  }

  /**
 * Flips selected elements horizontally or vertically by transforming actual coordinates.
 * @param scaleX - Scale factor for X axis (-1 for horizontal flip, 1 for no flip)
 * @param scaleY - Scale factor for Y axis (1 for no flip, -1 for vertical flip)
 */
  const flipSelectedElements = (scaleX: number, scaleY: number): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    const batchCmd = new BatchCommand('Flip Elements')
    const svgRoot = svgCanvas.getSvgRoot()

    ;(selectedElements as Array<SVGGraphicsElement | null>).forEach((selected) => {
      if (!selected) return

      const localBBox = selected.getBBox()
      if (!localBBox) return

      const existingTransform = selected.getAttribute('transform') || ''
      const tlist = getTransformList(selected) as SVGTransformList
      const elemMatrix = transformListToTransform(tlist).matrix

      // Pivot the flip around the element's *true* axis-aligned bbox centre in
      // parent space. getStrokedBBoxDefaultVisible reports the bbox in the
      // element's un-rotated frame, so using it as the pivot would shift rotated
      // or skewed elements. Transform the geometry corners by the element's own
      // matrix and take the axis-aligned centre instead.
      const corners = [
        [localBBox.x, localBBox.y],
        [localBBox.x + localBBox.width, localBBox.y],
        [localBBox.x, localBBox.y + localBBox.height],
        [localBBox.x + localBBox.width, localBBox.y + localBBox.height]
      ].map(([x, y]) => {
        const pt = svgRoot.createSVGPoint()
        pt.x = x
        pt.y = y
        return pt.matrixTransform(elemMatrix)
      })
      const xs = corners.map(p => p.x)
      const ys = corners.map(p => p.y)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2

      const flipMatrix = svgRoot
        .createSVGMatrix()
        .translate(cx, cy)
        .scaleNonUniform(scaleX, scaleY)
        .translate(-cx, -cy)

      // Apply the flip *after* (on top of) the existing transform so the mirror
      // happens in the element's visible coordinate space — flipMatrix · existing.
      // This keeps the element's bbox centre exactly where it was. We collapse the
      // whole list into a single matrix rather than going through
      // recalculateDimensions, which decomposes rotation/scale and would relocate
      // rotated or non-uniformly scaled elements.
      const combinedMatrix = matrixMultiply(flipMatrix, elemMatrix)

      const flipTransform = svgRoot.createSVGTransform()
      flipTransform.setMatrix(combinedMatrix)

      tlist.clear()
      tlist.appendItem(flipTransform)

      if ((selected.getAttribute('transform') || '') !== existingTransform) {
        batchCmd.addSubCommand(
          new ChangeElementCommand(selected, { transform: existingTransform })
        )
      }

      svgCanvas
        .selectorManager
        .requestSelector(selected)
        .resize()
    })

    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', selectedElements.filter(Boolean))
    }
  }

  /**
 * Remembers the current selected elements on the clipboard.
 */
  const copySelectedElements = (): void => {
    const selectedElements = svgCanvas.getSelectedElements().filter(Boolean)
    const elemsJson = selectedElements.map((x) => svgCanvas.getJsonFromSvgElements(x))
    // Carry the referenced paint servers (gradients, filters, markers, …) on the
    // clipboard, tagged `_defs`, so a paste into another drawing recreates them
    // instead of leaving dangling url(#…) references and a corrupted <defs>.
    const defsJson = svgCanvas.getReferencedDefElements(selectedElements)
      .map((d) => {
        const json = svgCanvas.getJsonFromSvgElements(d)
        if (json) json._defs = true
        return json
      })
      .filter(Boolean)
    const data = JSON.stringify([...defsJson, ...elemsJson])
    // Use sessionStorage for the clipboard data.
    sessionStorage.setItem(svgCanvas.getClipboardID(), data)
    svgCanvas.flashStorage()

    // Also mirror onto the system clipboard so the native paste handler can tell
    // an internal copy apart from external content (e.g. an SVG copied from
    // another app). Write may reject (permissions / no user gesture) — ignore.
    try {
      navigator.clipboard?.writeText(data)?.catch(() => {})
    } catch { /* clipboard unavailable */ }

    // Context menu might not exist (it is provided by editor.js).
    const canvMenu = svgCanvas.$id('se-cmenu_canvas')
    canvMenu?.setAttribute('enablemenuitems', '#paste,#paste_in_place')

    // Other same-window editor instances share the sessionStorage clipboard
    // but have their own context menu, so they need telling to re-check it
    // (see the 'svgedit:clipboardchange' listener in EditorStartup.js).
    document.dispatchEvent(new CustomEvent('svgedit:clipboardchange'))
  }

  /**
 * Updates the editor canvas width/height/position after a zoom has occurred.
 * @param w - number with the new width
 * @param h - number with the new height
 */
  const updateCanvas = (w: number, h: number): { x: number, y: number, old_x: number, old_y: number, d_x: number, d_y: number } => {
    svgCanvas.getSvgRoot().setAttribute('width', String(w))
    svgCanvas.getSvgRoot().setAttribute('height', String(h))
    const zoom = svgCanvas.getZoom()
    const bg = svgCanvas.$id('canvasBackground') as Element
    const oldX = Number(svgCanvas.getSvgContent().getAttribute('x'))
    const oldY = Number(svgCanvas.getSvgContent().getAttribute('y'))
    const x = (w - svgCanvas.contentW * zoom) / 2
    const y = (h - svgCanvas.contentH * zoom) / 2

    assignAttributes(svgCanvas.getSvgContent(), {
      width: svgCanvas.contentW * zoom,
      height: svgCanvas.contentH * zoom,
      x,
      y,
      viewBox: `0 0 ${svgCanvas.contentW} ${svgCanvas.contentH}`
    })

    assignAttributes(bg, {
      width: svgCanvas.getSvgContent().getAttribute('width') ?? '',
      height: svgCanvas.getSvgContent().getAttribute('height') ?? '',
      x,
      y
    })

    const bgImg = svgCanvas.getElement('background_image')
    if (bgImg) {
      assignAttributes(bgImg, {
        width: '100%',
        height: '100%'
      })
    }

    svgCanvas.selectorManager.selectorParentGroup.setAttribute(
      'transform',
    `translate(${x},${y})`
    )

    // Invoked upon updates to the canvas.
    svgCanvas.call('canvasUpdated',
      {
        new_x: x,
        new_y: y,
        old_x: oldX,
        old_y: oldY,
        d_x: x - oldX,
        d_y: y - oldY
      }
    )
    return { x, y, old_x: oldX, old_y: oldY, d_x: x - oldX, d_y: y - oldY }
  }
  /**
 * Select the next/previous element within the current layer.
 * @param next - true = next and false = previous element
 */
  const cycleElement = (next: boolean): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    const currentGroup = svgCanvas.getCurrentGroup()
    let num: number
    const curElem = selectedElements[0]
    let elem: Element | undefined
    const allElems = svgCanvas.getVisibleElements(
      currentGroup || svgCanvas.getCurrentDrawing().getCurrentLayer() as Element
    )
    if (!allElems.length) {
      return
    }
    if (!curElem) {
      num = next ? allElems.length - 1 : 0
      elem = allElems[num]
    } else {
      let i = allElems.length
      while (i--) {
        if (allElems[i] === curElem) {
          num = next ? i - 1 : i + 1
          if (num >= allElems.length) {
            num = 0
          } else if (num < 0) {
            num = allElems.length - 1
          }
          elem = allElems[num]
          break
        }
      }
    }
    svgCanvas.selectOnly([elem as Element], true)
    svgCanvas.call('selected', selectedElements)
  }

  return {
    copySelectedElements,
    moveSelectedElements, // Moves selected elements on the X/Y axis.
    cloneSelectedElements, // Create deep DOM copies (clones) of all selected elements and move them slightly
    transformAgain, // Repeat the last duplicate+transform (clone offset by the last committed move delta)
    matchStrokes, // Uniform stroke-width + round joins/caps across the selection
    alignSelectedElements, // Aligns selected elements.
    updateCanvas, // Updates the editor canvas width/height/position after a zoom has occurred.
    cycleElement, // Select the next/previous element within the current layer.
    flipSelectedElements // Flips selected elements horizontally or vertically
  }
}
