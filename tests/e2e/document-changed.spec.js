import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// `documentChanged` (core/document-changes.ts, roadmap R8) is raised once per real change to the drawing, whatever path the
// change took, and never for one that changed nothing. Hosts mark a drawing dirty on it.
test.describe('documentChanged', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    // loaded the way a host loads a drawing (`loadSvgString` resets the history after the load's own work), not through the
    // source dialog, whose load is an undoable step followed by bookkeeping of its own
    await page.evaluate(() => {
      window.svgEditor.loadSvgString(`<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
        <g class="layer"><title>Layer 1</title>
          <rect id="r" x="100" y="100" width="80" height="60" fill="#f00"/>
        </g>
      </svg>`, { noAlert: true })
      window.__changes = []
      window.__elems = []
      window.svgEditor.svgCanvas.bind('documentChanged', (win, detail) => { window.__changes.push(detail.cause); window.__elems.push(detail.elems.map((el) => el.id || el.localName)) })
    })
  })

  /** run `fn` in the page, let the coalesced check run, and return the causes announced meanwhile */
  const announced = (page, fn) => page.evaluate(async (src) => {
    window.__changes.length = 0
    // eslint-disable-next-line no-new-func
    new Function(src)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    return [...window.__changes]
  }, `(${fn})()`)

  test('a step is announced once, even when its code calls `changed` too', async ({ page }) => {
    const causes = await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([c.getElement('r')])
      c.moveSelectedElements(5, 0)
    })
    expect(causes).toEqual(['step'])
  })

  test('it names the elements that differ', async ({ page }) => {
    await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      c.transact('Two edits', () => {
        c.getElement('r').setAttribute('width', '90')
        const e = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
        e.id = 'e'
        c.getCurrentDrawing().getCurrentLayer().append(e)
      })
    })
    expect(await page.evaluate(() => window.__elems.at(-1))).toEqual(['r', 'e'])
  })

  test('a step whose code never calls `changed` is still announced', async ({ page }) => {
    const causes = await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      c.transact('Quiet edit', () => c.getElement('r').setAttribute('width', '90'))
    })
    expect(causes).toEqual(['step'])
  })

  test('a `changed` call that changed nothing is not announced', async ({ page }) => {
    const causes = await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      c.call('changed', [c.getElement('r')])
    })
    expect(causes).toEqual([])
  })

  test('an edit outside the history that calls `changed` is announced', async ({ page }) => {
    const causes = await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      const r = c.getElement('r')
      r.setAttribute('height', '70')
      c.call('changed', [r])
    })
    expect(causes).toEqual(['edit'])
  })

  test('undo and redo are announced', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([c.getElement('r')])
      c.moveSelectedElements(5, 0)
    })
    expect(await announced(page, () => window.svgEditor.svgCanvas.undoMgr.undo())).toEqual(['history'])
    expect(await announced(page, () => window.svgEditor.svgCanvas.undoMgr.redo())).toEqual(['history'])
  })

  test('a host loading a drawing is not a change', async ({ page }) => {
    const causes = await announced(page, () => {
      window.svgEditor.loadSvgString('<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title><circle id="c" cx="50" cy="50" r="10"/></g></svg>', { noAlert: true })
    })
    expect(causes).toEqual([])
  })

  test('the editor\'s pointer-events bookkeeping on the drawing is not a change', async ({ page }) => {
    const causes = await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      const r = c.getElement('r')
      r.removeAttribute('style')
      c.getCurrentDrawing().getCurrentLayer().style.pointerEvents = 'none'
      c.call('changed', [r])
    })
    expect(causes).toEqual([])
  })

  test('a drag that ends where it started is not announced; a real drag is, once', async ({ page }) => {
    const drag = (to) => page.evaluate((dest) => window.svgEditor.automation.pointer([{ kind: 'drag', x: 140, y: 130, to: dest, steps: 6, space: 'doc' }]), to)
    await page.evaluate(() => { window.__changes.length = 0 })
    await drag({ x: 141, y: 130 })
    await page.waitForTimeout(50)
    expect(await page.evaluate(() => [...window.__changes])).toEqual([])
    await drag({ x: 200, y: 130 })
    await page.waitForTimeout(50)
    expect(await page.evaluate(() => [...window.__changes])).toEqual(['step'])
  })

  test('the unsaved-work warning is armed by a real change, not by a `changed` call that changed nothing', async ({ page }) => {
    const warn = () => page.evaluate(() => window.svgEditor.showSaveWarning)
    expect(await warn()).toBe(false)
    await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      c.call('changed', [c.getElement('r')])
    })
    expect(await warn()).toBe(false)
    await announced(page, () => {
      const c = window.svgEditor.svgCanvas
      c.transact('Quiet edit', () => c.getElement('r').setAttribute('width', '90'))
    })
    expect(await warn()).toBe(true)
  })

  test('the panels follow an edit whose code never calls `changed`', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([c.getElement('r')], true)
    })
    const width = () => page.evaluate(() => document.querySelector('#rect_width')?.value)
    await expect.poll(width).toBe('80')
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.transact('Quiet edit', () => c.getElement('r').setAttribute('width', '120'))
    })
    await expect.poll(width).toBe('120')
  })
})
