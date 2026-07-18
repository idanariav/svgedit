import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Regression coverage for a recurring bug class: a mode/tool "session" (path
// node-edit, text edit, resize) leaves stale state behind when it exits,
// instead of returning the canvas to a clean baseline. Two concrete variants
// found and fixed:
//  1. Editing a path/text that lives inside a <g> auto-drills into that group
//     (setContext) so the element becomes clickable at all. Exiting the
//     edit session (Select tool, Escape, switching tools) never released that
//     group context, so `currentGroup` stayed stale: every sibling of that
//     group stayed dimmed (opacity x0.33) and non-interactive
//     (pointer-events:none), and the next shape drawn silently landed inside
//     the stale group instead of the current layer.
//  2. Clicking (not dragging) a resize grip inserted 3 dummy identity
//     transforms that were only ever cleaned up after actual pointer
//     movement, permanently polluting the element's transform list.
// These tests exercise the real toolbar/mouse flow end-to-end so they'd catch
// a regression of either pattern, or a similar new one in a different tool.
//
// Coordinates are computed from #svgroot + #svgcontent's x/y offset + zoom
// (see CLAUDE.md "Coordinate mapping for real mouse drags") rather than the
// shared `clickCanvas` helper, which only offsets from #svgroot and is
// imprecise once #svgcontent has a non-zero x/y (as it does once a document
// is loaded via the source-editor dialog) -- these tests need pixel-accurate
// placement for path-point / grip-corner precision.
async function contentOrigin (page) {
  return page.evaluate(() => {
    const rootRect = document.querySelector('#svgroot').getBoundingClientRect()
    const content = document.querySelector('#svgcontent')
    return {
      ox: rootRect.left + Number(content.getAttribute('x')),
      oy: rootRect.top + Number(content.getAttribute('y')),
      zoom: window.svgEditor.svgCanvas.getZoom()
    }
  })
}
async function clickContent (page, x, y) {
  const { ox, oy, zoom } = await contentOrigin(page)
  await page.mouse.click(ox + x * zoom, oy + y * zoom)
}
async function dblclickContent (page, x, y) {
  const { ox, oy, zoom } = await contentOrigin(page)
  await page.mouse.dblclick(ox + x * zoom, oy + y * zoom)
}

// Left-panel tool buttons report zero bounding-box size in headless Chromium
// at some layout states (e.g. right after a text-edit session), so
// `locator.click()`'s actionability wait can hang indefinitely. Use a JS
// click instead (see CLAUDE.md "Toolbar tools are off-screen at small
// viewports").
async function clickTool (page, selector) {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), selector)
}
async function dragContent (page, from, to) {
  const { ox, oy, zoom } = await contentOrigin(page)
  await page.mouse.move(ox + from.x * zoom, oy + from.y * zoom)
  await page.mouse.down()
  await page.mouse.move(ox + to.x * zoom, oy + to.y * zoom, { steps: 5 })
  await page.mouse.up()
}

test.describe('Tool exit / stale state regression', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('drawing a new path after exiting node-edit on a grouped path lands on the layer, not the stale group', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <g id="testGroup">
          <path id="testPath" d="M100,100 L200,100 L200,200 Z" fill="#ff0000" stroke="#000000" stroke-width="2"/>
          <rect id="siblingRect" x="250" y="100" width="80" height="80" fill="#00ff00"/>
        </g>
        <rect id="outsiderRect" x="20" y="20" width="40" height="40" fill="#0000ff"/>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    const path = page.locator('#svgcontent #testPath')
    // Drill into the group + select the path (real double-click gesture)
    await path.dblclick({ force: true })
    await page.waitForTimeout(150)
    // A click on an already-selected single path is bookkeeping the first
    // time, then actually enters node-edit the second time.
    await path.click({ force: true })
    await page.waitForTimeout(150)
    await path.click({ force: true })
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('pathedit')

    // Exit node-edit the way the UI does: click the Select tool
    await clickTool(page, '#tool_select')
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => !!window.svgEditor.svgCanvas.getCurrentGroup())).toBe(false)

    // Draw a brand new path elsewhere on the canvas via the Pen tool, then
    // finish it with a double-click on the last point (the app's actual
    // "end an open path" gesture).
    await clickTool(page, '#tool_path')
    await page.waitForTimeout(100)
    await clickContent(page, 400, 350)
    await page.waitForTimeout(100)
    await clickContent(page, 450, 350)
    await page.waitForTimeout(100)
    await dblclickContent(page, 450, 400)
    await page.waitForTimeout(300)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')

    const newPathParent = await page.evaluate(() => {
      const sel = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)
      return sel[0]?.parentNode?.id
    })
    expect(newPathParent).not.toBe('testGroup')

    // A single click on the never-touched outsider rect must select it right
    // away -- it must not still be dimmed/pointer-events:none from a leaked
    // group context.
    await clickTool(page, '#tool_select')
    await page.waitForTimeout(100)
    await page.locator('#svgcontent #outsiderRect').click({ force: true })
    await page.waitForTimeout(100)
    const selected = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map(e => e.id))
    expect(selected).toContain('outsiderRect')
  })

  test('Escape from node-edit on a grouped path also releases the group context', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <g id="testGroup">
          <path id="testPath" d="M100,100 L200,100 L200,200 Z" fill="#ff0000" stroke="#000000" stroke-width="2"/>
        </g>
        <rect id="outsiderRect" x="20" y="20" width="40" height="40" fill="#0000ff"/>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    const path = page.locator('#svgcontent #testPath')
    await path.dblclick({ force: true })
    await page.waitForTimeout(150)
    await path.click({ force: true })
    await page.waitForTimeout(150)
    await path.click({ force: true })
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('pathedit')

    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    expect(await page.evaluate(() => !!window.svgEditor.svgCanvas.getCurrentGroup())).toBe(false)

    await page.locator('#svgcontent #outsiderRect').click({ force: true })
    await page.waitForTimeout(100)
    const selected = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map(e => e.id))
    expect(selected).toContain('outsiderRect')
  })

  test('drawing a new shape after exiting text-edit on grouped text lands on the layer, not the stale group', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <g id="testGroup">
          <text id="testText" x="100" y="100" font-size="20">Hello</text>
          <rect id="siblingRect" x="250" y="100" width="80" height="80" fill="#00ff00"/>
        </g>
        <rect id="outsiderRect" x="20" y="20" width="40" height="40" fill="#0000ff"/>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    const text = page.locator('#svgcontent #testText')
    // First double-click only drills into the group + selects the text (the
    // pre-drill hit-test resolves to the group, not the text itself, so the
    // dblClickEvent's "tagName === 'text'" text-edit check can't fire yet).
    // A SECOND double-click, now resolving directly to the text, enters
    // text-edit -- mirrors path's "click twice on an already-selected
    // element" two-step entry.
    await text.dblclick({ force: true })
    await page.waitForTimeout(150)
    await text.dblclick({ force: true })
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('textedit')

    await clickTool(page, '#tool_select')
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => !!window.svgEditor.svgCanvas.getCurrentGroup())).toBe(false)

    // Draw a new rect elsewhere on the canvas
    await clickTool(page, '#tool_rect')
    await page.waitForTimeout(100)
    await dragContent(page, { x: 400, y: 350 }, { x: 460, y: 400 })
    await page.waitForTimeout(200)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')

    const newRectParent = await page.evaluate(() => {
      const sel = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)
      return sel[0]?.parentNode?.id
    })
    expect(newRectParent).not.toBe('testGroup')

    await clickTool(page, '#tool_select')
    await page.waitForTimeout(100)
    await page.locator('#svgcontent #outsiderRect').click({ force: true })
    await page.waitForTimeout(100)
    const selected = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map(e => e.id))
    expect(selected).toContain('outsiderRect')
  })

  test('clicking a resize grip without dragging leaves the element untouched', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="testRect" x="100" y="100" width="100" height="100" fill="#00ff00"/>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    await page.locator('#svgcontent #testRect').click({ force: true })
    await page.waitForTimeout(150)

    // The "se" (bottom-right corner) grip -- unlike "n" (top-middle), it
    // doesn't sit under the rotate-grip connector line, so a click reliably
    // hits the resize grip itself rather than the connector on top of it.
    const grip = page.locator('#selectorGrip_resize_se')
    await expect(grip).toBeVisible()
    // A plain click (no movement) on the grip -- must not leave the temporary
    // translate/scale/translate placeholders stuck on the element.
    await grip.click({ force: true })
    await page.waitForTimeout(150)

    const transform = await page.locator('#svgcontent #testRect').getAttribute('transform')
    expect(transform).toBeNull()

    // The canvas must still be fully usable afterwards: a real drag-resize
    // on the same grip should still work.
    const gripBox = await grip.boundingBox()
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 - 40, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(150)

    const height = await page.locator('#svgcontent #testRect').getAttribute('height')
    expect(Number(height)).toBeLessThan(100)
  })

  test('a stale group-context tool-exit sequence does not corrupt the exported SVG', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <g id="testGroup">
          <path id="testPath" d="M100,100 L200,100 L200,200 Z" fill="#ff0000" stroke="#000000" stroke-width="2"/>
          <rect id="siblingRect" x="250" y="100" width="80" height="80" fill="#00ff00"/>
        </g>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    const path = page.locator('#svgcontent #testPath')
    await path.dblclick({ force: true })
    await page.waitForTimeout(150)
    await path.click({ force: true })
    await page.waitForTimeout(150)
    await path.click({ force: true })
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('pathedit')

    await clickTool(page, '#tool_select')
    await page.waitForTimeout(150)

    const svgString = await page.evaluate(() => window.svgEditor.svgCanvas.svgCanvasToString())
    expect(svgString).not.toContain('pointer-events: none')
    expect(svgString).not.toContain('pointer-events:none')
  })
})

// Baseline path-tool-exit coverage that does NOT involve a group at all --
// the group-context leak above is one way the pen tool gets stuck, but not
// the only "exit the tool cleanly" case worth locking in. These exercise
// abandoning an in-progress path draw (mode 'path', not yet committed) via
// each of the ways a user actually leaves it: the Select tool, Escape, and
// switching straight to a different drawing tool -- plus a plain node-edit
// exit with no group precondition at all.
test.describe('Path tool exit (no group involved)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('abandoning an in-progress path draw via the Select tool leaves no dangling preview and keeps the canvas interactive', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="untouchedRect" x="400" y="50" width="60" height="60" fill="#0000ff"/>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    await clickTool(page, '#tool_path')
    await page.waitForTimeout(100)
    // Place two points, then walk away without finishing the path.
    await clickContent(page, 100, 100)
    await page.waitForTimeout(100)
    await clickContent(page, 150, 100)
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => !!window.svgEditor.svgCanvas.getDrawnPath())).toBe(true)

    await clickTool(page, '#tool_select')
    await page.waitForTimeout(150)

    const state = await page.evaluate(() => ({
      mode: window.svgEditor.svgCanvas.getMode(),
      drawnPath: !!window.svgEditor.svgCanvas.getDrawnPath(),
      stretchLineExists: !!document.getElementById('path_stretch_line')
    }))
    expect(state.mode).toBe('select')
    expect(state.drawnPath).toBe(false)
    expect(state.stretchLineExists).toBe(false)

    // The abandoned path must not have been committed anywhere.
    const svgString = await page.evaluate(() => window.svgEditor.svgCanvas.svgCanvasToString())
    expect(svgString).not.toContain('<path')

    // Canvas must still be fully usable: one click selects the untouched rect.
    await page.locator('#svgcontent #untouchedRect').click({ force: true })
    await page.waitForTimeout(100)
    const selected = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map(e => e.id))
    expect(selected).toContain('untouchedRect')
  })

  test('abandoning an in-progress path draw via Escape leaves no dangling preview', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title></g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    await clickTool(page, '#tool_path')
    await page.waitForTimeout(100)
    await clickContent(page, 100, 100)
    await page.waitForTimeout(100)
    await clickContent(page, 150, 100)
    await page.waitForTimeout(100)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)

    const state = await page.evaluate(() => ({
      mode: window.svgEditor.svgCanvas.getMode(),
      drawnPath: !!window.svgEditor.svgCanvas.getDrawnPath()
    }))
    expect(state.mode).toBe('select')
    expect(state.drawnPath).toBe(false)
  })

  test('switching directly to another drawing tool mid-path-draw cleans up the abandoned path and the new tool works', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title></g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    await clickTool(page, '#tool_path')
    await page.waitForTimeout(100)
    await clickContent(page, 100, 100)
    await page.waitForTimeout(100)
    await clickContent(page, 150, 100)
    await page.waitForTimeout(100)

    // Switch straight to Rect -- not via Select first.
    await clickTool(page, '#tool_rect')
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => !!window.svgEditor.svgCanvas.getDrawnPath())).toBe(false)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent path').length)).toBe(0)

    // The Rect tool must work normally afterward -- no leftover state from
    // the abandoned path should interfere with drawing a fresh shape.
    await dragContent(page, { x: 300, y: 300 }, { x: 360, y: 350 })
    // Shape creation defers its mode-revert-to-select behind a short
    // (~0.2s) opacity-fade timeout (see event.js mouseUpEvent) -- wait past it.
    await page.waitForTimeout(400)

    const state = await page.evaluate(() => ({
      mode: window.svgEditor.svgCanvas.getMode(),
      rectCount: document.querySelectorAll('#svgcontent rect').length
    }))
    expect(state.mode).toBe('select')
    expect(state.rectCount).toBe(1)
  })

  test('exiting node-edit on a plain, ungrouped path via the Select tool returns to a clean baseline', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <path id="testPath" d="M100,100 L200,100 L200,200 Z" fill="#ff0000" stroke="#000000" stroke-width="2"/>
      </g>
    </svg>`)
    await page.waitForSelector('#svgroot', { timeout: 5000 })

    const path = page.locator('#svgcontent #testPath')
    await path.click({ force: true })
    await page.waitForTimeout(150)
    // Second click on the already-selected path enters node-edit.
    await path.click({ force: true })
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('pathedit')

    await clickTool(page, '#tool_select')
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')

    // Drawing a brand new path elsewhere afterward must work normally.
    await clickTool(page, '#tool_path')
    await page.waitForTimeout(100)
    await clickContent(page, 400, 350)
    await page.waitForTimeout(100)
    await clickContent(page, 450, 350)
    await page.waitForTimeout(100)
    await dblclickContent(page, 450, 400)
    await page.waitForTimeout(300)

    const state = await page.evaluate(() => {
      const sel = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)
      return {
        mode: window.svgEditor.svgCanvas.getMode(),
        newPathParent: sel[0]?.parentNode?.tagName
      }
    })
    expect(state.mode).toBe('select')
    expect(state.newPathParent).toBe('g')
  })
})
