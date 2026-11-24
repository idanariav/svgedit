import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// A press over a covered selection keeps the selection so that a drag moves it, but a press that never becomes a drag is a
// click on what is under the pointer (event.ts mouseDown `clickSelect`, event-select.ts `up`). And a press on empty canvas
// that jitters a pixel is a click that deselects, not a 1px marquee that picks up every bounding box under it.
test.describe('Click versus drag in select mode', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="under" x="100" y="100" width="300" height="300" fill="#ccc"/>
        <rect id="top" x="200" y="200" width="50" height="50" fill="#f00"/>
        <path id="topPath" d="M300,300 L350,300 L350,350 L300,350 Z" fill="#00f"/>
        <g id="pair"><rect x="450" y="50" width="20" height="20"/><rect x="550" y="150" width="20" height="20"/></g>
      </g>
    </svg>`)
  })

  const select = (page, ids) => page.evaluate((list) => {
    const canvas = window.svgEditor.svgCanvas
    canvas.selectOnly(list.map((id) => canvas.getElement(id)))
  }, ids)
  const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))
  const pointer = (page, specs) => page.evaluate((list) => window.svgEditor.automation.pointer(list), specs)
  const click = (page, x, y) => pointer(page, [{ kind: 'click', x, y, space: 'doc' }])
  const drag = (page, from, to, steps = 10) => pointer(page, [{ kind: 'drag', x: from.x, y: from.y, to, steps, space: 'doc' }])

  test('a click on an element above the selected one selects the element clicked', async ({ page }) => {
    await select(page, ['under'])
    await click(page, 225, 225)
    expect(await selected(page)).toEqual(['top'])
  })

  test('a drag that starts on an element above the selected one still moves the selection', async ({ page }) => {
    await select(page, ['under'])
    await drag(page, { x: 225, y: 225 }, { x: 275, y: 275 })
    expect(await selected(page)).toEqual(['under'])
    const pos = await page.evaluate(() => {
      const box = (id) => window.svgEditor.svgCanvas.getElement(id).getBBox()
      const under = window.svgEditor.svgCanvas.getElement('under')
      const m = under.transform.baseVal.consolidate()?.matrix
      return { underX: box('under').x + (m?.e ?? 0), topX: box('top').x }
    })
    expect(pos.underX).toBeCloseTo(150, 0)
    expect(pos.topX).toBe(200)
  })

  test('a second click on a path above the selection opens node edit on that path, not the selection', async ({ page }) => {
    await select(page, ['under'])
    await click(page, 325, 325)
    expect(await selected(page)).toEqual(['topPath'])
    await click(page, 325, 325)
    const state = await page.evaluate(() => ({
      mode: window.svgEditor.svgCanvas.getMode(),
      path: window.svgEditor.svgCanvas.getPathObj()?.elem?.id ?? null
    }))
    expect(state.mode).toBe('pathedit')
    expect(state.path).toBe('topPath')
  })

  test('a click on one member of a multi-selection selects only that member', async ({ page }) => {
    await select(page, ['under', 'top'])
    await click(page, 150, 150)
    expect(await selected(page)).toEqual(['under'])
  })

  test('a drag on one member of a multi-selection moves them all', async ({ page }) => {
    await select(page, ['under', 'top'])
    await drag(page, { x: 150, y: 150 }, { x: 200, y: 150 })
    expect((await selected(page)).sort()).toEqual(['top', 'under'])
  })

  test('a press on empty canvas that jitters a pixel selects nothing', async ({ page }) => {
    // (510, 110) is empty canvas inside the group's bounding box
    await drag(page, { x: 510, y: 110 }, { x: 511, y: 111 }, 2)
    expect(await selected(page)).toEqual([])
  })

  test('a real marquee still selects what it touches', async ({ page }) => {
    await drag(page, { x: 500, y: 100 }, { x: 530, y: 130 })
    expect(await selected(page)).toEqual(['pair'])
  })
})
