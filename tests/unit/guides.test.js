import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { GUIDES_ATTR, parseGuides, formatGuides, validateGuides, visibleGuides, init } from '../../packages/svgcanvas/core/guides.js'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'
import { collectSnapTargets, snapMovingBBox, findEqualSpacing, collectPointTargets, snapPoint } from '../../packages/svgcanvas/core/smart-guides.js'

describe('parseGuides / formatGuides', () => {
  it('reads vertical and horizontal lists, sorted and de-duplicated', () => {
    expect(parseGuides('v:350,120,120;h:300.5')).toEqual({ v: [120, 350], h: [300.5] })
    expect(parseGuides('h:5;v:1')).toEqual({ v: [1], h: [5] })
  })

  it('drops what it cannot read and survives empty input', () => {
    expect(parseGuides('v:abc,12,;x:5;h:')).toEqual({ v: [12], h: [] })
    for (const empty of ['', null, undefined, ';;']) expect(parseGuides(empty)).toEqual({ v: [], h: [] })
  })

  it('writes the compact form and round-trips', () => {
    expect(formatGuides({ v: [350, 120], h: [300.5] })).toBe('v:120,350;h:300.5')
    expect(formatGuides({ v: [], h: [4] })).toBe('h:4')
    expect(formatGuides({})).toBe('')
    const text = 'v:-20,120;h:0.25,300'
    expect(formatGuides(parseGuides(text))).toBe(text)
  })

  it('rounds to a hundredth and ignores non-finite numbers', () => {
    expect(formatGuides({ v: [1.23456, NaN, Infinity, 7], h: [] })).toBe('v:1.23,7')
  })
})

describe('validateGuides', () => {
  it('accepts well-formed values and rejects corruption', () => {
    for (const ok of ['', 'v:1', 'v:1,2.5;h:-3', ' v : 1 , 2 ; h : 3 ']) expect(validateGuides(ok)).toBe(true)
    for (const bad of ['v:NaN', 'v:1,;h:2', 'x:1', 'v:undefined', 'v:1;;h:2', 'v:1e5']) expect(validateGuides(bad)).not.toBe(true)
  })

  it('checkDrawing flags a bad root attribute and passes a good one', () => {
    const root = document.createElementNS(NS.SVG, 'svg')
    const layer = document.createElementNS(NS.SVG, 'g')
    layer.setAttribute('class', 'layer')
    root.append(layer)
    root.setAttribute(GUIDES_ATTR, 'v:12;h:5')
    // the validator registers when the module is initialised
    init({ getSvgContent: () => root })
    expect(checkDrawing(root)).toEqual([])
    root.setAttribute(GUIDES_ATTR, 'v:NaN')
    expect(checkDrawing(root).map((f) => f.code)).toEqual(['se-attr-parse'])
  })
})

describe('svgCanvas.getGuides / setGuides', () => {
  let root
  let canvas
  let transacted

  beforeEach(() => {
    root = document.createElementNS(NS.SVG, 'svg')
    transacted = []
    canvas = {
      getSvgContent: () => root,
      transact: vi.fn((label, fn) => { transacted.push(label); return fn() }),
      getCurConfig: () => ({})
    }
    init(canvas)
  })

  it('reads the attribute and writes it inside one transaction with the given label', () => {
    expect(canvas.getGuides()).toEqual({ v: [], h: [] })
    expect(canvas.setGuides({ v: [30, 10], h: [5] }, 'Add guide')).toBe(true)
    expect(root.getAttribute(GUIDES_ATTR)).toBe('v:10,30;h:5')
    expect(transacted).toEqual(['Add guide'])
    expect(canvas.getGuides()).toEqual({ v: [10, 30], h: [5] })
  })

  it('removes the attribute when the last guide goes, and does nothing when nothing changes', () => {
    canvas.setGuides({ v: [10] })
    expect(canvas.setGuides({ v: [10] })).toBe(false)
    expect(transacted.length).toBe(1)
    expect(canvas.setGuides({})).toBe(true)
    expect(root.hasAttribute(GUIDES_ATTR)).toBe(false)
  })

  it('visibleGuides hides them when the user does, without losing them', () => {
    canvas.setGuides({ v: [10] })
    expect(visibleGuides(canvas)).toEqual({ v: [10], h: [] })
    canvas.getCurConfig = () => ({ showGuides: false })
    expect(visibleGuides(canvas)).toEqual({ v: [], h: [] })
    expect(canvas.getGuides()).toEqual({ v: [10], h: [] })
    expect(visibleGuides({})).toEqual({ v: [], h: [] }) // a canvas without guides support
  })
})

describe('guides as snap targets', () => {
  let content
  let canvas
  const res = { w: 640, h: 480 }

  beforeEach(() => {
    content = document.createElementNS(NS.SVG, 'svg')
    const layer = document.createElementNS(NS.SVG, 'g')
    layer.setAttribute('class', 'layer')
    content.append(layer)
    document.body.append(content)
    canvas = {
      getSvgContent: () => content,
      getResolution: () => res,
      getStrokedBBoxDefaultVisible: () => null,
      getCurConfig: () => ({}),
      getGuides: () => ({ v: [100], h: [200] })
    }
  })
  afterEach(() => { document.body.textContent = '' })

  it('a moving box aligns to a vertical guide on x only, and a horizontal one on y only', () => {
    const targets = collectSnapTargets(canvas, [])
    // right edge 3 units past the guide at x=100 -> pull left; nothing near any horizontal line
    const snap = snapMovingBBox({ x: 83, y: 300, width: 20, height: 20 }, 0, 0, targets, 8)
    expect(snap.x).toMatchObject({ pos: 100, delta: -3 })
    expect(snap.x.target.isGuide).toBe(true)
    expect(snap.y).toBeNull()
    const snapY = snapMovingBBox({ x: 500, y: 203, width: 20, height: 20 }, 0, 0, targets, 8)
    expect(snapY.y).toMatchObject({ pos: 200, delta: -3 })
    expect(snapY.x).toBeNull()
  })

  it('equal-spacing detection ignores guides', () => {
    const targets = collectSnapTargets(canvas, [])
    const spacing = findEqualSpacing({ x: 300, y: 100, width: 20, height: 20 }, 0, 0, targets, 8)
    expect(spacing).toEqual({ x: null, y: null })
  })

  it('hidden guides are not targets', () => {
    canvas.getCurConfig = () => ({ showGuides: false })
    expect(collectSnapTargets(canvas, []).some((t) => t.isGuide)).toBe(false)
    expect(collectPointTargets(canvas).xLines.some((l) => l.pos === 100 && l.hi === res.h && l.lo === 0 && l.guide)).toBe(false)
  })

  it('drawing snaps a point to a guide line per axis, but a point target still wins', () => {
    const targets = collectPointTargets(canvas)
    const hit = snapPoint({ x: 103, y: 405 }, targets, 8)
    expect(hit.x).toBe(100)
    expect(hit.xLine).toMatchObject({ pos: 100, lo: 0, hi: 480 })
    expect(hit.y).toBe(405)
    const onGuideCross = snapPoint({ x: 103, y: 198 }, targets, 8)
    expect(onGuideCross).toMatchObject({ x: 100, y: 200 })
    // near the page corner (a point target) the point target wins over the guide
    const corner = snapPoint({ x: 3, y: 4 }, targets, 8)
    expect(corner.point).toEqual({ x: 0, y: 0 })
  })
})
