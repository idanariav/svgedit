import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Blends: two shapes → steps between them; the Blend tool (the first tool with an options bar) and the
// Make / Expand / Release commands.
test.describe('Blend', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="ra" x="60" y="100" width="40" height="40" fill="#e53e3e" stroke="#742a2a" stroke-width="2"/>
        <circle id="cb" cx="320" cy="120" r="30" fill="#3182ce" stroke="#2a4365" stroke-width="8"/>
        <rect id="rc" x="520" y="300" width="50" height="30" fill="#38a169" stroke="#22543d" stroke-width="2"/>
      </g>
    </svg>`)
  })

  const select = (page, ids) => page.evaluate((list) => window.svgEditor.svgCanvas.selectOnly(list.map((i) => document.getElementById(i)), true), ids)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const run = (page, id) => page.evaluate((i) => window.svgEditor.commands.run(i), id)
  const enabled = (page, id) => page.evaluate((i) => window.svgEditor.commands.get(i).enabled(window.svgEditor), id)
  const blend = (page) => page.evaluate(() => {
    const g = [...document.querySelectorAll('g')].find((e) => e.hasAttribute('se:blend'))
    if (!g) return null
    return {
      id: g.id,
      spec: g.getAttribute('se:blend'),
      keys: [...g.children].filter((c) => c.hasAttribute('se:blend-key')).map((c) => c.id),
      steps: [...g.children].filter((c) => c.hasAttribute('se:blend-steps')).map((s) => s.children.length)
    }
  })
  const click = (page, x, y) => page.evaluate(([px, py]) => window.svgEditor.automation.pointer([{ kind: 'click', x: px, y: py }]), [x, y])
  const healthy = (page) => page.evaluate(() => window.svgEditor.svgCanvas.checkDrawing().filter((f) => /blend|se-attr/.test(f.code)))

  test('the commands follow the selection', async ({ page }) => {
    await select(page, ['ra'])
    expect(await enabled(page, 'blend_make')).not.toBe(true)
    expect(await enabled(page, 'blend_expand')).not.toBe(true)
    await select(page, ['ra', 'cb'])
    expect(await enabled(page, 'blend_make')).toBe(true)
  })

  test('Make blend: one undo step, steps between the keys; Release gives the shapes back', async ({ page }) => {
    await select(page, ['ra', 'cb'])
    const undo0 = await undoSize(page)
    await run(page, 'blend_make')
    expect(await undoSize(page)).toBe(undo0 + 1)
    let b = await blend(page)
    expect(b.keys).toEqual(['ra', 'cb'])
    expect(b.steps).toEqual([5])
    expect(await healthy(page)).toEqual([])
    expect(await enabled(page, 'blend_expand')).toBe(true)

    await run(page, 'blend_release')
    expect(await blend(page)).toBeNull()
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent rect, #svgcontent circle').length)).toBe(3)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    b = await blend(page)
    expect(b.steps).toEqual([5])
  })

  test('the Blend tool: click one shape, then another; its options bar sets the spacing', async ({ page }) => {
    await run(page, 'tool_blend')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('blend')
    // the bar shows the tool's options
    const bar = page.locator('#tool_options_panel')
    await expect(bar).toBeVisible()
    await expect(bar.locator('se-select[data-option="mode"]')).toHaveCount(1)
    await expect(bar.locator('se-spin-input[data-option="steps"]')).toHaveCount(1)
    await expect(bar.locator('se-spin-input[data-option="distance"]')).toHaveCount(0)

    const undo0 = await undoSize(page)
    await click(page, 80, 120) // ra
    expect(await blend(page)).toBeNull()
    await click(page, 320, 120) // cb
    expect(await undoSize(page)).toBe(undo0 + 1)
    const b = await blend(page)
    expect(b.keys).toEqual(['ra', 'cb'])
    expect(b.steps).toEqual([5])

    // a shape and then the blend (a click on one of its steps) add the shape as one more key
    await click(page, 545, 315) // rc
    await click(page, 190, 120) // a step
    expect((await blend(page)).keys).toEqual(['ra', 'cb', 'rc'])
    expect(await undoSize(page)).toBe(undo0 + 2)
    expect(await healthy(page)).toEqual([])
  })

  test('the options bar changes the selected blend as one undo step', async ({ page }) => {
    await select(page, ['ra', 'cb'])
    await run(page, 'blend_make')
    await run(page, 'tool_blend')
    const bar = (id, value) => page.evaluate(([option, v]) => {
      const el = document.querySelector(`#tool_options_panel [data-option="${option}"]`)
      el.value = v
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, [id, value])
    const undo0 = await undoSize(page)
    await bar('steps', 3)
    expect((await blend(page)).steps).toEqual([3])
    expect(await undoSize(page)).toBe(undo0 + 1)
    await bar('mode', 'distance')
    await expect(page.locator('#tool_options_panel se-spin-input[data-option="distance"]')).toHaveCount(1)
    await expect(page.locator('#tool_options_panel se-spin-input[data-option="steps"]')).toHaveCount(0)
    expect((await blend(page)).spec).toContain('mode=distance')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect((await blend(page)).steps).toEqual([5])
  })

  test('leaving the tool hides its options bar', async ({ page }) => {
    await run(page, 'tool_blend')
    await expect(page.locator('#tool_options_panel')).toBeVisible()
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await expect(page.locator('#tool_options_panel')).toBeHidden()
  })

  test('moving a key regenerates the steps; undo puts them back', async ({ page }) => {
    await select(page, ['ra', 'cb'])
    await run(page, 'blend_make')
    const stepsD = () => page.evaluate(() => [...document.querySelectorAll('g[se\\:blend-steps] path')].map((p) => p.getAttribute('d')).join('|'))
    const before = await stepsD()
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('cb')], true))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 320, y: 120, to: { x: 320, y: 260 }, steps: 8 }]))
    const moved = await stepsD()
    expect(moved).not.toBe(before)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await stepsD()).toBe(before)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await stepsD()).toBe(moved)
    expect(await healthy(page)).toEqual([])
  })

  test('save → load keeps the blend as it was', async ({ page }) => {
    await select(page, ['ra', 'cb', 'rc'])
    await run(page, 'blend_make')
    await page.evaluate(() => window.svgEditor.svgCanvas.setBlendOptions({ steps: 3 }))
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    if (process.env.WRITE_FIXTURES) {
      fs.writeFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/blend.svg'), svg)
    }
    await setSvgSource(page, svg)
    const b = await blend(page)
    expect(b.keys).toHaveLength(3)
    expect(b.steps).toEqual([3, 3])
    // nothing is rewritten when the steps are already what the keys give
    expect(await page.evaluate(() => {
      const g = [...document.querySelectorAll('g')].find((e) => e.hasAttribute('se:blend'))
      return window.svgEditor.svgCanvas.refreshBlend(g)
    })).toBe(false)
    expect(await healthy(page)).toEqual([])
  })
})
