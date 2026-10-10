import '../../packages/svgcanvas/core/path-seg-shim.js'
import { joinEnds, reversedSubpath } from '../../packages/svgcanvas/core/path-edit.js'
import { parseAnchors, anchorsToD } from '../../packages/svgcanvas/core/anchor-path.js'
import { findPenEnd, continuationD, drawnSubpath, joinDrawn, extendWith } from '../../packages/svgcanvas/core/pen-continue.js'

const sub = (d) => parseAnchors(d)[0]
const NS = 'http://www.w3.org/2000/svg'

describe('joinEnds', () => {
  it('joins the chosen ends with a straight segment, reversing whichever needs it', () => {
    const a = sub('M0,0 L10,0')
    const b = sub('M30,0 L20,0')
    assert.equal(anchorsToD([joinEnds(a, true, b, true)]), 'M0,0 L10,0 L20,0 L30,0')
    assert.equal(anchorsToD([joinEnds(a, false, b, true)]), 'M10,0 L0,0 L20,0 L30,0')
  })

  it('merges ends within the tolerance into one anchor', () => {
    const out = joinEnds(sub('M0,0 L10,0'), true, sub('M10.2,0 L20,0'), false, 0.5)
    assert.equal(out.anchors.length, 3)
  })

  it('leaves the inputs alone and accepts a lone anchor', () => {
    const a = sub('M0,0 L10,0')
    const lone = { closed: false, anchors: [{ p: { x: 20, y: 5 }, hIn: { x: 20, y: 5 }, hOut: { x: 20, y: 5 } }] }
    const out = joinEnds(a, true, lone, false)
    assert.equal(anchorsToD([out]), 'M0,0 L10,0 L20,5')
    assert.equal(a.anchors.length, 2)
    assert.equal(lone.anchors.length, 1)
  })

  it('keeps curve handles when a path is reversed', () => {
    const c = sub('M0,0 C0,10 10,10 10,0')
    const back = reversedSubpath(c)
    assert.equal(anchorsToD([back]), 'M10,0 C10,10 0,10 0,0')
    assert.equal(anchorsToD([c]), 'M0,0 C0,10 10,10 10,0')
  })
})

describe('Pen continue and join', () => {
  let layer
  const add = (d, attrs = {}) => {
    const el = document.createElementNS(NS, 'path')
    el.setAttribute('d', d)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    layer.append(el)
    return el
  }

  beforeEach(() => {
    layer = document.createElementNS(NS, 'g')
    document.body.append(layer)
  })
  afterEach(() => layer.remove())

  describe('findPenEnd', () => {
    it('finds the first or last anchor of an open path within reach', () => {
      const p = add('M0,0 L50,0 L50,40')
      const last = findPenEnd(layer, 52, 43, 6)
      assert.equal(last.elem, p)
      assert.equal(last.atEnd, true)
      assert.deepEqual(last.point, { x: 50, y: 40 })
      const first = findPenEnd(layer, -2, 1, 6)
      assert.equal(first.atEnd, false)
      assert.equal(findPenEnd(layer, 25, 0, 6), null) // mid-path is not an end
    })

    it('picks the nearer of two ends and honours the exclusion list', () => {
      const a = add('M0,0 L10,0')
      const b = add('M12,0 L30,0')
      assert.equal(findPenEnd(layer, 11.5, 0, 6).elem, b)
      assert.equal(findPenEnd(layer, 11.5, 0, 6, [b]).elem, a)
    })

    it('skips closed paths, multi-subpath paths and live-geometry paths', () => {
      add('M0,0 L10,0 L10,10 Z')
      add('M100,0 L110,0 M100,50 L110,50')
      add('M200,0 L210,0', { 'se:taper-d': 'x' })
      add('M300,0 L310,0', { 'se:orig-d': 'x' })
      add('M400,0 L410,0', { 'se:fx-d': 'x' })
      for (const x of [0, 10, 100, 110, 200, 210, 300, 310, 400, 410]) {
        assert.equal(findPenEnd(layer, x, 0, 6), null, `x=${x}`)
      }
    })

    it('tracks a path whose data changed', () => {
      const p = add('M0,0 L10,0')
      assert.ok(findPenEnd(layer, 10, 0, 3))
      p.setAttribute('d', 'M0,0 L40,0')
      assert.equal(findPenEnd(layer, 10, 0, 3), null)
      assert.ok(findPenEnd(layer, 40, 0, 3))
    })
  })

  describe('continuationD', () => {
    it('keeps a path as it is when its last anchor was pressed', () => {
      add('M0,0 L10,0 L10,10')
      const end = findPenEnd(layer, 10, 10, 3)
      assert.equal(continuationD(end), 'M0,0 L10,0 L10,10')
    })

    it('reverses a path when its first anchor was pressed, so the pressed end is last', () => {
      add('M0,0 L10,0 L10,10')
      const end = findPenEnd(layer, 0, 0, 3)
      assert.equal(continuationD(end), 'M10,10 L10,0 L0,0')
    })
  })

  describe('drawnSubpath', () => {
    it('reads a lone M (one click) as a single anchor', () => {
      const sp = drawnSubpath('M12,34 ')
      assert.equal(sp.anchors.length, 1)
      assert.deepEqual(sp.anchors[0].p, { x: 12, y: 34 })
      assert.equal(drawnSubpath(''), null)
    })
  })

  describe('joinDrawn', () => {
    const drawn = () => sub('M100,0 L50,0') // the drawing: started at x=100, last click at x=50
    const press = (d, atEnd) => {
      add(d)
      const pt = atEnd ? parseAnchors(d)[0].anchors.at(-1).p : parseAnchors(d)[0].anchors[0].p
      return findPenEnd(layer, pt.x, pt.y, 3)
    }

    it('a new drawing joined to a path start runs drawing -> path, the pressed path survives', () => {
      const end = press('M40,0 L0,0', false)
      const out = joinDrawn(drawn(), end, false)
      assert.equal(out.keepsDrawing, false)
      assert.equal(anchorsToD([out.subpath]), 'M100,0 L50,0 L40,0 L0,0')
    })

    it('a new drawing joined to a path end keeps the path direction and appends the drawing reversed', () => {
      const end = press('M0,0 L40,0', true)
      const out = joinDrawn(drawn(), end, false)
      assert.equal(out.keepsDrawing, false)
      assert.equal(anchorsToD([out.subpath]), 'M0,0 L40,0 L50,0 L100,0')
    })

    it('a carried-on path survives and absorbs the pressed one', () => {
      const end = press('M0,0 L40,0', true)
      const out = joinDrawn(drawn(), end, true)
      assert.equal(out.keepsDrawing, true)
      assert.equal(anchorsToD([out.subpath]), 'M100,0 L50,0 L40,0 L0,0')
    })

    it('joins a lone click to a path end', () => {
      const end = press('M0,0 L40,0', true)
      const out = joinDrawn(drawnSubpath('M60,10'), end, false)
      assert.equal(anchorsToD([out.subpath]), 'M0,0 L40,0 L60,10')
    })
  })

  describe('extendWith (pencil continues the selected path)', () => {
    const endOf = (d, x, y) => {
      add(d)
      return findPenEnd(layer, x, y, 3)
    }

    it('appends a stroke that starts on the last anchor, merging the seam', () => {
      const out = extendWith(endOf('M0,0 L50,0', 50, 0), sub('M50,0 L80,20 L100,20'), 6)
      assert.equal(out.closed, false)
      assert.equal(anchorsToD([out]), 'M0,0 L50,0 L80,20 L100,20')
    })

    it('continuing from the first anchor keeps the path running the way it did', () => {
      const out = extendWith(endOf('M0,0 L50,0', 0, 0), sub('M0,0 L-30,20'), 6)
      assert.equal(anchorsToD([out]), 'M-30,20 L0,0 L50,0')
    })

    it('closes the path when the stroke ends near its other end', () => {
      const out = extendWith(endOf('M0,0 L50,0 L50,50', 50, 50), sub('M50,50 L0,50 L2,1'), 6)
      assert.equal(out.closed, true)
      assert.equal(out.anchors.length, 4)
      assert.match(anchorsToD([out]), /Z$/)
    })

    it('stays open when the stroke ends farther than the closing tolerance', () => {
      const out = extendWith(endOf('M0,0 L50,0 L50,50', 50, 50), sub('M50,50 L0,50 L2,20'), 6)
      assert.equal(out.closed, false)
      assert.equal(out.anchors.length, 5)
    })

    it('keeps curve handles of the old path', () => {
      const out = extendWith(endOf('M0,0 C0,20 30,20 30,0', 30, 0), sub('M30,0 L60,0'), 6)
      assert.equal(anchorsToD([out]), 'M0,0 C0,20 30,20 30,0 L60,0')
    })
  })
})
