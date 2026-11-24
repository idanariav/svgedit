/**
 * The state a pointer gesture parks on the canvas between mouse events (rotate / resize / drag starts, the armed
 * alt-clone, the pending new element…), one object per canvas (`svgCanvas.gesture`) instead of fourteen loose members.
 * Created at construction with every field at rest, so a reader never sees `undefined`; the gesture modules
 * (`event.js`, `event-select.js`, `event-resize.js`, `event-rotate.js`, `tool-registry.js`) own the writes.
 * `gestureLeftovers` is the rest check: what a finished gesture left behind (roadmap R9; the e2e suite asserts it after every test).
 * @module gesture-state
 * @license MIT
 */
import type SvgCanvas from '../svgcanvas.ts'
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
  /** What the release selects if the press never became a drag: the topmost element a covered selection was preferred over,
   * or the clicked member of a multi-selection (event.ts mouseDown). */
  clickSelect: Element | null
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
  clickSelect: null,
  spaceKey: false,
  addedNew: false,
  pendingNewElement: null
})

/**
 * The fields of `GestureState` that outlive a gesture on purpose: a key being held, the panel's "keep this style" offer and the
 * deferred selection of a just-created element.
 */
const SESSION_FIELDS: ReadonlySet<keyof GestureState> = new Set(['spaceKey', 'addedNew', 'pendingNewElement'])

/**
 * The gesture state left behind with no button down: each entry names a field or slot that is not at rest (`[]` when every
 * gesture ended cleanly). A non-empty answer between gestures is the bug class of roadmap R9 (state that outlives its
 * gesture and is read by the next one).
 */
export const gestureLeftovers = (canvas: SvgCanvas): string[] => {
  const out: string[] = []
  const rest = createGestureState() as unknown as Record<string, unknown>
  const now = canvas.gesture as unknown as Record<string, unknown>
  for (const key of Object.keys(rest)) {
    if (SESSION_FIELDS.has(key as keyof GestureState)) continue
    if (now[key] !== rest[key]) out.push(`gesture.${key}`)
  }
  if (canvas.getStarted()) out.push('started')
  if (canvas.getStartTransform()) out.push('startTransform')
  if (canvas.getJustSelected()) out.push('justSelected')
  if (canvas.pendingMoveDelta) out.push('pendingMoveDelta')
  if (canvas.smartSnapTargets) out.push('smartSnapTargets')
  const box = canvas.getRubberBox()
  if (box && box.getAttribute('display') !== 'none') out.push('rubberBox shown')
  if (canvas.stretch?.isActive()) out.push('stretch')
  if (canvas.inTransaction?.()) out.push('transaction open')
  if (canvas.snapshotHistory?.previewing) out.push('preview open')
  return out
}
