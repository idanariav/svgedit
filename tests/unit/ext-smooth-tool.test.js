import { describe, it, expect } from 'vitest'
import ext, { isSmoothable, BRUSH_RADIUS_PX, TOLERANCE_PX } from '../../src/editor/extensions/ext-smooth-tool/ext-smooth-tool.js'

const el = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

describe('ext-smooth-tool', () => {
  it('is an extension named smooth-tool', () => {
    expect(ext.name).toBe('smooth-tool')
    expect(typeof ext.init).toBe('function')
  })

  it('brushes in screen pixels, with a tolerance smaller than the brush', () => {
    expect(BRUSH_RADIUS_PX).toBeGreaterThan(TOLERANCE_PX)
  })

  describe('isSmoothable', () => {
    it('accepts a plain path', () => {
      expect(isSmoothable(el('path', { d: 'M0,0 L1,1' }))).toBe(true)
    })

    it('refuses other elements and nothing', () => {
      expect(isSmoothable(el('rect'))).toBe(false)
      expect(isSmoothable(el('polyline'))).toBe(false)
      expect(isSmoothable(null)).toBe(false)
    })

    it('refuses paths whose geometry derives from another attribute', () => {
      for (const attr of ['se:taper-d', 'se:orig-d', 'se:fx-d']) {
        expect(isSmoothable(el('path', { d: 'M0,0 L1,1', [attr]: 'M0,0 L1,1' }))).toBe(false)
      }
    })
  })
})
