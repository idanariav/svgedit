import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Art and pattern brushes: artwork → a brush in the drawing's library → a path becomes a group of art along it.
test.describe('Art and pattern brushes', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <path id="leaf" d="M20,420 L60,400 L100,420 L60,440 Z" fill="#2f855a" stroke="#1c4532" stroke-width="2"/>
        <rect id="tile" x="20" y="460" width="20" height="10" fill="#c05621" stroke="#7b341e" stroke-width="1"/>
        <path id="wave" d="M60,100 C160,20 260,180 360,100" stroke="#2b6cb0" stroke-width="3" fill="none"/>
        <path id="line" d="M60,240 L420,240" stroke="#2b6cb0" stroke-width="3" fill="none"/>
      </g>
    </svg>`)
  })

  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const run = (page, id) => page.evaluate((i) => window.svgEditor.commands.run(i), id)
  const outCount = (page, id) => page.evaluate((i) => {
    const g = document.getElementById(i)
    return [...g.children].find((c) => c.hasAttribute('se:art-out')).children.length
  }, id)
  const outD = (page, id) => page.evaluate((i) => {
    const g = document.getElementById(i)
    return [...g.children].find((c) => c.hasAttribute('se:art-out')).firstChild.getAttribute('d')
  }, id)
  const makeBrush = async (page, type, srcId) => {
    await select(page, srcId)
    await run(page, `brush_new_${type}`)
    return page.evaluate(() => window.svgEditor.svgCanvas.getArtBrushLibrary().at(-1).id)
  }
  const apply = async (page, brush, id) => {
    await select(page, id)
    await page.evaluate((b) => {
      const pick = document.getElementById('ext-art-brush-pick')
      pick.value = b
      pick.dispatchEvent(new Event('change', { bubbles: true }))
    }, brush)
  }

  test('the commands follow the selection: art to make a brush, a brushed path to expand it', async ({ page }) => {
    await select(page, 'wave')
    expect(await page.evaluate(() => window.svgEditor.commands.get('brush_expand').enabled(window.svgEditor))).not.toBe(true)
    expect(await page.evaluate(() => window.svgEditor.commands.get('brush_delete').enabled(window.svgEditor))).not.toBe(true)
    await select(page, 'leaf')
    expect(await page.evaluate(() => window.svgEditor.commands.get('brush_new_art').enabled(window.svgEditor))).toBe(true)
  })

  test('make a brush from art, apply it to a path: one undo step each, the art follows the path', async ({ page }) => {
    const undo0 = await undoSize(page)
    const brush = await makeBrush(page, 'art', 'leaf')
    expect(await undoSize(page)).toBe(undo0 + 1)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getArtBrushLibrary()[0].name)).toBe('Art brush 1')

    await apply(page, brush, 'wave')
    expect(await undoSize(page)).toBe(undo0 + 2)
    expect(await page.evaluate(() => document.getElementById('wave').tagName)).toBe('g')
    expect(await outCount(page, 'wave')).toBe(1)
    // the art spans the curve, so it ends where the curve does
    const d = await outD(page, 'wave')
    const xs = [...d.matchAll(/(-?[\d.]+),/g)].map((m) => +m[1])
    expect(Math.min(...xs)).toBeCloseTo(60, 0)
    expect(Math.max(...xs)).toBeCloseTo(360, 0)
    expect(await page.evaluate(() => document.getElementById('leaf').tagName)).toBe('path') // the artwork is still there

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => document.getElementById('wave').tagName)).toBe('path')
  })

  test('the options panel edits the brushed path; changes are single undo steps', async ({ page }) => {
    const brush = await makeBrush(page, 'art', 'leaf')
    await apply(page, brush, 'wave')
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('ext-art-brush-brushed')).display)).not.toBe('none')
    const undo0 = await undoSize(page)
    const before = await outD(page, 'wave')
    await page.evaluate(() => {
      const w = document.getElementById('ext-art-brush-width')
      w.value = 250
      w.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(await undoSize(page)).toBe(undo0 + 1)
    expect(await outD(page, 'wave')).not.toBe(before)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getArtBrush().opts.width)).toBe(250)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await outD(page, 'wave')).toBe(before)
  })

  test('editing the path regenerates the art; undo puts it back', async ({ page }) => {
    const brush = await makeBrush(page, 'art', 'leaf')
    await apply(page, brush, 'line')
    const before = await outD(page, 'line')
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const g = document.getElementById('line')
      const spine = [...g.children].find((e) => e.hasAttribute('se:art-spine'))
      c.selectOnly([spine], true)
      c.moveSelectedElements(0, 60, true)
    })
    const moved = await outD(page, 'line')
    expect(moved).not.toBe(before)
    const ys = [...moved.matchAll(/,(-?[\d.]+)/g)].map((m) => +m[1])
    expect(Math.min(...ys)).toBeGreaterThan(279)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await outD(page, 'line')).toBe(before)
  })

  test('a pattern brush tiles; expand keeps plain paths; release gives the path back', async ({ page }) => {
    const brush = await makeBrush(page, 'pattern', 'tile')
    await apply(page, brush, 'line')
    expect(await outCount(page, 'line')).toBe(18) // 360 long, tiles 20 wide
    await select(page, 'line')
    await run(page, 'brush_expand')
    const info = await page.evaluate(() => {
      const g = document.getElementById('line')
      return { brush: g.hasAttribute('se:art-brush'), kids: g.children.length }
    })
    expect(info).toEqual({ brush: false, kids: 18 })
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await select(page, 'line')
    await run(page, 'brush_release')
    expect(await page.evaluate(() => document.getElementById('line').tagName)).toBe('path')
    expect(await page.evaluate(() => document.getElementById('line').getAttribute('stroke'))).toBe('#2b6cb0')
  })

  test('save → load keeps brushed paths and the library', async ({ page }) => {
    const art = await makeBrush(page, 'art', 'leaf')
    const pat = await makeBrush(page, 'pattern', 'tile')
    await apply(page, art, 'wave')
    await apply(page, pat, 'line')
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('line')], true))
    await page.evaluate(() => window.svgEditor.svgCanvas.setArtBrushOptions({ spacing: 50, fit: 'addSpace' }))
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    if (process.env.WRITE_FIXTURES) {
      fs.writeFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/art-brush.svg'), svg)
    }
    await setSvgSource(page, svg)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getArtBrushLibrary().length)).toBe(2)
    expect(await outCount(page, 'wave')).toBe(1)
    expect(await outCount(page, 'line')).toBeGreaterThan(5)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.checkDrawing().filter((f) => /art-brush|se-attr/.test(f.code)))).toEqual([])
  })
})
