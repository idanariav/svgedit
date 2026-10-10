import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Fit dashes: the Dash row's Fit button stretches the selected stroke's dash pattern to a whole number of periods,
// with a dash centred on each end of an open stroke.
test.describe('Fitted dashes', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
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

  test('is unavailable, with the reason, for a shape with corners and for a solid stroke', async ({ page }) => {
    await select(page, 'box')
    await expect(fitButton(page)).toHaveAttribute('disabled', /.*/)
    await expect(fitButton(page)).toHaveAttribute('disabled-reason', /line, a circle|corners/)
    await select(page, 'plain')
    await expect(fitButton(page)).toHaveAttribute('disabled', /.*/)
    await expect(fitButton(page)).toHaveAttribute('disabled-reason', /dash pattern/)
    expect(await page.evaluate(() => { try { window.svgEditor.commands.run('tool_dash_fit'); return 'ran' } catch (e) { return e.message } })).toMatch(/dash pattern/)
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
