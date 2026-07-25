import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Regression coverage for the gap noted in .claude/techdebt.md item 7: unit
// tests mock the DOM they already know about and can't catch a selection ->
// right-panel wiring regression (e.g. 26b91862, a stale id that silently
// broke selectedChanged()). This drives selection through the real canvas
// and asserts the right panel's fields actually reflect the selected shape.

const readSpinValue = (id) =>
  document.getElementById(id).shadowRoot.querySelector('.num-input').value

test.describe('Right panel selection sync', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.waitFor({ state: 'visible' })
    await panelHandle.click()
  })

  test('selecting a rect updates the right panel x/y/width/height fields', async ({ page }) => {
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const rect = canv.addSVGElementsFromJson({
        element: 'rect',
        curStyles: true,
        attr: { x: 12, y: 34, width: 150, height: 75, id: canv.getNextId() }
      })
      canv.selectOnly([rect], true)
    })

    await page.waitForSelector('#rect_width', { state: 'visible' })

    expect(await page.evaluate(readSpinValue, 'selected_x')).toBe('12')
    expect(await page.evaluate(readSpinValue, 'selected_y')).toBe('34')
    expect(await page.evaluate(readSpinValue, 'rect_width')).toBe('150')
    expect(await page.evaluate(readSpinValue, 'rect_height')).toBe('75')
  })

  test('selecting a different rect re-syncs the right panel fields (not stale from prior selection)', async ({ page }) => {
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const first = canv.addSVGElementsFromJson({
        element: 'rect',
        curStyles: true,
        attr: { x: 12, y: 34, width: 150, height: 75, id: canv.getNextId() }
      })
      canv.selectOnly([first], true)
    })
    await page.waitForSelector('#rect_width', { state: 'visible' })
    expect(await page.evaluate(readSpinValue, 'rect_width')).toBe('150')

    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const second = canv.addSVGElementsFromJson({
        element: 'rect',
        curStyles: true,
        attr: { x: 60, y: 80, width: 40, height: 20, id: canv.getNextId() }
      })
      canv.selectOnly([second], true)
    })

    await expect.poll(() => page.evaluate(readSpinValue, 'rect_width')).toBe('40')
    expect(await page.evaluate(readSpinValue, 'rect_height')).toBe('20')
    expect(await page.evaluate(readSpinValue, 'selected_x')).toBe('60')
    expect(await page.evaluate(readSpinValue, 'selected_y')).toBe('80')
  })
})
