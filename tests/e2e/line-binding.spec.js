import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage, dragInDocument } from './helpers.js'

// The Line tool binds an endpoint to the shape it is released near (hold Alt to keep it free), and a bound endpoint follows
// its shape when that is dragged. The feature drives this from the canvas's gesture events.
test.describe('Line binding', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="boxA" x="60" y="60" width="100" height="80" fill="#cccccc" stroke="#000000"/>
        <rect id="boxB" x="360" y="260" width="100" height="80" fill="#cccccc" stroke="#000000"/>
      </g>
    </svg>`)
  })

  const lines = (page) => page.evaluate(() => [...document.querySelectorAll('#svgcontent line')].map((l) => ({
    id: l.id,
    start: l.getAttributeNS('http://svg-edit.googlecode.com', 'bind-start'),
    end: l.getAttributeNS('http://svg-edit.googlecode.com', 'bind-end'),
    x1: Number(l.getAttribute('x1')),
    y1: Number(l.getAttribute('y1')),
    x2: Number(l.getAttribute('x2')),
    y2: Number(l.getAttribute('y2'))
  })))
  const drawLine = async (page, from, to, mods) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_line'))
    await dragInDocument(page, from, to, { mods })
  }

  test('a line drawn from one shape to another binds both ends and snaps them to the edges', async ({ page }) => {
    await drawLine(page, { x: 110, y: 100 }, { x: 410, y: 300 })
    const [line] = await lines(page)
    expect(line.start).toBe('boxA')
    expect(line.end).toBe('boxB')
    // The ends sit on the shapes' edges, not where the pointer was inside them.
    expect(line.x1).toBeGreaterThan(110)
    expect(line.x2).toBeLessThan(410)
  })

  test('holding Alt keeps both ends free', async ({ page }) => {
    await drawLine(page, { x: 110, y: 100 }, { x: 410, y: 300 }, { alt: true })
    const [line] = await lines(page)
    expect(line.start).toBeNull()
    expect(line.end).toBeNull()
    expect(line.x1).toBeCloseTo(110, 0)
    expect(line.x2).toBeCloseTo(410, 0)
  })

  test('a line released over open canvas stays unbound', async ({ page }) => {
    await drawLine(page, { x: 110, y: 100 }, { x: 250, y: 420 })
    const [line] = await lines(page)
    expect(line.start).toBe('boxA')
    expect(line.end).toBeNull()
    expect(line.x2).toBeCloseTo(250, 0)
    expect(line.y2).toBeCloseTo(420, 0)
  })

  test('a bound end follows its shape while that is dragged', async ({ page }) => {
    await drawLine(page, { x: 110, y: 100 }, { x: 410, y: 300 })
    const before = (await lines(page))[0]
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    await dragInDocument(page, { x: 440, y: 320 }, { x: 540, y: 400 })
    const after = (await lines(page))[0]
    expect(after.end).toBe('boxB')
    expect(after.x2).toBeGreaterThan(before.x2 + 50)
    expect(after.y2).toBeGreaterThan(before.y2 + 40)
    expect(after.x1).toBeLessThan(before.x1 + 30) // the other end stays on its own shape
  })
})
