import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// An Excalidraw "Copy as SVG" holds, next to its shapes, a comment, <metadata>, <defs><style>, and masks (some empty). The
// paste imports it and turns it into a group; the resources go to the drawing's <defs> then (hoist-resources.ts), so an
// ungroup leaves only shapes in the layer. The afterEach checkDrawing (resource-in-layer) catches a regression too.
const EXCALIDRAW = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">' +
  '<!-- svg-source:excalidraw --><metadata></metadata><defs><style class="style-fonts">.x { fill: #1e1e1e; }</style></defs>' +
  '<mask id="mask-a"><rect x="0" y="0" width="200" height="100" fill="#fff"></rect></mask><mask></mask>' +
  '<rect x="0" y="0" width="200" height="100" fill="#ffffff"></rect>' +
  '<g mask="url(#mask-a)"><g transform="translate(10 10)"><path d="M0 0 L50 50" stroke="#1e1e1e" fill="none"></path></g></g></svg>'

const layerKids = (page) => page.evaluate(() =>
  Array.from(window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayer().children).map((el) => el.localName))

test.describe('Pasting an external SVG keeps its resources out of the layer', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate((svg) => {
      const e = window.svgEditor
      e.$container.focus()
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', svg)
      e.$container.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    }, EXCALIDRAW)
  })

  test('the pasted group holds only shapes; its style and referenced mask are in <defs>', async ({ page }) => {
    const group = await page.evaluate(() => {
      const g = window.svgEditor.svgCanvas.getSelectedElements()[0]
      return { tag: g.localName, kids: Array.from(g.childNodes).map((n) => n.nodeType === 1 ? n.localName : n.nodeType === 8 ? '#comment' : null).filter(Boolean) }
    })
    expect(group).toEqual({ tag: 'g', kids: ['rect', 'g'] })
    const defs = await page.evaluate(() => Array.from(window.svgEditor.svgCanvas.findDefs().children).filter((el) => el.localName !== 'symbol').map((el) => el.localName))
    expect(defs).toEqual(['style', 'mask'])
    // the masked shape still finds its (renamed) mask
    expect(await page.evaluate(() => JSON.stringify(window.svgEditor.svgCanvas.checkDrawing()))).toBe('[]')
  })

  test('an ungroup puts only the shapes in the layer, and selects only them', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_ungroup'))
    expect(await layerKids(page)).toEqual(['title', 'rect', 'g'])
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.localName).sort())).toEqual(['g', 'rect'])
  })
})
