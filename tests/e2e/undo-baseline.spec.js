import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <g id="grp">
      <rect id="a" x="150" y="250" width="60" height="60" fill="#00aa00"/>
      <rect id="b" x="250" y="250" width="60" height="60" fill="#0000aa"/>
    </g>
    <rect id="sib" x="400" y="300" width="40" height="40" fill="#ff0000"/>
  </g>
</svg>`

const state = (page) => page.evaluate(() => {
  const canv = window.svgEditor.svgCanvas
  const x = id => document.getElementById(id)?.getAttribute('x') ?? null
  return {
    undo: canv.undoMgr.getUndoStackSize(),
    redo: canv.undoMgr.getRedoStackSize(),
    undoDisabled: document.querySelector('#tool_undo')?.disabled,
    hasDrawing: !!document.getElementById('grp') && !!document.getElementById('sib'),
    a: x('a'),
    b: x('b'),
    group: canv.getCurrentGroup()?.id ?? null,
    selected: canv.getSelectedElements().filter(Boolean).map(e => e.id)
  }
})

test.describe('Loaded document is the undo baseline', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor?.configObj?.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await page.evaluate(async (doc) => { await window.svgEditor.loadFromString(doc) }, DOC)
  })

  test('a fresh load has an empty history and an untouched doc needs no save prompt', async ({ page }) => {
    const s = await state(page)
    expect(s.undo).toBe(0)
    expect(s.redo).toBe(0)
    expect(s.undoDisabled).toBe(true)
    expect(await page.evaluate(() => window.svgEditor.openPrep())).toBe(true)
  })

  test('undo past the first edit never removes the drawing', async ({ page }) => {
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      canv.setMode('select')
      canv.selectOnly([document.getElementById('sib')], true)
      canv.moveSelectedElements(10, 0, true)
    })
    expect((await state(page)).undo).toBe(1)

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    }
    const s = await state(page)
    expect(s.hasDrawing).toBe(true)
    expect(s.undo).toBe(0)
  })

  test('a second load replaces the baseline instead of stacking another', async ({ page }) => {
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      canv.selectOnly([document.getElementById('sib')], true)
      canv.moveSelectedElements(10, 0, true)
    })
    await page.evaluate(async (doc) => { await window.svgEditor.loadFromString(doc) }, DOC)
    const s = await state(page)
    expect(s.undo).toBe(0)
    expect(s.redo).toBe(0)
  })

  test('serializing on every change keeps the group during nested edits, and undo steps back one edit at a time', async ({ page }) => {
    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      // A host (e.g. the Obsidian plugin) saves on every change.
      canv.bind('changed', () => canv.getSvgString())
      canv.setMode('select')
      canv.setContext(document.getElementById('grp'))
      canv.selectOnly([document.getElementById('a')], true)
      canv.moveSelectedElements(5, 0, true)
      canv.moveSelectedElements(5, 0, true)
    })
    let s = await state(page)
    expect(s.group).toBe('grp')
    expect(s.selected).toStrictEqual(['a'])
    expect(s.a).toBe('160')
    expect(s.b).toBe('250')
    expect(s.undo).toBe(2)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    s = await state(page)
    expect(s.a).toBe('155')
    expect(s.hasDrawing).toBe(true)
  })
  test('inserting a fragment is an incremental undoable edit that keeps prior history and context', async ({ page }) => {
    const result = await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      canv.setMode('select')
      canv.selectOnly([document.getElementById('sib')], true)
      canv.moveSelectedElements(10, 0, true) // one prior edit
      canv.setContext(document.getElementById('grp'))
      const inserted = canv.insertSvgFragment('<text x="5" y="5" data-vault-link="[[n]]">hi</text>')
      return {
        inserted: inserted.length,
        undo: canv.undoMgr.getUndoStackSize(),
        group: canv.getCurrentGroup()?.id ?? null,
        parent: inserted[0].parentNode.id
      }
    })
    expect(result).toStrictEqual({ inserted: 1, undo: 2, group: 'grp', parent: 'grp' })

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    const s = await state(page)
    expect(s.undo).toBe(1) // the earlier move is still undoable
    expect(s.hasDrawing).toBe(true)
  })
})
