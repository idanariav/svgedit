import { registerGeometryRemap, runGeometryRemaps } from '../../packages/svgcanvas/core/geometry-remap-registry.js'

describe('geometry-remap-registry', function () {
  /**
   * Build a minimal stand-in for an SVG element with just the
   * attribute methods `runGeometryRemaps` relies on.
   * @param {Object.<string, string>} attrs
   * @returns {Object} fake element
   */
  const fakeElem = (attrs) => ({
    hasAttribute (name) { return name in attrs }
  })

  it('runs a registered hook only when its attribute is present', function () {
    let calls = 0
    registerGeometryRemap('se:test-a', () => { calls++ })

    runGeometryRemaps(fakeElem({ 'se:test-a': '1' }), () => {}, () => {}, () => {}, {})
    assert.equal(calls, 1)

    runGeometryRemaps(fakeElem({}), () => {}, () => {}, () => {}, {})
    assert.equal(calls, 1)
  })

  it('runs every registered hook whose attribute matches, passing through the same args', function () {
    const seenA = []
    const seenB = []
    registerGeometryRemap('se:test-b', (elem, remap, scalew, scaleh, svgCanvas) => {
      seenB.push({ elem, remap, scalew, scaleh, svgCanvas })
    })
    registerGeometryRemap('se:test-c', (elem, remap, scalew, scaleh, svgCanvas) => {
      seenA.push({ elem, remap, scalew, scaleh, svgCanvas })
    })

    const remap = () => {}
    const scalew = () => {}
    const scaleh = () => {}
    const svgCanvas = {}
    runGeometryRemaps(fakeElem({ 'se:test-b': '1', 'se:test-c': '1' }), remap, scalew, scaleh, svgCanvas)

    assert.equal(seenB.length, 1)
    assert.equal(seenA.length, 1)
    assert.equal(seenB[0].remap, remap)
    assert.equal(seenB[0].svgCanvas, svgCanvas)
  })

  it('re-registering the same attribute replaces the previous hook', function () {
    let firstCalled = false
    let secondCalled = false
    registerGeometryRemap('se:test-d', () => { firstCalled = true })
    registerGeometryRemap('se:test-d', () => { secondCalled = true })

    runGeometryRemaps(fakeElem({ 'se:test-d': '1' }), () => {}, () => {}, () => {}, {})

    assert.equal(firstCalled, false)
    assert.equal(secondCalled, true)
  })
})
