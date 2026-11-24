import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Roadmap R9 (.claude/plans/r9-gesture-lifecycle.md): a gesture owns its state, so every way out of a gesture ends it.
// Each built-in gesture (move, multi-move, Alt-clone, resize, group resize, rotate, group rotate, marquee, node drag)
// is pressed, moved, and then left in one of four ways that are not a plain release: Escape, a mode switch, a second
// press with no release in between (a mouseup the page never saw) and the window losing focus. Each must leave the
// drawing as it was, record no undo step and leave no gesture state behind (`gestureLeftovers`). A fifth case does the
// gesture twice on different elements: the second reads nothing of the first (e6f50f31: `groupResizeStart` outlived its
// gesture and scaled old elements on later resizes).
//
// The exits a built-in gesture does not have yet are marked `test.fail()` against the step of the plan that adds them;
// a step that lands makes its cases pass, and Playwright then reports them as unexpectedly passing until the mark goes.

// The layer has an id as a loaded drawing's does (the editor's load names its layers; without one the layers panel names it at
// the first change, which no step records).
const SVG = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><g class="layer" id="layer1"><title>Layer 1</title>
  <rect id="r1" x="100" y="100" width="100" height="80" fill="red"/>
  <rect id="r2" x="260" y="100" width="80" height="80" fill="blue"/>
  <rect id="r3" x="100" y="260" width="100" height="80" fill="green"/>
  <rect id="r4" x="260" y="260" width="80" height="80" fill="orange"/>
  <path id="p1" d="M420 120 L560 120 L560 220 Z" fill="none" stroke="black"/>
</g></svg>`

/** A point of an element's on-screen box: `fx`, `fy` are fractions of its width and height (0.5, 0.5 is the centre). */
const at = (page, id, fx = 0.5, fy = 0.5, dx = 0, dy = 0) => page.evaluate(([el, ax, ay, ox, oy]) => {
  const r = document.getElementById(el).getBoundingClientRect()
  return { x: r.x + r.width * ax + ox, y: r.y + r.height * ay + oy }
}, [id, fx, fy, dx, dy])

/** A drag from the centre of `id` by (dx, dy) client pixels. */
const dragFrom = async (page, id, dx = 40, dy = 30) => { const from = await at(page, id); return { from, to: { x: from.x + dx, y: from.y + dy } } }

const centreOf = (page, selector) => page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, selector)

const select = (page, ids) => page.evaluate((list) => {
  const c = window.svgEditor.svgCanvas
  c.selectOnly(list.map((id) => document.getElementById(id)), true)
}, ids)

/**
 * The gestures. `prepare` sets up the selection or mode; `points` gives the press and the point the drag goes to, in
 * client pixels. `second` is the same gesture on other elements (the repeat case).
 */
const GESTURES = {
  move: {
    prepare: (page) => select(page, ['r1']),
    points: (page) => dragFrom(page, 'r1'),
    second: { prepare: (page) => select(page, ['r3']), points: (page) => dragFrom(page, 'r3') }
  },
  'multi-move': {
    prepare: (page) => select(page, ['r1', 'r2']),
    points: (page) => dragFrom(page, 'r1'),
    second: { prepare: (page) => select(page, ['r3', 'r4']), points: (page) => dragFrom(page, 'r3') }
  },
  'alt-clone': {
    mods: ['Alt'],
    prepare: (page) => select(page, ['r1']),
    points: (page) => dragFrom(page, 'r1'),
    second: { prepare: (page) => select(page, ['r3']), points: (page) => dragFrom(page, 'r3') }
  },
  resize: {
    prepare: (page) => select(page, ['r1']),
    points: async (page) => { const g = await centreOf(page, '#selectorGrip_resize_se'); return { from: g, to: { x: g.x + 40, y: g.y + 30 } } },
    second: { prepare: (page) => select(page, ['r3']), points: async (page) => { const g = await centreOf(page, '#selectorGrip_resize_se'); return { from: g, to: { x: g.x + 40, y: g.y + 30 } } } }
  },
  'group resize': {
    prepare: (page) => select(page, ['r1', 'r2']),
    points: async (page) => { const g = await centreOf(page, '#selectorGrip_resize_se'); return { from: g, to: { x: g.x + 40, y: g.y + 30 } } },
    second: { prepare: (page) => select(page, ['r3']), points: async (page) => { const g = await centreOf(page, '#selectorGrip_resize_se'); return { from: g, to: { x: g.x + 40, y: g.y + 30 } } } }
  },
  rotate: {
    prepare: (page) => select(page, ['r1']),
    points: async (page) => { const g = await centreOf(page, '#selectorGrip_rotate'); return { from: g, to: { x: g.x + 60, y: g.y + 20 } } },
    second: { prepare: (page) => select(page, ['r3']), points: async (page) => { const g = await centreOf(page, '#selectorGrip_rotate'); return { from: g, to: { x: g.x + 60, y: g.y + 20 } } } }
  },
  'group rotate': {
    prepare: (page) => select(page, ['r1', 'r2']),
    points: async (page) => { const g = await centreOf(page, '#selectorGrip_rotate'); return { from: g, to: { x: g.x + 60, y: g.y + 20 } } },
    second: { prepare: (page) => select(page, ['r3', 'r4']), points: async (page) => { const g = await centreOf(page, '#selectorGrip_rotate'); return { from: g, to: { x: g.x + 60, y: g.y + 20 } } } }
  },
  marquee: {
    prepare: (page) => page.evaluate(() => window.svgEditor.svgCanvas.clearSelection()),
    points: async (page) => ({ from: await at(page, 'r1', 0, 0, -30, -30), to: await at(page, 'r2', 1, 1, 20, 20) })
  },
  'node drag': {
    prepare: (page) => page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const p = document.getElementById('p1')
      c.selectOnly([p], true)
      c.pathActions.toEditMode(p)
    }),
    points: async (page) => { const g = await centreOf(page, '#pathpointgrip_1'); return { from: g, to: { x: g.x + 30, y: g.y + 25 } } }
  }
}

/** The exits that are not a release, and how each is triggered while the button is down. */
const EXITS = {
  Escape: (page) => page.keyboard.press('Escape'),
  'a mode switch': (page) => page.evaluate(() => window.svgEditor.commands.run('tool_rect')),
  // the mouseup of the first press never arrived (released outside the window): the next event is a new press, on empty
  // canvas (on a grip or a shape it would begin a gesture of its own, which the release then rightly commits)
  'a second press': async (page) => {
    const empty = await at(page, 'r3', 0, 1, -30, 30)
    await page.evaluate(([x, y]) => {
      document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 }))
    }, [empty.x, empty.y])
  },
  'the window losing focus': (page) => page.evaluate(() => window.dispatchEvent(new Event('blur')))
}

/**
 * The cases that fail today, keyed `gesture › case`, with the step of the plan that makes them pass (first run of this spec,
 * 2026-11-24). Today no built-in gesture has an exit other than its release: Escape, a mode switch, a second press and a
 * lost focus all leave the drag applied, and the release then commits it.
 */
const allExits = (gesture, why) => Object.fromEntries(Object.keys(EXITS).map((e) => [`${gesture} › ${e}`, why]))
const NOT_YET = {
  ...allExits('node drag', 'step 6: node drag on the gesture session')
}

const state = (page) => page.evaluate(() => {
  const c = window.svgEditor.svgCanvas
  return { svg: c.getSvgString(), undo: c.undoMgr.getUndoStackSize() }
})

const settle = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))

test.describe('a gesture owns its state (R9)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate((svg) => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.setSvgString(svg)
      window.svgEditor.svgCanvas.clearSelection()
    }, SVG)
    // the whole page on screen (a load leaves the workarea scrolled): the presses are placed from on-screen boxes
    await page.evaluate(() => window.svgEditor.commands.run('zoom_fit'))
  })

  for (const [name, g] of Object.entries(GESTURES)) {
    test(`${name}: a press, a drag and a release is one undo step and leaves nothing behind`, async ({ page }) => {
      if (NOT_YET[`${name} › release`]) test.fail(true, NOT_YET[`${name} › release`])
      await g.prepare(page)
      const before = await state(page)
      const { from, to } = await g.points(page)
      for (const m of g.mods ?? []) await page.keyboard.down(m)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6)
      await page.mouse.up()
      for (const m of g.mods ?? []) await page.keyboard.up(m)
      await settle(page)
      const after = await state(page)
      if (name !== 'marquee') {
        expect(after.svg, 'the gesture changed the drawing').not.toBe(before.svg)
        expect(after.undo, 'one undo step').toBe(before.undo + 1)
      }
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.gestureLeftovers())).toEqual([])
    })

    for (const [exit, leave] of Object.entries(EXITS)) {
      const key = `${name} › ${exit}`
      test(`${name}: ended by ${exit}, it rolls back and leaves nothing behind`, async ({ page }) => {
        if (NOT_YET[key]) test.fail(true, NOT_YET[key])
        await g.prepare(page)
        const before = await state(page)
        const { from, to } = await g.points(page)
        for (const m of g.mods ?? []) await page.keyboard.down(m)
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6)
        await leave(page, { from, to })
        // the button comes up afterwards, somewhere else: the ended gesture must not commit on it
        await page.mouse.move(to.x + 15, to.y + 15)
        await page.mouse.up()
        for (const m of g.mods ?? []) await page.keyboard.up(m)
        await settle(page)
        const after = await state(page)
        expect(after.svg, 'the drawing is as it was').toBe(before.svg)
        expect(after.undo, 'no undo step').toBe(before.undo)
        expect(await page.evaluate(() => window.svgEditor.svgCanvas.gestureLeftovers())).toEqual([])
      })
    }

    if (g.second) {
      test(`${name}: done twice on different elements, the second reads nothing of the first`, async ({ page }) => {
        if (NOT_YET[`${name} › twice`]) test.fail(true, NOT_YET[`${name} › twice`])
        const run = async (gesture) => {
          await gesture.prepare(page)
          const { from, to } = await gesture.points(page)
          for (const m of g.mods ?? []) await page.keyboard.down(m)
          await page.mouse.move(from.x, from.y)
          await page.mouse.down()
          for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6)
          await page.mouse.up()
          for (const m of g.mods ?? []) await page.keyboard.up(m)
          await settle(page)
        }
        const original = await state(page)
        await run(g)
        const first = await page.evaluate(() => ['r1', 'r2'].map((id) => document.getElementById(id)?.outerHTML))
        const afterFirst = await state(page)
        await run(g.second)
        expect(await page.evaluate(() => ['r1', 'r2'].map((id) => document.getElementById(id)?.outerHTML)), 'the first gesture\'s elements stay put').toEqual(first)
        expect((await state(page)).undo, 'one step each').toBe(afterFirst.undo + 1)
        await page.evaluate(() => { const c = window.svgEditor.svgCanvas; c.undoMgr.undo(); c.undoMgr.undo() })
        await settle(page)
        expect((await state(page)).svg, 'two undos restore the drawing').toBe(original.svg)
      })
    }
  }
})
