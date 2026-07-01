import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const layerNames = async (page) => {
  return page.$$eval('#layerlist tbody tr.layer td.layername', (nodes) =>
    nodes.map((n) => n.textContent.trim())
  )
}

const toggleVisibilityFor = async (page, name) => {
  const row = page.locator('#layerlist tbody tr.layer', {
    has: page.locator('td.layername', { hasText: name })
  })
  await row.locator('td.layervis').click()
}

const toggleLockFor = async (page, name) => {
  const row = page.locator('#layerlist tbody tr.layer', {
    has: page.locator('td.layername', { hasText: name })
  })
  await row.locator('td.layerlock').click()
}

test.describe('Layers panel', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.waitFor({ state: 'visible' })
    await panelHandle.click()
    await page.waitForSelector('#layer_new', { state: 'visible' })
  })

  test('creates, renames, toggles and deletes layers', async ({ page }) => {
    const initialNames = await layerNames(page)
    expect(initialNames.length).toBeGreaterThan(0)

    page.once('dialog', (dialog) => dialog.accept('Layer 2'))
    await page.click('#layer_new')
    await expect.poll(() => layerNames(page)).resolves.toContain('Layer 2')

    await page.locator('#layerlist td.layername', { hasText: 'Layer 2' }).click()
    page.once('dialog', (dialog) => dialog.accept('Renamed Layer'))
    await page.click('#layer_rename')
    await expect.poll(() => layerNames(page)).resolves.toContain('Renamed Layer')

    await toggleVisibilityFor(page, 'Renamed Layer')
    const visibilityClass = await page.$eval(
      '#layerlist tbody tr.layer td.layername:has-text("Renamed Layer")',
      (node) => node.parentElement?.querySelector('td.layervis')?.className || ''
    )
    expect(visibilityClass).toContain('layerinvis')

    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.click()
    await panelHandle.click()

    await page.locator('#layerlist td.layername', { hasText: 'Renamed Layer' }).click()
    await page.click('#layer_delete')
    await expect.poll(() => layerNames(page)).resolves.not.toContain('Renamed Layer')
  })

  test('locks a layer so new objects skip it', async ({ page }) => {
    // Add a second layer; it becomes the top, current layer.
    page.once('dialog', (dialog) => dialog.accept('Layer 2'))
    await page.click('#layer_new')
    await expect.poll(() => layerNames(page)).resolves.toContain('Layer 2')

    // Lock the top (current) layer.
    await toggleLockFor(page, 'Layer 2')
    const lockClass = await page.$eval(
      '#layerlist tbody tr.layer td.layername:has-text("Layer 2")',
      (node) => node.parentElement?.querySelector('td.layerlock')?.className || ''
    )
    expect(lockClass).toContain('locked')

    // Draw a new element while the locked layer is current; it should land on the
    // unlocked layer below instead of the locked top layer.
    const parentLayerName = await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const el = canv.addSVGElementsFromJson({
        element: 'rect',
        curStyles: true,
        attr: { x: 10, y: 10, width: 40, height: 40, id: canv.getNextId() }
      })
      const layerGroup = el.closest('g.layer')
      return layerGroup?.querySelector('title')?.textContent ?? null
    })
    expect(parentLayerName).not.toBe('Layer 2')

    // The locked state round-trips into the saved SVG.
    const svgStr = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(svgStr).toContain('se:locked="true"')
  })
})
