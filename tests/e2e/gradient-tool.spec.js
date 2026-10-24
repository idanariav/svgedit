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
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
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

  test('the annotator is still there after an edit gesture commits', async ({ page }) => {
    await select(page, 'a')
    await tool(page)
    await drag(page, { x: 300, y: 100 }, { x: 250, y: 200 })
    await page.waitForTimeout(50)
    expect(await page.evaluate(() => document.getElementById('toolOverlay').querySelectorAll('rect').length)).toBe(3)
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

// Creating a gradient: a drag on a shape whose paint is a plain colour makes a linear gradient along the drag (through the model),
// a click makes the default one; the annotator takes over from there. Document and canvas coordinates are the same at zoom 1.
test.describe('Gradient tool: creating a gradient', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="lg"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
      <g class="layer">
        <title>Layer 1</title>
        <rect id="solid" x="100" y="100" width="200" height="100" fill="#336699" stroke="#cc3300" stroke-width="4"/>
        <rect id="light" x="340" y="100" width="200" height="100" fill="#ffeeaa"/>
        <rect id="bare" x="100" y="260" width="200" height="100" fill="none" stroke="#222222"/>
        <rect id="moved" x="100" y="400" width="200" height="60" fill="#00aa44" transform="translate(300 0)"/>
        <rect id="held" x="20" y="20" width="40" height="40" fill="#aa00aa"/>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_gradient'))
  const pointer = (page, specs) => page.evaluate((s) => window.svgEditor.automation.pointer(s), specs)
  const drag = (page, from, to, mods) => pointer(page, [{ kind: 'drag', ...from, to, steps: 10, mods }])
  const click = (page, x, y) => pointer(page, [{ kind: 'click', x, y }])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const attr = (page, sel, name) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, name])
  const gradOf = async (page, id, prop = 'fill') => ((await attr(page, `#${id}`, prop)) ?? '').replace(/^url\(#|\)$/g, '')
  const stops = (page, gradId) => page.evaluate((g) => [...document.getElementById(g).querySelectorAll('stop')].map((s) => [Number(s.getAttribute('offset')), s.getAttribute('stop-color')]), gradId)
  const vector = (page, gradId) => page.evaluate((g) => ['x1', 'y1', 'x2', 'y2'].map((n) => Number(document.getElementById(g).getAttribute(n))), gradId)

  test('a drag across a solid shape makes a gradient along the drag, from its colour to white, as one undo step', async ({ page }) => {
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 150, y: 120 }, { x: 250, y: 180 })
    const grad = await gradOf(page, 'solid')
    expect(grad).toMatch(/^\S+$/)
    expect(await stops(page, grad)).toEqual([[0, '#336699'], [1, '#ffffff']])
    const [x1, y1, x2, y2] = await vector(page, grad)
    expect([x1, y1, x2, y2].map((v) => +v.toFixed(2))).toEqual([0.25, 0.2, 0.75, 0.8])
    expect(await attr(page, '#solid', 'stroke')).toBe('#cc3300') // the stroke is not touched
    expect(await undoSize(page)).toBe(undo0 + 1)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page, '#solid', 'fill')).toBe('#336699')
    expect(await page.evaluate((g) => Boolean(document.getElementById(g)), grad)).toBe(false)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await gradOf(page, 'solid')).toBe(grad)
    expect(await stops(page, grad)).toEqual([[0, '#336699'], [1, '#ffffff']])
  })

  test('the annotator is up when the drag ends, and the next drag edits the new gradient', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 150, y: 120 }, { x: 250, y: 180 })
    await page.waitForTimeout(50) // the annotator is drawn again once the gesture has committed
    const counts = await page.evaluate(() => {
      const o = document.getElementById('toolOverlay')
      return { chips: o.querySelectorAll('rect').length, selected: window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id) }
    })
    expect(counts).toEqual({ chips: 3, selected: ['solid'] }) // two stop chips and the end handle
    const grad = await gradOf(page, 'solid')
    const undo0 = await undoSize(page)
    await drag(page, { x: 250, y: 180 }, { x: 300, y: 100 }) // the end handle
    expect(await gradOf(page, 'solid')).toBe(grad)
    expect(await undoSize(page)).toBe(undo0 + 1)
    const [, , x2, y2] = await vector(page, grad)
    expect([+x2.toFixed(2), +y2.toFixed(2)]).toEqual([1, 0])
  })

  test('a click makes the default gradient across the box, left to right', async ({ page }) => {
    await tool(page)
    const undo0 = await undoSize(page)
    await click(page, 200, 150)
    const grad = await gradOf(page, 'solid')
    expect(await vector(page, grad)).toEqual([0, 0, 1, 0])
    expect(await stops(page, grad)).toEqual([[0, '#336699'], [1, '#ffffff']])
    expect(await undoSize(page)).toBe(undo0 + 1)
  })

  test('a light colour fades to black, and no paint goes white to black', async ({ page }) => {
    await tool(page)
    await click(page, 400, 150)
    expect(await stops(page, await gradOf(page, 'light'))).toEqual([[0, '#ffeeaa'], [1, '#000000']])
    await click(page, 200, 300)
    expect(await stops(page, await gradOf(page, 'bare'))).toEqual([[0, '#ffffff'], [1, '#000000']])
  })

  test('Shift keeps the vector on a 45 degree step', async ({ page }) => {
    await tool(page)
    await drag(page, { x: 150, y: 150 }, { x: 250, y: 160 }, { shift: true })
    const [x1, y1, x2, y2] = await vector(page, await gradOf(page, 'solid'))
    expect(+y2.toFixed(3)).toBe(+y1.toFixed(3)) // 6 degrees snaps to horizontal
    expect(x2).toBeGreaterThan(x1)
  })

  test('the vector is placed through the shape\'s own transform', async ({ page }) => {
    await tool(page)
    // "moved" sits at x 400..600 on the page (translate(300 0)), y 400..460
    await drag(page, { x: 450, y: 430 }, { x: 550, y: 430 })
    const [x1, y1, x2, y2] = await vector(page, await gradOf(page, 'moved'))
    expect([x1, y1, x2, y2].map((v) => +v.toFixed(2))).toEqual([0.25, 0.5, 0.75, 0.5])
  })

  test('with the Stroke option, the stroke gets the gradient and the fill stays', async ({ page }) => {
    await tool(page)
    await page.evaluate(() => {
      const el = document.querySelector('#tool_options_panel [data-option="paint"]')
      el.value = 'stroke'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(page, 200, 150)
    const grad = await gradOf(page, 'solid', 'stroke')
    expect(await stops(page, grad)).toEqual([[0, '#cc3300'], [1, '#ffffff']])
    expect(await attr(page, '#solid', 'fill')).toBe('#336699')
  })

  test('a press on a shape that already has a gradient edits it instead of making another', async ({ page }) => {
    await tool(page)
    await click(page, 200, 150)
    const grad = await gradOf(page, 'solid')
    await drag(page, { x: 150, y: 190 }, { x: 160, y: 190 }) // on the bar's start handle area: no second gradient
    expect(await gradOf(page, 'solid')).toBe(grad)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent linearGradient').length)).toBe(2) // lg + the new one
  })

  const setKind = (page, value) => page.evaluate((v) => {
    const el = document.querySelector('#tool_options_panel [data-option="kind"]')
    el.value = v
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
  const radial = (page, gradId) => page.evaluate((g) => {
    const el = document.getElementById(g)
    return { tag: el.tagName, v: ['cx', 'cy', 'r', 'fx', 'fy'].map((n) => Number(el.getAttribute(n))) }
  }, gradId)

  test('the options bar offers Linear and Radial for a new gradient', async ({ page }) => {
    await tool(page)
    await expect(page.locator('#tool_options_panel [data-option="kind"]')).toHaveCount(1)
  })

  test('with Radial chosen a drag makes a radial gradient centred where it starts, as one undo step', async ({ page }) => {
    await tool(page)
    await setKind(page, 'radial')
    const undo0 = await undoSize(page)
    await drag(page, { x: 200, y: 150 }, { x: 300, y: 150 })
    const grad = await gradOf(page, 'solid')
    const g = await radial(page, grad)
    expect(g.tag).toBe('radialGradient')
    expect(g.v.slice(0, 2).map((v) => +v.toFixed(2))).toEqual([0.5, 0.5]) // the press: the middle of the box
    expect(g.v[2]).toBeCloseTo(0.5, 2) // 100 units of a 200 wide box
    expect(g.v.slice(3).map((v) => +v.toFixed(2))).toEqual([0.5, 0.5]) // the focal point starts at the centre
    expect(await stops(page, grad)).toEqual([[0, '#336699'], [1, '#ffffff']])
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page, '#solid', 'fill')).toBe('#336699')
  })

  test('a drag off the middle puts the centre at the press', async ({ page }) => {
    await tool(page)
    await setKind(page, 'radial')
    await drag(page, { x: 150, y: 120 }, { x: 200, y: 120 })
    const g = await radial(page, await gradOf(page, 'solid'))
    expect(g.v.slice(0, 2).map((v) => +v.toFixed(2))).toEqual([0.25, 0.2])
  })

  test('with Radial chosen a click fills the box: centred, radius a half', async ({ page }) => {
    await tool(page)
    await setKind(page, 'radial')
    await click(page, 200, 150)
    const g = await radial(page, await gradOf(page, 'solid'))
    expect(g.tag).toBe('radialGradient')
    expect(g.v).toEqual([0.5, 0.5, 0.5, 0.5, 0.5])
  })
})
