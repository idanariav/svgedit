/**
 * Text-editing mode (`textedit`) mouse handlers, extracted from the
 * `textedit` case of `event.js`'s mouseDown/mouseMove/mouseUp switches.
 * Thin delegates onto `svgCanvas.textActions`.
 * @module event-text-edit
 * @license MIT
 */

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 * @function module:event-text-edit.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {{down: Function, move: Function, up: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  const down = (evt, ctx) => {
    const { mouseTarget, zoom } = ctx
    svgCanvas.setStartX(svgCanvas.getStartX() * zoom)
    svgCanvas.setStartY(svgCanvas.getStartY() * zoom)
    svgCanvas.textActions.mouseDown(evt, mouseTarget, svgCanvas.getStartX(), svgCanvas.getStartY())
    svgCanvas.setStarted(true)
  }

  const move = (evt, ctx) => {
    const { mouseX, mouseY } = ctx
    svgCanvas.textActions.mouseMove(mouseX, mouseY)
  }

  const up = (evt, ctx) => {
    const { mouseX, mouseY } = ctx
    svgCanvas.textActions.mouseUp(evt, mouseX, mouseY)
    return { element: null, keep: false }
  }

  return { down, move, up }
}
