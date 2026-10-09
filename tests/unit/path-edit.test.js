import '../../packages/svgcanvas/core/path-seg-shim.js'
import {
  removeAnchor, insertAnchor, addAnchorPoints, averageAnchors, joinSubpaths, segsToSubpaths,
  deleteNodesD, averageNodesD, addAnchorPointsD
} from '../../packages/svgcanvas/core/path-edit.js'
import { parseAnchors, anchorsToD, segCubic, evalCubic, polyline } from '../../packages/svgcanvas/core/anchor-path.js'

// The node editor's segment list for a `d`, as `Path#segs` would hold it.
const segsOf = (d) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', d)
  const list = el.pathSegList
  return Array.from({ length: list.numberOfItems }, (_, i) => {
    const item = list.getItem(i)
    return { type: item.pathSegType, item }
  })
}

const samples = (sp, perSeg = 20) => {
  const out = []
  const n = sp.closed ? sp.anchors.length : sp.anchors.length - 1
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < perSeg; k++) out.push(evalCubic(segCubic(sp, i), k / perSeg))
  }
  return out
}
const nearest = (pts, q) => Math.min(...pts.map((p) => Math.hypot(p.x - q.x, p.y - q.y)))

// A quarter circle of radius 100 centred at the origin, split in two at 45°.
const quarterSplit = () => {
  const r = 100
  const half = (a0, a1) => {
    const k = 4 / 3 * Math.tan((a1 - a0) / 4) * r
    const p = (a) => ({ x: r * Math.cos(a), y: r * Math.sin(a) })
    const tan = (a) => ({ x: -Math.sin(a), y: Math.cos(a) })
    return { p0: p(a0), p1: { x: p(a0).x + tan(a0).x * k, y: p(a0).y + tan(a0).y * k }, p2: { x: p(a1).x - tan(a1).x * k, y: p(a1).y - tan(a1).y * k }, p3: p(a1) }
  }
  const a = half(0, Math.PI / 4)
  const b = half(Math.PI / 4, Math.PI / 2)
  return {
    closed: false,
    anchors: [
      { p: a.p0, hIn: a.p0, hOut: a.p1 },
      { p: a.p3, hIn: a.p2, hOut: b.p1 },
      { p: b.p3, hIn: b.p2, hOut: b.p3 }
    ]
  }
}

describe('path-edit', function () {
  describe('removeAnchor', function () {
    it('deleting the midpoint of a split quarter circle gives one cubic that follows the arc', function () {
      const sp = quarterSplit()
      assert.ok(removeAnchor(sp, 1))
      assert.equal(sp.anchors.length, 2)
      for (const q of samples(sp, 20)) {
        const radius = Math.hypot(q.x, q.y)
        assert.ok(Math.abs(radius - 100) < 0.5, `radius ${radius}`)
      }
      // directions at the ends are kept
      assert.ok(Math.abs(sp.anchors[0].hOut.x - 100) < 1e-6)
      assert.ok(Math.abs(sp.anchors[1].hIn.y - 100) < 1e-6)
    })

    it('two straight segments become one', function () {
      const [sp] = parseAnchors('M0,0 L50,0 L100,0')
      removeAnchor(sp, 1)
      assert.equal(anchorsToD([sp]), 'M0,0 L100,0')
    })

    it('a corner between two lines gives one line, even when it is a real corner', function () {
      const [sp] = parseAnchors('M0,0 L50,50 L100,0')
      removeAnchor(sp, 1)
      assert.equal(anchorsToD([sp]), 'M0,0 L100,0')
    })

    it('removing the end of an open path drops its segment and leaves clean ends', function () {
      const [sp] = parseAnchors('M0,0 C0,10 10,10 10,0 L20,0')
      removeAnchor(sp, 2)
      assert.equal(sp.anchors.length, 2)
      assert.deepEqual(sp.anchors[1].hOut, sp.anchors[1].p)
      removeAnchor(sp, 0)
      assert.equal(sp.anchors.length, 1)
    })

    it('closed stays closed; open stays open; tiny results degrade sanely', function () {
      const [closed] = parseAnchors('M0,0 L10,0 L10,10 L0,10 Z')
      removeAnchor(closed, 2)
      assert.ok(closed.closed)
      assert.equal(closed.anchors.length, 3)
      // a closed triangle losing a node and having no curve is no longer a closed shape
      removeAnchor(closed, 0)
      assert.equal(closed.closed, false)
    })

    it('refits across a line → curve joint, keeping the line end direction', function () {
      const [sp] = parseAnchors('M0,0 L50,0 C80,0 100,20 100,50')
      removeAnchor(sp, 1)
      assert.equal(sp.anchors.length, 2)
      assert.ok(sp.anchors[0].hOut.y === 0 && sp.anchors[0].hOut.x > 0) // still leaves along +x
    })

    it('out of range leaves the subpath alone', function () {
      const [sp] = parseAnchors('M0,0 L10,0 L10,10')
      assert.equal(removeAnchor(sp, 7), false)
      assert.equal(sp.anchors.length, 3)
    })
  })

  describe('addAnchorPoints / insertAnchor', function () {
    it('adds one anchor at the middle of every segment of a closed square (incl. the closing one)', function () {
      const sps = addAnchorPoints(parseAnchors('M0,0 L10,0 L10,10 L0,10 Z'))
      assert.equal(sps[0].anchors.length, 8)
      assert.equal(anchorsToD(sps), 'M0,0 L5,0 L10,0 L10,5 L10,10 L5,10 L0,10 L0,5 L0,0 Z')
    })

    it('on a curve the shape is kept and the new anchor is smooth', function () {
      const [sp] = parseAnchors('M0,0 C0,50 100,50 100,0')
      const before = samples(sp, 200)
      const [after] = addAnchorPoints([sp])
      assert.equal(after.anchors.length, 3)
      for (const q of samples(after, 20)) assert.ok(nearest(before, q) < 0.5)
      const mid = after.anchors[1]
      assert.ok(Math.abs((mid.hIn.x - mid.p.x) * (mid.hOut.y - mid.p.y) - (mid.hIn.y - mid.p.y) * (mid.hOut.x - mid.p.x)) < 1e-9) // collinear handles
    })

    it('leaves the input untouched', function () {
      const sps = parseAnchors('M0,0 L10,0')
      addAnchorPoints(sps)
      assert.equal(sps[0].anchors.length, 2)
    })

    it('insertAnchor returns the new index', function () {
      const [sp] = parseAnchors('M0,0 L10,0 L10,10')
      assert.equal(insertAnchor(sp, 1, 0.5), 2)
      assert.deepEqual(sp.anchors[2].p, { x: 10, y: 5 })
    })
  })

  describe('averageAnchors', function () {
    const sps = parseAnchors('M0,0 L10,20 L20,10 L30,30')
    const sel = [[0, 0], [0, 1], [0, 2]]

    it('horizontal: same y', function () {
      const out = averageAnchors(sps, sel, 'h')[0].anchors
      assert.deepEqual(out.slice(0, 3).map((a) => [a.p.x, a.p.y]), [[0, 10], [10, 10], [20, 10]])
      assert.deepEqual(out[3].p, { x: 30, y: 30 })
    })

    it('vertical: same x', function () {
      const out = averageAnchors(sps, sel, 'v')[0].anchors
      assert.deepEqual(out.slice(0, 3).map((a) => [a.p.x, a.p.y]), [[10, 0], [10, 20], [10, 10]])
    })

    it('both: the same point, handles travelling with their anchors', function () {
      const withHandle = parseAnchors('M0,0 C5,5 10,0 20,20')
      const out = averageAnchors(withHandle, [[0, 0], [0, 1]], 'both')[0].anchors
      assert.deepEqual(out[0].p, out[1].p)
      assert.deepEqual(out[0].hOut, { x: 15, y: 15 }) // (5,5) moved by (+10,+10)
    })

    it('an empty or out-of-range selection changes nothing', function () {
      assert.equal(anchorsToD(averageAnchors(sps, [], 'both')), anchorsToD(sps))
      assert.equal(anchorsToD(averageAnchors(sps, [[3, 3]], 'both')), anchorsToD(sps))
    })
  })

  describe('joinSubpaths', function () {
    it('endpoints within tolerance merge into one anchor', function () {
      const out = joinSubpaths(parseAnchors('M0,0 L10,0 M10.05,0 L20,0'), 0.5)
      assert.equal(out.length, 1)
      assert.equal(out[0].anchors.length, 3)
      assert.equal(out[0].closed, false)
      assert.equal(anchorsToD(out), 'M0,0 L10,0 L20,0')
    })

    it('otherwise a straight segment connects them (nearest ends, reversing as needed)', function () {
      const out = joinSubpaths(parseAnchors('M0,0 L10,0 M30,0 L20,0'), 0)
      assert.equal(out.length, 1)
      assert.equal(anchorsToD(out), 'M0,0 L10,0 L20,0 L30,0')
    })

    it('a single open path closes; if its ends meet they merge', function () {
      const [a] = joinSubpaths(parseAnchors('M0,0 L10,0 L10,10'), 0.5)
      assert.ok(a.closed)
      assert.equal(a.anchors.length, 3)
      const [b] = joinSubpaths(parseAnchors('M0,0 L10,0 L10,10 L0,0'), 0.5)
      assert.ok(b.closed)
      assert.equal(b.anchors.length, 3)
    })

    it('closed inputs pass through; handles are kept across a merge', function () {
      const out = joinSubpaths(parseAnchors('M0,0 L1,0 L1,1 Z M10,10 C10,20 20,20 20,10 M20,10 L30,10'), 0.5)
      assert.equal(out.length, 2)
      assert.ok(out[0].closed)
      assert.equal(out[1].anchors.length, 3)
      assert.deepEqual(out[1].anchors[0].hOut, { x: 10, y: 20 })
    })

    it('three pieces chain up', function () {
      const out = joinSubpaths(parseAnchors('M0,0 L10,0 M20,0 L30,0 M10,0 L20,0'), 0.1)
      assert.equal(out.length, 1)
      assert.equal(out[0].anchors.length, 4)
    })
  })

  describe('segsToSubpaths (the node editor model)', function () {
    it('maps every segment index to its anchor; the closing segment and M share the start anchor', function () {
      const { subpaths, owner } = segsToSubpaths(segsOf('M10,10 L50,10 L50,50 L10,50 L10,10 Z'))
      assert.equal(subpaths[0].anchors.length, 4)
      assert.ok(subpaths[0].closed)
      assert.deepEqual([...owner.entries()].sort((a, b) => a[0] - b[0]), [
        [0, [0, 0]], [1, [0, 1]], [2, [0, 2]], [3, [0, 3]], [4, [0, 0]]
      ])
    })

    it('reads curves, relative commands and keeps handles', function () {
      const { subpaths } = segsOf('M0,0 c0,10 10,10 10,0 l5,5') && segsToSubpaths(segsOf('M0,0 c0,10 10,10 10,0 l5,5'))
      assert.deepEqual(subpaths[0].anchors.map((a) => [a.p.x, a.p.y]), [[0, 0], [10, 0], [15, 5]])
      assert.deepEqual(subpaths[0].anchors[0].hOut, { x: 0, y: 10 })
      assert.deepEqual(subpaths[0].anchors[1].hIn, { x: 10, y: 10 })
    })
  })

  describe('deleteNodesD', function () {
    it('deleting the middle of three points of an open path leaves a line', function () {
      assert.equal(deleteNodesD(segsOf('M10,10 L50,50 L90,10'), [1]), 'M10,10 L90,10')
    })

    it('deleting every node of the only subpath leaves nothing renderable', function () {
      assert.equal(deleteNodesD(segsOf('M10,10 L50,50 L90,10'), [0, 1, 2]), '')
    })

    it('a closed square stays closed with an explicit closing lineto; deleting the start vertex works', function () {
      const segs = segsOf('M10,10 L50,10 L50,50 L10,50 L10,10 Z')
      assert.equal(deleteNodesD(segs, [2]), 'M10,10 L50,10 L10,50 L10,10 Z')
      // the start vertex is gripped by the closing segment (index 4)
      assert.equal(deleteNodesD(segs, [4]), 'M50,10 L50,50 L10,50 L50,10 Z')
    })

    it('several adjacent nodes are removed one after another', function () {
      const d = deleteNodesD(segsOf('M0,0 L10,0 L20,0 L30,0 L40,0'), [1, 2, 3])
      assert.equal(d, 'M0,0 L40,0')
    })

    it('other subpaths are untouched', function () {
      const d = deleteNodesD(segsOf('M0,0 L10,0 L20,0 M50,50 L60,60 L70,50'), [1])
      assert.equal(d, 'M0,0 L20,0 M50,50 L60,60 L70,50')
    })

    it('deleting a node between two curves keeps the shape within half a pixel', function () {
      const d1 = deleteNodesD(segsOf(anchorsToD([quarterSplit()])), [1])
      const after = parseAnchors(d1)[0]
      assert.equal(after.anchors.length, 2)
      for (const q of samples(after, 20)) assert.ok(Math.abs(Math.hypot(q.x, q.y) - 100) < 0.5)
    })
  })

  describe('averageNodesD / addAnchorPointsD', function () {
    it('averages the nodes at the selected segment indices', function () {
      const d = averageNodesD(segsOf('M0,0 L10,20 L20,10'), [0, 1, 2], 'h')
      assert.equal(d, 'M0,10 L10,10 L20,10')
    })

    it('adds anchor points to the whole path', function () {
      assert.equal(addAnchorPointsD(segsOf('M0,0 L10,0 L10,10')), 'M0,0 L5,0 L10,0 L10,5 L10,10')
    })
  })

  it('polyline helper sanity', function () {
    assert.equal(polyline([{ x: 0, y: 0 }, { x: 1, y: 1 }], false).anchors.length, 2)
  })
})
