import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'
import fs from 'node:fs'
import path from 'node:path'

// R1 spike: the model's text-metrics cache (core/model/text-metrics.ts) is filled by measuring the DOM after each step lands.
// It must agree with the live getBBox after a load, an edit, an undo and a redo, and the estimate must stay in the right
// region for headless use.
const FIXTURES = path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip')
const load = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')

test.describe('Text metrics cache', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  /** Every text: the cached box, the estimate's error against it, and the live getBBox. */
  const compare = (page) => page.evaluate(() => {
    const canvas = window.svgEditor.svgCanvas
    return Array.from(document.querySelectorAll('#svgcontent text[id]')).map((t) => {
      const live = canvas.getBBox(t)
      const got = canvas.snapshotHistory.textBounds(t.id)
      return { id: t.id, measured: got?.measured, box: got?.box, live: live && { x: live.x, y: live.y, width: live.width, height: live.height } }
    })
  })

  for (const name of ['groups-gradients-layers.svg', 'glow.svg', 'area-text.svg']) {
    test(`${name}: every text is measured and equals the live box`, async ({ page }) => {
      await page.evaluate((svg) => window.svgEditor.svgCanvas.setSvgString(svg), load(name))
      const rows = await compare(page)
      expect(rows.length).toBeGreaterThan(0)
      for (const r of rows) {
        expect(r.measured, r.id).toBe(true)
        for (const k of ['x', 'y', 'width', 'height']) expect(r.box[k], `${r.id}.${k}`).toBeCloseTo(r.live[k], 3)
      }
    })
  }

  test('an edit that changes the type re-measures; undo and redo agree with the DOM', async ({ page }) => {
    await page.evaluate((svg) => window.svgEditor.svgCanvas.setSvgString(svg), load('glow.svg'))
    const id = await page.evaluate(() => document.querySelector('#svgcontent text[id]').id)
    const sizeBefore = await page.evaluate((i) => window.svgEditor.svgCanvas.snapshotHistory.textBounds(i).box.width, id)
    await page.evaluate((i) => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById(i)])
      canvas.changeSelectedAttribute('font-size', 120)
    }, id)
    const after = (await compare(page)).find((r) => r.id === id)
    expect(after.measured).toBe(true)
    expect(after.box.width).toBeGreaterThan(sizeBefore)
    for (const k of ['x', 'y', 'width', 'height']) expect(after.box[k]).toBeCloseTo(after.live[k], 3)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    const undone = (await compare(page)).find((r) => r.id === id)
    expect(undone.box.width).toBeCloseTo(sizeBefore, 3)
    for (const k of ['x', 'y', 'width', 'height']) expect(undone.box[k]).toBeCloseTo(undone.live[k], 3)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    const redone = (await compare(page)).find((r) => r.id === id)
    for (const k of ['x', 'y', 'width', 'height']) expect(redone.box[k]).toBeCloseTo(redone.live[k], 3)
  })

  test('a font size set on a group above the text invalidates the entry', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><g class="layer"><title>L</title><g id="grp" font-size="20"><text id="t" x="10" y="100">Inherited size</text></g></g></svg>'))
    const before = (await compare(page))[0]
    expect(before.measured).toBe(true)
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('grp')])
      canvas.changeSelectedAttribute('font-size', 60)
    })
    const after = (await compare(page))[0]
    expect(after.box.width).toBeGreaterThan(before.box.width * 2)
    for (const k of ['x', 'y', 'width', 'height']) expect(after.box[k]).toBeCloseTo(after.live[k], 3)
  })

  test('the estimate is in the right region (reported, loose bound)', async ({ page }) => {
    await page.evaluate((svg) => window.svgEditor.svgCanvas.setSvgString(svg), load('groups-gradients-layers.svg'))
    const report = await page.evaluate(async () => {
      const canvas = window.svgEditor.svgCanvas
      const out = []
      for (const t of document.querySelectorAll('#svgcontent text[id]')) {
        canvas.snapshotHistory.textMetrics.clear()
        const est = canvas.snapshotHistory.textBounds(t.id)
        const live = canvas.getBBox(t)
        out.push({ id: t.id, measured: est.measured, widthRatio: est.box.width / live.width, heightRatio: est.box.height / live.height })
      }
      return out
    })
    console.log('estimate vs live', JSON.stringify(report))
    for (const r of report) {
      expect(r.measured).toBe(false)
      expect(r.widthRatio).toBeGreaterThan(0.4)
      expect(r.widthRatio).toBeLessThan(2.5)
    }
  })

  test('cost of measuring after a commit on a drawing with many texts', async ({ page }) => {
    const ms = await page.evaluate(async () => {
      const canvas = window.svgEditor.svgCanvas
      const texts = Array.from({ length: 2000 }, (_, i) => `<text id="t${i}" x="${(i % 40) * 20}" y="${Math.floor(i / 40) * 12 + 12}" font-size="10">T${i}</text>`).join('')
      canvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><g class="layer"><title>L</title>${texts}</g></svg>`)
      const t0 = performance.now()
      canvas.selectOnly([document.getElementById('t0')])
      canvas.changeSelectedAttribute('fill', '#ff0000') // one text changes: only its box is measured
      const edit = performance.now() - t0
      canvas.snapshotHistory.textMetrics.clear()
      const t1 = performance.now()
      canvas.changeSelectedAttribute('fill', '#00ff00') // everything is a miss
      const cold = performance.now() - t1
      const remeasured = canvas.snapshotHistory.textBounds('t1999').measured
      return { edit, cold, remeasured }
    })
    console.log('measure cost (2000 texts)', JSON.stringify(ms))
    expect(ms.remeasured).toBe(true)
    expect(ms.edit).toBeLessThan(1500)
  })
})
