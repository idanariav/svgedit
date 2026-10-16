import {
  parseColor, toHex, normalizeColor, rgbToHsb, hsbToRgb, shiftHue, neutralOf, isPreserved, DEFAULT_PRESERVE,
  keyColor, rowMap, cluster, buildRows, planMap, harmonyColors, HARMONIES, METHODS, collectColors, applyColors
} from '../../packages/svgcanvas/core/recolor.ts'

const NS = 'http://www.w3.org/2000/svg'

/** A drawing: <svg><defs>{defs}</defs>{body}</svg>. */
const drawing = (defs, body) => {
  const host = document.createElement('div')
  host.innerHTML = `<svg xmlns="${NS}"><defs>${defs}</defs>${body}</svg>`
  return host.firstElementChild
}

const nextIdFrom = (start = 100) => {
  let n = start
  return () => `new_${n++}`
}

const GRAD = '<linearGradient id="g1"><stop offset="0" stop-color="#ff0000"/><stop offset="1" style="stop-color:#0000ff"/></linearGradient>'
const lum = (hex) => rgbToHsb(parseColor(hex))[2]

describe('recolor', function () {
  describe('colours', function () {
    it('parses hex, rgb(), percentages and basic names', function () {
      assert.deepEqual(parseColor('#f00'), [255, 0, 0])
      assert.deepEqual(parseColor(' #00FF80 '), [0, 255, 128])
      assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30])
      assert.deepEqual(parseColor('rgb(100% 0% 50%)'), [255, 0, 128])
      assert.deepEqual(parseColor('white'), [255, 255, 255])
      assert.deepEqual(parseColor('rgba(1,2,3,1)'), [1, 2, 3])
    })

    it('leaves what it cannot write back alone', function () {
      for (const v of ['none', 'url(#a)', 'currentColor', 'rgba(1,2,3,0.5)', '#12345', 'chartreuse', null, '']) {
        assert.equal(parseColor(v), null, String(v))
      }
      assert.equal(normalizeColor('RED'), '#ff0000')
    })

    it('round-trips HSB', function () {
      for (const hex of ['#ff8000', '#3a7bd5', '#808080', '#000000', '#ffffff']) {
        const [h, s, v] = rgbToHsb(parseColor(hex))
        assert.equal(toHex(hsbToRgb(h, s, v)), hex)
      }
      assert.equal(toHex(hsbToRgb(120, 1, 1)), '#00ff00')
    })

    it('shiftHue turns the hue and keeps greys grey', function () {
      assert.equal(shiftHue('#ff0000', 120), '#00ff00')
      assert.equal(shiftHue('#ff0000', 360), '#ff0000')
      assert.equal(shiftHue('#808080', 90), '#808080')
    })
  })

  describe('neutrals', function () {
    it('finds white, black and grey', function () {
      assert.equal(neutralOf([255, 255, 255]), 'white')
      assert.equal(neutralOf([0, 0, 0]), 'black')
      assert.equal(neutralOf([128, 128, 128]), 'gray')
      assert.equal(neutralOf([128, 100, 128]), null)
    })

    it('keeps white and black by default, greys on request', function () {
      assert.ok(isPreserved('#ffffff', DEFAULT_PRESERVE))
      assert.ok(isPreserved('#000000', DEFAULT_PRESERVE))
      assert.ok(!(isPreserved('#888888', DEFAULT_PRESERVE)))
      assert.ok(isPreserved('#888888', { white: false, black: false, grays: true }))
      assert.ok(!(isPreserved('#ff0000', { white: true, black: true, grays: true })))
    })
  })

  describe('row methods', function () {
    const red = '#ff0000'
    const pink = '#ff8080' // red tinted 0.5
    const other = '#ffb300'

    it('Exact sends every colour to the new colour', function () {
      const { map } = rowMap('exact', [red, pink], '#0000ff')
      assert.equal(map(red), '#0000ff')
      assert.equal(map(pink), '#0000ff')
    })

    it('picks the darkest colour as the key, the most saturated for Hue Shift', function () {
      assert.equal(keyColor('exact', [pink, red]), red)
      assert.equal(keyColor('hueShift', ['#c08080', '#e02020', '#303030']), '#e02020')
    })

    it('Scale Tints keeps every tint ratio', function () {
      const { key, map } = rowMap('scaleTints', [pink, red], '#0000ff')
      assert.equal(key, red)
      assert.equal(map(red), '#0000ff')
      assert.equal(map(pink), '#8080ff')
    })

    it('Preserve Tints only scales real tints', function () {
      const { map } = rowMap('preserveTints', [red, pink, other], '#0000ff')
      assert.equal(map(pink), '#8080ff')
      assert.equal(map(other), '#0000ff', 'not a tint of the key: exact')
    })

    it('Tints and Shades keeps lighter lighter and darker darker', function () {
      const row = ['#e63333', '#801a1a', '#ffb3b3']
      const { map } = rowMap('tintsShades', row, '#0066ff')
      assert.ok(lum(map(row[2])) > lum(map(row[0])))
      assert.ok(lum(map(row[0])) > lum(map(row[1])))
    })

    it('Hue Shift turns the others by the key colour\'s turn, keeping saturation and brightness', function () {
      const row = ['#e63333', '#801a1a', '#ffb3b3']
      const { key, map } = rowMap('hueShift', row, '#0066ff')
      assert.equal(map(key), '#0066ff')
      const [h, s, v] = rgbToHsb(parseColor(map('#801a1a')))
      const [, s0, v0] = rgbToHsb(parseColor('#801a1a'))
      assert.ok(Math.abs(s - s0) < 0.02)
      assert.ok(Math.abs(v - v0) < 0.02)
      assert.ok(Math.abs(h - rgbToHsb(parseColor('#0066ff'))[0]) < 4)
    })

    it('lists every method once', function () {
      assert.deepEqual(METHODS.map((m) => m.id), ['exact', 'preserveTints', 'scaleTints', 'tintsShades', 'hueShift'])
    })
  })

  describe('rows', function () {
    const uses = [
      { hex: '#ff0000', count: 5 }, { hex: '#0000ff', count: 4 }, { hex: '#e61a0d', count: 1 },
      { hex: '#1a1ae6', count: 1 }, { hex: '#ff3333', count: 1 }, { hex: '#ffffff', count: 9 }, { hex: '#000000', count: 3 }
    ]

    it('drops preserved neutrals and makes a row per colour', function () {
      const rows = buildRows(uses)
      assert.equal(rows.length, 5)
      assert.deepEqual(rows.map((r) => r.colors[0].hex), ['#ff0000', '#0000ff', '#e61a0d', '#1a1ae6', '#ff3333'])
      assert.equal(buildRows(uses, { preserve: { white: false, black: false, grays: false } }).length, 7)
    })

    it('reduces to N rows of similar colours', function () {
      const rows = buildRows(uses, { reduce: 2 })
      assert.equal(rows.length, 2)
      assert.deepEqual(rows[0].colors.map((c) => c.hex), ['#ff0000', '#e61a0d', '#ff3333'])
      assert.deepEqual(rows[1].colors.map((c) => c.hex), ['#0000ff', '#1a1ae6'])
      assert.equal(rows[0].count, 7)
    })

    it('never makes more rows than colours and clusters deterministically', function () {
      const hexes = ['#ff0000', '#00ff00', '#0000ff']
      assert.equal(cluster(hexes, [1, 1, 1], 9).length, 3)
      assert.deepEqual(cluster(hexes, [1, 1, 1], 1), [[0, 1, 2]])
      assert.equal(cluster(['#123456', '#123456'], [1, 1], 2).length, 1)
      assert.deepEqual(cluster([], [], 3), [])
      assert.deepEqual(cluster(hexes, [3, 2, 1], 2), cluster(hexes, [3, 2, 1], 2))
    })

    it('plans a map of only the colours that change', function () {
      const rows = buildRows(uses, { reduce: 2 })
      const plan = planMap(rows, ['#ff0000', '#00aa00'], 'exact')
      assert.equal(plan.get('#e61a0d'), '#ff0000')
      assert.equal(plan.get('#0000ff'), '#00aa00')
      assert.ok(!(plan.has('#ff0000')), 'unchanged')
    })
  })

  describe('harmony', function () {
    it('puts the base colour first', function () {
      for (const h of HARMONIES) assert.equal(harmonyColors(h.id, '#3366cc')[0], '#3366cc', h.id)
    })

    it('Complementary adds the opposite hue', function () {
      assert.deepEqual(harmonyColors('complementary', '#ff0000'), ['#ff0000', '#00ffff'])
    })

    it('Triad and Pentagram spread hues evenly', function () {
      assert.deepEqual(harmonyColors('triad', '#ff0000'), ['#ff0000', '#00ff00', '#0000ff'])
      assert.equal(harmonyColors('pentagram', '#ff0000').length, 5)
    })

    it('Shades darken, High Contrast flips brightness', function () {
      const shades = harmonyColors('shades', '#ff8800')
      for (let i = 1; i < shades.length; i++) assert.isBelow(lum(shades[i]), lum(shades[i - 1]))
      assert.ok(lum(harmonyColors('highContrast', '#ffee88')[1]) < 0.4)
      assert.ok(lum(harmonyColors('highContrast', '#221100')[1]) > 0.6)
    })

    it('has 21 rules with unique ids; an unknown rule gives just the base', function () {
      assert.equal(HARMONIES.length, 21)
      assert.equal(new Set(HARMONIES.map((h) => h.id)).size, 21)
      assert.deepEqual(harmonyColors('nope', '#123456'), ['#123456'])
    })
  })

  describe('collecting', function () {
    it('counts fills, strokes and style colours, most used first', function () {
      const svg = drawing('', `
        <rect id="a" fill="#ff0000" stroke="#000"/>
        <rect id="b" fill="#ff0000" style="stroke:#0000ff"/>
        <rect id="c" fill="none" stroke="url(#nowhere)"/>`)
      const uses = collectColors(svg, [...svg.querySelectorAll('rect')])
      assert.deepEqual(uses, [
        { hex: '#ff0000', count: 2 }, { hex: '#000000', count: 1 }, { hex: '#0000ff', count: 1 }
      ])
    })

    it('reads the selected group\'s children, but only the selection', function () {
      const svg = drawing('', '<g id="g"><rect fill="#111111"/><circle fill="#222222"/></g><rect id="out" fill="#333333"/>')
      assert.deepEqual(collectColors(svg, [svg.querySelector('#g')]).map((u) => u.hex).sort(), ['#111111', '#222222'])
    })

    it('includes gradient stops once per gradient, however many shapes use them', function () {
      const svg = drawing(GRAD, '<rect id="a" fill="url(#g1)"/><rect id="b" stroke="url(#g1)" fill="#00ff00"/>')
      const uses = collectColors(svg, [...svg.querySelectorAll('rect')])
      assert.deepEqual(uses.map((u) => u.hex).sort(), ['#00ff00', '#0000ff', '#ff0000'].sort())
      assert.ok(uses.every((u) => u.count === 1))
    })

    it('reads stops a gradient inherits through href', function () {
      const svg = drawing(`${GRAD}<linearGradient id="g2" href="#g1"/>`, '<rect id="a" fill="url(#g2)"/>')
      assert.deepEqual(collectColors(svg, [svg.querySelector('#a')]).map((u) => u.hex).sort(), ['#0000ff', '#ff0000'])
    })

    it('includes the flood colours of the filter an element uses', function () {
      const svg = drawing('<filter id="f"><feFlood flood-color="#336699"/></filter>', '<rect id="a" fill="#ff0000" filter="url(#f)"/>')
      assert.deepEqual(collectColors(svg, [svg.querySelector('#a')]).map((u) => u.hex).sort(), ['#336699', '#ff0000'])
    })
  })

  describe('applying', function () {
    it('rewrites attributes and style colours', function () {
      const svg = drawing('', '<rect id="a" fill="red" stroke="#0000ff" style="fill:#ff0000;stroke-width:2"/>')
      const a = svg.querySelector('#a')
      const n = applyColors(svg, [a], new Map([['#ff0000', '#00ff00'], ['#0000ff', '#ff00ff']]), nextIdFrom())
      assert.equal(n, 3)
      assert.equal(a.getAttribute('fill'), '#00ff00')
      assert.equal(a.getAttribute('stroke'), '#ff00ff')
      assert.equal(a.getAttribute('style'), 'fill:#00ff00;stroke-width:2')
    })

    it('does nothing for an empty or identity map', function () {
      const svg = drawing(GRAD, '<rect id="a" fill="url(#g1)"/>')
      const before = svg.innerHTML
      assert.equal(applyColors(svg, [svg.querySelector('#a')], new Map(), nextIdFrom()), 0)
      assert.equal(applyColors(svg, [svg.querySelector('#a')], new Map([['#ff0000', '#ff0000']]), nextIdFrom()), 0)
      assert.equal(svg.innerHTML, before)
    })

    it('only touches the selection', function () {
      const svg = drawing('', '<rect id="a" fill="#ff0000"/><rect id="b" fill="#ff0000"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#ff0000', '#00ff00']]), nextIdFrom())
      assert.equal(svg.querySelector('#b').getAttribute('fill'), '#ff0000')
    })

    it('edits an unshared gradient in place', function () {
      const svg = drawing(GRAD, '<rect id="a" fill="url(#g1)"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#ff0000', '#00ff00'], ['#0000ff', '#ffff00']]), nextIdFrom())
      assert.equal(svg.querySelectorAll('linearGradient').length, 1)
      const stops = [...svg.querySelectorAll('stop')]
      assert.equal(stops[0].getAttribute('stop-color'), '#00ff00')
      assert.equal(stops[1].getAttribute('style'), 'stop-color:#ffff00')
    })

    it('copies a gradient an unselected shape also uses', function () {
      const svg = drawing(GRAD, '<rect id="a" fill="url(#g1)"/><rect id="b" fill="url(#g1)"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#ff0000', '#00ff00']]), nextIdFrom())
      const grads = svg.querySelectorAll('linearGradient')
      assert.equal(grads.length, 2)
      assert.equal(svg.querySelector('#b').getAttribute('fill'), 'url(#g1)')
      assert.equal(svg.querySelector('#a').getAttribute('fill'), 'url(#new_100)')
      assert.equal(grads[0].querySelector('stop').getAttribute('stop-color'), '#ff0000')
      assert.equal(svg.querySelector('#new_100 stop').getAttribute('stop-color'), '#00ff00')
    })

    it('makes one copy for several selected shapes that share a gradient', function () {
      const svg = drawing(GRAD, '<rect id="a" fill="url(#g1)"/><rect id="b" stroke="url(#g1)"/><rect id="c" fill="url(#g1)"/>')
      applyColors(svg, [svg.querySelector('#a'), svg.querySelector('#b')], new Map([['#ff0000', '#00ff00']]), nextIdFrom())
      assert.equal(svg.querySelectorAll('linearGradient').length, 2)
      assert.equal(svg.querySelector('#a').getAttribute('fill'), 'url(#new_100)')
      assert.equal(svg.querySelector('#b').getAttribute('stroke'), 'url(#new_100)')
      assert.equal(svg.querySelector('#c').getAttribute('fill'), 'url(#g1)')
    })

    it('does not copy a shared gradient when none of its colours change', function () {
      const svg = drawing(GRAD, '<rect id="a" fill="url(#g1)" stroke="#ff00ff"/><rect id="b" fill="url(#g1)"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#ff00ff', '#00ffff']]), nextIdFrom())
      assert.equal(svg.querySelectorAll('linearGradient').length, 1)
      assert.equal(svg.querySelector('#a').getAttribute('stroke'), '#00ffff')
    })

    it('copies a gradient another gradient inherits from', function () {
      const svg = drawing(`${GRAD}<linearGradient id="g2" href="#g1"/>`, '<rect id="a" fill="url(#g1)"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#ff0000', '#00ff00']]), nextIdFrom())
      assert.equal(svg.querySelector('#g1 stop').getAttribute('stop-color'), '#ff0000')
      assert.equal(svg.querySelector('#new_100 stop').getAttribute('stop-color'), '#00ff00')
    })

    it('gives a gradient that inherits its stops its own before recolouring', function () {
      const svg = drawing(`${GRAD}<linearGradient id="g2" href="#g1"/>`, '<rect id="a" fill="url(#g2)"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#ff0000', '#00ff00']]), nextIdFrom())
      assert.equal(svg.querySelector('#g1 stop').getAttribute('stop-color'), '#ff0000')
      assert.equal(svg.querySelector('#g2 stop').getAttribute('stop-color'), '#00ff00')
    })

    it('recolours and copies filter flood colours', function () {
      const svg = drawing('<filter id="f"><feFlood flood-color="#336699"/></filter>',
        '<rect id="a" fill="#ff0000" filter="url(#f)"/><rect id="b" filter="url(#f)"/>')
      applyColors(svg, [svg.querySelector('#a')], new Map([['#336699', '#cc3300']]), nextIdFrom())
      assert.equal(svg.querySelector('#f feFlood').getAttribute('flood-color'), '#336699')
      assert.equal(svg.querySelector('#new_100 feFlood').getAttribute('flood-color'), '#cc3300')
      assert.equal(svg.querySelector('#a').getAttribute('filter'), 'url(#new_100)')
    })

    it('recolours a harmony onto rows end to end', function () {
      const svg = drawing('', '<rect id="a" fill="#ff0000"/><rect id="b" fill="#00ff00"/><rect id="c" fill="#0000ff"/>')
      const els = [...svg.querySelectorAll('rect')]
      const rows = buildRows(collectColors(svg, els))
      const tones = harmonyColors('complementary', rows[0].colors[0].hex)
      applyColors(svg, els, planMap(rows, rows.map((_, i) => tones[i % tones.length]), 'exact'), nextIdFrom())
      const fills = els.map((e) => e.getAttribute('fill'))
      assert.equal(new Set(fills).size, 2, fills.join())
    })
  })
})
