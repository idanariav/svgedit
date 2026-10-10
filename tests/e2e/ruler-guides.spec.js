import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Ruler guides on the real editor: dragged out of the rulers with the real mouse, stored as
// `se:guides` on the root, one undo step per change, snapping what is drawn.
test.describe('Ruler guides', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      const e = window.svgEditor
      e.setConfig({ gridSnapping: false })
      e.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      e.configObj.curConfig.showRulers = true
      e.rulers.display(true)
      e.rulers.updateRulers()
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title><rect id="r" x="300" y="300" width="60" height="60" fill="#cc3333"/></g>
    </svg>`)
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
  })

  /** document -> client for the current view */
  const client = (page, x, y) => page.evaluate(([dx, dy]) => {
    const a = window.svgEditor.automation
    const f = a.frame()
    return { x: f.rootLeft + f.contentX + dx * f.zoom, y: f.rootTop + f.contentY + dy * f.zoom }
  }, [x, y])
  const rulerCenter = (page, id) => page.locator(id).boundingBox().then((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))
  const attr = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgContent().getAttribute('se:guides'))
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const grabbable = (page) => page.evaluate(() => document.querySelectorAll('#rulerGuides [data-guide-axis]').length)

  /** drag from the left ruler into the canvas at document x */
  const makeVertical = async (page, x) => {
    const from = await rulerCenter(page, '#ruler_y')
    const to = await client(page, x, 200)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }
  const makeHorizontal = async (page, y) => {
    const from = await rulerCenter(page, '#ruler_x')
    const to = await client(page, 200, y)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }

  test('dragging from the left ruler makes a vertical guide, from the top ruler a horizontal one', async ({ page }) => {
    const before = await undoSize(page)
    await makeVertical(page, 120)
    expect(await attr(page)).toBe('v:120')
    await makeHorizontal(page, 250)
    expect(await attr(page)).toBe('v:120;h:250')
    expect(await undoSize(page)).toBe(before + 2)
    // drawn in the overlay, nothing added to the drawing
    expect(await page.locator('#rulerGuides line').count()).toBeGreaterThanOrEqual(2)
    expect(await page.locator('#svgcontent line').count()).toBe(0)
  })

  test('each guide is one undo step', async ({ page }) => {
    await makeVertical(page, 120)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page)).toBeNull()
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await attr(page)).toBe('v:120')
  })

  test('releasing back over the ruler makes no guide', async ({ page }) => {
    const from = await rulerCenter(page, '#ruler_y')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 3, from.y + 40, { steps: 4 })
    await page.mouse.up()
    expect(await attr(page)).toBeNull()
  })

  test('Escape cancels a drag', async ({ page }) => {
    const from = await rulerCenter(page, '#ruler_y')
    const to = await client(page, 120, 200)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await attr(page)).toBeNull()
  })

  test('a guide is moved with the Select tool, copied with Alt, deleted by dragging it back onto the ruler', async ({ page }) => {
    await makeVertical(page, 120)
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    const at = await client(page, 120, 400)
    const moveTo = await client(page, 180, 400)

    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(moveTo.x, moveTo.y, { steps: 6 })
    await page.mouse.up()
    expect(await attr(page)).toBe('v:180')

    await page.keyboard.down('Alt')
    await page.mouse.move(moveTo.x, moveTo.y)
    await page.mouse.down()
    const copyTo = await client(page, 240, 400)
    await page.mouse.move(copyTo.x, copyTo.y, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    expect(await attr(page)).toBe('v:180,240')

    const ruler = await rulerCenter(page, '#ruler_y')
    await page.mouse.move(copyTo.x, copyTo.y)
    await page.mouse.down()
    await page.mouse.move(ruler.x, ruler.y, { steps: 8 })
    await page.mouse.up()
    expect(await attr(page)).toBe('v:180')
    // nothing was selected or rubber-banded by any of that
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).length)).toBe(0)
  })

  test('guides can only be grabbed with the Select tool, and not when locked or hidden', async ({ page }) => {
    await makeVertical(page, 120)
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    expect(await grabbable(page)).toBe(1)
    await page.evaluate(() => window.svgEditor.commands.run('tool_rect'))
    expect(await grabbable(page)).toBe(0)
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    await page.evaluate(() => window.svgEditor.commands.run('guides_toggle_lock'))
    expect(await grabbable(page)).toBe(0)
    await page.evaluate(() => window.svgEditor.commands.run('guides_toggle_lock'))
    expect(await grabbable(page)).toBe(1)
    await page.evaluate(() => window.svgEditor.commands.run('guides_toggle_show'))
    expect(await page.locator('#rulerGuides line').count()).toBe(0)
    expect(await attr(page)).toBe('v:120') // hidden, not deleted
    await page.evaluate(() => window.svgEditor.commands.run('guides_toggle_show'))
    expect(await page.locator('#rulerGuides line').count()).toBeGreaterThan(0)
  })

  test('Clear all guides is one undo step, and says why it is unavailable when there are none', async ({ page }) => {
    const none = await page.evaluate(() => window.svgEditor.commands.get('guides_clear').enabled(window.svgEditor))
    expect(none).toBe('There are no guides')
    await makeVertical(page, 120)
    await makeHorizontal(page, 250)
    const before = await undoSize(page)
    await page.evaluate(() => window.svgEditor.commands.run('guides_clear'))
    expect(await attr(page)).toBeNull()
    expect(await undoSize(page)).toBe(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page)).toBe('v:120;h:250')
  })

  test('guides are saved with the drawing and reload, but are not part of its graphics', async ({ page }) => {
    await makeVertical(page, 120)
    await makeHorizontal(page, 250)
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toContain('se:guides="v:120;h:250"')
    expect(saved).not.toContain('rulerGuides')
    expect(saved).not.toContain('<line')
    await page.evaluate((s) => window.svgEditor.svgCanvas.setSvgString(s), saved)
    expect(await attr(page)).toBe('v:120;h:250')
    expect(await page.locator('#rulerGuides line').count()).toBeGreaterThanOrEqual(2)
  })

  test('a shape drawn next to a guide snaps to it', async ({ page }) => {
    await makeVertical(page, 120)
    await page.evaluate(() => window.svgEditor.commands.run('tool_rect'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 123, y: 50, to: { x: 200, y: 120 } }]))
    const rect = page.locator('#svgcontent g.layer > rect:not(#r)')
    expect(Number(await rect.getAttribute('x'))).toBe(120)
  })

  test('a hidden guide does not snap', async ({ page }) => {
    await makeVertical(page, 120)
    await page.evaluate(() => window.svgEditor.commands.run('guides_toggle_show'))
    await page.evaluate(() => window.svgEditor.commands.run('tool_rect'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 123, y: 50, to: { x: 200, y: 120 } }]))
    const rect = page.locator('#svgcontent g.layer > rect:not(#r)')
    expect(Number(await rect.getAttribute('x'))).toBe(123)
  })

  test('moving a shape aligns its edges to a guide', async ({ page }) => {
    await makeHorizontal(page, 200)
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    const from = await client(page, 330, 330)
    // drag the rect up so its top edge ends 3px below the guide (y = 203)
    const to = await client(page, 330, 233)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
    const box = await page.evaluate(() => {
      const el = document.getElementById('r')
      const bb = el.getBBox()
      const m = el.transform.baseVal.consolidate()?.matrix
      return { y: bb.y + (m ? m.f : 0) }
    })
    expect(box.y).toBe(200)
  })
})
