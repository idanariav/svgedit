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
