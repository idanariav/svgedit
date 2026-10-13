import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Measure tool: drag between two points to read distance, angle and offsets. The readout stays until the next
// press; the drawing is never changed (no undo step).
test.describe('Measure tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title><rect id="r" x="300" y="300" width="40" height="40" fill="#cccccc"/></g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_measure'))
  const drag = (page, from, to, mods) => page.evaluate((a) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a.from, to: a.to, steps: 6, mods: a.mods }]), { from, to, mods })
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const readout = (page) => page.evaluate(() => [...document.querySelectorAll('#toolOverlay #measure_readout text')].map((t) => t.textContent))
  const lineOf = (page) => page.evaluate(() => {
    const l = document.querySelector('#toolOverlay line')
    return l ? ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a))) : null
  })

  test('the readout is redrawn at the new zoom, so its dots and label keep their screen size', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 130, y: 60 })
    const dot = (p) => p.evaluate(() => Number(document.querySelector('#toolOverlay circle').getAttribute('r')))
    const before = await dot(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setCurrentZoom(2))
    expect(await dot(page)).toBeCloseTo(before / 2, 5)
    expect(await readout(page)).toEqual(['D: 50 px', 'Angle: 53.1°', 'Δx: 30 px', 'Δy: -40 px'])
  })

  test('the tool is in the left panel, arms its mode and shows a crosshair', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_measure').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('measure')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgRoot().style.cursor)).toBe('crosshair')
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgRoot().style.cursor)).toBe('')
  })

  test('a drag reads distance, angle and offsets, and the readout stays after the release', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 130, y: 60 })
    expect(await readout(page)).toEqual(['D: 50 px', 'Angle: 53.1°', 'Δx: 30 px', 'Δy: -40 px'])
    expect(await lineOf(page)).toEqual([100, 100, 130, 60])
  })

  test('Shift constrains the line to 45° steps', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 140, y: 112 }, { shift: true })
    const [x1, y1, x2, y2] = await lineOf(page)
    expect([x1, y1]).toEqual([100, 100])
    expect(y2).toBeCloseTo(100, 3)
    expect(x2).toBeCloseTo(100 + Math.hypot(40, 12), 3)
    expect((await readout(page))[1]).toBe('Angle: 0°')
  })

  test('the next press replaces the readout; a click without a drag clears it', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 160, y: 100 })
    expect((await readout(page))[0]).toBe('D: 60 px')
    await drag(page, { x: 50, y: 50 }, { x: 50, y: 80 })
    expect((await readout(page))[0]).toBe('D: 30 px')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 200, y: 200 }]))
    expect(await readout(page)).toEqual([])
  })

  test('the drawing is never changed and nothing is recorded', async ({ page }) => {
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    const steps = await undoSize(page)
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 330, y: 320 })
    expect(await undoSize(page)).toBe(steps)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(before)
  })

  test('leaving the tool takes the readout away', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 160, y: 100 })
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    expect(await readout(page)).toEqual([])
    expect(await lineOf(page)).toBeNull()
  })

  test('lengths follow the base unit', async ({ page }) => {
    await page.evaluate(() => { window.svgEditor.configObj.curConfig.baseUnit = 'in' })
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 196, y: 100 })
    expect(await readout(page)).toEqual(['D: 1 in', 'Angle: 0°', 'Δx: 1 in', 'Δy: 0 in'])
  })

  test('the end points snap to other objects', async ({ page }) => {
    await page.evaluate(() => { window.svgEditor.svgCanvas.getCurConfig().smartSnapping = true })
    await tool(page)
    await drag(page, { x: 100, y: 100 }, { x: 302, y: 298 })
    const [, , x2, y2] = await lineOf(page)
    expect(x2).toBe(300) // the rectangle's corner
    expect(y2).toBe(300)
  })
})
