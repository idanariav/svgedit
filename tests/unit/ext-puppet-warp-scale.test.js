import { sampleStepFor, refitToleranceFor } from '../../src/editor/extensions/ext-puppet-warp/ext-puppet-warp.js'

/**
 * `sampleStepFor`/`refitToleranceFor` derive the warp polyline's sample
 * spacing and the on-commit bézier refit tolerance from a target's
 * content-space bbox diagonal, so a tiny icon and a huge path each get
 * proportionate sampling/smoothing instead of sharing one fixed constant
 * (see ext-puppet-warp.js's module-level comment for the ratios' rationale).
 */
describe('ext-puppet-warp scale-derived constants', function () {
  it('a mid-size target (~300 unit diagonal) lands on the previous fixed defaults', () => {
    expect(sampleStepFor(300)).toBeCloseTo(6, 5)
    expect(refitToleranceFor(300)).toBeCloseTo(2, 5)
  })

  it('scales down for a tiny target, but stays within the clamp floor', () => {
    expect(sampleStepFor(10)).toBe(1)
    expect(refitToleranceFor(10)).toBe(0.5)
  })

  it('scales up for a huge target, but stays within the clamp ceiling', () => {
    expect(sampleStepFor(10000)).toBe(20)
    expect(refitToleranceFor(10000)).toBe(10)
  })

  it('grows monotonically with diagonal between the clamp bounds', () => {
    expect(sampleStepFor(600)).toBeGreaterThan(sampleStepFor(300))
    expect(refitToleranceFor(600)).toBeGreaterThan(refitToleranceFor(300))
  })
})
