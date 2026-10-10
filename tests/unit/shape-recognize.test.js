import { describe, it } from 'vitest'
import { recognize, polygonRotation, simplify, resample, closedCorners } from '../../packages/svgcanvas/core/shape-recognize.js'

// The Rust tests of VectorCraft's `crates/geom/src/recognize.rs`, on the same synthetic strokes.

const P = (x, y) => ({ x, y })
const add = (p, v) => P(p.x + v.x, p.y + v.y)
const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
const TAU = Math.PI * 2
const rad = (d) => d * Math.PI / 180
const rotateLeft = (arr, n) => [...arr.slice(n), ...arr.slice(0, n)]
/** transform by translate(tx, ty) · rotate(deg) */
const xform = (tx, ty, deg) => (p) => P(tx + Math.cos(rad(deg)) * p.x - Math.sin(rad(deg)) * p.y, ty + Math.sin(rad(deg)) * p.x + Math.cos(rad(deg)) * p.y)

/** A wobbly stroke through `corners` (closed), `k` samples per edge. */
const wobbly = (corners, k, wobble) => {
  const out = []
  const n = corners.length
  for (let i = 0; i < n; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % n]
    for (let j = 0; j < k; j++) {
      const w = Math.sin((i * k + j) * 1.7) * wobble
      out.push(add(lerp(a, b, j / k), P(w, -w)))
    }
  }
  out.push(add(corners[0], P(3, 2)))
  return out
}

const circle = (c, rx, ry, k) => Array.from({ length: k + 1 }, (_, i) => {
  const a = TAU * i / k
  return P(c.x + rx * Math.cos(a) + Math.sin(a * 5), c.y + ry * Math.sin(a))
})

const regular = (sides, radius, cx, cy, offsetDeg = 0) => Array.from({ length: sides }, (_, i) => {
  const a = rad(offsetDeg) + TAU * i / sides
  return P(cx + radius * Math.cos(a), cy + radius * Math.sin(a))
})

describe('recognize', () => {
  it('rough rectangle and square', () => {
    const r = recognize(wobbly([P(0, 0), P(200, 0), P(200, 100), P(0, 100)], 20, 2))
    assert.equal(r?.type, 'rectangle')
    assert.isBelow(Math.abs(r.rect.width - 200), 8)
    assert.isBelow(Math.abs(r.rect.height - 100), 8)
    const s = recognize(wobbly([P(0, 0), P(100, 0), P(100, 95), P(0, 95)], 20, 1))
    assert.equal(s?.type, 'rectangle')
    assert.isBelow(Math.abs(s.rect.width - s.rect.height), 1e-9, 'near-squares snap to squares')
  })

  it('rough squares are rectangles from any starting point', () => {
    const cases = [
      [P(0, 0), P(100, 8), P(94, 100), P(10, 91)],
      [P(0, 8), P(94, 0), P(100, 95), P(7, 100)]
    ]
    for (const vertices of cases) {
      for (const wobble of [0.5, 4]) {
        const stroke = wobbly(vertices, 24, wobble)
        stroke.pop()
        for (const start of [0, 5, 12, 20, 30, 47, 60, 79]) {
          const rotated = rotateLeft(stroke, start)
          const closed = [...rotated, add(rotated[0], P(2, -1))]
          assert.equal(recognize(closed)?.type, 'rectangle', `wobble ${wobble}, start ${start}`)
        }
      }
    }
  })

  it('recognises an ellipse, a circle, a triangle, a hexagon and a line', () => {
    const e = recognize(circle(P(100, 100), 80, 40, 72))
    assert.equal(e?.type, 'ellipse')
    assert.ok(e.rect.width > 150)
    assert.isBelow(e.rect.height, 100)
    const c = recognize(circle(P(100, 100), 50, 48, 72))
    assert.equal(c?.type, 'ellipse')
    assert.isBelow(Math.abs(c.rect.width - c.rect.height), 1e-9)
    const tri = recognize(wobbly([P(100, 0), P(200, 170), P(0, 170)], 25, 1.5))
    assert.equal(tri?.type, 'polygon')
    assert.equal(tri.sides, 3)
    assert.isBelow(Math.abs(tri.rotation), 5)
    const hex = recognize(wobbly(regular(6, 80, 100, 100), 15, 0.5))
    assert.equal(hex?.type, 'polygon')
    assert.equal(hex.sides, 6)
    const line = Array.from({ length: 30 }, (_, i) => P(i * 10, i * 3 + Math.sin(i)))
    assert.equal(recognize(line)?.type, 'line')
  })

  it('circles and real polygons keep their identity across stroke seams', () => {
    for (const [rx, ry] of [[50, 50], [80, 40], [50, 40]]) {
      const stroke = circle(P(100, 100), rx, ry, 192)
      stroke.pop()
      for (const seam of [0, 13, 37, 62, 109]) {
        const rotated = rotateLeft(stroke, seam)
        assert.equal(recognize([...rotated, rotated[0]])?.type, 'ellipse', `ellipse ${rx}/${ry}, seam ${seam}`)
      }
    }
    for (const sides of [3, 5, 6, 8]) {
      const stroke = wobbly(regular(sides, 80, 100, 100), 24, 1)
      stroke.pop()
      for (const seam of [0, 9, 17, 29, 45]) {
        const rotated = rotateLeft(stroke, seam)
        const r = recognize([...rotated, rotated[0]])
        assert.equal(r?.type, 'polygon', `${sides} sides, seam ${seam}`)
        assert.equal(r.sides, sides, `${sides} sides, seam ${seam}`)
      }
    }
  })

  it('rough triangles snap upright or upside down', () => {
    for (const direction of [0, 180]) {
      for (const tilt of [-12, -3, 4, 11]) {
        const corners = regular(3, 80, 200, 300, direction + tilt - 90)
        for (const reversed of [false, true]) {
          const stroke = wobbly(corners, 24, 1.5)
          stroke.pop()
          if (reversed) stroke.reverse()
          for (const seam of [0, 9, 28, 51]) {
            const rotated = rotateLeft(stroke, seam)
            const r = recognize([...rotated, rotated[0]])
            assert.equal(r?.type, 'polygon', `direction ${direction}, tilt ${tilt}, seam ${seam}`)
            assert.equal(r.sides, 3)
            assert.equal(r.rotation, direction, `tilt ${tilt}, seam ${seam}, reversed ${reversed}`)
          }
        }
      }
    }
  })

  it('recognized lines keep their free angle', () => {
    for (const [dx, dy] of [[120, 7], [-130, -9], [8, 90], [-6, -140], [60, 50], [-50, -60]]) {
      const first = P(200, 300)
      const last = P(200 + dx, 300 + dy)
      const stroke = Array.from({ length: 31 }, (_, i) => lerp(first, last, i / 30))
      const r = recognize(stroke)
      assert.equal(r?.type, 'line')
      assert.deepEqual(r.a, first)
      assert.deepEqual(r.b, last)
    }
  })

  it('tilted rectangles, ellipses and hexagons snap to their angle steps', () => {
    for (const direction of [0, 45, 90, 135]) {
      for (const tilt of [-7, 7]) {
        const xf = xform(200, 300, direction + tilt)
        const corners = [P(-90, -40), P(90, -40), P(90, 40), P(-90, 40)].map(xf)
        const r = recognize(wobbly(corners, 24, 1))
        assert.equal(r?.type, 'rectangle', `rectangle ${direction}`)
        assert.equal(r.rotation % 45, 0)
        assert.isBelow(Math.hypot(r.rect.cx - 200, r.rect.cy - 300), 4)
        assert.isBelow(Math.abs(Math.max(r.rect.width, r.rect.height) - 180), 15)
        const e = recognize(circle(P(0, 0), 90, 40, 192).map(xf))
        assert.equal(e?.type, 'ellipse', `ellipse ${direction}`)
        assert.equal(e.rotation, direction)
        assert.isBelow(Math.abs(e.rect.width - 180), 4)
        assert.isBelow(Math.abs(e.rect.height - 80), 4)
      }
    }
    for (const direction of [0, 90]) {
      for (const tilt of [-7, 7]) {
        const r = recognize(wobbly(regular(6, 70, 200, 300, direction + tilt - 90), 24, 0.5))
        assert.equal(r?.type, 'polygon', 'hexagon')
        assert.equal(r.sides, 6)
        assert.equal(r.rotation, direction)
      }
    }
    // Even sideways input can only produce an upright or inverted triangle.
    for (const direction of [83, 97, 263, 277]) {
      const r = recognize(wobbly(regular(3, 70, 200, 300, direction - 90), 24, 0.5))
      assert.equal(r?.type, 'polygon')
      assert.equal(r.sides, 3)
      assert.ok([0, 180].includes(r.rotation))
    }
  })

  it('hexagon rotation never depends on rounding between equivalent angles', () => {
    // 0° and 180° (and 90° and 270°) are the same hexagon, so only 0° and 90° may come back.
    for (const direction of [0, 90]) {
      for (const tilt of [-9, -7, -3, 3, 7, 9]) {
        for (const offset of [0, 1e-7, 0.1, 1e3, 1e6]) {
          const corners = regular(6, 70, offset, offset, direction + tilt - 90)
          assert.equal(polygonRotation(corners, 90), direction, `tilt ${tilt}, offset ${offset}`)
          assert.equal(polygonRotation(rotateLeft(corners, 3), 90), direction, `tilt ${tilt}, offset ${offset}, from the opposite corner`)
        }
      }
    }
    // Triangles have no such twin among the candidates: 0° and 180° stay distinct.
    const down = [0, 1, 2].map((i) => P(50 * Math.cos(rad(90 + 120 * i)), 50 * Math.sin(rad(90 + 120 * i))))
    assert.equal(polygonRotation(down, 180), 180)
  })

  it('square fit ignores sampling density and document offset', () => {
    const stroke = wobbly([P(0, 0), P(100, 8), P(94, 100), P(10, 91)], 24, 4)
    for (const scale of [0.25, 1, 20]) {
      const shifted = stroke.map((p) => P(1e9 + p.x * scale, -1e9 + p.y * scale))
      assert.equal(recognize(shifted)?.type, 'rectangle', `scale ${scale}`)
    }
    const dense = stroke.flatMap((p, i) => Array(i < 24 ? 100 : 1).fill(p))
    assert.deepEqual(recognize(stroke), recognize(dense))
    const padded = [...stroke, ...Array(10000).fill(stroke[stroke.length - 1])]
    assert.equal(recognize(padded)?.type, 'rectangle')
  })

  it('non-finite and overflowing strokes are not shapes', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      assert.equal(recognize([P(0, 0), P(bad, 100)]), null)
    }
    assert.equal(recognize([P(-Number.MAX_VALUE, 0), P(Number.MAX_VALUE, 100)]), null)
  })

  it('scribble and noise', () => {
    const z = Array.from({ length: 40 }, (_, i) => P(100 + (i % 2) * 60, 100 + i * 2))
    assert.equal(recognize(z)?.type, 'scribble')
    assert.equal(recognize([P(0, 0)]), null)
    assert.equal(recognize([]), null)
    // An open curl is not a shape.
    const curl = Array.from({ length: 60 }, (_, i) => P(100 + 50 * Math.cos(i * 0.08), 100 + 50 * Math.sin(i * 0.08)))
    assert.equal(recognize(curl), null)
  })

  it('a scribble reports the box it covers', () => {
    const z = Array.from({ length: 40 }, (_, i) => P(100 + (i % 2) * 60, 100 + i * 2))
    assert.deepEqual(recognize(z).rect, { x: 100, y: 100, width: 60, height: 78 })
  })
})

describe('helpers', () => {
  it('simplify keeps the ends and the far corner, and survives a long noisy stroke', () => {
    assert.deepEqual(simplify([P(0, 0), P(5, 5.1), P(10, 10), P(15, 5.1), P(20, 0)], 1), [P(0, 0), P(10, 10), P(20, 0)])
    const noisy = Array.from({ length: 3000 }, (_, i) => P(i, (i % 2) * 5))
    assert.ok(simplify(noisy, 1).length > 2)
  })

  it('resample returns at most 256 evenly spaced points that keep both ends', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => P(i, 0))
    const out = resample(pts, 999)
    assert.ok(out.length <= 256)
    assert.deepEqual(out[0], pts[0])
    assert.deepEqual(out[out.length - 1], pts[999])
    assert.closeTo(out[1].x - out[0].x, 999 / 255, 1e-9)
  })

  it('closedCorners finds the four corners of a square whatever the start', () => {
    const sq = wobbly([P(0, 0), P(100, 0), P(100, 100), P(0, 100)], 20, 0)
    for (const start of [0, 7, 33, 61]) {
      assert.equal(closedCorners(rotateLeft(sq, start), 12).length, 4)
    }
  })
})
