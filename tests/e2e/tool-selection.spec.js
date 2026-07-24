import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

test.describe('Tool selection', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('rectangle tool toggles pressed state', async ({ page }) => {
    const rectTool = page.locator('#tools_shapes')
    await expect(rectTool).not.toHaveAttribute('pressed', /./)
    await rectTool.click()
    await expect(rectTool).toHaveAttribute('pressed', /./)
  })
})
