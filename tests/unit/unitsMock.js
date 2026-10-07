import { createUnits } from '../../packages/svgcanvas/core/units.js'

/**
 * Give a hand-built mock canvas the per-canvas `units` instance that the real
 * SvgCanvas creates in its constructor (core modules read it via getUnits()).
 * Defaults the container methods createUnits() calls if the mock lacks them.
 * @param {object} canvas
 * @returns {object} the same canvas
 */
export const attachUnits = (canvas) => {
  canvas.getRoundDigits ??= () => 5
  canvas.getBaseUnit ??= () => 'px'
  canvas.units = createUnits(canvas)
  return canvas
}
