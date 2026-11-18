import { wrapDeg, dragAngles, presetOf, DEG_PER_PX, SNAP_DEG } from '../../src/editor/extensions/ext-rotate3d-tool/ext-rotate3d-tool.ts'
import { ROTATE3D_DEFAULTS } from '../../packages/svgcanvas/core/rotate3d.ts'

describe('ext-rotate3d-tool', function () {
  it('wraps angles into (-180, 180]', function () {
    assert.equal(wrapDeg(190), -170)
    assert.equal(wrapDeg(-180), 180)
    assert.equal(wrapDeg(540), 180)
    assert.equal(wrapDeg(45), 45)
  })

  it('a horizontal drag turns on Y, a vertical one tilts on X', function () {
    const p = dragAngles(ROTATE3D_DEFAULTS, 20, 10)
    assert.equal(p.rotationY, 20 * DEG_PER_PX)
    assert.equal(p.rotationX, -10 * DEG_PER_PX)
    assert.equal(p.rotationZ, 0)
  })

  it('spin turns on Z only; snap rounds to the step', function () {
    const p = dragAngles({ ...ROTATE3D_DEFAULTS, rotationX: 5 }, 50, 30, { spin: true })
    assert.deepEqual([p.rotationX, p.rotationY, p.rotationZ], [5, 0, 50 * DEG_PER_PX])
    const s = dragAngles(ROTATE3D_DEFAULTS, 37, 0, { snap: true })
    assert.equal(s.rotationY % SNAP_DEG, 0)
    assert.equal(s.rotationY, 15)
  })

  it('names the preset the angles are, else custom', function () {
    assert.equal(presetOf(ROTATE3D_DEFAULTS), 'front')
    assert.equal(presetOf({ ...ROTATE3D_DEFAULTS, rotationY: -180 }), 'back')
    assert.equal(presetOf({ ...ROTATE3D_DEFAULTS, rotationX: -45, rotationY: -35.26, rotationZ: 30 }), 'isometricLeft')
    assert.equal(presetOf({ ...ROTATE3D_DEFAULTS, rotationY: 12 }), 'custom')
  })
})
