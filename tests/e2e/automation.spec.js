import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, clickCanvas, dragInDocument } from './helpers.js'

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="60" height="60" fill="#00aa00"/>
  </g>
</svg>`

test.describe('automation API', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(async (doc) => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      await window.svgEditor.loadFromString(doc)
    }, DOC)
  })

  const drawRect = (page, from, to) => page.evaluate((a) => {
    window.svgEditor.svgCanvas.setMode('rect')
    window.svgEditor.automation.pointer([{ kind: 'drag', x: a.from.x, y: a.from.y, to: a.to, steps: 6 }])
    const last = [...document.querySelectorAll('#svgcontent g.layer > rect')].at(-1)
    return { id: last.id, x: Number(last.getAttribute('x')), y: Number(last.getAttribute('y')), w: Number(last.getAttribute('width')), h: Number(last.getAttribute('height')) }
  }, { from, to })

  for (const zoom of [100, 200]) {
    test(`a document-space drag draws a rect at the requested place at ${zoom}% zoom`, async ({ page }) => {
      await page.evaluate((z) => window.svgEditor.bottomPanel.changeZoom(z), zoom)
      const rect = await drawRect(page, { x: 300, y: 200 }, { x: 380, y: 260 })
      expect(rect.x).toBeCloseTo(300, 0)
      expect(rect.y).toBeCloseTo(200, 0)
      expect(rect.w).toBeCloseTo(80, 0)
      expect(rect.h).toBeCloseTo(60, 0)
    })
  }

  test('a point scrolled out of view is brought into view first', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.bottomPanel.changeZoom(400))
    const rect = await drawRect(page, { x: 600, y: 440 }, { x: 630, y: 470 })
    expect(rect.x).toBeCloseTo(600, 0)
    expect(rect.y).toBeCloseTo(440, 0)
  })

  test('inspect() reflects selection, mode and the undo stack', async ({ page }) => {
    const before = await page.evaluate(() => window.svgEditor.automation.inspect())
    expect(before).toMatchObject({ mode: 'select', selection: [], undo: { size: 0, redo: 0 }, openDialog: null })
    expect(before.layers).toMatchObject([{ name: 'Layer 1', current: true, childCount: 1 }])
    expect(before.canvas).toEqual({ width: 640, height: 480 })

    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 80, y: 80 }]))
    const selected = await page.evaluate(() => window.svgEditor.automation.inspect())
    expect(selected.selection).toHaveLength(1)
    expect(selected.selection[0]).toMatchObject({ id: 'a', tag: 'rect' })
    expect(selected.selection[0].bbox.x).toBeCloseTo(50, 0)
    expect(selected.selection[0].bbox.width).toBeGreaterThanOrEqual(60)

    await page.evaluate(() => window.svgEditor.automation.key('mod+d'))
    const after = await page.evaluate(() => window.svgEditor.automation.inspect())
    expect(after.undo.size).toBe(1)
    expect(after.layers[0].childCount).toBe(2)
  })

  test('key() goes through the hotkey path and reports consumption', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')]))
    const r = await page.evaluate(() => {
      const ed = window.svgEditor
      const before = document.querySelectorAll('#svgcontent rect').length
      ed.automation.key('d') // Duplicate
      const dup = document.querySelectorAll('#svgcontent rect').length
      ed.automation.key('mod+z')
      return { before, dup, undone: document.querySelectorAll('#svgcontent rect').length }
    })
    expect(r).toEqual({ before: 1, dup: 2, undone: 1 })
  })

  test('automation.commands is the editor command registry', async ({ page }) => {
    expect(await page.evaluate(() => window.svgEditor.automation.commands === window.svgEditor.commands)).toBe(true)
  })

  test('the e2e helpers built on it work: clickCanvas, dragInDocument', async ({ page }) => {
    await clickCanvas(page, { x: 400, y: 300 }) // empty area: nothing selected
    expect(await page.evaluate(() => window.svgEditor.automation.inspect().selection)).toEqual([])
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('rect'))
    await dragInDocument(page, { x: 200, y: 200 }, { x: 260, y: 240 })
    await expect(page.locator('#svgcontent g.layer > rect')).toHaveCount(2)
  })
})
