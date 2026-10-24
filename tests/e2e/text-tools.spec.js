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

  test('the Text tool edits an existing text instead of placing a new one on it', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <text id="svg_1" x="200" y="200" font-size="40">AB</text>
      </g>
    </svg>`)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('text'))
    await page.locator('#svgcontent #svg_1').click()
    const after = await page.evaluate(() => ({
      mode: window.svgEditor.svgCanvas.getMode(),
      selected: window.svgEditor.svgCanvas.getSelectedElements()[0]?.id,
      texts: document.querySelectorAll('#svgcontent text').length
    }))
    expect(after).toEqual({ mode: 'textedit', selected: 'svg_1', texts: 1 })
    await page.keyboard.press('End')
    await page.keyboard.type('C')
    await page.keyboard.press('Enter')
    await expect(page.locator('#svgcontent #svg_1')).toHaveText('ABC')
  })
})
