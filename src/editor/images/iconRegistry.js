/**
 * iconRegistry.js
 *
 * Inlines every toolbar icon and cursor SVG into the bundle at build time so
 * the editor needs no runtime `images/` folder. Vite turns these `import.meta.glob`
 * calls (eager + `?raw`) into static imports that Rollup inlines into Editor.js.
 *
 * The glob arguments must be string literals relative to THIS file.
 */

const modules = {
  ...import.meta.glob('./*.svg', { query: '?raw', eager: true, import: 'default' }),
  ...import.meta.glob('./cursors/*.svg', { query: '?raw', eager: true, import: 'default' })
}

// Key by path relative to this images/ dir, plus a bare-basename fallback:
//   './new.svg'                  -> 'new.svg'
//   './cursors/rect_cursor.svg'  -> 'cursors/rect_cursor.svg' (+ 'rect_cursor.svg')
const registry = new Map()
for (const [path, source] of Object.entries(modules)) {
  const key = path.replace(/^\.\//, '')
  registry.set(key, source)
  const base = key.slice(key.lastIndexOf('/') + 1)
  if (!registry.has(base)) registry.set(base, source)
}

/**
 * Resolve a raw SVG string from a URL/path that ends in an icon filename.
 * Returns null for `data:` URIs or unknown icons so callers can fall back.
 * @param {string} url
 * @returns {string|null}
 */
export function getRawIcon (url) {
  if (!url || url.startsWith('data:')) return null
  let key = url.split(/[?#]/)[0]
  const idx = key.lastIndexOf('/images/')
  if (idx !== -1) key = key.slice(idx + '/images/'.length)
  if (registry.has(key)) return registry.get(key)
  const base = key.slice(key.lastIndexOf('/') + 1)
  return registry.get(base) ?? null
}

/**
 * Build a `data:` URI for an icon, suitable for CSS `url(...)` / cursor values.
 * @param {string} url
 * @returns {string|null}
 */
export function getIconDataUri (url) {
  const raw = getRawIcon(url)
  if (!raw) return null
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(raw)
}
