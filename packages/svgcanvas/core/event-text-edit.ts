/**
 * Text-editing mode (`textedit`) mouse handlers, extracted from the
 * `textedit` case of `event.js`'s mouseDown/mouseMove/mouseUp switches.
 * Thin delegates onto `svgCanvas.textActions`.
 * @module event-text-edit
 * @license MIT
 */
import type SvgCanvas from '../svgcanvas.js'

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: { mouseTarget: Element, zoom: number }) => void
  move: (evt: MouseEvent, ctx: { mouseX: number, mouseY: number }) => void
  up: (evt: MouseEvent, ctx: { mouseX: number, mouseY: number }) => { element: null, keep: false }
} => {
  const svgCanvas = canvas

  const down = (evt: MouseEvent, ctx: { mouseTarget: Element, zoom: number }): void => {
    const { mouseTarget, zoom } = ctx
    svgCanvas.setStartX(svgCanvas.getStartX() * zoom)
    svgCanvas.setStartY(svgCanvas.getStartY() * zoom)
    svgCanvas.textActions.mouseDown(evt, mouseTarget, svgCanvas.getStartX(), svgCanvas.getStartY())
    svgCanvas.setStarted(true)
  }

  const move = (_evt: MouseEvent, ctx: { mouseX: number, mouseY: number }): void => {
    const { mouseX, mouseY } = ctx
    svgCanvas.textActions.mouseMove(mouseX, mouseY)
  }

  const up = (evt: MouseEvent, ctx: { mouseX: number, mouseY: number }): { element: null, keep: false } => {
    const { mouseX, mouseY } = ctx
    svgCanvas.textActions.mouseUp(evt, mouseX, mouseY)
    return { element: null, keep: false as const }
  }

  return { down, move, up }
}
