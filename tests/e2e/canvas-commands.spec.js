import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

test.describe('canvas page commands', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      localStorage.removeItem('svg-edit-canvas-layouts')
    })
  })

  test('size and background change through commands, are undoable, and show up in the debug log', async ({ page }) => {
    const r = await page.evaluate(() => {
      const ed = window.svgEditor
      const log = []
      ed.setDebugLogger((event, d) => { if (event === 'action') log.push(d) })
      ed.commands.run('canvas_set_size', { width: 500, height: 300 })
      const size = ed.svgCanvas.getResolution()
      ed.commands.run('canvas_set_background', { color: '#336699' })
      const fill = document.querySelector('#canvasBackground rect')?.getAttribute('fill')
      const bgPref = ed.configObj.pref('bkgd_color')
      ed.commands.run('tool_undo')
      return {
        size: [Math.round(size.w), Math.round(size.h)],
        fill,
        bgPref,
        bgAfterUndo: ed.configObj.pref('bkgd_color'),
        actions: log.map((a) => [a.command, a.outcome, a.params])
      }
    })
    expect(r.size).toEqual([500, 300])
    expect(r.bgPref).toBe('#336699')
    expect(r.bgAfterUndo).not.toBe('#336699')
    expect(r.actions).toEqual([
      ['canvas_set_size', 'ran', { width: 500, height: 300 }],
      ['canvas_set_background', 'ran', { color: '#336699' }],
      ['tool_undo', 'ran', undefined]
    ])
  })

  test('a saved layout is listed as a choice and applying it restores its size and background', async ({ page }) => {
    const r = await page.evaluate(() => {
      const ed = window.svgEditor
      ed.commands.run('canvas_set_size', { width: 640, height: 480 })
      ed.commands.run('canvas_set_background', { color: '#112233' })
      ed.commands.run('canvas_save_layout', { name: 'Card' })
      ed.commands.run('canvas_set_size', { width: 100, height: 100 })
      ed.commands.run('canvas_set_background', { color: '#ffffff' })
      const listed = ed.commands.list().find((c) => c.id === 'canvas_apply_layout')
      ed.commands.run('canvas_apply_layout', { name: 'Card' })
      const size = ed.svgCanvas.getResolution()
      return { values: listed.params.name.values, size: [Math.round(size.w), Math.round(size.h)], bg: ed.configObj.pref('bkgd_color') }
    })
    expect(r.values).toEqual(['Card'])
    expect(r.size).toEqual([640, 480])
    expect(r.bg).toBe('#112233')
  })
})
