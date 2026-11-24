/**
 * The state the canvas keeps between mouse events that is not one gesture's (`svgCanvas.gesture`): a key being held, the
 * panel's "keep this style" offer, the deferred selection of a just-created element, and the stroke scale a bake passes
 * down. A gesture's own state lives on the gesture (core/gesture-session.ts, roadmap R9). Created at construction with every
 * field at rest, so a reader never sees `undefined`.
 * `gestureLeftovers` is the rest check: what a finished gesture left behind (roadmap R9; the e2e suite asserts it after every test).
 * @module gesture-state
 * @license MIT
 */
import type SvgCanvas from '../svgcanvas.ts'

export interface GestureState {
  /** set around one `recalculateDimensions` call: the scale of the element's transform before the gesture, which a bake of
   * the whole transform must keep in the stroke (`null` otherwise: a bake leaves the stroke alone) */
  bakeStrokeScale: number | null
  /** Space is held: the next drag pans. */
  spaceKey: boolean
  /** A shape was just added with a drawing tool (the panel offers to keep its style). */
  addedNew: boolean
  /** A new element created by a drag that has not been committed yet. */
  pendingNewElement: Element | null
}

export const createGestureState = (): GestureState => ({
  bakeStrokeScale: null,
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
  const active = canvas.activeGesture?.()
  if (active) out.push(`active gesture: ${active.kind}`)
  const rest = createGestureState() as unknown as Record<string, unknown>
  const now = canvas.gesture as unknown as Record<string, unknown>
  for (const key of Object.keys(rest)) {
    if (SESSION_FIELDS.has(key as keyof GestureState)) continue
    if (now[key] !== rest[key]) out.push(`gesture.${key}`)
  }
  if (canvas.getStarted()) out.push('started')
  if (canvas.getStartTransform()) out.push('startTransform')
  if (canvas.getJustSelected()) out.push('justSelected')
  const box = canvas.getRubberBox()
  if (box && box.getAttribute('display') !== 'none') out.push('rubberBox shown')
  if (canvas.stretch?.isActive()) out.push('stretch')
  if (canvas.inTransaction?.()) out.push('transaction open')
  if (canvas.snapshotHistory?.previewing) out.push('preview open')
  return out
}
