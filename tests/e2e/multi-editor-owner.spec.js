import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// With two editors in one document, `window.svgEditor` only points at one of
// them. A component must act on the editor that *contains* it, even when the
// global (or the active-editor pointer) is aimed at the other one — e.g. a
// timer/dialog continuation firing after the user switched panes.
test('components act on their own editor, not on whatever window.svgEditor points at', async ({ page }) => {
  await visitAndApproveStorage(page)

  const result = await page.evaluate(async () => {
    const a = window.svgEditor
    const host = document.createElement('div')
    host.style.cssText = 'width:800px;height:600px'
    document.body.append(host)
    const b = new a.constructor(host)
    b.setConfig({ allowInitialUserOverride: true, extensions: [], noDefaultExtensions: false })
    await b.init()

    // Aim the global at B, then drive a component that lives inside A.
    window.svgEditor = b
    const gridA = a.$container.querySelector('se-grid-settings')
    const before = { a: !!a.configObj.curConfig.showGrid, b: !!b.configObj.curConfig.showGrid }
    gridA._commit('showGrid', 'show_grid', true)
    const after = { a: !!a.configObj.curConfig.showGrid, b: !!b.configObj.curConfig.showGrid }

    b.destroy()
    host.remove()
    window.svgEditor = a
    return { before, after }
  })

  expect(result.before).toEqual({ a: false, b: false })
  expect(result.after).toEqual({ a: true, b: false })
})
