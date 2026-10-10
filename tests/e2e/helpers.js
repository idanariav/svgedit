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

/**
 * Click at a point given relative to #svgroot's top-left corner, in screen px.
 * Driven through the editor's automation API (src/editor/automation.js) rather
 * than raw page.mouse, so it works at any viewport size.
 */
export async function clickCanvas (page, point) {
  await page.evaluate(({ x, y }) => {
    const root = window.svgEditor.$id('svgroot').getBoundingClientRect()
    window.svgEditor.automation.pointer([{ kind: 'click', x: root.left + x, y: root.top + y, space: 'screen' }])
  }, point)
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

/**
 * Drag between two points given relative to #svgroot's top-left corner (screen px),
 * through the automation API.
 */
export async function dragOnCanvas (page, start, end, { steps = 10 } = {}) {
  await page.evaluate((args) => {
    const root = window.svgEditor.$id('svgroot').getBoundingClientRect()
    window.svgEditor.automation.pointer([{
      kind: 'drag',
      x: root.left + args.start.x,
      y: root.top + args.start.y,
      to: { x: root.left + args.end.x, y: root.top + args.end.y },
      steps: args.steps,
      space: 'screen'
    }])
  }, { start, end, steps })
}

/** Drag between two points in document units (any zoom/scroll), through the automation API. */
export async function dragInDocument (page, from, to, { steps = 10, mods } = {}) {
  await page.evaluate((args) => {
    window.svgEditor.automation.pointer([{ kind: 'drag', x: args.from.x, y: args.from.y, to: args.to, steps: args.steps, mods: args.mods, space: 'doc' }])
  }, { from, to, steps, mods })
}
