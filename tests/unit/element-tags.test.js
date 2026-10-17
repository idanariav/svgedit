import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// src/editor/element-tags.d.ts types `querySelector('se-…')` for the strict editor check; it has to list every
// custom element the editor defines.

const root = resolve(import.meta.dirname, '../../src/editor')

const sourceFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  if (['vendor', 'locale', 'tests', 'node_modules'].includes(name)) return []
  if (statSync(path).isDirectory()) return sourceFiles(path)
  return /\.(js|ts)$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
})

describe('element-tags.d.ts', () => {
  it('lists every custom element tag the editor defines, and only those', () => {
    const defined = new Set()
    for (const file of sourceFiles(root)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/customElements\.define\('([^']+)'/g)) defined.add(m[1])
    }
    const typed = new Set([...readFileSync(join(root, 'element-tags.d.ts'), 'utf8').matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]))
    expect([...typed].sort()).toEqual([...defined].sort())
  })
})
