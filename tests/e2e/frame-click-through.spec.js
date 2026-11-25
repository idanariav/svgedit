import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// A frame (an export region, `<rect data-frame fill="transparent">`) lies over the shapes it frames: a click inside it is a
// click on what is under it, its dashed edge (or its label) selects it (svgedit.css; event.ts `isStrokeOnlyElement` lets the edge win over a filled shape
// under it).
test.describe('Frames are click-through', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="shape" x="150" y="150" width="100" height="100" fill="#f00"/>
        <rect id="frame" x="100" y="100" width="300" height="250" data-frame="1" fill="transparent" stroke="#3b82f6" stroke-dasharray="6 4" stroke-width="1.5"><title>Frame 1</title></rect>
      </g>
    </svg>`)
  })

  const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))
  const click = (page, x, y) => page.evaluate(([x, y]) => window.svgEditor.automation.pointer([{ kind: 'click', x, y, space: 'doc' }]), [x, y])

  test('a click inside a frame selects the shape under it', async ({ page }) => {
    await click(page, 200, 200)
    expect(await selected(page)).toEqual(['shape'])
  })

  test('a click inside a frame on empty canvas selects nothing', async ({ page }) => {
    await click(page, 330, 300)
    expect(await selected(page)).toEqual([])
  })

  test('a click on the frame\'s edge selects the frame', async ({ page }) => {
    await click(page, 300, 100)
    expect(await selected(page)).toEqual(['frame'])
    await click(page, 500, 400)
    await click(page, 400, 220)
    expect(await selected(page)).toEqual(['frame'])
  })

  test('a selected frame does not keep a click inside it from reaching the shape', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([window.svgEditor.svgCanvas.getElement('frame')]))
    await click(page, 200, 200)
    expect(await selected(page)).toEqual(['shape'])
  })
})
