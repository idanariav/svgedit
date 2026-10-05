import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// ext-frame-labels: a name tag above each frame, double-click to rename.
// Needs the real DOM (overlay positioning, dblclick, right-panel sync), which
// hand-mocked unit fixtures can't cover.

const addFrame = (page, title) =>
  page.evaluate((t) => {
    const canv = window.svgEditor.svgCanvas
    const frame = canv.addSVGElementsFromJson({
      element: 'rect',
      attr: { x: 100, y: 100, width: 150, height: 100, id: canv.getNextId(), 'data-frame': '1', fill: 'none', stroke: '#00f' }
    })
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
    title.textContent = t
    frame.appendChild(title)
    return frame.id
  }, title)

test.describe('Frame labels', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('shows a label with the frame name just above the frame', async ({ page }) => {
    await addFrame(page, 'Hero')
    const label = page.locator('#frameLabels .frame-label')
    await expect(label).toHaveText('Hero')
    const gap = await page.evaluate(() => {
      const l = document.querySelector('.frame-label').getBoundingClientRect()
      const f = document.querySelector('[data-frame]').getBoundingClientRect()
      return { dx: l.left - f.left, dy: f.top - l.bottom }
    })
    expect(Math.abs(gap.dx)).toBeLessThan(1)
    expect(Math.abs(gap.dy)).toBeLessThan(1)
  })

  test('double-click renames the frame (Enter commits) and syncs the title', async ({ page }) => {
    await addFrame(page, 'Hero')
    const label = page.locator('#frameLabels .frame-label')
    await label.dblclick()
    await page.keyboard.type('Renamed')
    await page.keyboard.press('Enter')
    await expect(label).toHaveText('Renamed')
    expect(await page.evaluate(() => document.querySelector('[data-frame] > title').textContent)).toBe('Renamed')
  })

  test('Escape cancels an in-progress rename', async ({ page }) => {
    await addFrame(page, 'Hero')
    const label = page.locator('#frameLabels .frame-label')
    await label.dblclick()
    await page.keyboard.type('Nope')
    await page.keyboard.press('Escape')
    await expect(label).toHaveText('Hero')
  })

  test('renaming from the right panel updates the label', async ({ page }) => {
    const id = await addFrame(page, 'Hero')
    await page.evaluate((i) => {
      const canv = window.svgEditor.svgCanvas
      canv.selectOnly([document.getElementById(i)], true)
      const field = document.getElementById('frame_name')
      field.value = 'From panel'
      field.dispatchEvent(new Event('change'))
    }, id)
    await expect(page.locator('#frameLabels .frame-label')).toHaveText('From panel')
  })

  test('label disappears when the frame is deleted', async ({ page }) => {
    const id = await addFrame(page, 'Hero')
    await expect(page.locator('#frameLabels .frame-label')).toHaveCount(1)
    await page.evaluate((i) => document.getElementById(i).remove(), id)
    await expect(page.locator('#frameLabels .frame-label')).toHaveCount(0)
  })
})
