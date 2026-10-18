import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage, dragInDocument } from './helpers.js'

// A clipped shape is moved by a transform (its clip silhouette in <defs> is static, so the move is never baked into x / y):
// the renderer shows the drag through the model, and one undo step takes it back.
test.describe('Drag of a clipped shape', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('moves by transform, leaves x / y and the clip alone, and undoes in one step', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="c1"><rect x="100" y="100" width="80" height="80"/></clipPath></defs>
      <g class="layer"><title>Layer 1</title>
        <rect id="clipped" x="100" y="100" width="150" height="150" fill="#cc3333" clip-path="url(#c1)"/>
      </g></svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })
    await page.locator('#svgcontent #clipped').click({ force: true })
    await page.waitForTimeout(150)
    const size = await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
    await dragInDocument(page, { x: 140, y: 140 }, { x: 190, y: 170 })
    await page.waitForTimeout(150)
    const moved = await page.evaluate(() => {
      const r = document.getElementById('clipped')
      const c = document.querySelector('#c1 rect')
      return { x: r.getAttribute('x'), t: r.getAttribute('transform'), cx: c.getAttribute('x'), clip: r.getAttribute('clip-path') }
    })
    expect(moved.x).toBe('100')
    expect(moved.cx).toBe('100')
    expect(moved.clip).toBe('url(#c1)')
    expect(moved.t).toMatch(/^matrix\(1 0 0 1 [\d.]+ [\d.]+\)$/)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(size + 1)
    await page.evaluate(() => window.svgEditor.commands.run('tool_undo'))
    expect(await page.evaluate(() => document.getElementById('clipped').getAttribute('transform'))).toBeNull()
  })
})
