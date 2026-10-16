// @ts-check
/**
 * Resize mode (`resize`) mouse handlers, extracted from the `resize` case of
 * `event.js`'s mouseDown/mouseMove switches. Covers both single-element
 * resize and the multi-element uniform group scale (`resizeGroup`).
 *
 * Note: the `resize` mouseUp case is NOT here — it is two lines (hide the
 * rubber box, switch to 'select' mode) that intentionally fall through into
 * the large shared 'select' mouseUp body in `event.js`, so it's extracted
 * together with that body in `event-select.js`.
 * @module event-resize
 * @license MIT
 */
import { getBBox } from './bbox-utils.ts'
import { getRotationAngle } from './dom-utils.ts'
import { hasMatrixTransform, getTransformList, transformListToTransform, matrixMultiply } from './math.ts'
import {
  isAreaText, getAreaBox, getWrapHeight, areaAttrsForBox, writeAreaAttrs, reflowAreaText, TEXT_LINE_HEIGHT
} from './text-rows.ts'

/**
 * Uniform group scale for a multi-element selection. Scales every selected
 * element by the SAME factor about a common pivot (the corner/edge opposite the
 * dragged grip), so no shape is distorted and the relative layout is preserved.
 * `x`,`y` are the current pointer position in content/user coords.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
const resizeGroup = (svgCanvas, x, y) => {
  const svgRoot = svgCanvas.getSvgRoot()
  const initb = svgCanvas.getInitBbox()
  const bx = initb.x; const by = initb.y; const bw = initb.width; const bh = initb.height
  const mode = svgCanvas.getCurrentResizeMode()

  let dx = x - svgCanvas.getStartX()
  let dy = y - svgCanvas.getStartY()
  if (svgCanvas.getCurConfig().gridSnapping) {
    dx = svgCanvas.snapToGrid(dx)
    dy = svgCanvas.snapToGrid(dy)
  }
  // ignore movement on an axis we are not stretching
  if (!mode.includes('n') && !mode.includes('s')) { dy = 0 }
  if (!mode.includes('e') && !mode.includes('w')) { dx = 0 }

  let sy = bh ? (bh + dy) / bh : 1
  let sx = bw ? (bw + dx) / bw : 1
  if (mode.includes('n')) { sy = bh ? (bh - dy) / bh : 1 }
  if (mode.includes('w')) { sx = bw ? (bw - dx) / bw : 1 }

  // collapse to a single uniform factor (the axis dragged furthest wins)
  const s = Math.abs(1 - sx) >= Math.abs(1 - sy) ? sx : sy

  // pivot = the fixed corner/edge opposite the dragged grip
  const ax = bx + (mode.includes('w') ? bw : 0)
  const ay = by + (mode.includes('n') ? bh : 0)

  // group matrix T(ax,ay) · S(s) · T(-ax,-ay)
  const gm = svgRoot.createSVGMatrix().translate(ax, ay).scale(s).translate(-ax, -ay)

  svgCanvas.gesture.groupResizeStart.forEach((/** @type {SVGMatrix} */ startMatrix, /** @type {Element} */ elem) => {
    const newM = matrixMultiply(gm, startMatrix)
    const tlist = /** @type {SVGTransformList} */ (getTransformList(elem))
    while (tlist.numberOfItems > 0) { tlist.removeItem(0) }
    const t = svgRoot.createSVGTransform()
    t.setMatrix(newM)
    tlist.appendItem(t)
    svgCanvas.selectorManager.requestSelector(elem).resize()
  })

  // redraw the group box scaled about the same pivot
  svgCanvas.selectorManager.showGroupSelector({
    x: ax + (bx - ax) * s,
    y: ay + (by - ay) * s,
    width: bw * s,
    height: bh * s
  })
  svgCanvas.call('transition', svgCanvas.getSelectedElements())
}

/**
 * Resize an area text by its box: the grips move the box's edges, the type keeps its size and
 * the rows wrap again to the new width. The whole drag is one undo step (a transaction held
 * from the first movement until the mouse goes up; `event-select.js` commits it).
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Element} elem An unrotated, untransformed area text
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
const resizeAreaText = (svgCanvas, elem, x, y) => {
  let state = svgCanvas.gesture.areaResize
  if (!state) {
    const box = getAreaBox(elem)
    state = {
      elem,
      box,
      fixedHeight: getWrapHeight(elem) > 0,
      anchor: elem.getAttribute('text-anchor') ?? 'start',
      tx: svgCanvas.beginTransaction('Resize text box', { onAbort: () => { svgCanvas.gesture.areaResize = null } })
    }
    svgCanvas.gesture.areaResize = state
  }
  const { box } = state
  const mode = svgCanvas.getCurrentResizeMode()
  const size = parseFloat(elem.getAttribute('font-size') ?? '') || 16
  let dx = x - svgCanvas.getStartX()
  let dy = y - svgCanvas.getStartY()
  if (svgCanvas.getCurConfig().gridSnapping) {
    dx = svgCanvas.snapToGrid(dx)
    dy = svgCanvas.snapToGrid(dy)
  }
  let left = box.x
  let top = box.y
  let right = box.x + box.width
  let bottom = box.y + box.height
  const minWidth = size
  const minHeight = size * TEXT_LINE_HEIGHT
  if (mode.includes('e')) { right = Math.max(right + dx, left + minWidth) }
  if (mode.includes('w')) { left = Math.min(left + dx, right - minWidth) }
  if (mode.includes('s')) { bottom = Math.max(bottom + dy, top + minHeight) }
  if (mode.includes('n')) { top = Math.min(top + dy, bottom - minHeight) }
  // A box that grew with its text keeps doing so unless a top or bottom grip fixes its height.
  const height = state.fixedHeight || mode.includes('n') || mode.includes('s') ? bottom - top : 0
  writeAreaAttrs(elem, areaAttrsForBox({ x: left, y: top, width: right - left, height }, state.anchor, size))
  reflowAreaText(elem)
  svgCanvas.selectorManager.requestSelector(elem).resize()
  svgCanvas.call('transition', [elem])
}

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 * @function module:event-resize.init
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {{down: Function, move: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  /** @type {(evt: MouseEvent, ctx: any) => any} */
  const down = (evt, ctx) => {
    const { x, y, zoom, selectedElements, mouseTarget } = ctx
    // A box drag whose mouse-up never arrived must not hijack this one.
    if (svgCanvas.gesture.areaResize) {
      svgCanvas.gesture.areaResize.tx.commit()
      svgCanvas.gesture.areaResize = null
    }
    const tlist = getTransformList(mouseTarget)
    if (!tlist) { return }
    svgCanvas.setStarted(true)
    svgCanvas.setStartX(x)
    svgCanvas.setStartY(y)
    // The dummy translate/scale/translate transforms are only needed once a
    // drag actually starts (see the guard in move() below) — inserting them
    // here unconditionally left them permanently stuck on the element (as 3
    // stray identity matrices) whenever a grip was clicked but not dragged,
    // since mouseUp only consolidates/removes them after real movement.
    svgCanvas.gesture.hasResizeStartTransform = false

    // multi-selection: record per-element start matrices and the union bbox,
    // then let mouseMove apply a single uniform group-scale matrix to each.
    const groupElems = selectedElements.filter(Boolean)
    if (groupElems.length > 1) {
      svgCanvas.setInitBbox(svgCanvas.getStrokedBBoxDefaultVisible(groupElems))
      const starts = new Map()
      const transforms = new Map()
      svgCanvas.gesture.groupResizeStart = starts
      svgCanvas.gesture.dragStartTransforms = transforms
      groupElems.forEach((/** @type {Element} */ elem) => {
        starts.set(elem, transformListToTransform(getTransformList(elem)).matrix)
        transforms.set(elem, elem.getAttribute('transform') || '')
      })
      return
    }

    // Getting the BBox from the selection box, since we know we
    // want to orient around it
    svgCanvas.setInitBbox(getBBox(/** @type {Element} */ (svgCanvas.$id('selectedBox0'))))
    /** @type {Record<string, number>} */
    const bb = {}
    for (const [key, val] of Object.entries(svgCanvas.getInitBbox())) {
      bb[key] = val / zoom
    }
    svgCanvas.setInitBbox(bb)
  }

  /** @type {(evt: MouseEvent, ctx: any) => any} */
  const move = (evt, ctx) => {
    const { selected, x, y, svgRoot, selectedElements } = ctx
    // multi-selection: uniform group scale (no per-element distortion)
    if (svgCanvas.gesture.groupResizeStart) {
      resizeGroup(svgCanvas, x, y)
      return
    }
    // an area text keeps its type and changes its box (rotated or transformed ones scale like any text)
    const only = selectedElements.filter(Boolean)
    if (svgCanvas.gesture.areaResize || (only.length === 1 && isAreaText(selected) &&
        !getTransformList(selected)?.numberOfItems)) {
      resizeAreaText(svgCanvas, svgCanvas.gesture.areaResize?.elem ?? selected, x, y)
      return
    }
    // we track the resize bounding box and translate/scale the selected element
    // while the mouse is down, when mouse goes up, we use this to recalculate
    // the shape's coordinates
    const tlist = getTransformList(selected)
    if (!tlist) { return }
    const hasMatrix = hasMatrixTransform(tlist)

    // Insert the three dummy transforms (translate/scale/translate) on the
    // first actual movement of the drag, not on mousedown — a click on a
    // resize grip without any drag must leave the element untouched.
    if (!svgCanvas.gesture.hasResizeStartTransform) {
      const pos = getRotationAngle(selected) ? 1 : 0
      if (hasMatrix) {
        tlist.insertItemBefore(svgRoot.createSVGTransform(), pos)
        tlist.insertItemBefore(svgRoot.createSVGTransform(), pos)
        tlist.insertItemBefore(svgRoot.createSVGTransform(), pos)
      } else {
        tlist.appendItem(svgRoot.createSVGTransform())
        tlist.appendItem(svgRoot.createSVGTransform())
        tlist.appendItem(svgRoot.createSVGTransform())
      }
      svgCanvas.gesture.hasResizeStartTransform = true
    }
    const box = hasMatrix ? svgCanvas.getInitBbox() : getBBox(selected)
    let left = box.x
    let top = box.y
    let { width, height } = box
    let dx = (x - svgCanvas.getStartX())
    let dy = (y - svgCanvas.getStartY())

    if (svgCanvas.getCurConfig().gridSnapping) {
      dx = svgCanvas.snapToGrid(dx)
      dy = svgCanvas.snapToGrid(dy)
      height = svgCanvas.snapToGrid(height)
      width = svgCanvas.snapToGrid(width)
    }

    // if rotated, adjust the dx,dy values
    const angle = getRotationAngle(selected)
    if (angle) {
      const r = Math.sqrt(dx * dx + dy * dy)
      const theta = Math.atan2(dy, dx) - angle * Math.PI / 180.0
      dx = r * Math.cos(theta)
      dy = r * Math.sin(theta)
    }

    // if not stretching in y direction, set dy to 0
    // if not stretching in x direction, set dx to 0
    if (!svgCanvas.getCurrentResizeMode().includes('n') && !svgCanvas.getCurrentResizeMode().includes('s')) {
      dy = 0
    }
    if (!svgCanvas.getCurrentResizeMode().includes('e') && !svgCanvas.getCurrentResizeMode().includes('w')) {
      dx = 0
    }

    let // ts = null,
      tx = 0; let ty = 0
    let sy = height ? (height + dy) / height : 1
    let sx = width ? (width + dx) / width : 1
    // if we are dragging on the north side, then adjust the scale factor and ty
    if (svgCanvas.getCurrentResizeMode().includes('n')) {
      sy = height ? (height - dy) / height : 1
      ty = height
    }

    // if we dragging on the east side, then adjust the scale factor and tx
    if (svgCanvas.getCurrentResizeMode().includes('w')) {
      sx = width ? (width - dx) / width : 1
      tx = width
    }

    // update the transform list with translate,scale,translate
    const translateOrigin = svgRoot.createSVGTransform()
    const scale = svgRoot.createSVGTransform()
    const translateBack = svgRoot.createSVGTransform()

    if (svgCanvas.getCurConfig().gridSnapping) {
      left = svgCanvas.snapToGrid(left)
      tx = svgCanvas.snapToGrid(tx)
      top = svgCanvas.snapToGrid(top)
      ty = svgCanvas.snapToGrid(ty)
    }

    translateOrigin.setTranslate(-(left + tx), -(top + ty))
    // For images, we maintain aspect ratio by default and relax when shift pressed
    const maintainAspectRatio = (selected.tagName !== 'image' && evt.shiftKey) || (selected.tagName === 'image' && !evt.shiftKey)
    if (maintainAspectRatio) {
      if (sx === 1) {
        sx = sy
      } else { sy = sx }
    }
    scale.setScale(sx, sy)

    translateBack.setTranslate(left + tx, top + ty)
    if (hasMatrix) {
      const diff = angle ? 1 : 0
      tlist.replaceItem(translateOrigin, 2 + diff)
      tlist.replaceItem(scale, 1 + diff)
      tlist.replaceItem(translateBack, Number(diff))
    } else {
      const N = tlist.numberOfItems
      tlist.replaceItem(translateBack, N - 3)
      tlist.replaceItem(scale, N - 2)
      tlist.replaceItem(translateOrigin, N - 1)
    }

    svgCanvas.selectorManager.requestSelector(selected).resize()
    // Live readout for the dimension panels — mirrors the anchor-based
    // scale transform being applied above so panels track the in-progress
    // resize instead of the pre-drag value (baked into attributes only at
    // mouseup via recalculateDimensions).
    svgCanvas.dragLiveResizeBox = { left, top, width, height, tx, ty, sx, sy }
    svgCanvas.call('transition', selectedElements)
  }

  return { down, move }
}
