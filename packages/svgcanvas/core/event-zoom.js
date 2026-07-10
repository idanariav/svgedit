/**
 * Zoom-mode (rubber-band marquee zoom) mouse handlers, extracted from the
 * `zoom` case of `event.js`'s mouseDown/mouseMove/mouseUp switches.
 * @module event-zoom
 * @license MIT
 */
import { assignAttributes } from './dom-utils.js'

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 * @function module:event-zoom.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {{down: Function, move: Function, up: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  const down = (evt, ctx) => {
    const { realX, realY, zoom } = ctx
    svgCanvas.setStarted(true)
    if (!svgCanvas.getRubberBox()) {
      svgCanvas.setRubberBox(svgCanvas.selectorManager.getRubberBandBox())
    }
    assignAttributes(svgCanvas.getRubberBox(), {
      x: realX * zoom,
      y: realY * zoom,
      width: 0,
      height: 0,
      display: 'inline'
    }, 100)
  }

  const move = (evt, ctx) => {
    const { zoom } = ctx
    let { realX, realY } = ctx
    realX *= zoom
    realY *= zoom
    assignAttributes(svgCanvas.getRubberBox(), {
      x: Math.min(svgCanvas.getRStartX() * zoom, realX),
      y: Math.min(svgCanvas.getRStartY() * zoom, realY),
      width: Math.abs(realX - svgCanvas.getRStartX() * zoom),
      height: Math.abs(realY - svgCanvas.getRStartY() * zoom)
    }, 100)
  }

  // Mirrors the original switch: the 'zoom' mouseUp case returns immediately,
  // skipping the shared ext_mouseUp/keep-discard epilogue entirely.
  const up = (evt, ctx) => {
    const { realX, realY } = ctx
    svgCanvas.getRubberBox()?.setAttribute('display', 'none')
    const factor = evt.shiftKey ? 0.5 : 2
    svgCanvas.call('zoomed', {
      x: Math.min(svgCanvas.getRStartX(), realX),
      y: Math.min(svgCanvas.getRStartY(), realY),
      width: Math.abs(realX - svgCanvas.getRStartX()),
      height: Math.abs(realY - svgCanvas.getRStartY()),
      factor
    })
  }

  return { down, move, up }
}
