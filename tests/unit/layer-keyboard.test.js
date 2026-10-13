import { describe, it, expect } from 'vitest'
import { planNav } from '../../src/editor/panels/layerKeyboard.js'

// layer A (open) > group G (closed) , rect R ; layer B (closed)
const L = (open) => ({ level: 1, expandable: true, open })
const O = (level = 2, expandable = false, open = false) => ({ level, expandable, open })
const rows = [L(true), O(2, true, false), O(2), L(false)]

describe('planNav (layer panel keyboard)', () => {
  it('moves the active row with the arrows, Home and End, and stops at the ends', () => {
    expect(planNav(rows, 0, 'ArrowDown')).toEqual({ focus: 1 })
    expect(planNav(rows, 3, 'ArrowDown')).toBeNull()
    expect(planNav(rows, 2, 'ArrowUp')).toEqual({ focus: 1 })
    expect(planNav(rows, 0, 'ArrowUp')).toBeNull()
    expect(planNav(rows, 2, 'Home')).toEqual({ focus: 0 })
    expect(planNav(rows, 0, 'End')).toEqual({ focus: 3 })
    expect(planNav(rows, 3, 'End')).toBeNull()
  })

  it('→ opens a closed layer or group, then steps into it', () => {
    expect(planNav(rows, 1, 'ArrowRight')).toEqual({ open: 1 })
    expect(planNav(rows, 3, 'ArrowRight')).toEqual({ open: 3 })
    expect(planNav(rows, 0, 'ArrowRight')).toEqual({ focus: 1 }) // open, has children
    expect(planNav(rows, 2, 'ArrowRight')).toBeNull() // a plain object
  })

  it('→ on an open parent with nothing under it stays put', () => {
    expect(planNav([L(true), L(true)], 0, 'ArrowRight')).toBeNull()
  })

  it('← closes an open parent, else goes to the parent row', () => {
    expect(planNav(rows, 0, 'ArrowLeft')).toEqual({ close: 0 })
    expect(planNav(rows, 2, 'ArrowLeft')).toEqual({ focus: 0 })
    expect(planNav(rows, 1, 'ArrowLeft')).toEqual({ focus: 0 }) // a closed group goes to its layer
    expect(planNav(rows, 3, 'ArrowLeft')).toBeNull() // a closed layer has no parent
  })

  it('a nested object goes to its group, not the layer', () => {
    const deep = [L(true), O(2, true, true), O(3), O(2)]
    expect(planNav(deep, 2, 'ArrowLeft')).toEqual({ focus: 1 })
    expect(planNav(deep, 3, 'ArrowLeft')).toEqual({ focus: 0 })
  })

  it('ignores other keys and starts at the top with no active row', () => {
    expect(planNav(rows, 0, 'a')).toBeNull()
    expect(planNav(rows, -1, 'ArrowDown')).toEqual({ focus: 0 })
    expect(planNav([], -1, 'ArrowDown')).toBeNull()
  })
})
