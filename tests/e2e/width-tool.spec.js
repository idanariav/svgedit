import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Width tool: drag outward from a stroke to add a width point, drag a diamond along the path to slide it,
// Delete removes it; the profile presets are in the taper popover. One undo step per gesture.
test.describe('Width tool', () => {
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
        <line id="ln" x1="100" y1="200" x2="500" y2="200" stroke="#000000" stroke-width="10" fill="none"/>
        <path id="curve" d="M100,360 C200,260 400,460 500,360" stroke="#000000" stroke-width="10" fill="none"/>
        <rect id="box" x="540" y="100" width="60" height="60" stroke="#000000" stroke-width="4" fill="#cccccc"/>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_width'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const drag = (page, from, to, mods) => page.evaluate(([a, b, m]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 12, mods: m }]), [from, to, mods])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const profile = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    const v = el?.getAttribute('se:width-profile')
    return v ? v.split(';').map((p) => p.split(':').map(Number)) : null
  }, id)

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_width').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('width')
  })

  test('dragging outward from a line adds a width point, symmetric, in one undo step', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 170 })
    const p = await profile(page, 'ln')
    expect(p).toHaveLength(3)
    expect(p[1][0]).toBeCloseTo(0.5, 2)
    expect(p[1][1]).toBeCloseTo(6, 1) // 30 out / half of the width 5
    expect(p[1][2]).toBeCloseTo(6, 1)
    expect(await page.evaluate(() => document.getElementById('ln').tagName)).toBe('path')
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => document.getElementById('ln').tagName)).toBe('line')
  })

  test('Alt changes only the side being dragged', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 170 }, { alt: true })
    const p = await profile(page, 'ln')
    // Travelling +x with y down, "left" is up: dragging up widens the left side only.
    expect(p[1][1]).toBeCloseTo(6, 1)
    expect(p[1][2]).toBeCloseTo(1, 1)
  })

  test('dragging a width point slides it along the path', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 180 })
    const before = await profile(page, 'ln')
    await drag(page, { x: 300, y: 200 }, { x: 400, y: 200 })
    const after = await profile(page, 'ln')
    expect(after).toHaveLength(3)
    expect(after[1][0]).toBeCloseTo(0.75, 2)
    expect(after[1][1]).toBeCloseTo(before[1][1], 3) // the width moved with it
  })

  test('dragging a side handle of an existing point changes its width', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 180 }) // width 4 each side at x=300
    await drag(page, { x: 300, y: 180 }, { x: 300, y: 160 })
    const p = await profile(page, 'ln')
    expect(p).toHaveLength(3)
    expect(p[1][1]).toBeCloseTo(8, 1)
    expect(p[1][2]).toBeCloseTo(8, 1)
  })

  test('a click selects a width point without changing the drawing, and Delete removes it', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 170 })
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 300, y: 200 }]))
    expect(await undoSize(page)).toBe(undo0)
    await page.evaluate(() => window.svgEditor.automation.key('Delete'))
    expect(await profile(page, 'ln')).toHaveLength(2)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await profile(page, 'ln')).toHaveLength(3)
  })

  test('a curve and a press away from any stroke', async ({ page }) => {
    await select(page, 'curve')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 20, y: 20 }, { x: 60, y: 60 }) // nowhere
    expect(await undoSize(page)).toBe(undo0)
    await drag(page, { x: 300, y: 360 }, { x: 300, y: 330 })
    expect(await profile(page, 'curve')).toHaveLength(3)
    expect(await undoSize(page)).toBe(undo0 + 1)
  })

  test('a shape that cannot take a profile is left alone', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 540, y: 130 }, { x: 520, y: 130 })
    expect(await undoSize(page)).toBe(undo0)
    expect(await profile(page, 'box')).toBeNull()
  })

  test('Escape mid-drag puts the stroke back', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'down', x: 300, y: 200 }, { kind: 'move', x: 300, y: 170 }]))
    expect(await profile(page, 'ln')).not.toBeNull()
    await page.evaluate(() => window.svgEditor.svgCanvas.cancelToolGesture())
    expect(await page.evaluate(() => document.getElementById('ln').tagName)).toBe('line')
  })

  test('an overlay of diamonds shows for the stroke and goes with the tool', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 170 })
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'move', x: 200, y: 200 }]))
    await expect(page.locator('#toolOverlay path')).not.toHaveCount(0)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await expect(page.locator('#toolOverlay path')).toHaveCount(0)
  })

  test('a moved or scaled profiled stroke keeps its profile and its centerline', async ({ page }) => {
    await select(page, 'ln')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 300, y: 170 })
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.setMode('select')
      c.selectOnly([document.getElementById('ln')], true)
      c.moveSelectedElements(20, 30, true)
    })
    const a = await page.evaluate(() => {
      const el = document.getElementById('ln')
      return { src: el.getAttribute('se:taper-d'), profile: el.getAttribute('se:width-profile') }
    })
    expect(a.src.replace(/\s+/g, '')).toBe('M120,230L520,230')
    expect(a.profile).toMatch(/^0:1:1;0\.5:/)
  })

  test('the presets in the taper popover profile the selected stroke', async ({ page }) => {
    await select(page, 'ln')
    await page.evaluate(() => {
      const btn = document.getElementById('tool_taper')
      btn.open() // fills the picker
      const sel = btn.shadowRoot.querySelector('#taper_preset')
      sel.value = 'lens'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(await profile(page, 'ln')).toEqual([[0, 0, 0], [0.5, 1, 1], [1, 0, 0]])
    expect(await page.evaluate(() => document.getElementById('ln').getAttribute('se:taper'))).toBe('0,0')
  })

  test('the three-point taper is untouched: no profile is written, and the sliders replace a profile', async ({ page }) => {
    await select(page, 'ln')
    const taper = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const el = c.applyTaperStroke({ start: 100, end: 0 })
      window.__tapered = el.id // the sliders give a line a new id when they make it a path
      return { profile: el.getAttribute('se:width-profile'), taper: el.getAttribute('se:taper'), src: el.getAttribute('se:taper-d'), style: el.getAttribute('se:taper-style') }
    })
    expect(taper.profile).toBeNull()
    expect(taper.taper).toBe('100,0')
    expect(taper.src).toBe('M100,200 L500,200')
    expect(taper.style).toBe('10|#000000')
    // A profile on top of it, then the sliders again: the profile goes, the taper is back.
    await page.evaluate(() => window.svgEditor.svgCanvas.applyWidthProfile([[0, 0, 0], [0.5, 1, 1], [1, 0, 0]]))
    const id = await page.evaluate(() => window.__tapered)
    expect(await profile(page, id)).not.toBeNull()
    const again = await page.evaluate(() => {
      const el = window.svgEditor.svgCanvas.applyTaperStroke({ start: 50, end: 50 })
      return { profile: el.getAttribute('se:width-profile'), taper: el.getAttribute('se:taper') }
    })
    expect(again).toEqual({ profile: null, taper: '50,50' })
    // Removing a profile brings the plain stroke back.
    await page.evaluate(() => window.svgEditor.svgCanvas.applyWidthProfile([[0, 0, 0], [1, 1, 1]]))
    await page.evaluate(() => window.svgEditor.svgCanvas.removeTaperStroke())
    const plain = await page.evaluate(() => {
      const el = document.getElementById(window.__tapered)
      return { profile: el.getAttribute('se:width-profile'), stroke: el.getAttribute('stroke'), fill: el.getAttribute('fill'), d: el.getAttribute('d') }
    })
    expect(plain).toEqual({ profile: null, stroke: '#000000', fill: 'none', d: 'M100,200 L500,200' })
  })
})
