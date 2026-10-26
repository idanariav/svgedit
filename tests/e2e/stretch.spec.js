import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Alt-drag on a resize grip stretches a group's middle and keeps its ends (core/stretch.ts), and the Size fields set a
// group's or a multi-selection's width / height, with or without the ratio lock.

const head = '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title>'
const load = (page, body) => page.evaluate((svg) => {
  window.svgEditor.svgCanvas.setSvgString(svg)
  window.svgEditor.svgCanvas.clearSelection()
}, `${head}${body}</g></svg>`)

// A pencil along x: eraser 100–140, body 140–300 (with a centre line), tip 300–340
const PENCIL = '<rect id="eraser" x="100" y="100" width="40" height="40" fill="pink" stroke="#000" stroke-width="2"/>' +
  '<rect id="body" x="140" y="100" width="160" height="40" fill="gold" stroke="#000" stroke-width="2"/>' +
  '<line id="mid" x1="140" y1="120" x2="300" y2="120" stroke="#000" stroke-width="2"/>' +
  '<polygon id="tip" points="300,100 340,120 300,140" fill="tan" stroke="#000" stroke-width="2"/>'

const select = (page, ...ids) => page.evaluate((list) => {
  window.svgEditor.svgCanvas.selectOnly(list.map((id) => document.getElementById(id)), true)
}, ids)

/** Drag the selection's grip `dir` by `dx` document units along x (and `dy` along y), Alt held when asked. */
const dragGrip = async (page, dir, dx, dy, { alt = false } = {}) => {
  const g = await page.evaluate((d) => {
    const r = document.querySelector(`#selectorGrip_resize_${d}`).getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, zoom: window.svgEditor.svgCanvas.getZoom() }
  }, dir)
  if (alt) await page.keyboard.down('Alt')
  await page.mouse.move(g.x, g.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + dx * g.zoom * i / 8, g.y + dy * g.zoom * i / 8)
  await page.mouse.up()
  if (alt) await page.keyboard.up('Alt')
}

const attrs = (page, id, names) => page.evaluate(({ elId, list }) => {
  const el = document.getElementById(elId)
  return Object.fromEntries(list.map((n) => [n, el.getAttribute(n)]))
}, { elId: id, list: names })

const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())

test.describe('Alt-drag stretch', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
  })

  test('shortens a grouped pencil: the body shrinks, the tip follows, the eraser stays; one undo step', async ({ page }) => {
    await load(page, `<g id="pencil">${PENCIL}</g>`)
    await select(page, 'pencil')
    await dragGrip(page, 'e', -80, 0, { alt: true })

    expect(await attrs(page, 'eraser', ['x', 'width', 'stroke-width'])).toEqual({ x: '100', width: '40', 'stroke-width': '2' })
    expect(await attrs(page, 'body', ['x', 'width', 'stroke-width'])).toEqual({ x: '140', width: '80', 'stroke-width': '2' })
    expect(await attrs(page, 'mid', ['x1', 'x2'])).toEqual({ x1: '140', x2: '220' })
    expect((await attrs(page, 'tip', ['points'])).points).toBe('220,100 260,120 220,140')
    // the group itself is untouched and stays selected
    expect((await attrs(page, 'pencil', ['transform'])).transform).toBeNull()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()[0]?.id)).toBe('pencil')

    await undo(page)
    expect(await attrs(page, 'body', ['width'])).toEqual({ width: '160' })
    expect((await attrs(page, 'tip', ['points'])).points).toBe('300,100 340,120 300,140')
  })

  test('the west grip moves the eraser and keeps the tip', async ({ page }) => {
    await load(page, `<g id="pencil">${PENCIL}</g>`)
    await select(page, 'pencil')
    await dragGrip(page, 'w', -40, 0, { alt: true })
    expect(await attrs(page, 'eraser', ['x', 'width'])).toEqual({ x: '60', width: '40' })
    expect(await attrs(page, 'body', ['x', 'width'])).toEqual({ x: '100', width: '200' })
    expect((await attrs(page, 'tip', ['points'])).points).toBe('300,100 340,120 300,140')
  })

  test('opens a wrapper group that crosses the middle', async ({ page }) => {
    await load(page, `<g id="outer"><g id="inner" transform="translate(10 0)">${PENCIL}</g></g>`)
    await select(page, 'outer')
    await dragGrip(page, 'e', 40, 0, { alt: true })
    expect(await attrs(page, 'eraser', ['x', 'width'])).toEqual({ x: '100', width: '40' })
    expect(await attrs(page, 'body', ['width'])).toEqual({ width: '200' })
    expect((await attrs(page, 'inner', ['transform'])).transform).toBe('translate(10 0)')
  })

  test('stretches a multi-selection the same way', async ({ page }) => {
    await load(page, PENCIL)
    await select(page, 'eraser', 'body', 'mid', 'tip')
    await dragGrip(page, 'e', 40, 0, { alt: true })
    expect(await attrs(page, 'eraser', ['x', 'width'])).toEqual({ x: '100', width: '40' })
    expect(await attrs(page, 'body', ['width'])).toEqual({ width: '200' })
    expect((await attrs(page, 'tip', ['points'])).points).toBe('340,100 380,120 340,140')
  })

  test('without Alt a group grip still scales the whole group', async ({ page }) => {
    await load(page, `<g id="pencil">${PENCIL}</g>`)
    await select(page, 'pencil')
    await dragGrip(page, 'e', -80, 0)
    expect((await attrs(page, 'pencil', ['transform'])).transform).toMatch(/^matrix\(/)
    expect(await attrs(page, 'body', ['width'])).toEqual({ width: '160' })
  })
})

test.describe('Size fields', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
  })

  const readSpin = (page, id) => page.evaluate((fieldId) => Number(document.getElementById(fieldId).value), id)
  const setSpin = (page, id, value) => page.evaluate(({ fieldId, v }) => {
    const field = document.getElementById(fieldId)
    field.value = v
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }, { fieldId: id, v: value })
  const box = (page, ...ids) => page.evaluate((list) => {
    const canvas = window.svgEditor.svgCanvas
    const b = canvas.getStrokedBBoxDefaultVisible(list.map((id) => document.getElementById(id)))
    return [b.x, b.y, b.width, b.height].map((v) => Number(v.toFixed(3)))
  }, ids)
  const sizePanelShown = (page) => page.evaluate(() => document.querySelector('.size_panel').style.display !== 'none')

  // unstroked, so the box is the geometry
  const PLAIN = '<rect id="a" x="100" y="100" width="100" height="50" fill="red"/><rect id="b" x="200" y="100" width="100" height="50" fill="blue"/>'

  test('show the size of a group and set its width alone', async ({ page }) => {
    await load(page, `<g id="grp">${PLAIN}</g>`)
    await select(page, 'grp')
    expect(await sizePanelShown(page)).toBe(true)
    expect([await readSpin(page, 'size_width'), await readSpin(page, 'size_height')]).toEqual([200, 50])
    await setSpin(page, 'size_width', 100)
    expect(await box(page, 'grp')).toEqual([100, 100, 100, 50])
    await undo(page)
    expect(await box(page, 'grp')).toEqual([100, 100, 200, 50])
  })

  test('the ratio lock keeps the proportions', async ({ page }) => {
    await load(page, `<g id="grp">${PLAIN}</g>`)
    await select(page, 'grp')
    await page.evaluate(() => window.svgEditor.commands.run('tool_ratio_lock'))
    expect(await page.evaluate(() => document.getElementById('tool_ratio_lock').pressed)).toBe(true)
    await setSpin(page, 'size_height', 100)
    expect(await box(page, 'grp')).toEqual([100, 100, 400, 100])
    expect(await readSpin(page, 'size_width')).toBe(400)
  })

  test('set the size of a multi-selection; not shown for a single shape', async ({ page }) => {
    await load(page, PLAIN)
    await select(page, 'a', 'b')
    expect(await sizePanelShown(page)).toBe(true)
    await setSpin(page, 'size_height', 100)
    expect(await box(page, 'a', 'b')).toEqual([100, 100, 200, 100])
    // each shape takes the scale into its geometry
    expect(await attrs(page, 'b', ['y', 'height', 'transform'])).toEqual({ y: '100', height: '100', transform: null })
    await select(page, 'a')
    expect(await sizePanelShown(page)).toBe(false)
  })
})
