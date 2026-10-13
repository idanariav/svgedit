import { test, expect } from './fixtures.js'
import { openMainMenu, setSvgSource, visitAndApproveStorage } from './helpers.js'

test.describe('Export', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('export button visible in menu', async ({ page }) => {
    await openMainMenu(page)
    await expect(page.locator('#tool_export')).toBeVisible()
  })

  test('export dialog opens', async ({ page }) => {
    await openMainMenu(page)
    await page.locator('#tool_export').click()
    // Scope to the region control specifically: '#export_box select' is ambiguous,
    // it also matches '#se-storage-pref's format select in the same dialog.
    await expect(page.locator('#se-export-region select')).toBeVisible()
  })

  test('PNG export of a dashed, blurred drawing reports no issues (no "undefined" notice)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const canv = window.svgEditor.svgCanvas
      const rect = canv.addSVGElementsFromJson({
        element: 'rect',
        attr: { x: 10, y: 10, width: 60, height: 40, fill: 'none', stroke: '#000', 'stroke-width': 4, 'stroke-dasharray': '6 4', id: canv.getNextId() }
      })
      canv.selectOnly([rect])
      canv.setBlur(1, true)
      const { issues, issueCodes } = await canv.rasterExport('PNG', 1, 'test', { avoidEvent: true })
      return { issues, issueCodes }
    })
    expect(result.issues).toEqual([])
    expect(result.issueCodes).toEqual([])
  })

  test('PNG export omits hidden layers while SVG export retains them', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const canv = window.svgEditor.svgCanvas

      canv.addSVGElementsFromJson({
        element: 'rect',
        attr: { x: 10, y: 10, width: 40, height: 40, fill: '#00ff00', id: canv.getNextId() }
      })

      canv.createLayer('Hidden Layer')
      canv.addSVGElementsFromJson({
        element: 'rect',
        attr: { x: 100, y: 10, width: 40, height: 40, fill: '#ff0000', id: canv.getNextId() }
      })
      canv.setLayerVisibility('Hidden Layer', false)

      const svgStr = canv.getSvgString()
      const { datauri } = await canv.rasterExport('PNG', 1, 'test', {})

      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = datauri
      })
      const canvasEl = document.createElement('canvas')
      canvasEl.width = img.width
      canvasEl.height = img.height
      const ctx = canvasEl.getContext('2d')
      ctx.drawImage(img, 0, 0)

      return {
        svgStr,
        // Center of the visible green rect.
        visiblePixel: Array.from(ctx.getImageData(30, 30, 1, 1).data),
        // Center of the hidden red rect.
        hiddenPixel: Array.from(ctx.getImageData(120, 30, 1, 1).data)
      }
    })

    // SVG export keeps the hidden layer's markup, just flagged as not displayed.
    expect(result.svgStr).toContain('fill="#ff0000"')
    expect(result.svgStr).toContain('display="none"')

    // PNG export renders the visible layer...
    expect(result.visiblePixel).toEqual([0, 255, 0, 255])
    // ...but not the hidden one - that area stays fully transparent.
    expect(result.hiddenPixel).toEqual([0, 0, 0, 0])
  })

  test('PNG export works for a drawing from another tool that uses editor features (no xmlns:se in its root)', async ({ page }) => {
    // A file that does not declare the editor's namespace, then a feature that writes an `se:` attribute.
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <circle id="c" cx="100" cy="100" r="40" fill="none" stroke="#000" stroke-width="6" stroke-dasharray="14,10"/>
      </g></svg>`)
    const result = await page.evaluate(async () => {
      const canv = window.svgEditor.svgCanvas
      canv.selectOnly([document.getElementById('c')], true)
      canv.setDashFit(true) // writes se:dash-fit
      canv.clearSelection()
      const { datauri, svg } = await canv.rasterExport('PNG', 1, 'test', { avoidEvent: true })
      return { ok: datauri.startsWith('data:image/png'), fitted: svg.includes('se:dash-fit') }
    })
    expect(result).toEqual({ ok: true, fitted: true })
  })
})
