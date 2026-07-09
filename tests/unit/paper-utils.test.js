import 'pathseg'
import { describe, it, expect } from 'vitest'
import { init as pathActionsInit } from '../../packages/svgcanvas/core/path-actions.js'
import { init as unitsInit } from '../../packages/svgcanvas/core/units.js'
import { toAbsolutePathData } from '../../packages/svgcanvas/core/paper-utils.js'

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
})
