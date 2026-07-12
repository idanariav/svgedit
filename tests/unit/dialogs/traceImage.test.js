import { describe, it, expect } from 'vitest'
import { buildTraceOptions } from '../../../src/editor/dialogs/traceImage.js'

describe('buildTraceOptions', () => {
  it('lineart preset tunes curve-fitting thresholds for a tighter, corner-free trace', () => {
    const options = buildTraceOptions('lineart')
    expect(options.numberofcolors).toBe(2)
    // ltres stays at the grayscale base's default (1) so ordinary
    // rasterization noise doesn't fragment straight strokes into jitter.
    expect(options.ltres).toBe(1)
    expect(options.qtres).toBe(0.2)
    expect(options.pathomit).toBe(2)
    expect(options.rightangleenhance).toBe(false)
    expect(options.roundcoords).toBe(2)
  })

  it('numberofcolors override wins over the lineart preset value', () => {
    const options = buildTraceOptions('lineart', 4)
    expect(options.numberofcolors).toBe(4)
    // Curve-fitting overrides still apply regardless of the color override.
    expect(options.qtres).toBe(0.2)
  })

  it('non-lineart presets are unaffected by the lineart curve overrides', () => {
    const options = buildTraceOptions('color')
    expect(options.ltres).toBe(1)
    expect(options.qtres).toBe(1)
    expect(options.rightangleenhance).toBe(true)
  })

  it('falls back to the default preset for an unknown preset name', () => {
    const options = buildTraceOptions('bogus')
    expect(options).toEqual(expect.objectContaining({ numberofcolors: 16, ltres: 1, qtres: 1 }))
  })
})
