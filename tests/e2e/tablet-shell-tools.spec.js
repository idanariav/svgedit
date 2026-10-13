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

  // The current tool's options bar (panels/toolOptionsBar.js) also fills a strip under the command bar.
  const strip = (page) => page.locator('#ts_tool_options')
  const stripOption = (page, id, value) => page.evaluate((a) => {
    const el = document.querySelector(`#ts_tool_options [data-option="${a.id}"]`)
    el.value = a.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, { id, value })
  const toolOptions = (page) => page.evaluate(() => Object.fromEntries(window.svgEditor.svgCanvas.getToolOptions().map((o) => [o.id, o.value])))
  const runTool = async (page, label) => {
    await bar(page, 'More tools').click()
    await page.locator('.ts-pop .menu-item', { hasText: label }).click()
  }

  test('a tool with options shows them in the strip, and a change reaches the tool', async ({ page }) => {
    await expect(strip(page)).toBeHidden()
    await runTool(page, 'Magic Wand')
    await expect(strip(page)).toBeVisible()
    expect(await strip(page).locator('[data-option]').evaluateAll((els) => els.map((e) => e.dataset.option))).toEqual(['criterion', 'click', 'tolerance'])
    await stripOption(page, 'click', 'add') // the touch stand-in for Shift
    await stripOption(page, 'click', 'replace')
    await stripOption(page, 'criterion', 'stroke')
    expect((await toolOptions(page)).criterion).toBe('stroke')
    // the tolerance only applies to colours: it goes with a non-colour criterion
    await stripOption(page, 'criterion', 'strokeweight')
    await expect(strip(page).locator('[data-option="tolerance"]')).toHaveCount(0)
    await stripOption(page, 'criterion', 'fill')
    await expect(strip(page).locator('[data-option="tolerance"]')).toHaveCount(1)
    await stripOption(page, 'tolerance', 4)
    expect(await page.evaluate(() => window.svgEditor.configObj.pref('select_same_tolerance'))).toBe(4)
  })

  test('the strip follows the tool: Blend has its own options, a tool without any hides it', async ({ page }) => {
    await runTool(page, 'Blend')
    expect(await strip(page).locator('[data-option]').evaluateAll((els) => els.map((e) => e.dataset.option))).toEqual(['mode', 'steps'])
    await runTool(page, 'Measure')
    await expect(strip(page)).toBeHidden()
    await runTool(page, 'Magic Wand')
    await expect(strip(page)).toBeVisible()
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    await expect(strip(page)).toBeHidden()
  })

  test('the strip stays inside the shell at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 700 })
    await runTool(page, 'Blend')
    const r = await page.evaluate(() => {
      const el = document.querySelector('#ts_tool_options').getBoundingClientRect()
      return { left: el.left, right: window.innerWidth - el.right, top: el.top }
    })
    expect(r.left).toBeGreaterThanOrEqual(0)
    expect(r.right).toBeGreaterThanOrEqual(0)
    expect(r.top).toBeGreaterThanOrEqual(62) // below the command bar
  })
})
