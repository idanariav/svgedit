import { test as base, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Playwright fixture that captures Istanbul coverage from instrumented builds.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page)

    // Drawing invariants (core/drawing-invariants.js): after every passing
    // test, the drawing in the page must still be structurally healthy. A test
    // that deliberately leaves a corrupt drawing behind opts out with
    //   test.info().annotations.push({ type: 'allow-corrupt-drawing', description: 'why' })
    if (testInfo.status === 'passed' && !testInfo.annotations.some((a) => a.type === 'allow-corrupt-drawing')) {
      // Only "page closed / not an editor page" may skip the check; an editor
      // page whose checker is missing or throws must fail, not pass silently.
      const result = await page
        .evaluate(() => {
          const canvas = window.svgEditor?.svgCanvas
          if (!canvas) return { editor: false, findings: [] }
          return { editor: true, findings: canvas.checkDrawing() }
        })
        .catch((err) => (page.isClosed() ? { editor: false, findings: [] } : { editor: true, findings: [{ code: 'check-failed', message: String(err) }] }))
      const findings = result.findings
      expect(findings, `drawing invariants violated after "${testInfo.title}"`).toEqual([])
    }

    const coverage = await page.evaluate(() => globalThis.__coverage__ || null)
    if (!coverage) return

    const nycDir = path.join(process.cwd(), '.nyc_output')
    fs.mkdirSync(nycDir, { recursive: true })
    const slug = testInfo.title.replace(/[^\w-]+/g, '_')
    const file = path.join(nycDir, `playwright-${slug}.json`)
    fs.writeFileSync(file, JSON.stringify(coverage))
  }
})

export { expect }
