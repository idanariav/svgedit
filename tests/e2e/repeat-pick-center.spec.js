import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Repeat's "Pick center" is a registerTool tool: arm it, click the canvas, and the callback gets the point
// after the release while the editor is back in select mode.
test.describe('Repeat: pick a custom centre', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
  })

  test('a click hands over the point and returns to select; Escape does not', async ({ page }) => {
    await page.evaluate(() => {
      window.__picked = null
      window.svgEditor.svgCanvas.armRepeatCenterPick((x, y) => { window.__picked = { x, y } })
    })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('repeat-pick-center')

    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 120, y: 80, space: 'doc' }]))
    await expect.poll(() => page.evaluate(() => window.__picked)).not.toBeNull()
    const picked = await page.evaluate(() => window.__picked)
    expect(picked.x).toBeCloseTo(120, 0)
    expect(picked.y).toBeCloseTo(80, 0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')

    await page.evaluate(() => {
      window.__picked = null
      window.svgEditor.svgCanvas.armRepeatCenterPick((x, y) => { window.__picked = { x, y } })
      window.svgEditor.automation.key('Escape')
    })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    expect(await page.evaluate(() => window.__picked)).toBeNull()
  })
})
