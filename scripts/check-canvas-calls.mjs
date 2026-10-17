#!/usr/bin/env node
/**
 * Fails when editor code calls the canvas wrongly: a member that does not exist on `SvgCanvas`, or arguments / assignments on a
 * line that touches `svgCanvas` that its signature rejects.
 *
 * The editor is JavaScript with no strict typecheck (about 1,700 unrelated DOM-typing errors under `checkJs`), so this runs
 * `tsc` with `src/editor/tsconfig.canvas-calls.json` and keeps only the errors about the canvas: any error naming `SvgCanvas`, and the
 * argument / assignment errors (TS2345, TS2554, TS2555, TS2322, TS2740) on a source line containing `svgCanvas`. It is what
 * makes moving a member off the canvas (R2) safe for the ~80 editor files and extensions that call it.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ARG_CODES = new Set(['TS2345', 'TS2554', 'TS2555', 'TS2322', 'TS2740'])

/**
 * The canvas-related errors in `tsc` output.
 * @param {string} output - tsc's diagnostics, one `file(line,col): error TSnnnn: message` per line
 * @param {(file: string, line: number) => string} lineOf - the source line an error points at
 * @returns {string[]}
 */
export const canvasCallErrors = (output, lineOf) => {
  const hits = []
  for (const text of output.split('\n')) {
    const m = /^(\S+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(text)
    if (!m) continue
    const [, file, line, , code, message] = m
    if (message.includes("'SvgCanvas'") || (ARG_CODES.has(code) && lineOf(file, Number(line)).includes('svgCanvas'))) hits.push(text)
  }
  return hits
}

const main = () => {
  const root = resolve(import.meta.dirname, '..')
  const run = spawnSync('npx', ['tsc', '-p', 'src/editor/tsconfig.canvas-calls.json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const out = `${run.stdout}${run.stderr}`
  const sources = new Map()
  const lineOf = (file, line) => {
    if (!sources.has(file)) {
      try { sources.set(file, readFileSync(resolve(root, file), 'utf8').split('\n')) } catch { sources.set(file, []) }
    }
    return sources.get(file)[line - 1] ?? ''
  }
  const hits = canvasCallErrors(out, lineOf)
  if (!out.includes('error TS') && run.status !== 0) {
    console.error(out)
    console.error('check-canvas-calls: tsc failed without reporting errors')
    process.exit(1)
  }
  if (hits.length) {
    console.error(hits.join('\n'))
    console.error(`\ncheck-canvas-calls: ${hits.length} call(s) the canvas's types reject`)
    process.exit(1)
  }
  console.log('check-canvas-calls: OK')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
