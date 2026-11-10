import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Escape leaves every tool, a double press of a tool's key locks it, and the hint pills of Blend, Shaper and Shape builder.

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="100" height="100" fill="#d22"/>
    <rect id="b" x="350" y="50" width="100" height="100" fill="#22d"/>
  </g>
</svg>`

test.describe('tool escape, lock keys and hints', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(async (doc) => {
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      await window.svgEditor.loadFromString(doc)
    }, DOC)
  })

  const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
  const visible = (page, id) => page.evaluate((i) => document.getElementById(i)?.classList.contains('visible') ?? false, id)

  test('Escape returns the extension tools to Select', async ({ page }) => {
    for (const id of ['tool_smooth', 'tool_shaper', 'tool_blend', 'tool_brush', 'tool_width', 'tool_corners']) {
      await page.evaluate((i) => window.svgEditor.commands.run(i), id)
      expect(await mode(page), id).not.toBe('select')
      await page.evaluate(() => window.svgEditor.automation.key('escape'))
      expect(await mode(page), id).toBe('select')
    }
  })

  test('pressing a tool key twice locks the tool; once does not', async ({ page }) => {
    const locked = () => page.evaluate(() => window.svgEditor.svgCanvas.getToolLocked())
    await page.evaluate(() => window.svgEditor.automation.key('p'))
    expect(await mode(page)).toBe('path')
    expect(await locked()).toBe(false)
    await page.evaluate(() => window.svgEditor.automation.key('escape'))
    await page.evaluate(() => { window.svgEditor.automation.key('p'); window.svgEditor.automation.key('p') })
    expect(await mode(page)).toBe('path')
    expect(await locked()).toBe(true)
    expect(await page.evaluate(() => document.querySelector('#tool_path').hasAttribute('locked'))).toBe(true)
  })

  test('Blend shows how to use it and marks the picked shape', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_blend'))
    expect(await visible(page, 'blend_hint')).toBe(true)
    const status = () => page.evaluate(() => document.querySelector('#blend_hint .tool-hint-status').textContent)
    expect(await status()).toBe('')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 100, y: 100 }]))
    expect(await status()).toBe('1 picked')
    // the picked marker (filled) is in the tool overlay
    expect(await page.evaluate(() => [...document.querySelectorAll('rect[pointer-events="none"]')].some(r => r.getAttribute('fill') !== 'none'))).toBe(true)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 400, y: 100 }]))
    expect(await status()).toBe('')
    await page.evaluate(() => window.svgEditor.automation.key('escape'))
    expect(await visible(page, 'blend_hint')).toBe(false)
  })

  test('Shaper shows its hint while active; Done leaves it', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_shaper'))
    expect(await visible(page, 'shaper_hint')).toBe(true)
    await page.evaluate(() => document.querySelector('#shaper_hint .tool-hint-done').click())
    expect(await mode(page)).toBe('select')
    expect(await visible(page, 'shaper_hint')).toBe(false)
  })
})
