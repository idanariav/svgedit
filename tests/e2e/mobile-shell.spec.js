import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, dragInDocument } from './helpers.js'

// The mobile shell opens view-only (nothing in the drawing can change), and Edit gives Pan, Pencil and Text.
test.describe('Mobile shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.configObj.pref('uiMode', 'mobile', true))
    await page.reload()
    await page.waitForSelector('#ms_bar .mbtn', { state: 'attached' })
    await page.waitForTimeout(400)
    await page.evaluate((svg) => window.svgEditor.loadSvgString(svg), `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
      <g class="layer"><title>Layer 1</title>
        <rect id="r1" x="40" y="40" width="80" height="60" fill="#2563EB"/>
        <text id="t1" x="150" y="200" font-size="24" fill="#000">hello</text>
      </g></svg>`)
    await page.evaluate(() => window.svgEditor.commands.run('zoom_fit'))
  })

  const state = (page) => page.evaluate(() => {
    const e = window.svgEditor
    return {
      mobile: e.$svgEditor.classList.contains('ui-mobile'),
      viewOnly: e.viewOnly,
      mode: e.svgCanvas.getMode(),
      undo: e.svgCanvas.undoMgr.getUndoStackSize(),
      editing: document.querySelector('.mobile-shell').classList.contains('is-editing'),
      selected: e.svgCanvas.getSelectedElements().filter(Boolean).length
    }
  })
  const rectX = (page) => page.evaluate(() => {
    const r = document.getElementById('r1')
    return [r.getAttribute('x'), r.getAttribute('transform')]
  })

  test('opens in the view state, where nothing can change the drawing', async ({ page }) => {
    const before = await rectX(page)
    let s = await state(page)
    expect(s).toMatchObject({ mobile: true, viewOnly: true, editing: false })
    await expect(page.locator('#ms_edit')).toBeVisible()
    await expect(page.locator('#ms_bar')).toBeHidden()

    // Commands refuse, whatever runs them (hotkeys and the host API go through the same gate).
    expect(await page.evaluate(() => window.svgEditor.commands.tryRun('select_all'))).toBe(false)
    expect(await page.evaluate(() => window.svgEditor.commands.tryRun('tool_select'))).toBe(false)
    expect(await page.evaluate(() => window.svgEditor.commands.isEnabled('zoom_in'))).toBe(true)

    // A drag over a shape pans, even after a double-tap or Space drifted the canvas to Select.
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await dragInDocument(page, { x: 80, y: 70 }, { x: 160, y: 150 })
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'dblclick', x: 80, y: 70, space: 'doc' }]))
    await dragInDocument(page, { x: 80, y: 70 }, { x: 160, y: 150 })

    // Paste and the long-press context menu do nothing.
    expect(await page.evaluate(() => window.svgEditor.applyClipboardText('<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5"/></svg>'))).toBe(false)
    await page.evaluate(() => {
      const r = document.getElementById('r1').getBoundingClientRect()
      document.getElementById('r1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 }))
    })
    const menuShown = await page.evaluate(() =>
      document.querySelector('se-cmenu_canvas-dialog')?.shadowRoot?.querySelector('#cmenu_canvas')?.style.display === 'block')
    expect(menuShown).toBe(false)

    s = await state(page)
    expect(s).toMatchObject({ viewOnly: true, mode: 'ext-panning', undo: 0, selected: 0 })
    expect(await rectX(page)).toEqual(before)
  })

  test('Edit draws with the pencil in the picked colour; Done goes back to viewing', async ({ page }) => {
    await page.locator('#ms_edit').click()
    let s = await state(page)
    expect(s).toMatchObject({ viewOnly: false, editing: true, mode: 'fhpath' })
    await expect(page.locator('#ms_bar')).toBeVisible()

    await page.locator('.ms-chip').click()
    await expect(page.locator('#ms_palette')).toBeVisible()
    await page.locator('.ms-swatch[data-color="#E11D48"]').click()
    await page.locator('.ms-width[data-width="5"]').click()

    await dragInDocument(page, { x: 30, y: 250 }, { x: 250, y: 260 }, { steps: 20 })
    s = await state(page)
    expect(s.undo).toBe(1)
    expect(s.mode).toBe('fhpath') // tool lock: the pencil stays armed
    const stroke = await page.evaluate(() => {
      const p = [...document.querySelectorAll('#svgcontent path')].pop()
      return [p?.getAttribute('stroke'), p?.getAttribute('stroke-width')]
    })
    expect(stroke).toEqual(['#E11D48', '5'])

    await page.locator('.ms-done').click()
    s = await state(page)
    expect(s).toMatchObject({ viewOnly: true, editing: false, mode: 'ext-panning', undo: 1 })
  })

  test('the Text tool places a new text, and a tap on an existing one edits it', async ({ page }) => {
    await page.locator('#ms_edit').click()
    await page.locator('#ms_bar .mbtn[title="Text"]').click()
    expect((await state(page)).mode).toBe('text')

    const count = () => page.evaluate(() => document.querySelectorAll('#svgcontent text').length)
    expect(await count()).toBe(1)
    await page.evaluate(() => {
      const r = document.getElementById('t1').getBoundingClientRect()
      window.svgEditor.automation.pointer([{ kind: 'click', x: r.x + r.width / 2, y: r.y + r.height / 2, space: 'screen' }])
    })
    const editing = await page.evaluate(() => ({
      mode: window.svgEditor.svgCanvas.getMode(),
      sel: window.svgEditor.svgCanvas.getSelectedElements()[0]?.id
    }))
    expect(editing).toEqual({ mode: 'textedit', sel: 't1' })
    expect(await count()).toBe(1)

    // A tap elsewhere ends the edit; the next one places a new text.
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 60, y: 260, space: 'doc' }]))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 60, y: 260, space: 'doc' }]))
    expect((await state(page)).mode).toBe('textedit')
    await page.keyboard.type('new')
    await page.keyboard.press('Enter')
    expect(await count()).toBe(2)
  })

  test('leaving mobile mode lifts view only', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_mobile_mode'))
    const s = await state(page)
    expect(s).toMatchObject({ mobile: false, viewOnly: false, mode: 'select' })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getToolLocked())).toBe(false)
    expect(await page.evaluate(() => window.svgEditor.commands.tryRun('select_all'))).toBe(true)
  })
})
