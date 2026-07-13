/**
 * Selection mode (`select`/`multiselect`) mouse handlers, extracted from the
 * `select`/`multiselect` cases of `event.js`'s mouseDown/mouseMove/mouseUp
 * switches. This is the highest-traffic mode family: drag-move with
 * proportion/smart-guide snapping, rubber-band multiselect, and the mouseUp
 * property-capture + transform-consolidation tail shared (via fallthrough in
 * the original switch) by `resize` and `multiselect` as well as `select`
 * itself.
 * @module event-select
 * @license MIT
 */
import { assignAttributes, snapPointToGrid, walkTree, getRotationAngle } from './dom-utils.js'
import { getStrokedBBoxDefaultVisible } from './bbox-utils.js'
import { getTransformList, transformListToTransform } from './math.js'
import { proportionLines } from './proportions.js'
import { collectSnapTargets, snapMovingBBox, findEqualSpacing } from './smart-guides.js'
import { toCurrentGroupLocalDelta } from './event-group-context.js'
import * as hstry from './history.js'

const { BatchCommand, ChangeElementCommand } = hstry

// update the dummy transform in our transform list
// to be a translate. We need to check if there was a transformation
// to avoid loosing it
const updateTransformList = (svgRoot, element, dx, dy) => {
  const xform = svgRoot.createSVGTransform()
  xform.setTranslate(dx, dy)
  const tlist = getTransformList(element)
  if (!tlist) { return }
  if (tlist.numberOfItems) {
    const firstItem = tlist.getItem(0)
    if (firstItem.type === 2) { // SVG_TRANSFORM_TRANSLATE = 2
      tlist.replaceItem(xform, 0)
    } else {
      tlist.insertItemBefore(xform, 0)
    }
  } else {
    tlist.appendItem(xform)
  }
}

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 * @function module:event-select.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {{down: Function, move: Function, multiselectMove: Function, up: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  const down = (evt, ctx) => {
    const { mouseTarget, svgRoot, rightClick, selectedElements, zoom } = ctx
    svgCanvas.setStarted(true)
    svgCanvas.setCurrentResizeMode('none')
    if (rightClick) { svgCanvas.setStarted(false) }

    if (mouseTarget !== svgRoot) {
      // On right-click with an existing selection, keep that selection so the
      // context menu acts on the already-selected element(s) instead of
      // grabbing whatever unselected element happens to be under the cursor.
      const keepSelectionForRightClick =
        rightClick && selectedElements.filter(Boolean).length > 0
      // if this element is not yet selected, clear selection and select it
      if (!selectedElements.includes(mouseTarget) && !keepSelectionForRightClick) {
        // only clear selection if shift is not pressed (otherwise, add
        // element to selection)
        if (!evt.shiftKey) {
          // No need to do the call here as it will be done on addToSelection
          svgCanvas.clearSelection(true)
        }
        svgCanvas.addToSelection([mouseTarget])
        svgCanvas.setJustSelected(mouseTarget)
        svgCanvas.pathActions.clear()
      }
      // else if it's a path, go into pathedit mode in mouseup

      // Note: Dummy transform insertion moved to mouseMove to avoid triggering
      // recalculateDimensions on simple clicks. The dummy transform is only needed
      // when actually starting a drag operation.
    } else if (!rightClick) {
      svgCanvas.clearSelection()
      svgCanvas.setCurrentMode('multiselect')
      if (!svgCanvas.getRubberBox()) {
        svgCanvas.setRubberBox(svgCanvas.selectorManager.getRubberBandBox())
      }
      svgCanvas.setRStartX(svgCanvas.getRStartX() * zoom)
      svgCanvas.setRStartY(svgCanvas.getRStartY() * zoom)

      assignAttributes(svgCanvas.getRubberBox(), {
        x: svgCanvas.getRStartX(),
        y: svgCanvas.getRStartY(),
        width: 0,
        height: 0,
        display: 'inline'
      }, 100)
    }
  }

  const move = (evt, ctx) => {
    const { selectedElements, selected, zoom, svgRoot } = ctx
    let { x, y } = ctx
    // Insert dummy transform on first mouse move (drag start), not on click.
    // This avoids creating multiple transforms that trigger unwanted flattening.
    if (!svgCanvas.hasDragStartTransform && selectedElements.length > 0) {
      // Store original transforms BEFORE adding the drag transform (for undo)
      svgCanvas.dragStartTransforms = new Map()
      for (const selectedElement of selectedElements) {
        if (!selectedElement) { continue }
        // Capture the transform attribute before we modify it
        svgCanvas.dragStartTransforms.set(selectedElement, selectedElement.getAttribute('transform') || '')
        const slist = getTransformList(selectedElement)
        if (!slist) { continue }
        if (slist.numberOfItems) {
          slist.insertItemBefore(svgRoot.createSVGTransform(), 0)
        } else {
          slist.appendItem(svgRoot.createSVGTransform())
        }
      }
      svgCanvas.hasDragStartTransform = true
      // Snapshot the selection bbox at drag start so proportion snapping can
      // test edge/center positions against the candidate (post-delta) bbox.
      svgCanvas.dragStartBBox = getStrokedBBoxDefaultVisible(selectedElements)
    }
    // we temporarily use a translate on the element(s) being dragged
    // this transform is removed upon mousing up and the element is
    // relocated to the new location
    if (selected) {
      let dx = x - svgCanvas.getStartX()
      let dy = y - svgCanvas.getStartY()
      if (svgCanvas.getCurConfig().gridSnapping) {
        ({ x: dx, y: dy } = snapPointToGrid(dx, dy))
      }
      // Wireframe proportion snapping: align the moving selection's edges or
      // center to the canvas proportion lines (x = w·f, y = h·f). On a match,
      // ask the markers extension to draw a guide line in the marker's color.
      if (svgCanvas.getCurConfig().wireframeSnapping && svgCanvas.dragStartBBox) {
        const res = svgCanvas.getResolution()
        const tol = 8 / zoom // ~8 screen px
        const bb = svgCanvas.dragStartBBox
        const snapAxis = (lines, refs) => {
          let best = null
          for (const ln of lines) {
            for (const r of refs) {
              const d = ln.pos - r
              if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best.delta))) {
                best = { delta: d, pos: ln.pos, color: ln.color }
              }
            }
          }
          return best
        }
        const sx = snapAxis(proportionLines(res.w), [bb.x + dx, bb.x + dx + bb.width / 2, bb.x + dx + bb.width])
        const sy = snapAxis(proportionLines(res.h), [bb.y + dy, bb.y + dy + bb.height / 2, bb.y + dy + bb.height])
        if (sx) dx += sx.delta
        if (sy) dy += sy.delta
        svgCanvas.showSnapGuides?.({ x: sx, y: sy })
      }
      // Smart object-to-object snapping: align the moving selection's
      // edges/centers to other elements' edges/centers (or the page), and
      // snap to the midpoint between its two nearest neighbors (equal
      // spacing). Skipped inside a group context — bboxes of children of a
      // transformed group are not in content space.
      if (svgCanvas.getCurConfig().smartSnapping !== false &&
        svgCanvas.dragStartBBox && !svgCanvas.getCurrentGroup()) {
        if (!svgCanvas.smartSnapTargets) {
          svgCanvas.smartSnapTargets = collectSnapTargets(svgCanvas, selectedElements)
        }
        const tol = 8 / zoom // ~8 screen px
        const bb = svgCanvas.dragStartBBox
        const snap = snapMovingBBox(bb, dx, dy, svgCanvas.smartSnapTargets, tol)
        const spacing = findEqualSpacing(bb, dx, dy, svgCanvas.smartSnapTargets, tol)
        // Per-axis precedence: same-kind alignment (edge↔edge/center↔center)
        // > equal spacing > mixed alignment (edge↔center).
        const useSpacingX = spacing.x && !(snap.x?.same)
        const useSpacingY = spacing.y && !(snap.y?.same)
        if (useSpacingX) { dx += spacing.x.delta } else if (snap.x) { dx += snap.x.delta }
        if (useSpacingY) { dy += spacing.y.delta } else if (snap.y) { dy += snap.y.delta }
        svgCanvas.showSmartGuides?.({
          x: useSpacingX ? null : snap.x,
          y: useSpacingY ? null : snap.y,
          spacingX: useSpacingX ? spacing.x : null,
          spacingY: useSpacingY ? spacing.y : null,
          moving: { x: bb.x + dx, y: bb.y + dy, width: bb.width, height: bb.height }
        })
      }
      // Shift locks movement to the dominant axis (match Excalidraw)
      if (evt.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) { dy = 0 } else { dx = 0 }
      }

      // Enable moving selection only if mouse has been moved at least 4 px in any direction
      // This prevents objects from being accidentally moved when (initially) selected
      const deltaThreshold = 4
      const deltaThresholdReached = Math.abs(dx) > deltaThreshold || Math.abs(dy) > deltaThreshold
      svgCanvas.moveSelectionThresholdReached = svgCanvas.moveSelectionThresholdReached || deltaThresholdReached

      if (svgCanvas.moveSelectionThresholdReached) {
        // Inside a transformed group the children's translate lives in the
        // group's local space, so map the content-space delta accordingly
        // (no-op at top level). Fixes child dragging too far in a scaled/
        // rotated group.
        const { dx: ldx, dy: ldy } = toCurrentGroupLocalDelta(svgCanvas, dx, dy)
        // Candidate delta for transformAgain — committed in mouseUp.
        svgCanvas.pendingMoveDelta = { dx, dy }
        selectedElements.forEach((el) => {
          if (el) {
            updateTransformList(svgRoot, el, ldx, ldy)
            // update our internal bbox that we're tracking while dragging
            svgCanvas.selectorManager.requestSelector(el).resize()
          }
        })
        // Live readout for the position panels (attributes stay untouched
        // until mouseup's recalculateDimensions, so panels need this delta
        // to show the in-progress position instead of the pre-drag value).
        svgCanvas.dragLiveMoveDelta = { dx: ldx, dy: ldy }
        svgCanvas.call('transition', selectedElements)
      }
    }
  }

  const multiselectMove = (evt, ctx) => {
    const { selectedElements, zoom } = ctx
    let { realX, realY } = ctx
    realX *= zoom
    realY *= zoom
    assignAttributes(svgCanvas.getRubberBox(), {
      x: Math.min(svgCanvas.getRStartX(), realX),
      y: Math.min(svgCanvas.getRStartY(), realY),
      width: Math.abs(realX - svgCanvas.getRStartX()),
      height: Math.abs(realY - svgCanvas.getRStartY())
    }, 100)

    // for each selected:
    // - if newList contains selected, do nothing
    // - if newList doesn't contain selected, remove it from selected
    // - for any newList that was not in selectedElements, add it to selected
    const elemsToRemove = selectedElements.slice(); const elemsToAdd = []
    const newList = svgCanvas.getIntersectionList()

    // For every element in the intersection, add if not present in selectedElements.
    const len = newList.length
    for (let i = 0; i < len; ++i) {
      const intElem = newList[i]
      // Found an element that was not selected before, so we should add it.
      if (!selectedElements.includes(intElem)) {
        elemsToAdd.push(intElem)
      }
      // Found an element that was already selected, so we shouldn't remove it.
      const foundInd = elemsToRemove.indexOf(intElem)
      if (foundInd !== -1) {
        elemsToRemove.splice(foundInd, 1)
      }
    }

    if (elemsToRemove.length > 0) {
      svgCanvas.removeFromSelection(elemsToRemove)
    }

    if (elemsToAdd.length > 0) {
      svgCanvas.addToSelection(elemsToAdd)
    }
  }

  // Handles the mouseUp fallthrough shared by 'resize', 'multiselect' and
  // 'select': resize/multiselect run a small cleanup snippet then fall into
  // this same shared body (mirroring the original switch's intentional
  // fallthrough). Always returns without a result — the orchestrator's
  // mouseUpEvent returns immediately after calling this, skipping the
  // ext_mouseUp/keep-discard epilogue, exactly as the original switch did.
  const up = (evt, ctx) => {
    const { realX, realY, selectedElements, operationMode, pendingMove, tempJustSelected } = ctx
    const mode = svgCanvas.getCurrentMode()
    if (mode === 'resize' || mode === 'multiselect') {
      if (svgCanvas.getRubberBox()) {
        svgCanvas.getRubberBox().setAttribute('display', 'none')
        svgCanvas.setCurBBoxes([])
      }
      svgCanvas.setCurrentMode('select')
    }
    if (selectedElements[0]) {
      // if we only have one selected element
      if (!selectedElements[1]) {
        // set our current stroke/fill properties to the element's
        const selected = selectedElements[0]
        switch (selected.tagName) {
          case 'g':
          case 'use':
          case 'image':
          case 'foreignObject':
            break
          case 'text':
            svgCanvas.setCurText('font_size', selected.getAttribute('font-size'))
            svgCanvas.setCurText('font_family', selected.getAttribute('font-family'))
          // fallthrough
          default:
            svgCanvas.setCurProperties('fill', selected.getAttribute('fill'))
            svgCanvas.setCurProperties('fill_opacity', selected.getAttribute('fill-opacity'))
            svgCanvas.setCurProperties('stroke', selected.getAttribute('stroke'))
            svgCanvas.setCurProperties('stroke_opacity', selected.getAttribute('stroke-opacity'))
            // A missing attribute means the SVG initial value of 1 (cleanupElement
            // strips it at that value) — not null, which downstream consumers of
            // getStrokeWidth() would otherwise treat as 0.
            svgCanvas.setCurProperties('stroke_width', selected.getAttribute('stroke-width') ?? 1)
            svgCanvas.setCurProperties('stroke_dasharray', selected.getAttribute('stroke-dasharray'))
            svgCanvas.setCurProperties('stroke_linejoin', selected.getAttribute('stroke-linejoin'))
            svgCanvas.setCurProperties('stroke_linecap', selected.getAttribute('stroke-linecap'))
        }
        svgCanvas.selectorManager.requestSelector(selected).showGrips(true)
      }
      // if it was being dragged/resized
      if (realX !== svgCanvas.getRStartX() || realY !== svgCanvas.getRStartY()) {
        // Only recalculate dimensions after actual dragging/resizing to avoid
        // unwanted transform flattening on simple clicks

        // Create a single batch command for all moved elements
        const batchCmd = new BatchCommand('position')

        selectedElements.forEach((elem) => {
          if (!elem) return

          const tlist = getTransformList(elem)
          if (!tlist || tlist.numberOfItems === 0) return

          // Get the transform from BEFORE the drag started
          const oldTransform = svgCanvas.dragStartTransforms?.get(elem) || ''

          // Check if the first transform is a translate (the drag transform we added)
          const firstTransform = tlist.getItem(0)
          const hasDragTranslate = firstTransform.type === 2 // SVG_TRANSFORM_TRANSLATE

          // For groups, we always consolidate the transforms (recalculateDimensions returns null for groups)
          const isGroup = elem.tagName === 'g' || elem.tagName === 'a'

          // Groups keep the drag baked as a single matrix transform on the
          // <g> (recalculateDimensions returns null for them).
          if (isGroup && hasDragTranslate) {
            const consolidatedMatrix = transformListToTransform(tlist).matrix

            // Clear the transform list
            while (tlist.numberOfItems > 0) {
              tlist.removeItem(0)
            }

            // Add the consolidated matrix
            const newTransform = svgCanvas.getSvgRoot().createSVGTransform()
            newTransform.setMatrix(consolidatedMatrix)
            tlist.appendItem(newTransform)

            // Record the transform change for undo
            batchCmd.addSubCommand(new ChangeElementCommand(elem, { transform: oldTransform }))
            return
          }

          // A non-group element whose transform list still holds the existing
          // transform plus the dummy drag translate (2+ items): consolidate
          // them into one matrix so recalculateDimensions can bake the move
          // into the geometry below. Without this the translate is left as a
          // matrix transform on the element — and path-edit then draws node
          // grips from the un-translated pathSegList, i.e. at the original
          // location. Skip for resize: that tlist is [translate, scale,
          // translate] and must reach recalculateDimensions to scale real
          // attributes (width/height/font-size/…) rather than bake a matrix.
          // Also skip when a rotation is present: collapsing it into a raw
          // matrix makes getRotationAngle() blind to it, so recalculateDimensions
          // falls into its matrix-as-scale branch and treats cos(angle)/sin(angle)
          // as a scale factor — e.g. font-size *= |cos(90°)| ≈ 0. Leaving the
          // rotate() transform intact lets recalculateDimensions's own
          // translate+rotate decomposition (which does not scale anything) handle it.
          if (
            operationMode !== 'resize' &&
            tlist.numberOfItems > 1 &&
            hasDragTranslate &&
            !getRotationAngle(elem)
          ) {
            const consolidatedMatrix = transformListToTransform(tlist).matrix

            // Clear the transform list
            while (tlist.numberOfItems > 0) {
              tlist.removeItem(0)
            }

            // Add the consolidated matrix
            const newTransform = svgCanvas.getSvgRoot().createSVGTransform()
            newTransform.setMatrix(consolidatedMatrix)
            tlist.appendItem(newTransform)
          }

          // For non-group elements, bake the transform into geometry via recalculateDimensions.
          // recalculateDimensions() reads svgCanvas.getStartTransform() (a single
          // shared slot, not keyed per element) to know what "old" transform to
          // record on the undo command. mousedown only ever set it once, for the
          // element under the cursor — so without this, every OTHER selected
          // element in a multi-select drag got that same clicked element's
          // pre-drag transform baked into its own undo command, snapping it to
          // the wrong place on undo. Set it to this element's own captured value
          // right before calling it.
          svgCanvas.setStartTransform(oldTransform)
          const cmd = svgCanvas.recalculateDimensions(elem)
          if (cmd) {
            batchCmd.addSubCommand(cmd)
          } else {
            // recalculateDimensions returned null
            // Check if the transform actually changed and record it manually
            const newTransform = elem.getAttribute('transform') || ''
            if (newTransform !== oldTransform) {
              batchCmd.addSubCommand(new ChangeElementCommand(elem, { transform: oldTransform }))
            }
          }
        })

        if (!batchCmd.isEmpty()) {
          // A committed drag-move is the repeatable delta for transformAgain.
          if (pendingMove && operationMode !== 'resize') {
            svgCanvas.lastMoveDelta = pendingMove
          }
          svgCanvas.addCommandToHistory(batchCmd)
          // A move/resize bakes the new position/scale into real attributes
          // (x/y, width/height, font-size, …) via recalculateDimensions.
          // Fire 'changed' so the context panel reflects those new values
          // instead of the pre-drag ones.
          svgCanvas.call('changed', selectedElements.filter(Boolean))
        }

        // Clear the stored transforms AND reset the flag together
        svgCanvas.dragStartTransforms = null
        svgCanvas.hasDragStartTransform = false

        const len = selectedElements.length
        for (let i = 0; i < len; ++i) {
          if (!selectedElements[i]) { break }
          svgCanvas.selectorManager.requestSelector(selectedElements[i]).resize()
        }
        // refresh the group box around the (now consolidated) multi-selection
        svgCanvas.updateGroupSelector()
        // no change in position/size, so maybe we should move to pathedit
      } else {
        const t = evt.target
        // Shift-click on an already-selected element removes it from the
        // selection. evt.target may be a child of a selected <g> (or the path
        // interior), so resolve up to the selected element actually under the
        // pointer. This takes priority over path-edit entry so a shift-click
        // always deselects rather than diving into a single selected path.
        const shiftHit = evt.shiftKey &&
          selectedElements.find((s) => s && (s === t || s.contains(t)))
        if (shiftHit && tempJustSelected !== shiftHit) {
          svgCanvas.removeFromSelection([shiftHit])
        } else if (!evt.shiftKey && selectedElements[0].nodeName === 'path' && !selectedElements[1]) {
          // if it was a path
          svgCanvas.pathActions.select(selectedElements[0])
        }
      } // no change in mouse position

      // Remove non-scaling stroke
      const elem = selectedElements[0]
      if (elem) {
        elem.removeAttribute('style')

        // we don't remove the style elements for contents of foreignObjects
        // because that is a valid way to style them
        if (elem.localName === 'foreignObject') {
          walkTree(elem, (el) => {
            el.style.removeProperty('pointer-events')
          })
        } else {
          walkTree(elem, (el) => {
            el.removeAttribute('style')
          })
        }
      }
    }
  }

  return { down, move, multiselectMove, up }
}
