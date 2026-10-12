import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Segment, radial and not split: each spoke is a divider line from the centre out to where it leaves the shape. On a ring the
// spoke crosses the shape's outline twice (the hole, then the outer edge) and must run to the *far* one (a distance helper once
// read the centre's {cx, cy} as {x, y}, so every crossing tied and the first one won: the spoke stopped at the hole).
test.describe('Segment tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <path id="ring" fill="#888" fill-rule="evenodd" d="M150 150 V250 H250 V150 Z M100 100 H300 V300 H100 Z"/>
      </g>
    </svg>`)
  })

  test('a radial divider line on a ring runs out to the outer edge, not just to the hole', async ({ page }) => {
    const lines = await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([canvas.getElement('ring')])
      canvas.segmentSelection({ mode: 'radial', count: 4, split: false, startAngle: -90 })
      const group = canvas.getSelectedElements()[0]
      return [...group.querySelectorAll('[se\\:segment-line], line')].map((l) => ({
        x1: Number(l.getAttribute('x1')), y1: Number(l.getAttribute('y1')), x2: Number(l.getAttribute('x2')), y2: Number(l.getAttribute('y2'))
      }))
    })
    expect(lines).toHaveLength(4)
    // the spoke pointing up starts at the centre (200, 200) and leaves the ring at the top edge, y = 100 (the hole's edge is y = 150)
    const up = lines.find((l) => Math.abs(l.x2 - 200) < 1 && l.y2 < l.y1)
    expect(up).toBeTruthy()
    expect(up.y2).toBeLessThan(110)
  })
})
