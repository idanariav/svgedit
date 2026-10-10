import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Real-browser coverage for core/transaction.js: native SVG transform lists,
// real selection/grips and the live-effects pilot, none of which jsdom has.
const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="50" y="50" width="60" height="60" fill="#00aa00"/>
    <rect id="b" x="200" y="50" width="60" height="60" fill="#0000aa"/>
  </g>
</svg>`

test.describe('undo transactions', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor?.configObj?.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await page.evaluate(async (doc) => { await window.svgEditor.loadFromString(doc) }, DOC)
  })

  test('a canvas operation inside transact() is one undo step, restored exactly', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const before = c.getSvgString()
      c.selectOnly([document.getElementById('a'), document.getElementById('b')])
      c.transact('Group', () => c.groupSelectedElements())
      const grouped = c.getSvgString()
      const undoSteps = c.undoMgr.getUndoStackSize()
      c.undoMgr.undo()
      const undone = c.getSvgString()
      c.undoMgr.redo()
      return { before, grouped, undoSteps, undone, redone: c.getSvgString() }
    })
    expect(r.undoSteps).toBe(1)
    expect(r.grouped).not.toBe(r.before)
    expect(r.undone).toBe(r.before)
    expect(r.redone).toBe(r.grouped)
  })

  test('moves recorded through the native transform list undo cleanly', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const a = document.getElementById('a')
      c.selectOnly([a])
      const before = c.getSvgString()
      const tx = c.beginTransaction('Nudge')
      a.transform.baseVal.appendItem(c.getSvgRoot().createSVGTransform())
      a.transform.baseVal.getItem(0).setTranslate(25, 35)
      tx.commit()
      const moved = a.getAttribute('transform')
      c.undoMgr.undo()
      return { moved, after: c.getSvgString(), before, undoSteps: c.undoMgr.getRedoStackSize() }
    })
    expect(r.moved).toContain('translate(25')
    expect(r.after).toBe(r.before)
    expect(r.undoSteps).toBe(1)
  })

  test('cancel puts back drawing and selection; nothing is recorded', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([document.getElementById('b')])
      const before = c.getSvgString()
      const tx = c.beginTransaction('Preview')
      document.getElementById('b').setAttribute('width', '300')
      document.getElementById('a').remove()
      c.clearSelection()
      tx.cancel()
      return {
        same: c.getSvgString() === before,
        selected: c.getSelectedElements().filter(Boolean).map((e) => e.id),
        undo: c.undoMgr.getUndoStackSize()
      }
    })
    expect(r).toEqual({ same: true, selected: ['b'], undo: 0 })
  })

  test('live effects (migrated onto transact) apply, undo and redo as one step', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const a = document.getElementById('a')
      c.selectOnly([a])
      const before = c.getSvgString()
      const out = c.applyLiveEffects([{ name: 'zigZag', params: {} }])
      const applied = c.getSvgString()
      const info = { tag: out?.tagName, id: out?.id, steps: c.undoMgr.getUndoStackSize(), text: c.undoMgr.getNextUndoCommandText() }
      c.undoMgr.undo()
      const undone = c.getSvgString()
      c.undoMgr.redo()
      return { info, before, applied, undone, redone: c.getSvgString() }
    })
    expect(r.info).toEqual({ tag: 'path', id: 'a', steps: 1, text: 'Live effects' })
    expect(r.applied).not.toBe(r.before)
    expect(r.undone).toBe(r.before) // the <rect> is back, with its id
    expect(r.redone).toBe(r.applied)
  })

  test('a live-effects preview leaves no trace in the undo history', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([document.getElementById('a')])
      const before = c.getSvgString()
      c.previewLiveEffects([{ name: 'zigZag', params: {} }])
      const during = c.getSvgString()
      c.cancelLiveEffectsPreview()
      return { before, during, after: c.getSvgString(), undo: c.undoMgr.getUndoStackSize() }
    })
    expect(r.after).toBe(r.before)
    expect(r.undo).toBe(0)
  })
})
