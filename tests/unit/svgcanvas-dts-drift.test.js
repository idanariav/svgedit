import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// packages/svgcanvas/svgcanvas.d.ts is hand-written, so nothing ties it to the
// real canvas surface. This test compares the public members of a live
// SvgCanvas instance with the members declared on the d.ts class and on
// AttachedMembers (svgcanvas-members.d.ts).
//
// INTERNAL_MEMBERS (svgcanvas-internal-members.json) lists the canvas members
// that are deliberately NOT part of the typed public API: internal state
// accessors and module plumbing that core/* modules attach to the instance
// (nothing in the editor or extensions calls them). A new public member must
// either be declared in the .d.ts or, if it is internal, be added to that list;
// a listed member that has since been declared fails too (delete it from the
// list), so the two sets never overlap.
const INTERNAL_MEMBERS = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'tests/unit/svgcanvas-internal-members.json'), 'utf8')
)

const declaredMembers = () => {
  const names = new Set()
  const read = (file, match) => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'packages/svgcanvas', file), 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true)
    sf.forEachChild((node) => {
      if (!match(node)) return
      for (const m of node.members) if (m.name) names.add(m.name.getText(sf))
    })
  }
  // The class (methods defined in svgcanvas.js) plus AttachedMembers (members
  // core modules attach at runtime), which the class merges in.
  read('svgcanvas.d.ts', (n) => ts.isClassDeclaration(n) && n.name?.text === 'SvgCanvas')
  read('svgcanvas-members.d.ts', (n) => ts.isInterfaceDeclaration(n) && n.name.text === 'AttachedMembers')
  return names
}

const liveMembers = () => {
  document.body.textContent = ''
  const container = document.createElement('div')
  container.id = 'svgcanvas'
  document.body.append(container)
  const canvas = new SvgCanvas(container, {
    canvas_expansion: 3,
    dimensions: [640, 480],
    initFill: { color: 'FF0000', opacity: 1 },
    initStroke: { width: 5, color: '000000', opacity: 1 },
    initOpacity: 1,
    imgPath: '../editor/images',
    langPath: 'locale/',
    extPath: 'extensions/',
    extensions: [],
    initTool: 'select',
    wireframe: false
  })
  const names = new Set(Object.keys(canvas))
  for (let p = Object.getPrototypeOf(canvas); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    Object.getOwnPropertyNames(p).forEach((n) => names.add(n))
  }
  names.delete('constructor')
  Object.getOwnPropertyNames(Object.prototype).forEach((n) => names.delete(n))
  // underscore-prefixed members are internal by convention
  return new Set([...names].filter((n) => !n.startsWith('_')))
}

describe('svgcanvas.d.ts drift', () => {
  const declared = declaredMembers()
  const live = liveMembers()
  const missing = [...live].filter((n) => !declared.has(n)).sort()

  it('declares the SvgCanvas class', () => {
    expect(declared.size).toBeGreaterThan(50)
  })

  it('has no undeclared public members that are not marked internal', () => {
    expect(missing.filter((n) => !INTERNAL_MEMBERS.includes(n))).toEqual([])
  })

  it('has no internal-member entries that are declared or gone', () => {
    expect(INTERNAL_MEMBERS.filter((n) => !missing.includes(n))).toEqual([])
  })
})
