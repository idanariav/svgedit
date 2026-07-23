import { deformPoint, deformPoints } from '../../src/editor/extensions/ext-puppet-warp/mls.js'

/**
 * Build a pin set whose deformed positions `q` are a single global
 * rigid transform (rotation `theta` about origin + translation `t`) of the
 * rest positions `p`. MLS *rigid* deformation must reproduce such a transform
 * exactly at every point — this is the defining correctness property.
 */
const rigidPins = (rests, theta, tx, ty) => {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return rests.map(([px, py]) => ({
    px,
    py,
    qx: c * px - s * py + tx,
    qy: s * px + c * py + ty
  }))
}

describe('ext-puppet-warp MLS rigid deformation', function () {
  it('0 pins ⇒ point unchanged', function () {
    const v = { x: 42, y: -7 }
    const out = deformPoint(v, [])
    assert.closeTo(out.x, 42, 1e-9)
    assert.closeTo(out.y, -7, 1e-9)
  })

  it('1 pin ⇒ pure translation by the pin delta', function () {
    const pins = [{ px: 10, py: 20, qx: 13, qy: 24 }] // delta (+3, +4)
    const pts = [{ x: 0, y: 0 }, { x: 100, y: -50 }, { x: 10, y: 20 }]
    const out = deformPoints(pts, pins)
    out.forEach((o, i) => {
      assert.closeTo(o.x, pts[i].x + 3, 1e-9, `x[${i}]`)
      assert.closeTo(o.y, pts[i].y + 4, 1e-9, `y[${i}]`)
    })
  })

  it('identity pins (q == p) ⇒ every point unchanged', function () {
    const rests = [[0, 0], [100, 0], [50, 80]]
    const pins = rests.map(([px, py]) => ({ px, py, qx: px, qy: py }))
    const probes = [{ x: 25, y: 25 }, { x: -40, y: 60 }, { x: 200, y: -30 }]
    probes.forEach((v) => {
      const o = deformPoint(v, pins)
      assert.closeTo(o.x, v.x, 1e-6, 'x')
      assert.closeTo(o.y, v.y, 1e-6, 'y')
    })
  })

  it("a pin's own rest position maps exactly to its current position", function () {
    const pins = [
      { px: 0, py: 0, qx: 0, qy: 0 },
      { px: 100, py: 0, qx: 90, qy: 40 },
      { px: 50, py: 80, qx: 70, qy: 120 }
    ]
    pins.forEach((pin) => {
      const o = deformPoint({ x: pin.px, y: pin.py }, pins)
      assert.closeTo(o.x, pin.qx, 1e-6, 'qx')
      assert.closeTo(o.y, pin.qy, 1e-6, 'qy')
    })
  })

  it('reproduces a global rigid transform (rotation + translation) at every point', function () {
    const rests = [[0, 0], [120, 0], [40, 90], [-30, 50]]
    const theta = Math.PI / 5 // 36°
    const tx = 15
    const ty = -22
    const pins = rigidPins(rests, theta, tx, ty)

    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const probes = [
      { x: 25, y: 25 }, { x: 60, y: -10 }, { x: -50, y: 70 }, { x: 200, y: 5 }
    ]
    probes.forEach((v) => {
      const o = deformPoint(v, pins)
      const ex = c * v.x - s * v.y + tx
      const ey = s * v.x + c * v.y + ty
      assert.closeTo(o.x, ex, 1e-6, 'rotated x')
      assert.closeTo(o.y, ey, 1e-6, 'rotated y')
    })
  })

  it('is length-preserving locally: |v - p*| is preserved into |out - q*| for a rotation', function () {
    // A pure rotation about the origin keeps every point's distance to the
    // (fixed) centroid; verify the transform does not scale.
    const rests = [[0, 0], [100, 0], [0, 100]]
    const pins = rigidPins(rests, Math.PI / 3, 0, 0)
    const v = { x: 40, y: 10 }
    const o = deformPoint(v, pins)
    const inLen = Math.hypot(v.x, v.y)
    const outLen = Math.hypot(o.x, o.y)
    assert.closeTo(outLen, inLen, 1e-6, 'distance to rotation centre preserved')
  })

  it('a fixed pin keeps its immediate neighbourhood nearly stationary while a far drag moves a lot', function () {
    // p0 fixed at origin; p1 dragged far. Points near p0 barely move; points
    // near p1 follow it.
    const pins = [
      { px: 0, py: 0, qx: 0, qy: 0 },
      { px: 200, py: 0, qx: 200, qy: 150 }
    ]
    const near0 = deformPoint({ x: 2, y: 0 }, pins)
    const near1 = deformPoint({ x: 198, y: 0 }, pins)
    assert.ok(Math.hypot(near0.x - 2, near0.y - 0) < 5, 'near fixed pin stays put')
    assert.ok(Math.hypot(near1.x - 198, near1.y - 0) > 100, 'near dragged pin follows')
  })
})
