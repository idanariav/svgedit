import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EXTENSION_HOOKS, isExtensionHook } from '../../packages/svgcanvas/core/extension-hooks.js'

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  if (f === 'node_modules' || f === 'dist') return []
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []
})

describe('extension hook registry', () => {
  it('knows keyDown and rejects typos', () => {
    expect(isExtensionHook('keyDown')).toBe(true)
    expect(isExtensionHook('mouseDwon')).toBe(false)
  })

  it('has an entry for every hook the codebase dispatches via runExtensions', () => {
    const dispatched = new Set()
    for (const f of [...walk('src'), ...walk('packages/svgcanvas/core')]) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/runExtensions\(\s*'([A-Za-z]+)'/g)) dispatched.add(m[1])
    }
    expect(dispatched.size).toBeGreaterThan(10)
    for (const name of dispatched) expect(EXTENSION_HOOKS).toContain(name)
  })
})
