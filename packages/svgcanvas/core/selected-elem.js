/**
 * Tools for SVG selected element operation.
 * @module selected-elem
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import * as hstry from './history.js'
import { assignAttributes, getUrlFromAttr } from './dom-utils.js'
import { matrixMultiply, transformListToTransform, getTransformList } from './math.js'
import { getGroupDetachTarget, applyGroupDetachTransform } from './group-detach.js'
import { init as groupOpsInit } from './group-ops.js'

const {
  MoveElementCommand,
  BatchCommand,
  InsertElementCommand,
  RemoveElementCommand,
  ChangeElementCommand
} = hstry

/**
 * @function module:selected-elem.init
 * @param {module:selected-elem.elementContext} elementContext
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas // per-instance; functions below are closed over it
  groupOpsInit(canvas)

  /**
 * Ascending document-order comparator (a before b in the DOM sorts first).
 * getSelectedElements() does not guarantee this order (it's kept sorted for
 * grip-drawing purposes, topmost-first), so callers that care about relative
 * stacking order must sort explicitly rather than trust the incoming array.
 * @param {Element} a
 * @param {Element} b
 * @returns {number}
 */
  const _byDocumentOrder = (a, b) => {
    const position = a.compareDocumentPosition(b)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1
    }
    return 0
  }

  /**
 * Groups selected elements by their parent node, with each group sorted in
 * ascending document order (bottom-most stacking first). Elements normally
 * share one parent (a layer or a group being edited), but grouping keeps
 * this correct even when a selection spans multiple parents.
 * @param {Element[]} selected
 * @returns {Map<Element, Element[]>}
 */
  const _groupSelectedByParent = selected => {
    const byParent = new Map()
    selected.forEach(el => {
      if (!byParent.has(el.parentNode)) {
        byParent.set(el.parentNode, [])
      }
      byParent.get(el.parentNode).push(el)
    })
    byParent.forEach(els => els.sort(_byDocumentOrder))
    return byParent
  }

  /**
 * Repositions all selected elements to the bottom in the DOM to appear on
 * top of other elements, preserving their relative stacking order (works
 * for a single element, a multi-selection, or a selected group).
 * @function module:selected-elem.SvgCanvas#moveToTopSelectedElem
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
  const moveToTopSelectedElem = () => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length) {
      return
    }
    const batchCmd = new BatchCommand('Move to Top')
    const changedEls = []
    _groupSelectedByParent(selected).forEach(els => {
      els.forEach(t => {
        const oldParent = t.parentNode
        const oldNextSibling = t.nextSibling
        oldParent.append(t)
        // If the element actually moved position, add the command and fire the changed
        // event handler.
        if (oldNextSibling !== t.nextSibling) {
          batchCmd.addSubCommand(
            new MoveElementCommand(t, oldNextSibling, oldParent, 'top')
          )
          changedEls.push(t)
        }
      })
    })
    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', changedEls)
    }
  }

  /**
 * Repositions all selected elements to the top in the DOM to appear under
 * other elements, preserving their relative stacking order (works for a
 * single element, a multi-selection, or a selected group).
 * @function module:selected-elem.SvgCanvas#moveToBottomSelectedElement
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
  const moveToBottomSelectedElem = () => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length) {
      return
    }
    const batchCmd = new BatchCommand('Move to Bottom')
    const changedEls = []
    _groupSelectedByParent(selected).forEach((els, parent) => {
      let firstChild = parent.firstElementChild
      if (firstChild?.tagName === 'title') {
        firstChild = firstChild.nextElementSibling
      }
      // This can probably be removed, as the defs should not ever apppear
      // inside a layer group
      if (firstChild?.tagName === 'defs') {
        firstChild = firstChild.nextElementSibling
      }
      if (!firstChild) {
        return
      }
      // Insert in reverse document order, each one right before the previous
      // insertion point, so the group ends up at the bottom with its
      // original relative order preserved.
      let ref = firstChild
    ;[...els].reverse().forEach(t => {
        const oldParent = t.parentNode
        const oldNextSibling = t.nextSibling
        parent.insertBefore(t, ref)
        ref = t
        // If the element actually moved position, add the command and fire the changed
        // event handler.
        if (oldNextSibling !== t.nextSibling) {
          batchCmd.addSubCommand(
            new MoveElementCommand(t, oldNextSibling, oldParent, 'bottom')
          )
          changedEls.push(t)
        }
      })
    })
    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', changedEls)
    }
  }

  /**
 * Moves one selected element up or down the stack by a single step, based
 * on the visibly intersecting elements.
 * @param {Element} selected
 * @param {"Up"|"Down"} dir - String that's either 'Up' or 'Down'
 * @returns {MoveElementCommand|void}
 */
  const _moveUpDownOne = (selected, dir) => {
    svgCanvas.setCurBBoxes([])
    let closest
    let foundCur
    // jQuery sorts this list
    const list = svgCanvas.getIntersectionList(
      svgCanvas.getStrokedBBoxDefaultVisible([selected])
    )
    if (dir === 'Down') {
      list.reverse()
    }

    Array.prototype.forEach.call(list, el => {
      if (!foundCur) {
        if (el === selected) {
          foundCur = true
        }
        return true
      }
      if (closest === undefined) {
        closest = el
      }
      return false
    })
    if (!closest) {
      return undefined
    }

    const t = selected
    const oldParent = t.parentNode
    const oldNextSibling = t.nextSibling
    if (dir === 'Down') {
      closest.insertAdjacentElement('beforebegin', t)
    } else {
      closest.insertAdjacentElement('afterend', t)
    }
    // If the element actually moved position, return the command so the caller
    // can add it to history and report it as changed.
    if (oldNextSibling !== t.nextSibling) {
      return new MoveElementCommand(t, oldNextSibling, oldParent, `Move ${dir}`)
    }
    return undefined
  }

  /**
 * Moves all selected elements up or down the stack by a single step each,
 * based on the visibly intersecting elements (works for a single element or
 * a multi-selection).
 * @function module:selected-elem.SvgCanvas#moveUpDownSelected
 * @param {"Up"|"Down"} dir - String that's either 'Up' or 'Down'
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
  const moveUpDownSelected = dir => {
    const selectedElements = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selectedElements.length) {
      return
    }

    // Process the bottommost selected element first when moving down, and the
    // topmost first when moving up, so multiply-selected elements step past
    // non-selected elements rather than blocking each other. getSelectedElements
    // does not guarantee document order, so sort explicitly.
    const ascending = [...selectedElements].sort(_byDocumentOrder)
    const ordered = dir === 'Down' ? ascending : ascending.reverse()

    const batchCmd = new BatchCommand(`Move ${dir}`)
    const changedEls = []
    ordered.forEach(selected => {
      const cmd = _moveUpDownOne(selected, dir)
      if (cmd) {
        batchCmd.addSubCommand(cmd)
        changedEls.push(selected)
      }
    })
    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', changedEls)
    }
  }

  /**
 * Reverses the z-order (DOM stacking) of exactly two selected elements that
 * share the same parent layer. If one was behind the other, they swap.
 * @function module:selected-elem.SvgCanvas#switchSelectedZorder
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
  const switchSelectedZorder = () => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (selected.length !== 2) {
      return
    }
    const [a, b] = selected
    const parent = a.parentNode
    if (parent !== b.parentNode) {
      return
    }
    const aOldNext = a.nextSibling
    const bOldNext = b.nextSibling
    // Swap the two siblings' DOM positions via a placeholder
    const tmp = document.createComment('swap')
    parent.replaceChild(tmp, a)
    parent.replaceChild(a, b)
    parent.replaceChild(b, tmp)
    const batchCmd = new BatchCommand('Switch Layers')
    batchCmd.addSubCommand(
      new MoveElementCommand(a, aOldNext, parent, 'Switch Layers')
    )
    batchCmd.addSubCommand(
      new MoveElementCommand(b, bOldNext, parent, 'Switch Layers')
    )
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [a, b])
  }

  /**
 * Moves selected elements on the X/Y axis.
 * @function module:selected-elem.SvgCanvas#moveSelectedElements
 * @param {number} dx - number with the distance to move on the x-axis
 * @param {number} dy - number with the distance to move on the y-axis
 * @param {boolean} undoable - Boolean indicating whether or not the action should be undoable
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {BatchCommand|void} Batch command for the move
 */

  const moveSelectedElements = (dx, dy, undoable = true) => {
    const selectedElements = svgCanvas.getSelectedElements()
    const zoom = svgCanvas.getZoom()
    // if undoable is not sent, default to true
    // if single values, scale them to the zoom
    if (!Array.isArray(dx)) {
      dx /= zoom
      dy /= zoom
      // Remember the delta (content units) so transformAgain can repeat it.
      if (undoable && (dx || dy)) svgCanvas.lastMoveDelta = { dx, dy }
    }

    const batchCmd = new BatchCommand('position')
    selectedElements.forEach((selected, i) => {
      if (selected) {
      // Store the existing transform before modifying
        const existingTransform = selected.getAttribute('transform') || ''

        const xform = svgCanvas.getSvgRoot().createSVGTransform()
        const tlist = getTransformList(selected)

        // dx and dy could be arrays
        if (Array.isArray(dx)) {
          xform.setTranslate(dx[i], dy[i])
        } else {
          xform.setTranslate(dx, dy)
        }

        if (tlist.numberOfItems) {
          tlist.insertItemBefore(xform, 0)
        } else {
          tlist.appendItem(xform)
        }

        const cmd = svgCanvas.recalculateDimensions(selected)
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
          .gettingSelectorManager()
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
    return undefined
  }

  /**
 * Create deep DOM copies (clones) of all selected elements and move them slightly
 * from their originals.
 * @function module:selected-elem.SvgCanvas#cloneSelectedElements
 * @param {number} x number with the distance to move on the x-axis
 * @param {number} y number with the distance to move on the y-axis
 * @returns {void}
 */
  const cloneSelectedElements = (x, y) => {
    const selectedElements = svgCanvas.getSelectedElements()
    let i
    let elem
    const batchCmd = new BatchCommand('Clone Elements')
    // find all the elements selected (stop at first null)
    const len = selectedElements.length

    const index = el => {
      if (!el) return -1
      let i = 0
      let current = el
      do {
        i++
        current = current.previousElementSibling
      } while (current)
      return i
    }

    /**
   * Sorts an array numerically and ascending.
   * @param {Element} a
   * @param {Element} b
   * @returns {number}
   */
    const sortfunction = (a, b) => {
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
    let defIdMap = {}
    if (originalDefs.length) {
      const clonedDefs = originalDefs.map((def) => def.cloneNode(true))
      defIdMap = svgCanvas.remapElementIdsAndRefs(clonedDefs, () => svgCanvas.getNextId())
      const defs = svgCanvas.findDefs()
      clonedDefs.forEach((def) => {
        defs.append(def)
        batchCmd.addSubCommand(new InsertElementCommand(def))
      })
    }
    // Rewrite an element's (and its descendants') url(#…)/href references from
    // the originals' def ids to the freshly cloned ones above.
    const remapToClonedDefs = (el) => {
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
      const { targetParent, matrix } = getGroupDetachTarget(original.parentNode)
      if (targetParent !== original.parentNode) {
        applyGroupDetachTransform(elem, matrix)
        targetParent.append(elem)
      } else {
        original.parentNode.append(elem)
      }
      batchCmd.addSubCommand(new InsertElementCommand(elem))
    }

    if (!batchCmd.isEmpty()) {
      svgCanvas.addToSelection(copiedElements.reverse(), true) // Need to reverse for correct selection-adding; show grips so the clone is ready to resize
      moveSelectedElements(x, y, false)
      svgCanvas.addCommandToHistory(batchCmd)
    }
  }

  /**
 * Repeat the last duplicate+transform (Illustrator's "Transform Again"):
 * clone the selection and offset it by the most recently committed move
 * delta (drag or nudge, recorded in `svgCanvas.lastMoveDelta` in content
 * units). Because the clones become the selection, pressing it repeatedly
 * builds a chain of evenly spaced copies.
 * @function module:selected-elem.SvgCanvas#transformAgain
 * @returns {void}
 */
  const transformAgain = () => {
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
 * @function module:selected-elem.SvgCanvas#matchStrokes
 * @returns {void}
 */
  const matchStrokes = () => {
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length) return
    const skip = new Set(['title', 'desc', 'defs', 'metadata', 'image', 'use'])
    const targets = []
    const collect = el => {
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
    const changeAttr = (el, attr, val) => {
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
 * @function module:selected-elem.SvgCanvas#alignSelectedElements
 * @param {string} type - String with single character indicating the alignment type
 * @param {"selected"|"largest"|"smallest"|"page"} relativeTo
 * @returns {void}
 */
  const alignSelectedElements = (type, relativeTo) => {
    const selectedElements = svgCanvas.getSelectedElements()
    const bboxes = [] // angles = [];
    const len = selectedElements.length
    if (!len) {
      return
    }
    let minx = Number.MAX_VALUE
    let maxx = Number.MIN_VALUE
    let miny = Number.MAX_VALUE
    let maxy = Number.MIN_VALUE

    const isHorizontalAlign = (type) => ['l', 'c', 'r', 'left', 'center', 'right'].includes(type)
    const isVerticalAlign = (type) => ['t', 'm', 'b', 'top', 'middle', 'bottom'].includes(type)

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

    let dx = []
    let dy = []

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
 * Aligns selected elements.
 * @function module:selected-elem.SvgCanvas#alignSelectedElements
 * @param {string} type - String with single character indicating the alignment type
 * @param {"selected"|"largest"|"smallest"|"page"} relativeTo
 * @returns {void}
 */

  /**
 * get distribution horizontal distances.
 * (internal call only)
 *
 * @param {string} relativeTo
 * @param {Element[]} selectedElements - the array with selected DOM elements
 * @param {module:utilities.BBoxObject} bboxes - bounding box objects
 * @param {number} minx - selected area min-x
 * @param {number} maxx - selected area max-x
 * @param {number} miny - selected area min-y
 * @param {number} maxy - selected area max-y
 * @returns {Array.number[]} x and y distances array
 * @private
 */
  const _getDistributeHorizontalDistances = (relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy) => {
    const dx = []
    const dy = []

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
    const _dx = []

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
 * @param {string} relativeTo
 * @param {Element[]} selectedElements - the array with selected DOM elements
 * @param {module:utilities.BBoxObject} bboxes - bounding box objects
 * @param {number} minx - selected area min-x
 * @param {number} maxx - selected area max-x
 * @param {number} miny - selected area min-y
 * @param {number} maxy - selected area max-y
 * @returns {Array.number[]}} x and y distances array
 * @private
 */
  const _getDistributeVerticalDistances = (relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy) => {
    const dx = []
    const dy = []

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
    const _dy = []

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
 * @param {string} type
 * @param {Element[]} selectedElements - the array with selected DOM elements
 * @param {module:utilities.BBoxObject} bboxes - bounding box objects
 * @param {number} minx - selected area min-x
 * @param {number} maxx - selected area max-x
 * @param {number} miny - selected area min-y
 * @param {number} maxy - selected area max-y
 * @returns {Array.number[]} x and y distances array
 * @private
 */
  const _getNormalDistances = (type, selectedElements, bboxes, minx, maxx, miny, maxy) => {
    const len = selectedElements.length
    const dx = new Array(len)
    const dy = new Array(len)

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
 * Removes all selected elements from the DOM and adds the change to the
 * history stack.
 * @function module:selected-elem.SvgCanvas#deleteSelectedElements
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
  const deleteSelectedElements = () => {
    const selectedElements = svgCanvas.getSelectedElements()
    const batchCmd = new BatchCommand('Delete Elements')
    const selectedCopy = [] // selectedElements is being deleted

    // Text that follows a path being deleted becomes plain text (needs the rail still in place).
    svgCanvas.releaseTextOnPath?.(selectedElements.filter(Boolean), batchCmd)

    selectedElements.forEach(selected => {
      if (selected) {
        let parent = selected.parentNode
        let t = selected
        // this will unselect the element and remove the selectedOutline
        svgCanvas.gettingSelectorManager().releaseSelector(t)
        // Remove the path if present.
        svgCanvas.removePath_(t.id)
        // Get the parent if it's a single-child anchor
        if (parent.tagName === 'a' && parent.childNodes.length === 1) {
          t = parent
          parent = parent.parentNode
        }
        const { nextSibling } = t
        t.remove()
        const elem = t
        selectedCopy.push(selected) // for the copy
        batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent))
      }
    })
    svgCanvas.setEmptySelectedElements()

    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
    svgCanvas.call('changed', selectedCopy)
    svgCanvas.clearSelection()
  }

  /**
 * Flips selected elements horizontally or vertically by transforming actual coordinates.
 * @function module:selected-elem.SvgCanvas#flipSelectedElements
 * @param {number} scaleX - Scale factor for X axis (-1 for horizontal flip, 1 for no flip)
 * @param {number} scaleY - Scale factor for Y axis (1 for no flip, -1 for vertical flip)
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
  const flipSelectedElements = (scaleX, scaleY) => {
    const selectedElements = svgCanvas.getSelectedElements()
    const batchCmd = new BatchCommand('Flip Elements')
    const svgRoot = svgCanvas.getSvgRoot()

    selectedElements.forEach(selected => {
      if (!selected) return

      const localBBox = selected.getBBox()
      if (!localBBox) return

      const existingTransform = selected.getAttribute('transform') || ''
      const tlist = getTransformList(selected)
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
        .gettingSelectorManager()
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
 * @function module:selected-elem.SvgCanvas#copySelectedElements
 * @returns {void}
 */
  const copySelectedElements = () => {
    const selectedElements = svgCanvas.getSelectedElements().filter(Boolean)
    const elemsJson = selectedElements.map(x => svgCanvas.getJsonFromSvgElements(x))
    // Carry the referenced paint servers (gradients, filters, markers, …) on the
    // clipboard, tagged `_defs`, so a paste into another drawing recreates them
    // instead of leaving dangling url(#…) references and a corrupted <defs>.
    const defsJson = svgCanvas.getReferencedDefElements(selectedElements)
      .map(d => {
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
 * @function module:svgcanvas.SvgCanvas#updateCanvas
 * @param {number} w - number with the new width
 * @param {number} h - number with the new height
 * @fires module:svgcanvas.SvgCanvas#event:ext_canvasUpdated
 * @returns {module:svgcanvas.CanvasInfo}
 */
  const updateCanvas = (w, h) => {
    svgCanvas.getSvgRoot().setAttribute('width', w)
    svgCanvas.getSvgRoot().setAttribute('height', h)
    const zoom = svgCanvas.getZoom()
    const bg = svgCanvas.$id('canvasBackground')
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
      width: svgCanvas.getSvgContent().getAttribute('width'),
      height: svgCanvas.getSvgContent().getAttribute('height'),
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

    /**
   * Invoked upon updates to the canvas.
   * @event module:svgcanvas.SvgCanvas#event:ext_canvasUpdated
   * @type {PlainObject}
   * @property {number} new_x
   * @property {number} new_y
   * @property {string} old_x (Of number)
   * @property {string} old_y (Of number)
   * @property {number} d_x
   * @property {number} d_y
   */
    svgCanvas.runExtensions(
      'canvasUpdated',
      /**
     * @type {module:svgcanvas.SvgCanvas#event:ext_canvasUpdated}
     */
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
 * @function module:svgcanvas.SvgCanvas#cycleElement
 * @param {boolean} next - true = next and false = previous element
 * @fires module:svgcanvas.SvgCanvas#event:selected
 * @returns {void}
 */
  const cycleElement = next => {
    const selectedElements = svgCanvas.getSelectedElements()
    const currentGroup = svgCanvas.getCurrentGroup()
    let num
    const curElem = selectedElements[0]
    let elem = false
    const allElems = svgCanvas.getVisibleElements(
      currentGroup || svgCanvas.getCurrentDrawing().getCurrentLayer()
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
    svgCanvas.selectOnly([elem], true)
    svgCanvas.call('selected', selectedElements)
  }

  svgCanvas.copySelectedElements = copySelectedElements
  svgCanvas.moveToTopSelectedElement = moveToTopSelectedElem // Repositions the selected element to the bottom in the DOM to appear on top
  svgCanvas.moveToBottomSelectedElement = moveToBottomSelectedElem // Repositions the selected element to the top in the DOM to appear under other elements
  svgCanvas.moveUpDownSelected = moveUpDownSelected // Moves the select element up or down the stack, based on the visibly
  svgCanvas.switchSelectedZorder = switchSelectedZorder // Reverses the z-order (stacking) of exactly two selected elements
  svgCanvas.moveSelectedElements = moveSelectedElements // Moves selected elements on the X/Y axis.
  svgCanvas.cloneSelectedElements = cloneSelectedElements // Create deep DOM copies (clones) of all selected elements and move them slightly
  svgCanvas.transformAgain = transformAgain // Repeat the last duplicate+transform (clone offset by the last committed move delta)
  svgCanvas.matchStrokes = matchStrokes // Uniform stroke-width + round joins/caps across the selection
  svgCanvas.alignSelectedElements = alignSelectedElements // Aligns selected elements.
  svgCanvas.updateCanvas = updateCanvas // Updates the editor canvas width/height/position after a zoom has occurred.
  svgCanvas.cycleElement = cycleElement // Select the next/previous element within the current layer.
  svgCanvas.deleteSelectedElements = deleteSelectedElements // Removes all selected elements from the DOM and adds the change to the history
  svgCanvas.flipSelectedElements = flipSelectedElements // Flips selected elements horizontally or vertically
}
