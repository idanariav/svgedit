import { describe, it, expect, afterEach, vi } from 'vitest'
import { setUserDataAdapter } from '../../src/editor/userDataAdapter.js'
import { loadToolOrder, saveToolOrder, reconcileToolOrder } from '../../src/editor/toolOrder.js'

const STORAGE_KEY = 'svg-edit-tool-order'

describe('reconcileToolOrder (pure)', () => {
  it('defaults to natural order with no overflow when nothing is stored', () => {
    expect(reconcileToolOrder(['a', 'b', 'c'], null)).toEqual({
      main: ['a', 'b', 'c'],
      overflow: []
    })
  })

  it('preserves stored order for known ids', () => {
    const stored = { main: ['c', 'a', 'b'], overflow: [] }
    expect(reconcileToolOrder(['a', 'b', 'c'], stored)).toEqual({
      main: ['c', 'a', 'b'],
      overflow: []
    })
  })

  it('drops stale ids no longer present', () => {
    const stored = { main: ['a', 'removed', 'b'], overflow: ['gone'] }
    expect(reconcileToolOrder(['a', 'b'], stored)).toEqual({
      main: ['a', 'b'],
      overflow: []
    })
  })

  it('appends newly-discovered ids to the end of main, preserving stored relative order', () => {
    const stored = { main: ['b', 'a'], overflow: ['c'] }
    expect(reconcileToolOrder(['a', 'b', 'c', 'd'], stored)).toEqual({
      main: ['b', 'a', 'd'],
      overflow: ['c']
    })
  })

  it('keeps overflow ids in overflow (not duplicated into main)', () => {
    const stored = { main: ['a'], overflow: ['b'] }
    const result = reconcileToolOrder(['a', 'b'], stored)
    expect(result.main).toEqual(['a'])
    expect(result.overflow).toEqual(['b'])
  })
})

describe('toolOrder persistence (localStorage fallback)', () => {
  afterEach(() => {
    setUserDataAdapter(null)
    localStorage.removeItem(STORAGE_KEY)
  })

  it('loadToolOrder returns null when nothing is stored', () => {
    expect(loadToolOrder()).toBeNull()
  })

  it('saveToolOrder writes a value readable back via loadToolOrder', () => {
    saveToolOrder({ main: ['a', 'b'], overflow: ['c'] })
    expect(loadToolOrder()).toEqual({ main: ['a', 'b'], overflow: ['c'] })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual({ main: ['a', 'b'], overflow: ['c'] })
  })

  it('saveToolOrder overwrites the previous value', () => {
    saveToolOrder({ main: ['a'], overflow: [] })
    saveToolOrder({ main: ['b'], overflow: ['a'] })
    expect(loadToolOrder()).toEqual({ main: ['b'], overflow: ['a'] })
  })
})

describe('toolOrder persistence (host adapter)', () => {
  afterEach(() => {
    setUserDataAdapter(null)
  })

  it('reads/writes through the adapter instead of localStorage when one is registered', () => {
    let store = null
    const adapter = {
      getToolOrder: vi.fn(() => store),
      setToolOrder: vi.fn((order) => { store = order })
    }
    setUserDataAdapter(adapter)

    expect(loadToolOrder()).toBeNull()
    saveToolOrder({ main: ['a'], overflow: ['b'] })
    expect(adapter.setToolOrder).toHaveBeenCalledWith({ main: ['a'], overflow: ['b'] })
    expect(loadToolOrder()).toEqual({ main: ['a'], overflow: ['b'] })
    expect(adapter.getToolOrder).toHaveBeenCalled()
  })
})
