#!/usr/bin/env node
// bundle-report.mjs — what is in `dist/editor/Editor.js`, by package and by source folder (R6 in .claude/roadmap/rearchitecture.md).
//
//   node scripts/bundle-report.mjs            print the ranked table
//   node scripts/bundle-report.mjs --json     print the groups as JSON
//   node scripts/bundle-report.mjs --check    fail when the minified bundle is over MAX_MINIFIED_KB (`npm run bundle-size`)
//
// Runs the editor build in memory (nothing is written) and sums rollup's rendered size of every module, which is the size after
// tree-shaking and before minification; the total line also gives the minified bundle, so a group's share of it is the rendered
// share. Groups: `node_modules/<package>`, otherwise the first folders under `src/editor` or `packages/svgcanvas`
// (`extensions/ext-blend`, `core`, `components`…). Pure grouping lives in `groupModules` (unit-tested).
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The size budget of `Editor.js` (minified, KB): about 5% over the 2026-10-16 size of 3249 KB. Raise it deliberately, in the commit that adds the weight. */
export const MAX_MINIFIED_KB = 3400

/**
 * @param {Record<string, number>} modules absolute module id -> rendered bytes
 * @returns {{name: string, bytes: number, files: number}[]} largest first
 */
export function groupModules (modules) {
  /** @type {Map<string, {bytes: number, files: number}>} */
  const groups = new Map()
  for (const [id, bytes] of Object.entries(modules)) {
    const clean = id.replace(/\?.*$/, '').replace(/^\0/, '')
    const virtual = id.startsWith('\0') || !path.isAbsolute(clean)
    const rel = path.relative(ROOT, clean).split(path.sep).join('/')
    const parts = rel.split('/')
    const pkg = /^(?:.*\/)?node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(rel) // the innermost node_modules
    let name
    if (virtual) name = 'virtual / outside the repo'
    else if (pkg) name = `node_modules/${pkg[1]}`
    else if (rel.startsWith('src/editor/extensions/')) name = parts.slice(0, 4).join('/') // one extension (or its shared file)
    else if (rel.startsWith('src/editor/') || rel.startsWith('packages/svgcanvas/')) name = parts.length > 3 ? parts.slice(0, 3).join('/') : `${parts.slice(0, 2).join('/')} (top level)`
    else name = rel.startsWith('..') ? 'virtual / outside the repo' : parts[0]
    const g = groups.get(name) ?? { bytes: 0, files: 0 }
    g.bytes += bytes
    g.files++
    groups.set(name, g)
  }
  return [...groups].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.bytes - a.bytes)
}

async function main () {
  const { build } = await import('vite')
  const out = await build({ configFile: path.join(ROOT, 'vite.config.mjs'), logLevel: 'silent', build: { write: false } })
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output ?? [])
  const chunks = outputs.filter((o) => o.type === 'chunk')
  /** @type {Record<string, number>} */
  const modules = {}
  for (const chunk of chunks) for (const [id, m] of Object.entries(chunk.modules)) modules[id] = (modules[id] ?? 0) + m.renderedLength
  const minified = chunks.reduce((n, c) => n + Buffer.byteLength(c.code), 0)
  const rendered = Object.values(modules).reduce((n, b) => n + b, 0)
  const groups = groupModules(modules)
  if (process.argv.includes('--check')) {
    const kbSize = Math.round(minified / 1024)
    if (kbSize > MAX_MINIFIED_KB) {
      console.error(`bundle-size: Editor.js is ${kbSize} KB minified, over the ${MAX_MINIFIED_KB} KB budget (scripts/bundle-report.mjs); run it without --check to see what grew`)
      process.exit(1)
    }
    console.log(`bundle-size: OK (${kbSize} KB of ${MAX_MINIFIED_KB} KB)`)
    return
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ minified, rendered, groups }, null, 1))
    return
  }
  const kb = (b) => `${(b / 1024).toFixed(0)} KB`.padStart(8)
  console.log(`Editor bundle: ${kb(minified).trim()} minified, ${kb(rendered).trim()} rendered across ${Object.keys(modules).length} modules\n`)
  for (const g of groups.slice(0, 40)) {
    console.log(`${kb(g.bytes)} ${(g.bytes / rendered * 100).toFixed(1).padStart(5)}%  ${String(g.files).padStart(4)} files  ${g.name}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
