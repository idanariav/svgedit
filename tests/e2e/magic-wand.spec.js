import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Magic Wand: a click selects every shape that shares the criterion with the one clicked; Shift adds, Alt subtracts,
// empty canvas clears. Selecting is not an edit, so no undo step is recorded.
test.describe('Magic Wand', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      window.svgEditor.configObj.pref('select_same_tolerance', 0, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="red1" x="20" y="20" width="40" height="40" fill="#cc3333"/>
        <circle id="red2" cx="120" cy="40" r="20" fill="#cc3333"/>
        <rect id="blue1" x="180" y="20" width="40" height="40" fill="#336699"/>
        <rect id="blue2" x="240" y="20" width="40" height="40" fill="#346a9b"/>
        <rect id="green" x="300" y="20" width="40" height="40" fill="#33aa33" stroke="#000000" stroke-width="4"/>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_wand'))
  const click = (page, x, y, mods) => page.evaluate((a) => window.svgEditor.automation.pointer([{ kind: 'click', x: a.x, y: a.y, mods: a.mods }]), { x, y, mods })
  const selectedIds = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id).sort())
  const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
  // Through the options bar's own control, as a user would (it also re-reads which options are visible).
  const setOption = (page, id, value) => page.evaluate((a) => {
    const el = document.querySelector(`#tool_options_panel [data-option="${a.id}"]`)
    el.value = a.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, { id, value })

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_wand').click())
    expect(await mode(page)).toBe('wand')
    expect(await page.evaluate(() => window.svgEditor.workarea.style.cursor)).toContain('url(')
  })

  test('a click selects every shape with the same fill, whatever its type', async ({ page }) => {
    await tool(page)
    await click(page, 40, 40)
    expect(await selectedIds(page)).toEqual(['red1', 'red2'])
    expect(await mode(page)).toBe('wand')
  })

  test('a second plain click replaces the selection', async ({ page }) => {
    await tool(page)
    await click(page, 40, 40)
    await click(page, 200, 40)
    expect(await selectedIds(page)).toEqual(['blue1'])
  })

  test('Shift adds what the click finds, Alt takes it out', async ({ page }) => {
    await tool(page)
    await click(page, 40, 40)
    await click(page, 200, 40, { shift: true })
    expect(await selectedIds(page)).toEqual(['blue1', 'red1', 'red2'])
    await click(page, 120, 40, { alt: true })
    expect(await selectedIds(page)).toEqual(['blue1'])
  })

  test('a click on empty canvas clears the selection, a Shift-click on it keeps it', async ({ page }) => {
    await tool(page)
    await click(page, 40, 40)
    await click(page, 400, 300, { shift: true })
    expect(await selectedIds(page)).toEqual(['red1', 'red2'])
    await click(page, 400, 300)
    expect(await selectedIds(page)).toEqual([])
  })

  test('the tolerance (the Select Same preference) widens a colour match', async ({ page }) => {
    await tool(page)
    await click(page, 200, 40)
    expect(await selectedIds(page)).toEqual(['blue1'])
    await setOption(page, 'tolerance', 3)
    expect(await page.evaluate(() => window.svgEditor.configObj.pref('select_same_tolerance'))).toBe(3)
    await click(page, 200, 40)
    expect(await selectedIds(page)).toEqual(['blue1', 'blue2'])
  })

  test('the criterion is chosen on the options bar', async ({ page }) => {
    await tool(page)
    await expect(page.locator('#tool_options_panel')).toBeVisible()
    await setOption(page, 'criterion', 'strokeweight')
    // No colour criterion any more: the tolerance field is hidden.
    await expect(page.locator('#tool_options_panel [data-option="tolerance"]')).toHaveCount(0)
    await click(page, 40, 40)
    // red1, red2, blue1, blue2 have no stroke (weight 0); green is 4 wide.
    expect(await selectedIds(page)).toEqual(['blue1', 'blue2', 'red1', 'red2'])
    await setOption(page, 'criterion', 'type')
    await click(page, 120, 40)
    expect(await selectedIds(page)).toEqual(['red2'])
  })

  test('selecting records no undo step', async ({ page }) => {
    await tool(page)
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
    await click(page, 40, 40)
    await click(page, 200, 40, { shift: true })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(before)
  })
})
