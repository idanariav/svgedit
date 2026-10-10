import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Puppet warp holds ONE undo transaction from entering the tool to leaving it
// (svgCanvas.beginTransaction + onAbort), so the primitive->path conversion, the
// warp and the rig attributes are a single undo step, and Escape / undo / a file
// load leave nothing half-done.

const DOC = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer">
    <title>Layer 1</title>
    <rect id="a" x="100" y="100" width="200" height="120" fill="#00aa00"/>
  </g>
</svg>`

test.describe('puppet warp session', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(async (doc) => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
      await window.svgEditor.loadFromString(doc)
      window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')])
    }, DOC)
  })

  const state = (page) => page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    return {
      mode: c.getMode(),
      tx: c.inTransaction(),
      undo: c.undoMgr.getUndoStackSize(),
      tags: [...document.querySelectorAll('#svgcontent g.layer > *:not(title)')].map((e) => e.tagName),
      d: document.querySelector('#svgcontent g.layer > path')?.getAttribute('d') ?? null
    }
  })

  const warp = (page) => page.evaluate(() => {
    const { automation, commands } = window.svgEditor
    commands.run('tool_puppet_warp')
    automation.pointer([
      { kind: 'click', x: 100, y: 160 }, // an anchor pin
      { kind: 'click', x: 300, y: 160 }, // a second pin...
      { kind: 'drag', x: 300, y: 160, to: { x: 340, y: 120 }, steps: 4 } // ...dragged: the shape bends
    ])
  })

  test('entering the tool opens a transaction; leaving commits one undo step; undo restores the rect', async ({ page }) => {
    await warp(page)
    let s = await state(page)
    expect(s.mode).toBe('puppetwarp')
    expect(s.tx).toBe(true)
    expect(s.tags).toEqual(['path']) // converted

    await page.evaluate(() => window.svgEditor.leftPanel.clickSelect())
    s = await state(page)
    expect(s.tx).toBe(false)
    expect(s.undo).toBe(1) // conversion + warp + rig attrs: one step

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    s = await state(page)
    expect(s.tags).toEqual(['rect'])
    expect(await page.evaluate(() => document.getElementById('a').getAttribute('width'))).toBe('200')
  })

  test('Escape cancels the session: the rect is back, nothing to undo, selection restored', async ({ page }) => {
    await warp(page)
    await page.evaluate(() => window.svgEditor.automation.key('escape'))
    const s = await state(page)
    expect(s).toMatchObject({ mode: 'select', tx: false, undo: 0, tags: ['rect'] })
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().map((e) => e?.id))).toEqual(['a'])
  })

  test('undo during the session drops it and returns to select, leaving a clean drawing', async ({ page }) => {
    await warp(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    const s = await state(page)
    expect(s).toMatchObject({ mode: 'select', tx: false, undo: 0, tags: ['rect'] })
    // a stray pointer event must not resurrect anything
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 120, y: 130 }]))
    expect((await state(page)).tags).toEqual(['rect'])
  })

  test('entering and leaving without warping is a no-op (no undo step, still a rect)', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_puppet_warp'))
    expect((await state(page)).tags).toEqual(['path'])
    await page.evaluate(() => window.svgEditor.leftPanel.clickSelect())
    expect(await state(page)).toMatchObject({ tx: false, undo: 0, tags: ['rect'] })
  })

  test('loading another file mid-session drops the session', async ({ page }) => {
    await warp(page)
    await page.evaluate(async (doc) => window.svgEditor.loadFromString(doc), DOC)
    expect(await state(page)).toMatchObject({ mode: 'select', tx: false, undo: 0 })
  })
})
