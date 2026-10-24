import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The Layers panel is one tab stop: arrows move an active row, Enter / Space select, → ← open and close,
// H / L toggle the eye and the padlock, F2 renames, Alt+↑↓ reorder. Handled keys must not reach the editor's shortcuts.
test.describe('Layers panel keyboard access', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await page.locator('div#sidepanel_handle').first().click()
    await page.click('[data-tab="layers"]')
    await page.waitForSelector('#layer_new', { state: 'visible' })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="a" x="10" y="10" width="20" height="20" fill="#f00"/>
        <g id="grp"><rect id="inner" x="50" y="10" width="20" height="20" fill="#00f"/></g>
      </g>
      <g class="layer"><title>Layer 2</title><ellipse id="e" cx="100" cy="100" rx="20" ry="10" fill="#0a0"/></g>
    </svg>`)
    // rows, top first: Layer 2, e, Layer 1, grp, a
    await expect(page.locator('#layerlist tr.object')).toHaveCount(3)
    await page.locator('#layerlist').focus()
    await page.keyboard.press('Home')
  })

  const active = (page) => page.evaluate(() => {
    const tr = document.querySelector('#layerlist tr.kbfocus')
    return tr ? (tr._el?.id ?? tr.querySelector('td.layername')?.textContent.trim()) : null
  })
  const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id))

  test('the table is a tab stop and the arrows move the active row', async ({ page }) => {
    expect(await active(page)).toBe('Layer 2')
    await page.keyboard.press('ArrowDown')
    expect(await active(page)).toBe('e')
    await page.keyboard.press('ArrowDown')
    expect(await active(page)).toBe('Layer 1')
    await page.keyboard.press('End')
    expect(await active(page)).toBe('a')
    await page.keyboard.press('ArrowUp')
    expect(await active(page)).toBe('grp')
  })

  test('Enter selects an object; the arrows do not also nudge it', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    expect(await selected(page)).toEqual(['e'])
    const before = await page.locator('#e').evaluate((el) => [el.getAttribute('cx'), el.getAttribute('cy'), el.getAttribute('transform')])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    expect(await page.locator('#e').evaluate((el) => [el.getAttribute('cx'), el.getAttribute('cy'), el.getAttribute('transform')])).toEqual(before)
    expect(await selected(page)).toEqual(['e'])
  })

  test('→ opens a group and steps into it, ← closes it or goes to the parent', async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
    expect(await active(page)).toBe('grp')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#layerlist tr.object')).toHaveCount(4)
    await page.keyboard.press('ArrowRight')
    expect(await active(page)).toBe('inner')
    await page.keyboard.press('Enter')
    expect(await selected(page)).toEqual(['inner'])
    await page.keyboard.press('ArrowLeft')
    expect(await active(page)).toBe('grp')
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('#layerlist tr.object')).toHaveCount(3)
  })

  test('H hides and L locks the active row\'s object', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('h')
    await expect(page.locator('#e')).toHaveAttribute('display', 'none')
    await page.keyboard.press('h')
    await expect(page.locator('#e')).not.toHaveAttribute('display', 'none')
    await page.keyboard.press('l')
    await expect(page.locator('#layerlist tr.object.objlockedtree')).toHaveCount(1)
  })

  test('Alt+Arrow moves an object in the stacking order, as one undo step', async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown') // grp
    await page.keyboard.press('Alt+ArrowDown') // lower: behind "a"
    const order = () => page.evaluate(() => [...document.querySelectorAll('#svgcontent g.layer')[0].children].map((e) => e.id).filter(Boolean))
    expect(await order()).toEqual(['grp', 'a'])
    await page.evaluate(() => window.svgEditor.commands.run('tool_undo'))
    expect(await order()).toEqual(['a', 'grp'])
  })

  test('F2 renames the active object', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('F2')
    await page.keyboard.type('Sun')
    await page.keyboard.press('Enter')
    await expect(page.locator('#layerlist tr.object .objlabel', { hasText: 'Sun' })).toHaveCount(1)
  })
})
