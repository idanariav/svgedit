import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachApi } from '../../packages/svgcanvas/common/initGuard.ts'
import { setLoggingEnabled } from '../../packages/svgcanvas/common/logger.ts'

describe('attachApi', () => {
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

    attachApi(canvas, 'moduleA', { foo: 1 }, registry)
    attachApi(canvas, 'moduleB', { bar: 2 }, registry)

    expect(canvas).toEqual({ foo: 1, bar: 2 })
    expect(registry.get('foo')).toBe('moduleA')
    expect(registry.get('bar')).toBe('moduleB')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns when a later module overwrites a property claimed by an earlier one', () => {
    const canvas = {}
    const registry = new Map()

    attachApi(canvas, 'moduleA', { shared: 'from-a' }, registry)
    attachApi(canvas, 'moduleB', { shared: 'from-b' }, registry)

    expect(canvas.shared).toBe('from-b')
    expect(registry.get('shared')).toBe('moduleB')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('moduleB')
    expect(warnSpy.mock.calls[0][0]).toContain('shared')
    expect(warnSpy.mock.calls[0][0]).toContain('moduleA')
  })

  it('does not warn when the same module attaches the name again', () => {
    const canvas = {}
    const registry = new Map()

    attachApi(canvas, 'moduleA', { foo: 1 }, registry)
    attachApi(canvas, 'moduleA', { foo: 2 }, registry)

    expect(canvas.foo).toBe(2)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('leaves members it was not given alone', () => {
    const shared = { x: 1 }
    const canvas = { shared }
    const registry = new Map()

    attachApi(canvas, 'moduleA', {}, registry)

    expect(canvas.shared).toBe(shared)
    expect(registry.has('shared')).toBe(false)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
