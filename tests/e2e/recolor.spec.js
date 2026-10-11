import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Recolor Artwork: the `tool_recolor` command opens `se-recolor-dialog`; every edit previews on the canvas inside an
// undo transaction, OK commits one undo step, Cancel rolls it back.
test.describe('Recolor Artwork', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
      </defs>
      <g class="layer">
        <title>Layer 1</title>
        <rect id="a" x="20" y="20" width="100" height="80" fill="#ff0000" stroke="#000000"/>
        <rect id="b" x="140" y="20" width="100" height="80" fill="#00ff00" stroke="#000000"/>
        <rect id="c" x="260" y="20" width="100" height="80" fill="#0000ff" stroke="#ffffff"/>
        <rect id="g1" x="20" y="140" width="100" height="80" fill="url(#lg)"/>
        <rect id="g2" x="140" y="140" width="100" height="80" fill="url(#lg)"/>
        <rect id="d" x="260" y="140" width="100" height="80" fill="#fe0101"/>
      </g>
    </svg>`)
  })

  const select = (page, ...ids) => page.evaluate((list) => window.svgEditor.svgCanvas.selectOnly(list.map((i) => document.getElementById(i)), true), ids)
  const recolor = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_recolor'))
  const attr = (page, id, name) => page.evaluate(([i, n]) => document.getElementById(i)?.getAttribute(n) ?? null, [id, name])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const dialog = (page, fn, arg) => page.evaluate(([src, a]) => {
    const root = document.getElementById('se-recolor-dialog').shadowRoot
    // eslint-disable-next-line no-new-func
    return new Function('root', 'arg', `return (${src})(root, arg)`)(root, a)
  }, [fn.toString(), arg])
  const setSelect = (page, id, value) => dialog(page, (root, [i, v]) => {
    const el = root.getElementById(i)
    el.value = v
    el.dispatchEvent(new Event('change'))
  }, [id, value])
  const setRowColor = (page, row, value) => dialog(page, (root, [r, v]) => {
    const el = root.querySelectorAll('.rc_to')[r]
    el.value = v
    el.dispatchEvent(new Event('input'))
  }, [row, value])
  const rows = (page) => dialog(page, (root) => [...root.querySelectorAll('.rc_row')].map((r) => ({
    from: [...r.querySelectorAll('.rc_swatch')].map((s) => s.title.split(' ')[0]),
    to: r.querySelector('.rc_to').value
  })))
  const click = (page, id) => dialog(page, (root, i) => root.getElementById(i).click(), id)

  test('the Effects tab has a Recolor button wired to the command', async ({ page }) => {
    expect(await page.evaluate(() => {
      const btn = document.querySelector('#tool_recolor')
      return Boolean(btn && document.querySelector('#tab_effects')?.contains(btn))
    })).toBe(true)
    // nothing selected: the command explains why it is unavailable
    const info = await page.evaluate(() => window.svgEditor.commands.list().find((c) => c.id === 'tool_recolor'))
    expect(info.enabled).toBe(false)
  })

  test('lists the distinct colours of the selection, black and white kept out', async ({ page }) => {
    await select(page, 'a', 'b', 'c')
    await recolor(page)
    const list = await rows(page)
    expect(list.map((r) => r.from[0]).sort()).toEqual(['#0000ff', '#00ff00', '#ff0000'])
    expect(list.every((r) => r.from.length === 1)).toBe(true)
    await click(page, 'rc_cancel')
  })

  test('a row\'s new colour previews live; OK commits it as one undo step', async ({ page }) => {
    await select(page, 'a', 'b', 'c')
    const undo0 = await undoSize(page)
    await recolor(page)
    await setRowColor(page, 0, '#123456')
    const changed = (await rows(page)).findIndex((r) => r.to === '#123456')
    expect(changed).toBe(0)
    const first = (await rows(page))[0].from[0]
    const id = { '#ff0000': 'a', '#00ff00': 'b', '#0000ff': 'c' }[first]
    expect(await attr(page, id, 'fill')).toBe('#123456') // preview, before OK
    expect(await undoSize(page)).toBe(undo0) // nothing recorded yet
    await click(page, 'rc_ok')
    expect(await attr(page, id, 'fill')).toBe('#123456')
    expect(await undoSize(page)).toBe(undo0 + 1)
    expect(await attr(page, 'a', 'stroke')).toBe('#000000') // black kept
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page, id, 'fill')).toBe(first)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await attr(page, id, 'fill')).toBe('#123456')
  })

  test('Cancel rolls the preview back and records nothing', async ({ page }) => {
    await select(page, 'a', 'b', 'c')
    const undo0 = await undoSize(page)
    await recolor(page)
    await setSelect(page, 'rc_harmony', 'triad')
    await setRowColor(page, 1, '#abcdef')
    expect(await page.evaluate(() => ['a', 'b', 'c'].map((i) => document.getElementById(i).getAttribute('fill')))).toContain('#abcdef')
    await click(page, 'rc_cancel')
    expect(await page.evaluate(() => ['a', 'b', 'c'].map((i) => document.getElementById(i).getAttribute('fill')))).toEqual(['#ff0000', '#00ff00', '#0000ff'])
    expect(await undoSize(page)).toBe(undo0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.inTransaction())).toBe(false)
  })

  test('a harmony rule spreads its colours over the rows', async ({ page }) => {
    await select(page, 'a', 'b', 'c')
    await recolor(page)
    await setSelect(page, 'rc_harmony', 'complementary')
    const list = await rows(page)
    // the first row's colour is the base; the rows take it and its complement in turn
    const base = list[0].from[0]
    const complement = { '#ff0000': '#00ffff', '#00ff00': '#ff00ff', '#0000ff': '#ffff00' }[base]
    expect(list.map((r) => r.to)).toEqual([base, complement, base])
    await click(page, 'rc_ok')
    const fills = await page.evaluate(() => ['a', 'b', 'c'].map((i) => document.getElementById(i).getAttribute('fill')))
    expect(new Set(fills).size).toBe(2)
  })

  test('reducing to one colour collapses the rows', async ({ page }) => {
    await select(page, 'a', 'b', 'c')
    await recolor(page)
    await dialog(page, (root) => {
      const el = root.getElementById('rc_reduce')
      el.value = '1'
      el.dispatchEvent(new Event('change'))
    })
    expect((await rows(page)).length).toBe(1)
    await click(page, 'rc_ok')
    const fills = await page.evaluate(() => ['a', 'b', 'c'].map((i) => document.getElementById(i).getAttribute('fill')))
    expect(new Set(fills).size).toBe(1)
  })

  test('turning the hue moves every new colour and leaves the kept black alone', async ({ page }) => {
    await select(page, 'a')
    await recolor(page)
    await dialog(page, (root) => {
      const el = root.getElementById('rc_hue_in')
      el.value = '120'
      el.dispatchEvent(new Event('input'))
    })
    expect(await attr(page, 'a', 'fill')).toBe('#00ff00')
    await click(page, 'rc_ok')
    expect(await attr(page, 'a', 'stroke')).toBe('#000000')
  })

  test('black can be recolored when it is no longer kept', async ({ page }) => {
    await select(page, 'a')
    await recolor(page)
    await dialog(page, (root) => {
      const el = root.getElementById('rc_black')
      el.checked = false
      el.dispatchEvent(new Event('change'))
    })
    expect((await rows(page)).map((r) => r.from[0]).sort()).toEqual(['#000000', '#ff0000'])
    await setRowColor(page, (await rows(page)).findIndex((r) => r.from[0] === '#000000'), '#0000aa')
    await click(page, 'rc_ok')
    expect(await attr(page, 'a', 'stroke')).toBe('#0000aa')
  })

  test('a gradient other shapes use is copied; its stops are recolored', async ({ page }) => {
    await select(page, 'g1')
    await recolor(page)
    const list = await rows(page)
    expect(list.map((r) => r.from[0]).sort()).toEqual(['#0000ff', '#ff0000'])
    await setRowColor(page, list.findIndex((r) => r.from[0] === '#ff0000'), '#00ff00')
    await click(page, 'rc_ok')
    const grad = (await attr(page, 'g1', 'fill')).replace(/^url\(#|\)$/g, '')
    expect(grad).not.toBe('lg')
    expect(await attr(page, 'g2', 'fill')).toBe('url(#lg)')
    const stops = (id) => page.evaluate((g) => [...document.getElementById(g).querySelectorAll('stop')].map((s) => s.getAttribute('stop-color')), id)
    expect(await stops(grad)).toEqual(['#00ff00', '#0000ff'])
    expect(await stops('lg')).toEqual(['#ff0000', '#0000ff'])
  })

  test('colours that only look alike are separate rows; a gradient only the selection uses is edited in place', async ({ page }) => {
    await select(page, 'a', 'd')
    await recolor(page)
    expect((await rows(page)).length).toBe(2) // #ff0000 and #fe0101
    await click(page, 'rc_cancel')
    await select(page, 'g1', 'g2')
    await recolor(page)
    await setRowColor(page, 0, '#101010')
    await click(page, 'rc_ok')
    expect(await attr(page, 'g1', 'fill')).toBe(await attr(page, 'g2', 'fill'))
    expect(await attr(page, 'g1', 'fill')).toBe('url(#lg)')
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent linearGradient').length)).toBe(1)
    expect(await page.evaluate(() => document.querySelector('#lg stop').getAttribute('stop-color'))).not.toBe('#ff0000')
  })

  test('a selection without solid colours says so and cannot be applied', async ({ page }) => {
    await page.evaluate(() => { document.getElementById('a').setAttribute('fill', 'none'); document.getElementById('a').setAttribute('stroke', 'none') })
    await select(page, 'a')
    await recolor(page)
    expect((await rows(page)).length).toBe(0)
    expect(await dialog(page, (root) => root.getElementById('rc_ok').disabled)).toBe(true)
    await click(page, 'rc_cancel')
  })
})
