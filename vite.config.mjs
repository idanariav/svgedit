import { resolve } from 'node:path'
import { createFilter, defineConfig } from 'vite'
import dynamicImportVars from '@rollup/plugin-dynamic-import-vars'
import istanbul from 'vite-plugin-istanbul'
import { compactHtmlTemplate } from './scripts/html-template.mjs'

const editorEntries = [
  resolve(__dirname, 'src/editor/index.html')
]

// Instrument the e2e build for coverage. Not under vitest (which also sets
// NODE_ENV=test): its own istanbul provider instruments the unit tests, and a
// second instrumentation pass leaves its report empty.
const coverageEnabled = !process.env.VITEST &&
  (process.env.COVERAGE === 'true' || process.env.NODE_ENV === 'test')

// Panel, dialog and editor templates are imported as strings
// (`import html from './X.html'`). See scripts/html-template.mjs for what the
// compaction does and does not touch.
const isHtmlTemplate = createFilter([
  'src/editor/dialogs/**/*.html',
  'src/editor/panels/*.html',
  'src/editor/templates/*.html',
  'src/editor/extensions/*/*.html'
])
const htmlTemplatePlugin = {
  name: 'svgedit-html-templates',
  enforce: 'post',
  transform (code, id) {
    if (!isHtmlTemplate(id)) return
    return { code: `export default ${JSON.stringify(compactHtmlTemplate(code))}`, map: null }
  }
}

export default defineConfig({
  root: '.',
  appType: 'mpa',
  base: './',
  resolve: {
    // The package's `main` is its built `dist/svgcanvas.js`, but subpath
    // imports (`@svgedit/svgcanvas/core/*.js`) resolve to source. Resolving the
    // bare name to source too means the dev server, vitest and the editor
    // bundle all load ONE copy of each core module (the bundle used to carry
    // the built package plus source duplicates of every subpath-imported
    // module, each with its own module state), and a core change needs no
    // `vite build packages/svgcanvas` before it shows up.
    alias: [
      { find: /^@svgedit\/svgcanvas$/, replacement: resolve(__dirname, 'packages/svgcanvas/svgcanvas.ts') }
    ]
  },
  server: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: true
  },
  preview: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: true
  },
  plugins: [
    {
      name: 'svgedit-skip-vite-build-html',
      apply: 'build',
      enforce: 'pre',
      configResolved (config) {
        config.plugins = config.plugins.filter(plugin => plugin.name !== 'vite:build-html')
      }
    },
    htmlTemplatePlugin,
    {
      ...dynamicImportVars({
        include: ['src/editor/locale.js', 'src/editor/extensions/*/*.js']
      }),
      apply: 'build'
    },
    coverageEnabled &&
      istanbul({
        include: ['src/editor/**', 'packages/svgcanvas/**'],
        exclude: ['node_modules', 'dist', 'packages/**/dist'],
        extension: ['.js', '.ts'],
        forceBuildInstrument: true
      }),
    {
      name: 'svgedit-html-asset-string',
      enforce: 'pre',
      generateBundle (_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type === 'asset' && asset.fileName.endsWith('.html') && typeof asset.source !== 'string') {
            asset.source = asset.source.toString()
          }
        }
      }
    }
  ].filter(Boolean),
  optimizeDeps: {
    // Restrict dependency scanning to the main editor entry points.
    entries: editorEntries
  },
  build: {
    outDir: 'dist/editor',
    emptyOutDir: true,
    sourcemap: process.env.SOURCEMAP === 'true',
    lib: {
      entry: resolve(__dirname, 'src/editor/Editor.js'),
      name: 'Editor',
      formats: ['es'],
      fileName: () => 'Editor.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      'paper/dist/paper-core.js': resolve(__dirname, 'tests/unit/mocks/paper-core-stub.js')
    },
    setupFiles: ['tests/unit/setup-vitest.js'],
    include: ['tests/**/*.test.{js,ts}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      // istanbul, like the e2e build's instrumentation (vite-plugin-istanbul),
      // so `scripts/run-e2e.mjs` merges two reports with the same statement maps.
      provider: 'istanbul',
      include: ['src/editor/**/*.{js,ts}', 'packages/svgcanvas/**/*.{js,ts}'],
      exclude: ['**/dist/**', '**/node_modules/**', 'tests/**', '**/*.d.ts']
    }
  }
})
