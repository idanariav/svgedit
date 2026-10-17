import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Area text: drag a box with the Text tool and the text wraps to its width; resizing the box re-wraps it
// (the type keeps its size); the rows the wrapping adds are soft and never part of the content.
test.describe('Area text', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="anchor" x="10" y="10" width="20" height="20" fill="#cccccc"/>
      </g>
    </svg>`)
  })

  const SENTENCE = 'The quick brown fox jumps over the lazy dog and keeps running far away'

  const pointer = (page, specs) => page.evaluate((s) => window.svgEditor.automation.pointer(s), specs)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
  const redo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
  /** The text is placed and the edit buffer has focus after the release; keys sent before are lost (under load, the first letters). */
  const editBufferFocused = (page) => expect.poll(() => page.evaluate(() =>
    document.activeElement?.id === 'text' && window.svgEditor.svgCanvas.getMode() === 'textedit' && Boolean(document.querySelector('#svgcontent text'))
  )).toBe(true)
  const drawBox = async (page, from, to) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_text'))
    await pointer(page, [{ kind: 'drag', ...from, to, steps: 10 }])
    await editBufferFocused(page)
  }
  /** The state of the (only) text in the drawing. */
  const info = (page) => page.evaluate(() => {
    const t = document.querySelector('#svgcontent text')
    if (!t) return null
    const ns = 'http://svg-edit.googlecode.com'
    // undo / redo re-create an attribute through its qualified name, so read both
    const attr = (e, n) => e.getAttributeNS(ns, n) ?? e.getAttribute(`se:${n}`)
    return {
      id: t.id,
      x: Number(t.getAttribute('x')),
      y: Number(t.getAttribute('y')),
      size: Number(t.getAttribute('font-size')),
      anchor: t.getAttribute('text-anchor'),
      width: attr(t, 'wrap-width') === null ? null : Number(attr(t, 'wrap-width')),
      height: attr(t, 'wrap-height') === null ? null : Number(attr(t, 'wrap-height')),
      valign: attr(t, 'valign'),
      rows: [...t.querySelectorAll('tspan')].map((s) => s.textContent),
      soft: [...t.querySelectorAll('tspan')].map((s) => attr(s, 'soft')),
      content: window.svgEditor.svgCanvas.getTextWithNewlines(t)
    }
  })
  /** Draw a box, type into it and leave edit mode. */
  const makeAreaText = async (page, text = SENTENCE) => {
    const stepsBefore = await undoSize(page)
    await drawBox(page, { x: 100, y: 100 }, { x: 300, y: 260 })
    // Enter ends editing; Shift+Enter starts a new row
    const lines = text.split('\n')
    for (const [i, line] of lines.entries()) {
      if (i) await page.keyboard.press('Shift+Enter')
      await page.keyboard.type(line)
    }
    await page.keyboard.press('Enter')
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    // The creation's undo step is recorded by a timer after the release (event.js, aniDur): wait for it, or a
    // test that counts undo steps sees it land in the middle of its own gesture.
    await expect.poll(() => undoSize(page)).toBeGreaterThan(stepsBefore)
  }
  const select = (page) => page.evaluate(() => {
    const t = document.querySelector('#svgcontent text')
    window.svgEditor.svgCanvas.selectOnly([t], true)
  })

  test('dragging with the Text tool draws a box; typing wraps to its width', async ({ page }) => {
    await makeAreaText(page)
    const t = await info(page)
    expect(t.width).toBeGreaterThan(190)
    expect(t.width).toBeLessThan(210)
    expect(t.height).toBeGreaterThan(150)
    expect(t.anchor).toBe('start')
    expect(Math.round(t.x)).toBe(100)
    expect(t.rows.length).toBeGreaterThan(2)
    expect(t.soft[0]).toBeNull()
    expect(t.soft.slice(1).every((s) => s !== null)).toBe(true)
    // The content is what was typed: the soft breaks are not in it.
    expect(t.content).toBe(SENTENCE)
    // Every row fits the box
    const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#svgcontent text tspan')].map((s) => s.getComputedTextLength())))
    expect(widest).toBeLessThanOrEqual(t.width + 0.5)
  })

  test('a click still places point text', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_text'))
    await pointer(page, [{ kind: 'click', x: 200, y: 200 }])
    await editBufferFocused(page)
    await page.keyboard.type('hello')
    await page.keyboard.press('Enter')
    const t = await info(page)
    expect(t.width).toBeNull()
    expect(t.content).toBe('hello')
    expect(t.anchor).toBe('middle')
  })

  test('the selection box is the text box, not the ink', async ({ page }) => {
    await makeAreaText(page, 'short')
    await select(page)
    const box = await page.evaluate(() => window.svgEditor.svgCanvas.getBBox(document.querySelector('#svgcontent text')))
    const t = await info(page)
    expect(box.width).toBeCloseTo(t.width, 1)
    expect(box.height).toBeCloseTo(t.height, 1)
  })

  test('clicking the empty part of a box selects the text; outside the box does not', async ({ page }) => {
    await makeAreaText(page, 'short')
    const selected = () => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.localName))
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    expect(await selected()).toEqual([])
    await pointer(page, [{ kind: 'click', x: 280, y: 240 }])
    expect(await selected()).toEqual(['text'])
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await pointer(page, [{ kind: 'click', x: 400, y: 400 }])
    expect(await selected()).toEqual([])
  })

  test('resizing the box re-wraps without touching the type, in one undo step', async ({ page }) => {
    await makeAreaText(page)
    await select(page)
    const before = await info(page)
    const steps = await undoSize(page)
    // The east grip is mid-height on the right edge of the box
    await pointer(page, [{ kind: 'drag', x: before.x + before.width, y: before.y - before.size * 0.8 + before.height / 2, to: { x: before.x + before.width + 120, y: before.y - before.size * 0.8 + before.height / 2 }, steps: 10 }])
    const after = await info(page)
    expect(after.size).toBe(before.size)
    expect(after.width).toBeGreaterThan(before.width + 100)
    expect(after.rows.length).toBeLessThan(before.rows.length)
    expect(after.content).toBe(SENTENCE)
    expect(await undoSize(page)).toBe(steps + 1)
    await undo(page)
    const undone = await info(page)
    expect(undone.width).toBeCloseTo(before.width, 1)
    expect(undone.rows).toEqual(before.rows)
    await redo(page)
    expect((await info(page)).width).toBeCloseTo(after.width, 1)
    expect((await info(page)).rows).toEqual(after.rows)
  })

  test('Area text on / off converts without moving the text', async ({ page }) => {
    const stepsBefore = await undoSize(page)
    await page.evaluate(() => window.svgEditor.commands.run('tool_text'))
    await pointer(page, [{ kind: 'click', x: 200, y: 200 }])
    await editBufferFocused(page)
    await page.keyboard.type('one two')
    await page.keyboard.press('Enter')
    await page.evaluate(() => window.svgEditor.commands.run('tool_select'))
    // the creation's undo step lands from a timer (see makeAreaText)
    await expect.poll(() => undoSize(page)).toBeGreaterThan(stepsBefore)
    await select(page)
    const point = await info(page)
    await page.evaluate(() => window.svgEditor.commands.run('tool_text_area'))
    const area = await info(page)
    expect(area.width).toBeGreaterThan(0)
    expect(area.x).toBe(point.x)
    expect(area.y).toBe(point.y)
    expect(area.content).toBe('one two')
    await page.evaluate(() => window.svgEditor.commands.run('tool_text_area'))
    const back = await info(page)
    expect(back.width).toBeNull()
    expect(back.content).toBe('one two')
    await undo(page)
    expect((await info(page)).width).toBe(area.width)
  })

  test('changing the font size keeps the box in place; undo restores it', async ({ page }) => {
    await makeAreaText(page)
    await select(page)
    const box = () => page.evaluate(() => {
      const b = window.svgEditor.svgCanvas.getBBox(document.querySelector('#svgcontent text'))
      return { x: b.x, y: b.y, width: b.width }
    })
    const before = await box()
    const { rows: rowsBefore, size: sizeBefore } = await info(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setFontSize(32))
    const after = await box()
    expect(after.x).toBeCloseTo(before.x, 1)
    expect(after.y).toBeCloseTo(before.y, 1)
    expect(after.width).toBeCloseTo(before.width, 1)
    const grown = await info(page)
    expect(grown.size).toBe(32)
    expect(grown.rows.length).toBeGreaterThan(rowsBefore.length)
    expect(grown.content).toBe(SENTENCE)
    await undo(page)
    const undone = await info(page)
    expect(undone.size).toBe(sizeBefore)
    expect(undone.rows).toEqual(rowsBefore)
    expect((await box()).y).toBeCloseTo(before.y, 1)
  })

  test('changing the alignment keeps the box in place', async ({ page }) => {
    await makeAreaText(page)
    await select(page)
    const left = () => page.evaluate(() => window.svgEditor.svgCanvas.getBBox(document.querySelector('#svgcontent text')).x)
    const before = await left()
    for (const anchor of ['middle', 'end', 'start']) {
      await page.evaluate((a) => window.svgEditor.svgCanvas.setTextAnchor(a), anchor)
      expect(await left()).toBeCloseTo(before, 1)
      expect((await info(page)).content).toBe(SENTENCE)
    }
  })

  test('vertical alignment moves the rows inside a fixed-height box', async ({ page }) => {
    await makeAreaText(page, 'two\nrows')
    await select(page)
    const firstBaseline = () => page.evaluate(() => Number(document.querySelector('#svgcontent text tspan').getAttribute('y')))
    const top = await firstBaseline()
    await page.evaluate(() => window.svgEditor.svgCanvas.setTextValign('bottom'))
    const bottom = await firstBaseline()
    expect(bottom).toBeGreaterThan(top + 50)
    expect((await info(page)).valign).toBe('bottom')
    await page.evaluate(() => window.svgEditor.svgCanvas.setTextValign('middle'))
    const middle = await firstBaseline()
    expect(middle).toBeGreaterThan(top)
    expect(middle).toBeLessThan(bottom)
    await undo(page)
    expect(await firstBaseline()).toBeCloseTo(bottom, 1)
    expect((await info(page)).content).toBe('two\nrows')
  })

  test('typing in an existing area text keeps wrapping, and edits the right place', async ({ page }) => {
    await makeAreaText(page, 'alpha beta gamma delta epsilon zeta eta theta iota kappa')
    // Edit again: double-click the text, go to the start, type
    await select(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.textActions.start(document.querySelector('#svgcontent text')))
    await page.evaluate(() => { const ta = document.getElementById('text'); ta.focus(); ta.setSelectionRange(0, 0) })
    await page.keyboard.type('START ')
    await page.keyboard.press('Enter')
    const t = await info(page)
    expect(t.content).toBe('START alpha beta gamma delta epsilon zeta eta theta iota kappa')
    expect(t.rows.length).toBeGreaterThan(2)
  })

  test('ArrowUp / ArrowDown move the caret by drawn row, not by paragraph', async ({ page }) => {
    await makeAreaText(page)
    await select(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.textActions.start(document.querySelector('#svgcontent text')))
    const { rows } = await info(page)
    // text index where each drawn row starts (a soft break swallowed one space)
    const starts = rows.reduce((acc, r, i) => [...acc, i ? acc[i - 1] + rows[i - 1].length + 1 : 0], [])
    const caret = () => page.evaluate(() => document.getElementById('text').selectionStart)
    await page.evaluate(() => { const ta = document.getElementById('text'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length) })
    await page.keyboard.press('ArrowUp')
    const up = await caret()
    expect(up).toBeGreaterThanOrEqual(starts[rows.length - 2])
    expect(up).toBeLessThan(starts[rows.length - 1])
    await page.keyboard.press('ArrowDown')
    expect(await caret()).toBeGreaterThanOrEqual(starts[rows.length - 1])
    for (let i = 0; i < rows.length; i++) await page.keyboard.press('ArrowUp')
    expect(await caret()).toBe(0)
    // typing goes where the caret is
    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('X')
    expect((await info(page)).content).toContain('X')
    expect((await info(page)).content.replace('X', '')).toBe(SENTENCE)
  })

  test('Home / End (and Shift) go to the start / end of the drawn row, not of the paragraph', async ({ page }) => {
    await makeAreaText(page)
    await select(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.textActions.start(document.querySelector('#svgcontent text')))
    const { rows } = await info(page)
    const starts = rows.reduce((acc, r, i) => [...acc, i ? acc[i - 1] + rows[i - 1].length + 1 : 0], [])
    const sel = () => page.evaluate(() => { const ta = document.getElementById('text'); return [ta.selectionStart, ta.selectionEnd] })
    const put = (at) => page.evaluate((i) => { const ta = document.getElementById('text'); ta.focus(); ta.setSelectionRange(i, i) }, at)
    const mid = starts[1] + 2
    await put(mid)
    await page.keyboard.press('Home')
    expect(await sel()).toEqual([starts[1], starts[1]])
    await put(mid)
    await page.keyboard.press('End')
    // the end of a soft row includes the space the break swallowed, i.e. the position just before the next row
    expect(await sel()).toEqual([starts[2] - 1, starts[2] - 1])
    await page.keyboard.press('Shift+Home')
    expect(await sel()).toEqual([starts[1], starts[2] - 1])
    // the last row ends at the end of the text
    await put(starts[rows.length - 1] + 1)
    await page.keyboard.press('End')
    expect((await sel())[0]).toBe(SENTENCE.length)
  })

  test('typing across the first 100 ms after drawing the box keeps every letter (no late select-all)', async ({ page }) => {
    await drawBox(page, { x: 100, y: 100 }, { x: 300, y: 260 })
    // the context panel used to select the whole edit buffer 100 ms after the box was drawn, so the next key replaced what was typed
    await page.keyboard.type('abcdefghij', { delay: 30 })
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getTextWithNewlines(document.querySelector('#svgcontent text')))).toBe('abcdefghij')
  })

  test('area text survives save and load', async ({ page }) => {
    await makeAreaText(page)
    const before = await info(page)
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(svg).toContain('wrap-width')
    await setSvgSource(page, svg)
    const after = await info(page)
    expect(after.width).toBeCloseTo(before.width, 1)
    expect(after.rows).toEqual(before.rows)
    expect(after.content).toBe(SENTENCE)
  })
})
