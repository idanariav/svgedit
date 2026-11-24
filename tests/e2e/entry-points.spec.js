import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Roadmap R10 (.claude/plans/r10-one-entry-per-intent.md): one intent, one entry point. The same intent asked for in
// different ways (paste from the menu, the context menu or the keyboard; a click or a drag judged at one site or another;
// a Curvature path finished by a click or by a tool switch) must do the same thing. The cases that do not yet are
// `test.fail()` against the step of the plan that makes them pass.

const SVG = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer" id="layer1"><title>Layer 1</title>
  <rect id="src" x="100" y="100" width="80" height="60" fill="#f00"/>
</g></svg>`

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const reds = (page) => page.evaluate(() => [...document.querySelectorAll('#svgcontent rect[fill="#f00"]')].map((r) => r.id))

/** The centre of a pasted rect, in document units. */
const centreOf = (page, id) => page.evaluate((i) => {
  const b = window.svgEditor.svgCanvas.getStrokedBBoxDefaultVisible([document.getElementById(i)])
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}, id)

/** The centre of the visible workarea, in document units (Editor.pasteInCenter's formula). */
const viewCentre = (page) => page.evaluate(() => {
  const e = window.svgEditor
  const wa = e.workarea
  const zoom = e.svgCanvas.getZoom()
  const cs = getComputedStyle(wa)
  return {
    x: (wa.scrollLeft + parseFloat(cs.width) / 2) / zoom - e.svgCanvas.contentW,
    y: (wa.scrollTop + parseFloat(cs.height) / 2) / zoom - e.svgCanvas.contentH
  }
})

/** A right-click at a document point (the context menu's paste point), then the menu closed again. */
const rightClickAt = async (page, x, y) => {
  const at = await page.evaluate(([px, py]) => {
    const root = document.querySelector('#svgroot').getBoundingClientRect()
    const content = document.querySelector('#svgcontent')
    const zoom = window.svgEditor.svgCanvas.getZoom()
    return { x: root.left + Number(content.getAttribute('x')) + px * zoom, y: root.top + Number(content.getAttribute('y')) + py * zoom }
  }, [x, y])
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.keyboard.press('Escape')
}

const copySrc = (page) => page.evaluate(() => {
  const c = window.svgEditor.svgCanvas
  c.selectOnly([c.getElement('src')])
  window.svgEditor.commands.run('copy')
})

/** The paste's new rect (the one that is not `src`). */
const pasted = async (page) => (await reds(page)).find((id) => id !== 'src')

test.describe('one entry point per intent (R10)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate((svg) => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.setSvgString(svg)
      window.svgEditor.svgCanvas.clearSelection()
    }, SVG)
    await page.evaluate(() => window.svgEditor.commands.run('zoom_fit'))
  })

  test.describe('paste', () => {
    test('the Paste command pastes in the centre of the view, not where a context menu was last opened', async ({ page }) => {
      test.fail(true, 'R10 step 1: the command pastes at the last right-click point')
      await rightClickAt(page, 560, 420) // long ago, somewhere else
      await copySrc(page)
      const before = await undoSize(page)
      await page.evaluate(() => window.svgEditor.commands.run('paste'))
      const at = await centreOf(page, await pasted(page))
      const want = await viewCentre(page)
      expect(Math.abs(at.x - want.x)).toBeLessThan(2)
      expect(Math.abs(at.y - want.y)).toBeLessThan(2)
      expect(await undoSize(page)).toBe(before + 1)
    })

    test('the context menu\'s Paste pastes where it was opened', async ({ page }) => {
      await copySrc(page)
      await rightClickAt(page, 400, 300)
      const before = await undoSize(page)
      await page.evaluate(() => document.getElementById('se-cmenu_canvas').dispatchEvent(new CustomEvent('change', { detail: { trigger: 'paste' } })))
      const at = await centreOf(page, await pasted(page))
      expect(Math.abs(at.x - 400)).toBeLessThan(2)
      expect(Math.abs(at.y - 300)).toBeLessThan(2)
      expect(await undoSize(page)).toBe(before + 1)
    })

    for (const [what, data] of [['the copied shapes', 'stored'], ['nothing the drawing can take', 'unrelated text']]) {
      test(`a native paste of ${what} pastes the copy in the centre of the view, as one step`, async ({ page }) => {
        await copySrc(page)
        const before = await undoSize(page)
        await page.evaluate(([kind]) => {
          const e = window.svgEditor
          const text = kind === 'stored' ? sessionStorage.getItem(e.svgCanvas.getClipboardID()) : kind
          e.$container.focus()
          const clipboardData = new DataTransfer()
          clipboardData.setData('text/plain', text)
          e.$container.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
        }, [data])
        const at = await centreOf(page, await pasted(page))
        const want = await viewCentre(page)
        expect(Math.abs(at.x - want.x)).toBeLessThan(2)
        expect(Math.abs(at.y - want.y)).toBeLessThan(2)
        expect(await undoSize(page)).toBe(before + 1)
      })
    }

    test('every paste goes through the paste command (the debug log names it)', async ({ page }) => {
      test.fail(true, 'R10 step 1: a native paste does not run the command')
      await copySrc(page)
      const actions = await page.evaluate(() => {
        const e = window.svgEditor
        const seen = []
        const run = e.commands.run.bind(e.commands)
        e.commands.run = (id, ...rest) => { seen.push(id); return run(id, ...rest) }
        e.$container.focus()
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', sessionStorage.getItem(e.svgCanvas.getClipboardID()))
        e.$container.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
        document.getElementById('se-cmenu_canvas').dispatchEvent(new CustomEvent('change', { detail: { trigger: 'paste' } }))
        return seen
      })
      expect(actions).toEqual(['paste', 'paste'])
    })
  })

  test.describe('click versus drag', () => {
    /** Press on the rect, move by (dx, dy) screen px, release: did it move? */
    const dragBy = async (page, dx, dy) => {
      await page.evaluate(() => { const c = window.svgEditor.svgCanvas; c.selectOnly([c.getElement('src')]) })
      const from = await page.evaluate(() => {
        const r = document.getElementById('src').getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      const before = await undoSize(page)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 })
      await page.mouse.up()
      return (await undoSize(page)) > before
    }

    test('a 3 px jitter is a click', async ({ page }) => {
      expect(await dragBy(page, 3, 0)).toBe(false)
    })

    test('a 5 px press is a drag', async ({ page }) => {
      expect(await dragBy(page, 5, 0)).toBe(true)
    })

    test('the distance is measured straight: a 3 × 3 px diagonal (4.2 px) is a drag, as everywhere else', async ({ page }) => {
      test.fail(true, 'R10 step 2: select measures each axis on its own (4 px per axis)')
      expect(await dragBy(page, 3, 3)).toBe(true)
    })
  })

  test.describe('Curvature', () => {
    const draw = (page) => page.evaluate(() => {
      window.svgEditor.commands.run('tool_curvature')
      window.svgEditor.automation.pointer([{ kind: 'click', x: 300, y: 300 }, { kind: 'click', x: 380, y: 250 }, { kind: 'click', x: 460, y: 300 }])
    })
    /** the finished path's attributes, without its geometry and id */
    const finished = (page) => page.evaluate(() => {
      const p = [...document.querySelectorAll('#svgcontent g.layer > path')].at(-1)
      return Object.fromEntries([...p.attributes].filter((a) => !['d', 'id'].includes(a.name)).map((a) => [a.name, a.value]))
    })

    test('a path finished by switching tools ends up as one closed by a click does: same attributes, one step', async ({ page }) => {
      await draw(page)
      await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 300, y: 300 }])) // close: the registry finishes it
      const byClick = await finished(page)
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      await draw(page)
      const before = await undoSize(page)
      await page.evaluate(() => window.svgEditor.commands.run('tool_rect'))
      expect(await undoSize(page)).toBe(before + 1)
      expect(await finished(page)).toEqual(byClick)
    })
  })
})
