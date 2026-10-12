import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Transform Each (every selected object about its own point) and Split Into Grid, both through the shared
// se-params-dialog. Each edit previews in an undo transaction; OK is one undo step, Cancel leaves nothing.
test.describe('Layout tools', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="a" x="100" y="100" width="100" height="50" fill="#ff0000" stroke="#000000" stroke-width="2"/>
        <rect id="b" x="300" y="200" width="60" height="60" fill="#0000ff"/>
        <rect id="r" x="400" y="50" width="100" height="60" fill="#00aa00" transform="rotate(30 450 80)"/>
      </g>
    </svg>`)
  })

  const select = (page, ...ids) => page.evaluate((list) => window.svgEditor.svgCanvas.selectOnly(list.map((i) => document.getElementById(i)), true), ids)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
  const run = (page, id) => page.evaluate((c) => window.svgEditor.commands.run(c), id)
  /** Set a field of the open dialog the way a user does (the form listens to input). */
  const setField = (page, id, value) => page.evaluate(({ id, value }) => {
    const input = document.querySelector('se-params-dialog').shadowRoot.querySelector(`#pd_${id}`)
    if (input.type === 'checkbox') input.checked = value
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, { id, value })
  const press = (page, id) => page.evaluate((i) => document.querySelector('se-params-dialog').shadowRoot.querySelector(`#${i}`).click(), id)
  /** The bounding box of an element on screen, in document units (so a transform counts). */
  const box = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    const m = el.getCTM()
    const root = document.getElementById('svgcontent')
    const inv = root.getCTM().inverse()
    const b = el.getBBox()
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => {
      const p = new DOMPoint(x, y).matrixTransform(inv.multiply(m))
      return [p.x, p.y]
    })
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }, id)
  const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

  test('Transform Each scales every object about its own centre, in one undo step', async ({ page }) => {
    const a0 = await box(page, 'a')
    const b0 = await box(page, 'b')
    await select(page, 'a', 'b')
    const steps = await undoSize(page)
    await run(page, 'tool_transform_each')
    await setField(page, 'scaleH', 200)
    await setField(page, 'scaleV', 50)
    await press(page, 'pd_ok')
    const a1 = await box(page, 'a')
    const b1 = await box(page, 'b')
    expect(a1.w).toBeCloseTo(a0.w * 2, 1)
    expect(a1.h).toBeCloseTo(a0.h / 2, 1)
    expect(center(a1).x).toBeCloseTo(center(a0).x, 1)
    expect(center(a1).y).toBeCloseTo(center(a0).y, 1)
    expect(b1.w).toBeCloseTo(b0.w * 2, 1)
    expect(center(b1).x).toBeCloseTo(center(b0).x, 1)
    expect(await undoSize(page)).toBe(steps + 1)
    await undo(page)
    expect(await box(page, 'a')).toEqual(a0)
    expect(await box(page, 'b')).toEqual(b0)
  })

  test('the reference point picks which part of each object stays put', async ({ page }) => {
    const a0 = await box(page, 'a')
    await select(page, 'a')
    await run(page, 'tool_transform_each')
    await page.evaluate(() => { document.querySelector('se-params-dialog').shadowRoot.querySelector('input[name="origin"][value="tl"]').click() })
    await setField(page, 'scaleH', 300)
    await press(page, 'pd_ok')
    const a1 = await box(page, 'a')
    expect(a1.x).toBeCloseTo(a0.x, 1)
    expect(a1.y).toBeCloseTo(a0.y, 1)
    expect(a1.w).toBeCloseTo(a0.w * 3, 1)
  })

  test('move, rotate and reflect work on a rotated object too', async ({ page }) => {
    const r0 = await box(page, 'r')
    await select(page, 'r')
    await run(page, 'tool_transform_each')
    await setField(page, 'moveH', 40)
    await setField(page, 'moveV', -10)
    await press(page, 'pd_ok')
    const r1 = await box(page, 'r')
    expect(r1.x).toBeCloseTo(r0.x + 40, 1)
    expect(r1.y).toBeCloseTo(r0.y - 10, 1)
    expect(r1.w).toBeCloseTo(r0.w, 1)
    await run(page, 'tool_transform_each')
    await setField(page, 'rotate', 90)
    await press(page, 'pd_ok')
    const r2 = await box(page, 'r')
    expect(center(r2).x).toBeCloseTo(center(r1).x, 1)
    expect(center(r2).y).toBeCloseTo(center(r1).y, 1)
  })

  test('Copy transforms duplicates and keeps the originals', async ({ page }) => {
    const a0 = await box(page, 'a')
    await select(page, 'a')
    await run(page, 'tool_transform_each')
    await setField(page, 'moveH', 150)
    await setField(page, 'copy', true)
    await press(page, 'pd_ok')
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)).toBe(4)
    expect(await box(page, 'a')).toEqual(a0)
    await undo(page)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)).toBe(3)
  })

  test('Cancel and Escape leave the drawing and the undo stack alone', async ({ page }) => {
    const steps = await undoSize(page)
    const a0 = await box(page, 'a')
    await select(page, 'a')
    await run(page, 'tool_transform_each')
    await setField(page, 'scaleH', 400)
    expect((await box(page, 'a')).w).toBeCloseTo(a0.w * 4, 1) // the preview shows
    await press(page, 'pd_cancel')
    expect(await box(page, 'a')).toEqual(a0)
    expect(await undoSize(page)).toBe(steps)
    await run(page, 'tool_transform_each')
    await setField(page, 'moveH', 50)
    await page.keyboard.press('Escape')
    // the <dialog>'s close event arrives a task after the key
    await expect.poll(() => box(page, 'a')).toEqual(a0)
    expect(await undoSize(page)).toBe(steps)
  })

  test('Split Into Grid replaces a rect with rows × columns of rects, in one undo step', async ({ page }) => {
    await select(page, 'a')
    const steps = await undoSize(page)
    await run(page, 'tool_split_grid')
    await setField(page, 'rows', 2)
    await setField(page, 'cols', 3)
    await setField(page, 'gutter', 10)
    await press(page, 'pd_ok')
    const cells = await page.evaluate(() => [...document.querySelectorAll('#svgcontent g.layer > g > rect')].map((r) => ({
      x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), fill: r.getAttribute('fill'), stroke: r.getAttribute('stroke')
    })))
    expect(cells).toHaveLength(6)
    expect(cells[0].w).toBeCloseTo((100 - 20) / 3, 3)
    expect(cells[0].h).toBeCloseTo((50 - 10) / 2, 3)
    expect(cells[3].y).toBeCloseTo(100 + (50 - 10) / 2 + 10, 3)
    expect(cells.every((c) => c.fill === '#ff0000' && c.stroke === '#000000')).toBe(true)
    expect(await page.evaluate(() => document.getElementById('a'))).toBeNull()
    expect(await undoSize(page)).toBe(steps + 1)
    await undo(page)
    expect(await page.evaluate(() => !!document.getElementById('a'))).toBe(true)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent g.layer > g').length)).toBe(0)
  })

  test('Split Into Grid keeps the rotation of a rotated rect', async ({ page }) => {
    const r0 = await box(page, 'r')
    await select(page, 'r')
    await run(page, 'tool_split_grid')
    await press(page, 'pd_ok')
    const group = await page.evaluate(() => document.querySelector('#svgcontent g.layer > g').getAttribute('transform'))
    expect(group).toContain('rotate(30')
    // The union of the cells covers where the rect was
    const union = await page.evaluate(() => {
      const g = document.querySelector('#svgcontent g.layer > g')
      const b = g.getBBox(); const m = g.getCTM(); const inv = document.getElementById('svgcontent').getCTM().inverse()
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(inv.multiply(m)))
      const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y)
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) }
    })
    expect(union.x).toBeCloseTo(r0.x, 1)
    expect(union.w).toBeCloseTo(r0.w, 1)
  })

  test('Transform Each leaves a live-geometry element in sync (a tapered path keeps its source and outline)', async ({ page }) => {
    await setSvgSource(page, fs.readFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/taper.svg'), 'utf8'))
    const state = (id) => page.evaluate((i) => {
      const p = document.getElementById(i)
      return { d: p.getAttribute('d'), se: [...p.attributes].filter((a) => a.name.startsWith('se:')).map((a) => [a.name, a.value]), transform: p.getAttribute('transform') }
    }, id)
    const id = await page.evaluate(() => {
      const p = document.querySelector('#svgcontent path')
      window.svgEditor.svgCanvas.selectOnly([p], true)
      return p.id
    })
    const before = await state(id)
    expect(before.se.length).toBeGreaterThan(0)
    await run(page, 'tool_transform_each')
    await setField(page, 'scaleH', 250)
    await setField(page, 'rotate', 20)
    await press(page, 'pd_ok')
    const after = await state(id)
    expect(after.transform).toContain('matrix')
    expect(after.d).toBe(before.d)
    expect(after.se).toEqual(before.se)
  })

  test('the commands say why they are unavailable', async ({ page }) => {
    const enabled = (id) => page.evaluate((c) => window.svgEditor.commands.isEnabled(c), id)
    expect(typeof (await enabled('tool_transform_each'))).toBe('string')
    expect(typeof (await enabled('tool_split_grid'))).toBe('string')
    await select(page, 'a', 'b')
    expect(await enabled('tool_transform_each')).toBe(true)
    expect(typeof (await enabled('tool_split_grid'))).toBe('string') // two shapes
    await select(page, 'a')
    expect(await enabled('tool_split_grid')).toBe(true)
  })
})
