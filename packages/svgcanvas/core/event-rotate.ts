/**
 * Rotate mode (`rotate`) mouse handlers, extracted from the `rotate` case of
 * `event.js`'s mouseDown/mouseMove/mouseUp switches. Covers both
 * single-element rotate and the multi-element rigid group rotate
 * (`rotateGroup`).
 * @module event-rotate
 * @license MIT
 */
import { requireBBox } from './bbox-utils.ts'
import { transformPoint, getMatrix, getTransformList, transformListToTransform, matrixMultiply } from './math.ts'
import { restoreTransformAttr } from './dom-utils.ts'
import type SvgCanvas from '../svgcanvas.ts'

/**
 * Rotate a multi-element selection rigidly about its union center by `angle`
 * degrees (absolute, measured from drag start). Each element gets the group
 * rotation matrix R(angle, cx, cy) pre-multiplied onto the matrix it had when
 * the drag began (svgCanvas.gesture.groupRotateStart), so the relative layout is
 * preserved and no shape is individually re-centered. Mirrors resizeGroup.
 */
const rotateGroup = (svgCanvas: SvgCanvas, angle: number): void => {
  const svgRoot = svgCanvas.getSvgRoot()
  const { x: cx, y: cy } = svgCanvas.gesture.groupRotateCenter as { x: number, y: number }
  const rot = svgRoot.createSVGTransform()
  rot.setRotate(angle, cx, cy)
  const rm = rot.matrix

  const starts = svgCanvas.gesture.groupRotateStart as Map<Element, SVGMatrix>
  starts.forEach((startMatrix, elem) => {
    const newM = matrixMultiply(rm, startMatrix)
    const tlist = getTransformList(elem) as SVGTransformList
    while (tlist.numberOfItems > 0) { tlist.removeItem(0) }
    const t = svgRoot.createSVGTransform()
    t.setMatrix(newM)
    tlist.appendItem(t)
    svgCanvas.selectorManager.requestSelector(elem).resize()
  })

  // rotate the group box + grips rigidly about the union center
  svgCanvas.selectorManager.showGroupSelector(svgCanvas.gesture.groupRotateBBox, angle)
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
  let startTransforms = new Map<Element, string>()

  const down = (_evt: MouseEvent, ctx: { selectedElements: Element[] }): void => {
    const { selectedElements } = ctx
    svgCanvas.setStarted(true)
    svgCanvas.gesture.rotationPlan = null
    svgCanvas.gesture.rotationShown = false
    // we are starting an undoable change (a drag-rotation)
    svgCanvas.undoMgr.beginUndoableChange('transform', selectedElements)
    // what each element's transform was, to put back when the gesture is stated on the model
    startTransforms = new Map(selectedElements.filter(Boolean).map((el) => [el, el.getAttribute('transform') || '']))
    // multi-selection: capture each element's start matrix + the union center
    // so mouseMove can rotate the whole selection rigidly about that center.
    const rotElems = selectedElements.filter(Boolean)
    if (rotElems.length > 1) {
      const ubb = svgCanvas.getStrokedBBoxDefaultVisible(rotElems)
      svgCanvas.gesture.groupRotateCenter = { x: ubb.x + ubb.width / 2, y: ubb.y + ubb.height / 2 }
      svgCanvas.gesture.groupRotateBBox = ubb
      const start = new Map<Element, SVGMatrix>()
      svgCanvas.gesture.groupRotateStart = start
      rotElems.forEach((elem) => {
        start.set(elem, transformListToTransform(getTransformList(elem)).matrix)
      })
    }
  }

  const move = (evt: MouseEvent, ctx: { selected: Element, x: number, y: number, selectedElements: Element[] }): void => {
    const { selected, x, y, selectedElements } = ctx
    // multi-selection: rotate the whole group rigidly about the union center
    if (svgCanvas.gesture.groupRotateStart && svgCanvas.gesture.groupRotateCenter) {
      const { x: cx, y: cy } = svgCanvas.gesture.groupRotateCenter
      let angle = ((Math.atan2(cy - y, cx - x) * (180 / Math.PI)) - 90) % 360
      if (svgCanvas.getCurConfig().gridSnapping) { angle = svgCanvas.snapToGrid(angle) }
      if (evt.shiftKey) { angle = Math.round(angle / 15) * 15 }
      rotateGroup(svgCanvas, angle < -180 ? (360 + angle) : angle)
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
    if (svgCanvas.gesture.rotationPlan === null && selectedElements.filter(Boolean).length === 1 && !svgCanvas.gesture.rotationShown) {
      svgCanvas.gesture.rotationPlan = svgCanvas.rotationPlan(selected)
      svgCanvas.gesture.rotationShown = true
    }
    if (svgCanvas.gesture.rotationPlan) {
      svgCanvas.previewRotation(svgCanvas.gesture.rotationPlan, turn)
    } else {
      svgCanvas.setRotationAngle(turn, true)
    }
    svgCanvas.call('transition', selectedElements)
  }

  const up = (_evt: MouseEvent, ctx: { selectedElements: Element[] }): { element: null, keep: true } => {
    const { selectedElements } = ctx
    svgCanvas.gesture.hasDragStartTransform = false
    svgCanvas.gesture.dragStartTransforms = null
    svgCanvas.setCurrentMode('select')
    const isGroupRotate = !!svgCanvas.gesture.groupRotateStart
    const batchCmd = svgCanvas.undoMgr.finishUndoableChange()
    if (svgCanvas.gesture.rotationPlan && svgCanvas.snapshotHistory.previewing) {
      // The renderer has been showing the rotation: that is the step
      svgCanvas.snapshotHistory.endPreview('Rotate')
      svgCanvas.gesture.rotationPlan = null
      svgCanvas.gesture.rotationShown = false
      svgCanvas.recalculateAllSelectedDimensions()
      svgCanvas.call('changed', selectedElements)
      return { element: null, keep: true as const }
    }
    svgCanvas.gesture.rotationPlan = null
    svgCanvas.gesture.rotationShown = false
    // The rotation is stated on the model (one step); the commands only say it happened
    const stated = !batchCmd.isEmpty() && svgCanvas.commitTransforms('Rotate', startTransforms, restoreTransformAttr)
    if (!batchCmd.isEmpty() && !stated) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
    if (isGroupRotate) {
      // Each element carries a baked R·M matrix transform; finishUndoableChange
      // already recorded those per-element changes. Skip recalculateDimensions
      // (it would try to decompose the matrix) and just refresh the boxes.
      svgCanvas.gesture.groupRotateStart = null
      svgCanvas.gesture.groupRotateCenter = null
      svgCanvas.gesture.groupRotateBBox = null
      selectedElements.filter(Boolean).forEach((elem) => {
        svgCanvas.selectorManager.requestSelector(elem).resize()
      })
      svgCanvas.updateGroupSelector()
    } else {
      // perform recalculation to weed out any stray identity transforms that might get stuck
      svgCanvas.recalculateAllSelectedDimensions()
    }
    svgCanvas.call('changed', selectedElements)
    return { element: null, keep: true as const }
  }

  return { down, move, up }
}
