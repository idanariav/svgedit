/**
 * Path drawing/editing mode (`path`/`pathedit`) mouse handlers, extracted
 * from the `path`/`pathedit` case of `event.js`'s mouseDown/mouseMove/mouseUp
 * switches. Mostly thin delegates onto `svgCanvas.pathActions`, plus the
 * grid-snap/shift-angle-snap/rubber-band bookkeeping that precedes the
 * mouseMove delegate call.
 *
 * A node or control-point drag in `pathedit` is a gesture on the gesture session (core/gesture-session.ts, roadmap R9): the
 * press begins it once `pathActions` has armed the drag, with one transaction for its undo step; the release commits it;
 * Escape, a mode switch, a new press, a lost focus or a context menu roll it back.
 * @module event-path-edit
 * @license MIT
 */
import { assignAttributes } from './dom-utils.ts'
import { snapToAngle } from './math.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { Gesture } from './gesture-session.ts'

const KIND = 'pathNode'

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: { mouseTarget: Element, zoom: number }) => void
  move: (evt: MouseEvent, ctx: { x: number, y: number, realX: number, realY: number, zoom: number }) => void
  hover: (evt: MouseEvent) => void
  upPath: (evt: MouseEvent, ctx: { mouseX: number, mouseY: number }) => { element?: Element | null, keep: boolean }
  upPathEdit: (evt: MouseEvent) => { element: null, keep: true }
} => {
  const svgCanvas = canvas

  /** The node drag in progress, or null. */
  const current = (): Gesture | null => {
    const g = svgCanvas.activeGesture()
    return g?.kind === KIND ? g : null
  }

  const down = (evt: MouseEvent, ctx: { mouseTarget: Element, zoom: number }): void => {
    const { mouseTarget, zoom } = ctx
    svgCanvas.setStartX(svgCanvas.getStartX() * zoom)
    svgCanvas.setStartY(svgCanvas.getStartY() * zoom)
    const editing = svgCanvas.getCurrentMode() === 'pathedit'
    svgCanvas.pathActions.mouseDown(evt, mouseTarget, svgCanvas.getStartX(), svgCanvas.getStartY())
    svgCanvas.setStarted(true)
    // The press armed a node or control-point drag (it only selected nodes, which is not the drawing): the drag is a gesture
    if (editing && svgCanvas.getPathObj()?.dragging) {
      svgCanvas.beginGesture(KIND, {
        state: {},
        label: 'Move path point(s)',
        onCancel: () => {
          svgCanvas.pathActions.endDrag()
          svgCanvas.setStarted(false)
        }
      })
    }
  }

  const move = (evt: MouseEvent, ctx: { x: number, y: number, realX: number, realY: number, zoom: number }): void => {
    const { zoom } = ctx
    let { x, y, realX, realY } = ctx
    x *= zoom
    y *= zoom
    // The ring marks where a Shift-press would land, so it follows the raw pointer, not the angle-snapped point.
    svgCanvas.pathActions.hover(x, y, 'path', evt.shiftKey)

    if (svgCanvas.getCurConfig().gridSnapping) {
      ({ x, y } = svgCanvas.snapPointToGrid(x, y))
      const sp = svgCanvas.snapPointToGrid(svgCanvas.getStartX(), svgCanvas.getStartY())
      svgCanvas.setStartX(sp.x)
      svgCanvas.setStartY(sp.y)
    }
    // Shift while an anchor is dragged snaps it to the other nodes' alignment (path-actions.ts), not to an angle
    const draggingNode = Boolean(svgCanvas.getPathObj()?.dragging && !svgCanvas.getPathObj()?.dragctrl)
    if (evt.shiftKey && !draggingNode) {
      // `path.js` never exports a `path` binding (only `init`), so this used
      // to always take the `else` branch below regardless of drag state --
      // svgCanvas.getPathObj() is the real accessor for the currently tracked
      // Path instance.
      const path = svgCanvas.getPathObj()
      let x1, y1
      if (path) {
        x1 = path.dragging ? path.dragging[0] : svgCanvas.getStartX()
        y1 = path.dragging ? path.dragging[1] : svgCanvas.getStartY()
      } else {
        x1 = svgCanvas.getStartX()
        y1 = svgCanvas.getStartY()
      }
      const xya = snapToAngle(x1, y1, x, y);
      ({ x, y } = xya)
    }

    if (svgCanvas.getRubberBox()?.getAttribute('display') !== 'none') {
      realX *= zoom
      realY *= zoom
      assignAttributes(svgCanvas.requireRubberBox(), {
        x: Math.min(svgCanvas.getRStartX() * zoom, realX),
        y: Math.min(svgCanvas.getRStartY() * zoom, realY),
        width: Math.abs(realX - svgCanvas.getRStartX() * zoom),
        height: Math.abs(realY - svgCanvas.getRStartY() * zoom)
      }, 100)
    }
    svgCanvas.pathActions.mouseMove(x, y, evt.shiftKey)
  }

  // The pointer moving over the canvas with no button down in `path` / `fhpath` mode: the Pen (or the pencil, for
  // the selected path) marks the open end a press would carry on or join to. (The root CTM is only cached on a press, so read it here.)
  const hover = (evt: MouseEvent): void => {
    // The space a press draws in: the entered group's, else the layer's.
    const pt = svgCanvas.frames.drawingPoint(evt.clientX, evt.clientY)
    if (!pt) return
    const zoom = svgCanvas.getZoom()
    svgCanvas.pathActions.hover(pt.x * zoom, pt.y * zoom, svgCanvas.getCurrentMode(), evt.shiftKey)
  }

  // 'path': element is nulled here so it is not removed nor finalized by the
  // shared epilogue; started stays true so mouseMove keeps running.
  const upPath = (evt: MouseEvent, ctx: { mouseX: number, mouseY: number }): { element?: Element | null, keep: boolean } => {
    const { mouseX, mouseY } = ctx
    svgCanvas.setStarted(true)
    const res = svgCanvas.pathActions.mouseUp(evt, null, mouseX, mouseY) as { keep: boolean, element?: Element | null }
    return { element: res.element, keep: res.keep }
  }

  const upPathEdit = (evt: MouseEvent): { element: null, keep: true } => {
    // detached while pathActions ends the drag (it may switch modes), committed after: its step is the gesture's
    const gesture = current()
    gesture?.detach()
    try {
      svgCanvas.pathActions.mouseUp(evt)
    } catch (err) {
      gesture?.cancel('error')
      throw err
    }
    gesture?.commit()
    return { element: null, keep: true as const }
  }

  return { down, move, hover, upPath, upPathEdit }
}
