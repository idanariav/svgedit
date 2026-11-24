import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// A feathered mask keeps its feather in the silhouette's `style`, after the `pointer-events` state the editor puts first in
// that same style. Saving once dropped the whole style for it, so the mask came back hard-edged (checkDrawing's
// `mask-feather-lost`); undo / redo must keep it too.
test.describe('Mask feather', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('survives a save and reload, and an undo / redo; a reloaded one can be changed', async ({ page }) => {
    const out = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const a = c.addSVGElementsFromJson({ element: 'rect', curStyles: true, attr: { x: 100, y: 100, width: 150, height: 100, id: c.getNextId(), fill: '#f00' } })
      const b = c.addSVGElementsFromJson({ element: 'ellipse', curStyles: true, attr: { cx: 170, cy: 150, rx: 60, ry: 40, id: c.getNextId(), fill: '#0f0' } })
      c.selectOnly([a, b])
      c.clipMask.setMask()
      c.clipMask.setFeather(8)
      // after a load the style is presentation attributes (sanitize.ts), without the `!important` an attribute cannot carry
      const silhouettes = () => [...c.getSvgContent().querySelectorAll('mask > *')]
      const blur = () => silhouettes().map((n) => /blur\(8px\)/.test(`${n.getAttribute('style') ?? ''} ${n.getAttribute('filter') ?? ''}`))
      c.undoMgr.undo()
      c.undoMgr.redo()
      const redone = blur()
      c.setSvgString(c.getSvgString())
      const reloaded = blur()
      const important = silhouettes().flatMap((n) => [...n.attributes].filter((a) => a.name !== 'style' && a.value.includes('!important')).map((a) => a.name))
      // a feather changed after the reload replaces the one the load turned into an attribute
      c.selectOnly([c.getSvgContent().querySelector('[mask]')])
      c.clipMask.setFeather(0)
      const unfeathered = silhouettes().map((n) => getComputedStyle(n).filter)
      return { redone, reloaded, important, unfeathered, findings: c.checkDrawing().map((f) => f.code) }
    })
    expect(out.redone).toEqual([true])
    expect(out.reloaded).toEqual([true])
    expect(out.important).toEqual([])
    expect(out.unfeathered).toEqual(['none'])
    expect(out.findings).toEqual([])
  })
})
