import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Drawing tools snap the points they place to other objects (anchors, box corners / midpoints /
// centres / edge lines) and to the page, with grid snapping off; the pencil stays free-hand.
test.describe('Snapping while drawing', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="ref" x="200" y="200" width="100" height="100" fill="#cccccc"/>
        <polygon id="tri" points="450,100 500,180 400,180" fill="#cccccc"/>
      </g>
    </svg>`)
  })

  const tool = (page, id) => page.evaluate((i) => window.svgEditor.commands.run(i), id)
  const drag = (page, from, to, mods) => page.evaluate(([a, b, m]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, mods: m }]), [from, to, mods])
  const last = (page, selector) => page.locator(`#svgcontent g.layer > ${selector}`).last()
  const num = async (loc, attr) => Number(await loc.getAttribute(attr))
  const guideCount = (page) => page.evaluate(() => document.querySelector('#smartGuides')?.childElementCount ?? 0)

  test('a rectangle starts 3px off another one\'s corner and lands on it', async ({ page }) => {
    await tool(page, 'tool_rect')
    await drag(page, { x: 197, y: 198 }, { x: 410, y: 420 })
    const rect = page.locator('#svgcontent g.layer > rect:not(#ref)')
    await expect(rect).toHaveCount(1)
    expect(await num(rect, 'x')).toBe(200)
    expect(await num(rect, 'y')).toBe(200)
  })

  test('the dragged corner snaps too, to an edge line when no point is near', async ({ page }) => {
    await tool(page, 'tool_rect')
    // x 60 -> 305 is 5 off the reference's right edge (300); y 20 -> 410 has nothing near it
    await drag(page, { x: 60, y: 20 }, { x: 305, y: 410 })
    const rect = page.locator('#svgcontent g.layer > rect:not(#ref)')
    expect(await num(rect, 'x') + await num(rect, 'width')).toBe(300)
    expect(await num(rect, 'y') + await num(rect, 'height')).toBe(410)
  })

  test('the guides disappear when the button is released', async ({ page }) => {
    await tool(page, 'tool_rect')
    await page.evaluate(() => window.svgEditor.automation.pointer([
      { kind: 'down', x: 197, y: 198 },
      { kind: 'move', x: 250, y: 260 }
    ]))
    expect(await guideCount(page)).toBeGreaterThan(0)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'up', x: 250, y: 260 }]))
    expect(await guideCount(page)).toBe(0)
  })

  test('a line snaps both ends, to the page corner and to an anchor of a polygon', async ({ page }) => {
    await tool(page, 'tool_line')
    // Alt keeps the end free of ext-connector's binding to the shape's edge.
    await drag(page, { x: 3, y: 2 }, { x: 452, y: 98 }, { alt: true })
    const line = page.locator('#svgcontent g.layer > line')
    expect([await num(line, 'x1'), await num(line, 'y1')]).toEqual([0, 0])
    expect([await num(line, 'x2'), await num(line, 'y2')]).toEqual([450, 100])
  })

  test('the pen places its anchors on other objects\' anchors', async ({ page }) => {
    await tool(page, 'tool_path')
    await page.evaluate(() => window.svgEditor.automation.pointer([
      { kind: 'click', x: 100, y: 400 },
      { kind: 'click', x: 203, y: 297 },
      { kind: 'dblclick', x: 500, y: 400 }
    ]))
    const d = await page.locator('#svgcontent g.layer > path').last().getAttribute('d')
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number)
    // M 100 400, a point snapped to the reference's bottom-left corner (200, 300), then the last one
    expect(nums.slice(0, 4)).toEqual([100, 400, 200, 300])
  })

  test('a star\'s centre snaps (polystar tool)', async ({ page }) => {
    await tool(page, 'tool_polygon')
    await drag(page, { x: 252, y: 247 }, { x: 330, y: 330 })
    const poly = page.locator('#svgcontent g.layer > polygon:not(#tri)')
    await expect(poly).toHaveCount(1)
    expect(await num(poly, 'cx')).toBe(250)
    expect(await num(poly, 'cy')).toBe(250)
  })

  test('an arc from the shape family starts on the corner it was pressed next to', async ({ page }) => {
    await tool(page, 'tool_arc')
    await drag(page, { x: 197, y: 198 }, { x: 100, y: 100 })
    const d = await last(page, 'path').getAttribute('d')
    expect(d).toMatch(/^M\s*200\s*,\s*200\b/)
    expect(d).toMatch(/\b100\s*,\s*100\s*$/) // the far end had nothing near it
  })

  test('the pencil is free-hand: no snapping and no guides while it draws near other objects', async ({ page }) => {
    await tool(page, 'tool_fhpath')
    const stroke = Array.from({ length: 40 }, (_, i) => ({ x: 197 - i * 2, y: 198 + i * 3 }))
    await page.evaluate((pts) => window.svgEditor.automation.pointer([
      { kind: 'down', ...pts[0] },
      ...pts.slice(1, -1).map((p) => ({ kind: 'move', ...p })),
      { kind: 'up', ...pts[pts.length - 1] }
    ]), stroke)
    expect(await guideCount(page)).toBe(0)
    const d = await last(page, 'path').getAttribute('d')
    expect(d).toMatch(/M\s*19[5-9]/) // starts where the pen went down, not on the corner (200, 200)
  })

  test('the Smart snapping switch turns it off', async ({ page }) => {
    await page.evaluate(() => { window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false })
    await tool(page, 'tool_rect')
    await drag(page, { x: 197, y: 198 }, { x: 410, y: 420 })
    const rect = page.locator('#svgcontent g.layer > rect:not(#ref)')
    expect(await num(rect, 'x')).toBe(197)
    expect(await num(rect, 'y')).toBe(198)
  })

  test('grid snapping wins when it is on', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: true, snappingStep: 10 }))
    await tool(page, 'tool_rect')
    await drag(page, { x: 197, y: 198 }, { x: 410, y: 420 })
    const rect = page.locator('#svgcontent g.layer > rect:not(#ref)')
    expect(await num(rect, 'x')).toBe(200)
    expect(await num(rect, 'y')).toBe(200)
  })
})
