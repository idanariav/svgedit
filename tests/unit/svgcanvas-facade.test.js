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

// Waiting for the conversion of the module that owns the type (see the header of svgcanvas-internal.d.ts), or for R1
// to delete it (`history`).
const UNTYPED = {
  'packages/svgcanvas/svgcanvas-internal.d.ts': [
    'PathClass', 'SegmentClass', 'getPath_', 'setPathObj',
    'getGripPt', 'getPointFromGrip', 'getDrawnPath', 'setDrawnPath'
  ],
  'packages/svgcanvas/svgcanvas-members.d.ts': ['getPathObj', 'history']
}

describe('svgCanvas facade', () => {
  it('no member is typed any except the listed ones', () => {
    const anyMembers = (file) => {
      const text = read(file)
      const body = text.slice(text.indexOf('export interface ' + (file.includes('internal') ? 'InternalMembers' : 'AttachedMembers')))
      return body.split('\n')
        .filter((line) => /^ {2}[A-Za-z_$]/.test(line) && /(:|\)) ?any\b|any\[\]/.test(line))
        .map((line) => /^ {2}([A-Za-z_$][\w$]*)/.exec(line)[1])
    }
    for (const [file, expected] of Object.entries(UNTYPED)) {
      expect(anyMembers(file).sort(), file).toEqual([...expected].sort())
    }
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
