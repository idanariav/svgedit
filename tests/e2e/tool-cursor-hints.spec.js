import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The cursor of a tool follows what the pointer is over (svgCanvas.setCursorHint): a handle to drag shows a hand,
// a closed hand while it is dragged, a place where a press adds something shows a "+", a thing a click picks a pointer.
test.describe('Tool cursor hints', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="lg"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
      <g class="layer">
        <title>Layer 1</title>
        <rect id="box" x="100" y="100" width="200" height="100" stroke="#000000" stroke-width="2" fill="#cccccc"/>
        <rect id="grad" x="100" y="300" width="200" height="100" fill="url(#lg)"/>
        <rect id="other" x="400" y="100" width="100" height="80" stroke="#000000" stroke-width="2" fill="#cccccc"/>
      </g>
    </svg>`)
  })

  const run = (page, cmd) => page.evaluate((c) => window.svgEditor.commands.run(c), cmd)
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const pointer = (page, specs) => page.evaluate((s) => window.svgEditor.automation.pointer(s), specs)
  const move = (page, x, y) => pointer(page, [{ kind: 'move', x, y }])
  const hint = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getCursorHint())
  const cursor = (page) => page.evaluate(() => window.svgEditor.workarea.style.cursor)

  test('Corners: a hand over a widget, a closed hand while dragging, the tool\'s own cursor elsewhere', async ({ page }) => {
    await select(page, 'box')
    await run(page, 'tool_corners')
    await move(page, 400, 400)
    expect(await hint(page)).toBeNull()
    const plain = await cursor(page)
    expect(plain).toContain('url(')
    // the widget sits inside the top-left corner, along its bisector
    const widget = await page.evaluate(() => {
      const c = document.querySelector('#toolOverlay circle')
      return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }
    })
    await move(page, widget.x, widget.y)
    expect(await hint(page)).toBe('grab')
    expect(await cursor(page)).toBe('grab')
    await pointer(page, [{ kind: 'down', x: widget.x, y: widget.y }, { kind: 'move', x: widget.x + 6, y: widget.y + 6 }])
    expect(await cursor(page)).toBe('grabbing')
    await pointer(page, [{ kind: 'up', x: widget.x + 6, y: widget.y + 6 }])
    expect(await hint(page)).toBeNull()
    await move(page, 400, 400)
    expect(await cursor(page)).toBe(plain)
  })

  test('Distort: a hand over a corner handle, and gone when the pointer leaves it', async ({ page }) => {
    await select(page, 'box')
    await run(page, 'tool_distort')
    await move(page, 400, 400)
    expect(await hint(page)).toBeNull()
    await move(page, 100, 100) // the shape's top-left corner
    expect(await hint(page)).toBe('grab')
    expect(await cursor(page)).toBe('grab')
    await pointer(page, [{ kind: 'down', x: 100, y: 100 }, { kind: 'move', x: 110, y: 110 }])
    expect(await cursor(page)).toBe('grabbing')
    await pointer(page, [{ kind: 'up', x: 110, y: 110 }])
    await move(page, 400, 400)
    expect(await hint(page)).toBeNull()
  })

  test('Gradient: a hand over a handle, a "+" over the bar where a press adds a stop', async ({ page }) => {
    await select(page, 'grad')
    await run(page, 'tool_gradient')
    await move(page, 450, 450)
    expect(await hint(page)).toBeNull()
    await move(page, 300, 300) // the end handle
    expect(await hint(page)).toBe('grab')
    await move(page, 200, 300) // the bar, between the two stops
    expect(await hint(page)).toBe('add')
    const adding = await cursor(page)
    expect(adding).toContain('url(')
    await move(page, 300, 300)
    expect(await cursor(page)).toBe('grab')
    expect(adding).not.toBe('grab')
  })

  test('Blend: a pointer over a shape a click would pick', async ({ page }) => {
    await run(page, 'tool_blend')
    await move(page, 600, 400)
    expect(await hint(page)).toBeNull()
    await move(page, 450, 140) // inside "other"
    expect(await hint(page)).toBe('pointer')
    expect(await cursor(page)).toBe('pointer')
    await move(page, 600, 400)
    expect(await hint(page)).toBeNull()
  })

  test('leaving the tool clears the hint', async ({ page }) => {
    await select(page, 'box')
    await run(page, 'tool_distort')
    await move(page, 100, 100)
    expect(await hint(page)).toBe('grab')
    await run(page, 'tool_select')
    expect(await hint(page)).toBeNull()
  })
})
