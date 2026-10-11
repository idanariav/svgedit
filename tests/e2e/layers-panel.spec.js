import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, answerTextPrompt } from './helpers.js'

const layerNames = async (page) => {
  return page.$$eval('#layerlist tbody tr.layer td.layername', (nodes) =>
    nodes.map((n) => n.textContent.trim())
  )
}

const toggleVisibilityFor = async (page, name) => {
  const row = page.locator('#layerlist tbody tr.layer', {
    has: page.locator('td.layername', { hasText: name })
  })
  await row.locator('td.layervis').click()
}

const toggleLockFor = async (page, name) => {
  const row = page.locator('#layerlist tbody tr.layer', {
    has: page.locator('td.layername', { hasText: name })
  })
  await row.locator('td.layerlock').click()
}

test.describe('Layers panel', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.waitFor({ state: 'visible' })
    await panelHandle.click()
    // The right panel is tabbed (design/text/effects/layers); #layer_new
    // lives in the layers tabpanel, which is hidden until its tab is active.
    await page.click('[data-tab="layers"]')
    await page.waitForSelector('#layer_new', { state: 'visible' })
  })

  test('creates, renames, toggles and deletes layers', async ({ page }) => {
    const initialNames = await layerNames(page)
    expect(initialNames.length).toBeGreaterThan(0)

    await page.click('#layer_new')
    await answerTextPrompt(page, 'Layer 2')
    await expect.poll(() => layerNames(page)).resolves.toContain('Layer 2')

    await page.locator('#layerlist td.layername', { hasText: 'Layer 2' }).click()
    await page.click('#layer_rename')
    await answerTextPrompt(page, 'Renamed Layer')
    await expect.poll(() => layerNames(page)).resolves.toContain('Renamed Layer')

    await toggleVisibilityFor(page, 'Renamed Layer')
    const visibilityClass = await page.$eval(
      '#layerlist tbody tr.layer td.layername:has-text("Renamed Layer")',
      (node) => node.parentElement?.querySelector('td.layervis')?.className || ''
    )
    expect(visibilityClass).toContain('layerinvis')

    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.click()
    await panelHandle.click()

    await page.locator('#layerlist td.layername', { hasText: 'Renamed Layer' }).click()
    await page.click('#layer_delete')
    await expect.poll(() => layerNames(page)).resolves.not.toContain('Renamed Layer')
  })

  test('locks a layer so new objects skip it', async ({ page }) => {
    // Add a second layer; it becomes the top, current layer.
    await page.click('#layer_new')
    await answerTextPrompt(page, 'Layer 2')
    await expect.poll(() => layerNames(page)).resolves.toContain('Layer 2')

    // Lock the top (current) layer.
    await toggleLockFor(page, 'Layer 2')
    const lockClass = await page.$eval(
      '#layerlist tbody tr.layer td.layername:has-text("Layer 2")',
      (node) => node.parentElement?.querySelector('td.layerlock')?.className || ''
    )
    expect(lockClass).toContain('locked')

    // Draw a new element while the locked layer is current; it should land on the
    // unlocked layer below instead of the locked top layer.
    const parentLayerName = await page.evaluate(() => {
      const canv = window.svgEditor.svgCanvas
      const el = canv.addSVGElementsFromJson({
        element: 'rect',
        curStyles: true,
        attr: { x: 10, y: 10, width: 40, height: 40, id: canv.getNextId() }
      })
      const layerGroup = el.closest('g.layer')
      return layerGroup?.querySelector('title')?.textContent ?? null
    })
    expect(parentLayerName).not.toBe('Layer 2')

    // The locked state round-trips into the saved SVG.
    const svgStr = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(svgStr).toContain('se:locked="true"')
  })

  test.describe('layer gestures', () => {
    const DOC = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480" viewBox="0 0 640 480">
      <g class="layer"><title>Trace</title><rect id="tr" x="0" y="0" width="300" height="200" fill="#888"/></g>
      <g class="layer"><title>L1</title><rect id="a" x="10" y="10" width="40" height="40" fill="#f00"/></g>
      <g class="layer"><title>L2</title><rect id="b" x="100" y="10" width="40" height="40" fill="#0f0"/></g>
      <g class="layer"><title>L3</title><rect id="c" x="200" y="10" width="40" height="40" fill="#00f"/></g>
    </svg>`

    const layerRow = (page, name) => page.locator('#layerlist tr.layer', { has: page.locator('td.layername', { hasText: new RegExp(`^${name}$`) }) })
    const hiddenLayers = (page) => page.evaluate(() => {
      const d = window.svgEditor.svgCanvas.getCurrentDrawing()
      return Array.from({ length: d.getNumLayers() }, (_, i) => d.getLayerName(i)).filter((n) => !d.getLayerVisibility(n))
    })
    const lockedLayers = (page) => page.evaluate(() => {
      const d = window.svgEditor.svgCanvas.getCurrentDrawing()
      return Array.from({ length: d.getNumLayers() }, (_, i) => d.getLayerName(i)).filter((n) => d.getLayerLocked(n))
    })
    const zOrder = (page) => page.evaluate(() => {
      const d = window.svgEditor.svgCanvas.getCurrentDrawing()
      return Array.from({ length: d.getNumLayers() }, (_, i) => d.getLayerName(i))
    })
    const domOrder = (page) => page.evaluate(() => [...document.querySelectorAll('#svgcontent > g.layer > title')].map((t) => t.textContent))
    const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    const dragBetween = async (page, from, to, dy = 0) => {
      const a = await from.boundingBox()
      const b = await to.boundingBox()
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
      await page.mouse.down()
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 6, { steps: 3 })
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 8 })
      await page.mouse.up()
    }

    test.beforeEach(async ({ page }) => {
      await page.evaluate((svg) => {
        window.svgEditor.svgCanvas.setSvgString(svg)
        window.svgEditor.rightPanel.populateLayers()
      }, DOC)
      await page.waitForSelector('#layerlist tr.layer')
    })

    test('Alt-click an eye hides the other layers; again shows them; one undo reverts', async ({ page }) => {
      await layerRow(page, 'L2').locator('td.layervis').click({ modifiers: ['Alt'] })
      await expect.poll(() => hiddenLayers(page)).toEqual(['Trace', 'L1', 'L3'])
      expect(await hiddenLayers(page)).not.toContain('L2')
      // the rows follow
      await expect(layerRow(page, 'L3').locator('td.layervis')).toHaveClass(/layerinvis/)
      await expect(layerRow(page, 'L2').locator('td.layervis')).not.toHaveClass(/layerinvis/)

      await undo(page) // the whole Alt-click is one step
      expect(await hiddenLayers(page)).toEqual([])
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.redo())
      expect((await hiddenLayers(page)).length).toBe(3)

      await layerRow(page, 'L2').locator('td.layervis').click({ modifiers: ['Alt'] })
      expect(await hiddenLayers(page)).toEqual([])
    })

    test('Alt-click a padlock locks the other layers; again unlocks them', async ({ page }) => {
      await layerRow(page, 'L2').locator('td.layerlock').click({ modifiers: ['Alt'] })
      await expect.poll(() => lockedLayers(page).then((l) => l.sort())).toEqual(['L1', 'L3', 'Trace'])
      await expect(layerRow(page, 'L1').locator('td.layerlock')).toHaveClass(/locked/)
      await layerRow(page, 'L2').locator('td.layerlock').click({ modifiers: ['Alt'] })
      expect(await lockedLayers(page)).toEqual([])
    })

    test('dragging down the eye column sets every row it passes in one undo step', async ({ page }) => {
      await dragBetween(page, layerRow(page, 'L3').locator('td.layervis'), layerRow(page, 'L1').locator('td.layervis'))
      expect((await hiddenLayers(page)).sort()).toEqual(['L1', 'L2', 'L3'])
      await undo(page)
      expect(await hiddenLayers(page)).toEqual([])
    })

    test('a drag from a hidden eye shows the rows it passes; a plain click still toggles one', async ({ page }) => {
      await layerRow(page, 'L3').locator('td.layervis').click()
      await layerRow(page, 'L2').locator('td.layervis').click()
      expect((await hiddenLayers(page)).sort()).toEqual(['L2', 'L3'])
      await dragBetween(page, layerRow(page, 'L3').locator('td.layervis'), layerRow(page, 'L1').locator('td.layervis'))
      expect(await hiddenLayers(page)).toEqual([])
    })

    test('dragging down the lock column locks the rows it passes', async ({ page }) => {
      await dragBetween(page, layerRow(page, 'L3').locator('td.layerlock'), layerRow(page, 'L2').locator('td.layerlock'))
      expect((await lockedLayers(page)).sort()).toEqual(['L2', 'L3'])
    })

    test('dragging a layer row reorders the layers (one undo step)', async ({ page }) => {
      expect(await zOrder(page)).toEqual(['Trace', 'L1', 'L2', 'L3'])
      // drop L1 on the upper half of the top row, L3
      await dragBetween(page, layerRow(page, 'L1').locator('td.layername'), layerRow(page, 'L3').locator('td.layername'), -8)
      await expect.poll(() => zOrder(page)).toEqual(['Trace', 'L2', 'L3', 'L1'])
      expect(await layerNames(page)).toEqual(['L1', 'L3', 'L2', 'Trace'])
      await undo(page)
      expect(await domOrder(page)).toEqual(['Trace', 'L1', 'L2', 'L3'])
    })

    test('a tracing template is dimmed, unselectable, saved, and left out of exports', async ({ page }) => {
      await layerRow(page, 'Trace').locator('td.layercomment').click({ modifiers: ['Alt'] })
      await expect(layerRow(page, 'Trace').locator('td.layercomment')).toHaveClass(/templated/)
      const state = await page.evaluate(() => {
        const c = window.svgEditor.svgCanvas
        const g = document.getElementById('tr').parentNode
        c.setCurrentLayer('Trace')
        c.selectAllInCurrentLayer?.()
        return {
          opacity: getComputedStyle(g).opacity,
          selected: c.getSelectedElements().filter(Boolean).length,
          visible: c.getCurrentDrawing().getLayerVisibility('Trace'),
          locked: c.getLayerLocked('Trace'),
          saved: c.getSvgString().includes('se:template="true"') && c.getSvgString().includes('id="tr"')
        }
      })
      expect(Number(state.opacity)).toBeCloseTo(0.35, 2)
      expect(state.selected).toBe(0)
      expect(state.visible).toBe(true)
      expect(state.locked).toBe(true)
      expect(state.saved).toBe(true)
      const exported = await page.evaluate(async () => (await window.svgEditor.svgCanvas.rasterExport('PNG', 1, 'x', { avoidEvent: true })).svg)
      expect(exported).not.toContain('id="tr"')
      expect(exported).toContain('id="a"')
      // the row's objects are listed as locked: clicking one does not select it
      await expect(page.locator('#layerlist tr.object.objlockedtree')).toHaveCount(1)
      await page.locator('#layerlist tr.object.objlockedtree').locator('.objname').click()
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).length)).toBe(0)

      // the command ends it again; the layer unlocks but stays a comment layer
      await page.evaluate(() => { window.svgEditor.svgCanvas.setCurrentLayer('Trace'); return window.svgEditor.commands.run('layer_template') })
      await expect(layerRow(page, 'Trace').locator('td.layercomment')).not.toHaveClass(/templated/)
      const after = await page.evaluate(() => {
        const g = document.getElementById('tr').parentNode
        return { opacity: getComputedStyle(g).opacity, locked: window.svgEditor.svgCanvas.getLayerLocked('Trace'), comment: window.svgEditor.svgCanvas.getLayerComment('Trace') }
      })
      expect(after).toEqual({ opacity: '1', locked: false, comment: true })
    })

    test('Alt-click lock inside Focus mode leaves the locks as they were once it ends', async ({ page }) => {
      await page.evaluate(() => window.svgEditor.svgCanvas.setLayerLocked('L1', true))
      const before = await lockedLayers(page)
      await page.evaluate(() => window.svgEditor.commands.run('tool_layerView'))
      await layerRow(page, 'L2').locator('td.layerlock').click({ modifiers: ['Alt'] })
      await page.evaluate(() => window.svgEditor.commands.run('tool_layerView'))
      expect(await lockedLayers(page)).toEqual(before)
    })
  })

  test.describe('object rows', () => {
    const DOC = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480" viewBox="0 0 640 480">
      <g class="layer"><title>Layer 1</title>
        <rect id="r1" x="10" y="10" width="40" height="40" fill="#f00"/>
        <rect id="r2" x="100" y="10" width="40" height="40" fill="#0f0"/>
        <g id="grp" data-name="Pair" transform="translate(200,100)"><rect id="inner" x="0" y="0" width="30" height="30" fill="#00f"/></g>
      </g>
      <g class="layer"><title>Layer 2</title><ellipse id="e1" cx="400" cy="300" rx="30" ry="20" fill="#ff0"/></g>
    </svg>`

    const objectLabels = (page) => page.$$eval('#layerlist tr.object .objlabel', (n) => n.map((x) => x.textContent.trim()))
    const rowFor = async (page, id) => {
      const handle = await page.evaluateHandle((elId) => {
        const el = document.getElementById(elId)
        return [...document.querySelectorAll('#layerlist tr.object')].find((tr) => tr._el === el) ?? null
      }, id)
      return handle.asElement()
    }
    const selectedIds = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((e) => e.id))
    const openLayer = async (page, name) => {
      const tr = page.locator('#layerlist tr.layer', { has: page.locator('td.layername', { hasText: name }) })
      if (!(await tr.locator('td.layertoggle.open').count())) await tr.locator('td.layertoggle').click()
    }

    test.beforeEach(async ({ page }) => {
      await page.evaluate((svg) => {
        window.svgEditor.svgCanvas.setSvgString(svg)
        window.svgEditor.rightPanel.populateLayers()
      }, DOC)
      await page.waitForSelector('#layerlist tr.layer')
      await openLayer(page, 'Layer 1')
      await openLayer(page, 'Layer 2')
    })

    test('lists objects front to back, groups expand', async ({ page }) => {
      await expect.poll(() => objectLabels(page)).toEqual(['Ellipse', 'Pair', 'Rectangle', 'Rectangle'])
      const grp = await rowFor(page, 'grp')
      await grp.$('.disclosure').then((d) => d.click())
      await expect.poll(() => objectLabels(page)).toEqual(['Ellipse', 'Pair', 'Rectangle', 'Rectangle', 'Rectangle'])
    })

    test('a row click selects the object (inside a group too) and keeps it across refreshes', async ({ page }) => {
      await (await rowFor(page, 'r2')).click()
      expect(await selectedIds(page)).toEqual(['r2'])
      expect(await (await rowFor(page, 'r2')).getAttribute('class')).toContain('objsel')
      await (await (await rowFor(page, 'grp')).$('.disclosure')).click()
      await (await rowFor(page, 'inner')).click()
      expect(await selectedIds(page)).toEqual(['inner'])
      await page.evaluate(() => window.svgEditor.rightPanel.layerTree.invalidate())
      expect(await selectedIds(page)).toEqual(['inner'])
      await (await rowFor(page, 'e1')).click()
      expect(await selectedIds(page)).toEqual(['e1'])
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayerName())).toBe('Layer 2')
    })

    test('the eye hides an object (and undo shows it); hidden objects cannot be selected', async ({ page }) => {
      await (await rowFor(page, 'r1')).click()
      await (await (await rowFor(page, 'r1')).$('td.objvis')).click()
      expect(await page.evaluate(() => document.getElementById('r1').getAttribute('display'))).toBe('none')
      expect(await selectedIds(page)).toEqual([])
      await (await rowFor(page, 'r1')).click()
      expect(await selectedIds(page)).toEqual([])
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await page.evaluate(() => document.getElementById('r1').hasAttribute('display'))).toBe(false)
      await expect.poll(async () => (await rowFor(page, 'r1')) !== null && !(await (await rowFor(page, 'r1')).getAttribute('class')).includes('objhidden')).toBe(true)
    })

    test('a locked object cannot be selected on the canvas, by rubber band or from its row', async ({ page }) => {
      await (await (await rowFor(page, 'r2')).$('td.objlock')).click()
      expect(await page.evaluate(() => document.getElementById('r2').getAttributeNS('http://svg-edit.googlecode.com', 'locked'))).toBe('true')
      await (await rowFor(page, 'r2')).click()
      expect(await selectedIds(page)).toEqual([])
      const hit = await page.evaluate(() => {
        const c = window.svgEditor.svgCanvas
        const el = document.getElementById('r2')
        return c.getMouseTargetFromNode(el) === c.getSvgRoot()
      })
      expect(hit).toBe(true)
      await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r1'), document.getElementById('r2')]))
      expect(await selectedIds(page)).toEqual(['r1'])
      // Unlock: selectable again
      await (await (await rowFor(page, 'r2')).$('td.objlock')).click()
      await (await rowFor(page, 'r2')).click()
      expect(await selectedIds(page)).toEqual(['r2'])
    })

    test('Alt-click an object eye hides its siblings only; Alt-click a lock locks them', async ({ page }) => {
      const hidden = () => page.evaluate(() => ['r1', 'r2', 'grp', 'e1'].filter((id) => document.getElementById(id).getAttribute('display') === 'none'))
      const locked = () => page.evaluate(() => ['r1', 'r2', 'grp', 'e1'].filter((id) => document.getElementById(id).getAttributeNS('http://svg-edit.googlecode.com', 'locked') === 'true'))
      const r2 = await rowFor(page, 'r2')
      await (await r2.$('td.objvis')).click({ modifiers: ['Alt'] })
      expect(await hidden()).toEqual(['r1', 'grp'])
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await hidden()).toEqual([])
      await (await (await rowFor(page, 'r2')).$('td.objlock')).click({ modifiers: ['Alt'] })
      expect(await locked()).toEqual(['r1', 'grp'])
      await (await (await rowFor(page, 'r2')).$('td.objlock')).click({ modifiers: ['Alt'] })
      expect(await locked()).toEqual([])
    })

    test('double-click renames; the name is undoable', async ({ page }) => {
      const label = await (await rowFor(page, 'r1')).$('.objlabel')
      await label.dblclick()
      await page.keyboard.type('Sun')
      await page.keyboard.press('Enter')
      await expect.poll(() => objectLabels(page)).toContain('Sun')
      expect(await page.evaluate(() => document.getElementById('r1').getAttribute('data-name'))).toBe('Sun')
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      await expect.poll(() => objectLabels(page)).not.toContain('Sun')
    })

    test('dragging a row moves the object into another layer and keeps it in place', async ({ page }) => {
      await (await (await rowFor(page, 'grp')).$('.disclosure')).click()
      const before = await page.evaluate(() => {
        const r = document.getElementById('inner').getBoundingClientRect()
        return { x: r.x, y: r.y }
      })
      const src = await (await rowFor(page, 'inner')).boundingBox()
      const dst = await page.locator('#layerlist tr.layer', { has: page.locator('td.layername', { hasText: 'Layer 2' }) }).boundingBox()
      await page.mouse.move(src.x + 170, src.y + src.height / 2)
      await page.mouse.down()
      await page.mouse.move(src.x + 170, src.y + 30, { steps: 4 })
      await page.mouse.move(dst.x + 170, dst.y + dst.height / 2, { steps: 6 })
      await page.mouse.up()
      const after = await page.evaluate(() => {
        const el = document.getElementById('inner')
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, layer: el.closest('g.layer').querySelector('title').textContent }
      })
      expect(after.layer).toBe('Layer 2')
      expect(Math.abs(after.x - before.x)).toBeLessThan(0.5)
      expect(Math.abs(after.y - before.y)).toBeLessThan(0.5)
      // one undo step puts it back
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await page.evaluate(() => document.getElementById('inner').parentNode.id)).toBe('grp')
    })

    test('dropping above another row reorders within the layer', async ({ page }) => {
      const src = await (await rowFor(page, 'r1')).boundingBox() // bottom of Layer 1
      const dst = await (await rowFor(page, 'grp')).boundingBox() // top of Layer 1
      await page.mouse.move(src.x + 170, src.y + src.height / 2)
      await page.mouse.down()
      await page.mouse.move(src.x + 170, src.y - 10, { steps: 3 })
      await page.mouse.move(dst.x + 170, dst.y + 2, { steps: 6 })
      await page.mouse.up()
      const order = await page.evaluate(() => [...document.querySelector('g.layer').children].filter((e) => e.id).map((e) => e.id))
      expect(order).toEqual(['r2', 'grp', 'r1'])
    })

    test('Locate Object opens the groups above the selection', async ({ page }) => {
      await page.evaluate(() => {
        const c = window.svgEditor.svgCanvas
        c.setContext(document.getElementById('grp'))
        c.selectOnly([document.getElementById('inner')], true)
      })
      await page.evaluate(() => window.svgEditor.commands.run('layer_locate'))
      await expect.poll(() => objectLabels(page)).toEqual(['Ellipse', 'Pair', 'Rectangle', 'Rectangle', 'Rectangle'])
      expect(await (await rowFor(page, 'inner')).getAttribute('class')).toContain('objsel')
    })
  })
})
