import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.ts'

// The canvas's surface is declared in two places only: the class in svgcanvas.ts (methods and `declare`d fields) and the
// interfaces the core modules export and svgcanvas.ts lists in `type ModuleApis`. This test compares a live SvgCanvas instance
// with them: every runtime member must be declared, and every member declared without `?` must exist at runtime.

const declaredMembers = () => {
  const classNames = new Set() // the class itself
  const moduleApiNames = new Set() // what the core modules give the canvas
  const required = new Set() // declared without `?`: the runtime must have them
  const read = (file, match, into, requireThem) => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'packages/svgcanvas', file), 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true)
    sf.forEachChild((node) => {
      if (!match(node)) return
      for (const m of node.members) {
        if (!m.name || ts.isConstructorDeclaration(m)) continue
        if (ts.isClassDeclaration(node) && m.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword)) continue
        const name = m.name.getText(sf).replace(/^['"]|['"]$/g, '')
        into.add(name)
        if (requireThem && !m.questionToken) required.add(name)
      }
    })
  }
  read('svgcanvas.ts', (n) => ts.isClassDeclaration(n) && n.name?.text === 'SvgCanvas', classNames, true)
  // `type ModuleApis = A & B & …` in svgcanvas.ts
  const canvasSource = fs.readFileSync(path.resolve(process.cwd(), 'packages/svgcanvas/svgcanvas.ts'), 'utf8')
  const apis = /type ModuleApis =\s*([\s\S]*?)\n\n/.exec(canvasSource)?.[1].split('&').map((n) => n.trim()).filter(Boolean) ?? []
  const coreDir = path.resolve(process.cwd(), 'packages/svgcanvas/core')
  const coreFiles = fs.readdirSync(coreDir).filter((f) => /\.ts$/.test(f) && !f.endsWith('.d.ts'))
  for (const api of apis) {
    const file = coreFiles.find((f) => new RegExp(`export interface ${api}\\b`).test(fs.readFileSync(path.join(coreDir, f), 'utf8')))
    if (!file) throw new Error(`no module exports interface ${api}`)
    read(`core/${file}`, (n) => ts.isInterfaceDeclaration(n) && n.name.text === api, moduleApiNames, true)
  }
  return { classNames, moduleApiNames, required, apis }
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
  Object.getOwnPropertyNames(EventTarget.prototype).forEach((n) => names.delete(n)) // inherited from EventTarget
  Object.getOwnPropertyNames(Object.prototype).forEach((n) => names.delete(n))
  // underscore-prefixed members are internal by convention
  return new Set([...names].filter((n) => !n.startsWith('_')))
}

describe('svgCanvas members', () => {
  const { classNames, moduleApiNames, required, apis } = declaredMembers()
  const live = liveMembers()

  it('reads the class and the module interfaces', () => {
    expect(classNames.size).toBeGreaterThan(100)
    expect(apis.length).toBeGreaterThan(20)
    expect(moduleApiNames.size).toBeGreaterThan(100)
  })

  it('declares every runtime member (on the class or in a module interface)', () => {
    expect([...live].filter((n) => !classNames.has(n) && !moduleApiNames.has(n)).sort()).toEqual([])
  })

  it('declares no required member that the runtime does not have', () => {
    expect([...required].filter((n) => !n.startsWith('_') && !live.has(n)).sort()).toEqual([])
  })

  it('declares no member on both the class and a module interface', () => {
    expect([...classNames].filter((n) => moduleApiNames.has(n)).sort()).toEqual([])
  })
})
