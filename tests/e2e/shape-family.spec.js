import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Real pointer + keyboard drags for the Spiral / Arc / Rectangular Grid / Polar
// Grid tools. The keyboard half matters here: the arrow keys step the counts
// and Space moves the shape while drawing, which goes through EditorStartup's
// document keydown/keyup handlers (the keyDown extension hook, and Space not
// resetting the mode), something the hand-mocked unit tests cannot see.
async function origin (page) {
  return page.evaluate(() => {
    const r = document.querySelector('#svgroot').getBoundingClientRect()
    const c = document.querySelector('#svgcontent')
    return { x: r.left + Number(c.getAttribute('x')), y: r.top + Number(c.getAttribute('y')), z: window.svgEditor.svgCanvas.getZoom() }
  })
}

test.describe('shape-family tools', () => {
  let o
  const at = (x, y) => [o.x + x * o.z, o.y + y * o.z]

  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    o = await origin(page)
  })

  const pick = (page, mode) => page.evaluate((m) => document.querySelector(`#tool_${m}`).click(), mode)
  const layer = (page) => page.locator('#svgcontent g.layer')

  test('the four tools are in the shapes flyout and arm their mode', async ({ page }) => {
    for (const mode of ['spiral', 'arc', 'rectgrid', 'polargrid']) {
      await pick(page, mode)
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe(mode)
    }
  })

  test('arrow keys step the grid counts mid-drag without nudging the selection', async ({ page }) => {
    // An existing, selected shape: the arrow keys must not move it while drawing.
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const el = c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 20, y: 20, width: 40, height: 40, id: c.getNextId() } })
      c.selectOnly([el])
    })
    await pick(page, 'rectgrid')
    await page.mouse.move(...at(100, 100))
    await page.mouse.down()
    await page.mouse.move(...at(160, 150), { steps: 4 })
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.mouse.up()

    const grid = layer(page).locator('> g')
    await expect(grid).toHaveCount(1)
    // 5 + 1 horizontal and 5 + 2 vertical dividers, plus the frame.
    await expect(grid.locator('> path')).toHaveCount(6 + 7)
    await expect(grid.locator('> rect')).toHaveCount(1)
    const first = layer(page).locator('> rect').first()
    expect(await first.getAttribute('transform')).toBeNull()
    expect(await first.getAttribute('x')).toBe('20')
    // Committed and selected, tool released back to select.
    // (core finishes a new shape after its short opacity animation)
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().map((e) => e.tagName))).toEqual(['g'])
  })

  test('Space moves the shape being drawn and does not end the drag', async ({ page }) => {
    await pick(page, 'polargrid')
    await page.mouse.move(...at(100, 100))
    await page.mouse.down()
    await page.mouse.move(...at(160, 140), { steps: 4 })
    await page.keyboard.down('Space')
    await page.mouse.move(...at(200, 180), { steps: 4 })
    await page.keyboard.up('Space')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('polargrid')
    await page.mouse.up()

    const rings = layer(page).locator('> g > ellipse')
    await expect(rings).toHaveCount(6)
    const outer = rings.last()
    // Box was 60x40 from (100,100); Space shifted it by (40,40).
    expect(Number(await outer.getAttribute('cx'))).toBeCloseTo(170, 0)
    expect(Number(await outer.getAttribute('cy'))).toBeCloseTo(160, 0)
    expect(Number(await outer.getAttribute('rx'))).toBeCloseTo(30, 0)
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().length)).toBe(1)
  })

  test('a spiral drags from its centre; undo removes it in one step', async ({ page }) => {
    await pick(page, 'spiral')
    await page.mouse.move(...at(200, 200))
    await page.mouse.down()
    await page.mouse.move(...at(260, 200), { steps: 4 })
    await page.mouse.up()
    const path = layer(page).locator('> path')
    await expect(path).toHaveCount(1)
    expect(await path.getAttribute('fill')).toBe('none')
    expect((await path.getAttribute('d')).match(/c/gi).length).toBe(10)
    // The insert is recorded once the new shape's opacity animation ends.
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().length)).toBe(1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(layer(page).locator('> path')).toHaveCount(0)
  })

  test('a click without a drag opens the options form; Create inserts the shape', async ({ page }) => {
    await pick(page, 'arc')
    await page.mouse.click(...at(300, 200))
    const form = page.locator('.shape_family_popover')
    await expect(form).toBeVisible()
    await expect(layer(page).locator('> *:not(title)')).toHaveCount(0)
    await form.locator('[name="width"]').fill('80')
    await form.locator('[name="height"]').fill('50')
    await form.locator('[name="closed"]').check()
    await form.locator('button[type="submit"]').click()
    await expect(form).toHaveCount(0)
    const path = layer(page).locator('> path')
    await expect(path).toHaveCount(1)
    const d = await path.getAttribute('d')
    expect(d).toMatch(/^m/i)
    expect(d).toMatch(/z$/i)
  })

  test('Escape while dragging removes the half-drawn shape', async ({ page }) => {
    await pick(page, 'rectgrid')
    await page.mouse.move(...at(100, 100))
    await page.mouse.down()
    await page.mouse.move(...at(160, 150), { steps: 4 })
    await expect(layer(page).locator('> g')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(layer(page).locator('> g')).toHaveCount(0)
    await page.mouse.up()
    await expect(layer(page).locator('> g')).toHaveCount(0)
  })

  test('at 200% zoom the drawn end point still lands under the pointer (document units, not zoomed)', async ({ page }) => {
    // The legacy extension hooks mixed spaces: start_x unzoomed, mouse_x zoomed.
    await page.evaluate(() => window.svgEditor.bottomPanel.changeZoom(200))
    o = await origin(page)
    expect(o.z).toBeCloseTo(2, 1)
    await pick(page, 'arc')
    await page.mouse.move(...at(100, 100))
    await page.mouse.down()
    await page.mouse.move(...at(160, 140), { steps: 5 })
    await page.mouse.up()
    const d = await layer(page).locator('> path').getAttribute('d')
    const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number)
    expect(nums[0]).toBeCloseTo(100, 0) // starts at the press point
    expect(nums[1]).toBeCloseTo(100, 0)
    // absolute or relative, the arc ends one drag away from where it began
    const box = await page.evaluate(() => {
      const b = document.querySelector('#svgcontent g.layer > path').getBBox()
      return { w: b.width, h: b.height }
    })
    expect(box.w).toBeCloseTo(60, 0)
    expect(box.h).toBeLessThanOrEqual(40.5)
  })

  test('a drag is exactly one undo step, and Escape leaves nothing on the undo stack', async ({ page }) => {
    await pick(page, 'rectgrid')
    await page.mouse.move(...at(100, 100))
    await page.mouse.down()
    await page.mouse.move(...at(160, 150), { steps: 4 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(0)

    await pick(page, 'rectgrid')
    await page.mouse.move(...at(100, 100))
    await page.mouse.down()
    await page.mouse.move(...at(160, 150), { steps: 4 })
    await page.mouse.up()
    await expect(layer(page).locator('> g')).toHaveCount(1)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(1)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getNextUndoCommandText())).toBe('Draw rectangular grid')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(layer(page).locator('> g')).toHaveCount(0)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    await expect(layer(page).locator('> g')).toHaveCount(1)
  })
})
