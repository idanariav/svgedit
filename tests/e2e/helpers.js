import { expect } from '@playwright/test'

export async function visitAndApproveStorage (page) {
  await page.goto('about:blank')
  await page.context().clearCookies()
  await page.goto('/index.html')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.waitForSelector('#svgroot', { timeout: 20000 })
  await enableGridSnapping(page)
}

export async function enableGridSnapping (page) {
  await page.waitForFunction(() => window.svgEditor && window.svgEditor.setConfig, null, { timeout: 20000 })
  await page.evaluate(() => {
    window.svgEditor.setConfig({
      gridSnapping: true
    })
  })
}

export async function openMainMenu (page) {
  await page.locator('#main_button').click()
}

export async function setSvgSource (page, svgMarkup) {
  // #tool_source was removed in favor of #tool_frame; the source-editor dialog
  // itself (se-svg-editor-dialog) is still present, just opened programmatically.
  await page.evaluate(() => window.svgEditor.topPanel.showSourceEditor())
  const textarea = page.locator('#svg_source_textarea')
  await expect(textarea).toBeVisible()
  await textarea.fill(svgMarkup)
  await page.locator('#tool_source_save').click()
}

export async function clickCanvas (page, point) {
  const canvas = page.locator('#svgroot')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Could not determine canvas bounds')
  }
  await page.mouse.click(box.x + point.x, box.y + point.y)
}

/**
 * Fill and submit the editor's in-DOM text-prompt dialog (se-text-prompt-dialog),
 * the themed replacement for the native `window.prompt()` used by e.g. layer
 * create/rename. Native Playwright `page.once('dialog', ...)` handling does not
 * apply here since this is a custom element, not a browser dialog.
 */
export async function answerTextPrompt (page, value) {
  const dialog = page.locator('se-text-prompt-dialog')
  const input = dialog.locator('#text_prompt_input')
  await input.waitFor({ state: 'visible' })
  await input.fill(value)
  await dialog.locator('#text_prompt_ok').click()
}

export async function dragOnCanvas (page, start, end) {
  const canvas = page.locator('#svgroot')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Could not determine canvas bounds')
  }
  const startX = box.x + start.x
  const startY = box.y + start.y
  const endX = box.x + end.x
  const endY = box.y + end.y

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY)
  await page.mouse.up()
}
