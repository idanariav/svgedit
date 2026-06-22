/**
 * userShapes.js — persistence utilities for user-saved shape library entries.
 *
 * Reads/writes go through the optional host storage adapter when one is
 * registered (see userDataAdapter.js); otherwise they fall back to localStorage
 * under the key below. The schema is identical on both paths.
 *
 * Storage key: 'svg-edit-user-shapes'
 * Schema:
 *   {
 *     categories: string[],        // ordered list of user-defined category names
 *     shapes: {
 *       [category]: {
 *         // `linkedFile` is optional — a provenance link an embedding host can
 *         // stamp onto every inserted element (see ext-shapes.js).
 *         [label]: { svgContent: string, bbox: { x, y, width, height }, linkedFile?: string }
 *       }
 *     },
 *     // Non-destructive overrides layered on top of the (read-only) bundled
 *     // shape library — these never mutate the bundled JSON:
 *     categoryLabels: { [catId]: string },  // display-name overrides (built-in id or raw user cat name)
 *     hidden: string[]                       // built-in category ids hidden from the library
 *   }
 */

import { getUserDataAdapter } from '../../userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-user-shapes'

/**
 * Validate an already-parsed store object into a safe
 * { categories, shapes, categoryLabels, hidden } shape. Returns a safe default
 * if the data is missing or corrupt.
 * @param {*} raw
 * @returns {{ categories: string[], shapes: Object, categoryLabels: Object, hidden: string[] }}
 */
function normalizeStore (raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { categories: [], shapes: {}, categoryLabels: {}, hidden: [] }
  }

  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter(c => typeof c === 'string')
    : []

  const rawShapes = (raw.shapes && typeof raw.shapes === 'object' && !Array.isArray(raw.shapes))
    ? raw.shapes
    : {}

  // Validate each shape entry
  const shapes = {}
  for (const cat of categories) {
    const catData = rawShapes[cat]
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      shapes[cat] = {}
      for (const [label, entry] of Object.entries(catData)) {
        if (
          entry &&
          typeof entry.svgContent === 'string' &&
          entry.bbox &&
          typeof entry.bbox.width === 'number' &&
          typeof entry.bbox.height === 'number'
        ) {
          shapes[cat][label] = entry
        }
      }
    } else {
      shapes[cat] = {}
    }
  }

  // Display-name overrides for any category (built-in id or raw user cat name)
  const categoryLabels = {}
  if (raw.categoryLabels && typeof raw.categoryLabels === 'object' && !Array.isArray(raw.categoryLabels)) {
    for (const [id, label] of Object.entries(raw.categoryLabels)) {
      if (typeof label === 'string' && label.trim()) categoryLabels[id] = label
    }
  }

  // Built-in category ids hidden from the library
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter(c => typeof c === 'string')
    : []

  return { categories, shapes, categoryLabels, hidden }
}

/**
 * Load and validate the user shapes store. Reads from the host storage adapter
 * when configured, otherwise from localStorage. Returns a safe default if the
 * data is missing or corrupt.
 * @returns {{ categories: string[], shapes: Object }}
 */
export function loadUserShapes () {
  const adapter = getUserDataAdapter()
  if (adapter) {
    return normalizeStore(adapter.getUserShapes())
  }
  let raw
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    raw = null
  }
  return normalizeStore(raw)
}

/**
 * Persist the full store. Writes to the host storage adapter when configured,
 * otherwise to localStorage.
 * @param {{ categories: string[], shapes: Object }} store
 */
export function saveUserShapes (store) {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setUserShapes(store)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/**
 * Add (or overwrite) a shape. Creates the category if it doesn't exist.
 * @param {{ category: string, label: string, svgContent: string, bbox: {x,y,width,height}, linkedFile?: ?string }} opts
 */
export function addUserShape ({ category, label, svgContent, bbox, linkedFile }) {
  const store = loadUserShapes()

  // Normalize: trim whitespace and lowercase so "Animals" and "animals" merge
  category = category.trim().toLowerCase()

  if (!store.categories.includes(category)) {
    store.categories.push(category)
  }
  if (!store.shapes[category]) {
    store.shapes[category] = {}
  }

  const entry = { svgContent, bbox }
  if (linkedFile) entry.linkedFile = linkedFile
  store.shapes[category][label] = entry
  saveUserShapes(store)
}

/**
 * Remove a shape by category + label.
 * If the category becomes empty, it is removed too.
 * @param {{ category: string, label: string }} opts
 */
export function removeUserShape ({ category, label }) {
  const store = loadUserShapes()

  if (!store.shapes[category]) return

  delete store.shapes[category][label]

  if (Object.keys(store.shapes[category]).length === 0) {
    delete store.shapes[category]
    store.categories = store.categories.filter(c => c !== category)
  }

  saveUserShapes(store)
}

/**
 * Rename a shape within a category (changes its label/key, preserving order).
 * No-op if the source is missing; refuses to overwrite an existing newLabel.
 * @param {{ category: string, oldLabel: string, newLabel: string }} opts
 */
export function renameUserShape ({ category, oldLabel, newLabel }) {
  const store = loadUserShapes()
  const catData = store.shapes[category]
  newLabel = (newLabel || '').trim()
  if (!catData || !(oldLabel in catData) || !newLabel || oldLabel === newLabel) return
  if (newLabel in catData) return // don't clobber an existing shape

  // Rebuild the map to keep insertion order, swapping the key in place.
  store.shapes[category] = Object.fromEntries(
    Object.entries(catData).map(([k, v]) => [k === oldLabel ? newLabel : k, v])
  )
  saveUserShapes(store)
}

/**
 * Move a shape to another category, creating the target if needed and dropping
 * the source category when it becomes empty.
 * @param {{ category: string, label: string, toCategory: string }} opts
 */
export function moveUserShape ({ category, label, toCategory }) {
  const store = loadUserShapes()
  toCategory = (toCategory || '').trim().toLowerCase()
  const catData = store.shapes[category]
  if (!catData || !(label in catData) || !toCategory || toCategory === category) return

  if (!store.categories.includes(toCategory)) store.categories.push(toCategory)
  if (!store.shapes[toCategory]) store.shapes[toCategory] = {}
  store.shapes[toCategory][label] = catData[label]

  delete catData[label]
  if (Object.keys(catData).length === 0) {
    delete store.shapes[category]
    store.categories = store.categories.filter(c => c !== category)
  }
  saveUserShapes(store)
}

/**
 * Delete a user category outright, along with every shape it contains.
 * @param {{ category: string }} opts
 */
export function deleteUserCategory ({ category }) {
  const store = loadUserShapes()
  delete store.shapes[category]
  store.categories = store.categories.filter(c => c !== category)
  if (store.categoryLabels[category]) delete store.categoryLabels[category]
  saveUserShapes(store)
}

/**
 * Rename a user category. If the new name resolves to an existing category
 * (user or built-in), the two are **merged** — every shape moves into the target
 * (source wins on label conflicts) and the old category is removed. A
 * display-label override preserves the typed casing for the target.
 * @param {{ category: string, newName: string }} opts
 */
export function renameUserCategory ({ category, newName }) {
  const store = loadUserShapes()
  const label = (newName || '').trim()
  const target = label.toLowerCase()
  if (!target) return

  // Pure relabel (same underlying key, casing/label only)
  if (target === category) {
    store.categoryLabels[category] = label
    saveUserShapes(store)
    return
  }

  // Merge source shapes into the target category (created on demand).
  const src = store.shapes[category] || {}
  if (!store.categories.includes(target)) store.categories.push(target)
  if (!store.shapes[target]) store.shapes[target] = {}
  Object.assign(store.shapes[target], src)

  // Drop the old category and migrate its label override to the target.
  delete store.shapes[category]
  store.categories = store.categories.filter(c => c !== category)
  delete store.categoryLabels[category]
  store.categoryLabels[target] = label

  saveUserShapes(store)
}

/**
 * Set a display-name override for a category (built-in id or raw user cat name).
 * @param {{ category: string, label: string }} opts
 */
export function setCategoryLabel ({ category, label }) {
  const store = loadUserShapes()
  label = (label || '').trim()
  if (!label) { delete store.categoryLabels[category] } else { store.categoryLabels[category] = label }
  saveUserShapes(store)
}

/**
 * Clear a display-name override, reverting to the default label.
 * @param {{ category: string }} opts
 */
export function clearCategoryLabel ({ category }) {
  const store = loadUserShapes()
  delete store.categoryLabels[category]
  saveUserShapes(store)
}

/**
 * Hide a built-in category from the library (non-destructive — bundled data
 * is untouched and the category can be restored with unhideCategory).
 * @param {{ category: string }} opts
 */
export function hideCategory ({ category }) {
  const store = loadUserShapes()
  if (!store.hidden.includes(category)) store.hidden.push(category)
  saveUserShapes(store)
}

/**
 * Restore a previously hidden built-in category.
 * @param {{ category: string }} opts
 */
export function unhideCategory ({ category }) {
  const store = loadUserShapes()
  store.hidden = store.hidden.filter(c => c !== category)
  saveUserShapes(store)
}

/**
 * Return the list of hidden built-in category ids.
 * @returns {string[]}
 */
export function getHiddenCategories () {
  return loadUserShapes().hidden
}

/**
 * Return all existing user category names in insertion order.
 * @returns {string[]}
 */
export function getUserCategories () {
  return loadUserShapes().categories
}

/**
 * Return all shapes for a given category.
 * @param {string} category
 * @returns {Object}  { [label]: { svgContent, bbox } }
 */
export function getUserShapesForCategory (category) {
  return loadUserShapes().shapes[category] || {}
}
