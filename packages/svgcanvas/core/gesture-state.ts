/**
 * The state a pointer gesture parks on the canvas between mouse events (rotate / resize / drag starts, the armed
 * alt-clone, the pending new element…), one object per canvas (`svgCanvas.gesture`) instead of fourteen loose members.
 * Created at construction with every field at rest, so a reader never sees `undefined`; the gesture modules
 * (`event.js`, `event-select.js`, `event-resize.js`, `event-rotate.js`, `tool-registry.js`) own the writes.
 * @module gesture-state
 * @license MIT
 */
import type { BBox } from '../svgcanvas.ts'

/** An area-text box being resized: committed or cancelled as one transaction when the mouse is released. */
export interface AreaResize {
  elem: Element
  box: BBox
  fixedHeight: boolean
  anchor: string
  tx: { commit: () => unknown, cancel: () => unknown }
}

export interface GestureState {
  /** Centre of a multi-selection being rotated (set on press, `null` at rest). */
  groupRotateCenter: { x: number, y: number } | null
  /** The matrices the elements of a rotated group started from. */
  groupRotateStart: Map<Element, SVGMatrix> | null
  groupRotateBBox: BBox | null
  /** A drag or rotate has recorded its start transforms. */
  hasDragStartTransform: boolean
  dragStartTransforms: Map<Element, string> | null
  /** a drag shown through the model (core/model-commands.ts `dragPlan`): what each dragged element's transform amounts to */
  dragPlan: Map<Element, import('./model-commands.ts').DragEntry> | null
  /** the geometry box of the element a resize shown through the model began from */
  /** a rotation shown through the model (core/model-commands.ts `rotationPlan`) */
  rotationPlan: { id: string, cx: number, cy: number } | null
  /** a rotation of the whole selection shown through the model (`rotationGroupPlan`): each element's transform before it */
  groupRotationPlan: Map<Element, import('./model-commands.ts').Affine> | null
  /** the rotation plan was decided for this gesture (it may be null) */
  rotationShown: boolean
  resizeStartBox: { x: number, y: number, width: number, height: number } | null
  hasResizeStartTransform: boolean
  groupResizeStart: Map<Element, SVGMatrix> | null
  /** set around one `recalculateDimensions` call: the scale of the element's transform before the gesture, which a bake of
   * the whole transform must keep in the stroke (`null` otherwise: a bake leaves the stroke alone) */
  bakeStrokeScale: number | null
  areaResize: AreaResize | null
  /** Alt was down at the press: the drag clones instead of moving. */
  altCloneArmed: boolean
  dragStartBBox: BBox | null
  /** The pointer has moved far enough since the press for a drag to count as a move. */
  moveSelectionThresholdReached: boolean
  /** Space is held: the next drag pans. */
  spaceKey: boolean
  /** A shape was just added with a drawing tool (the panel offers to keep its style). */
  addedNew: boolean
  /** A new element created by a drag that has not been committed yet. */
  pendingNewElement: Element | null
}

export const createGestureState = (): GestureState => ({
  groupRotateCenter: null,
  groupRotateStart: null,
  groupRotateBBox: null,
  hasDragStartTransform: false,
  dragStartTransforms: null,
  dragPlan: null,
  rotationPlan: null,
  groupRotationPlan: null,
  rotationShown: false,
  resizeStartBox: null,
  hasResizeStartTransform: false,
  groupResizeStart: null,
  bakeStrokeScale: null,
  areaResize: null,
  altCloneArmed: false,
  dragStartBBox: null,
  moveSelectionThresholdReached: false,
  spaceKey: false,
  addedNew: false,
  pendingNewElement: null
})
