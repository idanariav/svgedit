import {
  fitCubics, fitSingle, fitSingleFrom, startTangent, endTangent, isStraight, sampleCubic, unit
} from '../../packages/svgcanvas/core/bezier-fit.js'

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

describe('bezier-fit', function () {
  const cubic = { p0: { x: 0, y: 0 }, p1: { x: 30, y: 60 }, p2: { x: 70, y: 60 }, p3: { x: 100, y: 0 } }

  it('fits a cubic exactly', function () {
    const pts = []
    sampleCubic(cubic, 40, pts, true)
    const out = fitCubics(pts, startTangent(cubic), endTangent(cubic), 0.05)
    assert.equal(out.length, 1)
    assert.ok(dist(out[0].p1, cubic.p1) < 1, JSON.stringify(out[0]))
    assert.ok(dist(out[0].p2, cubic.p2) < 1)
  })

  it('splits when one cubic cannot follow the points, with G1-joined pieces', function () {
    const pts = Array.from({ length: 41 }, (_, i) => ({ x: i, y: Math.sin(i * 0.5) * 10 }))
    const out = fitCubics(pts, { x: 1, y: 0 }, { x: 1, y: 0 }, 0.1)
    assert.ok(out.length > 1)
    for (let i = 1; i < out.length; i++) assert.ok(dist(out[i - 1].p3, out[i].p0) < 1e-9)
  })

  it('two points give a straight cubic along the tangents', function () {
    const out = fitCubics([{ x: 0, y: 0 }, { x: 9, y: 0 }], { x: 1, y: 0 }, { x: 1, y: 0 }, 0.1)
    assert.equal(out.length, 1)
    assert.ok(isStraight(out[0], 1e-9))
  })

  it('fitSingleFrom takes the parameters it is given', function () {
    const pts = []
    sampleCubic(cubic, 20, pts, true)
    const u = pts.map((_, i) => i / 20)
    const [c, err] = fitSingleFrom(pts, u, startTangent(cubic), endTangent(cubic))
    assert.ok(err < 0.05)
    assert.ok(dist(c.p1, cubic.p1) < 0.5)
    // and fitSingle (chord-length start) reaches a similar fit
    assert.ok(fitSingle(pts, startTangent(cubic), endTangent(cubic))[1] < 0.5)
  })

  it('drops repeated points and handles degenerate input', function () {
    assert.deepEqual(fitCubics([{ x: 1, y: 1 }, { x: 1, y: 1 }], { x: 1, y: 0 }, { x: 1, y: 0 }, 1), [])
    assert.deepEqual(fitCubics([], { x: 1, y: 0 }, { x: 1, y: 0 }, 1), [])
  })

  it('straight detection', function () {
    const line = { p0: { x: 0, y: 0 }, p1: { x: 3, y: 0 }, p2: { x: 6, y: 0 }, p3: { x: 9, y: 0 } }
    assert.ok(isStraight(line, 1e-6))
    assert.ok(!isStraight({ ...line, p1: { x: 3, y: 1 } }, 1e-6))
    assert.ok(!isStraight({ ...line, p1: { x: -3, y: 0 } }, 1e-6)) // handle outside the chord
  })

  it('tangents are robust to retracted handles', function () {
    const c = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 }, p3: { x: 5, y: 5 } }
    assert.deepEqual(startTangent(c), { x: 1, y: 0 })
    assert.deepEqual(endTangent(c), { x: 0, y: 1 })
    assert.equal(unit({ x: 0, y: 0 }), null)
  })
})
