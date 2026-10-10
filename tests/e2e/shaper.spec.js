import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Real strokes through the registered 'shaper' tool (document-space pointer events), then a
// look at what the drawing holds: the recognized shape, one undo step per stroke, scribble
// deletes only what it crosses, and a stroke that is no shape leaves nothing behind.
const wobbly = (corners, k, wobble) => {
  const out = []
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]
    for (let j = 0; j < k; j++) {
      const w = Math.sin((i * k + j) * 1.7) * wobble
      out.push({ x: a.x + (b.x - a.x) * j / k + w, y: a.y + (b.y - a.y) * j / k - w })
    }
  })
  out.push({ x: corners[0].x + 3, y: corners[0].y + 2 })
  return out
}

const ellipse = (cx, cy, rx, ry, n = 72) => Array.from({ length: n + 1 }, (_, i) => {
  const a = 2 * Math.PI * i / n
  return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
})

const stroke = (pts) => [
  { kind: 'down', ...pts[0] },
  ...pts.slice(1, -1).map((p) => ({ kind: 'move', ...p })),
  { kind: 'up', ...pts[pts.length - 1] }
]

test.describe('Shaper tool', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
  })

  const draw = async (page, pts) => {
    await page.evaluate(() => window.svgEditor.commands.run('tool_shaper'))
    await page.evaluate((events) => window.svgEditor.automation.pointer(events), stroke(pts))
  }
  const layer = (page) => page.locator('#svgcontent g.layer')
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_shaper').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('shaper')
  })

  test('a rough rectangle becomes one <rect>, in one undo step', async ({ page }) => {
    const before = await undoSize(page)
    await draw(page, wobbly([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }], 20, 2))
    await expect(layer(page).locator('> rect')).toHaveCount(1)
    const box = await layer(page).locator('> rect').evaluate((r) => ({
      x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height')
    }))
    expect(Math.abs(box.w - 200)).toBeLessThan(10)
    expect(Math.abs(box.h - 100)).toBeLessThan(10)
    expect(await undoSize(page)).toBe(before + 1)
    // Selected, tool released back to select (like every drawing tool).
    await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(layer(page).locator('> rect')).toHaveCount(0)
  })

  test('a rough ellipse becomes an <ellipse>, a triangle a <polygon> with three points', async ({ page }) => {
    await draw(page, ellipse(200, 200, 90, 50))
    await expect(layer(page).locator('> ellipse')).toHaveCount(1)
    await draw(page, wobbly([{ x: 400, y: 100 }, { x: 500, y: 270 }, { x: 300, y: 270 }], 25, 1.5))
    const polygon = layer(page).locator('> polygon')
    await expect(polygon).toHaveCount(1)
    expect((await polygon.getAttribute('points')).trim().split(/\s+/)).toHaveLength(3)
  })

  test('a straight stroke becomes a <line> with its endpoints', async ({ page }) => {
    await draw(page, Array.from({ length: 31 }, (_, i) => ({ x: 100 + i * 8, y: 100 + i * 2 })))
    const line = layer(page).locator('> line')
    await expect(line).toHaveCount(1)
    expect(await line.evaluate((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')].map(Number)))
      .toEqual([100, 100, 340, 160])
    expect(await line.getAttribute('fill')).toBe('none')
  })

  test('a stroke that is no shape leaves nothing and costs no undo step', async ({ page }) => {
    const before = await undoSize(page)
    const curl = Array.from({ length: 60 }, (_, i) => ({ x: 200 + 50 * Math.cos(i * 0.08), y: 200 + 50 * Math.sin(i * 0.08) }))
    await draw(page, curl)
    expect(await layer(page).locator('> *:not(title)').count()).toBe(0)
    expect(await undoSize(page)).toBe(before)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('shaper')
  })

  test('a scribble deletes only what it crosses', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="hit" x="100" y="100" width="80" height="80" fill="#ffcc00" />
        <path id="hit_line" d="M 40 300 L 260 300" fill="none" stroke="#000000" stroke-width="2" />
        <rect id="miss" x="400" y="100" width="80" height="80" fill="#00ccff" />
        <rect id="ring" x="100" y="360" width="100" height="80" fill="none" stroke="#000000" stroke-width="2" />
      </g>
    </svg>`)
    const before = await undoSize(page)
    // A zig-zag over the filled rect and across the line; it stays inside the empty ring.
    const zig = []
    for (let i = 0; i < 40; i++) zig.push({ x: 90 + (i % 2) * 180, y: 110 + i * 5 })
    await draw(page, zig)
    await expect(page.locator('#svgcontent #hit')).toHaveCount(0)
    await expect(page.locator('#svgcontent #hit_line')).toHaveCount(0)
    await expect(page.locator('#svgcontent #miss')).toHaveCount(1)
    expect(await undoSize(page)).toBe(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(page.locator('#svgcontent #hit')).toHaveCount(1)
    await expect(page.locator('#svgcontent #hit_line')).toHaveCount(1)
  })

  test('a scribble inside an unfilled outline does not delete it', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="ring" x="100" y="100" width="200" height="200" fill="none" stroke="#000000" stroke-width="2" />
      </g>
    </svg>`)
    const zig = []
    for (let i = 0; i < 40; i++) zig.push({ x: 130 + (i % 2) * 140, y: 130 + i * 3.5 })
    await draw(page, zig)
    await expect(page.locator('#svgcontent #ring')).toHaveCount(1)
  })
})
