import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { collectPointTargets, snapPoint } from '../../packages/svgcanvas/core/smart-guides.js'
import { init, isDrawSnapMode } from '../../packages/svgcanvas/core/draw-snap.js'

const make = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS.SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.append(el)
  return el
}

describe('snapPoint', () => {
  const targets = (points = [], xLines = [], yLines = []) => ({
    points: [...points].sort((a, b) => a.x - b.x),
    xLines: [...xLines].sort((a, b) => a.pos - b.pos),
    yLines: [...yLines].sort((a, b) => a.pos - b.pos)
  })

  it('snaps to the nearest point target within tolerance, fixing both coordinates', () => {
    const t = targets([{ x: 100, y: 100 }, { x: 104, y: 100 }])
    const hit = snapPoint({ x: 103, y: 101 }, t, 8)
    expect(hit).toMatchObject({ x: 104, y: 100, point: { x: 104, y: 100 }, xLine: null, yLine: null })
  })

  it('does not snap outside the tolerance, in either axis of a point target', () => {
    const t = targets([{ x: 100, y: 100 }])
    expect(snapPoint({ x: 100, y: 110 }, t, 8)).toMatchObject({ x: 100, y: 110, point: null })
    expect(snapPoint({ x: 106, y: 106 }, t, 8)).toMatchObject({ x: 106, y: 106, point: null }) // inside the box, outside the circle
  })

  it('a point target beats line targets', () => {
    const t = targets([{ x: 100, y: 100 }], [{ pos: 102, lo: 0, hi: 50 }], [{ pos: 98, lo: 0, hi: 50 }])
    const hit = snapPoint({ x: 101, y: 99 }, t, 8)
    expect(hit.point).toEqual({ x: 100, y: 100 })
    expect(hit.xLine).toBeNull()
  })

  it('without a point target each axis snaps on its own to the nearest line', () => {
    const t = targets([], [{ pos: 50, lo: 0, hi: 10 }, { pos: 54, lo: 5, hi: 20 }], [{ pos: 200, lo: 0, hi: 10 }])
    const hit = snapPoint({ x: 53, y: 190 }, t, 8)
    expect(hit.x).toBe(54)
    expect(hit.xLine).toEqual({ pos: 54, lo: 5, hi: 20 })
    expect(hit.y).toBe(190) // 10 away: no horizontal line within 8
    expect(hit.yLine).toBeNull()
    expect(snapPoint({ x: 400, y: 197 }, t, 8)).toMatchObject({ x: 400, y: 200 })
  })

  it('finds the nearby targets among thousands', () => {
    const points = Array.from({ length: 20000 }, (_, i) => ({ x: i * 10, y: (i * 37) % 500 }))
    const t = targets(points)
    const hit = snapPoint({ x: 70002, y: points[7000].y + 1 }, t, 8)
    expect(hit.point).toEqual(points[7000])
    expect(snapPoint({ x: 70005, y: 9999 }, t, 8).point).toBeNull()
  })
})

describe('collectPointTargets', () => {
  let content
  let layer
  let canvas

  beforeEach(() => {
    content = make('svg', {}, document.body)
    layer = make('g', { class: 'layer' }, content)
    make('title', {}, layer)
    canvas = {
      getSvgContent: () => content,
      getResolution: () => ({ w: 640, h: 480 }),
      // the stroked box is the element's own x/y/width/height (enough for these shapes)
      getStrokedBBoxDefaultVisible: ([el]) => ({
        x: Number(el.dataset.x ?? el.getAttribute('x') ?? 0),
        y: Number(el.dataset.y ?? el.getAttribute('y') ?? 0),
        width: Number(el.dataset.w ?? el.getAttribute('width') ?? 10),
        height: Number(el.dataset.h ?? el.getAttribute('height') ?? 10)
      })
    }
  })
  afterEach(() => { document.body.textContent = '' })

  const has = (t, x, y) => t.points.some((p) => p.x === x && p.y === y)

  it('adds a box\'s corners, edge midpoints and centre, its edge lines, and the page', () => {
    make('rect', { x: 100, y: 200, width: 50, height: 20 }, layer)
    const t = collectPointTargets(canvas)
    for (const [x, y] of [[100, 200], [150, 220], [125, 200], [100, 210], [125, 210]]) expect(has(t, x, y)).toBe(true)
    expect(t.xLines).toContainEqual({ pos: 125, lo: 200, hi: 220 })
    expect(t.yLines).toContainEqual({ pos: 210, lo: 100, hi: 150 })
    expect(has(t, 0, 0)).toBe(true) // page corner
    expect(has(t, 320, 240)).toBe(true) // page centre
    expect(t.xLines).toContainEqual({ pos: 640, lo: 0, hi: 480 })
  })

  it('is sorted, so the bisection lookup is valid', () => {
    make('rect', { x: 300, y: 5, width: 5, height: 5 }, layer)
    make('rect', { x: 10, y: 5, width: 5, height: 5 }, layer)
    const t = collectPointTargets(canvas)
    expect(t.points.map((p) => p.x)).toEqual([...t.points.map((p) => p.x)].sort((a, b) => a - b))
    expect(t.xLines.map((l) => l.pos)).toEqual([...t.xLines.map((l) => l.pos)].sort((a, b) => a - b))
  })

  it('adds the anchors of lines, polylines, polygons and paths', () => {
    make('line', { x1: 11, y1: 12, x2: 13, y2: 14 }, layer)
    make('polygon', { points: '31,32 33,34 35,36' }, layer)
    make('polyline', { points: '41,42 43,44' }, layer)
    make('path', { d: 'M 51 52 L 53 54 C 55 56 57 58 59 60' }, layer)
    const t = collectPointTargets(canvas)
    for (const [x, y] of [[11, 12], [13, 14], [31, 32], [35, 36], [41, 42], [43, 44], [51, 52], [53, 54], [59, 60]]) {
      expect(has(t, x, y)).toBe(true)
    }
    expect(has(t, 55, 56)).toBe(false) // control points are not anchors
  })

  it('leaves out excluded objects, frames, titles and hidden layers', () => {
    make('rect', { x: 1000, y: 1000, width: 5, height: 5 }, layer)
    const skip = make('rect', { x: 2000, y: 2000, width: 5, height: 5 }, layer)
    make('rect', { x: 3000, y: 3000, width: 5, height: 5, 'data-frame': '1' }, layer)
    const hidden = make('g', { class: 'layer', display: 'none' }, content)
    make('rect', { x: 4000, y: 4000, width: 5, height: 5 }, hidden)
    const t = collectPointTargets(canvas, [skip])
    expect(has(t, 1000, 1000)).toBe(true)
    expect(has(t, 2000, 2000)).toBe(false)
    expect(has(t, 3000, 3000)).toBe(false)
    expect(has(t, 4000, 4000)).toBe(false)
  })

  it('an element whose geometry cannot be read still contributes its box', () => {
    make('path', { d: 'not a path', x: 7, y: 8 }, layer)
    expect(has(collectPointTargets(canvas), 7, 8)).toBe(true)
  })
})

describe('svgCanvas.snapDrawPoint', () => {
  let canvas
  let config
  let mode
  let group
  let collected

  beforeEach(() => {
    config = { gridSnapping: false, smartSnapping: true }
    mode = 'rect'
    group = null
    const content = make('svg', {}, document.body)
    const layer = make('g', { class: 'layer' }, content)
    collected = 0
    make('rect', { x: 100, y: 100, width: 50, height: 50 }, layer)
    canvas = {
      getCurConfig: () => config,
      getCurrentMode: () => mode,
      getCurrentGroup: () => group,
      getZoom: () => 1,
      getSvgContent: () => content,
      getResolution: () => ({ w: 640, h: 480 }),
      getStrokedBBoxDefaultVisible: () => { collected++; return { x: 100, y: 100, width: 50, height: 50 } },
      showDrawGuides: vi.fn()
    }
    init(canvas)
  })
  afterEach(() => { document.body.textContent = '' })

  it('lists the built-in modes that place points, and never the pencil', () => {
    for (const m of ['rect', 'ellipse', 'line', 'path', 'text', 'frame', 'square', 'circle', 'image']) expect(isDrawSnapMode(m)).toBe(true)
    for (const m of ['fhpath', 'select', 'pathedit', 'resize', 'zoom']) expect(isDrawSnapMode(m)).toBe(false)
  })

  it('snaps to a nearby corner and shows the guide', () => {
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 100, y: 100 })
    expect(canvas.showDrawGuides).toHaveBeenCalledTimes(1)
    expect(canvas.showDrawGuides.mock.calls[0][0]).toMatchObject({ at: { x: 100, y: 100 }, point: { x: 100, y: 100 } })
  })

  it('clears the guide (null) when nothing is near', () => {
    canvas.snapDrawPoint(300, 300)
    expect(canvas.showDrawGuides).toHaveBeenLastCalledWith(null)
  })

  it('the tolerance is eight screen pixels, so it shrinks as you zoom in', () => {
    expect(canvas.snapDrawPoint(107, 100).x).toBe(100)
    canvas.getZoom = () => 4
    canvas.clearDrawSnap()
    expect(canvas.snapDrawPoint(107, 100).x).toBe(107) // 7 content units = 28 px away
    expect(canvas.snapDrawPoint(101, 100).x).toBe(100)
  })

  it('does nothing when grid snapping is on, when smart snapping is off, in group context or in other modes', () => {
    config.gridSnapping = true
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 103, y: 98 })
    config.gridSnapping = false
    config.smartSnapping = false
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 103, y: 98 })
    config.smartSnapping = true
    group = {}
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 103, y: 98 })
    group = null
    mode = 'fhpath'
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 103, y: 98 })
    mode = 'select'
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 103, y: 98 })
    expect(canvas.showDrawGuides).not.toHaveBeenCalled()
  })

  it('a registered tool that opted in snaps in any mode', () => {
    mode = 'spiral'
    expect(canvas.snapDrawPoint(103, 98)).toEqual({ x: 103, y: 98 })
    expect(canvas.snapDrawPoint(103, 98, { tool: true })).toEqual({ x: 100, y: 100 })
  })

  it('collects the targets once per gesture and again after clearDrawSnap', () => {
    canvas.snapDrawPoint(103, 98)
    canvas.snapDrawPoint(120, 120)
    canvas.snapDrawPoint(400, 400)
    expect(collected).toBe(1)
    canvas.clearDrawSnap()
    canvas.snapDrawPoint(103, 98)
    expect(collected).toBe(2)
  })
})
