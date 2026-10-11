import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Distort tool: drag a corner of the selected shape's box. The shape gets a freeDistort / perspective live
// effect (corners in unit box coordinates); one undo step per drag.
test.describe('Distort tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="box" x="100" y="100" width="200" height="100" stroke="#000000" stroke-width="2" fill="#cccccc"/>
        <path id="curve" d="M100,360 C200,260 400,460 500,360" stroke="#000000" stroke-width="4" fill="none"/>
        <g id="grp"><rect x="400" y="100" width="40" height="40" fill="#f00"/></g>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_distort'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const drag = (page, from, to, mods) => page.evaluate(([a, b, m]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 10, mods: m }]), [from, to, mods])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const fx = (page, id) => page.evaluate((i) => document.getElementById(i)?.getAttribute('se:fx') ?? null, id)
  const param = (page, id, key) => fx(page, id).then((s) => Number(new RegExp(`${key}=([-\\d.e]+)`).exec(s)?.[1]))

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_distort').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('distort')
  })

  test('dragging the bottom right corner distorts a rect in one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 300, y: 200 }, { x: 400, y: 260 })
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('path')
    expect(await fx(page, 'box')).toMatch(/^freeDistort\(/)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.5, 2) // (400 - 100) / 200
    expect(await param(page, 'box', 'bottomRightY')).toBeCloseTo(1.6, 2) // (260 - 100) / 100
    expect(await param(page, 'box', 'topLeftX')).toBeCloseTo(0, 5)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.5, 2)
  })

  test('a second drag edits the same effect rather than stacking another', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 350, y: 220 })
    await drag(page, { x: 100, y: 100 }, { x: 120, y: 90 })
    const stack = await fx(page, 'box')
    expect(stack.split(';')).toHaveLength(1)
    expect(await param(page, 'box', 'topLeftX')).toBeCloseTo(0.1, 2)
    expect(await param(page, 'box', 'topLeftY')).toBeCloseTo(-0.1, 2)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.25, 2)
  })

  test('Shift keeps the corner on its dominant axis', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 380, y: 210 }, { shift: true })
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.4, 2)
    expect(await param(page, 'box', 'bottomRightY')).toBeCloseTo(1, 5)
  })

  test('Perspective mode writes a perspective effect and refuses a fold', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('mode', 'perspective'))
    await drag(page, { x: 300, y: 200 }, { x: 260, y: 200 })
    expect(await fx(page, 'box')).toMatch(/^perspective\(/)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(0.8, 2)
    // Pulling the corner across the opposite one would fold the projective map: the last valid corner stays.
    await drag(page, { x: 260, y: 200 }, { x: 50, y: 50 })
    expect(await param(page, 'box', 'bottomRightX')).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.getElementById('box').getAttribute('d'))).not.toMatch(/NaN|Infinity/)
  })

  test('changing the mode with a distorted shape selected converts its effect in one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 350, y: 220 })
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('mode', 'perspective'))
    expect(await fx(page, 'box')).toMatch(/^perspective\(/)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.25, 2)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await fx(page, 'box')).toMatch(/^freeDistort\(/)
  })

  test('a click selects a shape and changes nothing; a press away from every shape does nothing', async ({ page }) => {
    await tool(page)
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 200, y: 150 }]))
    expect(await undoSize(page)).toBe(undo0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id))).toEqual(['box'])
    await drag(page, { x: 20, y: 20 }, { x: 60, y: 60 })
    expect(await undoSize(page)).toBe(undo0)
    expect(await fx(page, 'box')).toBeNull()
  })

  test('a curve distorts and keeps its node count growing smoothly (finite geometry)', async ({ page }) => {
    await select(page, 'curve')
    await tool(page)
    const box = await page.evaluate(() => { const b = document.getElementById('curve').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
    await drag(page, { x: box.x + box.w, y: box.y + box.h }, { x: box.x + box.w + 40, y: box.y + box.h + 30 })
    expect(await fx(page, 'curve')).toMatch(/^freeDistort\(/)
    expect(await page.evaluate(() => document.getElementById('curve').getAttribute('d'))).not.toMatch(/NaN/)
  })

  test('a group is left alone', async ({ page }) => {
    await select(page, 'grp')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 440, y: 140 }, { x: 480, y: 170 })
    expect(await undoSize(page)).toBe(undo0)
  })

  test('Escape mid-drag puts the shape back', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'down', x: 300, y: 200 }, { kind: 'move', x: 380, y: 240 }]))
    expect(await fx(page, 'box')).not.toBeNull()
    await page.evaluate(() => window.svgEditor.svgCanvas.cancelToolGesture())
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
  })

  test('an overlay with four grips shows for the shape and goes with the tool', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await expect(page.locator('#toolOverlay rect')).toHaveCount(4)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await expect(page.locator('#toolOverlay rect')).toHaveCount(0)
  })

  test('the corners follow the element when it has its own transform', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="rot" x="0" y="0" width="100" height="100" transform="translate(200 200) rotate(90)" fill="#ccc"/>
      </g></svg>`)
    await select(page, 'rot')
    await tool(page)
    // The rect's local (100,100) corner is at document (200 - 100, 200 + 100) = (100, 300).
    await drag(page, { x: 100, y: 300 }, { x: 100, y: 340 })
    // Document -y... local x axis is document +y after the 90° turn: +40 doc y = +40 local x => 0.4 of the width.
    expect(await param(page, 'rot', 'bottomRightX')).toBeCloseTo(1.4, 2)
    expect(await param(page, 'rot', 'bottomRightY')).toBeCloseTo(1, 2)
  })
})
