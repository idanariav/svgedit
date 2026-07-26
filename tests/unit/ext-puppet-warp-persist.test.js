import { describe, it, expect } from 'vitest'
import {
  remapAffine,
  serializePins,
  parsePins,
  remapPuppetPins
} from '../../src/editor/extensions/ext-puppet-warp/ext-puppet-warp.js'

const NS_SVG = 'http://www.w3.org/2000/svg'

/**
 * Persistent-rig helpers for `se:puppet-rest-d`/`se:puppet-pins` (see
 * ext-puppet-warp.js's file-header comment). `remapPuppetRestD` isn't covered
 * here — like the rest of this file's paper.js-dependent geometry, it needs a
 * working 2D canvas context that `tests/unit/mocks/paper-core-stub.js` stubs
 * out under jsdom (see that file's own comment) — verified manually instead.
 */
describe('ext-puppet-warp persistent-rig helpers', () => {
  describe('remapAffine', () => {
    it('reconstructs a pure translation', () => {
      const remap = (x, y) => ({ x: x + 10, y: y - 5 })
      expect(remapAffine(remap)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 10, f: -5 })
    })

    it('reconstructs a non-uniform scale + translate', () => {
      const remap = (x, y) => ({ x: x * 2 + 3, y: y * 0.5 + 1 })
      expect(remapAffine(remap)).toEqual({ a: 2, b: 0, c: 0, d: 0.5, e: 3, f: 1 })
    })

    it('reconstructs a rotation (off-diagonal terms)', () => {
      // 90° rotation about the origin: (x,y) -> (-y,x)
      const remap = (x, y) => ({ x: -y, y: x })
      const m = remapAffine(remap)
      expect(m.a).toBeCloseTo(0, 10)
      expect(m.b).toBe(1)
      expect(m.c).toBe(-1)
      expect(m.d).toBeCloseTo(0, 10)
      expect(m.e).toBeCloseTo(0, 10)
      expect(m.f).toBe(0)
    })
  })

  describe('serializePins / parsePins', () => {
    it('round-trips a pin list, rounded to the same precision as fmt()', () => {
      const pins = [{ px: 1.005, py: 2, qx: 3, qy: 4.001 }]
      const json = serializePins(pins)
      expect(json).toBe('[[1,2,3,4]]')
      expect(parsePins(json)).toEqual([{ px: 1, py: 2, qx: 3, qy: 4 }])
    })

    it('round-trips multiple pins', () => {
      const pins = [{ px: 0, py: 0, qx: 10, qy: 10 }, { px: 20, py: 30, qx: 25, qy: 35 }]
      expect(parsePins(serializePins(pins))).toEqual(pins)
    })

    it('returns null for missing/empty input', () => {
      expect(parsePins(null)).toBeNull()
      expect(parsePins('')).toBeNull()
    })

    it('returns null for corrupted/hand-edited metadata rather than throwing', () => {
      expect(parsePins('not json')).toBeNull()
      expect(parsePins('{"not":"an array"}')).toBeNull()
    })
  })

  describe('remapPuppetPins', () => {
    it('remaps every pin\'s rest and current point through an external transform', () => {
      const elem = document.createElementNS(NS_SVG, 'path')
      elem.setAttribute('se:puppet-pins', serializePins([{ px: 10, py: 10, qx: 20, qy: 10 }]))

      // A translate-by-(5,5) bake, as coords.js's remapElement would pass in.
      const remap = (x, y) => ({ x: x + 5, y: y + 5 })
      remapPuppetPins(elem, remap)

      expect(parsePins(elem.getAttribute('se:puppet-pins'))).toEqual([
        { px: 15, py: 15, qx: 25, qy: 15 }
      ])
    })

    it('is a no-op when the element has no stored pins', () => {
      const elem = document.createElementNS(NS_SVG, 'path')
      remapPuppetPins(elem, (x, y) => ({ x, y }))
      expect(elem.hasAttribute('se:puppet-pins')).toBe(false)
    })

    it('is a no-op when stored pins are corrupted, rather than throwing', () => {
      const elem = document.createElementNS(NS_SVG, 'path')
      elem.setAttribute('se:puppet-pins', 'not json')
      expect(() => remapPuppetPins(elem, (x, y) => ({ x, y }))).not.toThrow()
      expect(elem.getAttribute('se:puppet-pins')).toBe('not json')
    })
  })
})
