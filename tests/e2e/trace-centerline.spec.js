import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// "Convert to editable SVG" in its Line art (centerlines) style: thin strokes of the picture become
// stroked open paths, filled areas are left alone.
test.describe('Centerline tracing', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title></g>
    </svg>`)
    // A 200 x 120 picture: a 3 px bar, a 3 px diagonal and a filled block.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 120
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 200, 120)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(10, 20)
      ctx.lineTo(150, 20)
      ctx.moveTo(10, 100)
      ctx.lineTo(90, 40)
      ctx.stroke()
      ctx.fillStyle = '#000'
      ctx.fillRect(130, 60, 60, 50)
      const c = window.svgEditor.svgCanvas
      const img = c.addSVGElementsFromJson({
        element: 'image',
        attr: { id: c.getNextId(), x: 100, y: 100, width: 200, height: 120 }
      })
      c.setHref(img, canvas.toDataURL('image/png'))
      c.selectOnly([img], true)
    })
  })

  const convert = async (page, style) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_trace_image'))
    const dialog = page.locator('se-trace-dialog')
    await dialog.locator('#trace_preset').selectOption(style)
    await dialog.locator('#trace_ok').click()
  }

  test('the style hides the palette size and traces thin lines as stroked open paths', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_trace_image'))
    const dialog = page.locator('se-trace-dialog')
    await expect(dialog.locator('#trace_colors_field')).toBeVisible()
    await dialog.locator('#trace_preset').selectOption('centerline')
    await expect(dialog.locator('#trace_colors_field')).toBeHidden()
    const undoBefore = await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
    await dialog.locator('#trace_ok').click()

    const paths = page.locator('#svgcontent g.layer path')
    await expect(paths).toHaveCount(2) // the bar and the diagonal; the block is wider than a line
    for (const p of await paths.all()) {
      expect(await p.getAttribute('fill')).toBe('none')
      expect(await p.getAttribute('stroke')).toBe('#000000')
      const width = parseFloat(await p.getAttribute('stroke-width'))
      expect(width).toBeGreaterThan(2.4) // a 3 px canvas stroke, anti-aliased then thresholded
      expect(width).toBeLessThan(4.6)
      expect((await p.getAttribute('d')).trim()).not.toMatch(/Z$/)
    }
    // Laid over the picture (100,100 on the canvas, same size): the bar is at the picture's x 10..150, y 20.
    const bar = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#svgcontent g.layer path')]
        .sort((a, b) => a.getBBox().y - b.getBBox().y)[0]
      const box = el.getBBox()
      const m = el.getCTM()
      const page = document.querySelector('#svgcontent g.layer').getCTM()
      const toLayer = page.inverse().multiply(m)
      return { x: box.x + toLayer.e, y: box.y + toLayer.f + box.height / 2, w: box.width }
    })
    expect(bar.x).toBeGreaterThan(105)
    expect(bar.x).toBeLessThan(116)
    expect(bar.y).toBeGreaterThan(115)
    expect(bar.y).toBeLessThan(125)
    expect(bar.w).toBeGreaterThan(130)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())).toBe(undoBefore + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(paths).toHaveCount(0)
  })

  test('an image with nothing thin in it says so and adds nothing', async ({ page }) => {
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 80
      canvas.height = 80
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 80, 80)
      ctx.fillStyle = '#000'
      ctx.fillRect(10, 10, 60, 60)
      const c = window.svgEditor.svgCanvas
      c.setHref(c.getSelectedElements()[0], canvas.toDataURL('image/png'))
    })
    await convert(page, 'centerline')
    await expect(page.locator('se-trace-dialog #trace_error')).toContainText('No thin lines')
    await expect(page.locator('#svgcontent g.layer path')).toHaveCount(0)
  })
})
