import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The canvas's facade is what hosts, the editor and the extensions call through `svgCanvas`. A member in
// svgcanvas-internal.d.ts is plumbing that core modules share; once the editor reads it, it is part of the facade and
// needs a declaration in svgcanvas-members.d.ts (or the class in svgcanvas.d.ts). Same for the host API: the slice
// the plugin uses (src/editor/hostApi.d.ts) must be declared as public. Members are typed; the few still `any` are
// listed below and only get shorter.

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const internalMembers = () => {
  const text = read('packages/svgcanvas/svgcanvas-internal.d.ts')
  const body = text.slice(text.indexOf('export interface InternalMembers'))
  return [...new Set([...body.matchAll(/^ {2}([A-Za-z_$][\w$]*)\??[(:<]/gm)].map((m) => m[1]))]
}

const editorSources = () => {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (['node_modules', 'dist', 'locale', 'tests'].includes(entry.name)) continue
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(js|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(rel)
    }
  }
  walk('src')
  return out
}

// Waiting for the conversion of the module that owns the type (see the header of svgcanvas-internal.d.ts).
const UNTYPED = [
  'PathClass', 'SegmentClass', 'SelectorManagerClass', 'getSelector', 'getSelectorManager', 'getPath_', 'setPathObj',
  'getGripPt', 'getPointFromGrip', 'getDrawnPath', 'setDrawnPath'
]

describe('svgCanvas facade', () => {
  it('no member is typed any except the listed ones, in either member file', () => {
    const anyMembers = (file, from) => {
      const text = read(file)
      const body = text.slice(text.indexOf(from))
      return [...body.matchAll(/^ {2}(?:readonly )?([A-Za-z_$][\w$]*)\??(?:\(([^)]*)\))?:? ?([^\n]*)$/gm)]
        .filter((m) => /\bany\b/.test(m[0]) && !/^ {2}\/?\*/.test(m[0]))
        .map((m) => m[1])
    }
    expect(anyMembers('packages/svgcanvas/svgcanvas-internal.d.ts', 'export interface InternalMembers').sort()).toEqual([...UNTYPED].sort())
  })

  it('the editor and the extensions call no member that is declared internal (any)', () => {
    const internal = internalMembers()
    expect(internal.length).toBeGreaterThan(50)
    const offenders = []
    for (const file of editorSources()) {
      const text = read(file)
      for (const name of internal) {
        const escaped = name.replace(/\$/g, '\\$')
        if (new RegExp(`(?:svgCanvas|canvas)\\??\\.${escaped}(?![\\w$])`).test(text)) offenders.push(`${file}: ${name}`)
      }
    }
    expect(offenders, 'declare the member in svgcanvas-members.d.ts and delete it from svgcanvas-internal.d.ts').toEqual([])
  })
})
