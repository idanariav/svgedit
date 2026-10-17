import { test, expect } from '../fixtures.js'

test.describe('SVG core history and draw', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/unit-harness.html')
    await page.waitForFunction(() => Boolean(window.svgHarness))
  })

  test('UndoManager tracks stacks and command texts through undo/redo', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { history } = window.svgHarness
      let lastCalled = ''
      class MockCommand extends history.Command {
        constructor (text) {
          super()
          this.text = text
        }

        apply () { lastCalled = `${this.text}:apply` }
        unapply () { lastCalled = `${this.text}:unapply` }
        elements () { return [] }
      }
      MockCommand.prototype.domless = true // a command that is not in a snapshot runs itself
      const um = new history.UndoManager()
      ;['First', 'Second', 'Third'].forEach((label) => {
        um.addCommandToHistory(new MockCommand(label))
      })
      const beforeUndo = {
        undo: um.getUndoStackSize(),
        redo: um.getRedoStackSize(),
        nextUndo: um.getNextUndoCommandText(),
        nextRedo: um.getNextRedoCommandText()
      }
      um.undo()
      const afterFirstUndo = {
        undo: um.getUndoStackSize(),
        redo: um.getRedoStackSize(),
        nextUndo: um.getNextUndoCommandText(),
        nextRedo: um.getNextRedoCommandText(),
        lastCalled
      }
      um.undo()
      um.redo()
      const afterRedo = {
        undo: um.getUndoStackSize(),
        redo: um.getRedoStackSize(),
        nextUndo: um.getNextUndoCommandText(),
        nextRedo: um.getNextRedoCommandText(),
        lastCalled
      }
      return { beforeUndo, afterFirstUndo, afterRedo }
    })
    expect(result.beforeUndo).toEqual({
      undo: 3,
      redo: 0,
      nextUndo: 'Third',
      nextRedo: ''
    })
    expect(result.afterFirstUndo.undo).toBe(2)
    expect(result.afterFirstUndo.redo).toBe(1)
    expect(result.afterFirstUndo.nextUndo).toBe('Second')
    expect(result.afterFirstUndo.nextRedo).toBe('Third')
    expect(result.afterFirstUndo.lastCalled).toBe('Third:unapply')
    expect(result.afterRedo.undo).toBe(2)
    expect(result.afterRedo.redo).toBe(1)
    expect(result.afterRedo.nextUndo).toBe('Second')
    expect(result.afterRedo.nextRedo).toBe('Third')
    expect(result.afterRedo.lastCalled).toBe('Second:apply')
  })

  test('history commands carry a label and the element they are about', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { history } = window.svgHarness
      const el = document.createElement('div')
      return {
        move: new history.MoveElementCommand(el, null, null).getText(),
        insert: new history.InsertElementCommand(el).getText(),
        remove: new history.RemoveElementCommand(el, null, null).getText(),
        change: new history.ChangeElementCommand(el, { a: '1' }, 'Fill').getText(),
        elements: new history.InsertElementCommand(el).elements()[0] === el
      }
    })
    expect(result).toEqual({ move: 'Move DIV', insert: 'Create DIV', remove: 'Delete DIV', change: 'Change DIV Fill', elements: true })
  })

  test('BatchCommand applies and unapplies subcommands in order', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { history } = window.svgHarness
      let record = ''
      class TextCommand extends history.Command {
        constructor (text) {
          super()
          this.text = text
        }

        apply () { record += this.text }
        unapply () { record += this.text.toUpperCase() }
        elements () { return [] }
      }
      const batch = new history.BatchCommand()
      const emptyBefore = batch.isEmpty()
      batch.addSubCommand(new TextCommand('a'))
      batch.addSubCommand(new TextCommand('b'))
      batch.addSubCommand(new TextCommand('c'))
      batch.apply()
      const afterApply = record
      record = ''
      batch.unapply()
      const afterUnapply = record
      return { emptyBefore, afterApply, afterUnapply }
    })
    expect(result.emptyBefore).toBe(true)
    expect(result.afterApply).toBe('abc')
    expect(result.afterUnapply).toBe('CBA')
  })

  test('Drawing creates layers, generates ids and toggles nonce randomization', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { draw, namespaces } = window.svgHarness
      const svg = document.createElementNS(namespaces.NS.SVG, 'svg')
      document.body.append(svg)
      const drawing = new draw.Drawing(svg)
      const beforeIdentify = drawing.getNumLayers()
      drawing.identifyLayers()
      const defaultLayer = drawing.getCurrentLayer()
      const defaultName = drawing.getCurrentLayerName()
      const hrCounts = { start: 0, end: 0, insert: 0 }
      const newLayer = drawing.createLayer('Layer A', {
        startBatchCommand: () => { hrCounts.start++ },
        endBatchCommand: () => { hrCounts.end++ },
        insertElement: () => { hrCounts.insert++ }
      })
      const afterCreate = {
        num: drawing.getNumLayers(),
        currentName: drawing.getCurrentLayerName(),
        className: newLayer.getAttribute('class')
      }
      draw.randomizeIds(true, drawing)
      const nonceAfterRandomize = drawing.getNonce()
      draw.randomizeIds(false, drawing)
      const nonceAfterClear = drawing.getNonce()
      return {
        beforeIdentify,
        defaultName,
        defaultLayerClass: defaultLayer?.getAttribute('class'),
        afterCreate,
        hrCounts,
        nonceAfterRandomize,
        nonceAfterClear
      }
    })
    expect(result.beforeIdentify).toBe(0)
    expect(result.defaultLayerClass).toBeDefined()
    expect(result.defaultName.length).toBeGreaterThan(0)
    expect(result.afterCreate.num).toBe(2)
    expect(result.afterCreate.currentName).toBe('Layer A')
    expect(result.afterCreate.className).toBe(result.defaultLayerClass)
    expect(result.hrCounts).toEqual({ start: 1, end: 1, insert: 1 })
    expect(result.nonceAfterRandomize).toBeTruthy()
    expect(result.nonceAfterClear).toBe('')
  })
})
