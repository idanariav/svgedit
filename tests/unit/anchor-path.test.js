import {
  parseAnchors, anchorsToD, segCubic, evalCubic, splitCubic, normalAt,
  mapNonlinear, catmullRom, seededNoise, anchorBBox, sameAnchorGeometry
} from '../../packages/svgcanvas/core/anchor-path.js'

const close = (a, b, eps = 1e-9) => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`)

describe('anchor-path', function () {
  describe('parseAnchors / anchorsToD', function () {
    it('round-trips M/L/C on an open path', function () {
      const d = 'M0,0 L10,0 C10,5 15,10 20,10'
      const sps = parseAnchors(d)
      assert.equal(sps.length, 1)
      assert.ok(!sps[0].closed)
      assert.equal(sps[0].anchors.length, 3)
      assert.equal(anchorsToD(sps), d)
    })

    it('normalises relative, H/V, quadratic, shorthand and arc commands to M/L/C', function () {
      const sps = parseAnchors('M10 10 h20 v10 q5 5 10 0 a5 5 0 0 1 10 0')
      const d = anchorsToD(sps)
      assert.match(d, /^M[\d.,-]+( [LC][\d.,\s-]+)+$/)
      assert.doesNotMatch(d, /[HVQAhvqa]/)
      // h20 → (30,10); v10 → (30,20); q ends at (40,20); arc ends at (50,20)
      const ends = sps[0].anchors.map((a) => [a.p.x, a.p.y])
      assert.deepEqual(ends.slice(0, 4), [[10, 10], [30, 10], [30, 20], [40, 20]])
      close(ends[ends.length - 1][0], 50)
      close(ends[ends.length - 1][1], 20)
    })

    it('elevates a quadratic to the equivalent cubic', function () {
      const [sp] = parseAnchors('M0,0 Q10,10 20,0')
      const c = segCubic(sp, 0)
      close(c.p1.x, 20 / 3)
      close(c.p1.y, 20 / 3)
      close(c.p2.x, 20 - 20 / 3)
      close(c.p2.y, 20 / 3)
    })

    it('closed subpath keeps an explicit closing segment and Z', function () {
      const [sp] = parseAnchors('M0,0 L10,0 L10,10 Z')
      assert.ok(sp.closed)
      assert.equal(sp.anchors.length, 3)
      assert.equal(anchorsToD([sp]), 'M0,0 L10,0 L10,10 L0,0 Z')
    })

    it('folds an explicit closing lineto into the closed subpath', function () {
      const [sp] = parseAnchors('M0,0 L10,0 L10,10 L0,0 Z')
      assert.equal(sp.anchors.length, 3)
      assert.equal(anchorsToD([sp]), 'M0,0 L10,0 L10,10 L0,0 Z')
    })

    it('folds a closing anchor that misses the start by rounding, only with closeTol', function () {
      const d = 'M0,0 L10,0 C10,10 0,10 0.04,0.03 Z'
      assert.equal(parseAnchors(d)[0].anchors.length, 3)
      const folded = parseAnchors(d, 0.1)[0]
      assert.equal(folded.anchors.length, 2)
      assert.deepEqual(folded.anchors[0].hIn, { x: 0, y: 10 })
    })

    it('keeps a curved closing segment', function () {
      const [sp] = parseAnchors('M0,0 L10,0 C10,10 0,10 0,0 Z')
      assert.equal(sp.anchors.length, 2)
      assert.equal(anchorsToD([sp]), 'M0,0 L10,0 C10,10 0,10 0,0 Z')
    })

    it('handles multiple subpaths and drops lone moves', function () {
      const sps = parseAnchors('M0,0 L1,1 M5,5 M10,10 L11,11 Z')
      assert.equal(sps.length, 2)
      assert.ok(!sps[0].closed)
      assert.ok(sps[1].closed)
    })

    it('returns [] for empty or garbage data', function () {
      assert.deepEqual(parseAnchors(''), [])
      assert.deepEqual(parseAnchors(null), [])
    })
  })

  describe('cubic helpers', function () {
    it('a straight segment gets handles at 1/3 and 2/3', function () {
      const [sp] = parseAnchors('M0,0 L9,0')
      const c = segCubic(sp, 0)
      assert.deepEqual(c.p1, { x: 3, y: 0 })
      assert.deepEqual(c.p2, { x: 6, y: 0 })
    })

    it('splitCubic sub-curve evaluates to the same points', function () {
      const c = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 10 }, p2: { x: 10, y: 10 }, p3: { x: 10, y: 0 } }
      const sub = splitCubic(c, 0.25, 0.75)
      for (const u of [0, 0.3, 0.5, 1]) {
        const a = evalCubic(sub, u)
        const b = evalCubic(c, 0.25 + u * 0.5)
        close(a.x, b.x)
        close(a.y, b.y)
      }
    })

    it('normalAt is a unit vector to the left of travel (y-down)', function () {
      const [sp] = parseAnchors('M0,0 L10,0')
      const n = normalAt(segCubic(sp, 0), 0.5)
      close(n.x, 0)
      close(n.y, -1)
    })
  })

  describe('mapNonlinear', function () {
    it('identity f returns the same curve (closed square, curved shape)', function () {
      const sps = parseAnchors('M0,0 L100,0 L100,100 C50,150 20,150 0,100 Z')
      const mapped = mapNonlinear(sps, 10, (p) => p)
      const orig = sps[0]
      const m = mapped[0]
      assert.ok(m.closed)
      const pts = (sp, steps) => {
        const out = []
        for (let i = 0; i < sp.anchors.length; i++) {
          const c = segCubic(sp, i)
          for (let k = 0; k <= steps; k++) out.push(evalCubic(c, k / steps))
        }
        return out
      }
      // Every mapped sample must lie on the original curve: check distance
      // from mapped points to the dense original polyline.
      const dense = pts(orig, 3000)
      const sub = pts(m, 10)
      for (const q of sub) {
        let best = Infinity
        for (const p of dense) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y))
        assert.isBelow(best, 0.1)
      }
      assert.ok(m.anchors.length > orig.anchors.length)
    })

    it('an affine f yields the affine image of the geometry', function () {
      const sps = parseAnchors('M0,0 C0,50 50,50 50,0')
      const f = (p) => ({ x: 2 * p.x + 3, y: -p.y + 7 })
      const mapped = mapNonlinear(sps, 5, f)
      const orig = segCubic(sps[0], 0)
      // Total mapped curve at its endpoints equals the mapped endpoints.
      const first = mapped[0].anchors[0].p
      const lastA = mapped[0].anchors[mapped[0].anchors.length - 1].p
      close(first.x, 3)
      close(first.y, 7)
      close(lastA.x, 103)
      close(lastA.y, 7)
      // Midpoint of the original (t=.5) maps onto the mapped curve.
      const mid = f(evalCubic(orig, 0.5))
      let best = Infinity
      for (let i = 0; i < mapped[0].anchors.length - 1; i++) {
        const c = segCubic(mapped[0], i)
        for (let k = 0; k <= 50; k++) {
          const q = evalCubic(c, k / 50)
          best = Math.min(best, Math.hypot(q.x - mid.x, q.y - mid.y))
        }
      }
      assert.isBelow(best, 1e-3)
    })

    it('splits into at most 64 pieces per segment and at least one', function () {
      const sps = parseAnchors('M0,0 L100000,0')
      assert.equal(mapNonlinear(sps, 0.001, (p) => p)[0].anchors.length, 65)
      assert.equal(mapNonlinear(sps, 1e9, (p) => p)[0].anchors.length, 2)
    })

    it('preserves closedness and subpath count', function () {
      const sps = parseAnchors('M0,0 L10,0 L10,10 Z M20,20 L30,30')
      const mapped = mapNonlinear(sps, 3, (p) => p)
      assert.equal(mapped.length, 2)
      assert.ok(mapped[0].closed)
      assert.ok(!mapped[1].closed)
    })
  })

  describe('catmullRom / seededNoise / anchorBBox', function () {
    it('catmullRom passes through the points with symmetric handles', function () {
      const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]
      const sp = catmullRom(pts, false, 1)
      assert.equal(sp.anchors.length, 3)
      assert.deepEqual(sp.anchors[1].p, { x: 10, y: 10 })
      close(sp.anchors[1].hOut.x - 10, 10 - sp.anchors[1].hIn.x)
    })

    it('catmullRom with <3 points degrades to a polyline', function () {
      const sp = catmullRom([{ x: 0, y: 0 }, { x: 1, y: 1 }], false, 1)
      assert.equal(sp.anchors.length, 2)
      assert.deepEqual(sp.anchors[0].hOut, sp.anchors[0].p)
    })

    it('seededNoise is deterministic, in [-1, 1], and varies with inputs', function () {
      const seen = new Set()
      for (let i = 0; i < 200; i++) {
        const v = seededNoise(7, i, 3, 1)
        assert.ok(v >= -1)
        assert.ok(v <= 1)
        assert.equal(v, seededNoise(7, i, 3, 1))
        seen.add(v)
      }
      assert.ok(seen.size > 190)
      assert.notEqual(seededNoise(1, 5, 5, 5), seededNoise(2, 5, 5, 5))
    })

    it('anchorBBox covers curve extent, not handles', function () {
      // Quarter-ish bump: control points reach y=100 but the curve peaks ~75.
      const bbox = anchorBBox(parseAnchors('M0,0 C0,100 100,100 100,0'))
      close(bbox.x, 0)
      close(bbox.width, 100)
      assert.isBelow(bbox.height, 80)
      assert.ok(bbox.height > 70)
    })
  })

  describe('sameAnchorGeometry', function () {
    const a = parseAnchors('M0,0 C0,10 10,10 10,0 L10,-10 Z')

    it('accepts re-serialisation rounding but not real edits', function () {
      assert.ok(sameAnchorGeometry(a, parseAnchors('M0.004,0 C0,10.004 9.996,10 10,0 L10,-10 Z')))
      assert.ok(!sameAnchorGeometry(a, parseAnchors('M0,0 C0,10 10,10 10,0 L10,-12 Z')))
    })

    it('compares structure: subpath count, closedness, anchor count', function () {
      assert.ok(!sameAnchorGeometry(a, parseAnchors('M0,0 C0,10 10,10 10,0 L10,-10')))
      assert.ok(!sameAnchorGeometry(a, parseAnchors('M0,0 C0,10 10,10 10,0 L10,-10 Z M1,1 L2,2')))
      assert.ok(!sameAnchorGeometry(a, parseAnchors('M0,0 L10,0 Z')))
    })

    it('tracks handle moves', function () {
      assert.ok(!sameAnchorGeometry(a, parseAnchors('M0,0 C0,12 10,10 10,0 L10,-10 Z')))
    })
  })
})
