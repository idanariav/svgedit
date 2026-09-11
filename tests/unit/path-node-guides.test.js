import { describe, it, expect } from 'vitest'
import { collectPathNodeTargets, snapPathNodeToTargets } from '../../packages/svgcanvas/core/path-node-guides.js'

describe('path-node-guides', () => {
  describe('collectPathNodeTargets', () => {
    it('returns every anchor node except the excluded indices', () => {
      const path = {
        segs: [
          { item: { x: 10, y: 10 } },
          { item: { x: 50, y: 10 } },
          { item: { x: 50, y: 60 } },
          { item: { x: 10, y: 60 } }
        ]
      }

      const targets = collectPathNodeTargets(path, [2])

      expect(targets).toEqual([
        { x: 10, y: 10, index: 0 },
        { x: 50, y: 10, index: 1 },
        { x: 10, y: 60, index: 3 }
      ])
    })

    it('skips segments with no coordinates (e.g. a closepath Z segment)', () => {
      const path = {
        segs: [
          { item: { x: 10, y: 10 } },
          { item: {} } // Z has no x/y
        ]
      }

      expect(collectPathNodeTargets(path, [])).toEqual([{ x: 10, y: 10, index: 0 }])
    })

    it('returns an empty list for a missing/degenerate path', () => {
      expect(collectPathNodeTargets(null, [])).toEqual([])
      expect(collectPathNodeTargets({}, [])).toEqual([])
    })
  })

  describe('snapPathNodeToTargets', () => {
    const targets = [
      { x: 10, y: 10, index: 0 },
      { x: 50, y: 60, index: 2 }
    ]

    it('snaps x and y independently to the nearest target within tolerance', () => {
      // Candidate (12, 61) is within tol=5 of target 0's x (10) and target 2's y (60).
      const snap = snapPathNodeToTargets(12, 61, targets, 5)

      expect(snap.x).toMatchObject({ pos: 10, delta: -2, target: targets[0] })
      expect(snap.y).toMatchObject({ pos: 60, delta: -1, target: targets[1] })
    })

    it('returns null for an axis with no match inside tolerance', () => {
      const snap = snapPathNodeToTargets(30, 30, targets, 5)

      expect(snap.x).toBeNull()
      expect(snap.y).toBeNull()
    })

    it('picks the closest target when more than one is within tolerance', () => {
      const closeTargets = [
        { x: 10, y: 0, index: 0 },
        { x: 13, y: 0, index: 1 }
      ]
      const snap = snapPathNodeToTargets(12, 0, closeTargets, 5)

      expect(snap.x.target.index).toBe(1) // |13-12|=1 beats |10-12|=2
    })
  })
})
