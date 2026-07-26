import { describe, it, expect } from 'vitest'
import { resolveWarpableShapes, computeCommitPatch } from '../../src/editor/extensions/ext-puppet-warp/ext-puppet-warp.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
const el = (tag) => document.createElementNS(NS_SVG, tag)

/**
 * `resolveWarpableShapes` (selection→target filtering, extracted from
 * `startSession`) and `computeCommitPatch` (per-target undo-snapshot
 * decision, extracted from `commit`) are DOM-light/pure respectively, so
 * they're unit-testable without a svgCanvas/undo-history mock — see
 * .claude/techdebt.md's former "Extension logic has no vitest coverage"
 * entry.
 */
describe('ext-puppet-warp session-lifecycle helpers', () => {
  describe('resolveWarpableShapes', () => {
    it('keeps a warpable primitive as-is', () => {
      const rect = el('rect')
      expect(resolveWarpableShapes([rect])).toEqual([rect])
    })

    it('drops a non-warpable element (e.g. text)', () => {
      expect(resolveWarpableShapes([el('text')])).toEqual([])
    })

    it('expands a group into its warpable descendants, not itself', () => {
      const g = el('g')
      const rect = el('rect')
      const circle = el('circle')
      g.append(rect, circle)
      expect(resolveWarpableShapes([g])).toEqual([rect, circle])
    })

    it('drops non-warpable descendants of a group', () => {
      const g = el('g')
      const rect = el('rect')
      const text = el('text')
      g.append(rect, text)
      expect(resolveWarpableShapes([g])).toEqual([rect])
    })

    it('recurses into nested groups', () => {
      const outer = el('g')
      const inner = el('g')
      const path = el('path')
      inner.append(path)
      outer.append(inner)
      expect(resolveWarpableShapes([outer])).toEqual([path])
    })

    it('handles a mixed selection of groups and primitives', () => {
      const g = el('g')
      const gChild = el('ellipse')
      g.append(gChild)
      const line = el('line')
      expect(resolveWarpableShapes([g, line])).toEqual([gChild, line])
    })

    it('returns an empty array for an empty selection', () => {
      expect(resolveWarpableShapes([])).toEqual([])
    })
  })

  describe('computeCommitPatch', () => {
    const base = {
      currentD: 'M0,0 L10,10',
      origD: 'M0,0 L10,10',
      hasRestD: false,
      oldPinsJson: null,
      newPinsJson: '[]',
      persistRig: false
    }

    it('is a no-op when d is unchanged and the rig is not persisted', () => {
      expect(computeCommitPatch(base)).toEqual({ oldValues: {}, newRestD: null, newPins: null })
    })

    it('snapshots the old d when it changed', () => {
      const patch = computeCommitPatch({ ...base, currentD: 'M0,0 L20,20' })
      expect(patch.oldValues).toEqual({ d: 'M0,0 L10,10' })
      expect(patch.newRestD).toBeNull()
      expect(patch.newPins).toBeNull()
    })

    it('initializes rest-d on first persist (rig creation)', () => {
      const patch = computeCommitPatch({ ...base, persistRig: true, hasRestD: false })
      expect(patch.newRestD).toBe(base.origD)
      expect(patch.oldValues['se:puppet-rest-d']).toBeNull()
    })

    it('never rewrites rest-d once it exists', () => {
      const patch = computeCommitPatch({ ...base, persistRig: true, hasRestD: true })
      expect(patch.newRestD).toBeNull()
      expect(patch.oldValues['se:puppet-rest-d']).toBeUndefined()
    })

    it('writes pins when they changed and the rig is persisted', () => {
      const patch = computeCommitPatch({
        ...base, persistRig: true, hasRestD: true, oldPinsJson: '[[0,0,0,0]]', newPinsJson: '[[0,0,5,5]]'
      })
      expect(patch.newPins).toBe('[[0,0,5,5]]')
      expect(patch.oldValues['se:puppet-pins']).toBe('[[0,0,0,0]]')
    })

    it('skips pins when unchanged even if the rig is persisted', () => {
      const patch = computeCommitPatch({
        ...base, persistRig: true, hasRestD: true, oldPinsJson: '[[0,0,0,0]]', newPinsJson: '[[0,0,0,0]]'
      })
      expect(patch.newPins).toBeNull()
      expect(patch.oldValues['se:puppet-pins']).toBeUndefined()
    })

    it('never touches rest-d/pins for a non-persisted (multi-target) session even if d changed', () => {
      const patch = computeCommitPatch({
        ...base,
        currentD: 'M0,0 L99,99',
        persistRig: false,
        hasRestD: false,
        oldPinsJson: null,
        newPinsJson: '[[1,1,2,2]]'
      })
      expect(patch.newRestD).toBeNull()
      expect(patch.newPins).toBeNull()
      expect(patch.oldValues).toEqual({ d: base.origD })
    })

    it('bundles d + rest-d + pins into one patch when all three change on rig creation', () => {
      const patch = computeCommitPatch({
        currentD: 'M0,0 L50,50',
        origD: 'M0,0 L0,0',
        hasRestD: false,
        oldPinsJson: null,
        newPinsJson: '[[0,0,5,5]]',
        persistRig: true
      })
      expect(patch.oldValues).toEqual({ d: 'M0,0 L0,0', 'se:puppet-rest-d': null, 'se:puppet-pins': null })
      expect(patch.newRestD).toBe('M0,0 L0,0')
      expect(patch.newPins).toBe('[[0,0,5,5]]')
    })
  })
})
