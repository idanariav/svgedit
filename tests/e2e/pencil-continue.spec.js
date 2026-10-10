import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The pencil carries on the selected open path when a stroke starts on one of its ends, and closes it when
// the stroke finishes on the other end.
test.describe('Pencil continues the selected open path', () => {
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
      <g class="layer">
        <title>Layer 1</title>
        <path id="a" d="M100,200 L200,200 L300,200" fill="none" stroke="#ff0000" stroke-width="3"/>
        <path id="other" d="M100,400 L300,400" fill="none" stroke="#0000ff" stroke-width="3"/>
      </g>
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
  // The pencil's stabiliser and spline capture trail the pointer: end a stroke the way a hand does, by settling.
  const settle = (pts) => [...pts, ...Array.from({ length: 12 }, () => pts[pts.length - 1])]
  const pencil = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_fhpath'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const draw = (page, pts, mods) => page.evaluate(([p, m]) => window.svgEditor.automation.pointer([
    { kind: 'down', ...p[0], mods: m },
    ...p.slice(1, -1).map((q) => ({ kind: 'move', ...q })),
    { kind: 'up', ...p[p.length - 1] }
  ]), [pts, mods])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const paths = (page) => page.locator('#svgcontent g.layer > path')
  const pairs = async (page, id) => {
    const n = (await page.locator(`#svgcontent #${id}`).getAttribute('d')).match(/-?\d+(?:\.\d+)?/g).map(Number)
    return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]])
  }

  test('a stroke from the last point of the selected path extends it: one path, one undo step', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    const before = await undoSize(page)
    // starts 2px off the end; the first point is snapped onto it
    await draw(page, settle(strokeOf([{ x: 302, y: 201 }, { x: 380, y: 280 }, { x: 460, y: 280 }])))
    await expect(paths(page)).toHaveCount(2)
    const pts = await pairs(page, 'a')
    expect(pts.slice(0, 3)).toEqual([[100, 200], [200, 200], [300, 200]])
    const last = pts[pts.length - 1]
    expect(Math.hypot(last[0] - 460, last[1] - 280)).toBeLessThan(3)
    expect(pts.length).toBeGreaterThan(3)
    expect(await page.locator('#svgcontent #a').getAttribute('stroke')).toBe('#ff0000')
    expect(await undoSize(page)).toBe(before + 1)
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await pairs(page, 'a')).toEqual([[100, 200], [200, 200], [300, 200]])
  })

  test('a stroke from the first point extends it from that side, keeping the direction', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    await draw(page, settle(strokeOf([{ x: 100, y: 200 }, { x: 40, y: 260 }, { x: 40, y: 330 }])))
    await expect(paths(page)).toHaveCount(2)
    const pts = await pairs(page, 'a')
    expect(pts.slice(-3)).toEqual([[100, 200], [200, 200], [300, 200]])
    const first = pts[0]
    expect(Math.hypot(first[0] - 40, first[1] - 330)).toBeLessThan(3)
  })

  test('ending the stroke on the other end closes the path', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    await draw(page, settle(strokeOf([{ x: 300, y: 200 }, { x: 300, y: 300 }, { x: 100, y: 300 }, { x: 102, y: 203 }])))
    await expect(paths(page)).toHaveCount(2)
    expect((await page.locator('#svgcontent #a').getAttribute('d')).trim()).toMatch(/Z$/)
  })

  test('a stroke away from the ends, or with nothing selected, makes a new path', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    await draw(page, strokeOf([{ x: 200, y: 250 }, { x: 260, y: 300 }]))
    await expect(paths(page)).toHaveCount(3)
    expect(await pairs(page, 'a')).toEqual([[100, 200], [200, 200], [300, 200]])
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await pencil(page)
    await draw(page, strokeOf([{ x: 300, y: 200 }, { x: 360, y: 240 }]))
    await expect(paths(page)).toHaveCount(4)
    expect(await pairs(page, 'a')).toEqual([[100, 200], [200, 200], [300, 200]])
  })

  test('only the selected path is continued, not any open path whose end is under the pen', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    await draw(page, strokeOf([{ x: 300, y: 400 }, { x: 360, y: 440 }]))
    await expect(paths(page)).toHaveCount(3)
    expect(await pairs(page, 'other')).toEqual([[100, 400], [300, 400]])
  })

  test('Alt starts a new path even on an end of the selected one', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    await draw(page, strokeOf([{ x: 300, y: 200 }, { x: 360, y: 240 }]), { alt: true })
    await expect(paths(page)).toHaveCount(3)
    expect(await pairs(page, 'a')).toEqual([[100, 200], [200, 200], [300, 200]])
  })

  test('a ring marks a continuable end of the selected path', async ({ page }) => {
    await select(page, 'a')
    await pencil(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'move', x: 301, y: 201 }]))
    await expect(page.locator('#pen_end_hint')).toHaveAttribute('display', 'inline')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'move', x: 400, y: 100 }]))
    await expect(page.locator('#pen_end_hint')).toHaveAttribute('display', 'none')
  })

  test('the preferences dialog sets the pencil stabilisation and fidelity, and they reach the pencil', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_editor_prefs'))
    const dialog = page.locator('se-edit-prefs-dialog')
    await expect(dialog.locator('#pencil_stabilization')).toHaveValue('30')
    await expect(dialog.locator('#pencil_fidelity')).toHaveValue('2')
    await dialog.locator('#pencil_stabilization').fill('60')
    await dialog.locator('#pencil_fidelity').fill('5')
    await dialog.locator('#tool_prefs_save').click()
    const live = await page.evaluate(() => {
      const cfg = window.svgEditor.svgCanvas.getCurConfig()
      return { stabilization: cfg.pencilStabilization, fidelity: cfg.pencilFidelity }
    })
    expect(live).toEqual({ stabilization: 0.6, fidelity: 5 })
    expect(await page.evaluate(() => String(window.svgEditor.configObj.pref('pencil_fidelity')))).toBe('5')
    // Reopened, the dialog shows what was saved.
    await page.evaluate(() => window.svgEditor.commands.run('tool_editor_prefs'))
    await expect(dialog.locator('#pencil_stabilization')).toHaveValue('60')
  })
})
