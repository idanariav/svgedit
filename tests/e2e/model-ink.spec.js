import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'
import { parseSvg } from '../../packages/svgcanvas/core/model/index.ts'
import { geometricBounds, strokedBounds } from '../../packages/svgcanvas/core/model/bounds.ts'
import { parseMatrix } from '../../packages/svgcanvas/core/model/matrix.ts'

// R1: the model's boxes under a transform, with strokes, miter tips, square caps and groups, checked against what the browser
// actually paints: each case is rendered through the browser's SVG renderer onto a canvas and the extent of the ink is measured.
const CASES = [
  ['rect, miter, turned', '<rect x="0" y="0" width="40" height="30" fill="none" stroke="#000" stroke-width="6" transform="rotate(30 20 15)"/>'],
  ['rect, miter, turned 45', '<rect x="10" y="10" width="40" height="40" fill="#888" stroke="#000" stroke-width="8" transform="translate(20 5) rotate(45 30 30)"/>'],
  ['triangle, miter limit 10, turned', '<polygon points="0,0 60,10 25,50" fill="none" stroke="#000" stroke-width="5" stroke-miterlimit="10" transform="translate(30 10) rotate(-17 30 20)"/>'],
  ['open polyline, square caps, turned', '<polyline points="0,0 40,0 40,30" fill="none" stroke="#000" stroke-width="8" stroke-linecap="square" transform="rotate(60)"/>'],
  ['polyline, square caps and miter, uniform scale and turn', '<polyline points="0,0 30,0 30,20" fill="none" stroke="#000" stroke-width="4" stroke-linecap="square" transform="translate(10 40) rotate(25) scale(1.5)"/>'],
  ['closed curve, round join', '<path d="M0 0 C20 -20 40 20 60 0 L60 40 Z" fill="none" stroke="#000" stroke-width="6" stroke-linejoin="round" transform="rotate(15)"/>'],
  ['closed curve, miter', '<path d="M0 0 C20 -20 40 20 60 0 L60 40 Z" fill="none" stroke="#000" stroke-width="6" transform="rotate(15)"/>'],
  // an open end with a butt cap: the ink stops at the cap, the model's margin does not (conservative, as VectorCraft's is)
  ['open curve, butt ends', '<path d="M0 0 C20 -20 40 20 60 0 L60 40" fill="none" stroke="#000" stroke-width="6" stroke-linejoin="round" transform="rotate(15)"/>', 'conservative'],
  ['ellipse, turned, stroked', '<ellipse cx="40" cy="20" rx="30" ry="12" fill="none" stroke="#000" stroke-width="5" transform="rotate(35 40 20)"/>'],
  ['flipped polygon', '<polygon points="0,0 40,0 40,20 10,40" fill="none" stroke="#000" stroke-width="6" transform="translate(60 0) scale(-1 1)"/>'],
  ['rounded rect, turned', '<rect x="0" y="0" width="50" height="30" rx="10" fill="none" stroke="#000" stroke-width="4" transform="rotate(40 25 15)"/>'],
  ['group: children under their own transforms, inherited stroke',
    '<g stroke="#000" stroke-width="5" fill="none" transform="translate(20 10) rotate(20)"><rect x="0" y="0" width="30" height="20"/><polygon transform="translate(40 0)" points="0,0 25,5 10,30"/><line x1="0" y1="40" x2="50" y2="40" stroke-linecap="square"/></g>']
]

/** Render each markup with the browser's SVG renderer and measure the ink: [x0, y0, x1, y1] in user units, or null for no ink. */
const ink = (page, cases) => page.evaluate(async (list) => {
  const out = []
  for (const { markup, region } of list) {
    const [rx, ry, rw, rh] = region
    const scale = Math.min(16, 2400 / Math.max(rw, rh))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rx} ${ry} ${rw} ${rh}" width="${Math.ceil(rw * scale)}" height="${Math.ceil(rh * scale)}">${markup}</svg>`
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(rw * scale)
    canvas.height = Math.ceil(rh * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1) }
      }
    }
    out.push(Number.isFinite(x0) ? [rx + x0 / scale, ry + y0 / scale, rx + x1 / scale, ry + y1 / scale, 1 / scale] : null)
  }
  return out
}, cases)

const modelBox = (markup) => {
  const el = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).root.children.find((c) => c.kind === 'element')
  const m = parseMatrix(el.attrs.find((a) => a.name === 'transform')?.value)
  return { stroked: strokedBounds([el], m), geometric: geometricBounds(el, m) }
}

test.describe('Model boxes against rendered ink', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('the stroked box of a transformed shape or group is the extent of what the browser paints', async ({ page }) => {
    const boxes = CASES.map(([, markup]) => modelBox(markup))
    for (const b of boxes) expect(b.stroked).toBeDefined()
    // a generous region around the model's box, so ink the model missed would still be seen
    const cases = CASES.map(([, markup], i) => {
      const b = boxes[i].stroked
      return { markup, region: [b.x - 12, b.y - 12, b.width + 24, b.height + 24] }
    })
    const painted = await ink(page, cases)
    const report = []
    CASES.forEach(([name, , kind], i) => {
      const b = boxes[i].stroked
      const p = painted[i]
      const mine = [b.x, b.y, b.x + b.width, b.y + b.height]
      const tol = Math.max(0.2, 4 * p[4])
      // sound: the model's box holds all the ink (the low edges are not above it, the high edges not below it)
      const short = Math.max(mine[0] - p[0], mine[1] - p[1], p[2] - mine[2], p[3] - mine[3])
      expect(short, `${name}: ink outside the model box`).toBeLessThan(tol)
      // tight: unless the case has an open butt end, the box is the ink's extent
      const worst = Math.max(...mine.map((v, k) => Math.abs(v - p[k])))
      report.push({ name, worst: +worst.toFixed(3), pixel: +p[4].toFixed(3) })
      if (kind !== 'conservative') expect(worst, `${name}: model box is not tight`).toBeLessThan(tol)
    })
    console.log('model stroked box vs rendered ink (worst edge error, user units):', JSON.stringify(report))
  })

  test('the geometric box of a transformed shape is the extent of its fill', async ({ page }) => {
    const filled = CASES.filter(([, , kind]) => kind !== 'conservative').slice(0, 10).map(([name, markup]) => [name, markup.replace(/stroke="#000"/, 'stroke="none"').replace(/fill="none"/, 'fill="#000"')])
    const boxes = filled.map(([, markup]) => modelBox(markup).geometric)
    for (const b of boxes) expect(b).toBeDefined()
    const painted = await ink(page, filled.map(([, markup], i) => ({ markup, region: [boxes[i].x - 12, boxes[i].y - 12, boxes[i].width + 24, boxes[i].height + 24] })))
    filled.forEach(([name], i) => {
      const b = boxes[i]
      const p = painted[i]
      const worst = Math.max(...[b.x, b.y, b.x + b.width, b.y + b.height].map((v, k) => Math.abs(v - p[k])))
      expect(worst, name).toBeLessThan(Math.max(0.2, 4 * p[4]))
    })
  })

  test("the editor's getStrokedBBox of a turned or scaled shape is the extent of what is painted", async ({ page }) => {
    const shapes = [
      ['rect-45', '<rect id="s1" x="10" y="10" width="40" height="40" fill="#888" stroke="#000" stroke-width="8" transform="translate(20 5) rotate(45 30 30)"/>'],
      ['triangle', '<polygon id="s2" points="0,0 60,10 25,50" fill="none" stroke="#000" stroke-width="5" stroke-miterlimit="10" transform="translate(30 10) rotate(-17 30 20)"/>'],
      ['scaled', '<rect id="s3" x="0" y="0" width="20" height="20" fill="none" stroke="#000" stroke-width="4" transform="translate(10 10) scale(2.5)"/>'],
      ['plain', '<rect id="s4" x="5" y="5" width="30" height="20" fill="none" stroke="#000" stroke-width="6"/>']
    ]
    await page.evaluate((markup) => window.svgEditor.svgCanvas.setSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>${markup}</g></svg>`), shapes.map(([, m]) => m).join(''))
    const got = await page.evaluate((ids) => ids.map((id) => {
      const b = window.svgEditor.svgCanvas.getStrokedBBox([document.getElementById(id)])
      return [b.x, b.y, b.x + b.width, b.y + b.height]
    }), shapes.map((_, i) => `s${i + 1}`))
    const painted = await ink(page, shapes.map(([, markup], i) => ({ markup: markup.replace(/ id="s\d"/, ''), region: [got[i][0] - 12, got[i][1] - 12, got[i][2] - got[i][0] + 24, got[i][3] - got[i][1] + 24] })))
    const report = []
    shapes.forEach(([name], i) => {
      const p = painted[i]
      const worst = Math.max(...got[i].map((v, k) => Math.abs(v - p[k])))
      report.push({ name, worst: +worst.toFixed(3) })
      expect(worst, name).toBeLessThan(Math.max(0.2, 4 * p[4]))
    })
    console.log('getStrokedBBox vs rendered ink:', JSON.stringify(report))
  })
})
