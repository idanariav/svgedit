/**
 * Rotate mode (`rotate`) mouse handlers, extracted from the `rotate` case of
 * `event.js`'s mouseDown/mouseMove/mouseUp switches. Covers both
 * single-element rotate and the multi-element rigid group rotate
 * (`rotateGroup`).
 *
 * A rotation is a gesture on the gesture session (core/gesture-session.ts, roadmap R9): the press begins it, with its state
 * (`RotateState`) on it and one transaction for its undo step; the release commits it; Escape, a mode switch, a new press, a
 * lost focus or a context menu roll it back, and the state goes with it.
 * @module event-rotate
 * @license MIT
 */
import { requireBBox } from './bbox-utils.ts'
import { transformPoint, getMatrix, getTransformList, transformListToTransform, matrixMultiply } from './math.ts'
import { restoreTransformAttr } from './dom-utils.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { BBox } from '../svgcanvas.ts'
import type { Gesture } from './gesture-session.ts'
import type { Affine } from './model-commands.ts'

/** What a rotation keeps from its press to its release. */
interface RotateState {
  /** the elements being turned */
  elems: Element[]
  /** what each element's transform was, to put back when the rotation is stated on the model */
  startTransforms: Map<Element, string>
  /** a selection of several turns rigidly about the centre of their union box */
  group: { center: { x: number, y: number }, bbox: BBox, start: Map<Element, SVGMatrix> } | null
  /** the rotation shown through the model (core/model-commands.ts `rotationPlan`) */
  plan: { id: string, cx: number, cy: number } | null
  /** a rotation of the whole selection shown through the model (`rotationGroupPlan`): each element's transform before it */
  groupPlan: Map<Element, Affine> | null
  /** the plan was decided (it may be null: the DOM is turned instead) */
  planned: boolean
}

const KIND = 'rotate'

/**
 * Rotate a multi-element selection rigidly about its union center by `angle`
 * degrees (absolute, measured from drag start). Each element gets the group
 * rotation matrix R(angle, cx, cy) pre-multiplied onto the matrix it had when
 * the drag began, so the relative layout is
 * preserved and no shape is individually re-centered. Mirrors resizeGroup.
 */
const rotateGroup = (svgCanvas: SvgCanvas, state: RotateState, angle: number): void => {
  const group = state.group as NonNullable<RotateState['group']>
  const svgRoot = svgCanvas.getSvgRoot()
  const { x: cx, y: cy } = group.center
  const rot = svgRoot.createSVGTransform()
  rot.setRotate(angle, cx, cy)
  const rm = rot.matrix

  // Elements with a plain transform are turned in front of the renderer: the model shows each angle
  if (!state.planned) {
    state.groupPlan = svgCanvas.rotationGroupPlan([...group.start.keys()])
    state.planned = true
  }
  const plan = state.groupPlan
  if (plan) svgCanvas.previewGroupRotation(plan, angle, cx, cy)
  group.start.forEach((startMatrix, elem) => {
    if (plan) {
      svgCanvas.selectorManager.requestSelector(elem).resize()
      return
    }
    const newM = matrixMultiply(rm, startMatrix)
    const tlist = getTransformList(elem) as SVGTransformList
    while (tlist.numberOfItems > 0) { tlist.removeItem(0) }
    const t = svgRoot.createSVGTransform()
    t.setMatrix(newM)
    tlist.appendItem(t)
    svgCanvas.selectorManager.requestSelector(elem).resize()
  })

  // rotate the group box + grips rigidly about the union center
  svgCanvas.selectorManager.showGroupSelector(group.bbox, angle)
  svgCanvas.call('transition', svgCanvas.getSelectedElements())
}

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: { selectedElements: Element[] }) => void
  move: (evt: MouseEvent, ctx: { selected: Element, x: number, y: number, selectedElements: Element[] }) => void
  up: (evt: MouseEvent, ctx: { selectedElements: Element[] }) => { element: null, keep: true }
} => {
  const svgCanvas = canvas

  /** The rotation in progress, or null. */
  const current = (): Gesture<RotateState> | null => {
    const g = svgCanvas.activeGesture()
    return g?.kind === KIND ? g as Gesture<RotateState> : null
  }

  /** The selection boxes and grips follow the elements (after the release, or after a roll-back put them back). */
  const refreshSelectors = (state: RotateState): void => {
    state.elems.forEach((elem) => { svgCanvas.selectorManager.requestSelector(elem).resize() })
    if (state.group) svgCanvas.updateGroupSelector()
  }

  const down = (_evt: MouseEvent, ctx: { selectedElements: Element[] }): void => {
    const elems = ctx.selectedElements.filter(Boolean)
    let group: RotateState['group'] = null
    // multi-selection: each element's start matrix + the union center, so a move turns the whole selection rigidly
    if (elems.length > 1) {
      const bbox = svgCanvas.getStrokedBBoxDefaultVisible(elems)
      group = {
        center: { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 },
        bbox,
        start: new Map(elems.map((elem) => [elem, transformListToTransform(getTransformList(elem)).matrix]))
      }
    }
    const state: RotateState = {
      elems,
      startTransforms: new Map(elems.map((el) => [el, el.getAttribute('transform') || ''])),
      group,
      plan: null,
      groupPlan: null,
      planned: false
    }
    svgCanvas.beginGesture<RotateState>(KIND, {
      state,
      label: 'Rotate',
      onCancel: () => {
        svgCanvas.setStarted(false)
        svgCanvas.setCurrentMode('select')
        refreshSelectors(state)
      }
    })
    svgCanvas.setStarted(true)
  }

  const move = (evt: MouseEvent, ctx: { selected: Element, x: number, y: number, selectedElements: Element[] }): void => {
    const gesture = current()
    if (!gesture) return
    const { state } = gesture
    const { selected, x, y, selectedElements } = ctx
    // multi-selection: rotate the whole group rigidly about the union center
    if (state.group) {
      const { x: cx, y: cy } = state.group.center
      let angle = ((Math.atan2(cy - y, cx - x) * (180 / Math.PI)) - 90) % 360
      if (svgCanvas.getCurConfig().gridSnapping) { angle = svgCanvas.snapToGrid(angle) }
      if (evt.shiftKey) { angle = Math.round(angle / 15) * 15 }
      rotateGroup(svgCanvas, state, angle < -180 ? (360 + angle) : angle)
      return
    }
    const box = requireBBox(selected)
    let cx = box.x + box.width / 2
    let cy = box.y + box.height / 2
    const m = getMatrix(selected)
    const center = transformPoint(cx, cy, m)
    cx = center.x
    cy = center.y
    let angle = ((Math.atan2(cy - y, cx - x) * (180 / Math.PI)) - 90) % 360
    if (svgCanvas.getCurConfig().gridSnapping) {
      angle = svgCanvas.snapToGrid(angle)
    }
    if (evt.shiftKey) { // restrict rotations to nice angles (WRS)
      const snap = 15
      angle = Math.round(angle / snap) * snap
    }

    const turn = angle < -180 ? (360 + angle) : angle
    // A plain shape is turned in front of the renderer: the model shows each angle and the element is not edited by the gesture
    if (!state.planned && state.elems.length === 1) {
      state.plan = svgCanvas.rotationPlan(selected)
      state.planned = true
    }
    if (state.plan) {
      svgCanvas.previewRotation(state.plan, turn)
    } else {
      svgCanvas.setRotationAngle(turn, true)
    }
    svgCanvas.call('transition', selectedElements)
  }

  const up = (_evt: MouseEvent, _ctx: { selectedElements: Element[] }): { element: null, keep: true } => {
    svgCanvas.setCurrentMode('select')
    const gesture = current()
    if (!gesture) return { element: null, keep: true as const }
    const { state } = gesture
    if ((state.plan || state.groupPlan) && svgCanvas.snapshotHistory.previewing) {
      // The renderer has been showing the rotation: that is the step
      svgCanvas.snapshotHistory.endPreview('Rotate')
      if (!state.group) svgCanvas.recalculateAllSelectedDimensions()
    } else {
      // The rotation is stated on the model; an element it cannot state (no id) stays as the DOM has it, which the
      // transaction records just the same
      svgCanvas.commitTransforms('Rotate', state.startTransforms, restoreTransformAttr)
      // a group rotate leaves each element a baked R·M matrix: recalculateDimensions would try to decompose it
      // perform recalculation to weed out any stray identity transforms that might get stuck
      if (!state.group) svgCanvas.recalculateAllSelectedDimensions()
    }
    gesture.commit()
    refreshSelectors(state)
    return { element: null, keep: true as const }
  }

  return { down, move, up }
}
