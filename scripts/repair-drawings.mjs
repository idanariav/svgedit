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
 * it from REPAIRS — this list is meant to shrink, not grow forever.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import LZString from 'lz-string'

const NON_NUMBER = '(?:[^"]*\\b)?(?:NaN|undefined|Infinity)\\b[^"]*'

/**
 * Undo/redo of any attribute change on a <text> with tspans used to write
 * x="NaN" y="NaN" into the tspans (fixed in undo.js). The real positions are
 * gone, so drop the bad coordinates and let each tspan inherit from its <text>.
 * @param {string} source
 * @returns {string}
 */
export const repairNaNTspans = (source) =>
  source.replace(/<tspan\b[^>]*>/g, (tag) =>
    tag.replace(new RegExp(`\\s(?:x|y|dx|dy)="${NON_NUMBER}"`, 'g'), '')
  )

/**
 * Element.append(undefined) used to insert a literal "undefined" text node into
 * <defs> (the old `sanitizeLegacyUndefinedDefs`, removed from the editor). Drops
 * text children of <defs> that are nothing but "undefined"; every other text is untouched.
 * @param {string} source
 * @returns {string}
 */
export const repairUndefinedDefs = (source) =>
  source.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/g, (defs) =>
    defs.replace(/(<defs\b[^>]*>|<\/[\w:.-]+>|<[^<>]*\/>)(?:undefined)+(?=<)/g, '$1')
  )

// Six significant digits, which is what the editor itself writes (SVG lists hold float32).
const num = (v) => String(+v.toPrecision(6))

/**
 * Nudging a group / clipped element used to append one more raw translate() to its
 * transform every time (the old `sanitizeStackedTranslateTransforms`, removed from the
 * editor). Merges each run of 2+ consecutive translate() items into one; a run broken
 * by rotate/scale/matrix is left alone.
 * @param {string} source
 * @returns {string}
 */
export const repairStackedTranslates = (source) =>
  source.replace(/(\stransform=")([^"]*)(")/g, (all, open, value, close) => {
    const items = [...value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)]
    const out = []
    let changed = false
    let last = 0
    for (let i = 0; i < items.length;) {
      if (items[i][1] !== 'translate') { i++; continue }
      let j = i
      let tx = 0
      let ty = 0
      while (j < items.length && items[j][1] === 'translate' && (j === i || /^\s*$/.test(value.slice(items[j - 1].index + items[j - 1][0].length, items[j].index).replace(/,/g, '')))) {
        const [x, y = '0'] = items[j][2].split(/[\s,]+/).filter(Boolean)
        tx += parseFloat(x)
        ty += parseFloat(y)
        j++
      }
      if (j - i > 1 && Number.isFinite(tx) && Number.isFinite(ty)) {
        out.push(value.slice(last, items[i].index), `translate(${num(tx)} ${num(ty)})`)
        last = items[j - 1].index + items[j - 1][0].length
        changed = true
      }
      i = j
    }
    if (!changed) return all
    out.push(value.slice(last))
    return open + out.join('') + close
  })

export const REPAIRS = [
  { name: 'NaN tspan coordinates', run: repairNaNTspans },
  { name: 'undefined text in <defs>', run: repairUndefinedDefs },
  { name: 'stacked translate() transforms', run: repairStackedTranslates }
]

/**
 * @param {string} source
 * @returns {{source: string, applied: string[]}}
 */
export const repairSvg = (source) => {
  const applied = []
  let out = source
  for (const { name, run } of REPAIRS) {
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
 * @returns {{source: string, applied: string[]}}
 */
export const repairMarkdown = (content) => {
  const applied = new Set()
  const note = (list) => list.forEach((n) => applied.add(n))
  const repairSnapshots = (json) => {
    let list
    try { list = JSON.parse(json) } catch { return json }
    if (!Array.isArray(list)) return json
    let changed = false
    for (const snap of list) {
      if (typeof snap?.svg !== 'string') continue
      const r = repairSvg(snap.svg)
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
        const r = repairSvg(raw)
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
