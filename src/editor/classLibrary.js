/**
 * Class library — a global, browser-persisted store of named style presets
 * ("classes"). A preset captures a set of SVG attribute values that can be
 * stamped onto an element to reformat it (e.g. a "title" preset that sets
 * font-size, fill and font-family on a text element).
 *
 * Storage is a single JSON array under the `svg-edit-class-library` localStorage
 * key, mirroring how the editor theme persists under `svg-edit-theme`.
 *
 * Preset shape:
 *   { name: string, scope: 'text'|'shape'|'any', attrs: { [attr]: string },
 *     shadow?: { angle, length, blur, opacity, color },
 *     outline?: { width, color, opacity } }
 *
 * A drop shadow or outline is not a plain attribute (each is a `filter`
 * reference plus filter primitives in <defs>), so they are captured separately
 * as structured params under `shadow` / `outline` and re-applied via the shadow
 * and outline extension APIs rather than stamped like the flat `attrs`.
 *
 * Reads/writes go through the optional host storage adapter when one is
 * registered (see userDataAdapter.js); otherwise they fall back to the
 * localStorage key below. The schema is identical on both paths.
 *
 * @module classLibrary
 */

import { getUserDataAdapter } from './userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-class-library'
const DEFAULTS_STORAGE_KEY = 'svg-edit-default-classes'

/**
 * Common attributes offered for every element scope.
 * @type {string[]}
 */
export const COMMON_ATTRS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linejoin',
  'stroke-linecap',
  'opacity'
]

/**
 * Text-specific attributes, offered in addition to {@link COMMON_ATTRS} for
 * text elements.
 * @type {string[]}
 */
export const TEXT_ATTRS = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-anchor',
  'letter-spacing',
  'word-spacing'
]

/**
 * Classify an element into a preset scope bucket.
 * @param {Element|null} elem
 * @returns {'text'|'shape'}
 */
export const elementScope = elem => {
  const tag = elem?.tagName?.toLowerCase()
  return tag === 'text' || tag === 'tspan' ? 'text' : 'shape'
}

/**
 * The catalog of attributes that may be captured for a given scope.
 * @param {'text'|'shape'|'any'} scope
 * @returns {string[]}
 */
export const attrCatalog = scope =>
  scope === 'text' ? [...COMMON_ATTRS, ...TEXT_ATTRS] : [...COMMON_ATTRS]

/**
 * Read the raw preset array from storage.
 * @returns {Array<{name:string,scope:string,attrs:Object}>}
 */
export const getClasses = () => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getClasses()
    return Array.isArray(parsed) ? parsed : []
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Persist the full preset array.
 * @param {Array} classes
 * @returns {void}
 */
const writeClasses = classes => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setClasses(classes)
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(classes))
  } catch {
    /* storage may be unavailable (private mode); fail silently */
  }
}

/**
 * Presets visible for a given element scope: those tagged with the same scope
 * plus universal (`any`) presets.
 * @param {'text'|'shape'} scope
 * @returns {Array}
 */
export const getClassesForScope = scope =>
  getClasses().filter(c => c.scope === scope || c.scope === 'any')

/**
 * Look up a single preset by name.
 * @param {string} name
 * @returns {Object|undefined}
 */
export const getClass = name => getClasses().find(c => c.name === name)

/**
 * Upsert a preset by name — an existing preset with the same name is replaced,
 * enabling "update". Returns the stored preset.
 * @param {{name:string,scope:string,attrs:Object}} preset
 * @returns {Object}
 */
export const saveClass = preset => {
  const classes = getClasses()
  const idx = classes.findIndex(c => c.name === preset.name)
  if (idx >= 0) {
    classes[idx] = preset
  } else {
    classes.push(preset)
  }
  writeClasses(classes)
  return preset
}

/**
 * Per-object-type ("tag") default class assignments — e.g. `{ text: 'title' }`
 * means every newly created `<text>` element gets the "title" preset stamped
 * on automatically. Storage mirrors {@link getClasses}: adapter-first
 * (`getDefaultClasses`/`setDefaultClasses`), else `localStorage`.
 * @returns {Object<string,string>} Map of lowercase tag name -> class name.
 */
export const getDefaultClasses = () => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getDefaultClasses?.()
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  try {
    const raw = window.localStorage.getItem(DEFAULTS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeDefaultClasses = defaults => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setDefaultClasses?.(defaults)
    return
  }
  try {
    window.localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(defaults))
  } catch {
    /* storage may be unavailable (private mode); fail silently */
  }
}

/**
 * The default class name for a given element tag, if one is set.
 * @param {string} tag Lowercase tag name (e.g. `'text'`, `'rect'`).
 * @returns {string|undefined}
 */
export const getDefaultClassForTag = tag => getDefaultClasses()[tag]

/**
 * Set (or clear, when `name` is falsy) the default class for an element tag.
 * @param {string} tag Lowercase tag name (e.g. `'text'`, `'rect'`).
 * @param {string|null} name
 * @returns {void}
 */
export const setDefaultClassForTag = (tag, name) => {
  const defaults = getDefaultClasses()
  if (name) {
    defaults[tag] = name
  } else {
    delete defaults[tag]
  }
  writeDefaultClasses(defaults)
}

/**
 * Remove a preset by name. Also clears it from any object type's default
 * (see {@link getDefaultClassForTag}) so a deleted class can't be silently
 * re-applied to newly created elements under a stale name.
 * @param {string} name
 * @returns {void}
 */
export const deleteClass = name => {
  writeClasses(getClasses().filter(c => c.name !== name))
  const defaults = getDefaultClasses()
  const tags = Object.keys(defaults).filter(tag => defaults[tag] === name)
  if (tags.length) {
    tags.forEach(tag => delete defaults[tag])
    writeDefaultClasses(defaults)
  }
}

/**
 * Class tokens not under editor control (e.g. layer/internal `se_*`),
 * preserved whenever the library's `class` token is stamped onto an element.
 * @param {Element} elem
 * @returns {string[]}
 */
export const internalClassTokens = elem =>
  (elem.getAttribute('class') || '').split(/\s+/).filter(tk => tk.startsWith('se_'))

/**
 * Build the next `class` attribute string for an element, preserving its
 * internal tokens and appending/replacing the library class name.
 * @param {Element} elem
 * @param {string} name Library class name, or `''`/falsy to remove it.
 * @returns {string|null} The new `class` value, or `null` when it would be empty.
 */
export const nextClassString = (elem, name) => {
  const next = [...internalClassTokens(elem), name].filter(Boolean).join(' ')
  return next || null
}

/**
 * Stamp a preset's flat attributes (and library `class` token) onto an
 * element with plain `setAttribute` calls — no undo tracking. Used to apply
 * an object type's default class to a brand-new element that isn't in the
 * undo history yet (see `Editor.js#elementInserted`); unlike
 * `<se-class-select>`'s `applyClass`, which stamps onto an already-inserted,
 * possibly-selected element and must record each change for undo.
 *
 * Shadow/outline (structured, filter-based) presets are not applied here —
 * defaults only cover the flat attribute set.
 * @param {Element} elem
 * @param {{name:string,attrs:Object}} preset
 * @returns {void}
 */
export const applyDefaultClassAttrs = (elem, preset) => {
  const cls = nextClassString(elem, preset.name)
  if (cls) elem.setAttribute('class', cls)
  else elem.removeAttribute('class')
  const attrs = preset.attrs || {}
  Object.entries(attrs).forEach(([k, v]) => elem.setAttribute(k, v))
  if ('stroke-width' in attrs) {
    elem.setAttribute('paint-order', 'stroke')
  }
}
