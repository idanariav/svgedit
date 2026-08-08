import { describe, it, expect } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import {
  canSegment,
  serializeParams,
  parseParams,
  resolveCenter,
  computeWedgeAngles,
  computeSpokeAngles,
  computeGridStrips,
  computeGridDividerPositions,
  farthestCornerDistance
} from '../../packages/svgcanvas/core/segment.js'

// segment.js's actual piece-cutting (buildWedgePolygon/splitRadial/splitGrid/
// clipRadialSpoke/clipGridDivider) calls into paper.js's `intersect()`/
// `getIntersections()`, which needs a real 2D canvas context to construct a
// PaperScope — unavailable under jsdom (see tests/unit/mocks/paper-core-stub.js,
// the same reason boolean-ops.js/cutter.js have no geometry-level unit tests
// either). This file covers every pure, paper.js-independent helper instead;
// the actual cut/wedge geometry is exercised manually via Playwright in a
// real browser (see the Segment tool section of the verification notes).

describe('segment', () => {
  describe('canSegment', () => {
    it('rejects null/undefined', () => {
      expect(canSegment(null)).toBe(false)
      expect(canSegment(undefined)).toBe(false)
    })

    it('rejects non-path-convertible tags', () => {
      for (const tag of ['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs']) {
        const el = document.createElementNS(NS.SVG, tag)
        expect(canSegment(el)).toBe(false)
      }
    })

    it('accepts path-convertible shapes', () => {
      for (const tag of ['rect', 'circle', 'ellipse', 'polygon', 'path', 'line', 'polyline']) {
        const el = document.createElementNS(NS.SVG, tag)
        expect(canSegment(el)).toBe(true)
      }
    })
  })

  describe('serializeParams / parseParams', () => {
    it('round-trips radial params', () => {
      const params = { mode: 'radial', count: 6, split: false, startAngle: -90 }
      const parsed = parseParams(serializeParams(params))
      expect(parsed).toEqual(params)
    })

    it('round-trips grid params', () => {
      const params = { mode: 'grid', count: 3, split: true, axis: 'horizontal' }
      const parsed = parseParams(serializeParams(params))
      expect(parsed).toEqual(params)
    })

    it('parseParams returns null for empty/missing input', () => {
      expect(parseParams(null)).toBeNull()
      expect(parseParams('')).toBeNull()
    })

    it('parseParams falls back to defaults for missing fields', () => {
      expect(parseParams('radial;split=0')).toMatchObject({ mode: 'radial', count: 4 })
      expect(parseParams('grid;split=0')).toMatchObject({ mode: 'grid', count: 1, axis: 'vertical' })
    })
  })

  describe('resolveCenter', () => {
    const svgCanvas = {
      getStrokedBBox: () => ({ x: 10, y: 20, width: 80, height: 40 })
    }

    it('reads cx/cy directly off an untransformed <circle>', () => {
      const circle = document.createElementNS(NS.SVG, 'circle')
      circle.setAttribute('cx', '33')
      circle.setAttribute('cy', '44')
      const c = resolveCenter(circle, svgCanvas)
      expect(c).toEqual({ cx: 33, cy: 44 })
    })

    it('falls back to bbox center for a transformed circle', () => {
      const circle = document.createElementNS(NS.SVG, 'circle')
      circle.setAttribute('cx', '33')
      circle.setAttribute('cy', '44')
      circle.setAttribute('transform', 'translate(10 10)')
      const c = resolveCenter(circle, svgCanvas)
      // bbox center from the mocked getStrokedBBox: 10+80/2, 20+40/2
      expect(c).toEqual({ cx: 50, cy: 40 })
    })

    it('uses bbox center for a rect', () => {
      const rect = document.createElementNS(NS.SVG, 'rect')
      const c = resolveCenter(rect, svgCanvas)
      expect(c).toEqual({ cx: 50, cy: 40 })
    })
  })

  describe('computeWedgeAngles', () => {
    it('produces N contiguous wedges summing to 360°', () => {
      const wedges = computeWedgeAngles(4, -90)
      expect(wedges).toHaveLength(4)
      expect(wedges[0]).toEqual({ a0: -90, a1: 0 })
      expect(wedges[3]).toEqual({ a0: 180, a1: 270 })
    })

    it('clamps count to a minimum of 2', () => {
      expect(computeWedgeAngles(1)).toHaveLength(2)
      expect(computeWedgeAngles(0)).toHaveLength(2)
    })

    it('defaults startAngle to -90', () => {
      const wedges = computeWedgeAngles(2)
      expect(wedges[0].a0).toBe(-90)
    })
  })

  describe('computeSpokeAngles', () => {
    it('produces N evenly-spaced angles', () => {
      expect(computeSpokeAngles(4, 0)).toEqual([0, 90, 180, 270])
    })

    it('clamps count to a minimum of 2', () => {
      expect(computeSpokeAngles(1)).toHaveLength(2)
    })
  })

  describe('computeGridStrips', () => {
    it('produces N+1 evenly-spaced strips spanning the extent', () => {
      const strips = computeGridStrips(2, 0, 90)
      expect(strips).toEqual([
        { from: 0, to: 30 },
        { from: 30, to: 60 },
        { from: 60, to: 90 }
      ])
    })

    it('clamps count to a minimum of 1', () => {
      expect(computeGridStrips(0, 0, 100)).toHaveLength(2)
    })
  })

  describe('computeGridDividerPositions', () => {
    it('produces N interior divider positions', () => {
      expect(computeGridDividerPositions(2, 0, 90)).toEqual([30, 60])
    })

    it('clamps count to a minimum of 1', () => {
      expect(computeGridDividerPositions(0, 0, 100)).toEqual([50])
    })
  })

  describe('farthestCornerDistance', () => {
    it('is at least twice the distance to the farthest bbox corner', () => {
      const center = { cx: 0, cy: 0 }
      const bounds = { x: 0, y: 0, width: 10, height: 10 }
      // Farthest corner is (10,10), distance sqrt(200) ~= 14.142
      expect(farthestCornerDistance(center, bounds)).toBeCloseTo(2 * Math.sqrt(200), 5)
    })

    it('stays correct when the center sits outside the bounds', () => {
      const center = { cx: -50, cy: 0 }
      const bounds = { x: 0, y: 0, width: 10, height: 10 }
      // Farthest x-corner from -50 is x=10 (distance 60), farthest y is 10.
      expect(farthestCornerDistance(center, bounds)).toBeCloseTo(2 * Math.hypot(60, 10), 5)
    })
  })
})
