import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The panel / menu buttons are views of registry commands (`command="<id>"`,
// panelCommands.js): clicking the real button must still do what it always did,
// and the hotkey / commands.run paths must reach the same code.

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="60" height="60" fill="#00aa00" stroke="#000"/>
    <path id="tri" d="M200 50 L300 50 L200 150 Z" fill="#aa0000"/>
  </g>
</svg>`

test.describe('panel buttons are views of commands', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(async (doc) => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      await window.svgEditor.loadFromString(doc)
    }, DOC)
  })

  const clickButton = (page, id) => page.evaluate((i) => {
    const el = window.svgEditor.$id(i)
    el.click()
    return el.getAttribute('command')
  }, id)

  test('tool buttons switch the mode and the pressed state', async ({ page }) => {
    expect(await clickButton(page, 'tool_rect')).toBe('tool_rect')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('rect')
    expect(await page.evaluate(() => window.svgEditor.$id('tool_rect').pressed)).toBe(true)
    await clickButton(page, 'tool_select')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
  })

  test('Convert to path and Flip run from the real buttons', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')]))
    await clickButton(page, 'tool_topath')
    expect(await page.evaluate(() => document.getElementById('a').tagName)).toBe('path')
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('tri')]))
    const shape = () => page.evaluate(() => { const e = document.getElementById('tri'); return `${e.getAttribute('d')}|${e.getAttribute('transform')}` })
    const before = await shape()
    await clickButton(page, 'tool_flip_h')
    expect(await shape()).not.toBe(before)
  })

  test('the same command runs from commands.run, with the enablement the button had', async ({ page }) => {
    // no path editor open: node commands are refused instead of throwing inside a listener
    const disabled = await page.evaluate(() => window.svgEditor.commands.isEnabled('tool_node_clone'))
    expect(disabled).not.toBe(true)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')]))
    await page.evaluate(() => window.svgEditor.commands.run('tool_topath'))
    expect(await page.evaluate(() => document.getElementById('a').tagName)).toBe('path')
  })

  test('main-menu entries open their dialogs', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.$id('tool_hotkeys').click())
    expect(await page.evaluate(() => window.svgEditor.$id('se-hotkey-dialog').getAttribute('dialog'))).toBe('open')
    await page.evaluate(() => window.svgEditor.$id('se-hotkey-dialog').setAttribute('dialog', 'close'))
  })
})
