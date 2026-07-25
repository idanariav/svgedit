#!/usr/bin/env node
// Guards against the "wrong owning editor" bug class (.claude/techdebt.md,
// "Multi-instance wrong owning editor leaks"): svgedit mounts one editor per
// pane/drawing in the same document, but its chrome uses fixed element ids
// (workarea, fill_color, the se-* dialogs, ...), so a bare
// document.querySelector/getElementById silently resolves to the *first*
// mounted editor instead of the caller's. The project lints with `standard`,
// which has no pluggable rule config, so this cheap grep-based check is the
// enforcement instead: any new bare document.querySelector/getElementById in
// src/editor fails the build unless the file is explicitly allowlisted below.
//
// Fix: resolve through domScope.js instead (closestRoot()/isActiveEditor()/
// getActiveRoot()) or accept a scoped element/id from the caller.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const rootDir = process.cwd()
const editorDir = join(rootDir, 'src', 'editor')

// Files with a documented, reviewed reason to touch the document directly.
const ALLOWLIST = new Set([
  'src/editor/domScope.js', // defines closestRoot()/getActiveRoot() themselves
  'src/editor/EditorStartup.js', // initial container resolution + one-time global <style> injection guard
  'src/editor/contextmenu.js' // documented default-param fallback for standalone/single-editor use (e.g. tests)
])

const BARE_LOOKUP = /\bdocument\.(querySelector|querySelectorAll|getElementById)\(/

function walk (dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, files)
    } else if (entry.endsWith('.js')) {
      files.push(full)
    }
  }
  return files
}

function findViolations () {
  const violations = []
  for (const file of walk(editorDir)) {
    const relPath = relative(rootDir, file).split('\\').join('/')
    if (ALLOWLIST.has(relPath)) continue

    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return // comments/JSDoc
      if (BARE_LOOKUP.test(line)) {
        violations.push(`${relPath}:${i + 1}: ${trimmed}`)
      }
    })
  }
  return violations
}

const violations = findViolations()

if (violations.length > 0) {
  console.error('check-dom-scope: found bare document.querySelector/getElementById calls in src/editor.')
  console.error('These resolve to the first mounted editor when 2+ instances share a document.')
  console.error('Resolve through src/editor/domScope.js instead, or add a reviewed allowlist entry with a reason:\n')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

console.log('check-dom-scope: OK')
