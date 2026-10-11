import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Gradient tool: handles on the selected shape's gradient. The bar runs from the start to the end handle (a
// rect at 100,100 200x100 with a default gradient: (100,100) → (300,100): its y1 = y2 = 0), the stop chips sit below it.
test.describe('Gradient tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
        <radialGradient id="rg"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></radialGradient>
        <linearGradient id="user"><stop offset="0" stop-color="#00ff00"/><stop offset="1" stop-color="#ffff00"/></linearGradient>
      </defs>
      <g class="layer">
        <title>Layer 1</title>
        <rect id="a" x="100" y="100" width="200" height="100" fill="url(#lg)"/>
        <rect id="b" x="100" y="300" width="200" height="100" fill="url(#lg)"/>
        <ellipse id="e" cx="500" cy="150" rx="80" ry="50" fill="url(#rg)"/>
        <rect id="u" x="380" y="280" width="200" height="100" fill="url(#user)" transform="rotate(10 480 330)"/>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_gradient'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const pointer = (page, specs) => page.evaluate((s) => window.svgEditor.automation.pointer(s), specs)
  const drag = (page, from, to, mods) => pointer(page, [{ kind: 'drag', ...from, to, steps: 10, mods }])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const attr = (page, sel, name) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, name])
  const fillOf = (page, id) => attr(page, `#${id}`, 'fill')
  const gradOf = async (page, id) => (await fillOf(page, id)).replace(/^url\(#|\)$/g, '')
  const stops = (page, gradId) => page.evaluate((g) => [...document.getElementById(g).querySelectorAll('stop')].map((s) => [Number(s.getAttribute('offset')), s.getAttribute('stop-color')]), gradId)
  const zoom = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getZoom())

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_gradient').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('gradient')
  })

  test('the annotator draws a bar, handles and a chip per stop', async ({ page }) => {
    await select(page, 'a')
    await tool(page)
    const counts = await page.evaluate(() => {
      const o = document.getElementById('toolOverlay')
      return { lines: o.querySelectorAll('line').length, chips: o.querySelectorAll('rect').length }
    })
    // bar + its shade + a tick per stop; chips + the end handle
    expect(counts).toEqual({ lines: 4, chips: 3 })
  })

  test('dragging the end handle moves x2 / y2, as one undo step, and does not touch the shared gradient', async ({ page }) => {
    await select(page, 'a')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 300, y: 100 }, { x: 250, y: 200 })
    const grad = await gradOf(page, 'a')
    expect(grad).not.toBe('lg') // b still shares lg, so a got a copy
    expect(await fillOf(page, 'b')).toBe('url(#lg)')
    expect(Number(await attr(page, `#${grad}`, 'x2'))).toBeCloseTo(0.75, 2)
    expect(Number(await attr(page, `#${grad}`, 'y2'))).toBeCloseTo(1, 2)
    expect(await attr(page, '#lg', 'x2')).toBeNull()
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await fillOf(page, 'a')).toBe('url(#lg)')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(Number(await attr(page, `#${await gradOf(page, 'a')}`, 'x2'))).toBeCloseTo(0.75, 2)
  })

  test('an unshared gradient is edited in place', async ({ page }) => {
    await select(page, 'b')
    await page.evaluate(() => { document.getElementById('a').setAttribute('fill', '#ccc') })
    await tool(page)
    await drag(page, { x: 100, y: 300 }, { x: 140, y: 330 }) // the start handle moves the whole gradient
    expect(await fillOf(page, 'b')).toBe('url(#lg)')
    expect(Number(await attr(page, '#lg', 'x1'))).toBeCloseTo(0.2, 2)
    expect(Number(await attr(page, '#lg', 'x2'))).toBeCloseTo(1.2, 2)
    expect(Number(await attr(page, '#lg', 'y1'))).toBeCloseTo(0.3, 2)
  })

  test('Shift constrains the end handle to 45 degree steps', async ({ page }) => {
    await select(page, 'a')
    await tool(page)
    await drag(page, { x: 300, y: 100 }, { x: 250, y: 220 }, { shift: true })
    const grad = await gradOf(page, 'a')
    // 150 right, 120 down from the start (38.7 degrees) -> snaps to 45 degrees: equal travel in x and y
    const dx = Number(await attr(page, `#${grad}`, 'x2')) * 200
    const dy = Number(await attr(page, `#${grad}`, 'y2')) * 100
    expect(dx).toBeCloseTo(dy, 0)
    expect(dy).toBeGreaterThan(20)
  })

  test('clicking the bar adds a stop with the blended colour', async ({ page }) => {
    await select(page, 'a')
    await tool(page)
    await pointer(page, [{ kind: 'click', x: 200, y: 100 }])
    const grad = await gradOf(page, 'a')
    const list = await stops(page, grad)
    expect(list).toHaveLength(3)
    expect(list[1][0]).toBeCloseTo(0.5, 2)
    expect(list[1][1]).toBe('#800080')
  })

  test('dragging a stop moves it; dragging it off the bar deletes it; the end stops cannot go below two', async ({ page }) => {
    await select(page, 'a')
    await page.evaluate(() => { document.getElementById('b').setAttribute('fill', '#ccc') })
    await tool(page)
    const gap = 11 / await zoom(page)
    await pointer(page, [{ kind: 'click', x: 200, y: 100 }]) // a middle stop at 0.5
    await drag(page, { x: 200, y: 100 + gap }, { x: 240, y: 100 + gap })
    expect((await stops(page, 'lg')).map((s) => s[0])[1]).toBeCloseTo(0.7, 2)
    await drag(page, { x: 240, y: 100 + gap }, { x: 240, y: 100 + gap + 60 }) // far from the bar
    expect(await stops(page, 'lg')).toHaveLength(2)
    await drag(page, { x: 100, y: 100 + gap }, { x: 100, y: 100 + gap + 60 })
    expect(await stops(page, 'lg')).toHaveLength(2)
  })

  test('a stop dragged past another changes places with it', async ({ page }) => {
    await select(page, 'a')
    await page.evaluate(() => { document.getElementById('b').setAttribute('fill', '#ccc') })
    await tool(page)
    const gap = 11 / await zoom(page)
    await pointer(page, [{ kind: 'click', x: 200, y: 100 }]) // a purple stop at 0.5
    await drag(page, { x: 100, y: 100 + gap }, { x: 260, y: 100 + gap }) // the red stop to 0.8, past the purple one
    const list = await stops(page, 'lg')
    expect(list.map((s) => s[1])).toEqual(['#800080', '#ff0000', '#0000ff'])
    expect(list.map((s) => s[0])).toEqual(expect.arrayContaining([expect.closeTo(0.5, 2), expect.closeTo(0.8, 2), 1]))
    expect(list.map((s) => s[0])).toEqual([...list.map((s) => s[0])].sort((x, y) => x - y)) // still sorted
  })

  test('Alt-drag copies a stop and Delete removes the selected one', async ({ page }) => {
    await select(page, 'a')
    await page.evaluate(() => { document.getElementById('b').setAttribute('fill', '#ccc') })
    await tool(page)
    const gap = 11 / await zoom(page)
    await drag(page, { x: 100, y: 100 + gap }, { x: 160, y: 100 + gap }, { alt: true })
    expect(await stops(page, 'lg')).toHaveLength(3)
    const undo0 = await undoSize(page)
    await page.keyboard.press('Delete')
    expect(await stops(page, 'lg')).toHaveLength(2)
    expect(await undoSize(page)).toBe(undo0 + 1)
  })

  test('a radial gradient: the end handle sets the radius and the focal dot drags off-centre', async ({ page }) => {
    await select(page, 'e')
    await page.evaluate(() => { document.getElementById('e').setAttribute('fill', 'url(#rg)') })
    await tool(page)
    // box 420..580 x 100..200: centre (500,150), r 0.5 -> handle at (580,150)
    await drag(page, { x: 580, y: 150 }, { x: 540, y: 150 })
    expect(Number(await attr(page, '#rg', 'r'))).toBeCloseTo(0.25, 2)
    await drag(page, { x: 500, y: 150 }, { x: 520, y: 150 }) // focal: right of the centre
    expect(Number(await attr(page, '#rg', 'fx'))).toBeCloseTo(0.625, 1)
    expect(Number(await attr(page, '#rg', 'cx'))).toBeCloseTo(0.5, 2)
  })

  test('a userSpaceOnUse gradient on a rotated element keeps its units', async ({ page }) => {
    // The editor converts user-space gradients to bounding-box units when a drawing loads, so switch after loading.
    await page.evaluate(() => {
      const g = document.getElementById('user')
      for (const [k, v] of Object.entries({ gradientUnits: 'userSpaceOnUse', x1: 400, y1: 300, x2: 560, y2: 300 })) g.setAttribute(k, v)
    })
    await select(page, 'u')
    await tool(page)
    const pts = await page.evaluate(() => {
      const el = document.getElementById('u')
      const m = el.getCTM()
      const root = document.querySelector('#svgcontent g').getCTM()
      const to = root.inverse().multiply(m)
      const p = new DOMPoint(560, 300).matrixTransform(to)
      return { x: p.x, y: p.y }
    })
    const to = { x: pts.x + 30, y: pts.y + 10 }
    await drag(page, pts, to)
    const x2 = Number(await attr(page, '#user', 'x2'))
    const y2 = Number(await attr(page, '#user', 'y2'))
    expect(await attr(page, '#user', 'gradientUnits')).toBe('userSpaceOnUse')
    // the handle ended up where the pointer was: map the written end point back through the element
    const landed = await page.evaluate(([x, y]) => {
      const to = document.querySelector('#svgcontent g').getCTM().inverse().multiply(document.getElementById('u').getCTM())
      const p = new DOMPoint(x, y).matrixTransform(to)
      return { x: p.x, y: p.y }
    }, [x2, y2])
    expect(landed.x).toBeCloseTo(to.x, 0)
    expect(landed.y).toBeCloseTo(to.y, 0)
  })

  test('double-clicking a stop opens the colour dialog; applying it recolours the stop in one undo step', async ({ page }) => {
    await select(page, 'a')
    await page.evaluate(() => { document.getElementById('b').setAttribute('fill', '#ccc') })
    await tool(page)
    const gap = 11 / await zoom(page)
    await pointer(page, [{ kind: 'dblclick', x: 300, y: 100 + gap }])
    await page.waitForSelector('se-color-dialog')
    const undo0 = await undoSize(page)
    await page.evaluate(() => {
      document.querySelector('se-color-dialog').dispatchEvent(new CustomEvent('change', { detail: { paint: { type: 'solidColor', solidColor: '00ff00', alpha: 50 } } }))
    })
    expect((await stops(page, 'lg'))[1][1]).toBe('#00ff00')
    expect(await attr(page, '#lg stop:last-child', 'stop-opacity')).toBe('0.5')
    expect(await undoSize(page)).toBe(undo0 + 1)
  })
})
