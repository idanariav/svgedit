import { describe, it, expect, vi } from 'vitest'
import { init as pathSimplifyInit, strengthToTolerance } from '../../packages/svgcanvas/core/path-simplify.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { parseAnchors } from '../../packages/svgcanvas/core/anchor-path.js'

// The fit itself is covered in path-fit.test.js; these tests cover the strength -> tolerance
// mapping, the Smooth Path preview / commit / cancel session and the pencil commit around it.

describe('strengthToTolerance', () => {
  it('maps 0 to the finest tolerance and 1 to the coarsest, in user units', () => {
    expect(strengthToTolerance(0)).toBe(0.5)
    expect(strengthToTolerance(1)).toBe(10)
  })

  it('maps 0.5 to the midpoint', () => {
    expect(strengthToTolerance(0.5)).toBe(5.25)
  })

  it('clamps out-of-range strength', () => {
    expect(strengthToTolerance(-1)).toBe(0.5)
    expect(strengthToTolerance(2)).toBe(10)
  })
})

describe('Smooth Path session', () => {
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

  // A wobbly line with a sharp corner: 60 jittered points along a diagonal, then 40 back.
  const wobblyPolylineD = () => {
    const pts = []
    for (let i = 0; i <= 60; i++) pts.push([i * 3, i * 1.5 + Math.sin(i * 1.9) * 0.4])
    for (let i = 1; i <= 40; i++) pts.push([180 - i * 2.5, 90 + i * 2 + Math.cos(i * 2.1) * 0.4])
    return `M${pts.map((p) => p.join(',')).join(' L')}`
  }

  it('warns and no-ops when nothing is selected', () => {
    const canvas = { getSelectedElements: vi.fn(() => []) }
    pathSimplifyInit(canvas)
    expect(() => canvas.previewSmoothPath(0.4)).not.toThrow()
  })

  it('previewing refits the path with far fewer anchors and keeps its corner', () => {
    const baseline = wobblyPolylineD()
    const path = makePath(baseline)
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)
    canvas.previewSmoothPath(0.4)
    const before = parseAnchors(baseline)[0].anchors.length
    const after = parseAnchors(path.getAttribute('d'))[0].anchors
    expect(before).toBe(101)
    expect(after.length).toBeLessThan(10)
    expect(after.some((a) => Math.hypot(a.p.x - 180, a.p.y - 90) < 3)).toBe(true) // the corner survived
    expect(canvas.call).toHaveBeenCalledWith('changed', [path])
  })

  it('works on a plain hand-built path too: a sharp-cornered shape is left as it was', () => {
    const d = 'M10,10 L110,10 L110,70 L10,70 Z'
    const path = makePath(d)
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)
    canvas.previewSmoothPath(0.4)
    const anchors = parseAnchors(path.getAttribute('d'))[0]
    expect(anchors.closed).toBe(true)
    expect(anchors.anchors.length).toBe(4)
  })

  it('repeated strength changes refit from the original shape and never compound', () => {
    const path = makePath(wobblyPolylineD())
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)
    canvas.previewSmoothPath(0.4)
    const first = path.getAttribute('d')
    canvas.previewSmoothPath(1)
    canvas.previewSmoothPath(0.4)
    expect(path.getAttribute('d')).toBe(first)
  })

  it('commit records baseline -> final as one undo step and ends the session', () => {
    const baseline = wobblyPolylineD()
    const path = makePath(baseline)
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)
    canvas.previewSmoothPath(0.4)
    const smoothed = path.getAttribute('d')
    canvas.commitSmoothPath()
    expect(canvas.undoMgr.beginUndoableChange).toHaveBeenCalledWith('d', [path])
    expect(canvas.addCommandToHistory).toHaveBeenCalledTimes(1)
    expect(path.getAttribute('d')).toBe(smoothed)
    canvas.commitSmoothPath() // nothing left to commit
    expect(canvas.addCommandToHistory).toHaveBeenCalledTimes(1)
  })

  it('cancel restores the original d without an undo step, and a second cancel is a no-op', () => {
    const baseline = wobblyPolylineD()
    const path = makePath(baseline)
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)
    canvas.previewSmoothPath(0.4)
    canvas.cancelSmoothPath()
    expect(path.getAttribute('d')).toBe(baseline)
    expect(canvas.addCommandToHistory).not.toHaveBeenCalled()
    expect(() => canvas.cancelSmoothPath()).not.toThrow()
  })

  it('commit with no prior preview is a no-op (no undo command recorded)', () => {
    const path = makePath('M0,0 L10,1 L20,0')
    const canvas = makeCanvas(path)
    pathSimplifyInit(canvas)
    canvas.commitSmoothPath()
    expect(canvas.undoMgr.beginUndoableChange).not.toHaveBeenCalled()
  })

  it('simplifyPathD (the one-shot refit used by ext-puppet-warp) returns absolute path data, or null for nothing', () => {
    const canvas = makeCanvas(makePath('M0,0'))
    pathSimplifyInit(canvas)
    const d = canvas.simplifyPathD(wobblyPolylineD(), 1)
    expect(d).toMatch(/^M[\d.,-]+( [LC][\d.,\s-]+)+$/)
    expect(parseAnchors(d)[0].anchors.length).toBeLessThan(20)
    expect(canvas.simplifyPathD('', 1)).toBeNull()
  })
})

describe('simplifyFreehand (the pencil commit)', () => {
  const polyline = (pts) => {
    const el = document.createElementNS(NS.SVG, 'polyline')
    el.setAttribute('points', pts.map((p) => p.join(',')).join(' '))
    // jsdom has no SVGPointList; give it the part of the API the code reads
    el.points = { numberOfItems: pts.length, getItem: (i) => ({ x: pts[i][0], y: pts[i][1] }) }
    return el
  }
  const makeCanvas = () => ({
    getId: () => 'svg_7',
    addSVGElementsFromJson: vi.fn((json) => {
      const el = document.createElementNS(NS.SVG, json.element)
      for (const [k, v] of Object.entries(json.attr)) el.setAttribute(k, v)
      return el
    }),
    pathActions: { smoothPolylineIntoPath: vi.fn(() => 'legacy') }
  })

  it('swaps the polyline for a fitted, freehand-stamped path that reuses its id', () => {
    const canvas = makeCanvas()
    pathSimplifyInit(canvas)
    const wave = Array.from({ length: 120 }, (_, i) => [i * 2, 30 * Math.sin(i / 15)])
    const path = canvas.simplifyFreehand(polyline(wave), 2)
    expect(path.tagName).toBe('path')
    expect(path.getAttribute('id')).toBe('svg_7')
    expect(path.getAttribute('data-freehand')).toBe('1')
    expect(path.getAttribute('fill')).toBe('none')
    expect(canvas.addSVGElementsFromJson.mock.calls[0][0].curStyles).toBe(true)
    const anchors = parseAnchors(path.getAttribute('d'))[0].anchors
    expect(anchors.length).toBeLessThan(15)
    expect(anchors[0].p).toEqual({ x: 0, y: 0 })
  })

  it('a bigger fidelity gives a coarser curve', () => {
    const canvas = makeCanvas()
    pathSimplifyInit(canvas)
    const wiggle = Array.from({ length: 200 }, (_, i) => [i * 1.5, 12 * Math.sin(i / 3) + 40 * Math.sin(i / 30)])
    const count = (fidelity) => parseAnchors(canvas.simplifyFreehand(polyline(wiggle), fidelity).getAttribute('d'))[0].anchors.length
    expect(count(0.5)).toBeGreaterThan(count(8))
  })

  it('falls back to a sane default for a missing or invalid fidelity', () => {
    const canvas = makeCanvas()
    pathSimplifyInit(canvas)
    const wave = Array.from({ length: 60 }, (_, i) => [i * 2, 10 * Math.sin(i / 8)])
    for (const bad of [undefined, NaN, 0, -3]) {
      expect(canvas.simplifyFreehand(polyline(wave), bad).tagName).toBe('path')
    }
  })

  it('leaves a one-point polyline alone and uses the legacy smoothing if the fit throws', () => {
    const canvas = makeCanvas()
    pathSimplifyInit(canvas)
    const single = polyline([[1, 1]])
    expect(canvas.simplifyFreehand(single, 2)).toBe(single)
    canvas.addSVGElementsFromJson.mockImplementation(() => { throw new Error('boom') })
    expect(canvas.simplifyFreehand(polyline([[0, 0], [10, 10], [20, 0]]), 2)).toBe('legacy')
  })
})
