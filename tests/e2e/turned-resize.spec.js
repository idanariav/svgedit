import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Resizing a rect that is turned by rotate(): the gesture is shown by the renderer through the model, and the corner opposite
// the grip stays where it was on the page.
test.describe('Resize of a turned rect', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('the opposite corner stays put, the turn is kept, undo restores it', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="turned" x="200" y="150" width="120" height="60" fill="#3366cc" transform="rotate(30 260 180)"/>
      </g></svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })
    // the page position of the top left corner (the south east grip keeps it fixed)
    const leftEdge = () => page.evaluate(() => {
      const r = document.getElementById('turned')
      const m = r.getCTM()
      const x = +r.getAttribute('x')
      const y = +r.getAttribute('y')
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
    })
    const before = await leftEdge()
    await page.locator('#svgcontent #turned').click({ force: true })
    await page.waitForTimeout(150)
    const grip = page.locator('#selectorGrip_resize_se')
    await expect(grip).toBeVisible()
    const box = await grip.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    const state = await page.evaluate(() => {
      const r = document.getElementById('turned')
      return { w: +r.getAttribute('width'), t: r.getAttribute('transform') }
    })
    expect(state.w).toBeGreaterThan(120)
    expect(state.t).toMatch(/^rotate\(30(\.\d+)? /)
    const after = await leftEdge()
    expect(after.x).toBeCloseTo(before.x, 1)
    expect(after.y).toBeCloseTo(before.y, 1)
    await page.evaluate(() => window.svgEditor.commands.run('tool_undo'))
    const undone = await page.evaluate(() => {
      const r = document.getElementById('turned')
      return { w: +r.getAttribute('width'), t: r.getAttribute('transform') }
    })
    expect(undone).toEqual({ w: 120, t: 'rotate(30 260 180)' })
  })
})
