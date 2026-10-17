import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The selection overlay (and the rubber band + its hit-test) lives in svgroot space, offset by #svgcontent's x/y.
// `clear()` rebuilds the group; it must keep that offset, or the drag rectangle lands left of the cursor.

test('the drag rectangle follows the cursor after the document was cleared', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor.configObj.pref('tabletMode', false, true)
    document.querySelector('.svg_editor').classList.remove('ui-tablet')
    window.svgEditor.svgCanvas.clear()
  })
  await page.waitForTimeout(400)
  const box = await page.locator('#workarea').boundingBox()
  const a = { x: box.x + box.width / 2 - 75, y: box.y + box.height / 2 - 50 }
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 150, a.y + 100, { steps: 5 })
  const r = await page.evaluate(() => {
    const q = document.querySelector('#selectorParentGroup rect[id*=rubber], #selectorRubberBand')?.getBoundingClientRect()
    return q && [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]
  })
  await page.mouse.up()
  expect(r).toEqual([Math.round(a.x), Math.round(a.y), 150, 100])
})
