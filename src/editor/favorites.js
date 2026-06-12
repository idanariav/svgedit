/**
 * favorites.js — persistence for the user's quick-action favorites.
 *
 * Stores an ordered array of action IDs (hotkey-registry IDs plus the
 * catalog-only value-control / paste IDs defined in `favoriteActions.js`). The
 * order is the display order in the right-click quick-action menu. Persists
 * through the host `userDataAdapter` when it implements `getFavorites` /
 * `setFavorites`, else falls back to `localStorage` under `svg-edit-favorites`
 * (the same pattern as palette / hotkey persistence).
 *
 * @module favorites
 */
import { getUserDataAdapter } from './userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-favorites'

// Seeded when the user has not curated a list yet, so the right-click menu is
// never empty (mirrors the original context-menu essentials).
export const DEFAULT_FAVORITES = ['cut', 'copy', 'paste', 'delete_selected']

/**
 * Read the raw stored list (no default seeding).
 * @returns {string[]}
 */
const readStored = () => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.getFavorites === 'function') {
      return adapter.getFavorites() || []
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    }
  } catch (err) {
    console.error('Failed to load favorites', err)
  }
  return []
}

/**
 * The user's favorites, falling back to `DEFAULT_FAVORITES` when none are set.
 * @returns {string[]}
 */
export const loadFavorites = () => {
  const stored = readStored()
  return stored.length ? stored : [...DEFAULT_FAVORITES]
}

/**
 * Persist the favorites list.
 * @param {string[]} ids
 * @returns {void}
 */
export const saveFavorites = (ids) => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.setFavorites === 'function') {
      adapter.setFavorites([...ids])
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
    }
  } catch (err) {
    console.error('Failed to persist favorites', err)
  }
}

/**
 * Toggle an action's favorite state, preserving order on add. When the user has
 * not curated a list yet, the default seed is materialised first so their edit
 * starts from the defaults they can see in the menu.
 * @param {string} id
 * @returns {string[]} the new list
 */
export const toggleFavorite = (id) => {
  const stored = readStored()
  const base = stored.length ? stored : [...DEFAULT_FAVORITES]
  const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
  saveFavorites(next)
  return next
}
