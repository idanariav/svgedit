import {
  IDENTITY, multiply, invert, applyMatrix, parseTransform, readGradient, gradientOf, ensureOwnGradient,
  ownStops, readStops, setLinear, setRadial, addStop, copyStop, placeStop, removeStop, setStopColor, colorAt,
  gradientToLocal
} from '../../packages/svgcanvas/core/gradient-edit.js'

const NS = 'http://www.w3.org/2000/svg'

const close = (a, b, eps = 1e-6) => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`)
const closePt = (p, q, eps = 1e-6) => {
  close(p.x, q.x, eps)
  close(p.y, q.y, eps)
}

/** A drawing: <svg><defs>{defs}</defs>{body}</svg>. */
const drawing = (defs, body) => {
  const host = document.createElement('div')
  host.innerHTML = `<svg xmlns="${NS}"><defs>${defs}</defs>${body}</svg>`
  return host.firstElementChild
}

const LINEAR = '<linearGradient id="g1"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>'
const BOX = { x: 10, y: 20, width: 100, height: 50 }

describe('gradient-edit', function () {
  describe('matrices', function () {
    it('invert undoes multiply', function () {
      const m = multiply({ a: 2, b: 0.5, c: -1, d: 3, e: 4, f: 5 }, { a: 1, b: 0, c: 0, d: 1, e: 7, f: -2 })
      closePt(applyMatrix(invert(m), applyMatrix(m, { x: 3, y: 4 })), { x: 3, y: 4 })
    })

    it('a singular matrix has no inverse', function () {
      assert.equal(invert({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 }), null)
    })

    it('parseTransform reads a list, applying the first operation last', function () {
      const m = parseTransform('translate(10 20) scale(2)')
      closePt(applyMatrix(m, { x: 1, y: 1 }), { x: 12, y: 22 })
      closePt(applyMatrix(parseTransform('rotate(90 10 10)'), { x: 20, y: 10 }), { x: 10, y: 20 })
      assert.deepEqual(parseTransform(null), IDENTITY)
    })
  })

  describe('readGradient', function () {
    it('objectBoundingBox maps the unit square onto the element box', function () {
      const svg = drawing(LINEAR, '')
      const m = readGradient(svg, svg.querySelector('#g1'), BOX)
      closePt(applyMatrix(m.toLocal, m.p1), { x: 10, y: 20 })
      closePt(applyMatrix(m.toLocal, m.p2), { x: 110, y: 20 })
      assert.equal(m.stops.length, 2)
    })

    it('userSpaceOnUse takes the numbers as they are and ignores the box', function () {
      const svg = drawing('<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="5" y1="6" x2="50" y2="60"><stop offset="0"/><stop offset="1"/></linearGradient>', '')
      const m = readGradient(svg, svg.querySelector('#g'), null)
      closePt(applyMatrix(m.toLocal, m.p2), { x: 50, y: 60 })
    })

    it('gradientTransform sits between the units and the box', function () {
      const svg = drawing('<linearGradient id="g" gradientTransform="rotate(90)"><stop offset="0"/><stop offset="1"/></linearGradient>', '')
      const m = readGradient(svg, svg.querySelector('#g'), BOX)
      // (1, 0) rotates to (0, 1), then the box scales it to (0 * w + x, 1 * h + y)
      closePt(applyMatrix(m.toLocal, m.p2), { x: 10, y: 70 })
    })

    it('radial defaults and focal point', function () {
      const svg = drawing('<radialGradient id="r" fx="0.25"><stop offset="0"/><stop offset="1"/></radialGradient>', '')
      const m = readGradient(svg, svg.querySelector('#r'), BOX)
      assert.deepEqual([m.p1, m.r, m.focal], [{ x: 0.5, y: 0.5 }, 0.5, { x: 0.25, y: 0.5 }])
    })

    it('inherits stops, units and geometry through href', function () {
      const svg = drawing(`${LINEAR}<linearGradient id="g2" href="#g1" x2="0.5"/>`, '')
      const m = readGradient(svg, svg.querySelector('#g2'), BOX)
      assert.equal(m.stops.length, 2)
      assert.equal(m.p2.x, 0.5)
    })

    it('does not inherit geometry from a gradient of the other kind', function () {
      const svg = drawing('<radialGradient id="r" cx="0.9" r="0.1"><stop offset="0"/><stop offset="1"/></radialGradient><linearGradient id="l" href="#r"/>', '')
      const m = readGradient(svg, svg.querySelector('#l'), BOX)
      assert.equal(m.p1.x, 0)
      assert.equal(m.stops.length, 2)
    })

    it('refuses what it cannot edit', function () {
      const svg = drawing(`${LINEAR}<linearGradient id="p" gradientUnits="userSpaceOnUse" x2="100%"><stop offset="0"/></linearGradient>`, '')
      assert.equal(readGradient(svg, svg.querySelector('#g1'), { x: 0, y: 0, width: 0, height: 10 }), null)
      assert.equal(readGradient(svg, svg.querySelector('#p'), BOX), null)
      assert.equal(gradientToLocal(true, null, IDENTITY), null)
    })

    it('survives a href loop', function () {
      const svg = drawing('<linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>', '')
      assert.doesNotThrow(() => readGradient(svg, svg.querySelector('#a'), BOX))
    })
  })

  describe('round trip through a rotated element', function () {
    it('a handle dragged to a document point writes the attributes that put it there', function () {
      const svg = drawing('<linearGradient id="g" gradientTransform="skewX(10)"><stop offset="0"/><stop offset="1"/></linearGradient>', '')
      const model = readGradient(svg, svg.querySelector('#g'), BOX)
      const elementToDoc = parseTransform('rotate(30 50 50) translate(5 7)')
      const T = multiply(elementToDoc, model.toLocal)
      const target = { x: 80, y: 33 }
      const p2 = applyMatrix(invert(T), target)
      setLinear(model.grad, model.p1, p2)
      const after = readGradient(svg, model.grad, BOX)
      closePt(applyMatrix(multiply(elementToDoc, after.toLocal), after.p2), target, 0.01)
      assert.equal(model.grad.getAttribute('gradientTransform'), 'skewX(10)')
    })

    it('radial writes centre, radius and focal', function () {
      const svg = drawing('<radialGradient id="r"><stop offset="0"/><stop offset="1"/></radialGradient>', '')
      const grad = svg.querySelector('#r')
      setRadial(grad, { x: 0.4, y: 0.6 }, 0.3, { x: 0.35, y: 0.6 })
      const m = readGradient(svg, grad, BOX)
      assert.deepEqual([m.p1, m.r, m.focal], [{ x: 0.4, y: 0.6 }, 0.3, { x: 0.35, y: 0.6 }])
    })
  })

  describe('clone-on-write', function () {
    const two = '<rect id="a" fill="url(#g1)" width="1" height="1"/><rect id="b" fill="url(#g1)" width="1" height="1"/>'

    it('an unshared gradient is edited in place', function () {
      const svg = drawing(LINEAR, '<rect id="a" fill="url(#g1)"/>')
      const a = svg.querySelector('#a')
      assert.equal(ensureOwnGradient(svg, a, 'fill', gradientOf(svg, a, 'fill'), () => 'new'), svg.querySelector('#g1'))
    })

    it('a gradient another element uses is copied and the element repointed', function () {
      const svg = drawing(LINEAR, two)
      const a = svg.querySelector('#a')
      const own = ensureOwnGradient(svg, a, 'fill', gradientOf(svg, a, 'fill'), () => 'g9')
      assert.equal(own.id, 'g9')
      assert.equal(a.getAttribute('fill'), 'url(#g9)')
      assert.equal(svg.querySelector('#b').getAttribute('fill'), 'url(#g1)')
      assert.equal(own.querySelectorAll('stop').length, 2)
      setLinear(own, { x: 0, y: 0 }, { x: 0, y: 1 })
      assert.equal(svg.querySelector('#g1').getAttribute('x2'), null)
    })

    it('fill and stroke of one element sharing a gradient count as shared', function () {
      const svg = drawing(LINEAR, '<rect id="a" fill="url(#g1)" stroke="url(#g1)"/>')
      const a = svg.querySelector('#a')
      ensureOwnGradient(svg, a, 'fill', gradientOf(svg, a, 'fill'), () => 'g9')
      assert.equal(a.getAttribute('fill'), 'url(#g9)')
      assert.equal(a.getAttribute('stroke'), 'url(#g1)')
    })

    it('a paint set in style is repointed in style', function () {
      const svg = drawing(LINEAR, '<rect id="a" style="fill:url(#g1);opacity:1"/><rect id="b" fill="url(#g1)"/>')
      const a = svg.querySelector('#a')
      ensureOwnGradient(svg, a, 'fill', gradientOf(svg, a, 'fill'), () => 'g9')
      assert.equal(a.getAttribute('style'), 'fill:url(#g9);opacity:1')
    })

    it('a gradient that another inherits from is shared', function () {
      const svg = drawing(`${LINEAR}<linearGradient id="g2" href="#g1"/>`, '<rect id="a" fill="url(#g1)"/>')
      const a = svg.querySelector('#a')
      assert.equal(ensureOwnGradient(svg, a, 'fill', gradientOf(svg, a, 'fill'), () => 'g9').id, 'g9')
    })
  })

  describe('stops', function () {
    const grad = () => {
      const svg = drawing(LINEAR, '')
      return { svg, grad: svg.querySelector('#g1') }
    }
    const offsets = (g) => [...g.querySelectorAll('stop')].map((s) => Number(s.getAttribute('offset')))

    it('a new stop takes the mix of its neighbours', function () {
      const { grad: g } = grad()
      const s = addStop(g, 0.5)
      assert.equal(s.getAttribute('stop-color'), '#800080')
      assert.deepEqual(offsets(g), [0, 0.5, 1])
    })

    it('colorAt uses the nearest stop outside the range or for colours it cannot mix', function () {
      const stops = [
        { offset: 0.2, color: 'red', opacity: 1 },
        { offset: 0.8, color: '#00f', opacity: 0 }
      ]
      assert.deepEqual(colorAt(stops, 0.1), { color: 'red', opacity: 1 })
      assert.deepEqual(colorAt(stops, 0.9), { color: '#00f', opacity: 0 })
      assert.equal(colorAt(stops, 0.3).color, 'red')
      assert.equal(colorAt(stops, 0.7).color, '#00f')
      close(colorAt(stops, 0.5).opacity, 0.5)
    })

    it('placeStop keeps the stops sorted when one is dragged past another', function () {
      const { grad: g } = grad()
      const mid = addStop(g, 0.5)
      placeStop(mid, 0)
      assert.deepEqual(offsets(g), [0, 0, 1])
      assert.equal(g.querySelectorAll('stop')[1], [...g.querySelectorAll('stop')].find((s) => s === g.firstElementChild.nextElementSibling))
      const first = g.firstElementChild
      placeStop(first, 1)
      assert.equal(g.lastElementChild, first)
      assert.deepEqual(offsets(g), [0, 1, 1])
      placeStop(first, 5)
      assert.equal(first.getAttribute('offset'), '1')
    })

    it('copyStop leaves the original and adds a copy at the offset', function () {
      const { grad: g } = grad()
      const first = g.firstElementChild
      const copy = copyStop(first, 0.4)
      assert.equal(g.querySelectorAll('stop').length, 3)
      assert.equal(copy.getAttribute('stop-color'), '#ff0000')
      assert.deepEqual(offsets(g), [0, 0.4, 1])
    })

    it('removeStop never leaves fewer than two', function () {
      const { grad: g } = grad()
      assert.equal(removeStop(g.firstElementChild), false)
      const s = addStop(g, 0.5)
      assert.equal(removeStop(s), true)
      assert.equal(g.querySelectorAll('stop').length, 2)
    })

    it('setStopColor writes where the stop keeps its colour', function () {
      const svg = drawing('<linearGradient id="g"><stop offset="0" style="stop-color:#000;stop-opacity:1"/><stop offset="1" stop-color="#fff"/></linearGradient>', '')
      const [a, b] = svg.querySelectorAll('stop')
      setStopColor(a, '#123456', 0.5)
      setStopColor(b, '#abcdef', 1)
      assert.equal(a.getAttribute('style'), 'stop-color:#123456;stop-opacity:0.5')
      assert.equal(b.getAttribute('stop-color'), '#abcdef')
      const read = readStops(svg, svg.querySelector('#g'))
      assert.deepEqual(read.map((s) => [s.color, s.opacity]), [['#123456', 0.5], ['#abcdef', 1]])
    })

    it('ownStops copies inherited stops so the parent is untouched', function () {
      const svg = drawing(`${LINEAR}<linearGradient id="g2" href="#g1"/>`, '')
      const child = svg.querySelector('#g2')
      const stops = ownStops(svg, child)
      assert.equal(stops.length, 2)
      setStopColor(stops[0], '#00ff00', 1)
      assert.equal(svg.querySelector('#g1 stop').getAttribute('stop-color'), '#ff0000')
      assert.equal(readStops(svg, child)[0].color, '#00ff00')
    })

    it('offsets in percent are read as fractions', function () {
      const svg = drawing('<linearGradient id="g"><stop offset="25%"/><stop offset="150%"/></linearGradient>', '')
      assert.deepEqual(readStops(svg, svg.querySelector('#g')).map((s) => s.offset), [0.25, 1])
    })
  })
})
