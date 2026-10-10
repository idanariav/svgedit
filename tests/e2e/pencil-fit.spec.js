import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The pencil commit and Smooth Path on the corner-keeping fit (core/path-fit.js), in the real editor.
test.describe('Pencil and Smooth Path fit', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title></g>
    </svg>`)
  })

  const strokeOf = (verts, step = 3) => {
    const pts = []
    for (let i = 0; i + 1 < verts.length; i++) {
      const [a, b] = [verts[i], verts[i + 1]]
      const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step))
      for (let k = 0; k < n; k++) pts.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })
    }
    pts.push(verts[verts.length - 1])
    return pts
  }
  const draw = async (page, pts) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_fhpath'))
    await page.evaluate((p) => window.svgEditor.automation.pointer([
      { kind: 'down', ...p[0] },
      ...p.slice(1, -1).map((q) => ({ kind: 'move', ...q })),
      { kind: 'up', ...p[p.length - 1] }
    ]), pts)
  }
  const path = (page) => page.locator('#svgcontent g.layer > path').last()
  const anchors = (page) => page.evaluate(() => {
    const d = document.querySelector('#svgcontent g.layer > path:last-of-type').getAttribute('d')
    return { d, segments: (d.match(/[CL]/g) || []).length, nums: d.match(/-?\d+(\.\d+)?/g).map(Number) }
  })

  test('a pencil stroke with a sharp turn commits as a few segments and keeps the turn sharp', async ({ page }) => {
    const stroke = strokeOf([{ x: 100, y: 300 }, { x: 220, y: 100 }, { x: 340, y: 300 }])
    await draw(page, stroke)
    await expect(path(page)).toHaveAttribute('data-freehand', '1')
    const { segments, nums } = await anchors(page)
    expect(stroke.length).toBeGreaterThan(100)
    expect(segments).toBeLessThanOrEqual(4)
    // an anchor (x,y pair in the data) sits on the apex of the V, not rounded off beside it
    const pairs = []
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]])
    expect(pairs.some(([x, y]) => Math.hypot(x - 220, y - 100) < 6)).toBe(true)
  })

  test('the committed path opens in the node editor with its anchors', async ({ page }) => {
    await draw(page, strokeOf([{ x: 100, y: 300 }, { x: 220, y: 100 }, { x: 340, y: 300 }]))
    const grips = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const el = document.querySelector('#svgcontent g.layer > path:last-of-type')
      c.selectOnly([el], true)
      c.pathActions.toEditMode(el)
      return document.querySelectorAll('[id^="pathpointgrip_"]').length
    })
    expect(grips).toBeGreaterThanOrEqual(3)
  })

  test('the legacy smoothing is still available', async ({ page }) => {
    await page.evaluate(() => { window.svgEditor.svgCanvas.getCurConfig().pencilSimplify = false })
    await draw(page, strokeOf([{ x: 100, y: 300 }, { x: 220, y: 100 }, { x: 340, y: 300 }]))
    await expect(path(page)).toHaveAttribute('data-freehand', '1')
  })

  test('Smooth Path is offered on a hand-built path, refits it, and is one undo step', async ({ page }) => {
    const dense = []
    for (let i = 0; i <= 80; i++) dense.push(`${100 + i * 3},${300 - i * 1.5 + Math.sin(i * 1.9) * 0.4}`)
    for (let i = 1; i <= 50; i++) dense.push(`${340 - i * 2.4},${180 + i * 2.2 + Math.cos(i * 2.1) * 0.4}`)
    await page.evaluate((pts) => {
      const c = window.svgEditor.svgCanvas
      const el = c.addSVGElementsFromJson({ element: 'path', curStyles: true, attr: { id: c.getNextId(), d: 'M' + pts.join(' L'), fill: 'none', stroke: '#000000' } })
      c.selectOnly([el], true)
    }, dense)
    const shown = await page.evaluate(() => getComputedStyle(document.querySelector('.tool_smooth_path')).display !== 'none')
    expect(shown).toBe(true)
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
    const original = (await anchors(page)).d
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.previewSmoothPath(0.4)
      window.svgEditor.svgCanvas.commitSmoothPath()
    })
    const after = await anchors(page)
    expect(after.segments).toBeLessThan(12)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect((await anchors(page)).d).toBe(original)
  })

  test('Smooth Path is not offered on a path with live geometry', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const el = c.addSVGElementsFromJson({ element: 'path', curStyles: true, attr: { id: c.getNextId(), d: 'M10,10 L100,10 L100,90', 'se:orig-d': 'M10,10 L100,10 L100,90', fill: 'none', stroke: '#000' } })
      c.selectOnly([el], true)
    })
    const shown = await page.evaluate(() => getComputedStyle(document.querySelector('.tool_smooth_path')).display !== 'none')
    expect(shown).toBe(false)
  })
})
