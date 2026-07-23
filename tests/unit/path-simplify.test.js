import { describe, it, expect, vi } from 'vitest'
import { init as pathSimplifyInit, strengthToTolerance } from '../../packages/svgcanvas/core/path-simplify.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

// Real paper.js geometry ops need a working 2D canvas context, unavailable
// under jsdom (see tests/unit/mocks/paper-core-stub.js, aliased for all
// tests) — the same pre-existing gap as taper-stroke/path-offset/cutter/
// shape-builder/boolean-ops. These tests cover the pure strength->tolerance
// mapping directly, and confirm the preview/commit/cancel plumbing (session
// tracking, undo wiring, no-selection guard) degrades safely rather than
// throwing when the stub can't produce fitted curves. Actual curve-fitting
// output is verified by hand in-browser (see plan's verification section).

describe('strengthToTolerance', () => {
  it('maps 0 to the minimum tolerance and 1 to the maximum', () => {
    expect(strengthToTolerance(0)).toBe(1)
    expect(strengthToTolerance(1)).toBe(25)
  })

  it('maps 0.5 to the midpoint', () => {
    expect(strengthToTolerance(0.5)).toBe(13)
  })

  it('clamps out-of-range strength', () => {
    expect(strengthToTolerance(-1)).toBe(1)
    expect(strengthToTolerance(2)).toBe(25)
  })
})

describe('previewSmoothPath / commitSmoothPath / cancelSmoothPath', () => {
  const makeCanvas = (pathElement) => {
    const undoMgr = {
      beginUndoableChange: vi.fn(),
      finishUndoableChange: vi.fn(() => ({ isEmpty: () => false }))
    }
    const selector = { resize: vi.fn() }
    return {
      getSelectedElements: vi.fn(() => [pathElement]),
      undoMgr,
      addCommandToHistory: vi.fn(),
      gettingSelectorManager: vi.fn(() => ({ requestSelector: vi.fn(() => selector) })),
      call: vi.fn()
    }
  }

  const makePath = (d) => {
    const el = document.createElementNS(NS.SVG, 'path')
    el.setAttribute('d', d)
    return el
  }

  it('warns and no-ops when nothing is selected', () => {
    const canvas = { getSelectedElements: vi.fn(() => []) }
    pathSimplifyInit(canvas)
    expect(() => canvas.previewSmoothPath(0.4)).not.toThrow()
  })

  it('does not throw across a full preview -> commit session (paper.js unavailable under jsdom)', () => {
    const path = makePath('M0,0 L10,1 L20,0')
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)

    expect(() => canvas.previewSmoothPath(0.4)).not.toThrow()
    expect(() => canvas.commitSmoothPath()).not.toThrow()
  })

  it('does not throw across a full preview -> cancel session and leaves no dangling state', () => {
    const path = makePath('M0,0 L10,1 L20,0')
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)

    canvas.previewSmoothPath(0.4)
    expect(() => canvas.cancelSmoothPath()).not.toThrow()
    // A second cancel with no active preview session must also be a no-op.
    expect(() => canvas.cancelSmoothPath()).not.toThrow()
  })

  it('commit with no prior preview is a no-op (no undo command recorded)', () => {
    const path = makePath('M0,0 L10,1 L20,0')
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)

    canvas.commitSmoothPath()
    expect(canvas.undoMgr.beginUndoableChange).not.toHaveBeenCalled()
  })

  it('exposes simplifyPathD (the reusable one-shot refit used by ext-puppet-warp)', () => {
    // Like smoothPathD it is unguarded — callers wrap it in try/catch (the paper
    // stub can't fit curves under jsdom; real output is verified in-browser).
    const canvas = makeCanvas(makePath('M0,0 L10,1 L20,0'))
    pathSimplifyInit(canvas)
    expect(typeof canvas.simplifyPathD).toBe('function')
  })
})
