import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The canvas's surface is its class (svgcanvas.ts) plus the interfaces the core modules export (`type ModuleApis`). Nothing is
// typed `any`: ESLint forbids it in .ts files, and this keeps a `// eslint-disable` from slipping one into the canvas class.

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

describe('svgCanvas facade', () => {
  it('has no member typed any', () => {
    const offenders = read('packages/svgcanvas/svgcanvas.ts').split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /(:|=>|<) ?any\b|any\[\]/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
    expect(offenders.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([])
  })

  it('has no hand-written declaration files left for its members', () => {
    expect(fs.existsSync(path.join(root, 'packages/svgcanvas/svgcanvas-members.d.ts'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'packages/svgcanvas/svgcanvas-internal.d.ts'))).toBe(false)
  })

  it('wires every module API through attachApi', () => {
    const text = read('packages/svgcanvas/svgcanvas.ts')
    expect(text).not.toMatch(/runGuardedInit/)
    const apis = /type ModuleApis =\s*([\s\S]*?)\n\n/.exec(text)?.[1].split('&').map((n) => n.trim()).filter(Boolean) ?? []
    expect(apis.length).toBeGreaterThan(20)
  })
})
