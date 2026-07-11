import '../../packages/svgcanvas/core/path-seg-shim.js'
import { describe, it, expect } from 'vitest'
import { init as pathActionsInit } from '../../packages/svgcanvas/core/path-actions.js'
import { init as unitsInit } from '../../packages/svgcanvas/core/units.js'
import { toAbsolutePathData, getStyleAttrs } from '../../packages/svgcanvas/core/paper-utils.js'

const makeSvgCanvas = () => {
  const svgCanvas = { getRoundDigits: () => 5 }
  unitsInit(svgCanvas)
  pathActionsInit(svgCanvas)
  return svgCanvas
}

describe('paper-utils', () => {
  describe('toAbsolutePathData', () => {
    it('normalizes relative/shorthand commands (as emitted by paper.js pathData) to absolute-only', () => {
      const svgCanvas = makeSvgCanvas()

      const d = toAbsolutePathData('M100,100h150v100h100v150h-150l0,-100h-100z', svgCanvas)

      expect(d).toBe('M100,100L250,100L250,200L350,200L350,350L200,350L200,250L100,250z')
      // No relative command letters should survive (closepath 'z' has no
      // relative/absolute distinction, so it's excluded from this check).
      expect(d).not.toMatch(/[mlcqahvst]/)
    })

    it('leaves an already-absolute path\'s geometry unchanged', () => {
      const svgCanvas = makeSvgCanvas()

      const d = toAbsolutePathData('M10,10 L50,50 L90,10 z', svgCanvas)

      expect(d).not.toMatch(/[mlcqahvst]/)
    })
  })

  describe('getStyleAttrs', () => {
    it('includes paint-order so boolean/shape-builder/cutter results keep the "stroke grows outward" rendering', () => {
      const elem = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      elem.setAttribute('stroke-width', '4')
      elem.setAttribute('paint-order', 'stroke')

      expect(getStyleAttrs(elem)).toMatchObject({ 'stroke-width': '4', 'paint-order': 'stroke' })
    })

    it('omits paint-order when the source element does not have it', () => {
      const elem = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      elem.setAttribute('stroke-width', '4')

      expect(getStyleAttrs(elem)).not.toHaveProperty('paint-order')
    })
  })
})
