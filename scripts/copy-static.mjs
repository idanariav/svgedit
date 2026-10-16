// copy-static.mjs — Postbuild: copies HTML entries + Playwright test harness to `dist/editor/` (CSS/images/extensions are now inlined into `Editor.js`, so they are not copied)
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createInstrumenter } from 'istanbul-lib-instrument'
import { dirname, resolve } from 'node:path'
import esbuild from 'esbuild'

const root = process.cwd()
const outDir = resolve(root, 'dist/editor')

await mkdir(outDir, { recursive: true })

// NOTE: CSS, images, extensions and locale files are now inlined into the
// self-contained Editor.js bundle (see iconRegistry.js, extensionRegistry.js,
// and the `?inline` / import.meta.glob imports), so they are no longer copied
// as loose runtime assets.
const targets = [
  ['src/editor/index.html', 'index.html'],
  ['src/editor/browser-not-supported.html', 'browser-not-supported.html'],
  ['src/editor/browser-not-supported.js', 'browser-not-supported.js'],
  // Host API types for embedders (see src/editor/hostApi.d.ts)
  ['src/editor/hostApi.d.ts', 'hostApi.d.ts'],
  // Test harness assets for Playwright (unit-style tests in browser)
  ['src/editor/tests', 'tests'],
  // Same stub used by vitest (tests/unit/mocks/paper-core-stub.js) to avoid
  // loading paper's CJS/UMD dist bundle as a native ES module — no current
  // harness spec exercises real paper.js geometry ops.
  ['tests/unit/mocks/paper-core-stub.js', 'tests/vendor/paper/paper-core-stub.js']
]

for (const [src, dest] of targets) {
  await cp(resolve(root, src), resolve(outDir, dest), { recursive: true })
}

// The Playwright unit harness (src/editor/tests/unit-harness.html) loads
// svgcanvas core modules as plain unbundled browser ES modules — no import
// map, no transform pipeline. path-seg-shim.js's `svgpath` dependency is
// CommonJS, so it can't be loaded that way directly (unlike the old
// `pathseg` polyfill, which was dependency-free plain JS and could just be
// copied as-is). Bundle it standalone with esbuild so the harness gets a
// single browser-ready ES module with `svgpath` inlined.
await esbuild.build({
  entryPoints: [resolve(root, 'packages/svgcanvas/core/path-seg-shim.js')],
  outfile: resolve(outDir, 'tests/vendor/path-seg-shim/path-seg-shim.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser'
})

// Core modules the harness loads unbundled (anchor-path.js, via path-edit.js)
// import the bare specifier 'svgpath', which a plain browser can't resolve. The
// harness page maps it (import map) to this standalone ESM bundle.
await esbuild.build({
  entryPoints: [resolve(root, 'node_modules/svgpath/index.js')],
  outfile: resolve(outDir, 'tests/vendor/svgpath/svgpath.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser'
})

// Instrument svgcanvas sources when collecting coverage so Playwright runs hit instrumented code.
const svgCanvasSrc = resolve(root, 'packages/svgcanvas')
const svgCanvasDest = resolve(outDir, 'tests/vendor/svgcanvas')
await cp(svgCanvasSrc, svgCanvasDest, { recursive: true })

// The harness is a plain browser: it cannot run `.ts`. Transpile the copied `.ts` modules to `.js` and point every
// `./x.ts` specifier at `./x.js` (the source tree imports them as `.ts` so plain Node can run it; R3).
async function walkFiles (dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) await walkFiles(full, out)
    else out.push(full)
  }
  return out
}
for (const file of await walkFiles(svgCanvasDest)) {
  if (file.endsWith('.d.ts')) continue
  if (file.endsWith('.ts')) {
    const { code } = await esbuild.transform(await readFile(file, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2020' })
    await writeFile(file.replace(/\.ts$/, '.js'), code.replace(/(from\s+|import\s*\(\s*)(['"])(\.[^'"]*)\.ts\2/g, '$1$2$3.js$2'), 'utf8')
    await rm(file)
  } else if (file.endsWith('.js')) {
    const code = await readFile(file, 'utf8')
    const next = code.replace(/(from\s+|import\s*\(\s*|import\s+)(['"])(\.[^'"]*)\.ts\2/g, '$1$2$3.js$2')
    if (next !== code) await writeFile(file, next, 'utf8')
  }
}

if (process.env.COVERAGE === 'true') {
  const instrumenter = createInstrumenter({ compact: false })
  const instrumentPaths = [
    'common/util.js',
    'core/touch.js',
    'core/namespaces.js',
    'core/dom-utils.js',
    'core/bbox-utils.js',
    'core/path-utils.js',
    'core/encoding-utils.js',
    'core/paper-utils.js',
    'core/math.js',
    'core/path.js',
    'core/coords.js',
    'core/units.js',
    'core/draw.js',
    'core/history.js',
    'core/recalculate.js',
    'core/clear.js'
  ]
  for (const relativePath of instrumentPaths) {
    const sourceFile = resolve(svgCanvasSrc, relativePath)
    const destFile = resolve(svgCanvasDest, relativePath)
    const code = await readFile(destFile, 'utf8') // the copy above, so a transpiled `.ts` module is instrumented as JS
    const instrumented = instrumenter.instrumentSync(code, sourceFile)
    await mkdir(dirname(destFile), { recursive: true })
    await writeFile(destFile, instrumented, 'utf8')
  }
}

console.info('Copied static editor assets to dist/editor')
