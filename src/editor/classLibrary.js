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
 *   { name: string, scope: 'text'|'shape'|'any', attrs: { [attr]: string } }
 *
 * Reads/writes go through the optional host storage adapter when one is
 * registered (see userDataAdapter.js); otherwise they fall back to the
 * localStorage key below. The schema is identical on both paths.
 *
 * @module classLibrary
 */

import { getUserDataAdapter } from './userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-class-library'

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
 * Remove a preset by name.
 * @param {string} name
 * @returns {void}
 */
export const deleteClass = name => {
  writeClasses(getClasses().filter(c => c.name !== name))
}
