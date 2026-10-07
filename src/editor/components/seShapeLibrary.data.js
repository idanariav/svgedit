/**
 * Static data for <se-shape-library> (split out of seShapeLibrary.js): the bundled
 * shape catalog, category labels and inline icon markup.
 */

// Inlined shape library data (bundled at build time). Keyed by file basename
// without `.json` — e.g. `index`, `animal`, `arrow`. This removes the runtime
// fetch of `shapelib/*.json`; the `lib` attribute is still honoured as a
// fallback for custom external libraries.
const shapeLibModules = import.meta.glob('../extensions/ext-shapes/shapelib/*.json', { eager: true, import: 'default' })
export const shapeLibData = {}
for (const [p, data] of Object.entries(shapeLibModules)) {
  shapeLibData[p.slice(p.lastIndexOf('/') + 1).replace(/\.json$/, '')] = data
}

// ── Category labels ─────────────────────────────────────────────────────────
export const CAT_LABELS = {
  basic: 'Basic',
  accents: 'Accents',
  animal: 'Animals',
  arrow: 'Arrows',
  people: 'People',
  symbol: 'Symbols',
  weather: 'Weather & Nature',
  object: 'Objects',
  brands: 'Web & Brands',
  ui: 'UI & Tools',
  comms: 'Communication',
  math: 'Math',
  dialog_balloon: 'Dialog balloons',
  electronics: 'Electronics',
  flowchart: 'Flowchart',
  game: 'Game',
  music: 'Music'
}

// Virtual category id for the default tab that aggregates every shape.
export const ALL_CAT = 'all'

// ── Icon SVG strings ─────────────────────────────────────────────────────────
export const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M12 3.5l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.9z"/></svg>'
export const STAR18 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 3.5l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.9z"/></svg>'
export const SEARCH16 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>'
export const SEARCH13 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>'
export const CLOSE18 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><path d="M6 6l12 12M18 6L6 18"/></svg>'
export const CLOSE12 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="12" height="12"><path d="M6 6l12 12M18 6L6 18"/></svg>'
export const GRID_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/></svg>'
export const ROWS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="4" y="4" width="16" height="4" rx="1.2"/><rect x="4" y="10" width="16" height="4" rx="1.2"/><rect x="4" y="16" width="16" height="4" rx="1.2"/></svg>'
