import { describe, it, expect } from 'vitest'
import { tracksOf, makeTrack, frameAt, mapOnTrack, orientArt, artAlongPath, patternAlongPath } from '../../packages/svgcanvas/core/art-brush.js'

const nums = (d) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }))
const xs = (out) => out.flatMap((o) => nums(o.d)).map((p) => p.x)
const ys = (out) => out.flatMap((o) => nums(o.d)).map((p) => p.y)
// a 10 × 4 box of art
const BOX = [{ d: 'M0,0 L10,0 L10,4 L0,4 Z', attrs: { fill: '#f00', 'stroke-width': '2' } }]

describe('tracks', () => {
  it('a straight path has its length and a constant frame', () => {
    const [t] = tracksOf('M0,0 L100,0')
    expect(t.length).toBeCloseTo(100, 6)
    const { p, t: tg } = frameAt(t, 25)
    expect(p.x).toBeCloseTo(25, 6)
    expect(tg).toEqual({ x: 1, y: 0 })
    expect(mapOnTrack(t, 50, 5)).toEqual({ x: 50, y: 5 }) // the left normal of +x is +y (y down)
  })

  it('an open track continues past its ends along the end tangents; a closed one wraps', () => {
    const [t] = tracksOf('M0,0 L100,0')
    expect(mapOnTrack(t, 110, 0).x).toBeCloseTo(110, 6)
    expect(mapOnTrack(t, -10, 0).x).toBeCloseTo(-10, 6)
    const [sq] = tracksOf('M0,0 L10,0 L10,10 L0,10 Z')
    expect(sq.closed).toBe(true)
    expect(sq.length).toBeCloseTo(40, 6)
    expect(frameAt(sq, 45).p.x).toBeCloseTo(5, 6)
  })

  it('gentle vertices of a flattened curve blend their tangents; real corners keep both', () => {
    const t = makeTrack([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 1 }, { x: 20, y: 11 }], false)
    expect(t.corner).toEqual([false, false, true, false])
    // inside the segment before the corner, the tangent stays the segment's own at the corner end
    expect(frameAt(t, t.cum[2] - 1e-6).t.y).toBeCloseTo(t.dirs[1].y, 3)
  })

  it('degenerate input gives no track', () => {
    expect(makeTrack([{ x: 1, y: 1 }], false)).toBeNull()
    expect(makeTrack([{ x: 1, y: 1 }, { x: 1, y: 1 }], false)).toBeNull()
    expect(tracksOf('')).toEqual([])
  })
})

describe('orientArt', () => {
  it('bounds and flips', () => {
    const o = orientArt(BOX, 'ltr', false, false)
    expect(o.width).toBe(10)
    expect(o.cy).toBe(2)
    const rtl = orientArt([{ d: 'M0,0 L10,0 L10,4 Z' }], 'ttb', false, false)
    expect(rtl.width).toBe(4) // turned a quarter: it now runs along its old height
    expect(orientArt([{ d: 'M0,0 L0,4' }], 'ltr', false, false)).toBeNull() // no width, nothing to stretch
    expect(orientArt([], 'ltr', false, false)).toBeNull()
  })
})

describe('art brush', () => {
  it('the art spans the path length and is centred across it', () => {
    const out = artAlongPath('M0,0 L100,0', BOX)
    expect(out).toHaveLength(1)
    expect(Math.min(...xs(out))).toBeCloseTo(0, 1)
    expect(Math.max(...xs(out))).toBeCloseTo(100, 1)
    expect(Math.min(...ys(out))).toBeCloseTo(-2, 1)
    expect(Math.max(...ys(out))).toBeCloseTo(2, 1)
    expect(out[0].d).toMatch(/Z$/)
  })

  it('width scales across the path and the art stroke width with it', () => {
    const out = artAlongPath('M0,0 L100,0', BOX, { width: 200 })
    expect(Math.max(...ys(out))).toBeCloseTo(4, 1)
    expect(out[0].attrs['stroke-width']).toBe('4')
    expect(out[0].attrs.fill).toBe('#f00')
  })

  it('proportional keeps the art\'s proportions', () => {
    const out = artAlongPath('M0,0 L100,0', BOX, { scale: 'proportional' })
    expect(Math.max(...ys(out))).toBeCloseTo(20, 1) // 10 → 100 is ×10, so 4 → 40 tall, centred
  })

  it('a straight art edge is subdivided so it bends with a curved path', () => {
    const out = artAlongPath('M0,0 C0,60 100,60 100,0', BOX)
    const top = nums(out[0].d)
    expect(top.length).toBeGreaterThan(100)
    // the long edge follows the curve: not all points on one line
    const ysTop = top.slice(0, 50).map((p) => p.y)
    expect(Math.max(...ysTop) - Math.min(...ysTop)).toBeGreaterThan(5)
  })

  it('a vertical path turns the art', () => {
    const out = artAlongPath('M0,0 L0,100', BOX)
    expect(Math.max(...ys(out))).toBeCloseTo(100, 1)
    // the left of travel when going +y is -x
    expect(Math.min(...xs(out))).toBeCloseTo(-2, 1)
    expect(Math.max(...xs(out))).toBeCloseTo(2, 1)
  })

  it('flipping across mirrors the art about the path', () => {
    const tri = [{ d: 'M0,0 L10,0 L10,10 Z' }]
    const a = artAlongPath('M0,0 L100,0', tri)
    const b = artAlongPath('M0,0 L100,0', tri, { flipAcross: true })
    expect(Math.max(...ys(a))).toBeCloseTo(Math.max(...ys(b)), 1)
    expect(nums(a[0].d)[2].y).toBeCloseTo(-nums(b[0].d)[2].y, 1)
  })

  it('every subpath gets its own copy, nothing for an empty path', () => {
    expect(artAlongPath('M0,0 L50,0 M0,20 L50,20', BOX)).toHaveLength(2)
    expect(artAlongPath('', BOX)).toEqual([])
    expect(artAlongPath('M0,0 L100,0', [])).toEqual([])
  })

  it('a closed path wraps the art into a ring', () => {
    const out = artAlongPath('M0,0 L100,0 L100,100 L0,100 Z', BOX)
    expect(out.length).toBeGreaterThan(0)
    const x = xs(out)
    expect(Math.min(...x)).toBeCloseTo(-2, 0)
    expect(Math.max(...x)).toBeCloseTo(102, 0)
  })
})

describe('pattern brush', () => {
  const tiles = (out) => out.length

  it('stretch fits a whole number of tiles', () => {
    expect(tiles(patternAlongPath('M0,0 L100,0', BOX))).toBe(10)
    expect(tiles(patternAlongPath('M0,0 L104,0', BOX))).toBe(10) // 10.4 rounds to 10, stretched
    const out = patternAlongPath('M0,0 L104,0', BOX)
    expect(Math.max(...xs(out))).toBeCloseTo(104, 1)
  })

  it('add space keeps the tile size and widens the gaps', () => {
    const out = patternAlongPath('M0,0 L100,0', BOX, { fit: 'addSpace', spacing: 50 })
    expect(tiles(out)).toBe(7) // floor((100 + 5) / 15)
    const first = nums(out[0].d)
    expect(Math.max(...first.map((p) => p.x)) - Math.min(...first.map((p) => p.x))).toBeCloseTo(10, 1)
    expect(Math.max(...xs(out))).toBeCloseTo(100, 1)
  })

  it('approximate keeps the size and centres the run', () => {
    const out = patternAlongPath('M0,0 L95,0', BOX, { fit: 'approximate' })
    expect(tiles(out)).toBe(10)
    expect(Math.min(...xs(out))).toBeCloseTo(-2.5, 1) // 100 of tiles on 95 of path, overhanging both ends
  })

  it('scale sizes the tiles', () => {
    expect(tiles(patternAlongPath('M0,0 L100,0', BOX, { scale: 200, fit: 'approximate' }))).toBe(5)
    const out = patternAlongPath('M0,0 L100,0', BOX, { scale: 200, fit: 'approximate' })
    expect(Math.max(...ys(out)) - Math.min(...ys(out))).toBeCloseTo(8, 1)
  })

  it('a corner starts a new run, so no tile straddles it', () => {
    const out = patternAlongPath('M0,0 L50,0 L50,50', BOX)
    expect(tiles(out)).toBe(10) // 5 per leg
    for (const o of out) {
      const p = nums(o.d)
      const onFirst = p.every((q) => q.y <= 2 + 1e-6)
      const onSecond = p.every((q) => q.x >= 50 - 2 - 1e-6)
      expect(onFirst || onSecond).toBe(true)
    }
  })

  it('a closed square puts whole tiles on every side', () => {
    expect(tiles(patternAlongPath('M0,0 L40,0 L40,40 L0,40 Z', BOX))).toBe(16)
  })

  it('nothing to tile gives nothing', () => {
    expect(patternAlongPath('', BOX)).toEqual([])
    expect(patternAlongPath('M0,0 L100,0', [])).toEqual([])
  })
})
