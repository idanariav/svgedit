import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Layout behaviour that needs real CSS layout (jsdom has none): the top bar's
// stable Undo/Redo slot, its two-tier collapse in narrow panes ("⋯" button),
// the pinned left-toolbar overflow button, and the bottom bar fitting its row.

const addAndSelect = (page, n = 1) => page.evaluate((count) => {
  const canv = window.svgEditor.svgCanvas
  const els = []
  for (let i = 0; i < count; i++) {
    els.push(canv.addSVGElementsFromJson({
      element: 'rect',
      curStyles: true,
      attr: { x: 50 + i * 90, y: 100, width: 60, height: 60, id: canv.getNextId() }
    }))
  }
  canv.selectOnly(els, true)
}, n)

const undoX = (page) => page.evaluate(() => Math.round(document.querySelector('#tool_undo').getBoundingClientRect().x))

const barState = (page) => page.evaluate(() => {
  const bar = document.querySelector('#tools_top')
  return {
    compact: bar.classList.contains('tt-compact'),
    tight: bar.classList.contains('tt-tight'),
    open: bar.classList.contains('tt-more-open'),
    overflow: bar.scrollWidth - bar.clientWidth,
    moreHidden: document.querySelector('#top_more').hidden,
    trayInBar: bar.querySelectorAll(':scope > .selected_panel, :scope > .multiselected_panel').length
  }
})

const desktop = async (page, width, height) => {
  await page.setViewportSize({ width, height })
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor?.configObj?.pref('tabletMode', false, true)
    document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
  })
  await page.waitForSelector('#tool_undo', { state: 'attached' })
}

test.describe('Top bar layout', () => {
  test('Undo/Redo stay put as the selection changes, and the bar does not overflow', async ({ page }) => {
    await desktop(page, 1440, 900)
    const none = await undoX(page)
    await addAndSelect(page, 1)
    await page.waitForTimeout(300)
    const one = await undoX(page)
    await addAndSelect(page, 2)
    await page.waitForTimeout(300)
    const multi = await undoX(page)
    expect(one).toBe(none)
    expect(multi).toBe(none)
    const s = await barState(page)
    expect(s.overflow).toBeLessThanOrEqual(1)
    expect(s.tight).toBe(false)
    expect(s.moreHidden).toBe(true)
  })

  test('bottom colour bar fits inside the editor', async ({ page }) => {
    await desktop(page, 1440, 900)
    const { bar, editor } = await page.evaluate(() => ({
      bar: document.querySelector('#tools_bottom').getBoundingClientRect().bottom,
      editor: document.querySelector('.svg_editor').getBoundingClientRect().bottom
    }))
    expect(bar).toBeLessThanOrEqual(editor + 0.5)
  })

  test('tight pane: object trays fold behind "⋯" and still work from the floating panel', async ({ page }) => {
    await desktop(page, 800, 600)
    await addAndSelect(page, 1)
    await expect(page.locator('#top_more')).toBeVisible()
    const s = await barState(page)
    expect(s.compact).toBe(true)
    expect(s.tight).toBe(true)
    expect(s.trayInBar).toBe(0)
    expect(s.overflow).toBeLessThanOrEqual(1)

    // Panel is closed until asked for; opening shows the single-selection tray.
    await expect(page.locator('#tool_clone')).toBeHidden()
    await page.locator('#top_more').click()
    await expect(page.locator('#tool_clone')).toBeVisible()
    expect((await barState(page)).open).toBe(true)

    const before = await page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)
    await page.locator('#tool_clone').click()
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)).toBe(before + 1)

    // Escape closes the panel (focus is inside the bar after the click).
    await page.locator('#top_more').focus()
    await page.keyboard.press('Escape')
    expect((await barState(page)).open).toBe(false)
    await expect(page.locator('#tool_clone')).toBeHidden()
  })

  test('tight pane: "⋯" disappears when nothing is selected and returns for a multi-selection', async ({ page }) => {
    await desktop(page, 800, 600)
    await addAndSelect(page, 1)
    await expect(page.locator('#top_more')).toBeVisible()
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await expect(page.locator('#top_more')).toBeHidden()
    // Nothing to fold: the (hidden) trays return to the bar and tight mode ends.
    expect((await barState(page)).tight).toBe(false)
    await addAndSelect(page, 2)
    await expect(page.locator('#top_more')).toBeVisible()
    await page.locator('#top_more').click()
    await expect(page.locator('#tool_clone_multi')).toBeVisible()
  })

  test('a light-width pane only compacts (no "⋯") when nothing needs folding', async ({ page }) => {
    await desktop(page, 1024, 700)
    await addAndSelect(page, 1)
    await page.waitForTimeout(300)
    const s = await barState(page)
    expect(s.overflow).toBeLessThanOrEqual(1)
    expect(s.moreHidden).toBe(true)
    await expect(page.locator('#tool_clone')).toBeVisible()
  })
})

test.describe('Palette and tablet bar in narrow panes', () => {
  test('palette swatches keep a usable width and the strip scrolls', async ({ page }) => {
    await desktop(page, 800, 600)
    const r = await page.evaluate(() => {
      const strip = document.querySelector('#palette').shadowRoot.querySelector('#js-se-palette')
      const sw = strip.querySelector('.palette_item:nth-child(5)')
      return { w: sw.getBoundingClientRect().width, scrolls: strip.scrollWidth > strip.clientWidth }
    })
    expect(r.w).toBeGreaterThanOrEqual(13.5)
    expect(r.scrolls).toBe(true)
  })

  for (const width of [1024, 900, 768]) {
    test(`tablet command bar fits at ${width}px (Undo/Redo stay visible)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await visitAndApproveStorage(page)
      await page.evaluate(() => window.svgEditor.configObj.pref('tabletMode', true, true))
      await page.reload()
      await page.waitForSelector('#ts_hist', { state: 'attached' })
      await page.waitForTimeout(500)
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.ts-topbar')
        const hist = document.querySelector('#ts_hist').getBoundingClientRect()
        return { over: bar.scrollWidth - bar.clientWidth, right: hist.right }
      })
      expect(r.over).toBeLessThanOrEqual(1)
      expect(r.right).toBeLessThanOrEqual(width)
    })
  }
})

test.describe('Left toolbar', () => {
  test('"Additional tools" stays reachable in a short pane', async ({ page }) => {
    await desktop(page, 1024, 600)
    const rect = await page.evaluate(() => document.querySelector('#tools_overflow').getBoundingClientRect())
    expect(rect.bottom).toBeLessThanOrEqual(600)
    expect(rect.height).toBeGreaterThan(0)
  })

  test('tools are grouped with dividers and the drawing tools sit together', async ({ page }) => {
    await desktop(page, 1440, 900)
    const { order, starts } = await page.evaluate(() => {
      const kids = [...document.querySelector('#tools_left').children].filter((e) => e.id && e.id !== 'tools_overflow')
      return {
        order: kids.map((e) => e.id),
        starts: kids.filter((e) => e.classList.contains('tool-group-start')).map((e) => e.id)
      }
    })
    const i = (id) => order.indexOf(id)
    expect(i('tool_fhpath')).toBeLessThan(i('tool_brush'))
    expect(i('tool_brush')).toBeLessThan(i('tool_path'))
    expect(i('tool_path')).toBeLessThan(i('tool_curvature'))
    expect(i('tool_curvature')).toBeLessThan(i('tool_line'))
    expect(i('tool_line') - i('tool_fhpath')).toBe(4)
    expect(starts).toEqual(expect.arrayContaining(['tool_fhpath', 'tools_shapes', 'tool_text']))
  })
})
