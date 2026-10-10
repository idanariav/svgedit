import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="60" height="60" fill="#00aa00"/>
    <rect id="b" x="200" y="50" width="60" height="60" fill="#0000aa"/>
  </g>
</svg>`

const prepare = async (page) => {
  await page.evaluate(() => {
    window.svgEditor?.configObj?.pref('tabletMode', false, true)
    document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
  })
  await page.evaluate(async (doc) => { await window.svgEditor.loadFromString(doc) }, DOC)
}

const selectA = (page) => page.evaluate(() => {
  const c = window.svgEditor.svgCanvas
  c.selectOnly([document.getElementById('a')])
  document.body.focus()
})

const rectCount = (page) => page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)
const undoSteps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

test.describe('command registry', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await prepare(page)
  })

  test('Duplicate through hotkey, button and commands.run is one implementation, one undo step each', async ({ page }) => {
    // Hotkey (D)
    await selectA(page)
    await page.keyboard.press('d')
    expect(await rectCount(page)).toBe(3)
    expect(await undoSteps(page)).toBe(1)

    // Button
    await selectA(page)
    await page.evaluate(() => document.getElementById('tool_clone').click())
    expect(await rectCount(page)).toBe(4)
    expect(await undoSteps(page)).toBe(2)

    // Registry (what the host API and the favorites menu call)
    await selectA(page)
    await page.evaluate(() => window.svgEditor.commands.run('tool_clone'))
    expect(await rectCount(page)).toBe(5)
    expect(await undoSteps(page)).toBe(3)

    // Each one undoes in a single step
    for (const n of [4, 3, 2]) {
      await page.evaluate(() => window.svgEditor.commands.run('tool_undo'))
      expect(await rectCount(page)).toBe(n)
    }
  })

  test('commands without a selection are disabled with a reason, and run() rejects', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    const r = await page.evaluate(() => {
      const ed = window.svgEditor
      const info = ed.commands.list().find((c) => c.id === 'tool_clone')
      let code = null
      try { ed.commands.run('tool_clone') } catch (e) { code = e.code }
      return { info, code }
    })
    expect(r.info).toMatchObject({ enabled: false, disabledReason: 'No selection' })
    expect(r.code).toBe('disabled')
  })

  test('undo / redo follow their command state (button disabled, hotkey inert)', async ({ page }) => {
    const state = () => page.evaluate(() => ({
      undoDisabled: document.getElementById('tool_undo').disabled,
      redoDisabled: document.getElementById('tool_redo').disabled
    }))
    expect(await state()).toEqual({ undoDisabled: true, redoDisabled: true })
    await selectA(page)
    await page.keyboard.press('d')
    expect(await state()).toEqual({ undoDisabled: false, redoDisabled: true })
    await page.keyboard.press('ControlOrMeta+z')
    expect(await rectCount(page)).toBe(2)
    expect(await state()).toEqual({ undoDisabled: true, redoDisabled: false })
    await page.keyboard.press('ControlOrMeta+z') // nothing to undo: must be a no-op, not an error
    expect(await rectCount(page)).toBe(2)
  })

  test('list() covers every visible toolbar button id and the pilot commands are real', async ({ page }) => {
    const r = await page.evaluate(() => {
      const ed = window.svgEditor
      const listed = new Set(ed.commands.list().map((c) => c.id))
      const buttons = [...ed.$container.querySelectorAll('se-button[id], se-menu-item[id]')].map((b) => b.id)
      return {
        missing: buttons.filter((id) => !listed.has(id)),
        pilots: ['tool_clone', 'tool_delete', 'tool_group_elements', 'tool_ungroup', 'tool_undo', 'tool_redo', 'paste', 'zoom_fit']
          .map((id) => [id, ed.commands.get(id)?.adapter])
      }
    })
    expect(r.missing).toEqual([])
    for (const [, adapter] of r.pilots) expect(adapter).toBe(false)
  })

  test('paste_in_place and zoom_fit are commands now (formerly favorites-only)', async ({ page }) => {
    const ids = await page.evaluate(() => window.svgEditor.commands.list().map((c) => c.id))
    expect(ids).toEqual(expect.arrayContaining(['paste', 'paste_in_place', 'zoom_fit']))
    await page.evaluate(() => window.svgEditor.commands.run('zoom_fit'))
  })

  test('stored hotkey overrides and favorites keep working after the registry change', async ({ page }) => {
    await page.evaluate(() => {
      // the multi-selection toolbar's duplicate button shares the default `D`, so both ids are rebound
      localStorage.setItem('svg-edit-hotkeys', JSON.stringify({ tool_clone: ['shift+d'], tool_clone_multi: [] }))
    })
    await page.reload()
    await page.waitForSelector('#svgroot', { timeout: 20000 })
    await prepare(page)
    await selectA(page)
    await page.keyboard.press('d') // default key was rebound away
    expect(await rectCount(page)).toBe(2)
    await page.keyboard.press('Shift+D')
    expect(await rectCount(page)).toBe(3)
  })
})
