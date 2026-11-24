import { describe, it, expect } from 'vitest'
import { DRAG_PX, isDrag, createDragIntent } from '../../packages/svgcanvas/core/pointer-intent.ts'

describe('pointer intent (click versus drag)', () => {
  it('a press that moves less than DRAG_PX is a click; reaching it is a drag', () => {
    expect(DRAG_PX).toBe(4)
    expect(isDrag(3, 0)).toBe(false)
    expect(isDrag(3.99, 0)).toBe(false)
    expect(isDrag(4, 0)).toBe(true)
    expect(isDrag(0, -5)).toBe(true)
  })

  it('measures the distance straight, not each axis on its own', () => {
    expect(isDrag(3, 3)).toBe(true) // 4.24 px
    expect(isDrag(2, 2)).toBe(false) // 2.83 px
  })

  it('a pointer with no usable coordinates is never a drag', () => {
    expect(isDrag(Number.NaN, 10)).toBe(false)
    expect(isDrag(Infinity, 0)).toBe(false)
  })

  it('a drag stays a drag when the pointer comes back', () => {
    const intent = createDragIntent(100, 100)
    expect(intent.update(102, 101)).toBe(false)
    expect(intent.dragging).toBe(false)
    expect(intent.update(106, 100)).toBe(true)
    expect(intent.update(100, 100)).toBe(true)
    expect(intent.dragging).toBe(true)
  })
})
