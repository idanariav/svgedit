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
import { getBBox } from './bbox-utils.js'
import { getRotationAngle } from './dom-utils.js'
import { hasMatrixTransform, getTransformList, transformListToTransform, matrixMultiply } from './math.js'

/**
 * Uniform group scale for a multi-element selection. Scales every selected
 * element by the SAME factor about a common pivot (the corner/edge opposite the
 * dragged grip), so no shape is distorted and the relative layout is preserved.
 * `x`,`y` are the current pointer position in content/user coords.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Float} x
 * @param {Float} y
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

  svgCanvas.groupResizeStart.forEach((startMatrix, elem) => {
    const newM = matrixMultiply(gm, startMatrix)
    const tlist = getTransformList(elem)
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
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 * @function module:event-resize.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {{down: Function, move: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  const down = (evt, ctx) => {
    const { x, y, zoom, selectedElements, mouseTarget } = ctx
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
    svgCanvas.hasResizeStartTransform = false

    // multi-selection: record per-element start matrices and the union bbox,
    // then let mouseMove apply a single uniform group-scale matrix to each.
    const groupElems = selectedElements.filter(Boolean)
    if (groupElems.length > 1) {
      svgCanvas.setInitBbox(svgCanvas.getStrokedBBoxDefaultVisible(groupElems))
      svgCanvas.groupResizeStart = new Map()
      svgCanvas.dragStartTransforms = new Map()
      groupElems.forEach((elem) => {
        svgCanvas.groupResizeStart.set(elem, transformListToTransform(getTransformList(elem)).matrix)
        svgCanvas.dragStartTransforms.set(elem, elem.getAttribute('transform') || '')
      })
      return
    }

    // Getting the BBox from the selection box, since we know we
    // want to orient around it
    svgCanvas.setInitBbox(getBBox(svgCanvas.$id('selectedBox0')))
    const bb = {}
    for (const [key, val] of Object.entries(svgCanvas.getInitBbox())) {
      bb[key] = val / zoom
    }
    svgCanvas.setInitBbox(bb)
  }

  const move = (evt, ctx) => {
    const { selected, x, y, svgRoot, selectedElements } = ctx
    // multi-selection: uniform group scale (no per-element distortion)
    if (svgCanvas.groupResizeStart) {
      resizeGroup(svgCanvas, x, y)
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
    if (!svgCanvas.hasResizeStartTransform) {
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
      svgCanvas.hasResizeStartTransform = true
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
