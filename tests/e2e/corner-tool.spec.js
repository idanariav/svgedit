import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Corners tool: a widget inside each corner of the selected shape. Dragging one rounds the corners (one undo step
// per drag), Alt-click cycles the kind, a click picks a widget so only those corners are edited.
test.describe('Corners tool', () => {
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
        <rect id="box" x="100" y="100" width="200" height="100" stroke="#000000" stroke-width="2" fill="#cccccc"/>
        <path id="mixed" d="M100,300 L200,300 C260,330 260,390 200,420 L100,420 Z" stroke="#000000" stroke-width="2" fill="#cccccc"/>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_corners'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)[0]?.id ?? null)
  const pointer = (page, specs) => page.evaluate((s) => window.svgEditor.automation.pointer(s), specs)
  const drag = (page, from, to, mods) => pointer(page, [{ kind: 'drag', ...from, to, steps: 10, mods }])
  const click = (page, at, mods) => pointer(page, [{ kind: 'click', ...at, mods }])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
  const redo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
  /** The widgets on show (centres, in document units), in anchor order. */
  const widgets = (page) => page.evaluate(() => [...document.querySelectorAll('#toolOverlay circle')]
    .map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), fill: c.getAttribute('fill') })))
  const spec = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)[0]?.getAttribute('se:corner-radius') ?? null)
  /** The corner attribute of the (only) cut shape, whatever is selected. */
  const docSpec = (page) => page.evaluate(() => document.querySelector('path[se\\:corner-radius]')?.getAttribute('se:corner-radius') ?? null)
  const radii = async (page) => (await spec(page))?.split(',').map((e) => Number(e.split(':')[0]))
  const optionValue = (page, id) => page.evaluate((i) => document.querySelector(`#tool_options_panel [data-option="${i}"]`)?.value ?? null, id)

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_corners').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('corners')
  })

  test('a widget shows inside each corner of the selected shape, and goes with the tool', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const w = await widgets(page)
    expect(w).toHaveLength(4)
    // Inside the rectangle, near its corners (top left first).
    expect(w[0].x).toBeGreaterThan(100)
    expect(w[0].y).toBeGreaterThan(100)
    expect(w[2].x).toBeLessThan(300)
    expect(w[2].y).toBeLessThan(200)
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    await expect(page.locator('#toolOverlay circle')).toHaveCount(0)
  })

  test('a path with a curve gets widgets on its straight corners only', async ({ page }) => {
    await select(page, 'mixed')
    await tool(page)
    // M L C L Z: the anchors at (100,300) and (100,420) are corners; the ones the curve touches are not.
    expect(await widgets(page)).toHaveLength(2)
  })

  test('dragging a widget rounds every corner in one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const undo0 = await undoSize(page)
    const [, , br] = await widgets(page)
    await drag(page, br, { x: br.x - 15, y: br.y - 15 })
    expect(await page.evaluate(() => document.getElementById('box')?.tagName ?? 'gone')).toBe('gone') // a rect became a path
    expect(await selected(page)).not.toBeNull()
    expect(Number(await spec(page))).toBeCloseTo(15, 1)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await undo(page)
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
    await redo(page)
    expect(Number(await docSpec(page))).toBeCloseTo(15, 1)
  })

  test('the radius stops at fully round and at square', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const [, , br] = await widgets(page)
    await drag(page, br, { x: br.x - 120, y: br.y - 120 })
    expect(Number(await spec(page))).toBeCloseTo(50, 1) // half the 100-high side
    const [, , br2] = await widgets(page)
    await drag(page, br2, { x: br2.x + 200, y: br2.y + 200 })
    expect(await spec(page)).toBeNull() // square again: the attributes go
  })

  test('picking a widget limits a drag to that corner; Shift adds another', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const [, , br] = await widgets(page)
    await click(page, br)
    expect((await widgets(page))[2].fill).not.toBe('#fff')
    await drag(page, br, { x: br.x - 20, y: br.y - 20 })
    expect(await radii(page)).toEqual([0, 0, 20])
    // Pick the top left as well: a drag of either edits both, the others stay.
    const w = await widgets(page)
    await click(page, w[0], { shift: true })
    const w2 = await widgets(page)
    await drag(page, w2[0], { x: w2[0].x + 10, y: w2[0].y + 10 })
    const r = await radii(page)
    expect(r[0]).toBeGreaterThan(0)
    expect(r[2]).toBe(r[0])
    expect(r[1] || 0).toBe(0)
  })

  test('the Pick several option does what Shift does, for a screen with no Shift key', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await expect(page.locator('#tool_options_panel [data-option="pickMore"]')).toHaveCount(1)
    const [tl, tr] = await widgets(page)
    await click(page, tl)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('pickMore', true))
    await click(page, tr)
    const filled = (await widgets(page)).map((w) => w.fill !== '#fff')
    expect(filled.slice(0, 2)).toEqual([true, true]) // both picked
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('radius', 9))
    expect(await radii(page)).toEqual([9, 9])
    // a click on a picked one takes it off, as Shift-click does
    await click(page, tl)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('radius', 4))
    expect([...(await radii(page))].sort()).toEqual([4, 9]) // only the one still picked changed
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('pickMore', false))
  })

  test('dragging an unpicked widget when others are picked edits only that corner', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const [, tr, br] = await widgets(page)
    await click(page, br)
    await drag(page, tr, { x: tr.x - 10, y: tr.y + 10 })
    const r = await radii(page)
    expect(r[1]).toBeGreaterThan(0)
    expect(r[2] || 0).toBe(0)
    expect(r[0] || 0).toBe(0)
  })

  test('Alt-click cycles the kind of the corners, as one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const [, , br] = await widgets(page)
    await drag(page, br, { x: br.x - 15, y: br.y - 15 })
    const undo0 = await undoSize(page)
    const [, , br2] = await widgets(page)
    await click(page, br2, { alt: true })
    expect(await spec(page)).toBe('15:i,15:i,15:i,15:i')
    expect(await undoSize(page)).toBe(undo0 + 1)
    const [, , br3] = await widgets(page)
    await click(page, br3, { alt: true })
    expect(await spec(page)).toBe('15:c,15:c,15:c,15:c')
    await undo(page)
    await undo(page)
    expect(Number(await docSpec(page))).toBeCloseTo(15, 1)
  })

  test('the options bar sets the radius and kind of the picked corners', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await expect(page.locator('#tool_options_panel [data-option="radius"]')).toHaveCount(1)
    const [tl, tr] = await widgets(page)
    await click(page, tl)
    await click(page, tr, { shift: true })
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('radius', 12))
    expect(await radii(page)).toEqual([12, 12])
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('kind', 'c'))
    expect(await spec(page)).toBe('12:c,12:c')
    expect(await optionValue(page, 'radius')).toBe('12')
  })

  test('pressing another shape makes it the target', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await click(page, { x: 110, y: 400 }) // inside the mixed path, away from any widget
    expect(await selected(page)).toBe('mixed')
    expect(await widgets(page)).toHaveLength(2)
  })

  test('a shape with a transform keeps the widgets on its corners', async ({ page }) => {
    await page.evaluate(() => {
      const box = document.getElementById('box')
      box.setAttribute('transform', 'translate(200 50)')
      window.svgEditor.svgCanvas.selectOnly([box], true)
    })
    await tool(page)
    const w = await widgets(page)
    expect(w).toHaveLength(4)
    expect(w[0].x).toBeGreaterThan(300)
    await drag(page, w[2], { x: w[2].x - 15, y: w[2].y - 15 })
    expect(Number(await spec(page))).toBeCloseTo(15, 1)
  })
})

// A shape inside a transformed group: the widgets are inside the shape's corners as it appears on the page, and a press on one
// takes it, whether the group is entered or not. The true corners come from the shape's own screen matrix.
test.describe('Corners tool: a shape inside a transformed group', () => {
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
        <g id="grp" transform="translate(150 60) rotate(10 60 40)"><rect id="inner" x="10" y="10" width="160" height="100" fill="#cccccc" stroke="#000000" stroke-width="2"/></g>
      </g>
    </svg>`)
  })

  /** The shape's four corners on the page (document units) and the widgets' centres. */
  const geometry = (page) => page.evaluate(() => {
    const el = document.querySelector('#inner, path[se\\:corner-radius]')
    const inv = document.querySelector('#svgcontent').getScreenCTM().inverse()
    const m = inv.multiply(el.getScreenCTM())
    const b = el.getBBox()
    const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]].map(([x, y]) => { const p = new DOMPoint(x, y).matrixTransform(m); return { x: p.x, y: p.y } })
    const widgets = [...document.querySelectorAll('#toolOverlay circle')].map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }))
    return { corners, widgets }
  })

  for (const entered of [false, true]) {
    test(`a widget sits inside each real corner and dragging one rounds the corners (group ${entered ? 'entered' : 'not entered'})`, async ({ page }) => {
      await page.evaluate((enter) => {
        const c = window.svgEditor.svgCanvas
        if (enter) c.setContext('grp')
        c.selectOnly([document.getElementById('inner')], true)
        return window.svgEditor.commands.run('tool_corners')
      }, entered)
      const g = await geometry(page)
      expect(g.widgets).toHaveLength(4)
      // each widget is near its own corner (inside the shape, a few units in), not where the shape would be without its group
      g.widgets.forEach((w, i) => expect(Math.hypot(w.x - g.corners[i].x, w.y - g.corners[i].y), `widget ${i}`).toBeLessThan(40))
      // pull the first widget towards the shape's middle: the corners round
      const mid = { x: (g.corners[0].x + g.corners[2].x) / 2, y: (g.corners[0].y + g.corners[2].y) / 2 }
      const to = { x: g.widgets[0].x + (mid.x - g.widgets[0].x) * 0.3, y: g.widgets[0].y + (mid.y - g.widgets[0].y) * 0.3 }
      await page.evaluate(([a, b]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 10 }]), [g.widgets[0], to])
      const radius = await page.evaluate(() => document.querySelector('path[se\\:corner-radius]')?.getAttribute('se:corner-radius') ?? null)
      expect(radius, 'a corner radius was written').not.toBeNull()
      expect(Number(radius.split(',')[0].split(':')[0])).toBeGreaterThan(0)
    })
  }
})
