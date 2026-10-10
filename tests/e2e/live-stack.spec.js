import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The live stack: corner radius, live effects and a variable-width stroke on one element
// (corners + width, effects + width), one undo step per change, surviving moves and save/load.
test.describe('Live stack', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com">
      <g class="layer">
        <title>Layer 1</title>
        <path id="sq" d="M100,100 L300,100 L300,260 L100,260 Z" stroke="#1e3a8a" stroke-width="14" fill="none"/>
        <path id="wave" d="M100,380 L520,380" stroke="#7f1d1d" stroke-width="14" fill="none"/>
      </g>
    </svg>`)
  })

  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const attrs = (page, id) => page.evaluate((i) => Object.fromEntries([...document.getElementById(i).attributes].map((a) => [a.name, a.value])), id)
  const lens = [[0, 0, 0], [0.5, 1, 1], [1, 0, 0]]
  const widthOn = (page) => page.evaluate((pts) => window.svgEditor.svgCanvas.applyWidthProfile(pts).length, lens)
  const stackHealthy = (page) => page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    return c.checkDrawing().filter((f) => f.code === 'se-stack')
  })

  test('rounded corners on a width stroke: one undo step, a real move keeps the stack current', async ({ page }) => {
    await select(page, 'sq')
    expect(await widthOn(page)).toBe(1)
    const centerline = (await attrs(page, 'sq'))['se:taper-d']
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.applyCornerRadius(30))
    expect(await undoSize(page)).toBe(undo0 + 1)
    let a = await attrs(page, 'sq')
    expect(a['se:orig-d']).toMatch(/^M100,100/)
    expect(a['se:taper-d']).toContain('A') // the cut centerline
    expect(a.stroke).toBe('none')
    expect(await stackHealthy(page)).toEqual([])

    // a real drag in select mode bakes the move into every source
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 200, y: 100, to: { x: 240, y: 140 }, steps: 8 }]))
    a = await attrs(page, 'sq')
    expect(a['se:orig-d']).toMatch(/^M140,140/)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.reconcileLiveStack(document.getElementById('sq')))).toBe(true)
    expect(await stackHealthy(page)).toEqual([])

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo()) // the move
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo()) // the corners
    a = await attrs(page, 'sq')
    expect('se:orig-d' in a).toBe(false)
    expect(a['se:taper-d']).toBe(centerline)
  })

  test('effects under a width stroke, then a width point added by the Width tool', async ({ page }) => {
    await select(page, 'wave')
    await page.evaluate(() => window.svgEditor.svgCanvas.applyWidthProfile([[0, 1, 1], [1, 1, 1]]))
    const undo0 = await undoSize(page)
    const applied = await page.evaluate(() => !!window.svgEditor.svgCanvas.applyLiveEffects([
      { name: 'zigZag', params: { size: 12, ridges: 6, relative: false, points: 'corner' } }
    ]))
    expect(applied).toBe(true)
    expect(await undoSize(page)).toBe(undo0 + 1)
    const a = await attrs(page, 'wave')
    expect(a['se:fx-d']).toBe('M100,380 L520,380')
    expect(a['se:taper-d']).not.toBe(a['se:fx-d']) // the zig-zagged centerline
    expect(a['se:taper-d'].match(/L/g).length).toBeGreaterThan(5)
    expect(await stackHealthy(page)).toEqual([])

    // the Width tool works on the mirrored centerline; the stack stays consistent
    await page.evaluate(() => window.svgEditor.commands.run('tool_width'))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 310, y: 380, to: { x: 310, y: 340 }, steps: 10 }]))
    const profile = await page.evaluate(() => document.getElementById('wave').getAttribute('se:width-profile'))
    expect(profile.split(';').length).toBeGreaterThanOrEqual(3)
    expect(await stackHealthy(page)).toEqual([])
    expect((await attrs(page, 'wave'))['se:fx-d']).toBe('M100,380 L520,380')
  })

  test('the sections follow the stack: corners offered over a width stroke, Scribble withheld', async ({ page }) => {
    await select(page, 'sq')
    await widthOn(page)
    await select(page, 'sq')
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('corner_panel')).display)).not.toBe('none')
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('ext-live-effects-note')).display)).not.toBe('none')
    const refused = await page.evaluate(() => window.svgEditor.svgCanvas.applyLiveEffects([{ name: 'scribble' }]))
    expect(refused).toBeNull()
    expect((await attrs(page, 'sq'))['se:fx-d']).toBeUndefined()
  })

  test('save → load keeps a stacked element as it was', async ({ page }) => {
    await select(page, 'sq')
    await widthOn(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.applyCornerRadius(24))
    await select(page, 'wave')
    await page.evaluate(() => window.svgEditor.svgCanvas.applyWidthProfile([[0, 0.2, 0.2], [0.5, 1, 1], [1, 0.2, 0.2]]))
    await page.evaluate(() => window.svgEditor.svgCanvas.applyLiveEffects([{ name: 'roughen', params: { size: 4, detail: 2, relative: false, seed: 7, points: 'smooth' } }]))
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    if (process.env.WRITE_FIXTURES) {
      fs.writeFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/live-stack.svg'), svg)
    }
    await setSvgSource(page, svg)
    for (const id of ['sq', 'wave']) {
      expect(await page.evaluate((i) => window.svgEditor.svgCanvas.reconcileLiveStack(document.getElementById(i)), id)).toBe(true)
    }
    expect(await stackHealthy(page)).toEqual([])
  })
})
