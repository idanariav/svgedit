import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// A bundled extension that defines a method no one dispatches (a typo, or a document event written as a hook, like
// `modeChange`) silently never runs. The canvas warns at load; the warning must stay absent.
test('no bundled extension defines a method that is not a known hook', async ({ page }) => {
  const warnings = []
  page.on('console', (msg) => { if (msg.text().includes('which is not a known hook')) warnings.push(msg.text()) })
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor?.svgCanvas && Object.keys(window.svgEditor.svgCanvas.extensions ?? {}).length > 0)
  expect(warnings).toEqual([])
})
