import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { collectLeaves, getAncestorMatrix, getStyleSourceElem } from '../../packages/svgcanvas/core/boolean-ops.js'

describe('boolean-ops', function () {
  const svg = document.createElementNS(NS.SVG, 'svg')

  before(() => {
    document.body.appendChild(svg)
  })

  after(() => {
    document.body.removeChild(svg)
  })

  const makeRect = id => {
    const rect = document.createElementNS(NS.SVG, 'rect')
    rect.setAttribute('id', id)
    return rect
  }

  describe('collectLeaves()', function () {
    it('returns the element itself when it is not a group', function () {
      const rect = makeRect('r1')
      assert.deepEqual(collectLeaves(rect), [rect])
    })

    it('collects direct children of a flat group', function () {
      const g = document.createElementNS(NS.SVG, 'g')
      const r1 = makeRect('r1')
      const r2 = makeRect('r2')
      g.append(r1, r2)
      assert.deepEqual(collectLeaves(g), [r1, r2])
    })

    it('recurses into nested groups and <a> wrappers', function () {
      const outer = document.createElementNS(NS.SVG, 'g')
      const inner = document.createElementNS(NS.SVG, 'g')
      const anchor = document.createElementNS(NS.SVG, 'a')
      const r1 = makeRect('r1')
      const r2 = makeRect('r2')
      inner.append(r1)
      anchor.append(r2)
      outer.append(inner, anchor)
      assert.deepEqual(collectLeaves(outer), [r1, r2])
    })

    it('skips <title> and unsupported (text/image) children', function () {
      const g = document.createElementNS(NS.SVG, 'g')
      const title = document.createElementNS(NS.SVG, 'title')
      const text = document.createElementNS(NS.SVG, 'text')
      const image = document.createElementNS(NS.SVG, 'image')
      const r1 = makeRect('r1')
      g.append(title, text, image, r1)
      assert.deepEqual(collectLeaves(g), [r1])
    })

    it('returns an empty array for a group with only unsupported children', function () {
      const g = document.createElementNS(NS.SVG, 'g')
      g.append(document.createElementNS(NS.SVG, 'text'))
      assert.deepEqual(collectLeaves(g), [])
    })
  })

  describe('getAncestorMatrix()', function () {
    it('returns the identity matrix when there are no transformed ancestors', function () {
      const g = document.createElementNS(NS.SVG, 'g')
      const r1 = makeRect('r1')
      g.append(r1)
      svg.append(g)
      const m = getAncestorMatrix(r1, g)
      assert.equal(m.a, 1)
      assert.equal(m.b, 0)
      assert.equal(m.c, 0)
      assert.equal(m.d, 1)
      assert.equal(m.e, 0)
      assert.equal(m.f, 0)
      svg.removeChild(g)
    })

    it('composes intermediate group transforms but excludes the stop element\'s own transform', function () {
      const outer = document.createElementNS(NS.SVG, 'g')
      const inner = document.createElementNS(NS.SVG, 'g')
      const r1 = makeRect('r1')
      svg.append(outer)
      outer.append(inner)
      inner.append(r1)

      // outer is the group passed to getElemAsPath as `stopElem` — its own
      // transform must NOT be included (it's applied separately afterward).
      outer.setAttribute('transform', 'translate(100 0)')
      // inner sits between the leaf and stopElem, so its transform must be included.
      inner.setAttribute('transform', 'translate(0 50)')

      const m = getAncestorMatrix(r1, outer)
      assert.equal(m.e, 0, 'outer translate(100 0) must be excluded')
      assert.equal(m.f, 50, 'inner translate(0 50) must be included')

      svg.removeChild(outer)
    })

    it('stops at the given element even when nested several levels deep', function () {
      const a = document.createElementNS(NS.SVG, 'g')
      const b = document.createElementNS(NS.SVG, 'g')
      const c = document.createElementNS(NS.SVG, 'g')
      const r1 = makeRect('r1')
      svg.append(a)
      a.append(b)
      b.append(c)
      c.append(r1)

      a.setAttribute('transform', 'translate(1 0)')
      b.setAttribute('transform', 'translate(0 2)')
      c.setAttribute('transform', 'translate(4 0)')

      // Stopping at b: only c's transform (between r1 and b) should apply.
      const m = getAncestorMatrix(r1, b)
      assert.equal(m.e, 4)
      assert.equal(m.f, 0)

      svg.removeChild(a)
    })
  })

  describe('getStyleSourceElem()', function () {
    it('returns the element itself when it is not a group', function () {
      const rect = makeRect('r1')
      assert.equal(getStyleSourceElem(rect), rect)
    })

    it('returns the bottom-most (first) leaf shape for a group', function () {
      const g = document.createElementNS(NS.SVG, 'g')
      const r1 = makeRect('r1')
      const r2 = makeRect('r2')
      g.append(r1, r2)
      assert.equal(getStyleSourceElem(g), r1)
    })

    it('falls back to the group itself when it has no leaf shapes', function () {
      const g = document.createElementNS(NS.SVG, 'g')
      g.append(document.createElementNS(NS.SVG, 'text'))
      assert.equal(getStyleSourceElem(g), g)
    })
  })
})
