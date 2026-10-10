import { describe, it, expect } from 'vitest'
import {
  parseProfile, formatProfile, validateProfile, isProfile, profileAt, profileAround, presetId, presetPoints, PRESETS,
  withPoint, withoutPoint, movedPoint, endPercents
} from '../../packages/svgcanvas/core/width-profile.js'

describe('profile text', () => {
  it('round-trips', () => {
    const p = [[0, 0, 0], [0.25, 1, 0.5], [1, 0.2, 0.2]]
    expect(formatProfile(p)).toBe('0:0:0;0.25:1:0.5;1:0.2:0.2')
    expect(parseProfile(formatProfile(p))).toEqual(p)
  })

  it('refuses what is not a profile', () => {
    for (const bad of [null, '', '0:1:1', '0:1;1:1', '0:1:1;x:1:1', '1:1:1;0:1:1', '0:1:1;2:1:1', '0:-1:1;1:1:1', '0:1:1;1:NaN:1']) {
      expect(parseProfile(bad), String(bad)).toBeNull()
    }
    expect(validateProfile('0:1:1;1:1:1')).toBe(true)
    expect(typeof validateProfile('nonsense')).toBe('string')
  })

  it('a discontinuous point (two at one t) is a profile', () => {
    expect(isProfile([[0, 1, 1], [0.5, 1, 1], [0.5, 2, 2], [1, 2, 2]])).toBe(true)
  })

  it('every preset is a profile and is recognised by its id', () => {
    for (const { id, points } of PRESETS) {
      expect(isProfile(points), id).toBe(true)
      expect(presetId(presetPoints(id))).toBe(id)
    }
    expect(presetId(null)).toBe('uniform')
    expect(presetId([[0, 1, 1], [0.3, 0.1, 0.9], [1, 1, 1]])).toBe('custom')
  })
})

describe('reading a profile', () => {
  const lens = presetPoints('lens')

  it('is linear between points and clamped outside them', () => {
    expect(profileAt(lens, 0)).toEqual([0, 0])
    expect(profileAt(lens, 0.25)).toEqual([0.5, 0.5])
    expect(profileAt(lens, 0.5)).toEqual([1, 1])
    expect(profileAt(lens, 1)).toEqual([0, 0])
    expect(profileAt(lens, -1)).toEqual([0, 0])
    expect(profileAt(lens, 2)).toEqual([0, 0])
  })

  it('the two sides differ independently', () => {
    expect(profileAt([[0, 1, 0], [1, 0, 1]], 0.5)).toEqual([0.5, 0.5])
    expect(profileAt([[0, 1, 0], [1, 1, 1]], 0.5)).toEqual([1, 0.5])
  })

  it('around a continuous point both sides agree, around a discontinuous one they differ', () => {
    expect(profileAround(lens, 0.5)).toEqual([[1, 1], [1, 1]])
    const step = [[0, 1, 1], [0.5, 1, 1], [0.5, 2, 3], [1, 2, 3]]
    expect(profileAround(step, 0.5)).toEqual([[1, 1], [2, 3]])
    expect(profileAround(step, 0.25)).toEqual([[1, 1], [1, 1]])
  })

  it('summarises its ends as a taper (percent of the full width)', () => {
    expect(endPercents(lens)).toEqual([0, 0])
    expect(endPercents([[0, 1, 0.5], [1, 0.2, 0.2]])).toEqual([75, 20])
  })
})

describe('editing a profile', () => {
  const base = [[0, 1, 1], [1, 1, 1]]

  it('adds a point in order, or changes the one that is there', () => {
    const a = withPoint(base, 0.5, 2, 0.5)
    expect(a).toEqual([[0, 1, 1], [0.5, 2, 0.5], [1, 1, 1]])
    expect(withPoint(a, 0.5, 3, 3)).toEqual([[0, 1, 1], [0.5, 3, 3], [1, 1, 1]])
    expect(withPoint(a, 0.25, 0, 0).map((p) => p[0])).toEqual([0, 0.25, 0.5, 1])
    expect(base).toEqual([[0, 1, 1], [1, 1, 1]]) // the input is not touched
  })

  it('never makes a width negative', () => {
    expect(withPoint(base, 0.5, -3, 2)[1]).toEqual([0.5, 0, 2])
  })

  it('removes a point but keeps two', () => {
    const three = withPoint(base, 0.5, 2, 2)
    expect(withoutPoint(three, 1)).toEqual(base)
    expect(withoutPoint(base, 0)).toEqual(base)
  })

  it('moves a point between its neighbours', () => {
    const three = withPoint(base, 0.5, 2, 2)
    expect(movedPoint(three, 1, 0.3)[1][0]).toBeCloseTo(0.3, 9)
    expect(movedPoint(three, 1, 5)[1][0]).toBeLessThan(1)
    expect(movedPoint(three, 1, -5)[1][0]).toBeGreaterThan(0)
    expect(movedPoint(three, 0, 0.7)[0][0]).toBeLessThan(0.5)
  })
})
