import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPasteFallbackArmer } from '../../src/editor/pasteFallbackArmer.js'

describe('createPasteFallbackArmer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the fallback when never disarmed within the delay', () => {
    const onFallback = vi.fn()
    const armer = createPasteFallbackArmer(onFallback, 80)

    armer.arm()
    vi.advanceTimersByTime(79)
    expect(onFallback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('skips the fallback when disarmed before the delay elapses', () => {
    const onFallback = vi.fn()
    const armer = createPasteFallbackArmer(onFallback, 80)

    armer.arm()
    armer.disarm()
    vi.advanceTimersByTime(80)

    expect(onFallback).not.toHaveBeenCalled()
  })

  it('does not fire twice for a single arm', () => {
    const onFallback = vi.fn()
    const armer = createPasteFallbackArmer(onFallback, 80)

    armer.arm()
    vi.advanceTimersByTime(200)

    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('disarm is a no-op when never armed', () => {
    const onFallback = vi.fn()
    const armer = createPasteFallbackArmer(onFallback, 80)

    armer.disarm()
    vi.advanceTimersByTime(200)

    expect(onFallback).not.toHaveBeenCalled()
  })
})
