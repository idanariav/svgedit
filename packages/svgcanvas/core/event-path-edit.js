/**
 * Path drawing/editing mode (`path`/`pathedit`) mouse handlers, extracted
 * from the `path`/`pathedit` case of `event.js`'s mouseDown/mouseMove/mouseUp
 * switches. Mostly thin delegates onto `svgCanvas.pathActions`, plus the
 * grid-snap/shift-angle-snap/rubber-band bookkeeping that precedes the
 * mouseMove delegate call.
 * @module event-path-edit
 * @license MIT
 */
import { assignAttributes } from './dom-utils.js'
import { snapToAngle } from './math.js'

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 * @function module:event-path-edit.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {{down: Function, move: Function, up: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  const down = (evt, ctx) => {
    const { mouseTarget, zoom } = ctx
    svgCanvas.setStartX(svgCanvas.getStartX() * zoom)
    svgCanvas.setStartY(svgCanvas.getStartY() * zoom)
    svgCanvas.pathActions.mouseDown(evt, mouseTarget, svgCanvas.getStartX(), svgCanvas.getStartY())
    svgCanvas.setStarted(true)
  }

  const move = (evt, ctx) => {
    const { zoom } = ctx
    let { x, y, realX, realY } = ctx
    x *= zoom
    y *= zoom

    if (svgCanvas.getCurConfig().gridSnapping) {
      ({ x, y } = svgCanvas.snapPointToGrid(x, y))
      const sp = svgCanvas.snapPointToGrid(svgCanvas.getStartX(), svgCanvas.getStartY())
      svgCanvas.setStartX(sp.x)
      svgCanvas.setStartY(sp.y)
    }
    if (evt.shiftKey) {
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
      assignAttributes(svgCanvas.getRubberBox(), {
        x: Math.min(svgCanvas.getRStartX() * zoom, realX),
        y: Math.min(svgCanvas.getRStartY() * zoom, realY),
        width: Math.abs(realX - svgCanvas.getRStartX() * zoom),
        height: Math.abs(realY - svgCanvas.getRStartY() * zoom)
      }, 100)
    }
    svgCanvas.pathActions.mouseMove(x, y)
  }

  // 'path': element is nulled here so it is not removed nor finalized by the
  // shared epilogue; started stays true so mouseMove keeps running.
  const upPath = (evt, ctx) => {
    const { mouseX, mouseY } = ctx
    svgCanvas.setStarted(true)
    const res = svgCanvas.pathActions.mouseUp(evt, null, mouseX, mouseY)
    return { element: res.element, keep: res.keep }
  }

  const upPathEdit = (evt) => {
    svgCanvas.pathActions.mouseUp(evt)
    return { element: null, keep: true }
  }

  return { down, move, upPath, upPathEdit }
}
