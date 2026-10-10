import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Select Same on the real editor: the new criteria and the colour tolerance setting,
// through the registry commands (keyless palette entries) and the Select & Link menu.
test.describe('Select same', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="blue1" x="10" y="10" width="40" height="40" fill="#336699" stroke="#000000" stroke-width="3"/>
        <rect id="blue2" x="60" y="10" width="40" height="40" fill="#346a9b" stroke="#000000" stroke-width="3"/>
        <circle id="blue3" cx="130" cy="30" r="20" fill="#3a78b0" stroke="#222222" stroke-width="1" opacity="0.5"/>
        <rect id="red" x="160" y="10" width="40" height="40" fill="#cc3333"/>
      </g>
    </svg>`)
  })

  const pick = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const selectedIds = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id))
  const run = (page, id) => page.evaluate((i) => window.svgEditor.commands.run(i), id)
  const tolerance = (page, value) => page.evaluate((v) => window.svgEditor.configObj.pref('select_same_tolerance', v, true), value)

  test('tolerance 0 keeps fill matching exact', async ({ page }) => {
    await pick(page, 'blue1')
    await run(page, 'select_same_fill')
    expect(await selectedIds(page)).toEqual(['blue1'])
  })

  test('a tolerance selects similar colours but not a different one', async ({ page }) => {
    await tolerance(page, 3)
    await pick(page, 'blue1')
    await run(page, 'select_same_fill')
    expect((await selectedIds(page)).sort()).toEqual(['blue1', 'blue2'])
    await tolerance(page, 8)
    await pick(page, 'blue1')
    await run(page, 'select_same_fill')
    expect((await selectedIds(page)).sort()).toEqual(['blue1', 'blue2', 'blue3'])
  })

  test('stroke weight, opacity and fill-and-stroke', async ({ page }) => {
    await pick(page, 'blue1')
    await run(page, 'select_same_strokeweight')
    expect((await selectedIds(page)).sort()).toEqual(['blue1', 'blue2'])
    await pick(page, 'blue3')
    await run(page, 'select_same_opacity')
    expect(await selectedIds(page)).toEqual(['blue3'])
    await tolerance(page, 3)
    await pick(page, 'blue1')
    await run(page, 'select_same_fillstroke')
    expect((await selectedIds(page)).sort()).toEqual(['blue1', 'blue2'])
  })

  test('the commands say why they are unavailable without a selection', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    const reason = await page.evaluate(() => window.svgEditor.commands.get('select_same_fill').enabled(window.svgEditor))
    expect(reason).toBe('Select a shape first')
  })

  test('the Select & Link menu lists the new criteria', async ({ page }) => {
    const values = await page.evaluate(() => [...document.querySelectorAll('#tool_select_same se-list-item')].map((i) => i.getAttribute('value')))
    expect(values).toEqual(['fill', 'stroke', 'type', 'fillstroke', 'strokeweight', 'opacity'])
  })
})
