import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Pencil fidelity is in screen pixels: the same hand-shake is smoothed away at 100% and kept when zoomed in,
// where the same pixels are fewer user units.
test.describe('Pencil fidelity follows the zoom', () => {
  test('a jittery stroke keeps more anchors zoomed in than at 100%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.svgCanvas.getCurConfig().pencilStabilization = 0 // the stabiliser would damp the shake itself
    })
    await setSvgSource(page, '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title></g></svg>')
    await page.evaluate(() => window.svgEditor.commands.run('tool_fhpath'))

    // 1 user unit of shake around a horizontal line, settled at the end like a hand does
    const stroke = (y) => {
      const pts = Array.from({ length: 60 }, (_, i) => ({ x: 50 + i * 3, y: y + (i % 2 ? 1 : -1) }))
      return [...pts, ...Array.from({ length: 12 }, () => pts[pts.length - 1])]
    }
    const draw = (pts) => page.evaluate((p) => window.svgEditor.automation.pointer([
      { kind: 'down', ...p[0] },
      ...p.slice(1, -1).map((q) => ({ kind: 'move', ...q })),
      { kind: 'up', ...p[p.length - 1] }
    ]), pts)
    const anchors = async (index) => {
      const d = await page.locator('#svgcontent g.layer > path').nth(index).getAttribute('d')
      return (d.match(/[MLC]/g) ?? []).length
    }

    await draw(stroke(100))
    await page.evaluate(() => { window.svgEditor.commands.run('zoom_in'); window.svgEditor.commands.run('zoom_in') })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())).toBe(4)
    await draw(stroke(200))
    await expect(page.locator('#svgcontent g.layer > path')).toHaveCount(2)
    const atOne = await anchors(0)
    const atFour = await anchors(1)
    expect(atOne).toBeLessThanOrEqual(3) // 1 unit of shake is inside 2px of fidelity: a straight line
    expect(atFour).toBeGreaterThan(10) // but 2px is only 0.5 units at 400%
  })
})
