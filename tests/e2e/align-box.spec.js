import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage, dragInDocument } from './helpers.js'

// A group can name one child as its alignment box (`se:align-box`, core/align-box.ts): align, distribute and smart
// snapping then measure the group by that child, so two desks grouped with offset shadows line up by the desks.
const DESKS = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>L</title>
  <g id="g1">
    <rect id="shadow1" x="120" y="70" width="100" height="40" fill="#999" stroke="none"/>
    <rect id="desk1" x="100" y="50" width="100" height="40" fill="#a65" stroke="none"/>
  </g>
  <g id="g2" transform="translate(0 200)">
    <rect id="desk2" x="300" y="50" width="100" height="40" fill="#a65" stroke="none"/>
    <rect id="shadow2" x="260" y="70" width="100" height="40" fill="#999" stroke="none"/>
  </g>
</g></svg>`

const run = (page, id) => page.evaluate((i) => window.svgEditor.commands.run(i), id)
const enabled = (page, id) => page.evaluate((i) => window.svgEditor.commands.list().find((c) => c.id === i).enabled, id)
/** The left edge of an element in the layer's (document) space, wherever its transforms are. */
const leftOf = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i)
  const layer = el.closest('g.layer')
  const m = layer.getCTM().inverse().multiply(el.getCTM())
  const b = el.getBBox()
  return Math.min(...[[b.x, b.y], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m).x))
}, id)
const deskLeft = (page, n) => leftOf(page, `desk${n}`)
/** Mark a child as its group's alignment box through the command, from inside the group. */
const useAsAlignBox = async (page, child) => {
  await page.evaluate((id) => {
    const c = window.svgEditor.svgCanvas
    const el = document.getElementById(id)
    c.setContext(el.parentNode)
    c.selectOnly([el], true)
  }, child)
  await run(page, 'group_align_box')
  await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    c.leaveContext()
    c.clearSelection()
  })
}
const selectIds = (page, ids) => page.evaluate((list) => {
  window.svgEditor.svgCanvas.selectOnly(list.map((i) => document.getElementById(i)), true)
}, ids)

test.describe('Alignment box', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
    await setSvgSource(page, DESKS)
  })

  test('the command needs one object inside a group', async ({ page }) => {
    await selectIds(page, ['g1'])
    expect(await enabled(page, 'group_align_box')).toBe(false)
    expect(await enabled(page, 'group_align_box_clear')).toBe(false)
    await useAsAlignBox(page, 'desk1')
    expect(await page.evaluate(() => document.getElementById('desk1').getAttribute('se:align-box'))).toBe('true')
    await selectIds(page, ['g1'])
    expect(await enabled(page, 'group_align_box_clear')).toBe(true)
  })

  test('align left lines up the desks, not the shadows', async ({ page }) => {
    await useAsAlignBox(page, 'desk1')
    await useAsAlignBox(page, 'desk2')
    await selectIds(page, ['g1', 'g2'])
    await page.evaluate(() => window.svgEditor.svgCanvas.alignSelectedElements('l', 'selected'))
    expect(await deskLeft(page, 2)).toBeCloseTo(100, 1)
    expect(await deskLeft(page, 1)).toBeCloseTo(100, 1) // the leftmost desk stayed
    expect(await leftOf(page, 'shadow2')).toBeCloseTo(60, 1) // the shadow came along, still 40 left of its desk
  })

  test('without alignment boxes align uses the whole group (unchanged)', async ({ page }) => {
    await selectIds(page, ['g1', 'g2'])
    await page.evaluate(() => window.svgEditor.svgCanvas.alignSelectedElements('l', 'selected'))
    // g1 paints from 100, g2 from 260: g2 moves so its shadow is at 100, its desk at 140
    expect(await deskLeft(page, 2)).toBeCloseTo(140, 1)
  })

  test('the selection box shows the alignment box', async ({ page }) => {
    await useAsAlignBox(page, 'desk1')
    await selectIds(page, ['g1'])
    const shown = await page.evaluate(() => {
      const r = document.querySelector('[id^="selectedAlignBox"]')
      if (!r || r.getAttribute('display') === 'none') return null
      const b = r.getBBox()
      const z = window.svgEditor.svgCanvas.getZoom()
      return { w: b.width / z, h: b.height / z }
    })
    expect(shown.w).toBeCloseTo(100, 0)
    expect(shown.h).toBeCloseTo(40, 0)
    await run(page, 'group_align_box_clear')
    expect(await page.evaluate(() => document.querySelector('[id^="selectedAlignBox"]').getAttribute('display'))).toBe('none')
  })

  test('smart snapping snaps by the alignment box', async ({ page }) => {
    await useAsAlignBox(page, 'desk1')
    await useAsAlignBox(page, 'desk2')
    await selectIds(page, ['g2'])
    // drag g2's desk (left at 300) to 3 units right of desk1's left edge (100): it snaps onto it
    await dragInDocument(page, { x: 350, y: 270 }, { x: 153, y: 270 })
    expect(await deskLeft(page, 2)).toBeCloseTo(100, 1)
  })

  test('setting, clearing and ungrouping are undoable; ungroup drops the mark', async ({ page }) => {
    await useAsAlignBox(page, 'desk1')
    const mark = () => page.evaluate(() => document.getElementById('desk1')?.getAttribute('se:align-box') ?? null)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await mark()).toBe(null)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await mark()).toBe('true')
    await selectIds(page, ['g1'])
    await run(page, 'tool_ungroup')
    expect(await mark()).toBe(null)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await mark()).toBe('true')
  })

  test('survives save and load (round-trip fixture)', async ({ page }) => {
    await useAsAlignBox(page, 'desk1')
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(svg).toContain('se:align-box="true"')
    const fixture = fs.readFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/align-box.svg'), 'utf8')
    await setSvgSource(page, fixture)
    expect(await page.evaluate(() => document.getElementById('desk1').getAttribute('se:align-box'))).toBe('true')
  })
})
