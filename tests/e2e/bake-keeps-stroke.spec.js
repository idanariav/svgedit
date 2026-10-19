import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, dragInDocument } from './helpers.js'

// A gesture that folds an element's existing scale into its geometry (a move, a nudge, a group resize, the cutter's pieces)
// keeps the stroke looking as it did; a resize's own scale leaves the stroke alone. Plus the resize and Pen regressions
// found in the same debug log: a group resize that kept scaling its elements on later single resizes, and a finished
// two-point path that closed back over itself.

const head = '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title>'
const load = (page, body) => page.evaluate((svg) => {
  window.svgEditor.svgCanvas.setSvgString(svg)
  window.svgEditor.svgCanvas.clearSelection()
}, `${head}${body}</g></svg>`)

/** The stroke width as painted: stroke-width times the scale of every transform down to the element. */
const painted = (page, id) => page.evaluate((elId) => {
  const el = document.getElementById(elId)
  const root = document.querySelector('#svgcontent > g')
  const m = root.getScreenCTM().inverse().multiply(el.getScreenCTM())
  return Number((parseFloat(getComputedStyle(el).strokeWidth) * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))).toFixed(3))
}, id)

const select = (page, ...ids) => page.evaluate((list) => {
  window.svgEditor.svgCanvas.selectOnly(list.map((id) => document.getElementById(id)), true)
}, ids)

/** Drag the selection's grip `dir` by (dx, dy) screen pixels with real mouse events. */
const dragGrip = async (page, dir, dx, dy) => {
  const g = await page.evaluate((d) => {
    const r = document.querySelector(`#selectorGrip_resize_${d}`).getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, dir)
  await page.mouse.move(g.x, g.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + dx * i / 8, g.y + dy * i / 8)
  await page.mouse.up()
}

const box = (page, id) => page.evaluate((elId) => {
  const b = document.getElementById(elId).getBoundingClientRect()
  return [b.x, b.y, b.width, b.height].map(Math.round)
}, id)

test.describe('bakes keep the stroke', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
  })

  const GROUP = '<g id="g1" transform="matrix(2 0 0 2 0 0)">' +
    '<path id="p1" d="M50 50 L100 50" stroke="#000" stroke-width="5" fill="none"/>' +
    '<path id="p2" d="M50 80 L100 80" stroke="#000" fill="none"/></g>'

  test('moving the children of an ungrouped, scaled group keeps their strokes (one undo step)', async ({ page }) => {
    await load(page, GROUP)
    await select(page, 'g1')
    await page.evaluate(() => window.svgEditor.commands.run('tool_ungroup'))
    expect([await painted(page, 'p1'), await painted(page, 'p2')]).toEqual([10, 2])
    await select(page, 'p1', 'p2')
    await dragInDocument(page, { x: 150, y: 100 }, { x: 200, y: 140 })
    expect([await painted(page, 'p1'), await painted(page, 'p2')]).toEqual([10, 2])
    expect(await page.evaluate(() => document.getElementById('p1').getAttribute('transform'))).toBeNull()
    await page.evaluate(() => window.svgEditor.commands.run('tool_undo'))
    expect(await page.evaluate(() => [document.getElementById('p1').getAttribute('stroke-width'), document.getElementById('p2').getAttribute('stroke-width')]))
      .toEqual(['5', null])
  })

  test('the DOM bake (grid snapping on) keeps the stroke too', async ({ page }) => {
    await load(page, '<path id="p1" d="M50 50 L100 50" transform="matrix(2 0 0 2 0 0)" stroke="#000" stroke-width="3" fill="none"/>')
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: true, snappingStep: 10 }))
    await select(page, 'p1')
    await dragInDocument(page, { x: 150, y: 100 }, { x: 200, y: 140 })
    expect(await painted(page, 'p1')).toBe(6)
  })

  test('a nudge keeps the stroke', async ({ page }) => {
    await load(page, '<path id="p1" d="M50 50 L100 50" transform="matrix(2 0 0 2 0 0)" stroke="#000" fill="none"/>')
    await select(page, 'p1')
    await page.evaluate(() => window.svgEditor.commands.run('move_right'))
    expect(await painted(page, 'p1')).toBe(2)
  })

  test('a resize does not scale the stroke by its own factor', async ({ page }) => {
    await load(page, '<rect id="r1" x="50" y="50" width="50" height="50" stroke="#000" stroke-width="4" fill="#ccc"/>' +
      '<rect id="r2" x="150" y="50" width="50" height="50" stroke="#000" stroke-width="4" fill="#ccc"/>')
    await select(page, 'r1')
    await dragGrip(page, 'se', 50, 50)
    expect(await painted(page, 'r1')).toBe(4)
    await select(page, 'r1', 'r2')
    await dragGrip(page, 'se', 60, 60)
    expect([await painted(page, 'r1'), await painted(page, 'r2')]).toEqual([4, 4])
  })

  test('cutting shapes in a scaled group keeps their strokes', async ({ page }) => {
    await load(page, '<g id="g2" transform="matrix(2 0 0 2 0 0)">' +
      '<rect id="c1" x="50" y="50" width="60" height="30" stroke="#000" stroke-width="4" fill="#ccc"/>' +
      '<rect id="c2" x="50" y="120" width="60" height="30" stroke="#000" fill="#ccc"/></g>')
    await select(page, 'c1', 'c2')
    await page.evaluate(() => window.svgEditor.svgCanvas.cutShapes([{ x: 160, y: 0 }, { x: 160, y: 400 }]))
    const pieces = await page.evaluate(() => [...document.querySelectorAll('#g2 > path')].map((p) => p.id))
    expect(pieces).toHaveLength(4)
    const widths = []
    for (const id of pieces) widths.push(await painted(page, id))
    expect(widths.sort()).toEqual([2, 2, 8, 8])
  })
})

test.describe('resize and Pen regressions', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
  })

  test('a single resize after a group resize changes only its own element, in one undo step', async ({ page }) => {
    await load(page, '<g id="a"><rect x="50" y="50" width="50" height="50" fill="red"/></g>' +
      '<g id="b"><rect x="150" y="50" width="50" height="50" fill="blue"/></g>' +
      '<rect id="r3" x="300" y="200" width="80" height="40" fill="green"/>')
    await select(page, 'a', 'b')
    await dragGrip(page, 'se', 40, 40)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.gesture.groupResizeStart)).toBeNull()
    const groups = [await box(page, 'a'), await box(page, 'b')]
    const r3 = await box(page, 'r3')
    await select(page, 'r3')
    await dragGrip(page, 'se', 60, 30)
    expect([await box(page, 'a'), await box(page, 'b')]).toEqual(groups)
    expect(await box(page, 'r3')).not.toEqual(r3)
    await page.evaluate(() => window.svgEditor.commands.run('tool_undo'))
    expect(await box(page, 'r3')).toEqual(r3)
    expect([await box(page, 'a'), await box(page, 'b')]).toEqual(groups)
  })

  const clickDoc = (page, x, y) => page.evaluate((p) => {
    window.svgEditor.automation.pointer([{ kind: 'click', x: p.x, y: p.y, space: 'doc' }])
  }, { x, y })

  test('clicking the last point of a two-point path finishes it open', async ({ page }) => {
    await load(page, '')
    await page.evaluate(() => window.svgEditor.commands.run('tool_path'))
    await clickDoc(page, 100, 100)
    await clickDoc(page, 200, 150)
    await clickDoc(page, 200, 150)
    const d = await page.evaluate(() => [...document.querySelectorAll('#svgcontent path')].map((p) => p.getAttribute('d')))
    expect(d).toHaveLength(1)
    expect(d[0]).not.toMatch(/z/i)
  })

  test('clicking the first point of a three-point path closes it', async ({ page }) => {
    await load(page, '')
    await page.evaluate(() => window.svgEditor.commands.run('tool_path'))
    await clickDoc(page, 100, 100)
    await clickDoc(page, 200, 100)
    await clickDoc(page, 150, 200)
    await clickDoc(page, 100, 100)
    const d = await page.evaluate(() => [...document.querySelectorAll('#svgcontent path')].map((p) => p.getAttribute('d')))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatch(/z/i)
  })
})
