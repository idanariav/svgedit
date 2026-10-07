import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

test.describe('Node-editing a path inside a group', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  // Regression: a host (e.g. the Obsidian plugin) serializes the drawing on
  // every 'changed' event. Doing that right after a node-move commit used to
  // exit the group context and swap the selection to the group while the
  // editor was still in 'pathedit'.
  test('serializing on each change keeps the group context during a node drag', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <g id="grp">
          <path id="p1" d="M 100 200 L 200 140 L 300 200 L 100 200 z" fill="none" stroke="#000000" stroke-width="2"/>
        </g>
        <rect id="sib" x="400" y="300" width="40" height="40" fill="#ff0000"/>
      </g>
    </svg>`)

    await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      window.__serialized = []
      canv.bind('changed', () => { window.__serialized.push(canv.getSvgString()) })
      canv.setMode('select')
      canv.setContext(document.querySelector('#svgcontent #grp'))
      const path = document.querySelector('#svgcontent #p1')
      canv.selectOnly([path], true)
      canv.pathActions.toEditMode(path)
    })

    // Real mouse drag of the apex node.
    const grip = page.locator('#pathpointgrip_1')
    const box = await grip.boundingBox()
    if (!box) { throw new Error('node grip has no box') }
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 10, cy + 30, { steps: 5 })
    await page.mouse.up()

    const state = await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      return {
        mode: canv.getCurrentMode(),
        group: canv.getCurrentGroup()?.id ?? null,
        dimmed: canv.getDisabledElems().length,
        selected: canv.getSelectedElements().filter(Boolean).map(e => e.id),
        sibOpacity: document.querySelector('#svgcontent #sib').getAttribute('opacity'),
        serializations: window.__serialized.length,
        leaked: window.__serialized.some(s => s.includes('0.33')),
        d: document.querySelector('#svgcontent #p1').getAttribute('d')
      }
    })

    expect(state.serializations).toBeGreaterThan(0)
    expect(state.d).not.toContain('L 200 140')
    expect(state.mode).toBe('pathedit')
    expect(state.group).toBe('grp')
    expect(state.dimmed).toBeGreaterThan(0)
    expect(state.sibOpacity).toBe('0.33')
    expect(state.selected).not.toContain('grp')
    expect(state.leaked).toBe(false)
  })
})
