import { describe, it, expect } from 'vitest'
import { resolveWarpableShapes, computeCommitPatch } from '../../src/editor/extensions/ext-puppet-warp/ext-puppet-warp.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
const el = (tag) => document.createElementNS(NS_SVG, tag)

/**
 * `resolveWarpableShapes` (selection→target filtering, extracted from
 * `startSession`) and `computeCommitPatch` (which rig attributes
 * `commit` writes) are DOM-light/pure respectively, so
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
      origD: 'M0,0 L10,10',
      hasRestD: false,
      oldPinsJson: null,
      newPinsJson: '[]',
      persistRig: false
    }

    it('writes nothing when the rig is not persisted', () => {
      expect(computeCommitPatch(base)).toEqual({ newRestD: null, newPins: null })
    })

    it('initializes rest-d to the pre-warp d on first persist (rig creation)', () => {
      const patch = computeCommitPatch({ ...base, persistRig: true, hasRestD: false })
      expect(patch.newRestD).toBe(base.origD)
    })

    it('never rewrites rest-d once it exists', () => {
      const patch = computeCommitPatch({ ...base, persistRig: true, hasRestD: true })
      expect(patch.newRestD).toBeNull()
    })

    it('writes pins when they changed and the rig is persisted', () => {
      const patch = computeCommitPatch({
        ...base, persistRig: true, hasRestD: true, oldPinsJson: '[[0,0,0,0]]', newPinsJson: '[[0,0,5,5]]'
      })
      expect(patch.newPins).toBe('[[0,0,5,5]]')
    })

    it('skips pins when unchanged even if the rig is persisted', () => {
      const patch = computeCommitPatch({
        ...base, persistRig: true, hasRestD: true, oldPinsJson: '[[0,0,0,0]]', newPinsJson: '[[0,0,0,0]]'
      })
      expect(patch.newPins).toBeNull()
    })

    it('never touches rest-d/pins for a non-persisted (multi-target) session', () => {
      const patch = computeCommitPatch({ ...base, oldPinsJson: null, newPinsJson: '[[1,1,2,2]]' })
      expect(patch).toEqual({ newRestD: null, newPins: null })
    })

    it('writes both rest-d and pins on rig creation', () => {
      const patch = computeCommitPatch({
        origD: 'M0,0 L0,0', hasRestD: false, oldPinsJson: null, newPinsJson: '[[0,0,5,5]]', persistRig: true
      })
      expect(patch.newRestD).toBe('M0,0 L0,0')
      expect(patch.newPins).toBe('[[0,0,5,5]]')
    })
  })
})
