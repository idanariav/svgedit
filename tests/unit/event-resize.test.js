import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { init as eventResizeInit } from '../../packages/svgcanvas/core/event-resize.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

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
    let initBbox = null
    svgCanvas = {
      setStarted: vi.fn(),
      setStartX: vi.fn((v) => { startX = v }),
      setStartY: vi.fn((v) => { startY = v }),
      getStartX: vi.fn(() => startX),
      getStartY: vi.fn(() => startY),
      setInitBbox: vi.fn((v) => { initBbox = v }),
      getInitBbox: vi.fn(() => initBbox),
      $id: vi.fn(() => rect),
      getCurConfig: vi.fn(() => ({ gridSnapping: false })),
      getCurrentResizeMode: vi.fn(() => 'se'),
      selectorManager: { requestSelector: vi.fn(() => ({ resize: vi.fn() })) },
      call: vi.fn()
    }

    handlers = eventResizeInit(svgCanvas)
  })

  afterEach(() => {
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
})
