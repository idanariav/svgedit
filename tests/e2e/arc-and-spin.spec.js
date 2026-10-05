import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Right-panel spin-input behaviors that unit fixtures can't observe: real
// mouse press-and-hold auto-repeat, and the panel's scroll position surviving
// the <circle> -> arc <path> element swap.

const readSpinValue = (id) =>
  document.getElementById(id).shadowRoot.querySelector('.num-input').value

const spinButtonCenter = ([id, cls]) => {
  const r = document.getElementById(id).shadowRoot.querySelector(cls).getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

test.describe('Right panel spin inputs', () => {
  test.beforeEach(async ({ page }) => {
    // Short viewport so the Design tab scrolls and a scroll jump is observable.
    await page.setViewportSize({ width: 1440, height: 700 })
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor?.configObj?.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.waitFor({ state: 'visible' })
    await panelHandle.click()
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const circle = canv.addSVGElementsFromJson({
        element: 'circle',
        curStyles: true,
        attr: { cx: 200, cy: 200, r: 80, id: canv.getNextId() }
      })
      canv.selectOnly([circle], true)
    })
    await page.waitForSelector('#circle_arc', { state: 'visible' })
  })

  test('holding a spin button keeps changing the value until release', async ({ page }) => {
    const before = Number(await page.evaluate(readSpinValue, 'stroke_width'))
    const { x, y } = await page.evaluate(spinButtonCenter, ['stroke_width', '.spin-up'])
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(1000)
    await page.mouse.up()

    const held = Number(await page.evaluate(readSpinValue, 'stroke_width'))
    expect(held).toBeGreaterThan(before + 3) // far more than a single click's +1

    await page.waitForTimeout(400)
    expect(Number(await page.evaluate(readSpinValue, 'stroke_width'))).toBe(held)
  })

  test('stepping the arc field keeps the panel scroll position when the circle becomes an arc path', async ({ page }) => {
    await page.evaluate(() => { document.getElementById('sidepanel_content').scrollTop = 200 })
    const arcTop = () => page.evaluate(() => Math.round(document.getElementById('circle_arc').getBoundingClientRect().top))
    const before = await arcTop()

    const { x, y } = await page.evaluate(spinButtonCenter, ['circle_arc', '.spin-down'])
    await page.mouse.click(x, y)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()[0].tagName)).toBe('path')
    expect(await arcTop()).toBe(before)
  })

  test('arc preset buttons set the arc angle (circle <-> arc path) in one click', async ({ page }) => {
    const state = () => page.evaluate(() => {
      const el = window.svgEditor.svgCanvas.getSelectedElements()[0]
      return { tag: el.tagName, arc: el.getAttribute('data-arc') }
    })

    await page.click('.arc_preset[data-target="circle_arc"][data-arc="270"]')
    expect(await state()).toEqual({ tag: 'path', arc: '270' })
    expect(await page.evaluate(readSpinValue, 'circle_arc')).toBe('270')

    await page.click('.arc_preset[data-target="circle_arc"][data-arc="90"]')
    expect(await state()).toEqual({ tag: 'path', arc: '90' })
  })
})
