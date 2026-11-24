/**
 * Selection mode (`select`/`multiselect`) mouse handlers, extracted from the
 * `select`/`multiselect` cases of `event.js`'s mouseDown/mouseMove/mouseUp
 * switches. This is the highest-traffic mode family: drag-move with
 * proportion/smart-guide snapping, rubber-band multiselect, and the mouseUp
 * property-capture + transform-consolidation tail shared (via fallthrough in
 * the original switch) by `resize` and `multiselect` as well as `select`
 * itself.
 *
 * A press in select mode begins a gesture on the gesture session (core/gesture-session.ts, roadmap R9): a `move` on an
 * element (its state, `MoveState`, on it) or a `marquee` on empty canvas (`MarqueeState`), each with one transaction for its
 * undo step (a click commits nothing); `event.ts` commits it after the release body. Escape, a mode switch, a new press, a
 * lost focus or a context menu roll it back with its selection, and the state goes with it.
 * @module event-select
 * @license MIT
 */
import { assignAttributes, walkTree, getRotationAngle, restoreTransformAttr } from './dom-utils.ts'
import { getTransformList, transformListToTransform } from './math.ts'
import { proportionLines } from './proportions.ts'
import { collectSnapTargets, snapMovingBBox, findEqualSpacing } from './smart-guides.ts'
import { getAlignBoxOf } from './align-box.ts'
import { toCurrentGroupLocalDelta } from './event-group-context.ts'
import * as hstry from './history.js'
import { parseMatrix } from './model/matrix.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { BBox } from '../svgcanvas.ts'
import type { Gesture } from './gesture-session.ts'
import type { DragEntry } from './model-commands.ts'
import type { SnapTarget } from './smart-guides.ts'

const { BatchCommand, ChangeElementCommand } = hstry

/** What a drag of the selection keeps from its press to its release. */
export interface MoveState {
  /** Alt was down at the press: the drag clones the selection once it passes the click / drag threshold */
  clone: boolean
  /** what the release selects if the press never became a drag (the topmost element a covered selection was preferred
   * over, or the clicked member of a multi-selection; event.ts mouseDown) */
  clickSelect: Element | null
  /** the first movement has happened: the start transforms are taken and the dummy translates are in (or the plan decided) */
  begun: boolean
  /** each dragged element's transform before the drag (what its undo goes back to) */
  startTransforms: Map<Element, string> | null
  /** a drag shown through the model (core/model-commands.ts `dragPlan`): what each element's transform amounts to */
  plan: Map<Element, DragEntry> | null
  /** the selection's box at the first movement: what proportion and smart snapping test */
  startBBox: BBox | null
  /** the pointer has moved past the click / drag threshold */
  moved: boolean
  /** the delta transformAgain repeats once the drag is committed */
  pending: { dx: number, dy: number } | null
  /** what smart snapping snaps to, collected at its first use */
  snapTargets: SnapTarget[] | null
}

/** What a rubber-band selection keeps from its press to its release. */
export interface MarqueeState {
  /** the band has spanned more than the click / drag threshold */
  moved: boolean
}

/** The drag data the shared release body bakes from: the move gesture's, or the resize gesture's. */
export interface DragBake {
  startTransforms: Map<Element, string> | null
  plan: Map<Element, DragEntry> | null
}

interface DownContext {
  mouseTarget: Element
  svgRoot: SVGSVGElement
  rightClick: boolean
  selectedElements: Element[]
  zoom: number
  /** what the release selects if the press does not become a drag (event.ts) */
  clickSelect: Element | null
}
interface MoveContext { selectedElements: Element[], selected: Element | null, x: number, y: number, zoom: number, svgRoot: SVGSVGElement }
interface MultiselectContext { selectedElements: Element[], realX: number, realY: number, zoom: number }
interface UpContext {
  realX: number
  realY: number
  selectedElements: Element[]
  operationMode: string
  pendingMove: { dx: number, dy: number } | null | undefined
  tempJustSelected: Element | null
  /** the press moved far enough to count as a drag */
  moved: boolean
  /** what a press that did not move selects (`MoveState.clickSelect`) */
  clickSelect: Element | null
  /** what the release bakes (the gesture's start transforms and model plan), or null */
  drag: DragBake | null
}

// update the dummy transform in our transform list
// to be a translate. We need to check if there was a transformation
// to avoid loosing it
const updateTransformList = (svgRoot: SVGSVGElement, element: Element, dx: number, dy: number): void => {
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
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: DownContext) => void
  move: (evt: MouseEvent, ctx: MoveContext) => void
  multiselectMove: (evt: MouseEvent, ctx: MultiselectContext) => void
  up: (evt: MouseEvent, ctx: UpContext) => void
  /** The drag of the selection in progress, or null. */
  currentMove: () => Gesture<MoveState> | null
  /** The rubber-band selection in progress, or null. */
  currentMarquee: () => Gesture<MarqueeState> | null
} => {
  const svgCanvas = canvas

  const currentMove = (): Gesture<MoveState> | null => {
    const g = svgCanvas.activeGesture()
    return g?.kind === 'move' ? g as Gesture<MoveState> : null
  }
  const currentMarquee = (): Gesture<MarqueeState> | null => {
    const g = svgCanvas.activeGesture()
    return g?.kind === 'marquee' ? g as Gesture<MarqueeState> : null
  }

  /** The rubber band goes when its gesture ends (released or rolled back). */
  const hideRubberBand = (): void => {
    const box = svgCanvas.getRubberBox()
    if (!box) return
    box.setAttribute('display', 'none')
    svgCanvas.setCurBBoxes([])
  }

  /** The guides a drag shows, and the selection boxes, go back with a rolled-back gesture. */
  const clearDragOverlays = (): void => {
    svgCanvas.showSnapGuides?.(null)
    svgCanvas.showSmartGuides?.(null)
    svgCanvas.dragLiveMoveDelta = undefined
  }

  const down = (evt: MouseEvent, ctx: DownContext): void => {
    const { mouseTarget, svgRoot, rightClick, selectedElements, zoom, clickSelect } = ctx
    svgCanvas.setStarted(true)
    svgCanvas.setCurrentResizeMode('none')
    if (rightClick) { svgCanvas.setStarted(false) }

    // The gesture begins before the press changes the selection, so a roll-back puts the selection back too. A right-click
    // is not a gesture: it keeps the selection for the context menu.
    if (!rightClick && mouseTarget !== svgRoot) {
      const state: MoveState = {
        // Alt-drag duplicates: only armed here, the clone happens in move() once the drag passes the threshold
        clone: evt.altKey,
        clickSelect,
        begun: false,
        startTransforms: null,
        plan: null,
        startBBox: null,
        moved: false,
        pending: null,
        snapTargets: null
      }
      svgCanvas.beginGesture<MoveState>('move', {
        state,
        label: 'position',
        onCancel: () => {
          clearDragOverlays()
          svgCanvas.setStarted(false)
          svgCanvas.setCurrentMode('select')
          for (const el of svgCanvas.getSelectedElements()) if (el) svgCanvas.selectorManager.requestSelector(el).resize()
          svgCanvas.updateGroupSelector()
        }
      })
    } else if (!rightClick) {
      svgCanvas.beginGesture<MarqueeState>('marquee', {
        state: { moved: false },
        label: 'select',
        onCancel: () => {
          svgCanvas.setStarted(false)
          hideRubberBand()
          svgCanvas.setCurrentMode('select')
        }
      })
    }

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
      // Clicking empty canvas deselects, same as clicking a different element
      // above (which does call this). Without it, pathActions' double-click
      // arming state (#currentPath) keeps pointing at whatever path was
      // selected before this click — a later click on an unrelated path can
      // then match it by stale identity and jump straight into that unrelated
      // path's node-edit mode instead of arming for a real double-click.
      svgCanvas.pathActions.clear()
      svgCanvas.setCurrentMode('multiselect')
      if (!svgCanvas.getRubberBox()) {
        svgCanvas.setRubberBox(svgCanvas.selectorManager.getRubberBandBox())
      }
      svgCanvas.setRStartX(svgCanvas.getRStartX() * zoom)
      svgCanvas.setRStartY(svgCanvas.getRStartY() * zoom)

      assignAttributes(svgCanvas.requireRubberBox(), {
        x: svgCanvas.getRStartX(),
        y: svgCanvas.getRStartY(),
        width: 0,
        height: 0,
        display: 'inline'
      }, 100)
    }
  }

  const move = (evt: MouseEvent, ctx: MoveContext): void => {
    const gesture = currentMove()
    if (!gesture) return
    const { state } = gesture
    const { selectedElements, selected, zoom, svgRoot } = ctx
    const { x, y } = ctx
    // Alt-drag-to-duplicate: only clone once the drag crosses the same "was
    // this a real drag or just a click" 4-screen-px threshold used below
    // (deltaThresholdReached) to gate an ordinary drag actually moving the
    // selection -- not on the mere first mousemove tick after an alt+
    // mousedown, and not at mousedown itself. event.js's mouseDownEventImpl
    // only arms the intent (`MoveState.clone`); cloning unconditionally
    // right there used to stamp an invisible duplicate (offset 0,0, sitting
    // exactly on top of the original) on a plain alt+click that never
    // actually dragged, or on any mousedown where the browser/OS misreports
    // a stale altKey:true. Checked before the dummy-transform insertion below
    // so a clone that never happens doesn't leave a stray no-op transform
    // stacked on the original; while armed and still under threshold this
    // returns early every tick, touching nothing.
    if (state.clone && selectedElements.length > 0) {
      const armDeltaThreshold = 4 / zoom
      const dx0 = x - svgCanvas.getStartX()
      const dy0 = y - svgCanvas.getStartY()
      if (Math.abs(dx0) <= armDeltaThreshold && Math.abs(dy0) <= armDeltaThreshold) {
        return
      }
      state.clone = false
      // the clone and its move are one step: the gesture's
      gesture.relabel('Clone Elements')
      svgCanvas.cloneSelectedElements(0, 0)
      return
    }

    // Insert dummy transform on first mouse move (drag start), not on click.
    // This avoids creating multiple transforms that trigger unwanted flattening.
    if (!state.begun && selectedElements.length > 0) {
      // Store original transforms BEFORE adding the drag transform (for undo)
      state.startTransforms = new Map()
      state.plan = svgCanvas.dragPlan(selectedElements.filter(Boolean), true)
      for (const selectedElement of selectedElements) {
        if (!selectedElement) { continue }
        // Capture the transform attribute before we modify it
        state.startTransforms.set(selectedElement, selectedElement.getAttribute('transform') || '')
        if (state.plan) continue // shown through the model: no transform is put on the element
        const slist = getTransformList(selectedElement)
        if (!slist) { continue }
        if (slist.numberOfItems) {
          slist.insertItemBefore(svgRoot.createSVGTransform(), 0)
        } else {
          slist.appendItem(svgRoot.createSVGTransform())
        }
      }
      state.begun = true
      // Snapshot the selection bbox at drag start so proportion snapping can
      // test edge/center positions against the candidate (post-delta) bbox.
      // (a group with an alignment box snaps by that child, core/align-box.ts)
      state.startBBox = getAlignBoxOf(svgCanvas, selectedElements.filter(Boolean))
    }
    // we temporarily use a translate on the element(s) being dragged
    // this transform is removed upon mousing up and the element is
    // relocated to the new location
    if (selected) {
      let dx = x - svgCanvas.getStartX()
      let dy = y - svgCanvas.getStartY()
      if (svgCanvas.getCurConfig().gridSnapping) {
        ({ x: dx, y: dy } = svgCanvas.snapPointToGrid(dx, dy))
      }
      // Wireframe proportion snapping: align the moving selection's edges or
      // center to the canvas proportion lines (x = w·f, y = h·f). On a match,
      // ask the markers extension to draw a guide line in the marker's color.
      if (svgCanvas.getCurConfig().wireframeSnapping && state.startBBox) {
        const res = svgCanvas.getResolution()
        const tol = 8 / zoom // ~8 screen px
        const bb = state.startBBox
        const snapAxis = (lines: Array<{ pos: number, color: string }>, refs: number[]): { delta: number, pos: number, color: string } | null => {
          let best: { delta: number, pos: number, color: string } | null = null
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
        state.startBBox && !svgCanvas.getCurrentGroup()) {
        state.snapTargets ??= collectSnapTargets(svgCanvas, selectedElements)
        const tol = 8 / zoom // ~8 screen px
        const bb = state.startBBox
        const snap = snapMovingBBox(bb, dx, dy, state.snapTargets, tol)
        const spacing = findEqualSpacing(bb, dx, dy, state.snapTargets, tol)
        // Per-axis precedence: same-kind alignment (edge↔edge/center↔center)
        // > equal spacing > mixed alignment (edge↔center).
        const useSpacingX = spacing.x && !(snap.x?.same)
        const useSpacingY = spacing.y && !(snap.y?.same)
        if (useSpacingX) { dx += (spacing.x as { delta: number }).delta } else if (snap.x) { dx += snap.x.delta }
        if (useSpacingY) { dy += (spacing.y as { delta: number }).delta } else if (snap.y) { dy += snap.y.delta }
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

      // Enable moving selection only if mouse has been moved at least 4 screen px in any
      // direction. This prevents objects from being accidentally moved when (initially)
      // selected. dx/dy are in content units, so the threshold must scale with zoom to stay
      // a constant 4 screen px (otherwise drags feel "stuck" when zoomed in, or trigger too
      // easily when zoomed out).
      const deltaThreshold = 4 / zoom
      const deltaThresholdReached = Math.abs(dx) > deltaThreshold || Math.abs(dy) > deltaThreshold
      state.moved ||= deltaThresholdReached

      if (state.moved) {
        // Inside a transformed group the children's translate lives in the
        // group's local space, so map the content-space delta accordingly
        // (no-op at top level). Fixes child dragging too far in a scaled/
        // rotated group.
        const { dx: ldx, dy: ldy } = toCurrentGroupLocalDelta(svgCanvas, dx, dy)
        // Candidate delta for transformAgain — committed in mouseUp.
        state.pending = { dx, dy }
        const { plan } = state
        if (plan) svgCanvas.previewDrag(plan, ldx, ldy)
        selectedElements.forEach((el) => {
          if (el) {
            if (!plan) updateTransformList(svgRoot, el, ldx, ldy)
            // update our internal bbox that we're tracking while dragging
            svgCanvas.selectorManager.requestSelector(el).resize()
          }
        })
        // Live readout for the position panels (attributes stay untouched
        // until mouseup's recalculateDimensions, so panels need this delta
        // to show the in-progress position instead of the pre-drag value).
        svgCanvas.dragLiveMoveDelta = plan ? { dx: 0, dy: 0 } : { dx: ldx, dy: ldy } // a model preview has moved the attributes already
        svgCanvas.call('transition', selectedElements)
      }
    }
  }

  const multiselectMove = (evt: MouseEvent, ctx: MultiselectContext): void => {
    const gesture = currentMarquee()
    if (!gesture) return
    const { selectedElements, zoom } = ctx
    let { realX, realY } = ctx
    realX *= zoom
    realY *= zoom
    assignAttributes(svgCanvas.requireRubberBox(), {
      x: Math.min(svgCanvas.getRStartX(), realX),
      y: Math.min(svgCanvas.getRStartY(), realY),
      width: Math.abs(realX - svgCanvas.getRStartX()),
      height: Math.abs(realY - svgCanvas.getRStartY())
    }, 100)

    // A press on empty canvas that jitters a pixel or two is a click (deselect), not a marquee: the band selects nothing until
    // it is 4 screen px across in some direction, the threshold a drag of the selection uses (`move` above). Both are screen px.
    const spanned = Math.abs(realX - svgCanvas.getRStartX()) > 4 || Math.abs(realY - svgCanvas.getRStartY()) > 4
    gesture.state.moved ||= spanned
    if (!gesture.state.moved) return

    // for each selected:
    // - if newList contains selected, do nothing
    // - if newList doesn't contain selected, remove it from selected
    // - for any newList that was not in selectedElements, add it to selected
    const elemsToRemove = selectedElements.slice(); const elemsToAdd = []
    const newList = svgCanvas.getIntersectionList() ?? []

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
  const up = (evt: MouseEvent, ctx: UpContext): void => {
    const { realX, realY, selectedElements, operationMode, pendingMove, tempJustSelected, moved, clickSelect, drag } = ctx
    const mode = svgCanvas.getCurrentMode()
    // an Alt-drag stretch: it applies the stretch (in the resize gesture's step), nothing is left to bake below
    const stretched = mode === 'resize' && svgCanvas.stretch.isActive()
    if (stretched) {
      svgCanvas.stretch.commit()
    }
    const wasMarquee = mode === 'multiselect'
    if (mode === 'resize' || mode === 'multiselect') {
      hideRubberBand()
      svgCanvas.setCurrentMode('select')
    }
    // A click (no drag) on the element above a covered selection, or on one member of a multi-selection, selects just that
    // element: the selection was kept at the press only so that a drag would move it.
    if (operationMode === 'select' && !moved && clickSelect?.isConnected && !evt.shiftKey) {
      svgCanvas.pathActions.clear()
      svgCanvas.selectOnly([clickSelect], true)
      // arm the double-click into node edit, as a first click on a path does
      if (clickSelect.nodeName === 'path') svgCanvas.pathActions.select(clickSelect)
      return
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
      // (a rubber-band drag moves nothing: baking there would push a spurious "position" undo step)
      if (stretched) {
        // committed above
      } else if (!wasMarquee && (realX !== svgCanvas.getRStartX() || realY !== svgCanvas.getRStartY())) {
        // Only recalculate dimensions after actual dragging/resizing to avoid
        // unwanted transform flattening on simple clicks

        // Create a single batch command for all moved elements
        const batchCmd = new BatchCommand('position')
        // A drag of plain shapes that only carry a translation is stated on the model (one step); anything else bakes below
        const before = new Map<Element, string>()
        for (const elem of selectedElements) if (elem) before.set(elem, drag?.startTransforms?.get(elem) ?? '')
        const bakedByModel = before.size > 0 && svgCanvas.bakeDrag(before, restoreTransformAttr, drag?.plan ?? null)

        selectedElements.forEach((elem) => {
          if (bakedByModel) return
          if (!elem) return

          const tlist = getTransformList(elem)
          if (!tlist || tlist.numberOfItems === 0) return

          // Get the transform from BEFORE the drag started
          const oldTransform = drag?.startTransforms?.get(elem) || ''

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
          // A bake that folds the element's pre-gesture transform into its geometry (a move, a group resize) keeps its stroke's
          // look: recalculateDimensions scales the stroke by this, in the same undo command. Only when the start is known.
          const was = drag?.startTransforms?.has(elem) ? parseMatrix(oldTransform) : null
          svgCanvas.gesture.bakeStrokeScale = was ? Math.sqrt(Math.abs(was[0] * was[3] - was[1] * was[2])) : null
          let cmd
          try {
            cmd = svgCanvas.recalculateDimensions(elem)
          } finally {
            svgCanvas.gesture.bakeStrokeScale = null
          }
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
        }

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
          selectedElements.find((s) => s && (s === t || s.contains(t as Node | null)))
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

  return { down, move, multiselectMove, up, currentMove, currentMarquee }
}
