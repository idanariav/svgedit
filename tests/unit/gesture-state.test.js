import { describe, it, expect } from 'vitest'
import { createGestureState, gestureLeftovers } from '../../packages/svgcanvas/core/gesture-state.ts'

// A canvas with every gesture slot at rest; a test overrides the one it is about.
const fakeCanvas = (over = {}) => ({
  gesture: createGestureState(),
  getStarted: () => false,
  getJustSelected: () => null,
  getRubberBox: () => null,
  stretch: { isActive: () => false },
  inTransaction: () => false,
  snapshotHistory: { previewing: false },
  ...over
})

describe('gestureLeftovers (the gesture rest check)', () => {
  it('is empty when every gesture slot is at rest', () => {
    expect(gestureLeftovers(fakeCanvas())).toEqual([])
  })

  it('ignores the fields that outlive a gesture on purpose', () => {
    const c = fakeCanvas()
    c.gesture.spaceKey = true
    c.gesture.addedNew = true
    c.gesture.pendingNewElement = {}
    expect(gestureLeftovers(c)).toEqual([])
  })

  it('names the canvas slots and open sessions', () => {
    const box = { getAttribute: () => 'inline' }
    const c = fakeCanvas({
      getStarted: () => true,
      getJustSelected: () => ({}),
      getRubberBox: () => box,
      stretch: { isActive: () => true },
      inTransaction: () => true,
      snapshotHistory: { previewing: true }
    })
    expect(gestureLeftovers(c)).toEqual(['started', 'justSelected', 'rubberBox shown', 'stretch', 'transaction open', 'preview open'])
  })

  it('names an active gesture', () => {
    expect(gestureLeftovers(fakeCanvas({ activeGesture: () => ({ kind: 'move' }) }))).toEqual(['active gesture: move'])
  })

  it('accepts a hidden rubber box', () => {
    expect(gestureLeftovers(fakeCanvas({ getRubberBox: () => ({ getAttribute: () => 'none' }) }))).toEqual([])
  })
})
