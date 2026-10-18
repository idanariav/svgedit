import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Align and distribute read the stroked box. A group's box includes what its children's strokes paint, so a group with a
// heavily stroked child lines up by its painted edge, not by the edge of the geometry under the stroke.
test.describe('Align with groups', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>L</title>
      <g id="grp"><rect x="100" y="50" width="40" height="30" fill="none" stroke="#000" stroke-width="20"/></g>
      <rect id="plain" x="30" y="200" width="40" height="30" fill="none" stroke="#000" stroke-width="2"/>
    </g></svg>`)
  })

  const box = (page, id) => page.evaluate((i) => {
    const b = window.svgEditor.svgCanvas.getStrokedBBox([document.getElementById(i)])
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  }, id)

  test("the group's stroked box is its child's painted box", async ({ page }) => {
    expect(await box(page, 'grp')).toEqual({ x: 90, y: 40, w: 60, h: 50 })
  })

  test('aligning left lines up the painted edges', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly(['grp', 'plain'].map((id) => document.getElementById(id)))
      c.alignSelectedElements('l', 'selected')
    })
    const [g, p] = [await box(page, 'grp'), await box(page, 'plain')]
    expect(g.x).toBeCloseTo(p.x, 1)
    expect(p.x).toBeCloseTo(29, 1) // the plain rect did not move: its own stroke is 1 each side
  })
})
