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
 * it from REPAIRS — this list is meant to shrink, not grow forever (it is empty when every drawing is clean).
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import LZString from 'lz-string'
import { retracedLine } from '../packages/svgcanvas/core/drawing-invariants.ts'
import { fxRoundingDrift } from '../packages/svgcanvas/core/live-effects.ts'
import { init as liveEffectsDistortInit } from '../packages/svgcanvas/core/live-effects-distort.ts'
import { init as warpInit } from '../packages/svgcanvas/core/warp.ts'
import { init as distortInit } from '../packages/svgcanvas/core/distort.ts'
import { init as rotate3dInit } from '../packages/svgcanvas/core/rotate3d.ts'

// the live effects a drawing can name, registered as the canvas registers them
for (const init of [liveEffectsDistortInit, warpInit, distortInit, rotate3dInit]) init()

/**
 * Each entry is `{ name, run(source) => source }`, a narrow text rewrite of one SVG. The earlier
 * ones (NaN tspans, `undefined` text in <defs>, stacked translate(), empty <path> elements) ran
 * over the vault and were deleted; `git log -- scripts/repair-drawings.mjs` has them as templates.
 * @typedef {{name: string, run: (source: string) => string}} Repair
 * @type {Repair[]}
 */
export const REPAIRS = [
  {
    // An undo after editing inside a group brought back the dimming of the group's siblings (setContext's synthetic
    // `opacity="0.33"`), and it was saved: whole layers, groups and texts at 33% (checkDrawing's `dimmed-leak`). Drops an
    // `opacity` of exactly 0.33 from any element, and any `opacity` from a never-rendered one. A 33% opacity set on purpose
    // would go too, so read the dry run before writing.
    name: 'dimmed-leak',
    run: (source) => source.replace(/<([a-zA-Z][\w:-]*)\b[^>]*>/g, (tag, name) =>
      ['title', 'desc', 'metadata', 'defs', 'style'].includes(name)
        ? tag.replace(/\sopacity="[^"]*"/, '')
        : tag.replace(/\sopacity="0\.33"/, ''))
  },
  {
    // The Pen closed a path finished by a click on its last point (`M A L B L A Z`): the line it
    // was meant to be is `M A L B` (checkDrawing's `retraced-path`).
    name: 'retraced-path',
    run: (source) => source.replace(/<path\b[^>]*>/g, (tag) => tag.replace(/(\sd=")([^"]*)(")/, (whole, open, d, close) => {
      const line = retracedLine(d)
      const n = (v) => Number(v.toFixed(6))
      return line ? `${open}M${n(line[0][0])},${n(line[0][1])} L${n(line[1][0])},${n(line[1][1])}${close}` : whole
    }))
  },
  {
    // Saving dropped every `style` that began with the editor's `pointer-events` state, and a feathered mask's silhouette
    // keeps its feather in exactly such a style: the mask came back hard-edged (checkDrawing's `mask-feather-lost`). The
    // masked element still says how much (`data-feather`), so its mask's children get the style `applyFeatherTo`
    // (clip-mask.ts) gives them.
    name: 'mask-feather-lost',
    run: (source) => {
      const feathers = new Map()
      for (const [tag] of source.matchAll(/<[a-zA-Z][^>]*\sdata-feather="[^"]*"[^>]*>/g)) {
        const px = Number(/\sdata-feather="([^"]*)"/.exec(tag)[1])
        const id = /\smask="url\(\s*['"]?#([^'")\s]+)/.exec(tag)?.[1]
        if (id && px) feathers.set(id, px)
      }
      if (!feathers.size) return source
      return source.replace(/(<mask\b[^>]*>)([\s\S]*?)(<\/mask>)/g, (whole, open, content, close) => {
        const px = feathers.get(/\sid="([^"]*)"/.exec(open)?.[1])
        if (!px) return whole
        const a = Math.abs(px)
        const style = px < 0
          ? `fill-opacity: 1 !important; opacity: 1 !important; fill: #666666 !important; stroke: #ffffff !important; stroke-width: ${a} !important; filter: blur(${(a * 0.6).toFixed(1)}px);`
          : `fill: #ffffff !important; fill-opacity: 1 !important; opacity: 1 !important; stroke: none !important; filter: blur(${px}px);`
        let depth = 0
        const fixed = content.replace(/<(\/?)[a-zA-Z][^>]*?(\/?)>/g, (tag, end, selfClosing) => {
          if (end) { depth--; return tag }
          const direct = depth === 0
          if (!selfClosing) depth++
          if (!direct || /\sstyle="[^"]*blur\(/.test(tag)) return tag
          return /\sstyle="/.test(tag)
            ? tag.replace(/\sstyle="([^"]*)"/, (m, v) => ` style="${v.trim().replace(/;?$/, ';')} ${style}"`)
            : tag.replace(/(\/?>)$/, ` style="${style}"$1`)
        })
        return open + fixed + close
      })
    }
  },
  {
    // The saver wrote relative path commands rounding each delta on its own, so the error piled up along a long path; a
    // live-effect path whose `d` drifted that way read as edited and the next selection dropped the effect (checkDrawing's
    // `fx-rounding-drift`). Writes the effect's output back as `d` (2 decimals), for a path whose only stage is the
    // effect and whose drift stays within a unit.
    name: 'fx-rounding-drift',
    run: (source) => source.replace(/<path\b[^>]*>/g, (tag) => {
      const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
      const src = attr('se:fx-d')
      if (!src || /\sse:(?!fx-d)[\w-]+-d="/.test(tag)) return tag
      const out = fxRoundingDrift(src, attr('se:fx') ?? '', attr('d') ?? '')
      if (!out) return tag
      const d = out.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => String(Number(Number(n).toFixed(2))))
      return tag.replace(/(\sd=")[^"]*(")/, `$1${d}$2`)
    })
  }
]

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

/**
 * Every SVG a plugin note holds: the ```svg / ```compressed-svg block and the "## Versions" snapshots.
 * Read-only counterpart of `repairMarkdown` (same blocks), for tools that check drawings.
 * @param {string} content
 * @returns {{where: string, svg: string}[]}
 */
export const drawingsIn = (content) => {
  const found = []
  for (const [, , compressed, kind, body] of content.matchAll(/^(```(compressed-)?(svg|versions-json)\r?\n)([\s\S]*?)(\r?\n```)/gm)) {
    const raw = compressed ? fromBase64(body) : body
    if (!raw) continue
    if (kind === 'svg') { found.push({ where: 'drawing', svg: raw }); continue }
    let list
    try { list = JSON.parse(raw) } catch { continue }
    if (Array.isArray(list)) list.forEach((snap, i) => { if (typeof snap?.svg === 'string') found.push({ where: `version ${i}`, svg: snap.svg }) })
  }
  return found
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
