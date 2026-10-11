import { describe, it, expect } from 'vitest'
import { planOthers, layerDropIndex } from '../../src/editor/panels/layerGestures.js'

const rows = (...on) => on.map((o, i) => ({ key: 'L' + i, on: o }))

describe('planOthers (Alt-click on an eye or a padlock)', () => {
  it('turns every other row on when any of them is off', () => {
    expect(planOthers(rows(false, false, true), 'L0')).toEqual([['L1', true]])
  })

  it('turns them all off again when they are all on', () => {
    expect(planOthers(rows(false, true, true), 'L0')).toEqual([['L1', false], ['L2', false]])
  })

  it('leaves the clicked row alone for a lock', () => {
    expect(planOthers(rows(true, false, false), 'L0').map(([k]) => k)).toEqual(['L1', 'L2'])
  })

  it('reveals the clicked row when others get hidden (an eye)', () => {
    expect(planOthers(rows(true, false, false), 'L0', true)).toEqual([['L1', true], ['L2', true], ['L0', false]])
    // not when it is already shown
    expect(planOthers(rows(false, false), 'L0', true)).toEqual([['L1', true]])
  })

  it('skips rows that opt out and does nothing without other rows', () => {
    const r = [{ key: 'a', on: false }, { key: 'b', on: false, skip: true }, { key: 'c', on: false }]
    expect(planOthers(r, 'a')).toEqual([['c', true]])
    expect(planOthers([{ key: 'a', on: true }], 'a', true)).toEqual([])
  })
})

describe('layerDropIndex (drag a layer row)', () => {
  const names = ['bottom', 'mid', 'top'] // z-order, the panel lists top first

  it('puts a layer above or below the target', () => {
    expect(layerDropIndex(names, 'bottom', 'top', true)).toBe(2) // above "top" = new top
    expect(layerDropIndex(names, 'bottom', 'mid', true)).toBe(1) // above "mid"
    expect(layerDropIndex(names, 'top', 'bottom', false)).toBe(0) // below "bottom" = new bottom
    expect(layerDropIndex(names, 'top', 'mid', false)).toBe(1) // below "mid"
  })

  it('reports no move for the same place', () => {
    expect(layerDropIndex(names, 'mid', 'mid', true)).toBe(1)
    expect(layerDropIndex(names, 'mid', 'top', false)).toBe(1) // already just below top
    expect(layerDropIndex(names, 'mid', 'bottom', true)).toBe(1) // already just above bottom
  })
})
