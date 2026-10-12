import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// A selected group is boxed by its geometry (the native getBBox), not by the strokes of its children; a stroked shape on its
// own is boxed with its stroke. (select.js used to carry a branch meant to widen the group box that could never run.)
test.describe('Selection box of a group', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <g id="grp"><rect id="inner" x="100" y="100" width="100" height="50" fill="none" stroke="#000" stroke-width="20"/></g>
        <rect id="solo" x="300" y="100" width="100" height="50" fill="none" stroke="#000" stroke-width="20"/>
      </g>
    </svg>`)
  })

  const boxWidth = (page, id) => page.evaluate((target) => {
    const canvas = window.svgEditor.svgCanvas
    const elem = canvas.getElement(target)
    canvas.selectOnly([elem])
    const selector = canvas.selectorManager.requestSelector(elem)
    selector.resize()
    const rect = selector.selectorRect
    return { width: rect.getBBox().width, zoom: canvas.getZoom() }
  }, id)

  test('the group box hugs the geometry, the stroked rect alone includes its stroke', async ({ page }) => {
    const group = await boxWidth(page, 'grp')
    const solo = await boxWidth(page, 'solo')
    // the geometry (100) plus the selection margin, at screen scale: nowhere near the 120 the stroke would give
    expect(group.width).toBeGreaterThanOrEqual(100 * group.zoom)
    expect(group.width).toBeLessThan(106 * group.zoom)
    // 100 + stroke 20 + margin
    expect(solo.width).toBeGreaterThan(group.width + 15 * solo.zoom)
  })
})
