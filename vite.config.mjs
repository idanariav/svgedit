import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dynamicImportVars from '@rollup/plugin-dynamic-import-vars'
import string, { defaultCompress } from 'vite-plugin-string'
import istanbul from 'vite-plugin-istanbul'

const editorEntries = [
  resolve(__dirname, 'src/editor/index.html')
]

const coverageEnabled = process.env.COVERAGE === 'true' || process.env.NODE_ENV === 'test'

// vite-plugin-string's default compressor treats `&` and `;` as operators
// (meant for shader source like `a && b;`) and strips whitespace around
// them, which mangles HTML entities: "Stroke &amp; Opacity" collapses to
// "Stroke &amp;Opacity", rendering as "Stroke&Opacity". Swap each whole
// entity for an alphanumeric-only placeholder before compression (so none
// of its whitespace-adjacent symbols can trigger the stripping) and restore
// the original entity text after.
function compressHtmlPreservingEntities (code) {
  const entities = []
  const shielded = code.replace(/&[a-zA-Z#][a-zA-Z0-9]*;/g, (entity) => {
    entities.push(entity)
    return `ENTITYPLACEHOLDER${entities.length - 1}END`
  })
  return defaultCompress(shielded).replace(
    /ENTITYPLACEHOLDER(\d+)END/g,
    (_match, index) => entities[Number(index)]
  )
}

const htmlStringPlugin = string({
  include: [
    'src/editor/dialogs/**/*.html',
    'src/editor/panels/*.html',
    'src/editor/templates/*.html',
    'src/editor/extensions/*/*.html'
  ],
  compress: compressHtmlPreservingEntities
})
htmlStringPlugin.enforce = 'post'

export default defineConfig({
  root: '.',
  appType: 'mpa',
  base: './',
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
    htmlStringPlugin,
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
        extension: ['.js'],
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
      provider: 'v8',
      include: [
        'src/editor/locale.js',
        'src/editor/MainMenu.js',
        'src/editor/contextmenu.js',
        'packages/svgcanvas/core/paint.js',
        'packages/svgcanvas/core/dataStorage.js',
        'packages/svgcanvas/core/clear.js',
        'packages/svgcanvas/core/path.js',
        'packages/svgcanvas/core/coords.js',
        'packages/svgcanvas/core/recalculate.js',
        'packages/svgcanvas/core/utilities.js',
        'packages/svgcanvas/core/layer.js',
        'packages/svgcanvas/core/sanitize.js',
        'packages/svgcanvas/common/util.js',
        'packages/svgcanvas/core/touch.js'
      ]
    }
  }
})
