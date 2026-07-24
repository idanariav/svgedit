/**
 * toolOrder.js — persistence for the left panel's user-customized tool order.
 *
 * Stores which tool ids (the direct children of `#tools_left` — plain
 * `se-button`s and `se-flyingbutton` groups alike) sit in the main visible
 * row versus the "Additional tools" overflow bucket, and in what order.
 * Persists through the host `userDataAdapter` when it implements
 * `getToolOrder`/`setToolOrder`, else falls back to `localStorage` under
 * `svg-edit-tool-order` (the same pattern as favorites/hotkey persistence).
 *
 * @module toolOrder
 */
import { getUserDataAdapter } from './userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-tool-order'

/**
 * Read the persisted `{ main, overflow }` tool order, or `null` when nothing
 * has been customized yet (the caller should fall back to natural DOM order).
 * @returns {{main: string[], overflow: string[]}|null}
 */
export const loadToolOrder = () => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.getToolOrder === 'function') {
      return adapter.getToolOrder() || null
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    }
  } catch (err) {
    console.error('Failed to load tool order', err)
  }
  return null
}

/**
 * Persist the current tool order.
 * @param {{main: string[], overflow: string[]}} order
 * @returns {void}
 */
export const saveToolOrder = ({ main, overflow }) => {
  try {
    const value = { main: [...main], overflow: [...overflow] }
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.setToolOrder === 'function') {
      adapter.setToolOrder(value)
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }
  } catch (err) {
    console.error('Failed to persist tool order', err)
  }
}

/**
 * Reconcile a stored `{ main, overflow }` order against the tool ids that
 * actually exist right now. Pure/DOM-free so it's directly unit-testable.
 * - Stored ids that no longer exist (removed tool/extension) are dropped.
 * - Ids not seen in the stored order (a new tool/extension) default into
 *   `main`, appended at the end, preserving everyone else's relative order.
 * @param {string[]} currentIds ids in today's natural/default order
 * @param {{main: string[], overflow: string[]}|null} stored
 * @returns {{main: string[], overflow: string[]}}
 */
export const reconcileToolOrder = (currentIds, stored) => {
  const known = new Set(currentIds)
  const storedMain = (stored?.main ?? []).filter((id) => known.has(id))
  const storedOverflow = (stored?.overflow ?? []).filter((id) => known.has(id))
  const placed = new Set([...storedMain, ...storedOverflow])
  const fresh = currentIds.filter((id) => !placed.has(id))
  return { main: [...storedMain, ...fresh], overflow: storedOverflow }
}
