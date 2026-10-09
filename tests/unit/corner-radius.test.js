import {
  parseSource, pathCorners, cutCorner, cornerSetback, maxCornerRadius, parseCornerSpec,
  formatCornerSpec, cornersD, subpathsToD, expectedCornerD, isCornerStateCurrent,
  remapCornerSource, CORNER_RADIUS_ATTR, CORNER_SOURCE_ATTR
} from '../../packages/svgcanvas/core/corner-radius.js'
import { polyline } from '../../packages/svgcanvas/core/anchor-path.js'

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const star = (cx, cy, ro, ri, n) => {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = -Math.PI / 2 + (i * Math.PI) / n
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return [polyline(pts, true)]
}

const all = (corners, r) => ({
  radii: new Map(corners.map((c) => [c.index, r])),
  kinds: new Map(corners.map((c) => [c.index, 'r']))
})

describe('corner-radius', function () {
  describe('legacy single-number drawings render unchanged', function () {
    // Outputs produced by the pre-T1.3 straight-segment-only implementation.
    const cases = [
      ['M10,10 L110,10 L110,70 L10,70 Z', 18,
        'M10,28 A18 18 0 0 1 28,10 L92,10 A18 18 0 0 1 110,28 L110,52 A18 18 0 0 1 92,70 L28,70 A18 18 0 0 1 10,52 Z'],
      ['M0,0 L100,0 L0,40 Z', 30,
        'M0,20 A20 20 0 0 1 20,0 L50,0 A9.62912 9.62912 0 0 1 53.576165,18.569534 L18.569534,32.572186 A13.540659 13.540659 0 0 1 0,20 Z'],
      ['M0,0 L50,0 L80,40 L120,40', 7,
        'M0,0 L46.5,0 A7 7 0 0 1 52.1,2.8 L77.9,37.2 A7 7 0 0 0 83.5,40 L120,40']
    ]
    for (const [src, r, expected] of cases) {
      it(`${src} @ ${r}`, function () {
        assert.equal(cornersD(parseSource(src), parseCornerSpec(String(r))), expected)
      })
    }

    it('the stored source keeps the canonical M/L/Z form', function () {
      assert.equal(subpathsToD(parseSource('M0 0 H10 V10 L0 0 Z')), 'M0,0 L10,0 L10,10 Z')
    })

    it('drops a repeated point so its neighbour is a proper corner', function () {
      const subs = parseSource('M0,0 L10,0 L10,0 L10,10 Z')
      assert.equal(subs[0].anchors.length, 3)
      assert.equal(pathCorners(subs).length, 3)
    })
  })

  describe('corners', function () {
    it('a star has ten corners; cuts are circles tangent to both sides', function () {
      const sps = star(100, 100, 50, 25, 5)
      const corners = pathCorners(sps)
      assert.equal(corners.length, 10)
      const angle = (c) => Math.atan2(Math.abs(c.u.x * c.v.y - c.u.y * c.v.x), c.u.x * c.v.x + c.u.y * c.v.y)
      corners.forEach((c, i) => {
        if (i % 2 === 0) assert.ok(angle(c) < Math.PI / 2, 'tips are acute')
        else assert.ok(angle(c) > Math.PI / 2, 'inner corners are obtuse')
      })
      for (const c of corners) {
        const [entry, exit] = cutCorner(c, 4, 'r')
        const t = cornerSetback(c, 4)
        assert.ok(near(dist(entry.p, c.at), t))
        assert.ok(near(dist(exit.p, c.at), t))
        // tangent arc: centre sits `r` from both ends along the bisector
        const r = entry.arc.r
        assert.ok(near(r, 4, 1e-9))
        const k = r / Math.sqrt(1 - (c.u.x * c.v.x + c.u.y * c.v.y) ** 2) // r / sin
        const o = { x: c.at.x + (c.u.x + c.v.x) * k, y: c.at.y + (c.u.y + c.v.y) * k }
        assert.ok(near(dist(entry.p, o), r, 1e-9))
        assert.ok(near(dist(exit.p, o), r, 1e-9))
      }
      const d = cornersD(sps, parseCornerSpec('4'))
      assert.equal((d.match(/A/g) || []).length, 10)
    })

    it('radii stop at half the shorter side, per corner', function () {
      const sps = [polyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 40 }], true)]
      const corners = pathCorners(sps)
      assert.equal(corners.length, 3)
      for (const c of corners) {
        const max = maxCornerRadius(c)
        assert.ok(near(cornerSetback(c, max), Math.min(c.lu, c.lv) / 2))
        assert.ok(near(cornerSetback(c, 1e6), Math.min(c.lu, c.lv) / 2))
      }
      assert.ok(near(maxCornerRadius(corners[0]), 20))
    })

    it('ends, curves, handled and straight-through anchors are not corners', function () {
      const open = [polyline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 150, y: 80 }], false)]
      assert.deepEqual(pathCorners(open).map((c) => c.index), [2, 3])
      const sq = [polyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true)]
      sq[0].anchors[1].hOut = { x: 110, y: 10 }
      assert.deepEqual(pathCorners(sq).map((c) => c.index), [0, 3])
      assert.equal(pathCorners(parseSource('M0,5 C0,-2 10,-2 10,5 C10,12 0,12 0,5 Z')).length, 0)
      // A second subpath counts on from the first one's anchors.
      const two = parseSource('M0,0 L10,0 L0,10 Z M50,0 L60,0 L50,10 Z')
      assert.deepEqual(pathCorners(two).map((c) => c.index), [0, 1, 2, 3, 4, 5])
    })

    it('a path can curve elsewhere: only the straight corner is cut', function () {
      // Rectangle-ish with a curved right side: the two left corners flank straight sides only.
      const subs = parseSource('M0,0 L50,0 C80,0 80,50 50,50 L0,50 Z')
      assert.deepEqual(pathCorners(subs).map((c) => c.index), [0, 3])
      const d = cornersD(subs, parseCornerSpec('5'))
      assert.match(d, /C/)
      assert.equal((d.match(/A/g) || []).length, 2)
    })
  })

  describe('kinds', function () {
    const sps = star(0, 0, 50, 25, 5)
    const corners = pathCorners(sps)
    const ends = (kind) => corners.flatMap((c) => cutCorner(c, 3, kind).map((a) => [a.p.x, a.p.y]))

    it('inverted and chamfer cuts end where the round one does', function () {
      const round = ends('r')
      assert.equal(round.length, 20)
      assert.deepEqual(ends('i'), round)
      assert.deepEqual(ends('c'), round)
    })

    it('the inverted arc is centred on the corner, opposite to the round arc', function () {
      const c = corners[0]
      const [round] = cutCorner(c, 3, 'r')
      const [inv, exit] = cutCorner(c, 3, 'i')
      assert.ok(near(inv.arc.r, cornerSetback(c, 3)))
      assert.equal(inv.arc.sweep, 1 - round.arc.sweep)
      assert.ok(near(dist(inv.p, c.at), inv.arc.r))
      assert.ok(near(dist(exit.p, c.at), inv.arc.r))
    })

    it('a chamfer is a straight line between the trim points', function () {
      const [a, b] = cutCorner(corners[0], 3, 'c')
      assert.equal(a.arc, undefined)
      assert.ok(b.p)
      const kinds = new Map(corners.map((c) => [c.index, 'c']))
      const radii = new Map(corners.map((c) => [c.index, 3]))
      assert.doesNotMatch(cornersD(sps, parseCornerSpec(formatCornerSpec(corners, radii, kinds))), /A/)
    })
  })

  describe('spec grammar', function () {
    it('parses the single number, lists and kinds', function () {
      assert.deepEqual(parseCornerSpec('8'), { uniform: 8, radii: [], kinds: [] })
      assert.deepEqual(parseCornerSpec(null), { uniform: 0, radii: [], kinds: [] })
      assert.deepEqual(parseCornerSpec('8:i,0,5:c'), { uniform: null, radii: [8, 0, 5], kinds: ['i', 'r', 'c'] })
      assert.deepEqual(parseCornerSpec('8:r').uniform, null)
      assert.equal(parseCornerSpec('-3').uniform, 0)
    })

    it('formats uniform-round as a single number and the rest as a list', function () {
      const corners = pathCorners(parseSource('M0,0 L10,0 L10,10 L0,10 Z'))
      let { radii, kinds } = all(corners, 4)
      assert.equal(formatCornerSpec(corners, radii, kinds), '4')
      kinds.set(1, 'i')
      assert.equal(formatCornerSpec(corners, radii, kinds), '4,4:i,4,4')
      radii = new Map([[0, 6]])
      assert.equal(formatCornerSpec(corners, radii, new Map()), '6:r')
      assert.equal(formatCornerSpec(corners, new Map(), new Map()), null)
      // the list always round-trips
      assert.deepEqual(parseCornerSpec('6:r'), { uniform: null, radii: [6], kinds: ['r'] })
    })

    it('per-corner radii cut only those corners', function () {
      const subs = parseSource('M0,0 L100,0 L100,60 L0,60 Z')
      const d = cornersD(subs, parseCornerSpec('10,0,0,0:r'))
      assert.equal((d.match(/A/g) || []).length, 1)
    })
  })

  describe('state attributes', function () {
    const mk = (attrs) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k])
      return el
    }

    it('detects a stale or current d, tolerating re-serialisation rounding', function () {
      const el = mk({ [CORNER_SOURCE_ATTR]: 'M0,0 L100,0 L100,60 L0,60 Z', [CORNER_RADIUS_ATTR]: '10' })
      el.setAttribute('d', expectedCornerD(el))
      assert.ok(isCornerStateCurrent(el))
      // what the saver does: round to two decimals
      el.setAttribute('d', expectedCornerD(el).replace(/(\d+\.\d{3})\d*/g, (m) => Number(m).toFixed(2)))
      assert.ok(isCornerStateCurrent(el))
      el.setAttribute('d', 'M0,0 L100,0 L100,70 L0,70 Z')
      assert.ok(!isCornerStateCurrent(el))
      assert.ok(!isCornerStateCurrent(mk({ d: 'M0,0 L1,1' })))
    })

    it('remap keeps per-corner radii proportional after a scale', function () {
      const el = mk({ [CORNER_SOURCE_ATTR]: 'M0,0 L100,0 L100,60 L0,60 Z', [CORNER_RADIUS_ATTR]: '10,0,6:c,0' })
      el.setAttribute('d', expectedCornerD(el))
      remapCornerSource(el, (x, y) => ({ x: x * 2, y: y * 2 }), () => 2, () => 2)
      assert.equal(el.getAttribute(CORNER_SOURCE_ATTR), 'M0,0 L200,0 L200,120 L0,120 Z')
      assert.equal(el.getAttribute(CORNER_RADIUS_ATTR), '20,0,12:c,0')
      assert.ok(isCornerStateCurrent(el))
    })

    it('remap of the single-number format scales it and regenerates d', function () {
      const el = mk({ [CORNER_SOURCE_ATTR]: 'M10,10 L110,10 L110,70 L10,70 Z', [CORNER_RADIUS_ATTR]: '18' })
      remapCornerSource(el, (x, y) => ({ x: x + 5, y }), () => 1, () => 1)
      assert.equal(el.getAttribute(CORNER_RADIUS_ATTR), '18')
      assert.equal(el.getAttribute('d'),
        'M15,28 A18 18 0 0 1 33,10 L97,10 A18 18 0 0 1 115,28 L115,52 A18 18 0 0 1 97,70 L33,70 A18 18 0 0 1 15,52 Z')
    })

    it('remap handles a flip (negative scale)', function () {
      const el = mk({ [CORNER_SOURCE_ATTR]: 'M0,0 L100,0 L100,60 L0,60 Z', [CORNER_RADIUS_ATTR]: '10' })
      remapCornerSource(el, (x, y) => ({ x: -x, y }), () => -1, () => 1)
      assert.equal(el.getAttribute(CORNER_RADIUS_ATTR), '10')
      assert.ok(isCornerStateCurrent(el))
      assert.equal((el.getAttribute('d').match(/A/g) || []).length, 4)
    })
  })
})
