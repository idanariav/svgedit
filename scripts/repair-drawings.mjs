#!/usr/bin/env node
/**
 * One-off repair of already-saved drawings: rewrites the .svg files themselves,
 * so the editor never has to carry a load-time sanitizer for old corruption.
 *
 *   node scripts/repair-drawings.mjs <file-or-dir>...          # dry run: lists what would change
 *   node scripts/repair-drawings.mjs --write <file-or-dir>...  # rewrite the files in place
 *
 * Handles plain `.svg` files and the Obsidian plugin's `.md` drawings (the ```svg
 * / ```compressed-svg block, and the saved "## Versions" snapshots).
 *
 * Each repair is a narrow text rewrite (the rest of the file is left byte-for-byte
 * as it was). When a repair has been run over every drawing you care about, delete
 * it from REPAIRS — this list is meant to shrink, not grow forever (it is empty now).
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import LZString from 'lz-string'

/**
 * Each entry is `{ name, run(source) => source }`, a narrow text rewrite of one SVG. Empty
 * on purpose: the earlier ones (NaN tspans, `undefined` text in <defs>, stacked translate())
 * ran over the vault on 2026-10-10 and were deleted; `git log -- scripts/repair-drawings.mjs`
 * has them as templates.
 * @typedef {{name: string, run: (source: string) => string}} Repair
 * @type {Repair[]}
 */
export const REPAIRS = []

/**
 * @param {string} source
 * @param {Repair[]} [repairs]
 * @returns {{source: string, applied: string[]}}
 */
export const repairSvg = (source, repairs = REPAIRS) => {
  const applied = []
  let out = source
  for (const { name, run } of repairs) {
    const next = run(out)
    if (next !== out) applied.push(name)
    out = next
  }
  return { source: out, applied }
}

const BASE64_LINE_WIDTH = 76
const chunk = (text) => text.match(new RegExp(`.{1,${BASE64_LINE_WIDTH}}`, 'g'))?.join('\n') ?? ''
const fromBase64 = (payload) => LZString.decompressFromBase64(payload.replace(/\s+/g, ''))

/**
 * Repair the drawing data inside an Obsidian plugin note: the ```svg or
 * ```compressed-svg block and the "## Versions" snapshots. Everything else in the
 * note is left byte-for-byte.
 * @param {string} content
 * @param {Repair[]} [repairs]
 * @returns {{source: string, applied: string[]}}
 */
export const repairMarkdown = (content, repairs = REPAIRS) => {
  const applied = new Set()
  const note = (list) => list.forEach((n) => applied.add(n))
  const repairSnapshots = (json) => {
    let list
    try { list = JSON.parse(json) } catch { return json }
    if (!Array.isArray(list)) return json
    let changed = false
    for (const snap of list) {
      if (typeof snap?.svg !== 'string') continue
      const r = repairSvg(snap.svg, repairs)
      if (r.applied.length) { snap.svg = r.source; note(r.applied); changed = true }
    }
    return changed ? JSON.stringify(list) : json
  }
  const source = content.replace(/^(```(compressed-)?(svg|versions-json)\r?\n)([\s\S]*?)(\r?\n```)/gm,
    (all, open, compressed, kind, body, close) => {
      const isSvg = kind === 'svg'
      const raw = compressed ? fromBase64(body) : body
      if (!raw) return all
      let fixed
      if (isSvg) {
        const r = repairSvg(raw, repairs)
        note(r.applied)
        fixed = r.source
      } else {
        fixed = repairSnapshots(raw)
      }
      if (fixed === raw) return all
      return open + (compressed ? chunk(LZString.compressToBase64(fixed)) : fixed) + close
    })
  return { source, applied: [...applied] }
}

const repairFile = (file, text) => (file.endsWith('.md') ? repairMarkdown(text) : repairSvg(text))

const walk = async function * (target) {
  const info = await stat(target)
  if (!info.isDirectory()) {
    if (target.endsWith('.svg') || target.endsWith('.md')) yield target
    return
  }
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    yield * walk(join(target, entry.name))
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const targets = args.filter((a) => a !== '--write')
  if (!targets.length) {
    console.error('usage: repair-drawings.mjs [--write] <file-or-dir>...')
    process.exit(2)
  }
  let changed = 0
  let scanned = 0
  for (const target of targets) {
    for await (const file of walk(target)) {
      scanned++
      const before = await readFile(file, 'utf8')
      const { source, applied } = repairFile(file, before)
      if (!applied.length) continue
      changed++
      console.log(`${write ? 'repaired' : 'would repair'} ${file}: ${applied.join(', ')}`)
      if (write) await writeFile(file, source)
    }
  }
  console.log(`${scanned} files scanned, ${changed} ${write ? 'repaired' : 'need repair (re-run with --write)'}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
