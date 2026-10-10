import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// The Pen carries on an open path when it is pressed on one of its ends, and joins the
// drawing to another open path's end: one element, the right survivor, one undo step.
test.describe('Pen continues and joins open paths', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false // the strokes' edges would pull the points
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <path id="a" d="M100,100 L200,100" fill="none" stroke="#ff0000" stroke-width="4"/>
        <path id="b" d="M300,100 L400,100" fill="none" stroke="#0000ff" stroke-width="4"/>
        <path id="ring" d="M100,300 L200,300 L200,380 Z" fill="none" stroke="#000000" stroke-width="4"/>
      </g>
    </svg>`)
  })

  const click = (page, x, y, mods) => page.evaluate(([px, py, m]) => window.svgEditor.automation.pointer([{ kind: 'click', x: px, y: py, mods: m }]), [x, y, mods])
  const pen = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_path'))
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const paths = (page) => page.locator('#svgcontent g.layer > path')
  // The numbers in a path's data, as [x, y] pairs.
  const points = async (page, id) => {
    const d = await page.locator(`#svgcontent #${id}`).getAttribute('d')
    const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number)
    return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]])
  }

  test('pressing the last point carries the path on; the same element is edited in one undo step', async ({ page }) => {
    const before = await undoSize(page)
    await pen(page)
    await click(page, 202, 101) // near a's end (200,100)
    await click(page, 250, 160)
    await click(page, 300, 200)
    await click(page, 300, 200) // press the last point again: done
    await expect(paths(page)).toHaveCount(3)
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100], [250, 160], [300, 200]])
    expect(await page.locator('#svgcontent #a').getAttribute('stroke')).toBe('#ff0000')
    expect(await undoSize(page)).toBe(before + 1)
    // Selected, tool released back to select.
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100]])
  })

  test('pressing the first point carries it on from that side', async ({ page }) => {
    await pen(page)
    await click(page, 99, 99)
    await click(page, 60, 160)
    await click(page, 60, 160)
    await expect(paths(page)).toHaveCount(3)
    const pts = await points(page, 'a')
    expect(pts[0]).toEqual([200, 100])
    expect(pts[1]).toEqual([100, 100])
    expect(pts[2]).toEqual([60, 160])
  })

  test('while a path is being carried on its original is hidden, and cancelling puts it back', async ({ page }) => {
    await pen(page)
    await click(page, 200, 100)
    expect(await page.locator('#svgcontent #a').getAttribute('display')).toBe('none')
    const before = await undoSize(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    expect(await page.locator('#svgcontent #a').getAttribute('display')).toBeNull()
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100]])
    expect(await undoSize(page)).toBe(before)
  })

  test('carrying a path on and pressing the end of another joins them: one path, one undo step', async ({ page }) => {
    const before = await undoSize(page)
    await pen(page)
    await click(page, 200, 100)
    await click(page, 250, 150)
    await click(page, 301, 99) // b's first point
    await expect(page.locator('#svgcontent #b')).toHaveCount(0)
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100], [250, 150], [300, 100], [400, 100]])
    expect(await undoSize(page)).toBe(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(page.locator('#svgcontent #b')).toHaveCount(1)
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100]])
  })

  test('a new drawing pressed onto a path end joins it; the pressed path keeps its id and style', async ({ page }) => {
    await pen(page)
    await click(page, 300, 300)
    await click(page, 450, 200)
    await click(page, 400, 100) // b's last point
    await expect(paths(page)).toHaveCount(3)
    expect(await points(page, 'b')).toEqual([[300, 100], [400, 100], [450, 200], [300, 300]])
    expect(await page.locator('#svgcontent #b').getAttribute('stroke')).toBe('#0000ff')
  })

  test('a locked Pen stays armed after carrying a path on, ready for the next one', async ({ page }) => {
    await pen(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolLocked(true))
    await click(page, 200, 100)
    await click(page, 250, 160)
    await click(page, 250, 160)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('path')
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100], [250, 160]])
    // The next press carries b on, just as if the tool had been picked afresh.
    await click(page, 400, 100)
    await click(page, 440, 160)
    await click(page, 440, 160)
    expect(await points(page, 'b')).toEqual([[300, 100], [400, 100], [440, 160]])
  })

  test('closed paths are not continued: a press on one starts a new path', async ({ page }) => {
    await pen(page)
    await click(page, 200, 300)
    await click(page, 260, 340)
    await click(page, 260, 340)
    await expect(paths(page)).toHaveCount(4)
    expect(await points(page, 'ring')).toEqual([[100, 300], [200, 300], [200, 380], [100, 300]])
  })

  test('Alt starts a new path even on an open end', async ({ page }) => {
    await pen(page)
    await click(page, 200, 100, { alt: true })
    await click(page, 260, 160)
    await click(page, 260, 160)
    await expect(paths(page)).toHaveCount(4)
    expect(await points(page, 'a')).toEqual([[100, 100], [200, 100]])
  })

  test('a ring marks an end the next press would use', async ({ page }) => {
    await pen(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'move', x: 201, y: 101 }]))
    await expect(page.locator('#pen_end_hint')).toHaveAttribute('display', 'inline')
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'move', x: 250, y: 250 }]))
    await expect(page.locator('#pen_end_hint')).toHaveAttribute('display', 'none')
  })
})
