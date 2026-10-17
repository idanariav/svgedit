import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import * as utilities from '../../packages/svgcanvas/core/dom-utils.ts'
import * as history from '../../packages/svgcanvas/core/history.js'

describe('history', function () {
  // TODO(codedread): Write tests for handling history events.

  utilities.mock({
    getHref () { return '#foo' },
    setHref () { /* empty fn */ },
    getRotationAngle () { return 0 }
  })

  // const svg = document.createElementNS(NS.SVG, 'svg');
  let undoMgr = null
  let divparent
  let div1
  let div2
  let div3
  let div4
  let div5
  let div

  class MockCommand extends history.Command {
    constructor (optText) {
      super()
      this.text = optText
    }

    apply (handler) {
      super.apply(handler, () => { /* empty fn */ })
    }

    unapply (handler) {
      super.unapply(handler, () => { /* empty fn */ })
    }

    elements () { return [] }
  }

  /*
  class MockHistoryEventHandler {
    handleHistoryEvent (eventType, command) {}
  }
  */

  /**
   * Set up tests (with undo manager).
   * @returns {void}
   */
  beforeEach(function () {
    undoMgr = new history.UndoManager()

    document.body.textContent = ''
    divparent = document.createElement('div')
    divparent.id = 'divparent'
    divparent.style.visibility = 'hidden'

    div1 = document.createElement('div'); div1.id = 'div1'
    div2 = document.createElement('div'); div2.id = 'div2'
    div3 = document.createElement('div'); div3.id = 'div3'
    div4 = document.createElement('div'); div4.id = 'div4'
    div5 = document.createElement('div'); div5.id = 'div5'
    div = document.createElement('div'); div.id = 'div'

    divparent.append(div1, div2, div3)

    div4.style.visibility = 'hidden'
    div4.append(div5)

    document.body.append(divparent, div)
  })
  /**
   * Tear down tests, destroying undo manager.
   * @returns {void}
   */
  afterEach(() => {
    undoMgr = null
  })

  it('Test svgedit.history package', function () {
    assert.ok(history)
    assert.ok(history.MoveElementCommand)
    assert.ok(history.InsertElementCommand)
    assert.ok(history.ChangeElementCommand)
    assert.ok(history.RemoveElementCommand)
    assert.ok(history.BatchCommand)
    assert.ok(history.UndoManager)
    assert.equal(typeof history.MoveElementCommand, typeof function () { /* empty fn */ })
    assert.equal(typeof history.InsertElementCommand, typeof function () { /* empty fn */ })
    assert.equal(typeof history.ChangeElementCommand, typeof function () { /* empty fn */ })
    assert.equal(typeof history.RemoveElementCommand, typeof function () { /* empty fn */ })
    assert.equal(typeof history.BatchCommand, typeof function () { /* empty fn */ })
    assert.equal(typeof history.UndoManager, typeof function () { /* empty fn */ })
  })

  it('Test UndoManager methods', function () {
    assert.ok(undoMgr)
    assert.ok(undoMgr.addCommandToHistory)
    assert.ok(undoMgr.getUndoStackSize)
    assert.ok(undoMgr.getRedoStackSize)
    assert.ok(undoMgr.resetUndoStack)
    assert.ok(undoMgr.getNextUndoCommandText)
    assert.ok(undoMgr.getNextRedoCommandText)

    assert.equal(typeof undoMgr, typeof {})
    assert.equal(typeof undoMgr.addCommandToHistory, typeof function () { /* empty fn */ })
    assert.equal(typeof undoMgr.getUndoStackSize, typeof function () { /* empty fn */ })
    assert.equal(typeof undoMgr.getRedoStackSize, typeof function () { /* empty fn */ })
    assert.equal(typeof undoMgr.resetUndoStack, typeof function () { /* empty fn */ })
    assert.equal(typeof undoMgr.getNextUndoCommandText, typeof function () { /* empty fn */ })
    assert.equal(typeof undoMgr.getNextRedoCommandText, typeof function () { /* empty fn */ })
  })

  it('Test UndoManager.addCommandToHistory() function', function () {
    assert.equal(undoMgr.getUndoStackSize(), 0)
    undoMgr.addCommandToHistory(new MockCommand())
    assert.equal(undoMgr.getUndoStackSize(), 1)
    undoMgr.addCommandToHistory(new MockCommand())
    assert.equal(undoMgr.getUndoStackSize(), 2)
  })

  it('Test UndoManager.getUndoStackSize() and getRedoStackSize() functions', function () {
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.addCommandToHistory(new MockCommand())

    assert.equal(undoMgr.getUndoStackSize(), 3)
    assert.equal(undoMgr.getRedoStackSize(), 0)

    undoMgr.undo()
    assert.equal(undoMgr.getUndoStackSize(), 2)
    assert.equal(undoMgr.getRedoStackSize(), 1)

    undoMgr.undo()
    assert.equal(undoMgr.getUndoStackSize(), 1)
    assert.equal(undoMgr.getRedoStackSize(), 2)

    undoMgr.undo()
    assert.equal(undoMgr.getUndoStackSize(), 0)
    assert.equal(undoMgr.getRedoStackSize(), 3)

    undoMgr.undo()
    assert.equal(undoMgr.getUndoStackSize(), 0)
    assert.equal(undoMgr.getRedoStackSize(), 3)

    undoMgr.redo()
    assert.equal(undoMgr.getUndoStackSize(), 1)
    assert.equal(undoMgr.getRedoStackSize(), 2)

    undoMgr.redo()
    assert.equal(undoMgr.getUndoStackSize(), 2)
    assert.equal(undoMgr.getRedoStackSize(), 1)

    undoMgr.redo()
    assert.equal(undoMgr.getUndoStackSize(), 3)
    assert.equal(undoMgr.getRedoStackSize(), 0)

    undoMgr.redo()
    assert.equal(undoMgr.getUndoStackSize(), 3)
    assert.equal(undoMgr.getRedoStackSize(), 0)
  })

  it('Test UndoManager.resetUndoStackSize() function', function () {
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.undo()

    assert.equal(undoMgr.getUndoStackSize(), 2)
    assert.equal(undoMgr.getRedoStackSize(), 1)

    undoMgr.resetUndoStack()

    assert.equal(undoMgr.getUndoStackSize(), 0)
    assert.equal(undoMgr.getRedoStackSize(), 0)
  })

  it('Test UndoManager.getNextUndoCommandText() function', function () {
    assert.equal(undoMgr.getNextUndoCommandText(), '')

    undoMgr.addCommandToHistory(new MockCommand('First'))
    undoMgr.addCommandToHistory(new MockCommand('Second'))
    undoMgr.addCommandToHistory(new MockCommand('Third'))

    assert.equal(undoMgr.getNextUndoCommandText(), 'Third')

    undoMgr.undo()
    assert.equal(undoMgr.getNextUndoCommandText(), 'Second')

    undoMgr.undo()
    assert.equal(undoMgr.getNextUndoCommandText(), 'First')

    undoMgr.undo()
    assert.equal(undoMgr.getNextUndoCommandText(), '')

    undoMgr.redo()
    assert.equal(undoMgr.getNextUndoCommandText(), 'First')

    undoMgr.redo()
    assert.equal(undoMgr.getNextUndoCommandText(), 'Second')

    undoMgr.redo()
    assert.equal(undoMgr.getNextUndoCommandText(), 'Third')

    undoMgr.redo()
    assert.equal(undoMgr.getNextUndoCommandText(), 'Third')
  })

  it('Test UndoManager.getNextRedoCommandText() function', function () {
    assert.equal(undoMgr.getNextRedoCommandText(), '')

    undoMgr.addCommandToHistory(new MockCommand('First'))
    undoMgr.addCommandToHistory(new MockCommand('Second'))
    undoMgr.addCommandToHistory(new MockCommand('Third'))

    assert.equal(undoMgr.getNextRedoCommandText(), '')

    undoMgr.undo()
    assert.equal(undoMgr.getNextRedoCommandText(), 'Third')

    undoMgr.undo()
    assert.equal(undoMgr.getNextRedoCommandText(), 'Second')

    undoMgr.undo()
    assert.equal(undoMgr.getNextRedoCommandText(), 'First')

    undoMgr.redo()
    assert.equal(undoMgr.getNextRedoCommandText(), 'Second')

    undoMgr.redo()
    assert.equal(undoMgr.getNextRedoCommandText(), 'Third')

    undoMgr.redo()
    assert.equal(undoMgr.getNextRedoCommandText(), '')
  })

  it('Test UndoManager.undo() and redo() functions: a snapshot step to the number of applied commands', function () {
    const steps = []
    undoMgr.snapshots = { step: (count) => steps.push(count), baseline () {} }
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.addCommandToHistory(new MockCommand())
    undoMgr.addCommandToHistory(new MockCommand())

    undoMgr.undo()
    undoMgr.redo()
    undoMgr.undo()
    undoMgr.undo()
    undoMgr.undo()
    undoMgr.undo() // nothing left to undo
    undoMgr.redo()
    undoMgr.redo()
    undoMgr.redo()
    undoMgr.redo() // nothing left to redo
    assert.deepEqual(steps, [2, 3, 2, 1, 0, 1, 2, 3])
  })

  it('Test UndoManager: a domless command runs itself instead of a snapshot step', function () {
    const steps = []
    undoMgr.snapshots = { step: (count) => steps.push(count), baseline () {} }
    const calls = []
    const cmd = new MockCommand()
    cmd.domless = true
    cmd.apply = () => calls.push('apply')
    cmd.unapply = () => calls.push('unapply')
    undoMgr.addCommandToHistory(cmd)
    undoMgr.undo()
    undoMgr.redo()
    assert.deepEqual(calls, ['unapply', 'apply'])
    assert.deepEqual(steps, [])
  })

  it('Test the element commands: a label and the element they are about', function () {
    const move = new history.MoveElementCommand(div3, div1, divparent)
    assert.equal(move.getText(), 'Move DIV')
    assert.deepEqual(move.elements(), [div3])
    assert.equal(new history.MoveElementCommand(div3, div1, divparent, 'the top').getText(), 'Move DIV to the top')

    const insert = new history.InsertElementCommand(div3)
    assert.equal(insert.getText(), 'Create DIV')
    assert.deepEqual(insert.elements(), [div3])
    assert.equal(new history.InsertElementCommand(div3, 'Draw').getText(), 'Draw')

    const remove = new history.RemoveElementCommand(div3, div1, divparent)
    assert.equal(remove.getText(), 'Delete DIV')
    assert.deepEqual(remove.elements(), [div3])

    const change = new history.ChangeElementCommand(div3, { a: '1' })
    assert.equal(change.getText(), 'Change DIV')
    assert.deepEqual(change.oldValues, { a: '1' })
    assert.equal(new history.ChangeElementCommand(div3, { a: '1' }, 'Fill').getText(), 'Change DIV Fill')
  })

  it('Test BatchCommand', function () {
    let concatResult = ''
    MockCommand.prototype.apply = function () { concatResult += this.text }

    const batch = new history.BatchCommand()
    assert.ok(batch.unapply)
    assert.ok(batch.apply)
    assert.ok(batch.addSubCommand)
    assert.ok(batch.isEmpty)
    assert.equal(typeof batch.unapply, 'function')
    assert.equal(typeof batch.apply, 'function')
    assert.equal(typeof batch.addSubCommand, 'function')
    assert.equal(typeof batch.isEmpty, 'function')

    assert.ok(batch.isEmpty())

    batch.addSubCommand(new MockCommand('a'))
    assert.ok(!batch.isEmpty())
    batch.addSubCommand(new MockCommand('b'))
    batch.addSubCommand(new MockCommand('c'))

    assert.ok(!concatResult)
    batch.apply()
    assert.equal(concatResult, 'abc')

    MockCommand.prototype.apply = function () { /* empty fn */ }
    MockCommand.prototype.unapply = function () { concatResult += this.text }
    concatResult = ''
    assert.ok(!concatResult)
    batch.unapply()
    assert.equal(concatResult, 'cba')

    MockCommand.prototype.unapply = function () { /* empty fn */ }
  })

  it('Test BatchCommand with elements() method', function () {
    const batch = new history.BatchCommand('test batch with elements')

    // Create some mock commands that reference elements
    class MockElementCommand {
      constructor (elem) { this.elem = elem }
      elements () { return [this.elem] }
      apply () { /* empty fn */ }
      unapply () { /* empty fn */ }
      getText () { return 'mock' }
    }

    const elem1 = document.createElementNS(NS.SVG, 'rect')
    const cmd1 = new MockElementCommand(elem1)
    batch.addSubCommand(cmd1)

    const elems = batch.elements()
    assert.ok(Array.isArray(elems))
  })

  it('Test BatchCommand getText()', function () {
    const batch = new history.BatchCommand('my test batch')
    assert.equal(batch.getText(), 'my test batch')
  })
})
