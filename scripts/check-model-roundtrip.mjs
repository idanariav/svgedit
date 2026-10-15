#!/usr/bin/env node
/**
 * Oracle for the document model (R1): parse every saved drawing into the model and serialize it back.
 *
 *   node scripts/check-model-roundtrip.mjs [--typed] [--verbose] <file-or-dir>...
 *
 * Reads `.svg` files and the plugin's `.md` drawings (the ```svg / ```compressed-svg block and the saved versions).
 * Read-only. Each drawing is one of:
 *   identical  the model writes the saved text back byte for byte
 *   respelled  the written text differs only in spelling (entities, quotes, spacing inside a tag, `<x></x>`): it parses
 *              back to the same tree, so nothing is lost (typical of drawings from other tools)
 *   lossy      the written text parses to a different tree: a model bug
 *   parse-error / unreadable (`--typed`: `readDrawing` throws)
 * `--verbose` also lists the respelled ones. With `--typed` it also lists typed `se:` features that do not parse (the
 * editor's `se-attr-parse` finding) and counts them; they do not fail the run. Exit code 1 for lossy, parse-error and
 * unreadable.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drawingsIn } from './repair-drawings.mjs'
import * as model from '../packages/svgcanvas/core/model/index.js'

const { parseSvg, serializeSvg } = model

/**
 * @param {string} svg
 * @param {{typed?: boolean}} [options]
 * @returns {{status: 'identical' | 'respelled' | 'lossy' | 'parse-error' | 'unreadable', detail?: string, invalid?: string[]}}
 */
export const checkDrawingText = (svg, { typed = false } = {}) => {
  let doc
  try { doc = parseSvg(svg) } catch (e) { return { status: 'parse-error', detail: e.message } }
  /** @type {string[]} */
  const invalid = []
  if (typed) {
    try {
      const drawing = model.readDrawing(doc)
      const note = (/** @type {{tag: string, id?: string, features: {invalid: string[]}}} */ it) => {
        for (const attr of it.features.invalid) invalid.push(`${it.tag}${it.id ? '#' + it.id : ''} ${attr}`)
      }
      model.walkItems(drawing, note)
      drawing.defs.forEach(note)
    } catch (e) { return { status: 'unreadable', detail: e.message } }
  }
  const extra = invalid.length ? { invalid } : {}
  const out = serializeSvg(doc)
  const saved = svg.trimEnd()
  if (out === saved) return { status: 'identical', ...extra }
  let i = 0
  while (i < saved.length && saved[i] === out[i]) i++
  const detail = `first difference at ${i}: saved ${JSON.stringify(saved.slice(i, i + 40))} / written ${JSON.stringify(out.slice(i, i + 40))}`
  let back
  try { back = parseSvg(out) } catch { return { status: 'lossy', detail: `written text does not parse; ${detail}`, ...extra } }
  return { status: JSON.stringify(back) === JSON.stringify(doc) ? 'respelled' : 'lossy', detail, ...extra }
}

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
  const typed = args.includes('--typed')
  const verbose = args.includes('--verbose')
  const targets = args.filter((a) => !a.startsWith('--'))
  if (!targets.length) {
    console.error('usage: check-model-roundtrip.mjs [--typed] [--verbose] <file-or-dir>...')
    process.exit(2)
  }
  const counts = { identical: 0, respelled: 0, lossy: 0, 'parse-error': 0, unreadable: 0, invalidFeatures: 0 }
  for (const target of targets) {
    for await (const file of walk(target)) {
      const text = await readFile(file, 'utf8')
      const drawings = file.endsWith('.md') ? drawingsIn(text) : [{ where: 'drawing', svg: text }]
      for (const { where, svg } of drawings) {
        const r = checkDrawingText(svg, { typed })
        counts[r.status]++
        for (const bad of r.invalid ?? []) { counts.invalidFeatures++; console.log(`invalid feature: ${file} (${where}): ${bad}`) }
        if (r.status === 'identical' || (r.status === 'respelled' && !verbose)) continue
        console.log(`${r.status}: ${file} (${where}): ${r.detail}`)
      }
    }
  }
  const total = counts.identical + counts.respelled + counts.lossy + counts['parse-error'] + counts.unreadable
  console.log(`${total} drawings: ${counts.identical} identical, ${counts.respelled} respelled, ${counts.lossy} lossy, ` +
    `${counts['parse-error']} do not parse` + (typed ? `, ${counts.unreadable} unreadable, ${counts.invalidFeatures} invalid typed features` : ''))
  if (counts.lossy || counts['parse-error'] || counts.unreadable) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
