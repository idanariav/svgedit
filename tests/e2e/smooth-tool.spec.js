import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The Smooth tool brushes over part of a path: only anchors near the drag are refit, live, in one undo step.
const zigzag = (id, y, extra = '') => {
  const pts = Array.from({ length: 40 }, (_, i) => `${i ? 'L' : 'M'}${100 + i * 10},${y + (i % 2 ? 1.5 : -1.5)}`)
  return `<path id="${id}" d="${pts.join(' ')}" fill="none" stroke="#000000" stroke-width="2" ${extra}/>`
}

test.describe('Smooth tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="800" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        ${zigzag('a', 100)}
        ${zigzag('b', 300)}
        ${zigzag('fx', 400)}
      </g>
    </svg>`)
  })

  const brush = (page, from, to) => page.evaluate(([a, b]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 20 }]), [from, to])
  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_smooth'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  // The x of every anchor of a path whose data is M/L only, as written.
  const xs = async (page, id) => (await page.locator(`#svgcontent #${id}`).getAttribute('d')).match(/-?\d+(?:\.\d+)?(?=,)/g).map(Number)
  const radius = (page) => page.evaluate(() => 18 / window.svgEditor.svgCanvas.getZoom())

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_smooth').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('smooth')
  })

  test('brushing a selected path smooths only the part under the brush, in one undo step', async ({ page }) => {
    const before = await xs(page, 'a')
    const undo0 = await undoSize(page)
    await select(page, 'a')
    await tool(page)
    await brush(page, { x: 200, y: 100 }, { x: 300, y: 100 })
    const after = await xs(page, 'a')
    expect(after.length).toBeLessThan(before.length - 4)
    const r = await radius(page)
    // Out of reach of the drag (x 200..300, radius r): the same anchors as before, in the same order.
    const far = (x) => x < 200 - r - 10 || x > 300 + r + 10
    expect(after.filter(far)).toEqual(before.filter(far))
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await xs(page, 'a')).toEqual(before)
  })

  test('with nothing selected the path under the press is the one smoothed', async ({ page }) => {
    const beforeA = await xs(page, 'a')
    const beforeB = await xs(page, 'b')
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await tool(page)
    // Press exactly on one of the zig-zag's vertices, so the press lands on the stroke.
    await brush(page, { x: 200, y: 300 - 1.5 }, { x: 300, y: 300 - 1.5 })
    expect((await xs(page, 'b')).length).toBeLessThan(beforeB.length - 4)
    expect(await xs(page, 'a')).toEqual(beforeA)
  })

  test('a press on empty canvas does nothing and costs no undo step', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await tool(page)
    const undo0 = await undoSize(page)
    await brush(page, { x: 200, y: 200 }, { x: 300, y: 200 })
    expect(await undoSize(page)).toBe(undo0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('smooth')
  })

  test('paths with live geometry are left alone', async ({ page }) => {
    const before = await page.locator('#svgcontent #fx').getAttribute('d')
    await page.evaluate((d) => document.getElementById('fx').setAttribute('se:orig-d', d), before)
    await select(page, 'fx')
    await tool(page)
    const undo0 = await undoSize(page)
    await brush(page, { x: 200, y: 400 }, { x: 300, y: 400 })
    expect(await page.locator('#svgcontent #fx').getAttribute('d')).toBe(before)
    expect(await undoSize(page)).toBe(undo0)
  })

  test('a brush ring follows the pointer and goes when the tool is left', async ({ page }) => {
    await tool(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'move', x: 250, y: 200 }]))
    await expect(page.locator('#toolOverlay circle')).toHaveCount(1)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await expect(page.locator('#toolOverlay circle')).toHaveCount(0)
  })

  test('Escape mid-brush puts the path back', async ({ page }) => {
    const before = await xs(page, 'a')
    await select(page, 'a')
    await tool(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([
      { kind: 'down', x: 200, y: 100 }, { kind: 'move', x: 260, y: 100 }
    ]))
    expect((await xs(page, 'a')).length).toBeLessThan(before.length)
    await page.evaluate(() => window.svgEditor.svgCanvas.cancelToolGesture())
    expect(await xs(page, 'a')).toEqual(before)
  })
})
