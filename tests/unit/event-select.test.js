import { describe, expect, it } from 'vitest'
import { init as eventSelectInit } from '../../packages/svgcanvas/core/event-select.ts'
import { createGestureState } from '../../packages/svgcanvas/core/gesture-state.ts'

// Minimal svgCanvas mock: only what `move()` touches before/at the
// accidental-move threshold check when selectedElements is empty (so the
// dummy-transform-insertion and per-element branches are no-ops).
const makeCanvas = () => ({
  gesture: createGestureState(),
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

describe('event-select down() background click', () => {
  // Regression guard: clicking a *different element* clears pathActions'
  // double-click arming state (svgCanvas.pathActions.clear()), but clicking
  // empty canvas didn't — leaving that state pointing at whatever path was
  // selected before, so a later click on an unrelated path could jump
  // straight into that stale path's node-edit mode. See path-actions.js
  // select()/#currentPath and the "select-mode epilogue" comment in event.js.
  const makeBgCanvas = () => {
    const calls = []
    const rubberBox = { setAttribute: () => {} }
    return {
      calls,
      setStarted: () => {},
      setCurrentResizeMode: () => {},
      clearSelection: () => calls.push('clearSelection'),
      pathActions: { clear: () => calls.push('pathActions.clear') },
      setCurrentMode: () => calls.push('setCurrentMode'),
      getRubberBox: () => rubberBox,
      requireRubberBox: () => rubberBox,
      selectorManager: { getRubberBandBox: () => rubberBox },
      getRStartX: () => 0,
      getRStartY: () => 0,
      setRStartX: () => {},
      setRStartY: () => {}
    }
  }

  it('clears pathActions arming state, same as clicking a different element', () => {
    const svgCanvas = makeBgCanvas()
    const { down } = eventSelectInit(svgCanvas)
    const svgRoot = {}

    down({ shiftKey: false }, makeCtx({ mouseTarget: svgRoot, svgRoot, selectedElements: [] }))

    expect(svgCanvas.calls).toContain('pathActions.clear')
  })
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

    expect(svgCanvas.gesture.moveSelectionThresholdReached).toBe(true)
  })

  it('does not fire on a 2-screen-px drag at zoom 0.25 (previously too sensitive)', () => {
    const svgCanvas = makeCanvas()
    const { move } = eventSelectInit(svgCanvas)
    // 2 screen px at zoom 0.25 == 8 content units, which cleared the old flat
    // threshold of 4 -- objects moved on a drag far smaller than the
    // intended 4-screen-px accidental-move guard.
    move({ shiftKey: false }, makeCtx({ x: 8, zoom: 0.25 }))

    expect(svgCanvas.gesture.moveSelectionThresholdReached).toBeFalsy()
  })
})

describe('event-select move() alt-drag-to-duplicate', () => {
  // Regression guard: cloneSelectedElements() used to fire unconditionally
  // at mousedown on any altKey:true click (see event.js), stamping an
  // invisible duplicate (offset 0,0, on top of the original) on a plain
  // alt+click that never actually dragged, or on any mousedown where the
  // browser/OS misreports a stale altKey:true. event.js now only arms the
  // intent (svgCanvas.gesture.altCloneArmed); the actual clone happens here, gated
  // on the same real-drag distance threshold used for an ordinary move.
  const makeCloneCanvas = () => {
    const calls = []
    return { ...makeCanvas(), calls, cloneSelectedElements: (dx, dy) => calls.push({ dx, dy }) }
  }

  it('does not clone while still under the real-drag threshold, and touches nothing else', () => {
    const svgCanvas = makeCloneCanvas()
    svgCanvas.gesture.altCloneArmed = true
    const { move } = eventSelectInit(svgCanvas)

    // 1 content unit at zoom 1, well under the 4-screen-px threshold.
    move({ shiftKey: false }, makeCtx({ selectedElements: [{}], x: 1, zoom: 1 }))

    expect(svgCanvas.calls).toEqual([])
    expect(svgCanvas.gesture.altCloneArmed).toBe(true) // still armed -- next tick gets another chance
    expect(svgCanvas.gesture.hasDragStartTransform).toBe(false) // no dummy transform inserted on the original
  })

  it('clones exactly once the drag crosses the threshold, deferring the drag-start bookkeeping to the next tick', () => {
    const svgCanvas = makeCloneCanvas()
    svgCanvas.gesture.altCloneArmed = true
    const { move } = eventSelectInit(svgCanvas)

    // 5 content units at zoom 1, over the 4-screen-px threshold.
    move({ shiftKey: false }, makeCtx({ selectedElements: [{}], x: 5, zoom: 1 }))

    expect(svgCanvas.calls).toEqual([{ dx: 0, dy: 0 }])
    expect(svgCanvas.gesture.altCloneArmed).toBe(false) // consumed, so a second move tick won't clone again
    // cloneSelectedElements() re-selects the clones itself; this tick
    // deliberately doesn't touch hasDragStartTransform so the *next* move
    // tick inserts the dummy transform for the clones, same as any other
    // fresh drag start.
    expect(svgCanvas.gesture.hasDragStartTransform).toBe(false)
  })

  it('never clones when not armed, regardless of drag distance', () => {
    const svgCanvas = makeCloneCanvas()
    // altCloneArmed left unset (falsy) -- an ordinary, non-alt drag.
    const { move } = eventSelectInit(svgCanvas)

    move({ shiftKey: false }, makeCtx({ selectedElements: [], x: 100, zoom: 1 }))

    expect(svgCanvas.calls).toEqual([])
  })
})

describe('event-select up() after a rubber-band selection', () => {
  // A marquee drag moves nothing: it must not run the drag-end bake, which pushed a spurious "position" undo step
  // (and rewrote the geometry) for every shape the marquee picked up.
  it('does not bake or record a move for the selected elements', () => {
    const calls = []
    const rubberBox = { setAttribute: () => {} }
    const elem = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    const svgCanvas = {
      gesture: createGestureState(),
      getCurrentMode: () => 'multiselect',
      getRubberBox: () => rubberBox,
      requireRubberBox: () => rubberBox,
      setCurBBoxes: () => {},
      setCurrentMode: () => {},
      setCurProperties: () => {},
      selectorManager: { requestSelector: () => ({ showGrips: () => {} }) },
      getRStartX: () => 0,
      getRStartY: () => 0,
      bakeDrag: () => { calls.push('bakeDrag'); return false },
      call: (name) => calls.push(name)
    }
    const { up } = eventSelectInit(svgCanvas)

    up({}, { realX: 100, realY: 80, selectedElements: [elem], operationMode: 'select', pendingMove: null, tempJustSelected: null })

    expect(calls).toEqual([])
  })
})

describe('event-select multiselectMove() marquee threshold', () => {
  // A press on empty canvas that jitters a pixel used to be a 1px marquee: it selected every element whose bounding box
  // covered that pixel (a big group, a background shape) instead of deselecting.
  const makeMarqueeCanvas = () => {
    const calls = { intersections: 0, added: [] }
    const rubberBox = { setAttribute: () => {} }
    return {
      calls,
      gesture: createGestureState(),
      requireRubberBox: () => rubberBox,
      getRStartX: () => 100,
      getRStartY: () => 100,
      getIntersectionList: () => { calls.intersections++; return ['hit'] },
      removeFromSelection: () => {},
      addToSelection: (els) => calls.added.push(...els)
    }
  }

  it('selects nothing while the band is within 4 screen px', () => {
    const svgCanvas = makeMarqueeCanvas()
    const { multiselectMove } = eventSelectInit(svgCanvas)
    multiselectMove({}, { selectedElements: [], realX: 102, realY: 101, zoom: 1 })
    expect(svgCanvas.calls.intersections).toBe(0)
    expect(svgCanvas.calls.added).toEqual([])
  })

  it('selects once the band spans more than 4 screen px, and keeps selecting when it shrinks back', () => {
    const svgCanvas = makeMarqueeCanvas()
    const { multiselectMove } = eventSelectInit(svgCanvas)
    // zoom 2: 2.5 content units are 5 screen px
    multiselectMove({}, { selectedElements: [], realX: 52.5, realY: 50, zoom: 2 })
    expect(svgCanvas.calls.added).toEqual(['hit'])
    multiselectMove({}, { selectedElements: ['hit'], realX: 50.5, realY: 50, zoom: 2 })
    expect(svgCanvas.calls.intersections).toBe(2)
  })
})

describe('event-select up() click without a drag', () => {
  // A press over a covered selection keeps it so a drag moves it; a release that never moved selects what was clicked.
  const makeUpCanvas = () => {
    const calls = []
    return {
      calls,
      gesture: createGestureState(),
      getCurrentMode: () => 'select',
      pathActions: { clear: () => calls.push('clear'), select: (el) => calls.push(['armPath', el.id]) },
      selectOnly: (els) => calls.push(['selectOnly', els.map((el) => el.id)]),
      selectorManager: { requestSelector: () => ({ showGrips: () => {}, resize: () => {} }) },
      setCurProperties: () => {},
      getRStartX: () => 0,
      getRStartY: () => 0,
      updateGroupSelector: () => {},
      bakeDrag: () => true, // a drag's bake is covered by tests/e2e/click-select.spec.js
      call: () => {}
    }
  }
  const el = (id, nodeName = 'rect') => ({ id, nodeName, isConnected: true, getAttribute: () => null, removeAttribute: () => {} })
  const upCtx = (overrides) => ({
    realX: 0, realY: 0, operationMode: 'select', pendingMove: null, tempJustSelected: null, moved: false, ...overrides
  })

  it('selects the clicked element and arms a path for a double-click', () => {
    const svgCanvas = makeUpCanvas()
    const { up } = eventSelectInit(svgCanvas)
    const top = el('top', 'path')
    up({ shiftKey: false }, upCtx({ selectedElements: [el('under')], clickSelect: top }))
    expect(svgCanvas.calls).toEqual(['clear', ['selectOnly', ['top']], ['armPath', 'top']])
  })

  it('leaves the selection alone after a drag', () => {
    const svgCanvas = makeUpCanvas()
    const { up } = eventSelectInit(svgCanvas)
    up({ shiftKey: false }, upCtx({ selectedElements: [el('under')], clickSelect: el('top'), moved: true, realX: 5 }))
    expect(svgCanvas.calls.some((c) => Array.isArray(c) && c[0] === 'selectOnly')).toBe(false)
  })

  it('leaves the selection alone when the marquee ended the press', () => {
    const svgCanvas = makeUpCanvas()
    const { up } = eventSelectInit(svgCanvas)
    up({ shiftKey: false }, upCtx({ selectedElements: [], clickSelect: el('top'), operationMode: 'multiselect' }))
    expect(svgCanvas.calls.some((c) => Array.isArray(c) && c[0] === 'selectOnly')).toBe(false)
  })
})
