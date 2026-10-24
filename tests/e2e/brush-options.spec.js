import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The Brush tool's settings live in the options bar: saved brushes as a button row, the one in use highlighted.

test('the brush options bar saves, highlights and edits brushes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor.configObj.pref('uiMode', 'desktop', true)
    document.querySelector('.svg_editor').classList.remove('ui-tablet')
    window.svgEditor.commands.run('tool_brush')
  })
  const slots = page.locator('#tool_options_panel .tool-option-choice')
  await expect(slots).toHaveCount(5)
  await expect(slots.nth(0)).toHaveAttribute('data-state', 'empty')

  await slots.nth(0).click() // empty slot: saves the live brush
  await expect(slots.nth(0)).toHaveAttribute('data-state', 'active')
  await expect(slots.nth(0)).toHaveAttribute('aria-pressed', 'true')

  await page.locator('#tool_options_panel [data-option=thickness]').evaluate((el) => {
    el.value = '25'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(slots.nth(0)).toHaveAttribute('data-state', 'modified')
  await page.locator('#tool_options_panel [data-option=update]').click()
  await expect(slots.nth(0)).toHaveAttribute('data-state', 'active')

  await expect(page.locator('#tool_options_panel [data-option=angle]')).toHaveCount(0)
  await page.locator('#tool_options_panel [data-option=more] input').click()
  await expect(page.locator('#tool_options_panel [data-option=angle]')).toHaveCount(1)
})
