#!/usr/bin/env node
// Generates the code tables of `.claude/file-map.md` from each source file's header comment, and
// checks that every file has one (R7 in .claude/roadmap/rearchitecture.md: docs say what a thing is,
// the file says it first).
//
//   node scripts/file-map.mjs           rewrite the generated block of .claude/file-map.md
//   node scripts/file-map.mjs --check   fail if a file has no header or the map is stale (a pretest gate)
//
// A header is the first comment of the file, before any code: after a shebang, `// @ts-check` and
// `/* eslint … */` / `/* globals … */` lines. Its first paragraph's first sentence is the map entry, so
// write that sentence as "what this file is". A leading `name.js —` is dropped.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAP = path.join(ROOT, '.claude/file-map.md')
const BEGIN = '<!-- file-map:begin -->'
const END = '<!-- file-map:end -->'
const MAX_LEN = 220

/** Roots listed in the map. A file is listed when it is `.js` / `.mjs` / `.ts` (not `.d.ts`) and no segment is in SKIP_DIRS. */
const ROOTS = ['src/editor', 'packages/svgcanvas', 'scripts']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'locale', 'fixtures', 'coverage'])

/** @param {string} text @returns {string|null} the description in the file's header comment, or null */
export function describeFile (text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n')
  let i = 0
  const skippable = /^\s*(#!|\/\/\s*@ts-check|\/\*\s*(eslint|globals?|jshint|istanbul)\b[^]*\*\/\s*$|\/\/\s*(eslint|istanbul)\b)/
  while (i < lines.length && (lines[i].trim() === '' || skippable.test(lines[i]))) i++
  /** @type {string[]} */
  let body = []
  if (/^\s*\/\*/.test(lines[i] ?? '')) {
    for (; i < lines.length; i++) {
      body.push(lines[i])
      if (lines[i].includes('*/')) break
    }
    body = body.map(l => l.replace(/^\s*\/\*+\s?/, '').replace(/\*+\/\s*$/, '').replace(/^\s*\*\s?/, ''))
  } else if (/^\s*\/\//.test(lines[i] ?? '')) {
    for (; i < lines.length && /^\s*\/\//.test(lines[i]); i++) body.push(lines[i].replace(/^\s*\/\/\s?/, ''))
  } else return null
  // paragraph one, up to the first blank line or JSDoc tag
  const para = []
  for (const l of body) {
    if (/^\s*@\w/.test(l) || l.trim() === '') { if (para.length) break; else continue }
    para.push(l.trim())
  }
  if (!para.length) return null
  let s = para.join(' ').replace(/^[\w./-]+\.(?:m?js|ts)\s*(?:—|–|-|:)\s*/, '')
  const m = /^(.+?[.!?])(?=\s+[A-Z`(]|$)/.exec(s)
  if (m) s = m[1]
  s = s.replace(/\s+/g, ' ').replace(/\.$/, '')
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/\s+\S*$/, '') + '…'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** @param {string} dir @returns {string[]} repo-relative source files under dir */
function walk (dir) {
  const out = []
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    const rel = path.posix.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(rel))
    else if (/\.(m?js|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(rel)
  }
  return out
}

export function listFiles () {
  return ROOTS.flatMap(walk).sort((a, b) => {
    // a directory's own files first, then its subdirectories, so the table reads top-down
    const da = path.posix.dirname(a); const db = path.posix.dirname(b)
    return da === db ? a.localeCompare(b) : da.localeCompare(db)
  })
}

/** @returns {{ block: string, missing: string[] }} */
export function build () {
  const missing = []
  const byDir = new Map()
  for (const file of listFiles()) {
    const d = describeFile(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    if (!d) { missing.push(file); continue }
    const dir = path.posix.dirname(file)
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push(`| \`${path.posix.basename(file)}\` | ${d.replace(/\|/g, '\\|')} |`)
  }
  const parts = [BEGIN, '']
  for (const [dir, rows] of byDir) parts.push(`### \`${dir}/\``, '', '| File | What it is |', '|---|---|', ...rows, '')
  parts.push(END)
  return { block: parts.join('\n'), missing }
}

function main () {
  const check = process.argv.includes('--check')
  const { block, missing } = build()
  if (missing.length) {
    console.error(`file-map: ${missing.length} file(s) have no header comment (add a leading comment whose first sentence says what the file is):`)
    for (const f of missing) console.error('  ' + f)
    process.exit(1)
  }
  const doc = fs.readFileSync(MAP, 'utf8')
  const a = doc.indexOf(BEGIN); const b = doc.indexOf(END)
  if (a < 0 || b < 0) { console.error('file-map: markers missing from .claude/file-map.md'); process.exit(1) }
  const next = doc.slice(0, a) + block + doc.slice(b + END.length)
  if (check) {
    if (next !== doc) { console.error('file-map: .claude/file-map.md is stale; run `npm run file-map`'); process.exit(1) }
    console.log('file-map: OK')
  } else {
    fs.writeFileSync(MAP, next)
    console.log(`file-map: wrote ${block.split('\n').length} lines`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
