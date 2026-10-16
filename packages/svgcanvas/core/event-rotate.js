// @ts-check
/**
 * Rotate mode (`rotate`) mouse handlers, extracted from the `rotate` case of
 * `event.js`'s mouseDown/mouseMove/mouseUp switches. Covers both
 * single-element rotate and the multi-element rigid group rotate
 * (`rotateGroup`).
 * @module event-rotate
 * @license MIT
 */
import { getBBox } from './bbox-utils.js'
import { transformPoint, getMatrix, getTransformList, transformListToTransform, matrixMultiply } from './math.ts'

/**
 * Rotate a multi-element selection rigidly about its union center by `angle`
 * degrees (absolute, measured from drag start). Each element gets the group
 * rotation matrix R(angle, cx, cy) pre-multiplied onto the matrix it had when
 * the drag began (svgCanvas.gesture.groupRotateStart), so the relative layout is
 * preserved and no shape is individually re-centered. Mirrors resizeGroup.
 * @param {import('../svgcanvas.js').default} svgCanvas
 * @param {number} angle
 * @returns {void}
 */
const rotateGroup = (svgCanvas, angle) => {
  const svgRoot = svgCanvas.getSvgRoot()
  const { x: cx, y: cy } = /** @type {{x: number, y: number}} */ (svgCanvas.gesture.groupRotateCenter)
  const rot = svgRoot.createSVGTransform()
  rot.setRotate(angle, cx, cy)
  const rm = rot.matrix

  const starts = /** @type {Map<Element, SVGMatrix>} */ (svgCanvas.gesture.groupRotateStart)
  starts.forEach((/** @type {SVGMatrix} */ startMatrix, /** @type {Element} */ elem) => {
    const newM = matrixMultiply(rm, startMatrix)
    const tlist = /** @type {SVGTransformList} */ (getTransformList(elem))
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
 * @function module:event-rotate.init
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {{down: Function, move: Function, up: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  /** @type {(evt: MouseEvent, ctx: any) => any} */
  const down = (evt, ctx) => {
    const { selectedElements } = ctx
    svgCanvas.setStarted(true)
    // we are starting an undoable change (a drag-rotation)
    svgCanvas.undoMgr.beginUndoableChange('transform', selectedElements)
    // multi-selection: capture each element's start matrix + the union center
    // so mouseMove can rotate the whole selection rigidly about that center.
    const rotElems = selectedElements.filter(Boolean)
    if (rotElems.length > 1) {
      const ubb = svgCanvas.getStrokedBBoxDefaultVisible(rotElems)
      svgCanvas.gesture.groupRotateCenter = { x: ubb.x + ubb.width / 2, y: ubb.y + ubb.height / 2 }
      svgCanvas.gesture.groupRotateBBox = ubb
      const start = new Map()
      svgCanvas.gesture.groupRotateStart = start
      rotElems.forEach((/** @type {Element} */ elem) => {
        start.set(elem, transformListToTransform(getTransformList(elem)).matrix)
      })
    }
  }

  /** @type {(evt: MouseEvent, ctx: any) => any} */
  const move = (evt, ctx) => {
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
    const box = getBBox(selected)
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

    svgCanvas.setRotationAngle(angle < -180 ? (360 + angle) : angle, true)
    svgCanvas.call('transition', selectedElements)
  }

  /** @type {(evt: MouseEvent, ctx: any) => any} */
  const up = (evt, ctx) => {
    const { selectedElements } = ctx
    svgCanvas.gesture.hasDragStartTransform = false
    svgCanvas.gesture.dragStartTransforms = null
    svgCanvas.setCurrentMode('select')
    const isGroupRotate = !!svgCanvas.gesture.groupRotateStart
    const batchCmd = svgCanvas.undoMgr.finishUndoableChange()
    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
    if (isGroupRotate) {
      // Each element carries a baked R·M matrix transform; finishUndoableChange
      // already recorded those per-element changes. Skip recalculateDimensions
      // (it would try to decompose the matrix) and just refresh the boxes.
      svgCanvas.gesture.groupRotateStart = null
      svgCanvas.gesture.groupRotateCenter = null
      svgCanvas.gesture.groupRotateBBox = null
      selectedElements.filter(Boolean).forEach((/** @type {Element} */ elem) => {
        svgCanvas.selectorManager.requestSelector(elem).resize()
      })
      svgCanvas.updateGroupSelector()
    } else {
      // perform recalculation to weed out any stray identity transforms that might get stuck
      svgCanvas.recalculateAllSelectedDimensions()
    }
    svgCanvas.call('changed', selectedElements)
    return { element: null, keep: true }
  }

  return { down, move, up }
}
