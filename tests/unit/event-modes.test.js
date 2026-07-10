import { describe, expect, it } from 'vitest'
import {
  CONTENT_SPACE_MODES, isCreateInCurrentGroup, toCurrentGroupLocalDelta, toCurrentGroupLocalPoint
} from '../../packages/svgcanvas/core/event-group-context.js'
import { init as initEventSelect } from '../../packages/svgcanvas/core/event-select.js'
import { init as initEventResize } from '../../packages/svgcanvas/core/event-resize.js'
import { init as initEventRotate } from '../../packages/svgcanvas/core/event-rotate.js'
import { init as initEventShapeDraw } from '../../packages/svgcanvas/core/event-shape-draw.js'
import { init as initEventPathEdit } from '../../packages/svgcanvas/core/event-path-edit.js'
import { init as initEventTextEdit } from '../../packages/svgcanvas/core/event-text-edit.js'
import { init as initEventZoom } from '../../packages/svgcanvas/core/event-zoom.js'

// Each core/event-*.js mode-family module is a reentrant `init(canvas)`
// factory (mirrors core/blur-event.js) called once per SvgCanvas instance
// from core/event.js's own init(). These are cheap wiring smoke tests: they
// don't exercise the handler logic (already covered end-to-end by
// tests/unit/event.test.js via svgCanvas.mouseDownEvent/mouseMoveEvent/
// mouseUpEvent), just that each factory returns the expected handler shape
// without throwing — catching a missing/misnamed export before an e2e run.
describe('event mode-family modules', () => {
  it('event-select.js exposes down/move/multiselectMove/up', () => {
    const handlers = initEventSelect({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
    expect(typeof handlers.multiselectMove).toBe('function')
    expect(typeof handlers.up).toBe('function')
  })

  it('event-resize.js exposes down/move', () => {
    const handlers = initEventResize({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
  })

  it('event-rotate.js exposes down/move/up', () => {
    const handlers = initEventRotate({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
    expect(typeof handlers.up).toBe('function')
  })

  it('event-shape-draw.js exposes down/move/up', () => {
    const handlers = initEventShapeDraw({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
    expect(typeof handlers.up).toBe('function')
  })

  it('event-path-edit.js exposes down/move/upPath/upPathEdit', () => {
    const handlers = initEventPathEdit({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
    expect(typeof handlers.upPath).toBe('function')
    expect(typeof handlers.upPathEdit).toBe('function')
  })

  it('event-text-edit.js exposes down/move/up', () => {
    const handlers = initEventTextEdit({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
    expect(typeof handlers.up).toBe('function')
  })

  it('event-zoom.js exposes down/move/up', () => {
    const handlers = initEventZoom({})
    expect(typeof handlers.down).toBe('function')
    expect(typeof handlers.move).toBe('function')
    expect(typeof handlers.up).toBe('function')
  })

  it('event-group-context.js helpers are no-ops outside a group context', () => {
    const canvas = { getCurrentMode: () => 'rect', getCurrentGroup: () => null }
    expect(CONTENT_SPACE_MODES).toContain('select')
    expect(isCreateInCurrentGroup(canvas)).toBe(false)
    expect(toCurrentGroupLocalPoint(canvas, 5, 7)).toEqual({ x: 5, y: 7 })
    expect(toCurrentGroupLocalDelta(canvas, 3, 4)).toEqual({ dx: 3, dy: 4 })
  })
})
