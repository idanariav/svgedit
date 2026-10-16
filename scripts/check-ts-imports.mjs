#!/usr/bin/env node
// check-ts-imports.mjs — fails when an import names a `.js` file that exists only as `.ts`
//
// Vite and tsc map `./x.js` to `x.ts`, plain Node does not, and the headless engine (the document model, the
// future CLI) runs in plain Node with its built-in type stripping. So a module converted to TypeScript must be
// imported as `./x.ts` everywhere (R3). Fix: change the specifier's extension to `.ts`, or run
// `node scripts/check-ts-imports.mjs --fix` right after renaming a module to `.ts`.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['src', 'packages/svgcanvas', 'tests', 'scripts']
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'fixtures'])
// bare specifiers that point into the repo
const ALIASES = [['@svgedit/svgcanvas/', 'packages/svgcanvas/']]
const SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+|vi\.(?:mock|doMock|importActual)\s*\(\s*)(['"])([^'"\n]+\.js)\1/g

/** @param {string} dir @param {string[]} [out] */
function walk (dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(m?js|ts)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** The repo path a specifier points at, or null for a package outside the repo. */
function target (importer, spec) {
  if (spec.startsWith('.')) return resolve(dirname(importer), spec)
  for (const [alias, dir] of ALIASES) if (spec.startsWith(alias)) return join(ROOT, dir, spec.slice(alias.length))
  return null
}

const isStale = (file, spec) => {
  const path = target(file, spec)
  return Boolean(path && !existsSync(path) && existsSync(path.replace(/\.js$/, '.ts')))
}

/** @param {{fix?: boolean}} [opts] @returns {string[]} one line per stale specifier (rewritten when `fix`) */
export function findStaleImports ({ fix = false } = {}) {
  const bad = []
  for (const file of ROOTS.flatMap(r => walk(join(ROOT, r)))) {
    const text = readFileSync(file, 'utf8')
    const next = text.replace(SPECIFIER, (whole, quote, spec) => {
      if (!isStale(file, spec)) return whole
      bad.push(`${file.slice(ROOT.length + 1)}: '${spec}' -> '${spec.replace(/\.js$/, '.ts')}'`)
      return whole.replace(`${quote}${spec}${quote}`, `${quote}${spec.replace(/\.js$/, '.ts')}${quote}`)
    })
    if (fix && next !== text) writeFileSync(file, next)
  }
  return bad
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fix = process.argv.includes('--fix')
  const bad = findStaleImports({ fix })
  if (fix) {
    console.log(`check-ts-imports: rewrote ${bad.length} specifier(s)`)
  } else if (bad.length) {
    console.error('check-ts-imports: these imports name a .js file that is now .ts (plain Node cannot map them); run with --fix:\n')
    for (const b of bad) console.error('  ' + b)
    process.exit(1)
  } else {
    console.log('check-ts-imports: OK')
  }
}
