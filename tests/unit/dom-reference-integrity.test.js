import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression guard for the bug class documented in .claude/techdebt.md #4:
// panel/extension JS files reference DOM ids and classes that are physically
// defined in a *different* file (a Panel.html template, another extension,
// or the svgcanvas engine) via plain string literals -- nothing ties the two
// sides together, so a rename/removal on one side silently breaks the other
// (see 26b91862, and the ext-mirror/ext-motion-lines tool_repeat* coupling).
// This test parses every id/class *definition* under src/editor (+ the
// svgcanvas engine, which creates a few ids extensions legitimately look up)
// and asserts every `$id('literal')` / `.hideTool('literal')` /
// `.displayTool('literal')` reference -- including the id-array-plus-forEach
// shape that caused 26b91862 -- resolves against that set.
//
// Scope, deliberately: only plain string-literal references are checked.
// Anything built at runtime (template literals, concatenation, ids read from
// a variable/attribute) can't be verified statically and is skipped rather
// than guessed at.

const here = dirname(fileURLToPath(import.meta.url))
const EDITOR_ROOT = join(here, '../../src/editor')
const SVGCANVAS_ROOT = join(here, '../../packages/svgcanvas')

function walk (dir, exts) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'dist' || entry === 'node_modules') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full, exts))
    else if (exts.includes(extname(entry))) out.push(full)
  }
  return out
}

const editorHtmlFiles = walk(EDITOR_ROOT, ['.html'])
const editorJsFiles = walk(EDITOR_ROOT, ['.js'])
  .filter((f) => !f.includes(`${join('src', 'editor', 'tests')}`) && !f.endsWith('.test.js'))
// svgcanvas is the engine editor panels/extensions sit on top of: it creates
// a handful of DOM nodes (canvasBackground, ...) that extensions legitimately
// look up by id. Only used to seed the known-id/class set below -- its own
// outgoing references are out of scope for this sweep.
const svgcanvasJsFiles = walk(SVGCANVAS_ROOT, ['.js']).filter((f) => !f.endsWith('.test.js'))

const knownIds = new Set()
const knownClasses = new Set()
const addClasses = (str) => str.split(/\s+/).filter(Boolean).forEach((c) => knownClasses.add(c))

for (const file of [...editorHtmlFiles, ...editorJsFiles, ...svgcanvasJsFiles]) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\bid="([\w-]+)"/g)) knownIds.add(m[1])
  for (const m of text.matchAll(/\bclass="([^"]+)"/g)) addClasses(m[1])
}

for (const file of [...editorJsFiles, ...svgcanvasJsFiles]) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)) knownIds.add(m[1])
  for (const m of text.matchAll(/setAttribute\(\s*['"]id['"]\s*,\s*['"]([\w-]+)['"]\s*\)/g)) knownIds.add(m[1])
  for (const m of text.matchAll(/setAttribute\(\s*['"]class['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g)) addClasses(m[1])
  for (const m of text.matchAll(/classList\.(?:add|toggle|remove)\(\s*['"]([\w-]+)['"]/g)) knownClasses.add(m[1])
  for (const m of text.matchAll(/className\s*=\s*['"]([^'"]+)['"]/g)) addClasses(m[1])
  for (const m of text.matchAll(/\bid:\s*['"]([\w-]+)['"]/g)) knownIds.add(m[1])

  // Local id-factory helpers, e.g. ext-mirror's
  // `const addBtn = (id, ...) => { ... btn.id = id ... }` followed by call
  // sites `addBtn('tool_mirror_copy', ...)`. Generalizes the direct-literal
  // case above to one level of indirection through a same-file helper.
  const factoryRe = /(?:const|let)\s+(\w+)\s*=\s*\(\s*(\w+)\s*[,)][\s\S]*?=>\s*\{([\s\S]*?)\n\s*\}/g
  for (const m of text.matchAll(factoryRe)) {
    const [, fnName, param, body] = m
    if (!new RegExp(`\\.id\\s*=\\s*${param}\\b`).test(body)) continue
    const callRe = new RegExp(`\\b${fnName}\\(\\s*['"]([\\w-]+)['"]`, 'g')
    for (const c of text.matchAll(callRe)) knownIds.add(c[1])
  }
}

// ---- referenced side: src/editor only (svgcanvas is a known-id source, not checked) ----

const idRefs = []
const classRefs = []

function findArrayLiteral (text, varName) {
  const m = text.match(new RegExp(`(?:const|let)\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*\\n`))
  return m ? m[1] : null
}

function stringLiteralsIn (literal) {
  return [...literal.matchAll(/['"]([\w.-]+)['"]/g)].map((m) => m[1])
}

for (const file of editorJsFiles) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(EDITOR_ROOT, file)

  for (const m of text.matchAll(/\$id\(\s*['"]([\w.-]+)['"]\s*\)/g)) {
    idRefs.push({ id: m[1], file: rel })
  }
  for (const m of text.matchAll(/\.(?:hideTool|displayTool)\(\s*['"]([\w.-]+)['"]\s*\)/g)) {
    classRefs.push({ cls: m[1], file: rel })
  }

  // The 26b91862 shape: `SOME_ARRAY.forEach(item => ...$id(item)/hideTool(item)...)`,
  // block or single-expression body. Every string in SOME_ARRAY's own literal
  // must resolve, since it's the array itself that drifted out of sync there.
  const forEachRes = [
    /(\w+)\.forEach\(\s*\(?(\w+)\)?\s*=>\s*\{([\s\S]*?)\n\s*\}\)/g,
    /(\w+)\.forEach\(\s*\(?(\w+)\)?\s*=>\s*([^{\n][^\n]*)\)/g
  ]
  for (const re of forEachRes) {
    for (const m of text.matchAll(re)) {
      const [, arrName, loopVar, body] = m
      const idHit = new RegExp(`\\$id\\(\\s*${loopVar}\\s*\\)`).test(body)
      const clsHit = new RegExp(`\\.(?:hideTool|displayTool)\\(\\s*${loopVar}\\s*\\)`).test(body)
      if (!idHit && !clsHit) continue
      const lit = findArrayLiteral(text, arrName)
      if (!lit) continue
      for (const s of stringLiteralsIn(lit)) {
        if (idHit) idRefs.push({ id: s, file: rel, via: arrName })
        if (clsHit) classRefs.push({ cls: s, file: rel, via: arrName })
      }
    }
  }
}

describe('DOM id/class referential integrity (src/editor)', () => {
  it('every $id(...) literal (direct or via a forEach id-array) resolves to a real id', () => {
    const missing = idRefs.filter((r) => !knownIds.has(r.id))
    const report = missing.map((r) => `${r.file} -> "${r.id}"${r.via ? ` (via ${r.via})` : ''}`)
    expect(report).toEqual([])
  })

  it('every hideTool/displayTool(...) literal (direct or via a forEach class-array) resolves to a real class', () => {
    const missing = classRefs.filter((r) => !knownClasses.has(r.cls))
    const report = missing.map((r) => `${r.file} -> "${r.cls}"${r.via ? ` (via ${r.via})` : ''}`)
    expect(report).toEqual([])
  })
})
