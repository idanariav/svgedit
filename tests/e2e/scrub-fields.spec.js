import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Real mouse drags on a numeric field's label in the side panel: the canvas follows the
// drag live, the whole drag is ONE undo step, Escape puts everything back.
test.describe('Scrubby labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title><rect id="r" x="40" y="40" width="120" height="80" fill="#cc3333"/></g>
    </svg>`)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r')], true))
  })

  const label = (page) => page.locator('#rect_width .top-label')
  const width = (page) => page.evaluate(() => document.getElementById('r').getAttribute('width'))
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const grab = async (page) => {
    const box = await label(page).boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    return { x, y }
  }

  test('dragging the label changes the shape live and is one undo step', async ({ page }) => {
    const before = await undoSize(page)
    const { x, y } = await grab(page)
    await page.mouse.move(x + 10, y, { steps: 5 })
    await page.mouse.move(x + 20, y, { steps: 5 })
    expect(await width(page)).toBe('130') // live, before the button is released
    await page.mouse.up()
    expect(await width(page)).toBe('130')
    expect(await undoSize(page)).toBe(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await width(page)).toBe('120')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await width(page)).toBe('130')
  })

  test('Shift drags in tens', async ({ page }) => {
    const { x, y } = await grab(page)
    await page.keyboard.down('Shift')
    await page.mouse.move(x + 10, y, { steps: 5 })
    await page.keyboard.up('Shift')
    await page.mouse.up()
    expect(await width(page)).toBe('170') // 10 px = 5 steps of 10
  })

  test('Escape during the drag restores the value and leaves no undo step', async ({ page }) => {
    const before = await undoSize(page)
    const { x, y } = await grab(page)
    await page.mouse.move(x + 30, y, { steps: 6 })
    expect(await width(page)).toBe('135')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await width(page)).toBe('120')
    expect(await page.locator('#rect_width input').inputValue()).toBe('120')
    expect(await undoSize(page)).toBe(before)
  })

  test('a plain click on the label focuses the field and changes nothing', async ({ page }) => {
    await label(page).click()
    expect(await width(page)).toBe('120')
    expect(await page.evaluate(() => document.querySelector('#rect_width').shadowRoot.activeElement?.tagName)).toBe('INPUT')
  })

  test('the preference turns scrubbing off', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.configObj.pref('scrub_numeric_fields', false, true))
    const { x, y } = await grab(page)
    await page.mouse.move(x + 20, y, { steps: 5 })
    await page.mouse.up()
    expect(await width(page)).toBe('120')
  })
})
