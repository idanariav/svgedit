import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { error, warn, info, setLogSink, setLogLevel, LogLevel } from '../../packages/svgcanvas/common/logger.js'

describe('logger sink', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setLogLevel(LogLevel.WARN)
  })
  afterEach(() => {
    setLogSink(null)
    vi.restoreAllMocks()
  })

  it('delivers records at or above the level, with message, data and context', () => {
    const sink = vi.fn()
    setLogSink(sink)
    const err = new Error('boom')
    error('it broke', err, 'mod')
    warn('careful')
    info('too chatty')
    expect(sink).toHaveBeenCalledTimes(2)
    expect(sink).toHaveBeenNthCalledWith(1, 'error', { message: '[SVGCanvas] [mod] it broke', data: err })
    expect(sink).toHaveBeenNthCalledWith(2, 'warn', { message: '[SVGCanvas] careful', data: undefined })
  })

  it('still logs to the console', () => {
    warn('hello')
    expect(console.warn).toHaveBeenCalled()
  })

  it('never lets a throwing sink break the caller', () => {
    setLogSink(() => { throw new Error('host sink down') })
    expect(() => error('x')).not.toThrow()
  })

  it('stops delivering after setLogSink(null)', () => {
    const sink = vi.fn()
    setLogSink(sink)
    setLogSink(null)
    error('x')
    expect(sink).not.toHaveBeenCalled()
  })

  it('shares one sink across separately loaded copies of the module', async () => {
    const sink = vi.fn()
    setLogSink(sink)
    vi.resetModules()
    const copy = await import('../../packages/svgcanvas/common/logger.js')
    copy.error('from the other bundle')
    expect(sink).toHaveBeenCalledTimes(1)
  })
})

describe('logging discipline', () => {
  it('has no raw console.error/console.warn calls outside the logger', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const walk = (dir) => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (f === 'node_modules' || f === 'dist') return []
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []
    })
    const offenders = [...walk('src'), ...walk('packages/svgcanvas/core'), 'packages/svgcanvas/svgcanvas.js']
      .filter(f => readFileSync(f, 'utf8').split('\n')
        .some(l => /console\.(error|warn)\(/.test(l) && !/^\s*(\/\/|\*)/.test(l)))
    expect(offenders, 'use common/logger.js (error/warn) instead').toEqual([])
  })
})
