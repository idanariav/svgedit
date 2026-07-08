import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Dispatches synthetic mouse events directly on #svgcanvas (the element
// event.js actually binds to), mirroring the pattern in shapes-and-image.spec.js
// so clicks are exact and don't depend on real OS pointer movement.
async function fireMouse (page, type, pt, opts = {}) {
  await page.evaluate(({ type, pt, opts }) => {
    const svgcanvas = document.querySelector('#svgcanvas')
    const rootRect = document.querySelector('#svgroot').getBoundingClientRect()
    const content = document.querySelector('#svgcontent')
    const zoom = window.svgEditor.svgCanvas.getZoom()
    const ox = rootRect.left + Number(content.getAttribute('x'))
    const oy = rootRect.top + Number(content.getAttribute('y'))
    svgcanvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: ox + pt.x * zoom,
      clientY: oy + pt.y * zoom,
      ...opts
    }))
  }, { type, pt, opts })
}

async function click (page, pt) {
  await fireMouse(page, 'mousedown', pt)
  await fireMouse(page, 'mouseup', pt)
}

test.describe('Cutter tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <ellipse id="svg_1" cx="200" cy="150" rx="100" ry="80" fill="#ffcc00" />
      </g>
    </svg>`)
  })

  test('cutShapes splits a shape along a zigzag polyline', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.selectOnly(
        [document.querySelector('#svgcontent #svg_1')], true
      )
      window.svgEditor.svgCanvas.cutShapes([
        { x: 50, y: 150 },
        { x: 150, y: 110 },
        { x: 200, y: 170 },
        { x: 250, y: 110 },
        { x: 350, y: 150 }
      ])
    })

    await expect(page.locator('#svgcontent #svg_1')).toHaveCount(0)
    const paths = page.locator('#svgcontent g.layer > path')
    await expect(paths).toHaveCount(2)
    for (const d of await paths.evaluateAll((els) => els.map((el) => el.getAttribute('d')))) {
      expect(d.length).toBeGreaterThan(4)
      // Each piece must keep the ellipse's curvature (a bezier/arc command),
      // not be faceted into a straight-edged polygon.
      expect(d).toMatch(/[cCaA]/)
    }
  })

  test('a straight cut through an ellipse\'s left/right anchor points does not crash', async ({ page }) => {
    // cy=150 crosses the boundary almost exactly at the ellipse's own
    // leftmost/rightmost anchor points (100,150)/(300,150) — a crossing
    // that coincides with an existing segment, not strictly between two.
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.selectOnly(
        [document.querySelector('#svgcontent #svg_1')], true
      )
      window.svgEditor.svgCanvas.cutShapes([
        { x: 50, y: 150 },
        { x: 200, y: 150 },
        { x: 350, y: 150 }
      ])
    })

    await expect(page.locator('#svgcontent #svg_1')).toHaveCount(0)
    const paths = page.locator('#svgcontent g.layer > path')
    await expect(paths).toHaveCount(2)
    for (const d of await paths.evaluateAll((els) => els.map((el) => el.getAttribute('d')))) {
      expect(d).toMatch(/[cCaA]/)
    }
  })

  test('the two pieces of a zigzag cut conserve the original ellipse\'s area', async ({ page }) => {
    // A faceted/flattened arc (e.g. a lost bezier handle at the chord/arc
    // seam) shows up as a piece with LESS area than the true curve would
    // enclose — a much more sensitive check than just "has a curve command".
    const totalArea = await page.evaluate(() => {
      window.svgEditor.svgCanvas.selectOnly(
        [document.querySelector('#svgcontent #svg_1')], true
      )
      window.svgEditor.svgCanvas.cutShapes([
        { x: 50, y: 150 },
        { x: 150, y: 110 },
        { x: 200, y: 170 },
        { x: 250, y: 110 },
        { x: 350, y: 150 }
      ])
      const shoelaceArea = (p) => {
        const len = p.getTotalLength()
        const N = 2000
        let area = 0
        let prev = p.getPointAtLength(0)
        for (let i = 1; i <= N; i++) {
          const pt = p.getPointAtLength((i / N) * len)
          area += (prev.x * pt.y - pt.x * prev.y)
          prev = pt
        }
        return Math.abs(area / 2)
      }
      return Array.from(document.querySelectorAll('#svgcontent g.layer > path'))
        .reduce((sum, p) => sum + shoelaceArea(p), 0)
    })

    // True ellipse area is pi*100*80; allow the small inherent error of
    // paper.js's kappa-based bezier approximation of an ellipse (~0.05%).
    const trueArea = Math.PI * 100 * 80
    expect(Math.abs(totalArea - trueArea) / trueArea).toBeLessThan(0.001)
  })

  test('a plain drag still performs an instant straight cut (legacy behavior)', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_cutter')?.click())
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('cutter')

    await fireMouse(page, 'mousedown', { x: 50, y: 150 })
    await fireMouse(page, 'mousemove', { x: 350, y: 150 })
    await fireMouse(page, 'mouseup', { x: 350, y: 150 })
    await page.waitForTimeout(200)

    await expect(page.locator('#svgcontent #svg_1')).toHaveCount(0)
    await expect(page.locator('#svgcontent g.layer > path')).toHaveCount(2)
  })

  test('click, click, click, Enter cuts along a zigzag line drawn interactively', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_cutter')?.click())
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('cutter')

    await click(page, { x: 50, y: 150 })
    await click(page, { x: 150, y: 110 })
    await click(page, { x: 200, y: 170 })
    await click(page, { x: 250, y: 110 })
    await click(page, { x: 350, y: 150 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    await expect(page.locator('#svgcontent #svg_1')).toHaveCount(0)
    await expect(page.locator('#svgcontent g.layer > path')).toHaveCount(2)
  })
})
