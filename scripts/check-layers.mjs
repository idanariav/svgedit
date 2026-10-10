#!/usr/bin/env node
// Keeps the canvas engine (packages/svgcanvas) independent of the editor UI
// (src/editor), the way VectorCraft's `cargo xtask layers` enforces its crate
// layering. The editor depends on the canvas; never the other way round, or
// the canvas can no longer be embedded, tested or published on its own.
//
// Fails on, under packages/svgcanvas/** (comments excluded):
//   - an import/require/dynamic import that resolves into src/editor/**
//   - `window.svgEditor`, `svgEditor.` or a `/* globals svgEditor */` header
//   - `customElements.define` or creating an `se-*` element
//
// The project lints with `standard`, which has no pluggable rules, so this
// grep-based script is the enforcement (same convention as check-dom-scope.mjs).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = process.cwd()
const canvasDir = join(rootDir, 'packages', 'svgcanvas')
const editorDir = join(rootDir, 'src', 'editor')

// path (repo-relative, posix) -> documented reason. Start empty: a layering
// exception needs a reviewed justification here, not a quiet edit.
export const ALLOWLIST = new Map()

const IMPORT_SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/
const EDITOR_GLOBAL = /\bwindow\.svgEditor\b|\bsvgEditor\./
const GLOBALS_HEADER = /^\/\*\s*globals[^*]*\bsvgEditor\b/
const CUSTOM_ELEMENT = /\bcustomElements\.define\s*\(|\b(?:createElement|createElementNS)\s*\(\s*(?:[^,)]+,\s*)?['"]se-[\w-]+['"]/

/**
 * @param {string} relPath repo-relative posix path of the file (for messages and resolving imports)
 * @param {string} source file contents
 * @returns {string[]} one message per violation
 */
export function findLayerViolations (relPath, source) {
  const fileDir = dirname(join(rootDir, relPath))
  const violations = []
  let inBlockComment = false
  source.split('\n').forEach((line, i) => {
    const trimmed = line.trim()
    const where = `${relPath}:${i + 1}: ${trimmed}`
    // `/* globals svgEditor */` is a block comment, so check it before skipping comments.
    if (GLOBALS_HEADER.test(trimmed)) {
      violations.push(where)
      return
    }
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      return
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true
      return
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
    const code = line.replace(/\/\/.*$/, '') // trailing line comment
    const spec = IMPORT_SPEC.exec(code)
    if (spec && spec[1].startsWith('.')) {
      const target = resolve(fileDir, spec[1])
      if (target === editorDir || target.startsWith(editorDir + sep)) violations.push(where)
    } else if (EDITOR_GLOBAL.test(code) || CUSTOM_ELEMENT.test(code)) {
      violations.push(where)
    }
  })
  return violations
}

function walk (dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (/\.(js|mjs|ts)$/.test(entry) && !entry.endsWith('.d.ts')) files.push(full)
  }
  return files
}

function main () {
  const violations = []
  for (const file of walk(canvasDir)) {
    const relPath = relative(rootDir, file).split(sep).join('/')
    if (ALLOWLIST.has(relPath)) continue
    violations.push(...findLayerViolations(relPath, readFileSync(file, 'utf8')))
  }
  if (violations.length > 0) {
    console.error('check-layers: packages/svgcanvas must not depend on the editor UI (src/editor).')
    console.error('Move the code to src/editor, or pass what it needs in through the canvas API / a hook. Violations:\n')
    for (const v of violations) console.error(`  ${v}`)
    process.exit(1)
  }
  console.log('check-layers: OK')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
