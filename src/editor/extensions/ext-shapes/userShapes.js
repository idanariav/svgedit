/**
 * userShapes.js — localStorage utilities for user-saved shape library entries.
 *
 * Storage key: 'svg-edit-user-shapes'
 * Schema:
 *   {
 *     categories: string[],        // ordered list of user-defined category names
 *     shapes: {
 *       [category]: {
 *         [label]: { svgContent: string, bbox: { x, y, width, height } }
 *       }
 *     }
 *   }
 */

const STORAGE_KEY = 'svg-edit-user-shapes'

/**
 * Load and validate the user shapes store from localStorage.
 * Returns a safe default if the data is missing or corrupt.
 * @returns {{ categories: string[], shapes: Object }}
 */
export function loadUserShapes () {
  let raw
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    raw = null
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { categories: [], shapes: {} }
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

  return { categories, shapes }
}

/**
 * Persist the full store to localStorage.
 * @param {{ categories: string[], shapes: Object }} store
 */
export function saveUserShapes (store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/**
 * Add (or overwrite) a shape. Creates the category if it doesn't exist.
 * @param {{ category: string, label: string, svgContent: string, bbox: {x,y,width,height} }} opts
 */
export function addUserShape ({ category, label, svgContent, bbox }) {
  const store = loadUserShapes()

  // Normalize: trim whitespace and lowercase so "Animals" and "animals" merge
  category = category.trim().toLowerCase()

  if (!store.categories.includes(category)) {
    store.categories.push(category)
  }
  if (!store.shapes[category]) {
    store.shapes[category] = {}
  }

  store.shapes[category][label] = { svgContent, bbox }
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
