import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The tablet shell's Fill / Stroke popovers show the user's own palette (the bottom panel's <se-palette>, hidden in
// tablet mode), customised swatches included, and apply a swatch as the palette does.
test.describe('Tablet shell colours', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('uiMode', 'tablet', true)
      localStorage.setItem('svg-edit-custom-palette', JSON.stringify({ 1: '#abcdef', removed: [2] }))
    })
    await page.reload()
    await page.waitForSelector('#ts_toolgroup .tbtn', { state: 'attached' })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const el = canv.addSVGElementsFromJson({
        element: 'rect', curStyles: true, attr: { x: 100, y: 100, width: 150, height: 100, id: canv.getNextId() }
      })
      canv.selectOnly([el])
    })
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('svg-edit-custom-palette'))
  })

  const fillSwatch = (page) => page.locator('#ts_sheet_row .sheet-col').filter({ hasText: 'Fill' }).locator('.swatch')

  test('the Fill popover lists the custom palette and applies a custom swatch', async ({ page }) => {
    await fillSwatch(page).click()
    const swatches = page.locator('.ts-pop .swrow .swatch')
    const count = await page.evaluate(() => document.querySelector('#palette').entries().length)
    await expect(swatches).toHaveCount(count) // the removed swatch is left out
    await swatches.nth(1).click()
    const fill = await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()[0].getAttribute('fill'))
    expect(fill).toBe('#abcdef')
    // The hidden desktop picker follows, so "More…" opens on the colour just picked.
    const picker = await page.evaluate(() => document.querySelector('#fill_color').paintBox.paint.solidColor)
    expect(picker).toBe('abcdef')
  })

  test('the popover stays inside the shell', async ({ page }) => {
    await fillSwatch(page).click()
    const [pop, shell] = await page.evaluate(() => [
      document.querySelector('.ts-pop').getBoundingClientRect().toJSON(),
      document.querySelector('.tablet-shell').getBoundingClientRect().toJSON()
    ])
    expect(pop.top).toBeGreaterThanOrEqual(shell.top)
    expect(pop.bottom).toBeLessThanOrEqual(shell.bottom)
  })
})
