import { test, expect } from './fixtures.js'
import { mountHost } from './host-harness.js'

// Roadmap R12: one placement policy (core/placement.ts). A drag and a nudge of the same element write the same thing, and a
// press writes nothing on what it lands on, in any mode.

const SHAPES = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <defs><mask id="m"><rect width="640" height="480" fill="#fff"/></mask></defs>
  <g class="layer"><title>A</title>
    <rect id="plain" x="40" y="40" width="60" height="40" fill="#f00"/>
    <rect id="shifted" x="40" y="120" width="60" height="40" fill="#f00" transform="translate(20 0)"/>
    <rect id="turned" x="200" y="40" width="60" height="40" fill="#0a0" transform="rotate(30 230 60)"/>
    <g id="grp"><rect x="200" y="140" width="60" height="40" fill="#00f"/></g>
    <g id="tgrp" transform="rotate(20 400 80) translate(5 5)"><rect x="380" y="60" width="40" height="40" fill="#0aa"/></g>
    <rect id="masked" x="40" y="220" width="60" height="40" fill="#a0a" mask="url(#m)"/>
    <rect id="listed" x="200" y="260" width="60" height="40" fill="#aa0" transform="translate(10 0) scale(1)"/>
  </g>
</svg>`

/** the attributes a placement writes, numbers to 2 decimals (a drag and a nudge reach the same point by different sums) */
const attrs = (page, id) => page.evaluate((id) => {
  const el = window.host.canvas('a').getElement(id)
  const round = (v) => v && v.replace(/-?\d*\.?\d+(e-?\d+)?/g, (n) => String(Number(Number(n).toFixed(2))))
  return Object.fromEntries(['x', 'y', 'width', 'height', 'transform'].map((n) => [n, round(el.getAttribute(n))]))
}, id)
/** where the element shows, in document units */
const box = (page, id) => page.evaluate((id) => {
  const c = window.host.canvas('a')
  const r = c.getElement(id).getBoundingClientRect()
  return { x: r.left / c.getZoom(), y: r.top / c.getZoom() }
}, id)

test.describe('placement', () => {
  test.beforeEach(async ({ page }) => {
    await mountHost(page)
    await page.evaluate((svg) => window.host.load('a', svg), SHAPES)
    await page.evaluate(() => window.host.editor('a').setConfig({ gridSnapping: false }))
  })

  for (const id of ['plain', 'shifted', 'turned', 'grp', 'tgrp', 'masked']) {
    test(`a drag and a nudge of "${id}" write the same placement`, async ({ page }) => {
      const at = await page.evaluate((id) => {
        const c = window.host.canvas('a')
        const r = c.getElement(id).getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, zoom: c.getZoom() }
      }, id)
      // a drag of 24 screen px right and 12 down
      await page.evaluate((id) => { const c = window.host.canvas('a'); c.selectOnly([c.getElement(id)]) }, id)
      const start = await box(page, id)
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x + 24, at.y + 12, { steps: 6 })
      await page.mouse.up()
      const dragged = await attrs(page, id)
      const end = await box(page, id) // the move the drag made (snapping may have adjusted it)
      await page.evaluate(() => window.host.canvas('a').undoMgr.undo())
      // the same move as a nudge (per-element arrays are document units)
      await page.evaluate(({ id, dx, dy }) => {
        const c = window.host.canvas('a')
        c.selectOnly([c.getElement(id)])
        c.moveSelectedElements([dx], [dy])
      }, { id, dx: end.x - start.x, dy: end.y - start.y })
      expect(await attrs(page, id)).toEqual(dragged)
    })
  }

  test('a press writes nothing on what it lands on, in any mode', async ({ page }) => {
    const before = await attrs(page, 'listed')
    const at = await page.evaluate(() => {
      const r = window.host.canvas('a').getElement('listed').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    for (const mode of ['select', 'zoom', 'ext-panning']) {
      await page.evaluate((m) => window.host.canvas('a').setMode(m), mode)
      await page.mouse.click(at.x, at.y)
      await page.evaluate(() => window.host.canvas('a').setMode('select'))
      expect(await attrs(page, 'listed'), mode).toEqual(before)
    }
  })
})
