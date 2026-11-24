/**
 * Resize mode (`resize`) mouse handlers, extracted from the `resize` case of
 * `event.js`'s mouseDown/mouseMove switches. Covers both single-element
 * resize and the multi-element group scale (`resizeGroup`).
 *
 * Note: the `resize` mouseUp case is NOT here — it is two lines (hide the
 * rubber box, switch to 'select' mode) that intentionally fall through into
 * the large shared 'select' mouseUp body in `event.js`, so it's extracted
 * together with that body in `event-select.js`.
 *
 * A resize is a gesture on the gesture session (core/gesture-session.ts, roadmap R9): the press begins it, with its state
 * (`ResizeState`) on it and one transaction for its undo step; `event.ts` commits it after the shared release body; Escape,
 * a mode switch, a new press, a lost focus or a context menu roll it back, and the state goes with it.
 * @module event-resize
 * @license MIT
 */
import { requireBBox } from './bbox-utils.ts'
import { getRotationAngle } from './dom-utils.ts'
import { hasMatrixTransform, getTransformList, transformListToTransform, matrixMultiply } from './math.ts'
import {
  isAreaText, getAreaBox, getWrapHeight, areaAttrsForBox, writeAreaAttrs, reflowAreaText, TEXT_LINE_HEIGHT
} from './text-rows.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { BBox } from '../svgcanvas.ts'
import type { BBoxObject } from './bbox-utils.ts'
import type { Gesture } from './gesture-session.ts'

/** What a resize keeps from its press to its release. */
export interface ResizeState {
  /** the elements being resized */
  elems: Element[]
  /** the box the resize scales: the selection box at the press */
  initBox: BBoxObject
  /** a selection of several scales as one: each element's matrix at the press */
  groupStart: Map<Element, SVGMatrix> | null
  /** the first movement has happened: the dummy transforms are in, or the model plan is decided */
  begun: boolean
  /** the geometry box of the element a resize shown through the model began from */
  startBox: BBox | null
  /** an area text: its box resizes, its type keeps its size */
  area: { elem: Element, box: BBox, fixedHeight: boolean, anchor: string } | null
}

const KIND = 'resize'

interface DownContext { x: number, y: number, zoom: number, selectedElements: Element[], mouseTarget: Element }
interface MoveContext { selected: Element, x: number, y: number, svgRoot: SVGSVGElement, selectedElements: Element[] }

/**
 * Group scale for a multi-element selection. Scales every selected element by
 * the SAME factors about a common pivot (the corner/edge opposite the dragged
 * grip), so the relative layout is preserved. Like a single shape, each axis
 * follows its own grip (a side grip changes only that side), and Shift keeps
 * the proportions. `x`,`y` are the current pointer position in content/user coords.
 */
const resizeGroup = (svgCanvas: SvgCanvas, state: ResizeState, x: number, y: number, proportional: boolean): void => {
  const svgRoot = svgCanvas.getSvgRoot()
  const initb = state.initBox
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

  // Shift: one factor for both axes (the axis dragged furthest wins)
  if (proportional) {
    const s = Math.abs(1 - sx) >= Math.abs(1 - sy) ? sx : sy
    sx = sy = s
  }

  // pivot = the fixed corner/edge opposite the dragged grip
  const ax = bx + (mode.includes('w') ? bw : 0)
  const ay = by + (mode.includes('n') ? bh : 0)

  // group matrix T(ax,ay) · S(sx,sy) · T(-ax,-ay)
  const gm = svgRoot.createSVGMatrix().translate(ax, ay).scaleNonUniform(sx, sy).translate(-ax, -ay)

  const starts = state.groupStart as Map<Element, SVGMatrix>
  // Shapes that can take the scale in their own coordinates are shown by the renderer (the model states each size)
  if (!state.begun) {
    svgCanvas.gesture.dragPlan = svgCanvas.dragPlan([...starts.keys()])
    state.begun = true
  }
  const plan = svgCanvas.gesture.dragPlan
  if (plan) {
    svgCanvas.previewAfter(plan, { a: sx, d: sy, e: ax - sx * ax, f: ay - sy * ay })
    for (const elem of starts.keys()) svgCanvas.selectorManager.requestSelector(elem).resize()
  }
  starts.forEach((startMatrix, elem) => {
    if (plan) return
    const newM = matrixMultiply(gm, startMatrix)
    const tlist = getTransformList(elem) as SVGTransformList
    while (tlist.numberOfItems > 0) { tlist.removeItem(0) }
    const t = svgRoot.createSVGTransform()
    t.setMatrix(newM)
    tlist.appendItem(t)
    svgCanvas.selectorManager.requestSelector(elem).resize()
  })

  // redraw the group box scaled about the same pivot
  svgCanvas.selectorManager.showGroupSelector({
    x: ax + (bx - ax) * sx,
    y: ay + (by - ay) * sy,
    width: bw * sx,
    height: bh * sy
  })
  svgCanvas.call('transition', svgCanvas.getSelectedElements())
}

/**
 * Resize an area text by its box: the grips move the box's edges, the type keeps its size and
 * the rows wrap again to the new width. The whole drag is the resize gesture's one undo step.
 */
const resizeAreaText = (svgCanvas: SvgCanvas, state: NonNullable<ResizeState['area']>, x: number, y: number): void => {
  const { elem, box } = state
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
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: DownContext) => void
  move: (evt: MouseEvent, ctx: MoveContext) => void
  /** The resize in progress, or null. */
  current: () => Gesture<ResizeState> | null
} => {
  const svgCanvas = canvas

  const current = (): Gesture<ResizeState> | null => {
    const g = svgCanvas.activeGesture()
    return g?.kind === KIND ? g as Gesture<ResizeState> : null
  }

  const down = (_evt: MouseEvent, ctx: DownContext): void => {
    const { x, y, zoom, selectedElements, mouseTarget } = ctx
    const tlist = getTransformList(mouseTarget)
    if (!tlist) { return }
    svgCanvas.setStartX(x)
    svgCanvas.setStartY(y)
    const elems = selectedElements.filter(Boolean)
    // The dummy translate/scale/translate transforms are only needed once a drag actually starts (`begun`, see move()):
    // a click on a resize grip without a drag leaves the element untouched.
    const state: ResizeState = { elems, initBox: { x: 0, y: 0, width: 0, height: 0 }, groupStart: null, begun: false, startBox: null, area: null }
    if (elems.length > 1) {
      // multi-selection: per-element start matrices and the union bbox; a move applies one group-scale matrix to each
      state.initBox = svgCanvas.getStrokedBBoxDefaultVisible(elems)
      state.groupStart = new Map(elems.map((elem) => [elem, transformListToTransform(getTransformList(elem)).matrix]))
      // the shared release body (event-select.ts) bakes from these; they go with the move gesture (R9 step 4)
      svgCanvas.gesture.dragStartTransforms = new Map(elems.map((elem) => [elem, elem.getAttribute('transform') || '']))
    } else {
      // Getting the BBox from the selection box, since we know we want to orient around it
      const selectedBox = requireBBox(svgCanvas.$id('selectedBox0') as Element)
      state.initBox = { x: selectedBox.x / zoom, y: selectedBox.y / zoom, width: selectedBox.width / zoom, height: selectedBox.height / zoom }
      // an area text keeps its type and changes its box (rotated or transformed ones scale like any text)
      const [only] = elems
      if (only && isAreaText(only) && !getTransformList(only)?.numberOfItems) {
        state.area = { elem: only, box: getAreaBox(only), fixedHeight: getWrapHeight(only) > 0, anchor: only.getAttribute('text-anchor') ?? 'start' }
      }
    }
    svgCanvas.beginGesture<ResizeState>(KIND, {
      state,
      label: state.area ? 'Resize text box' : 'position',
      onCancel: () => {
        svgCanvas.stretch.cancel()
        // shared with the move gesture until R9 step 4
        svgCanvas.gesture.dragPlan = null
        svgCanvas.gesture.dragStartTransforms = null
        svgCanvas.dragLiveResizeBox = undefined
        svgCanvas.setStarted(false)
        svgCanvas.setCurrentMode('select')
        elems.forEach((elem) => { svgCanvas.selectorManager.requestSelector(elem).resize() })
        svgCanvas.updateGroupSelector()
      }
    })
    svgCanvas.setStarted(true)
  }

  const move = (evt: MouseEvent, ctx: MoveContext): void => {
    const gesture = current()
    if (!gesture) return
    const { state } = gesture
    const { selected, x, y, svgRoot, selectedElements } = ctx
    // Alt at the first movement: stretch the group's middle, its ends keep their shape (core/stretch.ts)
    if (!svgCanvas.stretch.isActive() && evt.altKey && !state.begun && svgCanvas.stretch.isEligible(selectedElements)) {
      svgCanvas.stretch.begin(selectedElements, svgCanvas.getCurrentResizeMode())
      gesture.relabel('Stretch')
    }
    if (svgCanvas.stretch.isActive()) {
      let dx = x - svgCanvas.getStartX()
      let dy = y - svgCanvas.getStartY()
      if (svgCanvas.getCurConfig().gridSnapping) {
        dx = svgCanvas.snapToGrid(dx)
        dy = svgCanvas.snapToGrid(dy)
      }
      svgCanvas.stretch.preview(dx, dy)
      return
    }
    // multi-selection: one scale about the selection's box
    if (state.groupStart) {
      resizeGroup(svgCanvas, state, x, y, evt.shiftKey)
      return
    }
    if (state.area) {
      resizeAreaText(svgCanvas, state.area, x, y)
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
    if (!state.begun) {
      const pos = getRotationAngle(selected) ? 1 : 0
      // A plain shape is resized in front of the renderer: the model shows each size, the element gets no dummy transforms
      const turnable = ['rect', 'ellipse', 'circle', 'image', 'foreignObject', 'line', 'polyline', 'polygon', 'path'].includes(selected.tagName)
      svgCanvas.gesture.dragPlan = !hasMatrix && (!pos || turnable) ? svgCanvas.dragPlan([selected], Boolean(pos)) : null
      // (a clipped shape's entry is a matrix to move, not a geometry to scale: it resizes the old way)
      if (svgCanvas.gesture.dragPlan?.get(selected)?.matrix) svgCanvas.gesture.dragPlan = null
      state.startBox = svgCanvas.gesture.dragPlan ? requireBBox(selected) : null
      if (svgCanvas.gesture.dragPlan) {
        // nothing to insert
      } else if (hasMatrix) {
        tlist.insertItemBefore(svgRoot.createSVGTransform(), pos)
        tlist.insertItemBefore(svgRoot.createSVGTransform(), pos)
        tlist.insertItemBefore(svgRoot.createSVGTransform(), pos)
      } else {
        tlist.appendItem(svgRoot.createSVGTransform())
        tlist.appendItem(svgRoot.createSVGTransform())
        tlist.appendItem(svgRoot.createSVGTransform())
      }
      state.begun = true
    }
    const box = hasMatrix ? state.initBox : (svgCanvas.gesture.dragPlan ? state.startBox as BBox : requireBBox(selected))
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
    const plan = svgCanvas.gesture.dragPlan
    if (plan) {
      const px = left + tx
      const py = top + ty
      const scaleMap = { a: sx, d: sy, e: px - sx * px, f: py - sy * py }
      if (plan.get(selected)?.rot) svgCanvas.previewTurnedScale(plan, scaleMap)
      else svgCanvas.previewScale(plan, scaleMap)
      svgCanvas.selectorManager.requestSelector(selected).resize()
      svgCanvas.dragLiveResizeBox = undefined // the attributes show the size already
      svgCanvas.call('transition', selectedElements)
      return
    }
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

  return { down, move, current }
}
