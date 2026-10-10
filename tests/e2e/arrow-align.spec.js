import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Arrowheads: a new end head lands tip-on-end (the stroke is trimmed by the head's inset), with a
// Centered / Tip / Extend picker in the Markers panel; connectors keep the tip on the bound shape's edge.
test.describe('Arrowhead alignment', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com">
      <g class="layer">
        <title>Layer 1</title>
        <line id="a" x1="50" y1="100" x2="250" y2="100" stroke="#000000" stroke-width="2" fill="none"/>
        <path id="curve" d="M50,300 C150,200 250,400 350,300" stroke="#000000" stroke-width="2" fill="none"/>
        <rect id="boxA" x="400" y="50" width="100" height="80" fill="#cccccc" stroke="#000000"/>
        <rect id="boxB" x="400" y="300" width="100" height="80" fill="#cccccc" stroke="#000000"/>
        <line id="conn" x1="450" y1="130" x2="450" y2="300" stroke="#000000" stroke-width="2" fill="none" se:bind-start="boxA" se:bind-end="boxB"/>
      </g>
    </svg>`)
  })

  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const setHead = (page, pos, kind) => page.evaluate(([p, k]) => {
    const list = document.getElementById(`${p}_marker_list_opts`)
    list.dispatchEvent(new CustomEvent('change', { detail: { value: k } }))
  }, [pos, kind])
  const pick = (page, mode) => page.evaluate((m) => {
    const sel = document.getElementById('marker_align')
    sel.value = m
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }, mode)
  const attrs = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    return Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]))
  }, id)
  const refX = (page, id, pos) => page.evaluate(([i, p]) => {
    const url = document.getElementById(i).getAttribute(`marker-${p}`)
    return document.getElementById(url.slice(5, -1))?.getAttribute('refX')
  }, [id, pos])

  test('a new end head is tip-on-end: the stroke stops inside it, in one undo step', async ({ page }) => {
    await select(page, 'a')
    const undo0 = await undoSize(page)
    await setHead(page, 'end', 'rightarrow')
    const a = await attrs(page, 'a')
    expect(a['se:arrow-align']).toBe('tip')
    expect(a['se:arrow-pts']).toBe('50,100 250,100')
    expect(Number(a.x2)).toBeCloseTo(245, 3) // half a head: 2.5 stroke widths
    expect(Number(a.x1)).toBe(50)
    expect(await refX(page, 'a', 'end')).toBe('100')
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    const back = await attrs(page, 'a')
    expect(back['marker-end']).toBeUndefined()
    expect(back['se:arrow-align']).toBeUndefined()
    expect(Number(back.x2)).toBe(250)
  })

  test('the picker switches between centered, tip and extend', async ({ page }) => {
    await select(page, 'a')
    await setHead(page, 'end', 'openarrow')
    expect(Number((await attrs(page, 'a')).x2)).toBeCloseTo(250 - 13.5 * 0.1 * 2 / 2, 2)
    await pick(page, 'extend')
    let a = await attrs(page, 'a')
    expect(a['se:arrow-align']).toBe('extend')
    expect(a['se:arrow-pts']).toBeUndefined()
    expect(Number(a.x2)).toBe(250)
    expect(await refX(page, 'a', 'end')).toBe('86.5')
    await pick(page, 'center')
    a = await attrs(page, 'a')
    expect(a['se:arrow-align']).toBeUndefined()
    expect(await refX(page, 'a', 'end')).toBe('50')
    await pick(page, 'tip')
    expect((await attrs(page, 'a'))['se:arrow-align']).toBe('tip')
  })

  test('a stroke width change re-trims, and so does its undo', async ({ page }) => {
    await select(page, 'a')
    await setHead(page, 'end', 'triangle')
    await page.evaluate(() => window.svgEditor.svgCanvas.setStrokeWidth(6))
    expect(Number((await attrs(page, 'a')).x2)).toBeCloseTo(250 - 15, 3)
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      while (document.getElementById('a').getAttribute('stroke-width') !== '2') c.undoMgr.undo()
    })
    expect(Number((await attrs(page, 'a')).x2)).toBeCloseTo(245, 3)
  })

  test('a curve is trimmed along its length, and moving it keeps the source in step', async ({ page }) => {
    await select(page, 'curve')
    await setHead(page, 'end', 'rightarrow')
    const before = await attrs(page, 'curve')
    expect(before['se:arrow-d']).toBe('M50,300 C150,200 250,400 350,300')
    expect(before.d).not.toBe(before['se:arrow-d'])
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(20, 10, true))
    const moved = await attrs(page, 'curve')
    expect(moved['se:arrow-d']).toMatch(/^M70,310 /)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    const undone = await attrs(page, 'curve')
    expect(undone['se:arrow-d']).toBe(before['se:arrow-d'])
    expect(undone.d).toBe(before.d)
    expect(undone['se:arrow-align']).toBe('tip')
  })

  test('survives save and load', async ({ page }) => {
    await select(page, 'a')
    await setHead(page, 'end', 'rightarrow')
    const before = await attrs(page, 'a')
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    await setSvgSource(page, svg)
    const after = await attrs(page, 'a')
    for (const k of ['se:arrow-align', 'se:arrow-pts', 'se:arrow-trim']) expect(after[k]).toBe(before[k])
    expect(Number(after.x2)).toBeCloseTo(Number(before.x2), 2)
    expect(await refX(page, 'a', 'end')).toBe('100')
  })

  test('a connector keeps the tip on the bound shape\'s edge when the shape moves', async ({ page }) => {
    await select(page, 'conn')
    await setHead(page, 'end', 'rightarrow')
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([document.getElementById('boxB')], true)
      c.moveSelectedElements(0, 60, true)
    })
    const conn = await attrs(page, 'conn')
    const [, end] = conn['se:arrow-pts'].split(' ').map((p) => p.split(',').map(Number))
    // The tip (source end) is on boxB's stroked top edge (the box moved from y 300 to 360; its 1px stroke adds half).
    expect(end[1]).toBeCloseTo(359.5, 1)
    // The drawn stroke stops one inset (2.5 stroke widths = 5) short of it.
    expect(Math.hypot(Number(conn.x2) - end[0], Number(conn.y2) - end[1])).toBeCloseTo(5, 2)
    // The start is bound too and has no head: untouched by trimming.
    expect(conn['se:arrow-pts'].split(' ')[0]).toBe(`${conn.x1},${conn.y1}`)
  })

  test('a saved drawing keeps its tipped heads after reload (the saver rounds the path data)', async ({ page }) => {
    const fixture = fs.readFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/arrow-align.svg'), 'utf8')
    await setSvgSource(page, fixture)
    const p = await attrs(page, 'p')
    expect(p['se:arrow-align']).toBe('tip')
    expect(p['se:arrow-d']).toBe('M40,160 C120,80 220,240 300,160')
    expect(p['se:arrow-trim']).toBe('10.5,14.625')
    expect((await attrs(page, 'y'))['se:arrow-align']).toBe('extend')
  })

  test('tapering a tipped line starts from its real ends and leaves no alignment behind', async ({ page }) => {
    await select(page, 'a')
    await setHead(page, 'end', 'rightarrow')
    const info = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const path = c.applyTaperStroke({ start: 100, end: 0 })
      return { tag: path.tagName, src: path.getAttribute('se:taper-d'), names: [...path.attributes].map((a) => a.name).filter((n) => n.startsWith('se:arrow')) }
    })
    expect(info.tag).toBe('path')
    expect(info.src).toBe('M50,100 L250,100')
    expect(info.names).toEqual([])
  })

  test('cutting corners on a tipped path keeps the rounded geometry and lets the alignment go', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <path id="poly" d="M50,100 L200,100 L200,250" stroke="#000000" stroke-width="2" fill="none"/>
      </g></svg>`)
    await select(page, 'poly')
    await setHead(page, 'end', 'rightarrow')
    await page.evaluate(() => window.svgEditor.svgCanvas.applyCornerRadius(20))
    const p = await attrs(page, 'poly')
    expect(p['se:orig-d']).toBeTruthy()
    expect(p['se:arrow-align']).toBeUndefined()
    expect(p['se:arrow-d']).toBeUndefined()
    expect(p.d).toMatch(/[AC]/) // the rounded corner is still there
  })
})
