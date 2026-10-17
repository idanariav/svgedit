/**
 * Zoom-mode (rubber-band marquee zoom) mouse handlers, extracted from the
 * `zoom` case of `event.js`'s mouseDown/mouseMove/mouseUp switches.
 * @module event-zoom
 * @license MIT
 */
import { assignAttributes } from './dom-utils.ts'
import type SvgCanvas from '../svgcanvas.ts'

/** The pointer position the dispatcher hands every zoom handler: unzoomed (`realX/Y`) and the zoom factor. */
interface ZoomPointer { realX: number, realY: number, zoom: number }

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: ZoomPointer) => void
  move: (evt: MouseEvent, ctx: ZoomPointer) => void
  up: (evt: MouseEvent, ctx: Pick<ZoomPointer, 'realX' | 'realY'>) => void
} => {
  const svgCanvas = canvas

  const down = (_evt: MouseEvent, ctx: ZoomPointer): void => {
    const { realX, realY, zoom } = ctx
    svgCanvas.setStarted(true)
    if (!svgCanvas.getRubberBox()) {
      svgCanvas.setRubberBox(svgCanvas.selectorManager.getRubberBandBox())
    }
    assignAttributes(svgCanvas.requireRubberBox(), {
      x: realX * zoom,
      y: realY * zoom,
      width: 0,
      height: 0,
      display: 'inline'
    }, 100)
  }

  const move = (_evt: MouseEvent, ctx: ZoomPointer): void => {
    const { zoom } = ctx
    let { realX, realY } = ctx
    realX *= zoom
    realY *= zoom
    assignAttributes(svgCanvas.requireRubberBox(), {
      x: Math.min(svgCanvas.getRStartX() * zoom, realX),
      y: Math.min(svgCanvas.getRStartY() * zoom, realY),
      width: Math.abs(realX - svgCanvas.getRStartX() * zoom),
      height: Math.abs(realY - svgCanvas.getRStartY() * zoom)
    }, 100)
  }

  // Mirrors the original switch: the 'zoom' mouseUp case returns immediately,
  // skipping the shared ext_mouseUp/keep-discard epilogue entirely.
  const up = (evt: MouseEvent, ctx: Pick<ZoomPointer, 'realX' | 'realY'>): void => {
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
