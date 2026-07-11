/**
 * Custom brush presets — up to 5 saved slots for the freehand brush tool's
 * settings (thickness, angle, roundness, taper start/end, opacity,
 * smoothness). Storage shape mirrors `classLibrary.js` / `sePalette.js`
 * (adapter-first, `localStorage` fallback), but slot-indexed like
 * `sePalette.js`'s sparse overrides map — "save up to 5 brushes (including
 * overwrite or remove)" is a fixed-slot model, not an unbounded named
 * library.
 *
 * @module customBrushes
 */

import { getUserDataAdapter } from './userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-custom-brushes'

export const BRUSH_SLOT_COUNT = 5

/**
 * Read the raw slot map from storage.
 * @returns {Object<number, Object>} Sparse map, keys `0`-`4`.
 */
export const loadBrushSlots = () => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getBrushes?.()
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeBrushSlots = (slots) => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setBrushes?.(slots)
    return
  }
  try {
    if (Object.keys(slots).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
    }
  } catch {
    /* storage may be unavailable (private mode); fail silently */
  }
}

/**
 * @param {number} index - 0-4.
 * @returns {?Object} The saved brush params, or null if the slot is empty.
 */
export const getBrushSlot = (index) => loadBrushSlots()[index] ?? null

/**
 * Save (or overwrite) a brush preset into a slot.
 * @param {number} index - 0-4.
 * @param {Object} params - Brush params to store.
 * @returns {void}
 */
export const saveBrushSlot = (index, params) => {
  const slots = loadBrushSlots()
  slots[index] = { ...params }
  writeBrushSlots(slots)
}

/**
 * Clear a slot.
 * @param {number} index - 0-4.
 * @returns {void}
 */
export const deleteBrushSlot = (index) => {
  const slots = loadBrushSlots()
  delete slots[index]
  writeBrushSlots(slots)
}
