import { test, expect } from './fixtures.js'
import { mountHost, openLeaf, clickInto, countFill, selectIn, drawing, mod } from './host-harness.js'

// Roadmap R13: the editor under the conditions the Obsidian plugin runs it in (host-harness.js). Most of the Oct–Nov 2026
// fixes came from Obsidian debug logs, not from this suite, because its pages mount one editor in a plain browser: two
// drawings in one document, a leaf switch with no click, a teardown fired twice, a background tab, a clipboard that loses
// writes or never delivers a paste.

const undoSize = (page, id) => page.evaluate((id) => window.host.canvas(id).undoMgr.getUndoStackSize(), id)

test.describe('two leaves', () => {
  test.beforeEach(async ({ page }) => {
    await mountHost(page)
    await openLeaf(page, 'b', drawing('b'))
  })

  test('a shortcut after a leaf switch with no click goes to the leaf now active', async ({ page }) => {
    await selectIn(page, 'a', 'a_r')
    await selectIn(page, 'b', 'b_r')
    await clickInto(page, 'a')
    await selectIn(page, 'a', 'a_r')
    await page.evaluate(() => window.host.activate('b')) // active-leaf-change: Ctrl+Tab, the tab bar, a link
    await page.keyboard.press('Delete')
    expect(await countFill(page, 'a')).toBe(1)
    expect(await countFill(page, 'b')).toBe(0)
  })

  test('loading a drawing is not an edit; an edit marks only its own leaf dirty, once', async ({ page }) => {
    await page.evaluate(() => window.host.load('b', `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title><circle id="b_c" cx="50" cy="50" r="20" fill="#00f"/></g></svg>`))
    const flags = () => page.evaluate(() => [...window.host.leaves.values()].map((l) => ({ id: l.id, dirty: l.dirty, changes: l.changes.length })))
    expect(await flags()).toEqual([{ id: 'a', dirty: false, changes: 0 }, { id: 'b', dirty: false, changes: 0 }])
    await page.evaluate(() => { const c = window.host.canvas('b'); c.selectOnly([c.getElement('b_c')]); c.changeSelectedAttribute('fill', '#0f0') })
    expect(await flags()).toEqual([{ id: 'a', dirty: false, changes: 0 }, { id: 'b', dirty: true, changes: 1 }])
  })

  test('closing a leaf (onClose and onunload in one tick) is safe, and the other leaf keeps the keys with no click', async ({ page }) => {
    await clickInto(page, 'b')
    const errors = await page.evaluate(() => window.host.close('b'))
    expect(errors).toEqual([])
    await page.evaluate(() => window.host.activate('a'))
    await selectIn(page, 'a', 'a_r')
    await page.keyboard.press('Delete')
    expect(await countFill(page, 'a')).toBe(0)
  })

  test('another leaf\'s tool switch leaves this leaf\'s Curvature session alone', async ({ page }) => {
    await page.evaluate(() => window.host.activate('a'))
    await page.evaluate(() => window.host.editor('a').commands.run('tool_curvature'))
    await page.evaluate(() => {
      const a = window.host.editor('a')
      return a.automation.pointer([{ kind: 'click', x: 300, y: 300 }, { kind: 'click', x: 400, y: 320 }])
    })
    const paths = () => page.evaluate(() => window.host.canvas('a').getSvgContent().querySelectorAll('path:not([data-se-ephemeral])').length)
    expect(await paths()).toBe(0)
    await page.evaluate(() => window.host.editor('b').commands.run('tool_rect'))
    expect(await page.evaluate(() => window.host.canvas('a').getMode())).toBe('curvature')
    expect(await paths()).toBe(0) // not finished by B's switch
    await page.evaluate(() => window.host.editor('a').commands.run('tool_select')) // A's own switch finishes it
    expect(await paths()).toBe(1)
  })

  test('the debug log of each leaf holds only its own actions', async ({ page }) => {
    await page.evaluate(() => window.host.editor('b').commands.run('tool_rect'))
    const logged = await page.evaluate(() => Object.fromEntries([...window.host.leaves.values()]
      .map((l) => [l.id, l.log.some((e) => e.event === 'action' && e.detail?.command === 'tool_rect')])))
    expect(logged).toEqual({ a: false, b: true })
  })
})

test.describe('a background tab', () => {
  test('a drawing loaded while its tab is hidden shows whole when the tab comes forward', async ({ page }) => {
    await mountHost(page)
    await openLeaf(page, 'b', null, { active: false })
    await page.evaluate(() => window.host.hide('b'))
    await page.evaluate(() => window.host.load('b', `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title><rect id="b_r" x="100" y="100" width="80" height="60" fill="#f00"/></g></svg>`))
    await page.evaluate(() => { window.host.show('b'); window.host.activate('b') })
    const view = await page.evaluate(() => {
      const c = window.host.canvas('b')
      const r = c.getElement('b_r').getBoundingClientRect()
      return { zoom: c.getZoom(), w: r.width, h: r.height }
    })
    expect(Number.isFinite(view.zoom) && view.zoom > 0).toBe(true)
    expect(view.w).toBeGreaterThan(0)
    expect(view.h).toBeGreaterThan(0)
  })

  test('a drag whose tab is hidden before the release leaves no gesture behind', async ({ page }) => {
    await mountHost(page)
    await openLeaf(page, 'b', drawing('b'), { active: false })
    await page.evaluate(() => window.host.activate('a'))
    const at = await page.evaluate(() => {
      const c = window.host.canvas('a')
      const r = c.getElement('a_r').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 30, at.y + 20, { steps: 4 })
    // a link click or a hotkey shows another tab in this pane mid-drag; the release lands on it
    await page.evaluate(() => { window.host.hide('a'); window.host.activate('b') })
    await page.mouse.up()
    expect(await page.evaluate(() => window.host.canvas('a').gestureLeftovers())).toEqual([])
  })
})

test.describe('a release outside the canvas', () => {
  // The canvas listened for its own mouseup only: a drag released over a panel left the move open, and the next press
  // cancelled it, so the shape went back where it was.
  test('a drag released over the toolbar keeps the move, as one undo step', async ({ page }) => {
    await mountHost(page)
    const at = await page.evaluate(() => {
      const r = window.host.canvas('a').getElement('a_r').getBoundingClientRect()
      const p = window.host.leaves.get('a').container.querySelector('#tools_left').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, px: p.left + p.width / 2, py: p.top + 40 }
    })
    const before = await page.evaluate(() => window.host.canvas('a').getElement('a_r').getBoundingClientRect().left)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.px, at.py, { steps: 8 })
    await page.mouse.up()
    expect(await page.evaluate(() => window.host.canvas('a').gestureLeftovers())).toEqual([])
    expect(await undoSize(page, 'a')).toBe(1)
    await page.mouse.click(at.x + 250, at.y + 150) // the next press does not take it back
    const after = await page.evaluate(() => window.host.canvas('a').getElement('a_r').getBoundingClientRect().left)
    expect(after).toBeLessThan(before)
    expect(await undoSize(page, 'a')).toBe(1)
  })
})

test.describe('a host clipboard', () => {
  // A shape copied in A is pasted in B, under each way a host's clipboard can fail.
  const copyInA = async (page) => {
    await clickInto(page, 'a')
    await selectIn(page, 'a', 'a_r')
    await page.keyboard.press(`${mod}+c`)
    await page.waitForTimeout(50)
  }
  const pasteInB = async (page, { click = false } = {}) => {
    if (click) await clickInto(page, 'b')
    else await page.evaluate(() => window.host.activate('b'))
    await page.keyboard.press(`${mod}+v`)
    // the keydown fallback waits 80 ms for a native paste that may never come
    await page.waitForTimeout(250)
  }
  const setUp = async (page, clipboard) => {
    await mountHost(page, { clipboard })
    await openLeaf(page, 'b', drawing('b', '#00f'))
  }

  for (const [name, clipboard] of [
    ['a browser-like clipboard', {}],
    ['Electron: no native paste on the canvas', { nativePaste: false }],
    ['the async write rejected', { writes: 'reject' }],
    ['the async write rejected and no native paste', { writes: 'reject', nativePaste: false }],
    ['the read rejected and no native paste', { reads: 'reject', nativePaste: false }]
  ]) {
    test(`copy in A, paste in B after a leaf switch: ${name}`, async ({ page }) => {
      await setUp(page, clipboard)
      await copyInA(page)
      const before = await undoSize(page, 'b')
      await pasteInB(page)
      expect(await countFill(page, 'b')).toBe(1)
      expect(await countFill(page, 'a')).toBe(1)
      expect(await undoSize(page, 'b')).toBe(before + 1)
    })
  }

  test('the host lost every write (the clipboard kept another app\'s text): Cmd+V pastes the copied shapes', async ({ page }) => {
    await setUp(page, { writes: 'drop' })
    await page.evaluate(() => { window.host.clipboard.text = 'a line from a note' })
    await copyInA(page)
    await pasteInB(page)
    expect(await countFill(page, 'b')).toBe(1)
  })

  test('another app copied an SVG after the copy: Cmd+V imports it, one undo step', async ({ page }) => {
    await setUp(page, { nativePaste: false })
    await copyInA(page)
    await page.evaluate(() => {
      window.host.clipboard.text = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="15" fill="#0a0"/></svg>'
    })
    const before = await undoSize(page, 'b')
    await pasteInB(page, { click: true })
    expect(await countFill(page, 'b', '#0a0')).toBe(1)
    expect(await countFill(page, 'b')).toBe(0)
    expect(await undoSize(page, 'b')).toBe(before + 1)
  })

  test('a host\'s Edit › Copy (a native copy with no key) carries the selected shapes', async ({ page }) => {
    await setUp(page, { nativePaste: false })
    await clickInto(page, 'a')
    await selectIn(page, 'a', 'a_r')
    await page.evaluate(() => { window.host.clipboard.text = ''; window.host.clipboard.menuCopy() })
    expect(await page.evaluate(() => window.host.clipboard.text)).toContain('a_r')
    await pasteInB(page)
    expect(await countFill(page, 'b')).toBe(1)
  })

  test('a paste into a closed leaf\'s place goes to the leaf left, not the closed one', async ({ page }) => {
    await setUp(page, { nativePaste: false })
    await copyInA(page)
    await clickInto(page, 'b')
    expect(await page.evaluate(() => window.host.close('b'))).toEqual([])
    await page.evaluate(() => window.host.activate('a'))
    await page.keyboard.press(`${mod}+v`)
    await page.waitForTimeout(250)
    expect(await countFill(page, 'a')).toBe(2)
  })
})
