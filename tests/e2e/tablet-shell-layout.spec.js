import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The tablet shell stays usable and comfortable: the bottom sheet fits its pane at every width (its columns wrap,
// never run off the edge or over each other) and what a finger hits is big enough.
test.describe('Tablet shell layout', () => {
  const open = async (page, width, height = 800) => {
    await page.setViewportSize({ width, height })
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.configObj.pref('uiMode', 'tablet', true))
    await page.reload()
    await page.waitForSelector('#ts_toolgroup .tbtn', { state: 'attached' })
    await page.waitForTimeout(400)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title>
      <rect id="a" x="80" y="120" width="140" height="90" fill="#e53e3e"/></g></svg>`)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')], true))
    await page.waitForTimeout(450) // the sheet slides in
  }

  for (const width of [1366, 1180, 1024, 960, 820, 768]) {
    test(`the sheet's columns stay inside it and apart from each other at ${width}px`, async ({ page }) => {
      await open(page, width)
      const r = await page.evaluate(() => {
        const sheet = document.querySelector('#ts_sheet').getBoundingClientRect()
        const row = document.querySelector('#ts_sheet_row')
        const cols = [...row.children].filter((c) => c.classList.contains('sheet-col')).map((c) => c.getBoundingClientRect())
        const overlap = []
        cols.forEach((a, i) => cols.slice(i + 1).forEach((b) => {
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap.push([i])
        }))
        const val = [...document.querySelectorAll('#ts_sheet .slider-row .val')].map((v) => v.getBoundingClientRect().right)
        const slider = document.querySelector('#ts_sheet .slider-mini').getBoundingClientRect()
        return {
          scrolls: row.scrollWidth - row.clientWidth,
          inside: cols.every((c) => c.left >= sheet.left && c.right <= sheet.right && c.bottom <= sheet.bottom),
          overlap,
          // the value of a slider ends inside the slider's own box, not in the next column
          valuesInside: val.every((right) => right <= slider.right + 1)
        }
      })
      expect(r.scrolls).toBeLessThanOrEqual(1)
      expect(r.inside).toBe(true)
      expect(r.overlap).toEqual([])
      expect(r.valuesInside).toBe(true)
    })
  }

  test('the sheet sits clear of the command bar and the screen edge', async ({ page }) => {
    await open(page, 768, 600)
    const r = await page.evaluate(() => {
      const sheet = document.querySelector('#ts_sheet').getBoundingClientRect()
      const bar = document.querySelector('.ts-topbar').getBoundingClientRect()
      return { top: sheet.top - bar.bottom, bottom: window.innerHeight - sheet.bottom, left: sheet.left, right: window.innerWidth - sheet.right }
    })
    expect(r.top).toBeGreaterThan(0)
    for (const edge of [r.bottom, r.left, r.right]) expect(edge).toBeGreaterThanOrEqual(8)
  })

  test('sliders are a finger-sized target, and tapping the track away from its centre moves them', async ({ page }) => {
    await open(page, 1180)
    const box = await page.locator('#ts_sheet .te-range').first().boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(32)
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.getStrokeWidth())
    await page.locator('#ts_sheet .te-range').first().click({ position: { x: box.width - 6, y: 5 } }) // near the end, off the track's line
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getStrokeWidth())).toBeGreaterThan(before)
  })

  test('swatches and flyout rows are at least 44px, the options strip too', async ({ page }) => {
    await open(page, 1180)
    const sizes = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) }), sel)
    expect(Math.min(...await sizes('#ts_sheet .swatch'))).toBeGreaterThanOrEqual(44)
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await page.locator('#ts_toolgroup .tbtn[title="More tools"]').click()
    expect(Math.min(...await sizes('.ts-pop .menu-item'))).toBeGreaterThanOrEqual(44)
    await page.locator('.ts-pop .menu-item', { hasText: 'Magic Wand' }).click()
    expect(Math.min(...await sizes('#ts_tool_options se-select, #ts_tool_options se-spin-input'))).toBeGreaterThanOrEqual(44)
  })

  test('Done is on the bar at 1180px, where the zoom row is still shown', async ({ page }) => {
    await open(page, 1180)
    const r = await page.evaluate(() => {
      const done = document.querySelector('.ts-done').getBoundingClientRect()
      return { visible: getComputedStyle(document.querySelector('.ts-done')).display !== 'none', right: done.right, width: window.innerWidth }
    })
    expect(r.visible).toBe(true)
    expect(r.right).toBeLessThanOrEqual(r.width)
  })
})
