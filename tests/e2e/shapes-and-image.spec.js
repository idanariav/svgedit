import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Dispatches a synthetic mousedown -> mousemove -> mouseup sequence directly on
// #svgcanvas (the element event.js actually binds to), so the drag is exact and
// doesn't depend on real OS pointer movement or viewport visibility.
async function dragArmedShape (page, { from, to, shiftKey = false }) {
  await page.evaluate(({ from, to, shiftKey }) => {
    const svgcanvas = document.querySelector('#svgcanvas')
    const rootRect = document.querySelector('#svgroot').getBoundingClientRect()
    const content = document.querySelector('#svgcontent')
    const zoom = window.svgEditor.svgCanvas.getZoom()
    const ox = rootRect.left + Number(content.getAttribute('x'))
    const oy = rootRect.top + Number(content.getAttribute('y'))
    const toClient = (pt) => ({ clientX: ox + pt.x * zoom, clientY: oy + pt.y * zoom })
    const fire = (type, pt) => {
      svgcanvas.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window, button: 0, shiftKey, ...toClient(pt)
      }))
    }
    fire('mousedown', from)
    fire('mousemove', to)
    fire('mouseup', to)
  }, { from, to, shiftKey })
  // Let the post-mouseup opacity-restore/select-new timeout (up to ~200ms) settle.
  await page.waitForTimeout(300)
}

test.describe('Shapes and images', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false }))
  })

  test('renders a shape and image', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="svg_1" x="50" y="50" width="80" height="80" fill="#00ff00" />
        <image id="svg_2" href="./images/logo.svg" x="150" y="150" width="80" height="80" />
      </g>
    </svg>`)
    await expect(page.locator('#svg_1')).toHaveAttribute('width', /.+/)
    await expect(page.locator('#svg_2')).toHaveAttribute('href', './images/logo.svg')
    await page.locator('#svg_2').click()
  })

  test.describe('shape library drag-insert proportion lock', () => {
    // Source shape is 200x100 (2:1). Dragging a 200x400 box distorts it unless
    // Shift is held, in which case it should scale down uniformly to preserve 2:1.
    const from = { x: 50, y: 50 }
    const to = { x: 250, y: 450 }

    test('built-in shape: default drag resizes freely (no aspect lock)', async ({ page }) => {
      await page.evaluate(() => window.svgEditor.armShapeInsert({ draw: 'M0,0 L200,0 L200,100 L0,100 Z' }))
      await dragArmedShape(page, { from, to, shiftKey: false })

      const ratio = await page.evaluate(() => {
        const el = window.svgEditor.svgCanvas.getSelectedElements()[0]
        const bbox = el.getBBox()
        return bbox.width / bbox.height
      })
      expect(ratio).toBeCloseTo(0.5, 1) // 200 wide x 400 tall, matches the drag box
    })

    test('built-in shape: Shift+drag preserves the original aspect ratio', async ({ page }) => {
      await page.evaluate(() => window.svgEditor.armShapeInsert({ draw: 'M0,0 L200,0 L200,100 L0,100 Z' }))
      await dragArmedShape(page, { from, to, shiftKey: true })

      const ratio = await page.evaluate(() => {
        const el = window.svgEditor.svgCanvas.getSelectedElements()[0]
        const bbox = el.getBBox()
        return bbox.width / bbox.height
      })
      expect(ratio).toBeCloseTo(2, 1) // locked to the source shape's 2:1 ratio
    })

    test('user shape: Shift+drag preserves the original aspect ratio', async ({ page }) => {
      await page.evaluate(() => window.svgEditor.armShapeInsert({
        isUserShape: true,
        svgContent: '<rect width="200" height="100" fill="#ff0000"/>',
        bbox: { x: 0, y: 0, width: 200, height: 100 }
      }))
      await dragArmedShape(page, { from, to, shiftKey: true })

      const ratio = await page.evaluate(() => {
        const el = window.svgEditor.svgCanvas.getSelectedElements()[0]
        const bbox = el.getBBox()
        return bbox.width / bbox.height
      })
      expect(ratio).toBeCloseTo(2, 1)
    })
  })
})
