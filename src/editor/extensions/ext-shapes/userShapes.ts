/**
 * userShapes.ts — persistence utilities for user-saved shape library entries.
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

import { getUserDataAdapter } from '../../userDataAdapter.ts'

const STORAGE_KEY = 'svg-edit-user-shapes'

/** one saved shape */
export interface UserShape {
  svgContent: string
  bbox: { x: number, y: number, width: number, height: number }
  /** provenance link an embedding host can stamp onto the inserted element */
  linkedFile?: string
}

/** the saved shapes (the schema above) */
export interface UserShapeStore {
  categories: string[]
  shapes: Record<string, Record<string, UserShape>>
  categoryLabels: Record<string, string>
  hidden: string[]
}

/**
 * Validate an already-parsed store object into a safe
 * { categories, shapes, categoryLabels, hidden } shape. Returns a safe default
 * if the data is missing or corrupt.
 */
function normalizeStore (raw: unknown): UserShapeStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { categories: [], shapes: {}, categoryLabels: {}, hidden: [] }
  }

  const store = raw as Partial<Record<keyof UserShapeStore, unknown>>
  const categories: string[] = Array.isArray(store.categories)
    ? store.categories.filter((c: unknown) => typeof c === 'string')
    : []

  const rawShapes = (store.shapes && typeof store.shapes === 'object' && !Array.isArray(store.shapes))
    ? store.shapes as Record<string, unknown>
    : {}

  // Validate each shape entry
  const shapes: UserShapeStore['shapes'] = {}
  for (const cat of categories) {
    const catData = rawShapes[cat]
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      shapes[cat] = {}
      for (const [label, entry] of Object.entries(catData as Record<string, UserShape>)) {
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
  const categoryLabels: Record<string, string> = {}
  if (store.categoryLabels && typeof store.categoryLabels === 'object' && !Array.isArray(store.categoryLabels)) {
    for (const [id, label] of Object.entries(store.categoryLabels as Record<string, unknown>)) {
      if (typeof label === 'string' && label.trim()) categoryLabels[id] = label
    }
  }

  // Built-in category ids hidden from the library
  const hidden = Array.isArray(store.hidden)
    ? store.hidden.filter((c: unknown) => typeof c === 'string')
    : []

  return { categories, shapes, categoryLabels, hidden }
}

/**
 * Load and validate the user shapes store. Reads from the host storage adapter
 * when configured, otherwise from localStorage. Returns a safe default if the
 * data is missing or corrupt.
 */
export function loadUserShapes (): UserShapeStore {
  const adapter = getUserDataAdapter()
  if (adapter) {
    return normalizeStore(adapter.getUserShapes?.())
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
 */
export function saveUserShapes (store: UserShapeStore) {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setUserShapes?.(store)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/** Add (or overwrite) a shape. Creates the category if it doesn't exist. */
export function addUserShape ({ category, label, svgContent, bbox, linkedFile }: { category: string, label: string, svgContent: string, bbox: UserShape['bbox'], linkedFile?: (string | null) }) {
  const store = loadUserShapes()

  // Normalize: trim whitespace and lowercase so "Animals" and "animals" merge
  category = category.trim().toLowerCase()

  if (!store.categories.includes(category)) {
    store.categories.push(category)
  }
  if (!store.shapes[category]) {
    store.shapes[category] = {}
  }

  const entry: UserShape = { svgContent, bbox }
  if (linkedFile) entry.linkedFile = linkedFile
  store.shapes[category][label] = entry
  saveUserShapes(store)
}

/**
 * Remove a shape by category + label.
 * If the category becomes empty, it is removed too.
 */
export function removeUserShape ({ category, label }: { category: string, label: string }) {
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
 */
export function renameUserShape ({ category, oldLabel, newLabel }: { category: string, oldLabel: string, newLabel: string }) {
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
 */
export function moveUserShape ({ category, label, toCategory }: { category: string, label: string, toCategory: string }) {
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

/** Delete a user category outright, along with every shape it contains. */
export function deleteUserCategory ({ category }: { category: string }) {
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
 */
export function renameUserCategory ({ category, newName }: { category: string, newName: string }) {
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

/** Set a display-name override for a category (built-in id or raw user cat name). */
export function setCategoryLabel ({ category, label }: { category: string, label: string }) {
  const store = loadUserShapes()
  label = (label || '').trim()
  if (!label) { delete store.categoryLabels[category] } else { store.categoryLabels[category] = label }
  saveUserShapes(store)
}

/** Clear a display-name override, reverting to the default label. */
export function clearCategoryLabel ({ category }: { category: string }) {
  const store = loadUserShapes()
  delete store.categoryLabels[category]
  saveUserShapes(store)
}

/**
 * Hide a built-in category from the library (non-destructive — bundled data
 * is untouched and the category can be restored with unhideCategory).
 */
export function hideCategory ({ category }: { category: string }) {
  const store = loadUserShapes()
  if (!store.hidden.includes(category)) store.hidden.push(category)
  saveUserShapes(store)
}

/** Restore a previously hidden built-in category. */
export function unhideCategory ({ category }: { category: string }) {
  const store = loadUserShapes()
  store.hidden = store.hidden.filter((c: string) => c !== category)
  saveUserShapes(store)
}

/** Return the list of hidden built-in category ids. */
export function getHiddenCategories (): string[] {
  return loadUserShapes().hidden
}

/** Return all existing user category names in insertion order. */
export function getUserCategories (): string[] {
  return loadUserShapes().categories
}

/**
 * Return all shapes for a given category.
 * @returns { [label]: { svgContent, bbox } }
 */
export function getUserShapesForCategory (category: string): Record<string, UserShape> {
  return loadUserShapes().shapes[category] || {}
}

/** Return every existing user shape label across all categories, deduplicated. */
export function getAllUserShapeLabels (): string[] {
  const store = loadUserShapes()
  const labels = new Set<string>()
  for (const cat of store.categories) {
    for (const label of Object.keys(store.shapes[cat] || {})) labels.add(label)
  }
  return [...labels]
}
