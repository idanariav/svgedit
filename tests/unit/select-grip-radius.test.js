import { describe, it, expect, vi, afterEach } from 'vitest'

describe('selection grip radius', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  const load = async (matches) => {
    vi.resetModules()
    vi.stubGlobal('matchMedia', (q) => ({ matches: matches && q.includes('coarse'), media: q }))
    return (await import('../../packages/svgcanvas/core/select.js')).gripRadius
  }

  it('uses small handles for a mouse and large ones for a coarse (finger) pointer', async () => {
    expect(await load(false)).toBe(4)
    expect(await load(true)).toBe(10)
  })
})
