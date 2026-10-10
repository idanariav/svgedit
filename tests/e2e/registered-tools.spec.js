import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Brush, panning and the eyedropper run on svgCanvas.registerTool (tool-registry.js).

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="60" height="60" fill="#00aa00"/>
  </g>
</svg>`

test.describe('registered tools', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(async (doc) => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      await window.svgEditor.loadFromString(doc)
    }, DOC)
  })

  const paths = (page) => page.evaluate(() => document.querySelectorAll('#svgcontent g.layer > path').length)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

  for (const zoom of [100, 200]) {
    test(`a brush stroke is one undo step and lands under the pointer at ${zoom}% zoom`, async ({ page }) => {
      await page.evaluate((z) => window.svgEditor.bottomPanel.changeZoom(z), zoom)
      await page.evaluate(() => window.svgEditor.commands.run('tool_brush'))
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('brush')
      await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 300, y: 200, to: { x: 400, y: 280 }, steps: 8 }]))
      expect(await paths(page)).toBe(1)
      expect(await undoSize(page)).toBe(1)
      const box = await page.evaluate(() => {
        const b = document.querySelector('#svgcontent g.layer > path').getBBox()
        return { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height }
      })
      expect(box.x).toBeLessThan(310)
      expect(box.r).toBeGreaterThan(390)
      expect(box.b).toBeGreaterThan(270)
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select') // back to select
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await paths(page)).toBe(0)
    })
  }

  test('Escape in the middle of a brush stroke leaves nothing behind', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_brush'))
    await page.evaluate(() => window.svgEditor.automation.pointer([
      { kind: 'down', x: 300, y: 200 }, { kind: 'move', x: 340, y: 230 }
    ]))
    expect(await paths(page)).toBe(1)
    await page.evaluate(() => window.svgEditor.automation.key('escape'))
    expect(await paths(page)).toBe(0)
    expect(await undoSize(page)).toBe(0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.inTransaction())).toBe(false)
  })

  test('panning drags draw nothing and release panning', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('ext-panning'))
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('ext-panning')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 300, y: 200, to: { x: 340, y: 230 }, steps: 4 }]))
    expect(await undoSize(page)).toBe(0)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent g.layer > *').length)).toBe(2) // title + rect
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.inTransaction())).toBe(false)
  })

  test('the eyedropper opens its menu when a shape is clicked', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_eyedropper'))
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('eyedropper')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 80, y: 80 }]))
    expect(await page.evaluate(() => document.querySelectorAll('se-eyedropper-menu').length)).toBe(1)
    expect(await undoSize(page)).toBe(0)
  })
})
