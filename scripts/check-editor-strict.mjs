#!/usr/bin/env node
/**
 * Fails when a file on the editor's strict list (`src/editor/strict-files.json`) has a type error under `strict`.
 *
 * The editor is JavaScript with about 5,800 `strict` errors in 160 files (DOM typing: `getElementById` is nullable,
 * `Element` has no `value`, custom elements are untyped), so the editor cannot be made strict in one go. This runs `tsc`
 * with `src/editor/tsconfig.strict.json` over all of it and reports only the errors in the listed files: a ratchet. A file
 * joins the list in the commit that makes it clean, and nothing already on it can regress. (Same shape as the engine's
 * `packages/svgcanvas/tsconfig.strict.json`, which lists files instead because every engine module is typed.) `--report` prints
 * the error count per file, fewest first.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The errors in `tsc` output that point into one of `files`.
 * @param {string} output - tsc's diagnostics, one `file(line,col): error TSnnnn: message` per line
 * @param {Iterable<string>} files - repo-relative paths
 * @returns {string[]}
 */
export const errorsInFiles = (output, files) => {
  const listed = new Set(files)
  return output.split('\n').filter((text) => {
    const m = /^(\S+?)\(\d+,\d+\): error TS\d+: /.exec(text)
    return m !== null && listed.has(m[1])
  })
}

/**
 * Error counts per file, fewest first (files with none are not in the output): where to go next.
 * @param {string} output - tsc's diagnostics
 * @returns {[string, number][]}
 */
export const countsByFile = (output) => {
  const counts = new Map()
  for (const text of output.split('\n')) {
    const m = /^(\S+?)\(\d+,\d+\): error TS\d+: /.exec(text)
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => a[1] - b[1])
}

const main = () => {
  const root = resolve(import.meta.dirname, '..')
  const files = JSON.parse(readFileSync(resolve(root, 'src/editor/strict-files.json'), 'utf8'))
  const run = spawnSync('npx', ['tsc', '-p', 'src/editor/tsconfig.strict.json'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const out = `${run.stdout}${run.stderr}`
  if (!out.includes('error TS') && run.status !== 0) {
    console.error(out)
    console.error('check-editor-strict: tsc failed without reporting errors')
    process.exit(1)
  }
  if (process.argv.includes('--report')) {
    for (const [file, n] of countsByFile(out)) console.log(`${String(n).padStart(5)}  ${file}${files.includes(file) ? '  (strict)' : ''}`)
    return
  }
  const hits = errorsInFiles(out, files)
  if (hits.length) {
    console.error(hits.join('\n'))
    console.error(`\ncheck-editor-strict: ${hits.length} error(s) in ${files.length} strict file(s)`)
    process.exit(1)
  }
  console.log(`check-editor-strict: OK (${files.length} files)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
