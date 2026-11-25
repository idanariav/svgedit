import { test, expect } from './fixtures.js'
import { mountHost, openLeaf } from './host-harness.js'

// Roadmap R11: the editor's interaction state (which layers take presses, the dimming outside the group being edited) is a
// stylesheet outside the drawing, not attributes on its elements. These press through it in a real browser.

const TWO_LAYERS = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer"><title>A</title><rect id="ra" x="60" y="60" width="80" height="60" fill="#f00"/></g>
  <g class="layer"><title>B</title><g id="grp"><rect id="rb" x="260" y="60" width="80" height="60" fill="#00f"/></g>
    <rect id="sib" x="260" y="260" width="80" height="60" fill="#0a0"/></g>
</svg>`

const centreOf = (page, leaf, id) => page.evaluate(({ leaf, id }) => {
  const r = window.host.canvas(leaf).getElement(id).getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, { leaf, id })
const selected = (page, leaf = 'a') => page.evaluate((leaf) => window.host.canvas(leaf).getSelectedElements().filter(Boolean).map((e) => e.id), leaf)
const styled = (page, leaf = 'a') => page.evaluate((leaf) => [...window.host.canvas(leaf).getSvgContent().querySelectorAll('[style]')].map((e) => `${e.id}:${e.getAttribute('style')}`), leaf)

test.describe('the interaction sheet', () => {
  test.beforeEach(async ({ page }) => {
    await mountHost(page)
    await page.evaluate((svg) => window.host.load('a', svg), TWO_LAYERS)
    await page.evaluate(() => window.host.editor('a').commands.run('zoom_fit'))
  })

  test('only the current layer takes presses, and switching layers moves that', async ({ page }) => {
    const ra = await centreOf(page, 'a', 'ra')
    await page.mouse.click(ra.x, ra.y) // layer B is current: A's shape is not pressable
    expect(await selected(page)).toEqual([])
    await page.evaluate(() => window.host.canvas('a').setCurrentLayer('A'))
    await page.mouse.click(ra.x, ra.y)
    expect(await selected(page)).toEqual(['ra'])
    expect(await styled(page)).toEqual([]) // none of it is on the drawing
  })

  test('inside a group, what lies outside is dimmed and takes no presses; leaving undims it', async ({ page }) => {
    await page.evaluate(() => window.host.canvas('a').setContext(window.host.canvas('a').getElement('grp')))
    const look = () => page.evaluate(() => {
      const s = getComputedStyle(window.host.canvas('a').getElement('sib'))
      return { opacity: s.opacity, events: s.pointerEvents }
    })
    expect(await look()).toEqual({ opacity: '0.33', events: 'none' })
    const sib = await centreOf(page, 'a', 'sib')
    await page.mouse.click(sib.x, sib.y)
    expect(await selected(page)).not.toContain('sib')
    expect(await styled(page)).toEqual([])
    await page.evaluate(() => window.host.canvas('a').leaveContext())
    expect((await look()).opacity).toBe('1')
  })

  test('a shape just drawn takes presses, and carries none of the editor\'s state', async ({ page }) => {
    const box = await page.evaluate(() => {
      const r = window.host.leaves.get('a').container.querySelector('#svgcontent').getBoundingClientRect()
      return { x: r.left, y: r.top }
    })
    await page.evaluate(() => window.host.editor('a').commands.run('tool_rect'))
    await page.mouse.move(box.x + 420, box.y + 330)
    await page.mouse.down()
    await page.mouse.move(box.x + 500, box.y + 390, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(300) // the creation epilogue runs after its opacity animation
    const id = await page.evaluate(() => window.host.canvas('a').getSelectedElements()[0]?.id)
    expect(id).toBeTruthy()
    expect(await styled(page)).toEqual([])
    await page.mouse.click(box.x + 120, box.y + 420) // away, to deselect
    const at = await centreOf(page, 'a', id)
    await page.mouse.click(at.x, at.y)
    expect(await selected(page)).toEqual([id])
  })

  test('one editor\'s dimming is not another\'s (the sheet is scoped to its canvas)', async ({ page }) => {
    await openLeaf(page, 'b', TWO_LAYERS, { active: false })
    await page.evaluate(() => window.host.canvas('a').setContext(window.host.canvas('a').getElement('grp')))
    const opacityIn = (leaf) => page.evaluate((leaf) => getComputedStyle(window.host.canvas(leaf).getElement('sib')).opacity, leaf)
    expect(await opacityIn('a')).toBe('0.33')
    expect(await opacityIn('b')).toBe('1')
  })

  test('a shape with no fill takes presses by its outline only, before its first click as after it', async ({ page }) => {
    // svgedit.css says so; until R11 the editor's inline pointer-events stamp outranked it until a click's release wiped it
    await page.evaluate(() => window.host.load('a', `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>A</title><rect id="hollow" x="100" y="100" width="200" height="150" fill="none" stroke="#000" stroke-width="2"/></g></svg>`))
    const events = () => page.evaluate(() => getComputedStyle(window.host.canvas('a').getElement('hollow')).pointerEvents)
    expect(await events()).toBe('stroke')
    await page.evaluate(() => { const c = window.host.canvas('a'); c.selectOnly([c.getElement('hollow')]) })
    expect(await events()).toBe('stroke')
  })

  test('the colour dialog\'s eyedropper sees the true colours while inside a group', async ({ page }) => {
    await page.evaluate(() => window.host.canvas('a').setContext(window.host.canvas('a').getElement('grp')))
    const opacity = () => page.evaluate(() => getComputedStyle(window.host.canvas('a').getElement('sib')).opacity)
    await page.evaluate(() => { window.__resume = window.host.canvas('a').suspendContextDimming() })
    expect(await opacity()).toBe('1')
    await page.evaluate(() => window.__resume())
    expect(await opacity()).toBe('0.33')
  })
})
