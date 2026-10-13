import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The tablet shell's command bar: the Shapes flyout holds the shape-family tools too, and a "More tools" flyout
// holds the editing tools that have no bar button of their own.
test.describe('Tablet shell tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.configObj.pref('tabletMode', true, true))
    await page.reload()
    await page.waitForSelector('#ts_toolgroup .tbtn', { state: 'attached' })
    await page.waitForTimeout(400)
  })

  const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
  const bar = (page, title) => page.locator(`#ts_toolgroup .tbtn[title="${title}"]`)
  const popItems = (page) => page.locator('.ts-pop .menu-item span:last-child').allTextContents()

  test('More tools lists every editing tool and arms the one tapped', async ({ page }) => {
    await bar(page, 'More tools').click()
    expect(await popItems(page)).toEqual(['Shaper', 'Smooth', 'Width', 'Blend', 'Distort', 'Gradient', 'Corners', 'Measure', 'Magic Wand'])
    await page.locator('.ts-pop .menu-item', { hasText: 'Magic Wand' }).click()
    expect(await mode(page)).toBe('wand')
    await expect(page.locator('.ts-pop')).toHaveCount(0)
    await expect(bar(page, 'More tools')).toHaveClass(/is-active/)
  })

  test('the flyout marks the current tool, and the button goes back to inactive on another tool', async ({ page }) => {
    await bar(page, 'More tools').click()
    await page.locator('.ts-pop .menu-item', { hasText: 'Distort' }).click()
    expect(await mode(page)).toBe('distort')
    await bar(page, 'More tools').click()
    await expect(page.locator('.ts-pop .menu-item.is-active')).toHaveText(/Distort/)
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    await expect(bar(page, 'More tools')).not.toHaveClass(/is-active/)
  })

  test('each tool of the flyout arms its own mode', async ({ page }) => {
    const modes = { Shaper: 'shaper', Smooth: 'smooth', Width: 'width', Blend: 'blend', Distort: 'distort', Gradient: 'gradient', Corners: 'corners', Measure: 'measure', 'Magic Wand': 'wand' }
    for (const [label, expected] of Object.entries(modes)) {
      await bar(page, 'More tools').click()
      await page.locator('.ts-pop .menu-item', { hasText: label }).click()
      expect(await mode(page), label).toBe(expected)
    }
  })

  test('the Shapes flyout has the shape-family tools and arms them', async ({ page }) => {
    await bar(page, 'Shapes').click()
    expect(await page.locator('.ts-pop .ts-grid .tbtn').evaluateAll((els) => els.map((e) => e.title)))
      .toEqual(['Rectangle', 'Square', 'Ellipse', 'Circle', 'Star', 'Polygon', 'Spiral', 'Arc', 'Rectangular grid', 'Polar grid'])
    await page.locator('.ts-pop .ts-grid .tbtn[title="Spiral"]').click()
    expect(await mode(page)).toBe('spiral')
    await expect(bar(page, 'Shapes')).toHaveClass(/is-active/)
  })

  test('the flyouts stay inside the shell', async ({ page }) => {
    for (const title of ['More tools', 'Shapes']) {
      await bar(page, title).click()
      const r = await page.evaluate(() => {
        const pop = document.querySelector('.ts-pop').getBoundingClientRect()
        const shell = document.querySelector('.tablet-shell').getBoundingClientRect()
        return { left: pop.left - shell.left, right: shell.right - pop.right, top: pop.top - shell.top, bottom: shell.bottom - pop.bottom }
      })
      for (const side of Object.values(r)) expect(side, title).toBeGreaterThanOrEqual(0)
      await bar(page, title).click()
    }
  })
})
