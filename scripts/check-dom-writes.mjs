#!/usr/bin/env node
// A ratchet on the live-DOM writes of the canvas engine and the extensions (R1 step e: the document model is the source of
// truth, the DOM is a view the renderer writes). It counts calls that change the tree or its attributes
// (`setAttribute`, `removeAttribute`, `append`, `appendChild`, `insertBefore`, `.remove()`, `replaceChildren`, …) per file
// under packages/svgcanvas/core and src/editor/extensions (comments excluded) and compares them with
// scripts/dom-writes-baseline.json. A file may write less than its baseline, never more, and a file with no entry may not
// write at all: new code states changes on the model (`snapshotHistory.edit`, `insertElementFromJson`, the `{ create }`
// result of a registered tool) instead. `--update` rewrites the baseline after a port brought a count down.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const rootDir = process.cwd()
const BASELINE = join(rootDir, 'scripts', 'dom-writes-baseline.json')
const ROOTS = [join(rootDir, 'packages', 'svgcanvas', 'core'), join(rootDir, 'src', 'editor', 'extensions')]
// The renderer and the model's own seams are the places allowed to write
const EXEMPT = new Set(['packages/svgcanvas/core/model-render.ts', 'packages/svgcanvas/core/snapshot-history.ts'])
const WRITE = /\.(?:setAttribute|setAttributeNS|removeAttribute|removeAttributeNS|append|appendChild|prepend|insertBefore|insertAdjacentElement|removeChild|replaceChild|replaceWith|replaceChildren|before|after)\s*\(|\.remove\s*\(\s*\)/g

/** Count the DOM-writing calls in a source text, comments excluded. */
export const countWrites = (source) => {
  let count = 0
  let inBlock = false
  for (const raw of source.split('\n')) {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) continue
      line = line.slice(end + 2)
      inBlock = false
    }
    line = line.replace(/\/\*.*?\*\//g, '')
    const open = line.indexOf('/*')
    if (open >= 0) { line = line.slice(0, open); inBlock = true }
    line = line.replace(/\/\/.*$/, '')
    count += (line.match(WRITE) ?? []).length
  }
  return count
}

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name)
  if (statSync(full).isDirectory()) return files(full)
  return /\.(ts|js)$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : []
})

const scan = () => {
  const out = {}
  for (const root of ROOTS) {
    for (const file of files(root)) {
      const rel = relative(rootDir, file).split(sep).join('/')
      if (EXEMPT.has(rel)) continue
      const n = countWrites(readFileSync(file, 'utf8'))
      if (n) out[rel] = n
    }
  }
  return out
}

if (process.argv[1]?.endsWith('check-dom-writes.mjs')) {
  const now = scan()
  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(Object.entries(now).sort()), null, 2) + '\n')
    console.log(`dom-writes baseline: ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} writes`)
  } else {
    const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
    const bad = Object.entries(now).filter(([f, n]) => n > (base[f] ?? 0)).map(([f, n]) => `${f}: ${n} DOM writes, baseline ${base[f] ?? 0}`)
    if (bad.length) {
      console.error('check-dom-writes: more live-DOM writes than the baseline (state the change on the model instead, see .claude/architecture.md "Writing through the model"):\n  ' + bad.join('\n  '))
      process.exit(1)
    }
    const total = Object.values(now).reduce((a, b) => a + b, 0)
    console.log(`check-dom-writes: ${total} writes in ${Object.keys(now).length} files, none over its baseline`)
  }
}
