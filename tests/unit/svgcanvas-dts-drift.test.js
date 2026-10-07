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
// Every runtime member must be declared either as part of the public API (the
// d.ts class + AttachedMembers) or, if deliberately untyped plumbing, on
// InternalMembers (svgcanvas-internal.d.ts, tagged @internal). The two sets must
// not overlap, and InternalMembers must not list names that no longer exist.

const declaredMembers = () => {
  const names = new Set()
  const internal = new Set()
  const read = (file, match, into = names) => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'packages/svgcanvas', file), 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true)
    sf.forEachChild((node) => {
      if (!match(node)) return
      for (const m of node.members) if (m.name) into.add(m.name.getText(sf).replace(/^['"]|['"]$/g, ''))
    })
  }
  // The class (methods defined in svgcanvas.js) plus AttachedMembers (members
  // core modules attach at runtime), which the class merges in.
  read('svgcanvas.d.ts', (n) => ts.isClassDeclaration(n) && n.name?.text === 'SvgCanvas')
  read('svgcanvas-members.d.ts', (n) => ts.isInterfaceDeclaration(n) && n.name.text === 'AttachedMembers')
  read('svgcanvas-internal.d.ts', (n) => ts.isInterfaceDeclaration(n) && n.name.text === 'InternalMembers', internal)
  return { names, internal }
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
  const { names: declared, internal } = declaredMembers()
  const live = liveMembers()

  it('declares the SvgCanvas class', () => {
    expect(declared.size).toBeGreaterThan(50)
  })

  it('declares every runtime member as public or internal', () => {
    expect([...live].filter((n) => !declared.has(n) && !internal.has(n)).sort()).toEqual([])
  })

  it('does not list a member as both public and internal', () => {
    expect([...internal].filter((n) => declared.has(n))).toEqual([])
  })

  it('lists no internal member that no longer exists', () => {
    expect([...internal].filter((n) => !live.has(n))).toEqual([])
  })
})
