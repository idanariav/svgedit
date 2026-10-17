import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.ts'

// AttachedMembers and InternalMembers (svgcanvas-members.d.ts, svgcanvas-internal.d.ts) are hand-written, so nothing
// ties them to the real canvas surface. This test compares the public members of a live SvgCanvas instance with the
// members of the class in svgcanvas.ts plus AttachedMembers.
//
// Every runtime member must be declared either as part of the public API (the
// class + AttachedMembers) or, if deliberately plumbing, on
// InternalMembers (svgcanvas-internal.d.ts, tagged @internal). The two sets must
// not overlap, and InternalMembers must not list names that no longer exist.

const declaredMembers = () => {
  const names = new Set() // AttachedMembers: what core modules attach at runtime, public
  const classNames = new Set() // the class itself
  const internal = new Set()
  const required = new Set() // public members declared without `?`: the runtime must have them
  const read = (file, match, into = names) => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'packages/svgcanvas', file), 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true)
    sf.forEachChild((node) => {
      if (!match(node)) return
      for (const m of node.members) {
        if (!m.name) continue
        if (ts.isClassDeclaration(node) && m.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword)) continue
        const name = m.name.getText(sf).replace(/^['"]|['"]$/g, '')
        into.add(name)
        if (into === names && !m.questionToken && !(ts.isConstructorDeclaration(m))) required.add(name)
      }
    })
  }
  // The class (methods defined in svgcanvas.ts) plus AttachedMembers (members
  // core modules attach at runtime), which the class merges in.
  read('svgcanvas.ts', (n) => ts.isClassDeclaration(n) && n.name?.text === 'SvgCanvas', classNames)
  read('svgcanvas-members.d.ts', (n) => ts.isInterfaceDeclaration(n) && n.name.text === 'AttachedMembers')
  read('svgcanvas-internal.d.ts', (n) => ts.isInterfaceDeclaration(n) && n.name.text === 'InternalMembers', internal)
  // The modules' own interfaces (`type ModuleApis = A & B & …` in svgcanvas.ts): the members each core module gives the canvas.
  const canvasSource = fs.readFileSync(path.resolve(process.cwd(), 'packages/svgcanvas/svgcanvas.ts'), 'utf8')
  const apis = /type ModuleApis =\s*([\s\S]*?)\n\n/.exec(canvasSource)?.[1].split('&').map((n) => n.trim()).filter(Boolean) ?? []
  const coreDir = path.resolve(process.cwd(), 'packages/svgcanvas/core')
  const coreFiles = fs.readdirSync(coreDir).filter((f) => /\.ts$/.test(f) && !f.endsWith('.d.ts'))
  const moduleApiNames = new Set()
  for (const api of apis) {
    const file = coreFiles.find((f) => new RegExp(`export interface ${api}\\b`).test(fs.readFileSync(path.join(coreDir, f), 'utf8')))
    if (!file) throw new Error(`no module exports interface ${api}`)
    read(`core/${file}`, (n) => ts.isInterfaceDeclaration(n) && n.name.text === api, moduleApiNames)
  }
  return { names, classNames, internal, required, moduleApiNames, apis }
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

describe('svgCanvas members drift', () => {
  const { names: declared, classNames, internal, required, moduleApiNames } = declaredMembers()
  const live = liveMembers()

  it('declares the SvgCanvas class and its attached members', () => {
    expect(classNames.size).toBeGreaterThan(50)
    expect(declared.size).toBeGreaterThan(50)
  })

  it('declares every runtime member (on the class, as attached, or as internal plumbing)', () => {
    expect([...live].filter((n) => !classNames.has(n) && !declared.has(n) && !internal.has(n) && !moduleApiNames.has(n)).sort()).toEqual([])
  })

  it('does not list an attached member as both public and internal', () => {
    expect([...internal].filter((n) => declared.has(n))).toEqual([])
  })

  it('declares no required public member that the runtime does not have', () => {
    expect([...required].filter((n) => !n.startsWith('_') && !live.has(n)).sort()).toEqual([])
  })

  it('lists no internal member that no longer exists', () => {
    expect([...internal].filter((n) => !live.has(n))).toEqual([])
  })
})
