import { describe, it, expect } from 'vitest'
import { attachPinToRest, buildD, warpSubpaths } from '../../src/editor/extensions/ext-puppet-warp/ext-puppet-warp.js'

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/**
 * `buildD`/`warpSubpaths` are the pure geometry helpers extracted from
 * `applyWarp()` (see ext-puppet-warp.js's file-header techdebt note): the
 * MLS re-warp of a cached rest pose, and the content-space→local-space `d`
 * string rebuild. Both take plain data (no DOM/paper.js/svgCanvas), so they're
 * testable against a stub matrix/pin set without mocking the canvas.
 */
describe('ext-puppet-warp warp-mapping helpers', () => {
  describe('warpSubpaths', () => {
    it('identity pins leave every point unchanged', () => {
      const rest = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }]
      const pins = [{ px: 0, py: 0, qx: 0, qy: 0 }, { px: 10, py: 0, qx: 10, qy: 0 }]
      const warped = warpSubpaths(rest, pins)
      expect(warped).toEqual(rest)
    })

    it('a single pin translates every point by the pin delta', () => {
      const rest = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 20 }], closed: true }]
      const pins = [{ px: 0, py: 0, qx: 5, qy: -3 }]
      const warped = warpSubpaths(rest, pins)
      expect(warped[0].pts[0].x).toBeCloseTo(5, 9)
      expect(warped[0].pts[0].y).toBeCloseTo(-3, 9)
      expect(warped[0].pts[1].x).toBeCloseTo(15, 9)
      expect(warped[0].pts[1].y).toBeCloseTo(17, 9)
    })

    it('preserves each subpath\'s closed flag and point count across multiple subpaths', () => {
      const rest = [
        { pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false },
        { pts: [{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 7 }], closed: true }
      ]
      const pins = [{ px: 0, py: 0, qx: 100, qy: 100 }]
      const warped = warpSubpaths(rest, pins)
      expect(warped).toHaveLength(2)
      expect(warped[0].closed).toBe(false)
      expect(warped[0].pts).toHaveLength(2)
      expect(warped[1].closed).toBe(true)
      expect(warped[1].pts).toHaveLength(3)
    })

    it('0 pins leaves points unchanged (no deformation source)', () => {
      const rest = [{ pts: [{ x: 3, y: 4 }], closed: false }]
      const warped = warpSubpaths(rest, [])
      expect(warped[0].pts[0].x).toBeCloseTo(3, 9)
      expect(warped[0].pts[0].y).toBeCloseTo(4, 9)
    })
  })

  describe('attachPinToRest', () => {
    it('returns the click unchanged when there are no pins (rest === current pose)', () => {
      const rest = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }]
      expect(attachPinToRest([rest], [], 4, 1)).toEqual({ x: 4, y: 1 })
    })

    it('returns the click unchanged when there is no rest geometry to attach to', () => {
      expect(attachPinToRest([], [{ px: 0, py: 0, qx: 5, qy: 5 }], 4, 1)).toEqual({ x: 4, y: 1 })
    })

    it('re-expresses a click on the warped pose as the corresponding rest-space point', () => {
      // rest is a horizontal segment; a single pin translates the whole
      // pose by (+100, 0), so the current (displayed) pose sits at x=100..110.
      const rest = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }]
      const pins = [{ px: 0, py: 0, qx: 100, qy: 0 }]
      // Click exactly on the warped sample at rest-index 1 (currently at 110,0).
      const anchor = attachPinToRest([rest], pins, 110, 0)
      expect(anchor.x).toBeCloseTo(10, 9)
      expect(anchor.y).toBeCloseTo(0, 9)
    })

    it('preserves a small off-curve offset when re-expressing in rest space', () => {
      const rest = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }]
      const pins = [{ px: 0, py: 0, qx: 100, qy: 0 }]
      // Click 3 units above the nearest warped sample (110,0) → offset (0,3)
      // should carry over onto that sample's rest-space point (10,0).
      const anchor = attachPinToRest([rest], pins, 110, 3)
      expect(anchor.x).toBeCloseTo(10, 9)
      expect(anchor.y).toBeCloseTo(3, 9)
    })

    it('picks the nearest sample across multiple targets', () => {
      const restA = [{ pts: [{ x: 0, y: 0 }], closed: false }]
      const restB = [{ pts: [{ x: 50, y: 50 }], closed: false }]
      // Nearest sample is restB's (50,50), 1 unit away; the (1,1) click↔sample
      // offset carries through even with no pins (rest === current pose).
      const anchor = attachPinToRest([restA, restB], [], 51, 51)
      expect(anchor).toEqual({ x: 51, y: 51 })
    })
  })

  describe('buildD', () => {
    it('builds an open M/L polyline under the identity matrix', () => {
      const subpaths = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false }]
      expect(buildD(subpaths, IDENTITY)).toBe('M0,0 L10,0 L10,10')
    })

    it('appends Z for a closed subpath', () => {
      const subpaths = [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: true }]
      expect(buildD(subpaths, IDENTITY)).toBe('M0,0 L10,0 Z')
    })

    it('maps points through a non-identity inverse matrix (translate)', () => {
      const inv = { a: 1, b: 0, c: 0, d: 1, e: -5, f: -5 }
      const subpaths = [{ pts: [{ x: 5, y: 5 }, { x: 15, y: 5 }], closed: false }]
      expect(buildD(subpaths, inv)).toBe('M0,0 L10,0')
    })

    it('maps points through a scale inverse matrix', () => {
      const inv = { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 }
      const subpaths = [{ pts: [{ x: 20, y: 40 }], closed: false }]
      expect(buildD(subpaths, inv)).toBe('M10,20')
    })

    it('joins multiple subpaths with a space', () => {
      const subpaths = [
        { pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false },
        { pts: [{ x: 5, y: 5 }, { x: 6, y: 5 }], closed: true }
      ]
      expect(buildD(subpaths, IDENTITY)).toBe('M0,0 L1,0 M5,5 L6,5 Z')
    })

    it('rounds coordinates to 2 decimal places (fmt)', () => {
      const subpaths = [{ pts: [{ x: 1.005, y: 2.0049 }], closed: false }]
      expect(buildD(subpaths, IDENTITY)).toBe('M1,2')
    })

    it('handles a degenerate single-point subpath (no L segments)', () => {
      const subpaths = [{ pts: [{ x: 3, y: 4 }], closed: false }]
      expect(buildD(subpaths, IDENTITY)).toBe('M3,4')
    })

    it('returns an empty string for no subpaths', () => {
      expect(buildD([], IDENTITY)).toBe('')
    })
  })
})
