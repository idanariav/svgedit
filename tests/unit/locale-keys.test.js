import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import en from '../../src/editor/locale/lang.en.js'

const ROOT = join(__dirname, '../../src/editor')

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  if (p.includes(`${join('src', 'editor', 'locale')}`)) return []
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : [])
})

const has = (key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), en) !== undefined

// Literal keys passed to t('ns.key') / _t('ns.key'), where ns is a real top-level section
const NAMESPACES = Object.keys(en).filter((k) => typeof en[k] === 'object')
const CALL = new RegExp(`\\b_?t\\(\\s*['"]((?:${NAMESPACES.join('|')})\\.[A-Za-z0-9_.]*[A-Za-z0-9])['"]`, 'g')

describe('locale keys', () => {
  it('every literal t() key used in the source exists in lang.en.js', () => {
    const missing = []
    for (const file of walk(ROOT)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(CALL)) {
        if (!has(m[1])) missing.push(`${file.replace(ROOT, '')}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})
