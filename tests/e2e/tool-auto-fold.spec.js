import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const desktop = async (page, width, height) => {
  await page.setViewportSize({ width, height })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor.configObj.pref('uiMode', 'desktop', true)
    document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
  })
}

const state = (page) => page.evaluate(() => {
  const col = document.querySelector('#tools_left')
  return {
    folded: [...document.querySelectorAll('[data-auto-folded]')].map((e) => e.id),
    fits: col.scrollHeight <= col.clientHeight + 1,
    inOverflow: [...document.querySelector('#tools_overflow').children].map((e) => e.id),
    saved: localStorage.getItem('svg-edit-tool-order')
  }
})

test.describe('Left column folds into "Additional tools" in a short pane', () => {
  test('a short pane folds the last tools, a tall one shows them all, and the saved order never changes', async ({ page }) => {
    await desktop(page, 1440, 1400)
    await expect.poll(async () => (await state(page)).folded.length).toBe(0)
    const tall = await state(page)

    await page.setViewportSize({ width: 1440, height: 520 })
    await expect.poll(async () => (await state(page)).folded.length).toBeGreaterThan(0)
    const short = await state(page)
    expect(short.fits).toBe(true)
    // the folded tools are reachable in the drawer and their order is not saved as the user's
    for (const id of short.folded) expect(short.inOverflow).toContain(id)
    expect(short.saved).toBe(tall.saved)

    await page.setViewportSize({ width: 1440, height: 1400 })
    await expect.poll(async () => (await state(page)).folded.length).toBe(0)
    const back = await state(page)
    expect(back.inOverflow).toEqual(tall.inOverflow)
    expect(back.saved).toBe(tall.saved)
  })

  test('a folded tool still works from the drawer', async ({ page }) => {
    await desktop(page, 1440, 520)
    await expect.poll(async () => (await state(page)).folded.length).toBeGreaterThan(0)
    const id = (await state(page)).folded[0]
    await page.evaluate((toolId) => document.getElementById(toolId).click(), id)
    // clicking a folded tool does not throw and leaves the editor responsive
    expect(await page.evaluate(() => typeof window.svgEditor.svgCanvas.getMode())).toBe('string')
  })
})
