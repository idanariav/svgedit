import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="60" height="60" fill="#00aa00"/>
  </g>
</svg>`

// The debug log is the record an LLM reads to retrace a session: what the user pressed, which
// command ran from where, what the gesture committed and whether the drawing stayed healthy.
test.describe('debug log (action stream)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(async (doc) => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      await window.svgEditor.loadFromString(doc)
      window.__log = []
      window.svgEditor.setDebugLogger((event, detail) => window.__log.push({ event, ...detail }))
    }, DOC)
  })

  test('a drawn rect, a hotkey and an undo read back as one ordered story', async ({ page }) => {
    const log = await page.evaluate(async () => {
      const ed = window.svgEditor
      ed.svgCanvas.setMode('rect')
      ed.automation.pointer([{ kind: 'drag', x: 300, y: 200, to: { x: 380, y: 260 }, steps: 4 }])
      await new Promise((resolve) => setTimeout(resolve, 300)) // a shape is committed after the release
      ed.automation.key('mod+z')
      return window.__log
    })
    const names = log.map((e) => e.event)
    expect(names[0]).toBe('session-start')
    expect(log[0]).toMatchObject({ mode: 'select', drawing: { ok: true } })
    expect(log.map((e) => e.seq)).toEqual(log.map((_, i) => i + 1))

    const down = log.find((e) => e.event === 'pointer-down')
    const up = log.find((e) => e.event === 'pointer-up')
    expect(down).toMatchObject({ mode: 'rect', button: 0 })
    expect(down.doc[0]).toBeCloseTo(300, 0)
    expect(up.moves).toBeGreaterThan(0)
    expect(up.undoSizeAtDown).toBe(0)

    expect(names).toContain('history-push')
    expect(names.indexOf('pointer-down')).toBeLessThan(names.indexOf('history-push'))
    expect(log.find((e) => e.event === 'history-push').undoSize).toBe(1)

    const undo = log.find((e) => e.event === 'action' && e.command === 'tool_undo')
    expect(undo).toMatchObject({ source: 'hotkey', outcome: 'ran', drawing: { ok: true } })
    expect(undo.undo).toMatch(/^\d+->\d+$/)
    expect(log.find((e) => e.event === 'key')).toMatchObject({ command: 'tool_undo' })
  })

  test('a command run through the API is an api action; a refused one says why', async ({ page }) => {
    const log = await page.evaluate(() => {
      const ed = window.svgEditor
      ed.svgCanvas.clearSelection()
      ed.commands.tryRun('tool_delete')
      return window.__log.filter((e) => e.event === 'action')
    })
    expect(log[0]).toMatchObject({ command: 'tool_delete', source: 'api', outcome: 'disabled' })
    expect(log[0].error).toBeTruthy()
  })

  test('turning it off stops every channel', async ({ page }) => {
    const after = await page.evaluate(() => {
      const ed = window.svgEditor
      ed.setDebugLogger(null)
      const n = window.__log.length
      ed.svgCanvas.setMode('rect')
      ed.commands.tryRun('tool_undo')
      return window.__log.length - n
    })
    expect(after).toBe(0)
  })
})
