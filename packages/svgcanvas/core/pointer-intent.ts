/**
 * What a press means, decided in one place (roadmap R10): a press that moves less than `DRAG_PX` screen pixels from where it
 * went down is a click; one that gets that far is a drag, and stays one. Every press consults it (select and its marquee,
 * the drawing modes, registered tools through `ToolEvent.dragging`, the layers panel) so the same jitter is a click
 * everywhere.
 *
 * The distance is measured straight (a diagonal counts its length, not each axis on its own), in screen pixels (the same
 * hand at any zoom), and reaching the threshold counts. A pointer with no usable coordinates is never a drag.
 * @module pointer-intent
 * @license MIT
 */

/** How far, in screen pixels, a press must move to be a drag rather than a click. */
export const DRAG_PX = 4

/** How near, in screen pixels, a press must land to a stroke to pick a fill-less shape by it. */
export const HIT_PX = 8

/** A press that has moved (`dx`, `dy`) screen pixels from where it went down is a drag. */
export const isDrag = (dx: number, dy: number): boolean =>
  Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) >= DRAG_PX

/** A press's click-or-drag state: once it is a drag, it stays one (coming back to where it began does not make it a click). */
export interface DragIntent {
  /** the press has become a drag */
  readonly dragging: boolean
  /** The pointer is at (`x`, `y`) screen pixels; returns `dragging`. */
  update(x: number, y: number): boolean
}

/** Follow a press that went down at (`x`, `y`) screen pixels. */
export const createDragIntent = (x: number, y: number): DragIntent => {
  let dragging = false
  return {
    get dragging () { return dragging },
    update (px, py) {
      dragging ||= isDrag(px - x, py - y)
      return dragging
    }
  }
}
