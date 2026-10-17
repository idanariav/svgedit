import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Hover tooltips come up quickly (tooltips.js), also on a disabled tool, and the repeat popover
// survives the canvas click that picks its custom centre.

const setup = async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor.configObj.pref('tabletMode', false, true)
    document.querySelector('.svg_editor').classList.remove('ui-tablet')
  })
  await page.waitForTimeout(300)
}

test.describe('tooltips', () => {
  test('a tool shows its name in the bubble well under a second, and keeps its title for the native fallback', async ({ page }) => {
    await setup(page)
    await page.locator('#tool_select').hover()
    const bubble = page.locator('.se-tooltip[data-open]')
    await expect(bubble).toBeVisible({ timeout: 1000 })
    await expect(bubble).not.toBeEmpty()
    await page.mouse.move(700, 450)
    await expect(bubble).toHaveCount(0)
    expect(await page.locator('#tool_select').evaluate((el) => !!el.shadowRoot.querySelector('div').getAttribute('title'))).toBe(true)
  })

  test('a disabled tool still explains itself', async ({ page }) => {
    await setup(page)
    await page.evaluate(() => {
      const el = document.querySelector('#tool_select')
      el.setAttribute('disabled-reason', 'Not available right now')
      el.disabled = true
    })
    await page.locator('#tool_select').hover({ force: true })
    await expect(page.locator('.se-tooltip[data-open]')).toContainText('Not available right now', { timeout: 1000 })
  })
})

test.describe('repeat centre pick', () => {
  test('the popover is open again, with the picked centre, after the canvas click', async ({ page }) => {
    await setup(page)
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const el = c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 100, y: 100, width: 60, height: 40, fill: '#ff0000', id: 'r1' } })
      c.selectOnly([el], true)
    })
    await page.waitForTimeout(300)
    await page.locator('#tool_repeat').click()
    await page.locator('#tool_repeat .center-custom').click()
    await page.locator('#tool_repeat .pick-center').click()
    expect(await page.locator('#tool_repeat').evaluate((el) => el.isOpen)).toBe(false)

    const box = await page.locator('#svgroot').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    await expect.poll(() => page.locator('#tool_repeat').evaluate((el) => el.isOpen)).toBe(true)
    await page.waitForTimeout(300)
    expect(await page.locator('#tool_repeat').evaluate((el) => el.isOpen)).toBe(true)
    await expect(page.locator('#tool_repeat .center-readout')).not.toHaveText('not set')
  })
})
