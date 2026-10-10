import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The eyedropper's "Apply style" actions on the real editor: gradient reference shared,
// shadow rebuilt as the target's own <filter>, one undo step, and (via the automatic
// checkDrawing afterEach) no dangling references afterwards.
test.describe('Eyedropper copy style', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
      </defs>
      <g class="layer">
        <title>Layer 1</title>
        <rect id="src" x="40" y="40" width="120" height="80" fill="url(#grad1)" stroke="#00aa00" stroke-width="5" stroke-dasharray="8 4" opacity="0.8"/>
        <rect id="dst" x="300" y="40" width="120" height="80" fill="#cccccc"/>
      </g>
    </svg>`)
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const src = document.getElementById('src')
      const batch = new c.history.BatchCommand('setup')
      window.svgEditor.shadowApi.apply(src, { angle: 135, length: 8, blur: 4, opacity: 0.6, color: '#000000' }, batch)
    })
  })

  const pickAndChoose = async (page, clickAt, action) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_eyedropper'))
    await page.evaluate((p) => window.svgEditor.automation.pointer([{ kind: 'click', ...p }]), clickAt)
    await page.evaluate((a) => {
      document.querySelector('se-eyedropper-menu').shadowRoot.querySelector(`a[data-action="${a}"]`).click()
    }, action)
  }
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const attrs = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    return Object.fromEntries(['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'filter'].map((a) => [a, el.getAttribute(a)]))
  }, id)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

  test('Apply style to selection copies the look, gives the target its own filter, in one undo step', async ({ page }) => {
    await select(page, 'dst')
    const before = await undoSize(page)
    await pickAndChoose(page, { x: 100, y: 80 }, 'styleToSelection')
    const src = await attrs(page, 'src')
    const dst = await attrs(page, 'dst')
    expect(dst).toMatchObject({ fill: 'url(#grad1)', stroke: '#00aa00', 'stroke-width': '5', 'stroke-dasharray': '8 4', opacity: '0.8' })
    expect(dst.filter).toMatch(/^url\(#.+\)$/)
    expect(dst.filter).not.toBe(src.filter)
    expect(await page.locator(`filter[id="${dst.filter.slice(5, -1)}"]`).count()).toBe(1)
    expect(await undoSize(page)).toBe(before + 1)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attrs(page, 'dst')).toMatchObject({ fill: '#cccccc', stroke: null, filter: null })
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect((await attrs(page, 'dst')).stroke).toBe('#00aa00')
  })

  test('Apply selection\'s style to this restyles the clicked shape from the selection', async ({ page }) => {
    await select(page, 'src')
    await pickAndChoose(page, { x: 360, y: 80 }, 'styleFromSelection')
    expect(await attrs(page, 'dst')).toMatchObject({ fill: 'url(#grad1)', stroke: '#00aa00', opacity: '0.8' })
    expect(await attrs(page, 'src')).toMatchObject({ fill: 'url(#grad1)' })
  })

  test('the style rows are greyed out with nothing else selected', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await page.evaluate(() => window.svgEditor.commands.run('tool_eyedropper'))
    await page.evaluate((p) => window.svgEditor.automation.pointer([{ kind: 'click', ...p }]), { x: 100, y: 80 })
    const disabled = await page.evaluate(() => [...document.querySelector('se-eyedropper-menu').shadowRoot.querySelectorAll('li.disabled a')].map((a) => a.dataset.action))
    expect(disabled).toEqual(['styleToSelection', 'styleFromSelection'])
  })
})
