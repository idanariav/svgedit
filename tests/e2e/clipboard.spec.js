import { test, expect } from './fixtures.js'
import { clickCanvas, setSvgSource, visitAndApproveStorage } from './helpers.js'

const SAMPLE_SVG = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
   <g class="layer">
    <title>Layer 1</title>
    <circle cx="100" cy="100" r="50" fill="#FF0000" id="testCircle" stroke="#000000" stroke-width="5"/>
   </g>
  </svg>`

// Paste keeps the copied element's own id prefix (e.g. "testCircle" ->
// "testCircle2") rather than the generic "svg_N" pattern, and the sample
// document's own <g class="layer"> is auto-assigned "svg_1" on load — so
// pasted ids can't be hardcoded. Diff the id set instead of guessing them.
const contentIds = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('#svgcontent [id]')).map((e) => e.id)
)

test.describe('Clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, SAMPLE_SVG)
    await expect(page.locator('#testCircle')).toBeVisible()
  })

  test('copy, paste, cut and delete shapes', async ({ page }) => {
    const initialIds = await contentIds(page)

    // Right-click on an *unselected* element only opens the context menu for
    // whatever is already selected (so the menu can act on a multi-selection
    // without disturbing it) — a plain left-click is required first to select
    // the intended target. See event.js's `keepSelectionForRightClick`.
    await page.locator('#testCircle').click()
    await page.locator('#testCircle').click({ button: 'right' })
    await page.locator('#cmenu_canvas a[href="#copy"]').click()

    await clickCanvas(page, { x: 200, y: 200 })
    await page.locator('#svgroot').click({ position: { x: 200, y: 200 }, button: 'right' })
    await page.locator('#cmenu_canvas a[href="#paste"]').click()

    let ids = await contentIds(page)
    const firstPasteId = ids.find((id) => !initialIds.includes(id))
    expect(firstPasteId).toBeTruthy()
    await expect(page.locator(`#svgcontent #${firstPasteId}`)).toBeVisible()
    await expect(page.locator('#testCircle')).toBeVisible()

    await page.locator('#testCircle').click()
    await page.locator('#testCircle').click({ button: 'right' })
    await page.locator('#cmenu_canvas a[href="#cut"]').click()
    await expect(page.locator('#testCircle')).toHaveCount(0)
    await expect(page.locator(`#svgcontent #${firstPasteId}`)).toBeVisible()

    await page.locator('#svgroot').click({ position: { x: 240, y: 240 }, button: 'right' })
    await page.locator('#cmenu_canvas a[href="#paste"]').click()

    ids = await contentIds(page)
    const secondPasteId = ids.find((id) => id !== firstPasteId && !initialIds.includes(id))
    expect(secondPasteId).toBeTruthy()
    await expect(page.locator(`#svgcontent #${secondPasteId}`)).toBeVisible()

    await page.locator(`#svgcontent #${secondPasteId}`).click()
    await page.locator(`#svgcontent #${secondPasteId}`).click({ button: 'right' })
    await page.locator('#cmenu_canvas a[href="#delete_selected"]').click()
    await page.locator(`#svgcontent #${firstPasteId}`).click()
    await page.locator(`#svgcontent #${firstPasteId}`).click({ button: 'right' })
    await page.locator('#cmenu_canvas a[href="#delete_selected"]').click()
    await expect(page.locator(`#svgcontent #${firstPasteId}`)).toHaveCount(0)
    await expect(page.locator(`#svgcontent #${secondPasteId}`)).toHaveCount(0)
  })
})
