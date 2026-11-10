import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// A multi-selection resizes each axis on its own (Shift keeps the proportions), and Shift while dragging a path anchor
// snaps it to the alignment lines of the path's other nodes.

const head = '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title>'
const load = (page, body) => page.evaluate((svg) => {
  window.svgEditor.svgCanvas.setSvgString(svg)
  window.svgEditor.svgCanvas.clearSelection()
}, `${head}${body}</g></svg>`)

/** Drag with real mouse events, holding Shift for the moves when asked. */
const drag = async (page, from, to, shift = false) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  if (shift) await page.keyboard.down('Shift')
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8)
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

const gripCentre = (page, dir) => page.evaluate((d) => {
  const r = document.querySelector(`#selectorGrip_resize_${d}`).getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, dir)

/** Union box of the elements in document units. */
const union = (page, ids) => page.evaluate((list) => {
  const b = window.svgEditor.svgCanvas.getStrokedBBoxDefaultVisible(list.map((id) => document.getElementById(id)))
  return { width: Math.round(b.width), height: Math.round(b.height) }
}, ids)

test.describe('multi-selection resize', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
    await load(page, '<rect id="a" x="100" y="100" width="100" height="50" fill="red"/>' +
      '<rect id="b" x="250" y="100" width="50" height="100" fill="blue"/>')
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly(['a', 'b'].map((id) => document.getElementById(id)), true))
  })

  test('a side grip changes only that side', async ({ page }) => {
    const before = await union(page, ['a', 'b'])
    const zoom = await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())
    const g = await gripCentre(page, 'e')
    await drag(page, g, { x: g.x + 100 * zoom, y: g.y })
    const after = await union(page, ['a', 'b'])
    expect(after.width).toBeGreaterThan(before.width + 80)
    expect(after.height).toBe(before.height)
  })

  test('a corner grip follows each axis, and Shift keeps the proportions', async ({ page }) => {
    const before = await union(page, ['a', 'b'])
    const zoom = await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())
    let g = await gripCentre(page, 'se')
    await drag(page, g, { x: g.x + 100 * zoom, y: g.y })
    const free = await union(page, ['a', 'b'])
    expect(free.width).toBeGreaterThan(before.width + 80)
    expect(free.height).toBe(before.height)
    g = await gripCentre(page, 'se')
    await drag(page, g, { x: g.x + 100 * zoom, y: g.y }, true)
    const kept = await union(page, ['a', 'b'])
    expect(kept.width / kept.height).toBeCloseTo(free.width / free.height, 1)
  })
})

test.describe('path node Shift-snap', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false, smartSnapping: false }))
    await load(page, '<path id="p" d="M100 100 L300 100 L300 300 L105 290" fill="none" stroke="#000" stroke-width="2"/>')
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const path = document.getElementById('p')
      canv.selectOnly([path], true)
      canv.pathActions.toEditMode(path)
    })
  })

  /** The last node of the path, from its `d`. */
  const lastNode = (page) => page.evaluate(() => {
    const nums = document.getElementById('p').getAttribute('d').match(/-?[\d.]+/g).map(Number)
    return { x: Math.round(nums.at(-2) * 10) / 10, y: Math.round(nums.at(-1) * 10) / 10 }
  })

  /** Drag the last node's grip by (dx, dy) document units. */
  const dragNode = async (page, dx, dy, shift) => {
    const box = await page.locator('#pathpointgrip_3').boundingBox()
    const zoom = await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await drag(page, from, { x: from.x + dx * zoom, y: from.y + dy * zoom }, shift)
  }

  test('without Shift the node follows the pointer', async ({ page }) => {
    await dragNode(page, -2, 6, false)
    expect(await lastNode(page)).toEqual({ x: 103, y: 296 })
  })

  test('with Shift it snaps onto the x of the first node and the y of the third', async ({ page }) => {
    await dragNode(page, -2, 6, true)
    expect(await lastNode(page)).toEqual({ x: 100, y: 300 })
  })
})
