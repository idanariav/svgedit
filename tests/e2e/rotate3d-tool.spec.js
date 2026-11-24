import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// 3D Rotate tool: drag on the canvas to turn the selected shape or group in 3D. The result is a `rotate3d` live effect
// (degrees on X, Y, Z and a perspective); one undo step per drag.
test.describe('3D Rotate tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="box" x="100" y="100" width="200" height="100" fill="#cccccc"/>
        <g id="grp">
          <rect id="a" x="350" y="300" width="50" height="50" fill="#f00"/>
          <rect id="b" x="450" y="300" width="50" height="50" fill="#00f"/>
        </g>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_rotate3d'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const drag = (page, from, to, mods) => page.evaluate(([a, b, m]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 10, mods: m }]), [from, to, mods])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const zoom = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getZoom())
  const fx = (page, id) => page.evaluate((i) => document.getElementById(i)?.getAttribute('se:fx') ?? null, id)
  const param = (s, key) => Number(new RegExp(`${key}=([-\\d.e]+)`).exec(s ?? '')?.[1])
  const box = (page, id) => page.evaluate((i) => {
    const b = document.getElementById(i).getBBox()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  }, id)

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_rotate3d').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('rotate3d')
  })

  test('a horizontal drag turns the shape on Y with the default perspective, in one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const undo0 = await undoSize(page)
    const z = await zoom(page)
    await drag(page, { x: 200, y: 150 }, { x: 260, y: 150 })
    const s = await fx(page, 'box')
    expect(s).toMatch(/^rotate3d\(/)
    expect(param(s, 'rotationY')).toBeCloseTo(60 * z * 0.5, 1) // half a degree per screen pixel
    expect(param(s, 'rotationX')).toBeCloseTo(0, 5)
    expect(param(s, 'perspective')).toBe(40)
    expect(s).not.toMatch(/frame/) // a lone shape needs no shared frame
    const b = await box(page, 'box')
    expect(b.w).toBeLessThan(200) // turned away: narrower
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
  })

  test('a vertical drag tilts on X; Alt spins on Z; Shift snaps to 15°', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const z = await zoom(page)
    await drag(page, { x: 200, y: 150 }, { x: 200, y: 190 })
    expect(param(await fx(page, 'box'), 'rotationX')).toBeCloseTo(-40 * z * 0.5, 1)
    await drag(page, { x: 200, y: 150 }, { x: 240, y: 150 }, { alt: true })
    const s = await fx(page, 'box')
    expect(param(s, 'rotationZ')).toBeCloseTo(40 * z * 0.5, 1)
    expect(param(s, 'rotationX')).toBeCloseTo(-40 * z * 0.5, 1) // kept from the first drag
    expect(s.split(';')).toHaveLength(1)
    await drag(page, { x: 200, y: 150 }, { x: 237, y: 150 }, { shift: true })
    expect(param(await fx(page, 'box'), 'rotationY') % 15).toBeCloseTo(0, 5)
  })

  test('the options bar sets a preset and the angles, one undo step each', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('preset', 'isometricLeft'))
    let s = await fx(page, 'box')
    expect([param(s, 'rotationX'), param(s, 'rotationY'), param(s, 'rotationZ')]).toEqual([-45, -35.26, 30])
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('rotationY', 20))
    s = await fx(page, 'box')
    expect(param(s, 'rotationY')).toBe(20)
    expect(await undoSize(page)).toBe(undo0 + 2)
    const preset = await page.evaluate(() => window.svgEditor.svgCanvas.getToolOptions().find((o) => o.id === 'preset').value)
    expect(preset).toBe('custom')
  })

  test('a group turns as one piece about its centre; Reset takes it off', async ({ page }) => {
    await select(page, 'grp')
    await tool(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('perspective', 0))
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('rotationY', 60))
    for (const id of ['a', 'b']) {
      const s = await fx(page, id)
      expect(param(s, 'rotationY')).toBe(60)
      expect(param(s, 'frameW')).toBeCloseTo(150, 3)
    }
    // The group's box is 350..500 (centre 425): without perspective a 60° turn halves every distance to the centre.
    const a = await box(page, 'a')
    const b = await box(page, 'b')
    expect(a.x).toBeCloseTo(387.5, 0)
    expect(b.x + b.w).toBeCloseTo(462.5, 0)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('reset', true))
    for (const id of ['a', 'b']) expect(await fx(page, id)).toBeNull()
  })

  test('a click selects a shape and changes nothing', async ({ page }) => {
    await tool(page)
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 200, y: 150 }]))
    expect(await undoSize(page)).toBe(undo0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id))).toEqual(['box'])
    expect(await fx(page, 'box')).toBeNull()
  })

  test('Escape mid-drag puts the shape back', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'down', x: 200, y: 150 }, { kind: 'move', x: 260, y: 170 }]))
    expect(await fx(page, 'box')).not.toBeNull()
    await page.evaluate(() => window.svgEditor.svgCanvas.cancelGesture())
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
  })
})
