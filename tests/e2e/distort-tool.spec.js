import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Distort tool: drag a corner of the selected shape's box. The shape gets a freeDistort / perspective live
// effect (corners in unit box coordinates); one undo step per drag.
test.describe('Distort tool', () => {
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
        <rect id="box" x="100" y="100" width="200" height="100" stroke="#000000" stroke-width="2" fill="#cccccc"/>
        <path id="curve" d="M100,360 C200,260 400,460 500,360" stroke="#000000" stroke-width="4" fill="none"/>
        <g id="grp"><rect x="400" y="100" width="40" height="40" fill="#f00"/></g>
      </g>
    </svg>`)
  })

  const tool = (page) => page.evaluate(() => window.svgEditor.commands.run('tool_distort'))
  const select = (page, id) => page.evaluate((i) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(i)], true), id)
  const drag = (page, from, to, mods) => page.evaluate(([a, b, m]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 10, mods: m }]), [from, to, mods])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  const fx = (page, id) => page.evaluate((i) => document.getElementById(i)?.getAttribute('se:fx') ?? null, id)
  const param = (page, id, key) => fx(page, id).then((s) => Number(new RegExp(`${key}=([-\\d.e]+)`).exec(s)?.[1]))

  test('the tool is in the left panel and arms its mode', async ({ page }) => {
    await page.evaluate(() => document.querySelector('#tool_distort').click())
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('distort')
  })

  test('dragging the bottom right corner distorts a rect in one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    const undo0 = await undoSize(page)
    await drag(page, { x: 300, y: 200 }, { x: 400, y: 260 })
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('path')
    expect(await fx(page, 'box')).toMatch(/^freeDistort\(/)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.5, 2) // (400 - 100) / 200
    expect(await param(page, 'box', 'bottomRightY')).toBeCloseTo(1.6, 2) // (260 - 100) / 100
    expect(await param(page, 'box', 'topLeftX')).toBeCloseTo(0, 5)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.5, 2)
  })

  test('a second drag edits the same effect rather than stacking another', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 350, y: 220 })
    await drag(page, { x: 100, y: 100 }, { x: 120, y: 90 })
    const stack = await fx(page, 'box')
    expect(stack.split(';')).toHaveLength(1)
    expect(await param(page, 'box', 'topLeftX')).toBeCloseTo(0.1, 2)
    expect(await param(page, 'box', 'topLeftY')).toBeCloseTo(-0.1, 2)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.25, 2)
  })

  test('Shift keeps the corner on its dominant axis', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 380, y: 210 }, { shift: true })
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.4, 2)
    expect(await param(page, 'box', 'bottomRightY')).toBeCloseTo(1, 5)
  })

  test('Perspective mode writes a perspective effect and refuses a fold', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('mode', 'perspective'))
    await drag(page, { x: 300, y: 200 }, { x: 260, y: 200 })
    expect(await fx(page, 'box')).toMatch(/^perspective\(/)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(0.8, 2)
    // Pulling the corner across the opposite one would fold the projective map: the last valid corner stays.
    await drag(page, { x: 260, y: 200 }, { x: 50, y: 50 })
    expect(await param(page, 'box', 'bottomRightX')).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.getElementById('box').getAttribute('d'))).not.toMatch(/NaN|Infinity/)
  })

  test('changing the mode with a distorted shape selected converts its effect in one undo step', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await drag(page, { x: 300, y: 200 }, { x: 350, y: 220 })
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('mode', 'perspective'))
    expect(await fx(page, 'box')).toMatch(/^perspective\(/)
    expect(await param(page, 'box', 'bottomRightX')).toBeCloseTo(1.25, 2)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await fx(page, 'box')).toMatch(/^freeDistort\(/)
  })

  test('a click selects a shape and changes nothing; a press away from every shape does nothing', async ({ page }) => {
    await tool(page)
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'click', x: 200, y: 150 }]))
    expect(await undoSize(page)).toBe(undo0)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id))).toEqual(['box'])
    await drag(page, { x: 20, y: 20 }, { x: 60, y: 60 })
    expect(await undoSize(page)).toBe(undo0)
    expect(await fx(page, 'box')).toBeNull()
  })

  test('a curve distorts and keeps its node count growing smoothly (finite geometry)', async ({ page }) => {
    await select(page, 'curve')
    await tool(page)
    const box = await page.evaluate(() => { const b = document.getElementById('curve').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
    await drag(page, { x: box.x + box.w, y: box.y + box.h }, { x: box.x + box.w + 40, y: box.y + box.h + 30 })
    expect(await fx(page, 'curve')).toMatch(/^freeDistort\(/)
    expect(await page.evaluate(() => document.getElementById('curve').getAttribute('d'))).not.toMatch(/NaN/)
  })

  test('Escape mid-drag puts the shape back', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await page.evaluate(() => window.svgEditor.automation.pointer([{ kind: 'down', x: 300, y: 200 }, { kind: 'move', x: 380, y: 240 }]))
    expect(await fx(page, 'box')).not.toBeNull()
    await page.evaluate(() => window.svgEditor.svgCanvas.cancelToolGesture())
    expect(await page.evaluate(() => document.getElementById('box').tagName)).toBe('rect')
  })

  test('an overlay with four grips shows for the shape and goes with the tool', async ({ page }) => {
    await select(page, 'box')
    await tool(page)
    await expect(page.locator('#toolOverlay rect')).toHaveCount(4)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await expect(page.locator('#toolOverlay rect')).toHaveCount(0)
  })

  test('the corners follow the element when it has its own transform', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="rot" x="0" y="0" width="100" height="100" transform="translate(200 200) rotate(90)" fill="#ccc"/>
      </g></svg>`)
    await select(page, 'rot')
    await tool(page)
    // The rect's local (100,100) corner is at document (200 - 100, 200 + 100) = (100, 300).
    await drag(page, { x: 100, y: 300 }, { x: 100, y: 340 })
    // Document -y... local x axis is document +y after the 90° turn: +40 doc y = +40 local x => 0.4 of the width.
    expect(await param(page, 'rot', 'bottomRightX')).toBeCloseTo(1.4, 2)
    expect(await param(page, 'rot', 'bottomRightY')).toBeCloseTo(1, 2)
  })
})

// A shape inside a transformed group: the grips are where the shape is on the page (the groups above it count), whether the group
// is entered or not. The corner is found from the shape's own screen matrix, so the test does not use the code under test.
test.describe('Distort tool: a shape inside a transformed group', () => {
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
        <g id="grp" transform="translate(150 60) rotate(10 60 40)"><rect id="inner" x="10" y="10" width="100" height="60" fill="#cccccc" stroke="#000000" stroke-width="2"/></g>
      </g>
    </svg>`)
  })

  /** The shape's bottom right corner in document units, and the unit coordinates a document point has in the shape's box. */
  const geometry = (page) => page.evaluate(() => {
    const el = document.getElementById('inner')
    const inv = document.querySelector('#svgcontent').getScreenCTM().inverse()
    const m = inv.multiply(el.getScreenCTM())
    const b = el.getBBox()
    const corner = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m)
    return { corner: { x: corner.x, y: corner.y }, m: [m.a, m.b, m.c, m.d, m.e, m.f], box: { x: b.x, y: b.y, w: b.width, h: b.height } }
  })
  const unitOf = (g, p) => {
    const [a, b, c, d, e, f] = g.m
    const det = a * d - b * c
    const lx = (d * (p.x - e) - c * (p.y - f)) / det
    const ly = (-b * (p.x - e) + a * (p.y - f)) / det
    return { x: (lx - g.box.x) / g.box.w, y: (ly - g.box.y) / g.box.h }
  }
  const param = (page, key) => page.evaluate((k) => Number(new RegExp(`${k}=([-\\d.e]+)`).exec(document.getElementById('inner').getAttribute('se:fx') ?? '')?.[1]), key)

  for (const entered of [false, true]) {
    test(`dragging the shape's real corner distorts it (group ${entered ? 'entered' : 'not entered'})`, async ({ page }) => {
      await page.evaluate((enter) => {
        const c = window.svgEditor.svgCanvas
        if (enter) c.setContext('grp')
        c.selectOnly([document.getElementById('inner')], true)
        return window.svgEditor.commands.run('tool_distort')
      }, entered)
      const g = await geometry(page)
      const to = { x: g.corner.x + 30, y: g.corner.y + 20 }
      await page.evaluate(([a, b]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 10 }]), [g.corner, to])
      const want = unitOf(g, to)
      expect(await param(page, 'bottomRightX')).toBeCloseTo(want.x, 2)
      expect(await param(page, 'bottomRightY')).toBeCloseTo(want.y, 2)
    })
  }

  test('the grips are drawn on the corners of the shape as it appears', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.selectOnly([document.getElementById('inner')], true)
      return window.svgEditor.commands.run('tool_distort')
    })
    const g = await geometry(page)
    const near = await page.evaluate((c) => {
      const o = document.getElementById('toolOverlay')
      const content = document.querySelector('#svgcontent')
      const inv = content.getScreenCTM().inverse()
      // a grip's centre in document units, whatever element it is made of
      return Array.from(o.querySelectorAll('rect, circle')).some((e) => {
        const bb = e.getBoundingClientRect()
        const p = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(inv)
        return Math.hypot(p.x - c.x, p.y - c.y) < 3
      })
    }, g.corner)
    expect(near).toBe(true)
  })
})

// A group distorts as one piece: every shape in it gets the same corners on the group's box, plus its own map into that box.
test.describe('Distort tool: a group', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({ gridSnapping: false })
      window.svgEditor.svgCanvas.getCurConfig().smartSnapping = false
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
    // The group's box is (100,100)-(300,200): a rect, and a second one placed by a transform, plus a text that is left alone.
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <g id="grp">
          <rect id="a" x="100" y="100" width="100" height="50" fill="#f00"/>
          <rect id="b" x="0" y="0" width="50" height="100" fill="#00f" transform="translate(250 100)"/>
          <text id="t" x="120" y="180" font-size="12">hi</text>
        </g>
      </g>
    </svg>`)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('grp')], true))
    await page.evaluate(() => window.svgEditor.commands.run('tool_distort'))
  })

  const drag = (page, from, to) => page.evaluate(([a, b]) => window.svgEditor.automation.pointer([{ kind: 'drag', ...a, to: b, steps: 10 }]), [from, to])
  const fx = (page, id) => page.evaluate((i) => document.getElementById(i)?.getAttribute('se:fx') ?? null, id)
  const param = (s, key) => Number(new RegExp(`${key}=([-\\d.e]+)`).exec(s ?? '')?.[1])
  const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
  /** An element's box in document units (its transform counted). */
  const docBox = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    const m = document.querySelector('#svgcontent').getScreenCTM().inverse().multiply(el.getScreenCTM())
    const b = el.getBBox()
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m))
    return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) }
  }, id)

  test('four grips on the group\'s box', async ({ page }) => {
    await expect(page.locator('#toolOverlay rect')).toHaveCount(4)
  })

  test('dragging a corner distorts every shape in the group as one piece, in one undo step', async ({ page }) => {
    const undo0 = await undoSize(page)
    await drag(page, { x: 300, y: 200 }, { x: 340, y: 240 })
    for (const id of ['a', 'b']) {
      expect(await page.evaluate((i) => document.getElementById(i).tagName, id)).toBe('path')
      const s = await fx(page, id)
      expect(s).toMatch(/^freeDistort\(/)
      expect(param(s, 'bottomRightX')).toBeCloseTo(1.2, 2) // (340 - 100) / 200
      expect(param(s, 'bottomRightY')).toBeCloseTo(1.4, 2) // (240 - 100) / 100
      expect(param(s, 'frameW')).toBeCloseTo(200, 3)
      expect(param(s, 'frameH')).toBeCloseTo(100, 3)
    }
    // The far corner of the group is the far corner of `b`, through its transform: it lands under the pointer.
    const b = await docBox(page, 'b')
    expect(b.x1).toBeCloseTo(340, 0)
    expect(b.y1).toBeCloseTo(240, 0)
    // `a` touches the box's top left corner, which did not move.
    const a = await docBox(page, 'a')
    expect(a.x0).toBeCloseTo(100, 0)
    expect(a.y0).toBeCloseTo(100, 0)
    expect(await fx(page, 't')).toBeNull()
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => ['a', 'b'].map((i) => document.getElementById(i).tagName))).toEqual(['rect', 'rect'])
  })

  test('a second drag edits the same entries, on the same box', async ({ page }) => {
    await drag(page, { x: 300, y: 200 }, { x: 340, y: 240 })
    await drag(page, { x: 100, y: 100 }, { x: 80, y: 90 })
    for (const id of ['a', 'b']) {
      const s = await fx(page, id)
      expect(s.split(';')).toHaveLength(1)
      expect(param(s, 'topLeftX')).toBeCloseTo(-0.1, 2)
      expect(param(s, 'bottomRightX')).toBeCloseTo(1.2, 2)
      expect(param(s, 'frameW')).toBeCloseTo(200, 3)
    }
  })

  test('changing the mode converts every member; Reset takes the distortion off, one undo step each', async ({ page }) => {
    await drag(page, { x: 300, y: 200 }, { x: 330, y: 220 })
    const undo0 = await undoSize(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('mode', 'perspective'))
    for (const id of ['a', 'b']) expect(await fx(page, id)).toMatch(/^perspective\(/)
    expect(await undoSize(page)).toBe(undo0 + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.setToolOption('reset', true))
    for (const id of ['a', 'b']) expect(await fx(page, id)).toBeNull()
    expect(await undoSize(page)).toBe(undo0 + 2)
    const b = await docBox(page, 'b')
    expect(b.x1).toBeCloseTo(300, 0)
  })

  test('a shape distorted on its own keeps that distortion under the group\'s', async ({ page }) => {
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.setContext('grp')
      c.selectOnly([document.getElementById('a')], true)
    })
    await drag(page, { x: 200, y: 150 }, { x: 210, y: 160 })
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.leaveContext()
      c.selectOnly([document.getElementById('grp')], true)
    })
    await drag(page, { x: 300, y: 200 }, { x: 330, y: 220 })
    const s = await fx(page, 'a')
    expect(s.split(';')).toHaveLength(2)
    expect(param(s.split(';')[0], 'frameW')).toBeNaN() // its own entry has no shared frame
    expect(param(s.split(';')[1], 'frameW')).toBeCloseTo(200, 3)
  })
})
