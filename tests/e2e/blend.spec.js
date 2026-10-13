import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Blends: two shapes → steps between them; the Blend tool (the first tool with an options bar) and the
// Make / Expand / Release commands.
test.describe('Blend', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <rect id="ra" x="60" y="100" width="40" height="40" fill="#e53e3e" stroke="#742a2a" stroke-width="2"/>
        <circle id="cb" cx="320" cy="120" r="30" fill="#3182ce" stroke="#2a4365" stroke-width="8"/>
        <rect id="rc" x="520" y="300" width="50" height="30" fill="#38a169" stroke="#22543d" stroke-width="2"/>
      </g>
    </svg>`)
  })

  const select = (page, ids) => page.evaluate((list) => window.svgEditor.svgCanvas.selectOnly(list.map((i) => document.getElementById(i)), true), ids)
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const run = (page, id) => page.evaluate((i) => window.svgEditor.commands.run(i), id)
  const enabled = (page, id) => page.evaluate((i) => window.svgEditor.commands.get(i).enabled(window.svgEditor), id)
  const blend = (page) => page.evaluate(() => {
    const g = [...document.querySelectorAll('g')].find((e) => e.hasAttribute('se:blend'))
    if (!g) return null
    return {
      id: g.id,
      spec: g.getAttribute('se:blend'),
      keys: [...g.children].filter((c) => c.hasAttribute('se:blend-key')).map((c) => c.id),
      steps: [...g.children].filter((c) => c.hasAttribute('se:blend-steps')).map((s) => s.children.length)
    }
  })
  const click = (page, x, y) => page.evaluate(([px, py]) => window.svgEditor.automation.pointer([{ kind: 'click', x: px, y: py }]), [x, y])
  const healthy = (page) => page.evaluate(() => window.svgEditor.svgCanvas.checkDrawing().filter((f) => /blend|se-attr/.test(f.code)))

  test('the commands follow the selection', async ({ page }) => {
    await select(page, ['ra'])
    expect(await enabled(page, 'blend_make')).not.toBe(true)
    expect(await enabled(page, 'blend_expand')).not.toBe(true)
    await select(page, ['ra', 'cb'])
    expect(await enabled(page, 'blend_make')).toBe(true)
  })

  test('Make blend: one undo step, steps between the keys; Release gives the shapes back', async ({ page }) => {
    await select(page, ['ra', 'cb'])
    const undo0 = await undoSize(page)
    await run(page, 'blend_make')
    expect(await undoSize(page)).toBe(undo0 + 1)
    let b = await blend(page)
    expect(b.keys).toEqual(['ra', 'cb'])
    expect(b.steps).toEqual([5])
    expect(await healthy(page)).toEqual([])
    expect(await enabled(page, 'blend_expand')).toBe(true)

    await run(page, 'blend_release')
    expect(await blend(page)).toBeNull()
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent rect, #svgcontent circle').length)).toBe(3)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    b = await blend(page)
    expect(b.steps).toEqual([5])
  })

  test('the Blend tool: click one shape, then another; its options bar sets the spacing', async ({ page }) => {
    await run(page, 'tool_blend')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('blend')
    // the bar shows the tool's options
    const bar = page.locator('#tool_options_panel')
    await expect(bar).toBeVisible()
    await expect(bar.locator('se-select[data-option="mode"]')).toHaveCount(1)
    await expect(bar.locator('se-spin-input[data-option="steps"]')).toHaveCount(1)
    await expect(bar.locator('se-spin-input[data-option="distance"]')).toHaveCount(0)

    const undo0 = await undoSize(page)
    await click(page, 80, 120) // ra
    expect(await blend(page)).toBeNull()
    await click(page, 320, 120) // cb
    expect(await undoSize(page)).toBe(undo0 + 1)
    const b = await blend(page)
    expect(b.keys).toEqual(['ra', 'cb'])
    expect(b.steps).toEqual([5])

    // a shape and then the blend (a click on one of its steps) add the shape as one more key
    await click(page, 545, 315) // rc
    await click(page, 190, 120) // a step
    expect((await blend(page)).keys).toEqual(['ra', 'cb', 'rc'])
    expect(await undoSize(page)).toBe(undo0 + 2)
    expect(await healthy(page)).toEqual([])
  })

  test('the options bar changes the selected blend as one undo step', async ({ page }) => {
    await select(page, ['ra', 'cb'])
    await run(page, 'blend_make')
    await run(page, 'tool_blend')
    const bar = (id, value) => page.evaluate(([option, v]) => {
      const el = document.querySelector(`#tool_options_panel [data-option="${option}"]`)
      el.value = v
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, [id, value])
    const undo0 = await undoSize(page)
    await bar('steps', 3)
    expect((await blend(page)).steps).toEqual([3])
    expect(await undoSize(page)).toBe(undo0 + 1)
    await bar('mode', 'distance')
    await expect(page.locator('#tool_options_panel se-spin-input[data-option="distance"]')).toHaveCount(1)
    await expect(page.locator('#tool_options_panel se-spin-input[data-option="steps"]')).toHaveCount(0)
    expect((await blend(page)).spec).toContain('mode=distance')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect((await blend(page)).steps).toEqual([5])
  })

  test('leaving the tool hides its options bar', async ({ page }) => {
    await run(page, 'tool_blend')
    await expect(page.locator('#tool_options_panel')).toBeVisible()
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await expect(page.locator('#tool_options_panel')).toBeHidden()
  })

  test('moving a key regenerates the steps; undo puts them back', async ({ page }) => {
    await select(page, ['ra', 'cb'])
    await run(page, 'blend_make')
    const stepsD = () => page.evaluate(() => [...document.querySelectorAll('g[se\\:blend-steps] path')].map((p) => p.getAttribute('d')).join('|'))
    const before = await stepsD()
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('cb')], true))
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'drag', x: 320, y: 120, to: { x: 320, y: 260 }, steps: 8 }]))
    const moved = await stepsD()
    expect(moved).not.toBe(before)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await stepsD()).toBe(before)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await stepsD()).toBe(moved)
    expect(await healthy(page)).toEqual([])
  })

  test('save → load keeps the blend as it was', async ({ page }) => {
    await select(page, ['ra', 'cb', 'rc'])
    await run(page, 'blend_make')
    await page.evaluate(() => window.svgEditor.svgCanvas.setBlendOptions({ steps: 3 }))
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    if (process.env.WRITE_FIXTURES) {
      fs.writeFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/blend.svg'), svg)
    }
    await setSvgSource(page, svg)
    const b = await blend(page)
    expect(b.keys).toHaveLength(3)
    expect(b.steps).toEqual([3, 3])
    // nothing is rewritten when the steps are already what the keys give
    expect(await page.evaluate(() => {
      const g = [...document.querySelectorAll('g')].find((e) => e.hasAttribute('se:blend'))
      return window.svgEditor.svgCanvas.refreshBlend(g)
    })).toBe(false)
    expect(await healthy(page)).toEqual([])
  })

  test.describe('spine', () => {
    const addSpine = (page) => page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      return c.addSVGElementsFromJson({ element: 'path', attr: { id: 'spine', d: 'M80,400 L80,100 L540,100', fill: 'none', stroke: '#000000' } }).id
    })
    const centre = (page, id) => page.evaluate((i) => {
      const b = document.getElementById(i).getBBox()
      return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]
    }, id)
    // hasAttribute, not a selector: a loaded drawing has namespaced attributes that `[se\\:blend]` does not match
    const spineOf = (page) => page.evaluate(() => [...document.querySelectorAll('g')].find((g) => g.hasAttribute('se:blend'))?.getAttribute('se:blend-spine') ?? null)

    test('the commands follow the selection', async ({ page }) => {
      await select(page, ['ra', 'cb'])
      await run(page, 'blend_make')
      await addSpine(page)
      const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
      await select(page, [group])
      expect(await enabled(page, 'blend_replace_spine')).not.toBe(true)
      expect(await enabled(page, 'blend_reverse_spine')).not.toBe(true)
      expect(await enabled(page, 'blend_detach_spine')).not.toBe(true)
      await select(page, [group, 'spine'])
      expect(await enabled(page, 'blend_replace_spine')).toBe(true)
    })

    test('Replace spine: the keys move onto the path, the steps follow it, one undo step; undo puts it all back', async ({ page }) => {
      await select(page, ['ra', 'cb'])
      await run(page, 'blend_make')
      const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
      await addSpine(page)
      await select(page, [group, 'spine'])
      const undo0 = await undoSize(page)
      await run(page, 'blend_replace_spine')
      expect(await undoSize(page)).toBe(undo0 + 1)
      expect(await spineOf(page)).toMatch(/^M\s*80[ ,]400/)
      expect(await page.evaluate(() => !!document.getElementById('spine'))).toBe(false)
      expect(await centre(page, 'ra')).toEqual([80, 400])
      expect(await centre(page, 'cb')).toEqual([540, 100])
      expect(await healthy(page)).toEqual([])
      // 5 steps between the keys, 300 + 460 along the path: the third is half way, at the corner (80, 100)... a step apart
      const mid = await page.evaluate(() => {
        const step = document.querySelectorAll('[se\\:blend-steps] > path')[2]
        const b = step.getBBox()
        return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]
      })
      expect(mid[1]).toBe(100) // on the top run of the L, level with the corner
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await spineOf(page)).toBeNull()
      expect(await page.evaluate(() => !!document.getElementById('spine'))).toBe(true)
      expect(await centre(page, 'cb')).toEqual([320, 120])
    })

    test('the Design tab buttons: Replace is enabled with a path selected, Reverse and Detach with a spine', async ({ page }) => {
      await select(page, ['ra', 'cb'])
      await run(page, 'blend_make')
      const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
      await addSpine(page)
      const state = () => page.evaluate(() => ['replace', 'reverse', 'detach'].map((n) => document.getElementById(`ext-blend-${n}-spine`).disabled))
      await select(page, [group])
      expect(await state(page)).toEqual([true, true, true])
      await select(page, [group, 'spine'])
      expect(await state(page)).toEqual([false, true, true])
      await page.evaluate(() => document.getElementById('ext-blend-replace-spine').click())
      expect(await spineOf(page)).not.toBeNull()
      expect(await state(page)).toEqual([true, false, false])
    })

    test('Reverse spine swaps the ends; Detach spine gives the path back and the steps go straight', async ({ page }) => {
      await select(page, ['ra', 'cb'])
      await run(page, 'blend_make')
      const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
      await addSpine(page)
      await select(page, [group, 'spine'])
      await run(page, 'blend_replace_spine')
      await run(page, 'blend_reverse_spine')
      expect(await centre(page, 'ra')).toEqual([540, 100])
      expect(await centre(page, 'cb')).toEqual([80, 400])
      await run(page, 'blend_detach_spine')
      expect(await spineOf(page)).toBeNull()
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)[0].tagName)).toBe('path')
      expect(await healthy(page)).toEqual([])
      // straight again, between the keys' centres (540,100) and (80,400): the middle step is half way
      const mid = await page.evaluate(() => {
        const b = document.querySelectorAll('[se\\:blend-steps] > path')[2].getBBox()
        return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]
      })
      expect(mid[0]).toBeGreaterThan(280)
      expect(mid[0]).toBeLessThan(340)
    })

    test('the spine survives saving and loading the drawing', async ({ page }) => {
      await select(page, ['ra', 'cb'])
      await run(page, 'blend_make')
      const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
      await addSpine(page)
      await select(page, [group, 'spine'])
      await run(page, 'blend_replace_spine')
      const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
      await setSvgSource(page, svg)
      expect(await spineOf(page)).toMatch(/^M\s*80[ ,]400/)
      expect(await healthy(page)).toEqual([])
    })

    test.describe('align to path', () => {
      // Two wide bars on the L-shaped spine (80,400) → (80,100) → (540,100): the first heads up, the end heads right.
      const bars = (page) => page.evaluate(() => {
        const c = window.svgEditor.svgCanvas
        const bar = (id, x) => c.addSVGElementsFromJson({ element: 'rect', attr: { id, x, y: 20, width: 40, height: 10, fill: '#e53e3e', stroke: '#742a2a', 'stroke-width': 2 } })
        bar('ba', 20)
        bar('bb', 200)
      })
      const setup = async (page) => {
        await bars(page)
        await select(page, ['ba', 'bb'])
        await run(page, 'blend_make')
        const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
        await addSpine(page)
        await select(page, [group, 'spine'])
        await run(page, 'blend_replace_spine')
        await select(page, [group])
        return group
      }
      test('the checkbox shows for a blend with a spine; checking it turns the keys and steps, in one undo step', async ({ page }) => {
        await bars(page)
        await select(page, ['ba', 'bb'])
        await run(page, 'blend_make')
        const group = await page.evaluate(() => document.querySelector('[se\\:blend]').id)
        await select(page, [group])
        expect(await page.evaluate(() => getComputedStyle(document.getElementById('ext-blend-align-row')).display)).toBe('none')
        await select(page, [group])
        await addSpine(page)
        await select(page, [group, 'spine'])
        await run(page, 'blend_replace_spine')
        await select(page, [group])
        expect(await page.evaluate(() => getComputedStyle(document.getElementById('ext-blend-align-row')).display)).not.toBe('none')
        const box = (sel, n) => page.evaluate(([q, i]) => {
          const r = document.querySelectorAll(q)[i].getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height) }
        }, [sel, n])
        const steps = '[se\\:blend-steps] > path'
        const undo0 = await undoSize(page)
        await page.evaluate(() => document.getElementById('ext-blend-align').click())
        expect(await undoSize(page)).toBe(undo0 + 1)
        expect(await page.evaluate(() => document.getElementById('ext-blend-align').checked)).toBe(true)
        // the first key is the reference and keeps lying; the spine ends heading right, a quarter turn from where it began
        // (up), so the last key and the steps on the last run stand
        expect(await box('#ba', 0)).toEqual({ w: 40, h: 10 })
        const near = await box(steps, 0)
        const far = await box(steps, 4)
        expect(near.w).toBeGreaterThan(near.h)
        expect(far.h).toBeGreaterThan(far.w)
        const last = await box('#bb', 0)
        expect(last.h).toBeGreaterThan(last.w)
        expect(await healthy(page)).toEqual([])
        await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
        expect(await page.evaluate(() => document.querySelector('[se\\:blend]').hasAttribute('se:blend-align'))).toBe(false)
        expect(await page.evaluate(() => document.getElementById('bb').hasAttribute('transform'))).toBe(false)
        const back = await box(steps, 4)
        expect(back.w).toBeGreaterThan(back.h)
        await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
        expect(await box(steps, 4)).toEqual(far)
        expect(await healthy(page)).toEqual([])
      })

      test('unchecking turns the keys back; Reverse and Detach keep working while aligned', async ({ page }) => {
        const group = await setup(page)
        await run(page, 'blend_align_path')
        const turned = await page.evaluate(() => document.getElementById('bb').getAttribute('transform'))
        expect(turned).toMatch(/^matrix\(/)
        await run(page, 'blend_reverse_spine')
        expect(await page.evaluate(() => document.querySelector('[se\\:blend]').getAttribute('se:blend-align'))).toBe('1')
        expect(await healthy(page)).toEqual([])
        await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
        expect(await page.evaluate(() => document.getElementById('bb').getAttribute('transform'))).toBe(turned)
        await select(page, [group])
        await run(page, 'blend_align_path') // toggles off
        expect(await page.evaluate(() => document.getElementById('bb').hasAttribute('transform'))).toBe(false)
        await run(page, 'blend_align_path')
        await select(page, [group])
        await run(page, 'blend_detach_spine')
        expect(await page.evaluate(() => document.querySelector('[se\\:blend]').hasAttribute('se:blend-align'))).toBe(false)
        expect(await page.evaluate(() => document.getElementById('bb').hasAttribute('transform'))).toBe(false)
        expect(await healthy(page)).toEqual([])
      })

      test('save → load keeps it aligned and rewrites nothing', async ({ page }) => {
        await setup(page)
        await run(page, 'blend_align_path')
        const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
        if (process.env.WRITE_FIXTURES) {
          fs.writeFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip/blend-align.svg'), svg)
        }
        await setSvgSource(page, svg)
        // hasAttribute, not a selector: a loaded drawing has namespaced attributes that `[se\\:blend]` does not match
        expect(await page.evaluate(() => [...document.querySelectorAll('g')].find((g) => g.hasAttribute('se:blend')).getAttribute('se:blend-align'))).toBe('1')
        expect(await page.evaluate(() => {
          const g = [...document.querySelectorAll('g')].find((e) => e.hasAttribute('se:blend'))
          return window.svgEditor.svgCanvas.refreshBlend(g)
        })).toBe(false)
        expect(await healthy(page)).toEqual([])
      })
    })
  })
})
