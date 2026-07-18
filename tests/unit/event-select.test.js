import { describe, expect, it } from 'vitest'
import { init as eventSelectInit } from '../../packages/svgcanvas/core/event-select.js'

// Minimal svgCanvas mock: only what `move()` touches before/at the
// accidental-move threshold check when selectedElements is empty (so the
// dummy-transform-insertion and per-element branches are no-ops).
const makeCanvas = () => ({
  getStartX: () => 0,
  getStartY: () => 0,
  getCurConfig: () => ({}),
  getCurrentGroup: () => null,
  call: () => {}
})

const makeCtx = (overrides) => ({
  selectedElements: [],
  selected: true,
  mouseTarget: null,
  svgRoot: null,
  rightClick: false,
  x: 0,
  y: 0,
  zoom: 1,
  ...overrides
})

describe('event-select move() drag threshold', () => {
  // Regression guard: the accidental-move threshold used to be a flat 4
  // *content* units, but dx/dy are unzoomed content-space deltas, so the
  // effective screen-space threshold scaled inversely with zoom instead of
  // staying constant.
  it('reaches the threshold on a 14-screen-px drag at zoom 4 (previously stuck)', () => {
    const svgCanvas = makeCanvas()
    const { move } = eventSelectInit(svgCanvas)
    // 14 screen px at zoom 4 == 3.5 content units, which is under the old
    // flat threshold of 4 -- the drag would previously do nothing.
    move({ shiftKey: false }, makeCtx({ x: 3.5, zoom: 4 }))

    expect(svgCanvas.moveSelectionThresholdReached).toBe(true)
  })

  it('does not fire on a 2-screen-px drag at zoom 0.25 (previously too sensitive)', () => {
    const svgCanvas = makeCanvas()
    const { move } = eventSelectInit(svgCanvas)
    // 2 screen px at zoom 0.25 == 8 content units, which cleared the old flat
    // threshold of 4 -- objects moved on a drag far smaller than the
    // intended 4-screen-px accidental-move guard.
    move({ shiftKey: false }, makeCtx({ x: 8, zoom: 0.25 }))

    expect(svgCanvas.moveSelectionThresholdReached).toBeFalsy()
  })
})
