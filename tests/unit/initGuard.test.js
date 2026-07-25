import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runGuardedInit } from '../../packages/svgcanvas/common/initGuard.js'
import { setLoggingEnabled } from '../../packages/svgcanvas/common/logger.js'

describe('runGuardedInit', () => {
  let warnSpy

  beforeEach(() => {
    setLoggingEnabled(true)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('registers new properties without warning', () => {
    const canvas = {}
    const registry = new Map()

    runGuardedInit(canvas, 'moduleA', (c) => { c.foo = 1 }, registry)
    runGuardedInit(canvas, 'moduleB', (c) => { c.bar = 2 }, registry)

    expect(canvas).toEqual({ foo: 1, bar: 2 })
    expect(registry.get('foo')).toBe('moduleA')
    expect(registry.get('bar')).toBe('moduleB')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns when a later module overwrites a property claimed by an earlier one', () => {
    const canvas = {}
    const registry = new Map()

    runGuardedInit(canvas, 'moduleA', (c) => { c.shared = 'from-a' }, registry)
    runGuardedInit(canvas, 'moduleB', (c) => { c.shared = 'from-b' }, registry)

    expect(canvas.shared).toBe('from-b')
    expect(registry.get('shared')).toBe('moduleB')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('moduleB')
    expect(warnSpy.mock.calls[0][0]).toContain('shared')
    expect(warnSpy.mock.calls[0][0]).toContain('moduleA')
  })

  it('does not warn when the same module re-runs its own init', () => {
    const canvas = {}
    const registry = new Map()

    runGuardedInit(canvas, 'moduleA', (c) => { c.foo = 1 }, registry)
    runGuardedInit(canvas, 'moduleA', (c) => { c.foo = 2 }, registry)

    expect(canvas.foo).toBe(2)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not warn when a property is left untouched (same reference)', () => {
    const shared = { x: 1 }
    const canvas = { shared }
    const registry = new Map()

    runGuardedInit(canvas, 'moduleA', () => {}, registry)

    expect(canvas.shared).toBe(shared)
    expect(registry.has('shared')).toBe(false)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
