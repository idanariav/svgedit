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

  test('a cutter drag across a shape cuts it in one undo step', async ({ page }) => {
    const shapes = () => page.evaluate(() => document.querySelectorAll('#svgcontent g.layer > :not(title)').length)
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')])
      window.svgEditor.commands.run('tool_cutter')
    })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('cutter')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 30, y: 80, to: { x: 130, y: 80 }, steps: 6 }]))
    expect(await shapes()).toBeGreaterThan(1)
    expect(await undoSize(page)).toBe(1)
    expect(await page.evaluate(() => document.getElementById('cutter_preview_line'))).toBeNull()
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await shapes()).toBe(1)
  })

  test('Escape during a multi-point cutter line removes the preview and cuts nothing', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_cutter'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 30, y: 80 }, { kind: 'move', x: 90, y: 60 }]))
    expect(await page.evaluate(() => document.getElementById('cutter_preview_line') !== null)).toBe(true)
    await page.evaluate(() => window.svgEditor.automation.key('escape'))
    expect(await page.evaluate(() => document.getElementById('cutter_preview_line'))).toBeNull()
    expect(await undoSize(page)).toBe(0)
  })

  for (const zoom of [100, 200]) {
    test(`a star is sized by the drag in document units at ${zoom}% zoom, in one undo step`, async ({ page }) => {
      await page.evaluate((z) => window.svgEditor.bottomPanel.changeZoom(z), zoom)
      await page.evaluate(() => window.svgEditor.commands.run('tool_star'))
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('star')
      await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 300, y: 200, to: { x: 360, y: 200 }, steps: 6 }]))
      const star = await page.evaluate(() => {
        const el = document.querySelector('#svgcontent polygon[shape="star"]')
        return el && { r: Number(el.getAttribute('r')), cx: Number(el.getAttribute('cx')) }
      })
      expect(star.cx).toBeCloseTo(300, 0)
      expect(star.r).toBeCloseTo(40, 0) // |drag| / 1.5, whatever the zoom
      expect(await undoSize(page)).toBe(1)
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await page.evaluate(() => document.querySelectorAll('#svgcontent polygon').length)).toBe(0)
    })
  }

  test('a polygon click without a drag creates nothing, and Escape mid-drag rolls back', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_polygon'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 300, y: 200 }]))
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent polygon').length)).toBe(0)
    await page.evaluate(() => window.svgEditor.commands.run('tool_polygon'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'down', x: 300, y: 200 }, { kind: 'move', x: 340, y: 230 }]))
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent polygon').length)).toBe(1)
    await page.evaluate(() => window.svgEditor.automation.key('escape'))
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent polygon').length)).toBe(0)
    expect(await undoSize(page)).toBe(0)
  })

  test('an armed library shape is placed by a drag in one undo step; a click places nothing', async ({ page }) => {
    const shapes = () => page.evaluate(() => document.querySelectorAll('#svgcontent g.layer > path').length)
    await page.evaluate(() => window.svgEditor.armShapeInsert({ draw: 'M0 0 L10 0 L10 10 L0 10 Z' }))
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('shapelib')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 300, y: 200 }]))
    expect(await shapes()).toBe(0)
    await page.evaluate(() => window.svgEditor.armShapeInsert({ draw: 'M0 0 L10 0 L10 10 L0 10 Z' }))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 300, y: 200, to: { x: 380, y: 260 }, steps: 6 }]))
    expect(await shapes()).toBe(1)
    expect(await undoSize(page)).toBe(1)
    const box = await page.evaluate(() => {
      const b = document.querySelector('#svgcontent g.layer > path').getBBox()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })
    // the library shape's incremental scaling drifts by a pixel or two (as it always did)
    expect(Math.abs(box.x - 300)).toBeLessThan(3)
    expect(Math.abs(box.w - 80)).toBeLessThan(3)
    expect(Math.abs(box.h - 60)).toBeLessThan(3)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await shapes()).toBe(0)
  })
})
