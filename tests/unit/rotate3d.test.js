import {
  ROTATE3D_DEFAULTS, ROTATE3D_PRESETS, rotate3, eyeDistance, rotate3dMap, rotate3dSubpaths, registerRotate3dEffect
} from '../../packages/svgcanvas/core/rotate3d.ts'
import { FRAME_KEYS, NO_FRAME, paramsFromFrame } from '../../packages/svgcanvas/core/distort.ts'
import { getLiveEffectDef, serializeFxStack } from '../../packages/svgcanvas/core/live-effects.ts'
import { parseAnchors, anchorBBox } from '../../packages/svgcanvas/core/anchor-path.ts'

registerRotate3dEffect()

const close = (a, b, eps = 1e-9) => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`)
const closePt = (p, q, eps = 1e-9) => {
  close(p.x, q.x, eps)
  close(p.y, q.y, eps)
}
const P = (over) => ({ ...ROTATE3D_DEFAULTS, ...over })

describe('rotate3d', function () {
  it('registers with hidden frame params and no frame at its defaults', function () {
    const def = getLiveEffectDef('rotate3d')
    assert.deepEqual(def.hidden, FRAME_KEYS)
    assert.equal(serializeFxStack([{ name: 'rotate3d', params: { rotationY: 30 } }]), 'rotate3d(rotationX=0,rotationY=30,rotationZ=0,perspective=0)')
    assert.deepEqual(def.defaults, { ...ROTATE3D_DEFAULTS, ...NO_FRAME })
  })

  it('rotates on X, then Y, then Z', function () {
    const v = rotate3(P({ rotationZ: 90 }), [1, 0, 0])
    close(v[0], 0)
    close(v[1], 1)
    const w = rotate3(P({ rotationY: 90 }), [1, 0, 0]) // the right side turns away from the viewer
    close(w[0], 0)
    close(w[2], -1)
    const t = rotate3(P({ rotationX: -90 }), [0, -1, 0]) // the top comes forward
    close(t[2], 1)
  })

  it('no perspective is no eye; a wider angle brings the eye closer', function () {
    assert.strictEqual(eyeDistance(0, 50), null)
    assert.ok(eyeDistance(80, 50) < eyeDistance(20, 50))
    close(eyeDistance(400, 50), eyeDistance(160, 50)) // clamped
  })

  it('the identity leaves the box where it was', function () {
    const map = rotate3dMap(P({}), 100, 50)
    for (const q of [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 30, y: 10 }]) closePt(map(q), q)
  })

  it('without perspective a turn on Y narrows the box symmetrically about its centre', function () {
    const map = rotate3dMap(P({ rotationY: 60 }), 100, 50)
    closePt(map({ x: 0, y: 0 }), { x: 25, y: 0 })
    closePt(map({ x: 100, y: 50 }), { x: 75, y: 50 })
  })

  it('with perspective the near side is taller than the far side, and straight lines stay straight', function () {
    const map = rotate3dMap(P({ rotationY: 40, perspective: 60 }), 100, 100)
    // positive Y: the right side goes away, so it is shorter
    const left = map({ x: 0, y: 100 }).y - map({ x: 0, y: 0 }).y
    const right = map({ x: 100, y: 100 }).y - map({ x: 100, y: 0 }).y
    assert.ok(left > right)
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => map({ x: 100 * t, y: 30 + 40 * t }))
    const [a, , , , z] = pts
    for (const p of pts) close((z.x - a.x) * (p.y - a.y) - (z.y - a.y) * (p.x - a.x), 0, 1e-6)
  })

  it('a half turn on Y mirrors the shape', function () {
    const map = rotate3dMap(P({ rotationY: 180 }), 100, 50)
    closePt(map({ x: 0, y: 0 }), { x: 100, y: 0 }, 1e-9)
  })

  it('maps geometry through the source box, or a shared frame', function () {
    const sps = parseAnchors('M10,20 L110,20 L110,70 L10,70 Z')
    const out = rotate3dSubpaths(sps, anchorBBox(sps), P({ rotationY: 60 }))
    const b = anchorBBox(out)
    close(b.x, 35, 1e-6)
    close(b.width, 50, 1e-6)
    // The same rect as the left half of a 200-wide frame: it turns about the frame's centre, so it moves right.
    const framed = { ...P({ rotationY: 60 }), ...paramsFromFrame({ m: { a: 1, b: 0, c: 0, d: 1, e: -10, f: -20 }, w: 200, h: 50 }) }
    const c = anchorBBox(rotate3dSubpaths(sps, anchorBBox(sps), framed))
    close(c.x, 10 + 50, 1e-6) // x = 100 + (0 - 100) * cos 60
    close(c.width, 50, 1e-6)
  })

  it('the presets are named and in range', function () {
    assert.equal(new Set(ROTATE3D_PRESETS.map(([id]) => id)).size, ROTATE3D_PRESETS.length)
    for (const [, angles] of ROTATE3D_PRESETS) for (const a of angles) assert.ok(a >= -180 && a <= 180)
  })
})
