import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { init as eventResizeInit } from '../../packages/svgcanvas/core/event-resize.ts'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import { createGestureState } from '../../packages/svgcanvas/core/gesture-state.ts'
import { createGestureSession } from '../../packages/svgcanvas/core/gesture-session.ts'

// Regression coverage for the "redundant matrix" bug: clicking a resize grip
// without dragging used to leave 3 stray identity `matrix(1 0 0 1 0 0)`
// transforms permanently stuck on the element, because down() inserted the
// dummy translate/scale/translate placeholders unconditionally on mousedown,
// and mouseUp only ever cleaned them up after actual movement was detected.
describe('event-resize', () => {
  let svgRoot
  let rect
  let svgCanvas
  let handlers

  beforeEach(() => {
    svgRoot = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svgRoot)

    rect = document.createElementNS(NS.SVG, 'rect')
    rect.setAttribute('x', '100')
    rect.setAttribute('y', '100')
    rect.setAttribute('width', '100')
    rect.setAttribute('height', '100')
    svgRoot.append(rect)

    let startX = 0; let startY = 0
    svgCanvas = {
      destroyAbort: new AbortController(),
      beginTransaction: () => ({ commit () {}, cancel () {}, relabel () {} }), // the history is not under test here
      dragPlan: () => null, // no model here: the transforms are put on the element
      gesture: createGestureState(),
      stretch: { isActive: () => false, isEligible: () => false, begin () {}, preview () {}, commit () {}, cancel () {} }, // no Alt-drag stretch here
      setStarted: vi.fn(),
      setStartX: vi.fn((v) => { startX = v }),
      setStartY: vi.fn((v) => { startY = v }),
      getStartX: vi.fn(() => startX),
      getStartY: vi.fn(() => startY),
      setCurrentMode: vi.fn(),
      updateGroupSelector: vi.fn(),
      getStrokedBBoxDefaultVisible: vi.fn(() => ({ x: 100, y: 100, width: 250, height: 100 })),
      $id: vi.fn(() => rect),
      getCurConfig: vi.fn(() => ({ gridSnapping: false })),
      getCurrentResizeMode: vi.fn(() => 'se'),
      selectorManager: { requestSelector: vi.fn(() => ({ resize: vi.fn() })) },
      call: vi.fn()
    }

    Object.assign(svgCanvas, createGestureSession(svgCanvas))
    handlers = eventResizeInit(svgCanvas)
  })

  afterEach(() => {
    svgCanvas.destroyAbort.abort()
    document.body.textContent = ''
  })

  const ctxDown = (overrides = {}) => ({
    x: 200, y: 100, zoom: 1, selectedElements: [rect], svgRoot, mouseTarget: rect, ...overrides
  })
  const ctxMove = (overrides = {}) => ({
    selected: rect, x: 220, y: 130, svgRoot, selectedElements: [rect], ...overrides
  })

  it('does not touch the transform list on mousedown alone (click without drag)', () => {
    handlers.down({}, ctxDown())

    expect(rect.transform.baseVal.numberOfItems).toBe(0)
    expect(rect.getAttribute('transform')).toBeNull()
  })

  it('leaves the element untouched across a full click (down+up, no move) cycle', () => {
    // Simulates clicking a resize grip and releasing in place: down() fires,
    // move() never does (no movement occurred).
    handlers.down({}, ctxDown())
    handlers.down({}, ctxDown()) // a second unrelated click, e.g. on another grip

    expect(rect.transform.baseVal.numberOfItems).toBe(0)
  })

  it('inserts the dummy transforms on first actual movement and resizes correctly', () => {
    handlers.down({}, ctxDown())
    handlers.move({ shiftKey: false }, ctxMove())

    // translateOrigin, scale, translateBack -- exactly 3 items, not stuck/growing
    expect(rect.transform.baseVal.numberOfItems).toBe(3)
    expect(rect.getAttribute('transform')).not.toBeNull()
  })

  it('does not keep stacking transforms across repeated move calls during one drag', () => {
    handlers.down({}, ctxDown())
    handlers.move({ shiftKey: false }, ctxMove({ x: 210, y: 110 }))
    handlers.move({ shiftKey: false }, ctxMove({ x: 230, y: 140 }))
    handlers.move({ shiftKey: false }, ctxMove({ x: 250, y: 160 }))

    expect(rect.transform.baseVal.numberOfItems).toBe(3)
  })

  it('a press begins a resize gesture that holds the resize\'s state', () => {
    handlers.down({}, ctxDown())
    const g = handlers.current()
    expect(g.kind).toBe('resize')
    expect(g.state).toMatchObject({ elems: [rect], groupStart: null, begun: false, area: null })
    expect(g.state.initBox).toEqual({ x: 100, y: 100, width: 100, height: 100 }) // the selection box at zoom 1
  })

  it('a cancelled resize puts the mode back and drops its state with it', () => {
    handlers.down({}, ctxDown())
    handlers.move({ shiftKey: false }, ctxMove())
    svgCanvas.cancelGesture('escape')
    expect(handlers.current()).toBeNull()
    expect(svgCanvas.setCurrentMode).toHaveBeenCalledWith('select')
    expect(svgCanvas.setStarted).toHaveBeenLastCalledWith(false)
    handlers.move({ shiftKey: false }, ctxMove({ x: 300, y: 300 })) // a late move after the cancel does nothing
    expect(rect.transform.baseVal.numberOfItems).toBe(3)
  })

  it('a resize of one element reads nothing of an earlier group resize (e6f50f31)', () => {
    const other = document.createElementNS(NS.SVG, 'rect')
    svgRoot.append(other)
    handlers.down({}, ctxDown({ selectedElements: [rect, other] }))
    expect(handlers.current().state.groupStart.size).toBe(2)
    handlers.current().commit()
    handlers.down({}, ctxDown())
    expect(handlers.current().state.groupStart).toBeNull()
  })
})
