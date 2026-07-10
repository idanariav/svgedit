import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

test.describe('Text tools', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    // The right side panel (design/text/effects/layers tabs, incl. #tool_bold
    // / #tool_italic) is collapsed by default (curConfig.showlayers: false).
    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.waitFor({ state: 'visible' })
    await panelHandle.click()
  })

  test('creates and styles text', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <text id="svg_1" x="200" y="200">AB</text>
      </g>
    </svg>`)

    const firstText = page.locator('#svgcontent #svg_1')
    await expect(firstText).toBeVisible()

    await firstText.click()
    await page.locator('#tool_clone').click()
    await expect(page.locator('#svgcontent #svg_2')).toBeVisible()

    await firstText.click()
    await page.locator('#tool_bold').click()
    await page.locator('#tool_italic').click()
  })
})
