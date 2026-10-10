import { describe, it } from 'vitest'
import { parseAnchors, evalCubic, segCubic } from '../../packages/svgcanvas/core/anchor-path.js'
import {
  KAPPA, MAX_DIVIDERS, MAX_SEGMENTS, MIN_SEGMENTS,
  spiralD, arcD, dragRect, arcDragEnds,
  rectangularGridParts, polarGridParts, clampDividers, clampSegments
} from '../../packages/svgcanvas/core/shape-family.js'

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

describe('spiralD', () => {
  const spiral = (o) => parseAnchors(spiralD({ cx: 100, cy: 100, radius: 80, ...o }))[0]

  it('has segments + 1 anchors and is open', () => {
    const sp = spiral({ segments: 10 })
    assert.equal(sp.anchors.length, 11)
    assert.equal(sp.closed, false)
  })

  it('starts at the centre end and finishes on the outer radius', () => {
    const sp = spiral({ segments: 8, decay: 80 })
    const first = dist(sp.anchors[0].p, { x: 100, y: 100 })
    const last = dist(sp.anchors[8].p, { x: 100, y: 100 })
    assert.closeTo(last, 80, 1e-3)
    assert.closeTo(first, 80 * 0.8 ** 8, 1e-3)
    assert.isBelow(first, last)
  })

  it('has no handle at its two ends and handles everywhere else', () => {
    const sp = spiral({ segments: 4 })
    const { anchors } = sp
    assert.deepEqual(anchors[0].hIn, anchors[0].p)
    assert.deepEqual(anchors[4].hOut, anchors[4].p)
    assert.notDeepEqual(anchors[0].hOut, anchors[0].p)
    assert.notDeepEqual(anchors[2].hIn, anchors[2].p)
  })

  it('winds clockwise on screen unless asked otherwise', () => {
    // The outer end sits at angle 0 (right of centre); the anchor before it
    // (one quarter turn in) is below centre when clockwise on a y-down screen.
    const cw = spiral({ segments: 4, clockwise: true }).anchors
    const ccw = spiral({ segments: 4, clockwise: false }).anchors
    assert.ok(cw[3].p.y > 100)
    assert.isBelow(ccw[3].p.y, 100)
  })

  it('stays smooth: each quarter keeps near-constant radius change', () => {
    const sp = spiral({ segments: 6, decay: 70 })
    // Mid-point of a quarter segment lies between the radii of its ends.
    for (let i = 0; i < 6; i++) {
      const m = evalCubic(segCubic(sp, i), 0.5)
      const r = dist(m, { x: 100, y: 100 })
      const lo = Math.min(dist(sp.anchors[i].p, { x: 100, y: 100 }), dist(sp.anchors[i + 1].p, { x: 100, y: 100 }))
      const hi = Math.max(dist(sp.anchors[i].p, { x: 100, y: 100 }), dist(sp.anchors[i + 1].p, { x: 100, y: 100 }))
      assert.ok(r > lo * 0.9 && r < hi * 1.1, `quarter ${i}: ${r} not in [${lo}, ${hi}]`)
    }
  })

  it('clamps segments and decay to usable values', () => {
    assert.equal(spiral({ segments: 0 }).anchors.length, MIN_SEGMENTS + 1)
    assert.equal(spiral({ segments: 99999 }).anchors.length, MAX_SEGMENTS + 1)
    assert.ok(Number.isFinite(spiral({ decay: 0 }).anchors[0].p.x))
    assert.ok(Number.isFinite(spiral({ decay: 500 }).anchors[0].p.x))
  })
})

describe('arcD', () => {
  const arc = (o) => parseAnchors(arcD({ x1: 0, y1: 0, x2: 100, y2: 60, ...o }))[0]

  it('is an open two-anchor curve by default', () => {
    const sp = arc()
    assert.equal(sp.closed, false)
    assert.equal(sp.anchors.length, 2)
    assert.deepEqual(sp.anchors[0].p, { x: 0, y: 0 })
    assert.deepEqual(sp.anchors[1].p, { x: 100, y: 60 })
  })

  it('slope 0 is a quarter ellipse centred on the opposite box corner', () => {
    const sp = arc()
    const c = segCubic(sp, 0)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      const p = evalCubic(c, t)
      // Ellipse centred (0, 60) with radii 100 x 60.
      const e = Math.hypot((p.x - 0) / 100, (p.y - 60) / 60)
      assert.closeTo(e, 1, 0.003)
    }
    assert.closeTo(c.p1.x, 100 * KAPPA, 1e-6)
    assert.equal(c.p1.y, 0)
    assert.equal(c.p2.x, 100)
    assert.closeTo(c.p2.y, 60 - 60 * KAPPA, 1e-6)
  })

  it('leaves along x and arrives along y', () => {
    const c = segCubic(arc(), 0)
    assert.equal(c.p1.y, c.p0.y)
    assert.equal(c.p2.x, c.p3.x)
  })

  it('slope -1 is a straight chord, slope 1 reaches the corner', () => {
    const flat = arc({ slope: -1 }).anchors
    assert.deepEqual(flat[0].hOut, flat[0].p)
    assert.deepEqual(flat[1].hIn, flat[1].p)
    const sharp = segCubic(arc({ slope: 1 }), 0)
    assert.deepEqual(sharp.p1, { x: 100, y: 0 })
    assert.deepEqual(sharp.p2, { x: 100, y: 0 })
  })

  it('slope moves the middle monotonically toward the corner', () => {
    const mid = (slope) => evalCubic(segCubic(arc({ slope }), 0), 0.5)
    const dCorner = (s) => dist(mid(s), { x: 100, y: 0 })
    assert.isBelow(dCorner(0.5), dCorner(0))
    assert.isBelow(dCorner(0), dCorner(-0.5))
    assert.isBelow(dCorner(-0.5), dCorner(-1))
  })

  it('clamps an out-of-range slope', () => {
    assert.equal(arcD({ x1: 0, y1: 0, x2: 10, y2: 10, slope: 7 }), arcD({ x1: 0, y1: 0, x2: 10, y2: 10, slope: 1 }))
  })

  it('closed adds the pie-slice vertex at the other box corner and closes', () => {
    const sp = arc({ closed: true })
    assert.equal(sp.closed, true)
    assert.equal(sp.anchors.length, 3)
    assert.deepEqual(sp.anchors[2].p, { x: 0, y: 60 })
  })
})

describe('drag geometry', () => {
  it('dragRect normalises corner-to-corner drags in any direction', () => {
    assert.deepEqual(dragRect({ x: 10, y: 10 }, { x: 60, y: 40 }), { x: 10, y: 10, width: 50, height: 30 })
    assert.deepEqual(dragRect({ x: 60, y: 40 }, { x: 10, y: 10 }), { x: 10, y: 10, width: 50, height: 30 })
  })

  it('Shift makes the box square, keeping the drag direction', () => {
    assert.deepEqual(dragRect({ x: 10, y: 10 }, { x: 60, y: 40 }, { shift: true }), { x: 10, y: 10, width: 50, height: 50 })
    assert.deepEqual(dragRect({ x: 10, y: 10 }, { x: -20, y: 5 }, { shift: true }), { x: -20, y: -20, width: 30, height: 30 })
  })

  it('Alt draws from the centre', () => {
    assert.deepEqual(dragRect({ x: 50, y: 50 }, { x: 60, y: 70 }, { alt: true }), { x: 40, y: 30, width: 20, height: 40 })
    assert.deepEqual(dragRect({ x: 50, y: 50 }, { x: 60, y: 70 }, { alt: true, shift: true }), { x: 30, y: 30, width: 40, height: 40 })
  })

  it('arcDragEnds follows the same modifiers', () => {
    assert.deepEqual(arcDragEnds({ x: 0, y: 0 }, { x: 10, y: 4 }), { x1: 0, y1: 0, x2: 10, y2: 4 })
    assert.deepEqual(arcDragEnds({ x: 0, y: 0 }, { x: 10, y: 4 }, { shift: true }), { x1: 0, y1: 0, x2: 10, y2: 10 })
    assert.deepEqual(arcDragEnds({ x: 50, y: 50 }, { x: 60, y: 54 }, { alt: true }), { x1: 40, y1: 46, x2: 60, y2: 54 })
  })
})

describe('rectangularGridParts', () => {
  const grid = (o) => rectangularGridParts({ x: 0, y: 0, width: 120, height: 60, ...o })

  it('has rows + columns lines and a frame', () => {
    const parts = grid({ rows: 2, columns: 3 })
    assert.equal(parts.filter((p) => p.element === 'path').length, 5)
    assert.equal(parts.filter((p) => p.element === 'rect').length, 1)
  })

  it('spaces dividers evenly inside the box', () => {
    const horizontals = grid({ rows: 2, columns: 0, frame: false }).map((p) => p.attr.d)
    assert.deepEqual(horizontals, ['M0,20 L120,20', 'M0,40 L120,40'])
    const verticals = grid({ rows: 0, columns: 3, frame: false }).map((p) => p.attr.d)
    assert.deepEqual(verticals, ['M30,0 L30,60', 'M60,0 L60,60', 'M90,0 L90,60'])
  })

  it('frame can be dropped and zero dividers leave only the frame', () => {
    assert.equal(grid({ rows: 0, columns: 0, frame: false }).length, 0)
    const only = grid({ rows: 0, columns: 0 })
    assert.equal(only.length, 1)
    assert.deepEqual(only[0].attr, { x: 0, y: 0, width: 120, height: 60 })
  })

  it('caps runaway counts', () => {
    assert.equal(grid({ rows: 99999, columns: 0, frame: false }).length, MAX_DIVIDERS)
    assert.equal(grid({ rows: -3, columns: 0, frame: false }).length, 0)
  })
})

describe('polarGridParts', () => {
  const grid = (o) => polarGridParts({ x: 10, y: 20, width: 100, height: 60, ...o })

  it('has concentric + 1 ellipses and radial spokes', () => {
    const parts = grid({ concentric: 3, radial: 6 })
    assert.equal(parts.filter((p) => p.element === 'ellipse').length, 4)
    assert.equal(parts.filter((p) => p.element === 'path').length, 6)
  })

  it('rings are concentric, evenly stepped, the last filling the box', () => {
    const rings = grid({ concentric: 3, radial: 0 }).map((p) => p.attr)
    assert.ok(rings.every((r) => r.cx === 60 && r.cy === 50))
    assert.deepEqual(rings.map((r) => r.rx), [12.5, 25, 37.5, 50])
    assert.deepEqual(rings.map((r) => r.ry), [7.5, 15, 22.5, 30])
  })

  it('spokes start at 12 o’clock and run from the centre to the box edge', () => {
    const spokes = grid({ concentric: 0, radial: 4 }).filter((p) => p.element === 'path').map((p) => p.attr.d)
    assert.equal(spokes[0], 'M60,50 L60,20')
    assert.equal(spokes[1], 'M60,50 L110,50')
    assert.equal(spokes[2], 'M60,50 L60,80')
    assert.equal(spokes[3], 'M60,50 L10,50')
  })

  it('zero dividers still gives the outline ring and no spokes', () => {
    const parts = grid({ concentric: 0, radial: 0 })
    assert.equal(parts.length, 1)
    assert.equal(parts[0].element, 'ellipse')
  })
})

describe('count clamps', () => {
  it('clampDividers floors, caps and falls back', () => {
    assert.equal(clampDividers(4.9), 4)
    assert.equal(clampDividers(-1), 0)
    assert.equal(clampDividers(1e9), MAX_DIVIDERS)
    assert.equal(clampDividers('abc', 7), 7)
  })

  it('clampSegments floors, caps and falls back', () => {
    assert.equal(clampSegments(6.7), 6)
    assert.equal(clampSegments(0), MIN_SEGMENTS)
    assert.equal(clampSegments(1e9), MAX_SEGMENTS)
    assert.equal(clampSegments(undefined, 9), 9)
  })
})
