import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Fit dashes: the Dash row's Fit button stretches the selected stroke's dash pattern to a whole number of periods,
// with a dash centred on each end of an open stroke.
test.describe('Fitted dashes', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <path id="curve" d="M50,200 C150,100 250,300 353,200" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="5,5"/>
        <circle id="ring" cx="450" cy="300" r="40" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="6,4"/>
        <rect id="box" x="50" y="320" width="100" height="80" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="5,5"/>
        <line id="plain" x1="50" y1="440" x2="250" y2="440" stroke="#000" stroke-width="3"/>
      </g>
    </svg>`)
  })

  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const attrs = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    const array = (el.getAttribute('stroke-dasharray') || '').split(/[\s,]+/).map(Number)
    return {
      array,
      offset: el.getAttribute('stroke-dashoffset'),
      marker: el.getAttribute('se:dash-fit'),
      length: el.getTotalLength()
    }
  }, id)
  const fitButton = (page) => page.locator('#tool_dash_fit')

  test('fits an open curve: whole periods, a dash centred on each end', async ({ page }) => {
    await select(page, 'curve')
    await expect(fitButton(page)).not.toHaveAttribute('disabled', /.*/)
    const undoBefore = await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
    await fitButton(page).click()
    const a = await attrs(page, 'curve')
    const period = a.array[0] + a.array[1]
    const periods = a.length / period
    expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.005)
    expect(a.marker).toBe('5,5')
    expect(Number(a.offset)).toBeCloseTo(a.array[0] / 2, 3)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(undoBefore + 1)
    await expect(fitButton(page)).toHaveAttribute('pressed', /.*/)
    // Again: back to the pattern as it was.
    await fitButton(page).click()
    const back = await attrs(page, 'curve')
    expect(back.array).toEqual([5, 5])
    expect(back.marker).toBeNull()
    expect(back.offset).toBeNull()
  })

  test('fits a circle to a whole number of periods, starting at the start', async ({ page }) => {
    await select(page, 'ring')
    await fitButton(page).click()
    const a = await attrs(page, 'ring')
    const period = a.array[0] + a.array[1]
    expect(Math.abs(a.length / period - Math.round(a.length / period))).toBeLessThan(0.005)
    expect(a.offset).toBeNull()
  })

  test('choosing another dash style for fitted dashes fits that one', async ({ page }) => {
    await select(page, 'curve')
    await fitButton(page).click()
    await page.evaluate(() => {
      const select = window.svgEditor.$id('stroke_style')
      select.dispatchEvent(new CustomEvent('change', { detail: { value: '2,2' } }))
    })
    const a = await attrs(page, 'curve')
    expect(a.marker).toBe('2,2')
    const period = a.array[0] + a.array[1]
    expect(Math.abs(a.length / period - Math.round(a.length / period))).toBeLessThan(0.005)
  })

  test('is unavailable, with the reason, for a solid stroke and for a shape that is not an outline', async ({ page }) => {
    await select(page, 'plain')
    await expect(fitButton(page)).toHaveAttribute('disabled', /.*/)
    await expect(fitButton(page)).toHaveAttribute('disabled-reason', /dash pattern/)
    expect(await page.evaluate(() => { try { window.svgEditor.commands.run('tool_dash_fit'); return 'ran' } catch (e) { return e.message } })).toMatch(/dash pattern/)
    // a path of several pieces cannot be fitted
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const two = c.addSVGElementsFromJson({ element: 'path', attr: { id: 'two', d: 'M0,0 L50,0 M0,10 L50,10', fill: 'none', stroke: '#000', 'stroke-dasharray': '5,5' } })
      c.selectOnly([two], true)
    })
    await expect(fitButton(page)).toHaveAttribute('disabled-reason', /one piece/)
  })

  test('fits a rectangle round its corners: a dash bent round every corner, the start corner too', async ({ page }) => {
    await select(page, 'box')
    await expect(fitButton(page)).not.toHaveAttribute('disabled', /.*/)
    await fitButton(page).click()
    const fit = await attrs(page, 'box')
    expect(fit.marker).toBe('5,5')
    expect(fit.array.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 2) // the perimeter, 2 × (100 + 80)
    expect(fit.array.length).toBeGreaterThan(2) // one list for the whole outline, not a periodic pattern
  })

  test('the corners of a fitted rectangle are painted, those of the plain dashes are not all', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      for (const [id, x] of [['plain-rect', 50], ['fit-rect', 250]]) {
        c.addSVGElementsFromJson({ element: 'rect', attr: { id, x, y: 50, width: 110, height: 70, fill: 'none', stroke: '#000000', 'stroke-width': 6, 'stroke-dasharray': '14,10' } })
      }
      c.selectOnly([document.getElementById('fit-rect')], true)
      c.setDashFit(true)
      c.clearSelection()
    })
    // the outer corner pixels of each rectangle, from the exported PNG: the miter of a corner only paints when a dash is on it
    const painted = await page.evaluate(async () => {
      const { datauri } = await window.svgEditor.svgCanvas.rasterExport('PNG', 1, 'x', { avoidEvent: true })
      const img = new Image()
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = datauri })
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const at = (x, y) => ctx.getImageData(x, y, 1, 1).data[3] > 0
      const corners = (x) => [[x - 2, 48], [x + 112, 48], [x + 112, 122], [x - 2, 122]].map(([px, py]) => at(px, py))
      return { plain: corners(50), fit: corners(250) }
    })
    expect(painted.fit).toEqual([true, true, true, true])
    expect(painted.plain).toContain(false)
  })

  test('the fit survives save and reload of the drawing', async ({ page }) => {
    await select(page, 'curve')
    await fitButton(page).click()
    const before = await attrs(page, 'curve')
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    await setSvgSource(page, svg)
    const after = await attrs(page, 'curve')
    expect(after.marker).toBe('5,5')
    expect(after.array).toEqual(before.array)
    expect(Number(after.offset)).toBeCloseTo(Number(before.offset), 1) // the loader trims the offset a little
  })
})
