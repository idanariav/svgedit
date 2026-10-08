import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The fill/stroke colour picker is a popover anchored to its swatch: no backdrop, a
// click outside applies, Escape cancels, an untouched click-away changes nothing.

const setup = async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor.configObj.pref('tabletMode', false, true)
    document.querySelector('.svg_editor').classList.remove('ui-tablet')
    const c = window.svgEditor.svgCanvas
    const el = c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 100, y: 100, width: 100, height: 80, fill: '#ff0000', id: 'r1' } })
    c.selectOnly([el], true)
  })
  await page.waitForTimeout(300)
}
const fill = (page) => page.evaluate(() => document.querySelector('#r1').getAttribute('fill'))
const open = async (page) => {
  await page.locator('#fill_color').click()
  await page.waitForSelector('se-color-dialog.popover', { state: 'attached' })
}
const pick = (page, hex) => page.evaluate((h) => document.querySelector('se-color-dialog')._currentPanel.setFromHex(h), hex)
const isOpen = (page) => page.evaluate(() => !!document.querySelector('se-color-dialog'))

test.describe('colour popover', () => {
  test('opens beside its swatch without a backdrop, previews live, applies on outside click', async ({ page }) => {
    await setup(page)
    await open(page)
    const geo = await page.evaluate(() => {
      const d = document.querySelector('se-color-dialog')
      const m = d.shadowRoot.querySelector('.cp-modal').getBoundingClientRect()
      const a = document.querySelector('#fill_color').getBoundingClientRect()
      const backdrop = getComputedStyle(d.shadowRoot.querySelector('.cp-backdrop')).display
      return { backdrop, near: Math.abs(m.left - a.left) < 200, notCovering: m.bottom <= a.top || m.top >= a.bottom, inView: m.top >= 0 && m.bottom <= innerHeight }
    })
    expect(geo).toEqual({ backdrop: 'none', near: true, notCovering: true, inView: true })

    await pick(page, '00ff00')
    expect(await fill(page)).toBe('#00ff00') // live preview
    await page.mouse.click(900, 700) // empty canvas area
    await expect.poll(() => isOpen(page)).toBe(false)
    expect(await fill(page)).toBe('#00ff00')

    await page.evaluate(() => document.querySelector('#tool_undo').click())
    await expect.poll(() => fill(page)).toBe('#ff0000') // undo records old -> new
  })

  test('Escape reverts the preview; an untouched click-away changes nothing', async ({ page }) => {
    await setup(page)
    await open(page)
    await pick(page, '0000ff')
    expect(await fill(page)).toBe('#0000ff')
    await page.keyboard.press('Escape')
    await expect.poll(() => isOpen(page)).toBe(false)
    expect(await fill(page)).toBe('#ff0000')

    await open(page)
    await page.mouse.click(900, 700)
    await expect.poll(() => isOpen(page)).toBe(false)
    expect(await fill(page)).toBe('#ff0000')
  })

  test('clicking the swatch again closes (commits) the popover instead of reopening it', async ({ page }) => {
    await setup(page)
    await open(page)
    await pick(page, '112233')
    await page.locator('#fill_color').click()
    await expect.poll(() => isOpen(page)).toBe(false)
    expect(await fill(page)).toBe('#112233')
  })

  test('the touch shell keeps the centred modal', async ({ page }) => {
    await setup(page)
    await page.evaluate(() => { document.querySelector('.svg_editor').classList.add('ui-tablet') })
    await page.evaluate(() => document.querySelector('#fill_color').openColorDialog())
    expect(await page.evaluate(() => document.querySelector('se-color-dialog').classList.contains('popover'))).toBe(false)
  })
})
