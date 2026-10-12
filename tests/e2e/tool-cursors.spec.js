import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Each tool shows its own cursor on the canvas while it is the mode; select goes back to the default.
test.describe('Tool cursors', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  const cursorIn = (page, mode) => page.evaluate((m) => {
    window.svgEditor.svgCanvas.setMode(m)
    return window.svgEditor.workarea.style.cursor
  }, mode)

  test('drawing tools, old and new, get their own cursor', async ({ page }) => {
    for (const mode of ['rect', 'fhpath', 'path', 'line', 'curvature', 'brush', 'cutter', 'eyedropper', 'shaper', 'smooth', 'width']) {
      expect(await cursorIn(page, mode), mode).toMatch(/^url\(.*\) \d+(px)? \d+(px)?, crosshair$/)
    }
  })

  test('the cursor follows the mode: select is the default, text and pan keep theirs', async ({ page }) => {
    expect(await cursorIn(page, 'line')).toContain('url(')
    expect(await cursorIn(page, 'select')).toBe('auto')
    expect(await cursorIn(page, 'text')).toBe('text')
    expect(await cursorIn(page, 'ext-panning')).toBe('grab')
  })

  test('a tool with a tip is the cursor, its tip the hotspot (no arrow beside it)', async ({ page }) => {
    const pencil = await cursorIn(page, 'fhpath')
    expect(pencil).toMatch(/\) 3(px)? 29(px)?, crosshair$/)
    const rect = await cursorIn(page, 'rect')
    expect(rect).toMatch(/\) 8(px)? 8(px)?, crosshair$/)
  })

  test('select mode: the move cursor shows over a shape and goes back to the default elsewhere', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 100, y: 100, width: 80, height: 60, id: c.getNextId() } })
      c.setMode('select')
    })
    const move = (x, y) => page.evaluate(([px, py]) => window.svgEditor.automation.pointer([{ kind: 'move', x: px, y: py }]), [x, y])
    const state = () => page.evaluate(() => ({ hint: window.svgEditor.svgCanvas.getCursorHint(), cursor: window.svgEditor.workarea.style.cursor }))
    await move(400, 400)
    expect(await state()).toEqual({ hint: null, cursor: 'auto' })
    await move(140, 130)
    const over = await state()
    expect(over.hint).toBe('move')
    expect(over.cursor).toMatch(/^url\(.*\) 16(px)? 16(px)?, crosshair$/)
    await move(400, 400)
    expect(await state()).toEqual({ hint: null, cursor: 'auto' })
  })

  test('a different glyph per tool', async ({ page }) => {
    const seen = new Set()
    for (const mode of ['fhpath', 'path', 'line', 'brush']) seen.add(await cursorIn(page, mode))
    expect(seen.size).toBe(4)
  })
})
