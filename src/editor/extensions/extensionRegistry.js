/**
 * extensionRegistry.js
 *
 * Statically imports every built-in extension so they are inlined into the
 * bundle instead of being fetched as loose files at runtime. Vite turns this
 * eager glob into static imports that Rollup bundles into Editor.js.
 *
 * Keyed by extension name (the `ext-*` directory name), matching the names in
 * ConfigObj's `defaultExtensions` and any `extensions` config array.
 */

const modules = import.meta.glob('./*/ext-*.js', { eager: true })

const registry = {}
for (const [path, mod] of Object.entries(modules)) {
  // './ext-shapes/ext-shapes.js' -> 'ext-shapes'
  const match = path.match(/\.\/([^/]+)\//)
  if (match) registry[match[1]] = mod
}

/**
 * Resolve a built-in extension module by name.
 * @param {string} name e.g. 'ext-shapes'
 * @returns {object|undefined} the extension module (with a `default` export)
 */
export function getExtension (name) {
  return registry[name]
}

export default registry
