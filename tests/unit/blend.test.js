import { describe, it, expect } from 'vitest'
import { parseAnchors, anchorsToD, anchorBBox } from '../../packages/svgcanvas/core/anchor-path.js'
import { pairPaths, pathAt, lerpPaint, lerpStyle, stepCount, rgbOf } from '../../packages/svgcanvas/core/blend.js'

const subs = (d) => parseAnchors(d)
const rect = (x, y, w, h) => `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`
const at = (a, b, t) => pathAt(pairPaths(subs(a), subs(b)), t)

describe('blend: path pairing', () => {
  it('step 0 and 1 are the keys, the middle is halfway', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(100, 0, 10, 30)
    expect(anchorsToD(at(a, b, 0))).toBe(anchorsToD(subs(a)))
    expect(anchorsToD(at(a, b, 1))).toBe(anchorsToD(subs(b)))
    const mid = anchorBBox(at(a, b, 0.5))
    expect(mid).toEqual({ x: 50, y: 0, width: 10, height: 20 })
  })

  it('equalises anchor counts by splitting the longest segments', () => {
    const pair = pairPaths(subs(rect(0, 0, 10, 10)), subs('M0,0 L40,0 L40,10 L20,30 L0,10 Z'))
    expect(pair.a[0].anchors).toHaveLength(5)
    expect(pair.b[0].anchors).toHaveLength(5)
    // growing a closed square keeps its outline
    const grown = anchorBBox(pair.a)
    expect(grown).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('splits a curved segment into two that still trace the curve', () => {
    const arc = 'M0,0 C0,20 20,20 20,0'
    const pair = pairPaths(subs(arc), subs('M0,0 L5,0 L10,0 L20,0'))
    const bb = anchorBBox(pair.a)
    expect(bb.height).toBeCloseTo(anchorBBox(subs(arc)).height, 3)
    expect(pair.a[0].anchors).toHaveLength(4)
  })

  it('turns the second closed shape to the same winding and the start that twists least', () => {
    const cw = rect(0, 0, 10, 10)
    const ccw = 'M0,0 L0,10 L10,10 L10,0 Z'
    const mid = anchorBBox(at(cw, ccw, 0.5))
    // identical shapes however they wind or start: nothing collapses mid-way
    expect(mid.width).toBeCloseTo(10, 6)
    expect(mid.height).toBeCloseTo(10, 6)
    const shifted = 'M10,10 L0,10 L0,0 L10,0 Z'
    const m2 = at(cw, shifted, 0.5)
    expect(anchorBBox(m2)).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('a subpath only one path has grows out of a point at the other path\'s centre', () => {
    const a = `${rect(0, 0, 10, 10)} ${rect(100, 100, 10, 10)}`
    const b = rect(0, 0, 10, 10)
    const start = at(a, b, 1)
    expect(start).toHaveLength(2)
    const second = anchorBBox([start[1]])
    expect(second.width).toBe(0)
    expect(second.x).toBe(5)
    expect(anchorBBox([at(a, b, 0)[1]])).toEqual({ x: 100, y: 100, width: 10, height: 10 })
  })

  it('open against closed: the flag switches halfway', () => {
    const open = 'M0,0 L10,0 L10,10'
    const closed = rect(0, 0, 10, 10)
    const pair = pairPaths(subs(open), subs(closed))
    expect(pathAt(pair, 0.25)[0].closed).toBe(false)
    expect(pathAt(pair, 0.75)[0].closed).toBe(true)
  })

  it('blends curves anchor by anchor, handles included', () => {
    const a = 'M0,0 C0,10 10,10 10,0'
    const b = 'M0,0 C0,30 10,30 10,0'
    const mid = at(a, b, 0.5)[0]
    expect(mid.anchors[0].hOut).toEqual({ x: 0, y: 20 })
  })
})

describe('blend: paint', () => {
  it('colours interpolate in OKLab and come back as hex', () => {
    expect(lerpPaint('#000000', '#ffffff', 0)).toBe('#000000')
    expect(lerpPaint('#000000', '#ffffff', 1)).toBe('#ffffff')
    // perceptual mid-grey is lighter than the sRGB average (#808080)
    expect(lerpPaint('#000000', '#ffffff', 0.5)).toBe('#636363')
    expect(lerpPaint('red', 'rgb(0, 0, 255)', 0.5)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('paints that are not plain colours switch halfway', () => {
    expect(lerpPaint('none', '#ff0000', 0.25)).toBe('none')
    expect(lerpPaint('none', '#ff0000', 0.75)).toBe('#ff0000')
    expect(lerpPaint('url(#g)', '#ff0000', 0.4)).toBe('url(#g)')
    expect(lerpPaint('url(#g)', '#ff0000', 0.6)).toBe('#ff0000')
  })

  it('numbers interpolate, defaults fill what a key does not say', () => {
    const s = lerpStyle({ fill: '#000000', 'stroke-width': '2' }, { fill: '#000000', 'stroke-width': '10', opacity: '0.5' }, 0.5)
    expect(s['stroke-width']).toBe('6')
    expect(s.opacity).toBe('0.75') // 1 → 0.5
    expect(s.stroke).toBeUndefined() // neither says
  })

  it('caps, joins and the fill rule switch halfway; dashes interpolate', () => {
    const a = { 'stroke-linecap': 'butt', 'stroke-dasharray': '4 2' }
    const b = { 'stroke-linecap': 'round', 'stroke-dasharray': '8 6' }
    expect(lerpStyle(a, b, 0.25)['stroke-linecap']).toBe('butt')
    expect(lerpStyle(a, b, 0.75)['stroke-linecap']).toBe('round')
    expect(lerpStyle(a, b, 0.5)['stroke-dasharray']).toBe('6 4')
    expect(lerpStyle({}, { 'stroke-dasharray': '4 2' }, 0.25)['stroke-dasharray']).toBe('none')
    expect(lerpStyle({ 'stroke-dasharray': '4' }, { 'stroke-dasharray': '2 6' }, 0.5)['stroke-dasharray']).toBe('3 5')
  })

  it('reads a plain colour as rgb', () => {
    expect(rgbOf('#ff0000')).toEqual([1, 0, 0])
    expect(rgbOf('none')).toBeNull()
    expect(rgbOf('url(#x)')).toBeNull()
    expect(rgbOf(null)).toBeNull()
  })
})

describe('blend: step counts', () => {
  const look = (fill, x = 0) => ({ fill, stroke: null, box: { x, y: 0, width: 10, height: 10 } })
  it('a fixed number of steps is clamped', () => {
    const k = look('#000')
    expect(stepCount({ mode: 'steps', steps: 5, distance: 20 }, k, k, 100)).toBe(5)
    expect(stepCount({ mode: 'steps', steps: 0, distance: 20 }, k, k, 100)).toBe(1)
    expect(stepCount({ mode: 'steps', steps: 5000, distance: 20 }, k, k, 100)).toBe(200)
  })

  it('a distance fills the gap between the keys', () => {
    const k = look('#000')
    expect(stepCount({ mode: 'distance', steps: 5, distance: 20 }, k, k, 100)).toBe(4)
    expect(stepCount({ mode: 'distance', steps: 5, distance: 200 }, k, k, 100)).toBe(0)
  })

  it('smooth colour follows the largest channel difference, else the distance', () => {
    const smooth = { mode: 'smooth', steps: 5, distance: 20 }
    expect(stepCount(smooth, look('#000000'), look('#ff0000'), 100)).toBe(128)
    expect(stepCount(smooth, look('#102030'), look('#102030', 40), 100)).toBe(20)
    expect(stepCount(smooth, look('#102030'), look('#102030'), 100)).toBe(1)
  })
})
