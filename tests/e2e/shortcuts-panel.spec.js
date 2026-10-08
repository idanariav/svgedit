import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const desktop = async (page, width = 1440, height = 900) => {
  await page.setViewportSize({ width, height })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor?.configObj?.pref('tabletMode', false, true)
    document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
  })
  await page.waitForSelector('#tool_undo', { state: 'attached' })
}

const selectRect = (page) => page.evaluate(() => {
  const c = window.svgEditor.svgCanvas
  const el = c.addSVGElementsFromJson({
    element: 'rect', curStyles: true, attr: { x: 50, y: 50, width: 60, height: 60, id: c.getNextId() }
  })
  c.selectOnly([el], true)
})

test.describe('tool shortcuts', () => {
  test('every tool has its own default key (only the *_multi twins share one)', async ({ page }) => {
    await desktop(page)
    const keys = await page.evaluate(() => [...document.querySelectorAll('[shortcut]')]
      .map(e => [e.id, e.getAttribute('shortcut').toLowerCase()]))
    const byKey = {}
    for (const [id, key] of keys) (byKey[key] ||= []).push(id)
    const dupes = Object.entries(byKey).filter(([, ids]) => ids.length > 1)
      .filter(([, ids]) => !ids.every(id => id.replace(/_multi$/, '') === ids[0].replace(/_multi$/, '')))
    expect(dupes).toEqual([])
    const ids = Object.fromEntries(keys)
    for (const [id, key] of [['tool_image', 'm'], ['tool_brush', 'w'], ['tool_cutter', 'c'], ['tool_curvature', 'y'], ['tool_puppet_warp', 'x']]) {
      expect(ids[id], id).toBe(key)
    }
  })

  test('a tool key switches mode', async ({ page }) => {
    await desktop(page)
    await page.locator('#svgcanvas').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('y')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('curvature')
  })
})

test.describe('side panel', () => {
  test('opens by itself on the first selection in a wide pane; a manual toggle is remembered', async ({ page }) => {
    await desktop(page)
    expect(await page.evaluate(() => document.querySelector('.svg_editor').classList.contains('open'))).toBe(false)
    await selectRect(page)
    await expect.poll(() => page.evaluate(() => document.querySelector('.svg_editor').classList.contains('open'))).toBe(true)
    // Closing it by hand is remembered, so it never auto-opens again.
    await page.locator('se-text#sidepanel_handle').click()
    expect(await page.evaluate(() => document.querySelector('.svg_editor').classList.contains('open'))).toBe(false)
    expect(await page.evaluate(() => String(window.svgEditor.configObj.pref('sidePanelManual')))).toBe('true')
  })

  test('stays closed in a narrow pane', async ({ page }) => {
    await desktop(page, 900, 700)
    await selectRect(page)
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => document.querySelector('.svg_editor').classList.contains('open'))).toBe(false)
  })
})

test.describe('palette', () => {
  test('lists the colours already used in the drawing', async ({ page }) => {
    await desktop(page)
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 10, y: 10, width: 30, height: 30, fill: '#123456', id: c.getNextId() } })
      c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 60, y: 10, width: 30, height: 30, fill: '#abcdef', id: c.getNextId() } })
      c.call('changed', [])
    })
    await expect.poll(() => page.evaluate(() => [...document.querySelector('#palette').shadowRoot
      .querySelectorAll('#js-se-doc .palette_item')].map(e => e.dataset.rgb))).toEqual(expect.arrayContaining(['#123456', '#abcdef']))
  })
})
