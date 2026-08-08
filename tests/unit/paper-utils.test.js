import '../../packages/svgcanvas/core/path-seg-shim.js'
import { describe, it, expect } from 'vitest'
import { init as pathActionsInit } from '../../packages/svgcanvas/core/path-actions.js'
import { init as unitsInit } from '../../packages/svgcanvas/core/units.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { toAbsolutePathData, getStyleAttrs, getMatrixScale, getOwnTransformScale, scaleStrokeWidth } from '../../packages/svgcanvas/core/paper-utils.js'

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

  describe('getOwnTransformScale', () => {
    const makePath = (transform) => {
      const path = document.createElementNS(NS.SVG, 'path')
      if (transform) path.setAttribute('transform', transform)
      return path
    }

    it('returns 1 for an element with no transform', () => {
      expect(getOwnTransformScale(makePath())).toBe(1)
    })

    it('returns 1 for a pure translate (no scale component)', () => {
      expect(getOwnTransformScale(makePath('translate(50 20)'))).toBe(1)
    })

    it('returns the factor for a uniform scale', () => {
      expect(getOwnTransformScale(makePath('scale(0.3)'))).toBeCloseTo(0.3, 10)
    })

    it('returns the geometric-mean factor for a non-uniform scale', () => {
      // sqrt(|det|) = sqrt(2 * 8) = 4
      expect(getOwnTransformScale(makePath('scale(2 8)'))).toBeCloseTo(4, 10)
    })

    it('returns 1 for a pure rotation (area-preserving, no scale)', () => {
      expect(getOwnTransformScale(makePath('rotate(37)'))).toBeCloseTo(1, 10)
    })
  })

  describe('getMatrixScale', () => {
    it('computes sqrt(|det|) directly from a matrix', () => {
      expect(getMatrixScale({ a: 2, b: 0, c: 0, d: 8, e: 0, f: 0 })).toBeCloseTo(4, 10)
    })

    it('is negative-determinant-safe (a flip has the same scale as its unflipped matrix)', () => {
      expect(getMatrixScale({ a: -2, b: 0, c: 0, d: 2, e: 0, f: 0 })).toBeCloseTo(2, 10)
    })
  })

  describe('scaleStrokeWidth', () => {
    it('multiplies stroke-width in place by the given scale', () => {
      const styleAttrs = { 'stroke-width': '10', stroke: '#000' }
      scaleStrokeWidth(styleAttrs, 0.3)
      expect(styleAttrs['stroke-width']).toBeCloseTo(3, 6)
    })

    it('is a no-op when there is no stroke-width', () => {
      const styleAttrs = { stroke: '#000' }
      scaleStrokeWidth(styleAttrs, 0.3)
      expect(styleAttrs).not.toHaveProperty('stroke-width')
    })

    it('is a no-op when the scale is 1', () => {
      const styleAttrs = { 'stroke-width': '10' }
      scaleStrokeWidth(styleAttrs, 1)
      expect(styleAttrs['stroke-width']).toBe('10')
    })
  })
})
