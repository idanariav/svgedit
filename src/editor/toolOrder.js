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
import { error as logError } from '@svgedit/svgcanvas/common/logger.js'

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
    logError('Failed to load tool order', err, 'toolOrder')
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
    logError('Failed to persist tool order', err, 'toolOrder')
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

/**
 * Default grouping of the left toolbar, in display order. Tools in the same
 * group sit together; a divider is drawn wherever the group changes (see
 * `groupOf`). Within a group the listed order is the default order. Ids not
 * listed (third-party extensions) fall into the trailing "other" group.
 */
export const TOOL_GROUPS = [
  ['tool_select', 'ext-panning'],
  ['tool_fhpath', 'tool_brush', 'tool_path', 'tool_curvature', 'tool_line'],
  ['tools_shapes', 'tool_shapelib'],
  ['tool_text', 'tool_image'],
  ['tool_cutter', 'tool_puppet_warp', 'tool_eyedropper']
]

/**
 * @param {string} id
 * @returns {number} index into TOOL_GROUPS, or TOOL_GROUPS.length for "other"
 */
export const groupOf = (id) => {
  const i = TOOL_GROUPS.findIndex((g) => g.includes(id))
  return i === -1 ? TOOL_GROUPS.length : i
}

/**
 * Canonical default order: grouped, then the listed order within each group;
 * unlisted ids keep their relative (DOM) order at the end.
 * @param {string[]} currentIds ids in natural DOM order
 * @returns {string[]}
 */
export const defaultToolOrder = (currentIds) => {
  const listed = TOOL_GROUPS.flat()
  const known = listed.filter((id) => currentIds.includes(id))
  return [...known, ...currentIds.filter((id) => !listed.includes(id))]
}

/**
 * True when a stored order is just a snapshot of the natural DOM order saved
 * by an earlier version (nothing moved to overflow, nothing reordered), i.e.
 * the user never customised it and may adopt the new grouped default.
 * @param {string[]} currentIds
 * @param {{main: string[], overflow: string[]}|null} stored
 * @returns {boolean}
 */
export const isUncustomisedOrder = (currentIds, stored) =>
  !stored || (
    (stored.overflow ?? []).length === 0 &&
    stored.main.length === currentIds.length &&
    stored.main.every((id, i) => id === currentIds[i])
  )

/**
 * Flag the first tool of each group so CSS can draw a divider above it. Derived
 * from the current order (not stored), so it stays right after any reorder.
 * @param {Element} container `#tools_left`
 * @returns {void}
 */
export const markToolGroups = (container) => {
  let prev = null
  Array.from(container.children).forEach((el) => {
    if (!el.id || el.id === 'tools_overflow') return
    const g = groupOf(el.id)
    el.classList.toggle('tool-group-start', prev !== null && g !== prev)
    prev = g
  })
}
