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

import { getUserDataAdapter } from './userDataAdapter.ts'

const STORAGE_KEY = 'svg-edit-custom-brushes'

export const BRUSH_SLOT_COUNT = 5

/**
 * Read the raw slot map from storage.
 * @returns Sparse map, keys `0`-`4`.
 */
export const loadBrushSlots = (): Record<number, Record<string, any>> => {
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

const writeBrushSlots = (slots: Record<number, any>) => {
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
 * @param index - 0-4.
 * @returns The saved brush params, or null if the slot is empty.
 */
export const getBrushSlot = (index: number): Record<string, any> | null => loadBrushSlots()[index] ?? null

/**
 * Save (or overwrite) a brush preset into a slot.
 * @param index - 0-4.
 * @param params - Brush params to store.
 */
export const saveBrushSlot = (index: number, params: any): void => {
  const slots = loadBrushSlots()
  slots[index] = { ...params }
  writeBrushSlots(slots)
}

/**
 * Rename a saved slot without touching its brush params. No-op on an empty slot.
 * @param index - 0-4.
 * @param name - New display name.
 */
export const renameBrushSlot = (index: number, name: string): void => {
  const slots = loadBrushSlots()
  if (!slots[index]) return
  slots[index] = { ...slots[index], name }
  writeBrushSlots(slots)
}

/**
 * Clear a slot.
 * @param index - 0-4.
 */
export const deleteBrushSlot = (index: number): void => {
  const slots = loadBrushSlots()
  delete slots[index]
  writeBrushSlots(slots)
}
