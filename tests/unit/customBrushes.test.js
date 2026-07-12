import { describe, it, expect, afterEach, vi } from 'vitest'
import { setUserDataAdapter } from '../../src/editor/userDataAdapter.js'
import {
  BRUSH_SLOT_COUNT,
  loadBrushSlots,
  getBrushSlot,
  saveBrushSlot,
  deleteBrushSlot,
  renameBrushSlot
} from '../../src/editor/customBrushes.js'

const STORAGE_KEY = 'svg-edit-custom-brushes'

describe('customBrushes (localStorage fallback)', () => {
  afterEach(() => {
    setUserDataAdapter(null)
    localStorage.removeItem(STORAGE_KEY)
  })

  it('exposes a 5-slot capacity constant', () => {
    expect(BRUSH_SLOT_COUNT).toBe(5)
  })

  it('loadBrushSlots returns {} when nothing is stored', () => {
    expect(loadBrushSlots()).toEqual({})
  })

  it('getBrushSlot returns null for an empty slot', () => {
    expect(getBrushSlot(0)).toBeNull()
  })

  it('saveBrushSlot writes a slot readable back via getBrushSlot', () => {
    const params = { thickness: 8, angle: 30, roundness: 0, taperStart: 100, taperEnd: 0, opacity: 1, smoothness: 0.3 }
    saveBrushSlot(2, params)
    expect(getBrushSlot(2)).toEqual(params)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))[2]).toEqual(params)
  })

  it('saveBrushSlot overwrites an existing slot', () => {
    saveBrushSlot(0, { thickness: 1 })
    saveBrushSlot(0, { thickness: 2 })
    expect(getBrushSlot(0)).toEqual({ thickness: 2 })
  })

  it('deleteBrushSlot clears a slot without touching others', () => {
    saveBrushSlot(0, { thickness: 1 })
    saveBrushSlot(1, { thickness: 2 })
    deleteBrushSlot(0)
    expect(getBrushSlot(0)).toBeNull()
    expect(getBrushSlot(1)).toEqual({ thickness: 2 })
  })

  it('removes the localStorage key entirely once the last slot is deleted', () => {
    saveBrushSlot(0, { thickness: 1 })
    deleteBrushSlot(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('renameBrushSlot sets a name without touching the stored params', () => {
    saveBrushSlot(0, { thickness: 5, angle: 20 })
    renameBrushSlot(0, 'Calligraphy')
    expect(getBrushSlot(0)).toEqual({ thickness: 5, angle: 20, name: 'Calligraphy' })
  })

  it('renameBrushSlot is a no-op on an empty slot', () => {
    renameBrushSlot(3, 'Nope')
    expect(getBrushSlot(3)).toBeNull()
  })
})

describe('customBrushes (host adapter)', () => {
  afterEach(() => {
    setUserDataAdapter(null)
  })

  it('reads/writes through the adapter instead of localStorage when one is registered', () => {
    const store = {}
    const adapter = {
      getBrushes: vi.fn(() => store),
      setBrushes: vi.fn((slots) => Object.assign(store, { ...slots }))
    }
    setUserDataAdapter(adapter)

    saveBrushSlot(4, { thickness: 12 })
    expect(adapter.setBrushes).toHaveBeenCalled()
    expect(getBrushSlot(4)).toEqual({ thickness: 12 })
    expect(adapter.getBrushes).toHaveBeenCalled()
  })
})
