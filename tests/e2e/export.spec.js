import { test, expect } from './fixtures.js'
import { openMainMenu, visitAndApproveStorage } from './helpers.js'

test.describe('Export', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('export button visible in menu', async ({ page }) => {
    await openMainMenu(page)
    await expect(page.locator('#tool_export')).toBeVisible()
  })

  test('export dialog opens', async ({ page }) => {
    await openMainMenu(page)
    await page.locator('#tool_export').click()
    // Scope to the region control specifically: '#export_box select' is ambiguous,
    // it also matches '#se-storage-pref's format select in the same dialog.
    await expect(page.locator('#se-export-region select')).toBeVisible()
  })
})
