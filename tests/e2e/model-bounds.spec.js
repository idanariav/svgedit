import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'
import fs from 'node:fs'
import path from 'node:path'
import { parseSvg } from '../../packages/svgcanvas/core/model/index.ts'
import { geometricBounds } from '../../packages/svgcanvas/core/model/bounds.ts'

// R1: the model computes a shape's box with no browser (core/model/bounds.ts). The browser's own getBBox is the oracle:
// for every shape of the round-trip fixtures, and for generated curves and arcs, the two must agree.
const FIXTURES = path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip')
const SHAPES = 'rect,circle,ellipse,line,polyline,polygon,path'

/** Every shape in the loaded drawing: its markup and what the browser says its box is. */
const collect = (page) => page.evaluate((shapes) => Array.from(document.querySelectorAll('#svgcontent')[0].querySelectorAll(shapes)).filter((el) => !el.closest('defs, clipPath, mask, marker, pattern, symbol')).map((el) => {
  const b = el.getBBox()
  return { id: el.id, markup: new XMLSerializer().serializeToString(el), live: [b.x, b.y, b.width, b.height] }
}), SHAPES)

const modelElement = (markup) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup.replace(/ xmlns(:\w+)?="[^"]*"/g, '')}</svg>`).root.children.find((c) => c.kind === 'element')

const compare = (rows) => {
  const misses = []
  let checked = 0
  for (const r of rows) {
    const got = geometricBounds(modelElement(r.markup))
    if (!got) { misses.push({ id: r.id, why: 'no box' }); continue }
    checked++
    const mine = [got.x, got.y, got.width, got.height]
    mine.forEach((v, i) => { if (Math.abs(v - r.live[i]) > 0.01 + Math.abs(r.live[i]) * 1e-4) misses.push({ id: r.id, mine, live: r.live }) })
  }
  return { checked, misses }
}

test.describe('Model shape bounds', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('agree with getBBox on every shape of the round-trip fixtures', async ({ page }) => {
    let total = 0
    const problems = []
    for (const name of fs.readdirSync(FIXTURES).filter((n) => n.endsWith('.svg'))) {
      await page.evaluate((svg) => window.svgEditor.svgCanvas.setSvgString(svg), fs.readFileSync(path.join(FIXTURES, name), 'utf8'))
      const { checked, misses } = compare(await collect(page))
      total += checked
      problems.push(...misses.map((m) => ({ fixture: name, ...m })))
    }
    console.log(`model bounds: ${total} shapes compared with getBBox, ${problems.length} differ`)
    expect(total).toBeGreaterThan(30)
    expect(problems).toEqual([])
  })

  test('agree with getBBox on generated curves; arcs within the error of their cubic approximation', async ({ page }) => {
    // a seeded generator: reproducible, no extra dependency
    let seed = 12345
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const n = (k = 200) => (rnd() * k - k / 4).toFixed(2)
    const kinds = { cubic: [], quad: [], arc: [] }
    for (let i = 0; i < 60; i++) {
      kinds.cubic.push(`M${n()} ${n()} C${n()} ${n()} ${n()} ${n()} ${n()} ${n()} S${n()} ${n()} ${n()} ${n()}`)
      kinds.quad.push(`M${n()} ${n()} Q${n()} ${n()} ${n()} ${n()} T${n()} ${n()}`)
      kinds.arc.push(`M${n()} ${n()} a${(rnd() * 60 + 5).toFixed(1)} ${(rnd() * 60 + 5).toFixed(1)} ${(rnd() * 90).toFixed(0)} ${i % 2} ${(i >> 1) % 2} ${n(80)} ${n(80)} l${n(40)} ${n(40)} h${n(30)} v${n(30)} z`)
    }
    const worst = {}
    for (const [kind, ds] of Object.entries(kinds)) {
      await page.evaluate((list) => window.svgEditor.svgCanvas.setSvgString(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>${list.map((d, i) => `<path id="p${i}" d="${d}" fill="none" stroke="#000"/>`).join('')}</g></svg>`), ds)
      const rows = await collect(page)
      expect(rows.length).toBe(ds.length)
      worst[kind] = 0
      for (const r of rows) {
        const got = geometricBounds(modelElement(r.markup))
        const mine = [got.x, got.y, got.x + got.width, got.y + got.height]
        const live = [r.live[0], r.live[1], r.live[0] + r.live[2], r.live[1] + r.live[3]]
        worst[kind] = Math.max(worst[kind], ...mine.map((v, i) => Math.abs(v - live[i])))
      }
    }
    console.log('model bounds, worst edge error vs getBBox (user units):', JSON.stringify(worst))
    expect(worst.cubic).toBeLessThan(0.01)
    expect(worst.quad).toBeLessThan(0.01)
    expect(worst.arc).toBeLessThan(0.1)
  })

  test('the stroked box adds the miter tips the model finds, and nothing to a shape whose corners do not spike', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.setSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>
        <rect id="sq" x="20" y="20" width="40" height="40" fill="none" stroke="#000" stroke-width="6"/>
        <polygon id="wedge" points="100,100 300,100 100,135" fill="none" stroke="#000" stroke-width="4" stroke-miterlimit="40"/>
        <polygon id="wedge-round" points="100,200 300,200 100,235" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
      </g></svg>`))
    const boxes = await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      const get = (id) => { const b = canvas.getStrokedBBox([document.getElementById(id)]); return { x: b.x, y: b.y, width: b.width, height: b.height } }
      return { sq: get('sq'), wedge: get('wedge'), round: get('wedge-round') }
    })
    // a square's miter tip is exactly the half-width margin: no change from the old answer
    expect(boxes.sq).toEqual({ x: 17, y: 17, width: 46, height: 46 })
    // the sharp corner's spike reaches well past the half-width margin; with round joins it does not
    expect(boxes.wedge.x + boxes.wedge.width).toBeGreaterThan(305)
    expect(boxes.round.x + boxes.round.width).toBeCloseTo(302, 3)
  })
})

// The headless CLI's `bounds` verb (model/layout.ts): the document-space box of every object, from the file alone. For every
// object the model measures exactly, the editor's own getBBox taken through the object's transform chain is the oracle (only
// where that chain keeps the axes, since the box of a turned curve is not the turned box).
test.describe('Model layout', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('every exactly measured object of the round-trip fixtures sits where the editor says', async ({ page }) => {
    const { layoutOf } = await import('../../packages/svgcanvas/core/model/index.ts')
    let compared = 0
    let turned = 0
    const problems = []
    for (const name of fs.readdirSync(FIXTURES).filter((n) => n.endsWith('.svg'))) {
      const svg = fs.readFileSync(path.join(FIXTURES, name), 'utf8')
      const layout = layoutOf(parseSvg(svg).root)
      await page.evaluate((text) => window.svgEditor.svgCanvas.setSvgString(text), svg)
      const wanted = layout.objects.filter((o) => o.source === 'exact' && !o.hidden && o.box).map((o) => o.id)
      const live = await page.evaluate((ids) => {
        const content = document.querySelector('#svgcontent')
        const inv = content.getScreenCTM().inverse()
        const out = {}
        for (const id of ids) {
          const el = document.getElementById(id)
          if (!el || !el.getBBox || !el.getScreenCTM) continue
          const m = inv.multiply(el.getScreenCTM())
          const b = el.getBBox()
          const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f])
          out[id] = { axisAligned: Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9, box: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))] }
        }
        return out
      }, wanted)
      for (const o of layout.objects) {
        const l = live[o.id]
        if (!l || !o.box) continue
        if (!l.axisAligned) { turned++; continue }
        compared++
        // a group the editor reports as empty (all children hidden or unmeasurable) is not a disagreement
        if (l.box.every((v) => v === 0)) continue
        if (o.box.some((v, i) => Math.abs(v - l.box[i]) > 0.02 + Math.abs(l.box[i]) * 1e-4)) problems.push({ fixture: name, id: o.id, tag: o.tag, model: o.box, editor: l.box.map((v) => +v.toFixed(3)) })
      }
    }
    console.log(`model layout: ${compared} objects compared with the editor (${turned} skipped as turned), ${problems.length} differ`)
    expect(compared).toBeGreaterThan(50)
    expect(problems).toEqual([])
  })
})
