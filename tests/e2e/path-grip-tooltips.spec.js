import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The path editor's node and control-point grips explain themselves on hover: a <title> child (the SVG tooltip) with the
// translated text the editor hands the canvas.
test.describe('Path grip tooltips', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <path id="p1" d="M 100 200 C 150 100 250 100 300 200 L 200 300 z" fill="none" stroke="#000000" stroke-width="2"/>
      </g>
    </svg>`)
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const path = document.querySelector('#svgcontent #p1')
      canv.selectOnly([path], true)
      canv.pathActions.toEditMode(path)
    })
  })

  const titles = (page, prefix) => page.evaluate((p) => [...document.querySelectorAll(`[id^="${p}"]`)]
    .filter((el) => /_\d/.test(el.id) && el.getAttribute('display') !== 'none') // (not the grip container)
    .map((el) => [...el.children].filter((c) => c.localName === 'title').map((c) => c.textContent)), prefix)

  test('every node grip says how to move it and how to change its segment type', async ({ page }) => {
    const nodes = await titles(page, 'pathpointgrip_')
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    for (const t of nodes) expect(t).toEqual(['Drag node to move it. Double-click node to change segment type'])
  })

  test('control-point grips have theirs once a curve node is selected', async ({ page }) => {
    const grip = page.locator('#pathpointgrip_1')
    const box = await grip.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const ctrls = await titles(page, 'ctrlpointgrip_')
    expect(ctrls.length).toBeGreaterThan(0)
    for (const t of ctrls) expect(t).toEqual(['Drag control point to adjust curve properties'])
  })

  test('the tooltips are editor chrome: they are not saved with the drawing', async ({ page }) => {
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(svg).not.toContain('Drag node')
    expect(svg).not.toContain('Drag control point')
  })

  test('the text follows the language the editor was given', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.setPathGripTitles({ node: 'Ziehen' }))
    const nodes = await titles(page, 'pathpointgrip_')
    for (const t of nodes) expect(t).toEqual(['Ziehen'])
  })
})
