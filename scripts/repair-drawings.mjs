#!/usr/bin/env node
/**
 * One-off repair of already-saved drawings: rewrites the .svg files themselves,
 * so the editor never has to carry a load-time sanitizer for old corruption.
 *
 *   node scripts/repair-drawings.mjs <file-or-dir>...          # dry run: lists what would change
 *   node scripts/repair-drawings.mjs --write <file-or-dir>...  # rewrite the files in place
 *
 * Each repair is a narrow text rewrite (the rest of the file is left byte-for-byte
 * as it was). When a repair has been run over every drawing you care about, delete
 * it from REPAIRS — this list is meant to shrink, not grow forever.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

export const REPAIRS = [
  { name: 'NaN tspan coordinates', run: repairNaNTspans }
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

const walk = async function * (target) {
  const info = await stat(target)
  if (!info.isDirectory()) {
    if (target.endsWith('.svg')) yield target
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
      const { source, applied } = repairSvg(before)
      if (!applied.length) continue
      changed++
      console.log(`${write ? 'repaired' : 'would repair'} ${file}: ${applied.join(', ')}`)
      if (write) await writeFile(file, source)
    }
  }
  console.log(`${scanned} drawings scanned, ${changed} ${write ? 'repaired' : 'need repair (re-run with --write)'}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
