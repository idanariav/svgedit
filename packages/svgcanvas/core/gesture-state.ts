/**
 * The state the canvas keeps between mouse events that is not one gesture's (`svgCanvas.gesture`): a key being held, the
 * panel's "keep this style" offer and the deferred selection of a just-created element. A gesture's own state lives on the gesture (core/gesture-session.ts, roadmap R9). Created at construction with every
 * field at rest, so a reader never sees `undefined`.
 * `gestureLeftovers` is the rest check: what a finished gesture left behind (roadmap R9; the e2e suite asserts it after every test).
 * @module gesture-state
 * @license MIT
 */
import type SvgCanvas from '../svgcanvas.ts'

export interface GestureState {
  /** Space is held: the next drag pans. */
  spaceKey: boolean
  /** A shape was just added with a drawing tool (the panel offers to keep its style). */
  addedNew: boolean
  /** A new element created by a drag that has not been committed yet. */
  pendingNewElement: Element | null
}

export const createGestureState = (): GestureState => ({
  spaceKey: false,
  addedNew: false,
  pendingNewElement: null
})

/**
 * The gesture state left behind with no button down: each entry names what is not at rest (`[]` when every gesture ended
 * cleanly). A non-empty answer between gestures is the bug class of roadmap R9 (state that outlives its gesture and is read
 * by the next one). A gesture's own state lives on it, so what can be left is the gesture itself and the canvas-wide flags and
 * sessions a gesture turns on; `GestureState` holds only what outlives a gesture on purpose.
 */
export const gestureLeftovers = (canvas: SvgCanvas): string[] => {
  const out: string[] = []
  const active = canvas.activeGesture?.()
  if (active) out.push(`active gesture: ${active.kind}`)
  if (canvas.getStarted()) out.push('started')
  if (canvas.getJustSelected()) out.push('justSelected')
  const box = canvas.getRubberBox()
  if (box && box.getAttribute('display') !== 'none') out.push('rubberBox shown')
  if (canvas.stretch?.isActive()) out.push('stretch')
  if (canvas.inTransaction?.()) out.push('transaction open')
  if (canvas.snapshotHistory?.previewing) out.push('preview open')
  return out
}
