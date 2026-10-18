#!/usr/bin/env node
/**
 * Headless CLI over the document model (R1): read a drawing without an editor or a browser.
 *
 *   node scripts/svgedit-cli.mjs inspect <file.svg|note.md> [--version N]   a structural summary, as JSON
 *   node scripts/svgedit-cli.mjs read    <file.svg|note.md> [--version N]   the drawing's SVG, written back by the model
 *   node scripts/svgedit-cli.mjs bounds  <file.svg|note.md> [--version N]   where every object is, in document coordinates, as JSON
 *   node scripts/svgedit-cli.mjs check   <file.svg|note.md>...              round-trip + typed-feature findings; exit 1 on a problem
 *
 * A `.md` file is a plugin note: its drawing is the ```svg / ```compressed-svg block, `--version N` picks a saved version
 * instead. JSON on stdout for `inspect`, `bounds` and `check`; errors on stderr with a non-zero exit. `run` (a command on the drawing)
 * and the DOM-based `checkDrawing` need the editor and are not here (see `.claude/roadmap/llm-cli.md`).
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { drawingsIn } from './repair-drawings.mjs'
import { checkDrawingText } from './check-model-roundtrip.mjs'
import * as model from '../packages/svgcanvas/core/model/index.ts'

/**
 * @param {string} file
 * @param {string} text
 * @param {number | undefined} [version] a saved version of a note, instead of its drawing
 * @returns {string} the SVG text
 */
export const svgOf = (file, text, version) => {
  if (!file.endsWith('.md')) return text
  const found = drawingsIn(text)
  const want = version === undefined ? 'drawing' : `version ${version}`
  const hit = found.find((d) => d.where === want)
  if (!hit) throw new Error(`${file}: no ${want} (found: ${found.map((d) => d.where).join(', ') || 'none'})`)
  return hit.svg
}

/**
 * @param {string} svg
 * @returns {import('../packages/svgcanvas/core/model/summary.ts').DrawingSummary}
 */
export const inspect = (svg) => model.summarizeDrawing(model.readDrawing(model.parseSvg(svg)))

/**
 * Where each object of the drawing is: its box and its visual box (with the stroke) in document coordinates, under the
 * transforms of the groups above it; shapes and groups exactly, a text by estimate, a `use` not at all.
 * @param {string} svg
 * @returns {import('../packages/svgcanvas/core/model/layout.ts').Layout}
 */
export const bounds = (svg) => model.layoutOf(model.parseSvg(svg).root)

/** The layout as JSON with one object per line: the boxes are arrays, and one number per line costs an agent reading it many tokens. */
const printBounds = (layout) =>
  `{\n  "size": ${JSON.stringify(layout.size)},\n  "extent": ${JSON.stringify(layout.extent)},\n  "objects": [\n${layout.objects.map((o) => '    ' + JSON.stringify(o)).join(',\n')}\n  ]\n}`

const main = async () => {
  const [verb, ...rest] = process.argv.slice(2)
  const vi = rest.indexOf('--version')
  const version = vi >= 0 ? Number(rest[vi + 1]) : undefined
  const files = rest.filter((a, i) => !a.startsWith('--') && (vi < 0 || i !== vi + 1))
  if (!['inspect', 'read', 'bounds', 'check'].includes(verb) || !files.length) {
    console.error('usage: svgedit-cli.mjs inspect|read|bounds|check <file.svg|note.md> [--version N]')
    process.exit(2)
  }
  if (verb === 'check') {
    let bad = 0
    const report = []
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      const drawings = file.endsWith('.md') ? drawingsIn(text) : [{ where: 'drawing', svg: text }]
      for (const { where, svg } of drawings) {
        const result = checkDrawingText(svg, { typed: true })
        const problem = ['lossy', 'parse-error', 'unreadable'].includes(result.status) || Boolean(result.invalid?.length)
        if (problem) bad++
        report.push({ file, where, ...result })
      }
    }
    console.log(JSON.stringify(report, null, 2))
    process.exit(bad ? 1 : 0)
  }
  try {
    const svg = svgOf(files[0], await readFile(files[0], 'utf8'), version)
    if (verb === 'read') console.log(model.serializeSvg(model.parseSvg(svg), { format: 'indent' }))
    else if (verb === 'bounds') console.log(printBounds(bounds(svg)))
    else console.log(JSON.stringify(inspect(svg), null, 2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
