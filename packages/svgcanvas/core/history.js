// @ts-check
/**
 * The undo stack and the entries on it.
 *
 * Undo and redo are model snapshots (core/snapshot-history.ts): each entry here records that a step landed and what to
 * call it, and the snapshot taken when it landed is what undo shows again. So the command types carry no old values and
 * do nothing when undone; they exist for their label (`getText()`), for `isEmpty()` (a batch nobody added to is not
 * pushed) and for the debug log (`type()`). A command that changes no element at all (the canvas background is a
 * preference) sets `domless` and brings its own `apply` / `unapply`, which the stack runs instead of a snapshot step.
 * @module history
 * @license MIT
 * @copyright 2010 Jeff Schiller
 */

// Attributes that affect an element's bounding box. Only these require
// recalculating the rotation center when changed.
export const BBOX_AFFECTING_ATTRS = new Set([
  'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'd', 'points',
  // the box of an area text (core/text-rows.js)
  'se:wrap-width', 'se:wrap-height'
])

/**
 * Base class for entries.
 */
export class Command {
  /**
  * @returns {string}
  */
  getText () {
    return /** @type {any} */ (this).text
  }

  /**
   * What a `domless` command does when applied (redo). Entries that are undone by snapshot never run this.
   * @param {any} _handler unused (kept for the callers that pass one)
   * @param {(handler?: any) => void} applyFunction
   * @returns {void}
  */
  apply (_handler, applyFunction) {
    applyFunction?.(null)
  }

  /**
   * What a `domless` command does when undone.
   * @param {any} _handler unused (kept for the callers that pass one)
   * @param {() => void} unapplyFunction
   * @returns {void}
  */
  unapply (_handler, unapplyFunction) {
    unapplyFunction?.()
  }

  /**
   * @returns {Element[]} Array with element associated with this command
   * This function needs to be surcharged if multiple elements are returned.
  */
  elements () {
    const { elem } = /** @type {any} */ (this)
    return elem ? [elem] : []
  }

  /**
    * @returns {string} String with element associated with this command
  */
  type () {
    return this.constructor.name
  }
}

/**
 * An element had its DOM position changed.
*/
export class MoveElementCommand extends Command {
  /**
  * @param {Element} elem - The DOM element that was moved
  * @param {Node|null} _oldNextSibling - unused: the snapshot knows where it was
  * @param {Node|null} _oldParent - unused
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (elem, _oldNextSibling, _oldParent, text) {
    super()
    this.elem = elem
    this.text = text ? `Move ${elem.tagName} to ${text}` : `Move ${elem.tagName}`
  }
}

/**
 * An element was inserted.
*/
export class InsertElementCommand extends Command {
  /**
  * @param {Element} elem - The new element
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (elem, text) {
    super()
    this.elem = elem
    this.text = text || `Create ${elem.tagName}`
  }
}

/**
 * An element was removed.
*/
export class RemoveElementCommand extends Command {
  /**
  * @param {Element} elem - The removed element
  * @param {Node|null} _oldNextSibling - unused
  * @param {Node|null} _oldParent - unused
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (elem, _oldNextSibling, _oldParent, text) {
    super()
    this.elem = elem
    this.text = text || `Delete ${elem.tagName}`
  }
}

/**
 * An element had attributes (or its text) changed.
*/
export class ChangeElementCommand extends Command {
  /**
  * @param {Element} elem - The DOM element that was changed
  * @param {Record<string, any>} attrs - The attributes that changed, with the values they had before (informational)
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (elem, attrs, text) {
    super()
    this.elem = elem
    this.text = text ? `Change ${elem.tagName} ${text}` : `Change ${elem.tagName}`
    this.oldValues = attrs
  }
}

/**
 * Several entries that are one step.
*/
export class BatchCommand extends Command {
  /**
  * @param {string} [text] - An optional string visible to user related to this batch
  */
  constructor (text) {
    super()
    this.text = text || 'Batch Command'
    this.stack = /** @type {any[]} */ ([])
  }

  /**
   * Run by a `domless` batch only.
   * @param {any} handler
   */
  apply (handler) {
    this.stack.forEach((stackItem) => stackItem && stackItem.apply(handler))
  }

  /**
   * Run by a `domless` batch only.
   * @param {any} handler
   */
  unapply (handler) {
    [...this.stack].reverse().forEach((stackItem) => stackItem && stackItem.unapply(handler))
  }

  /**
   * @returns {Element[]} The elements of every entry, without repeats
   */
  elements () {
    const elems = /** @type {Element[]} */ ([])
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!this.stack[i]) continue
      for (const el of this.stack[i].elements()) if (!elems.includes(el)) elems.push(el)
    }
    return elems
  }

  /**
   * @param {any} cmd - The entry to add
   * @returns {void}
   */
  addSubCommand (cmd) {
    console.assert(cmd !== null, 'cmd should not be null')
    this.stack.push(cmd)
  }

  /**
   * @returns {boolean} Whether nothing was added
   */
  isEmpty () {
    return !this.stack.length
  }
}

/**
 * Marker for nodes that live inside `#svgcontent` without being document
 * content (previews, overlays). A snapshot never holds them or their subtrees,
 * and undo/redo leaves them where they are.
 */
export const EPHEMERAL_ATTR = 'data-se-ephemeral'

/**
 * @param {Node} node
 * @returns {boolean} whether `node` is, or sits inside, an ephemeral element
 */
export const isEphemeral = (node) => {
  const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement
  return Boolean(el?.closest(`[${EPHEMERAL_ATTR}]`))
}

// `Command#type()` reads `constructor.name`, which a minifier renames (the production bundle turned
// `ChangeElementCommand` into `Ao`). Pin the names so the debug log and the source agree.
for (const [name, cls] of [
  ['MoveElementCommand', MoveElementCommand],
  ['InsertElementCommand', InsertElementCommand],
  ['RemoveElementCommand', RemoveElementCommand],
  ['ChangeElementCommand', ChangeElementCommand],
  ['BatchCommand', BatchCommand]
]) {
  Object.defineProperty(cls, 'name', { value: name, configurable: true })
}

/**
*
*/
export class UndoManager {
  constructor () {
    this.undoStackPointer = 0
    this.undoStack = /** @type {any[]} */ ([])
    /** Debug hook: called after every command lands on the stack (see undo.js). @type {?((cmd: any) => void)} */
    this.onPush = null
    /** Called after the stack was cleared (the snapshot history starts again from the drawing as it is). @type {?(() => void)} */
    this.onReset = null
    /** Undo and redo as model snapshots: `step (count)` shows the drawing after `count` commands, see snapshot-history.ts. @type {?import('./snapshot-history.ts').SnapshotHistory} */
    this.snapshots = null

    // this is the stack that stores the original values, the elements
    // and the attribute name for begin/finish
    this.undoChangeStackPointer = -1
    this.undoableChangeStack = /** @type {any[]} */ ([])
  }

  /**
  * Resets the undo stack, effectively clearing the undo/redo history.
  * @returns {void}
  */
  resetUndoStack () {
    this.undoStack = /** @type {any[]} */ ([])
    this.undoStackPointer = 0
    this.onReset?.()
  }

  /**
  * @returns {number} Current size of the undo history stack
  */
  getUndoStackSize () {
    return this.undoStackPointer
  }

  /**
  * @returns {number} Current size of the redo history stack
  */
  getRedoStackSize () {
    return this.undoStack.length - this.undoStackPointer
  }

  /**
  * @returns {string} String associated with the next undo command
  */
  getNextUndoCommandText () {
    return this.undoStackPointer > 0 ? this.undoStack[this.undoStackPointer - 1].getText() : ''
  }

  /**
  * @returns {string} String associated with the next redo command
  */
  getNextRedoCommandText () {
    return this.undoStackPointer < this.undoStack.length ? this.undoStack[this.undoStackPointer].getText() : ''
  }

  /**
  * Performs an undo step.
  * @returns {void}
  */
  undo () {
    if (this.undoStackPointer > 0) {
      const cmd = this.undoStack[--this.undoStackPointer]
      // a command that changes no element (the canvas background is a preference) is not in a snapshot: it runs itself
      if (cmd.domless) cmd.unapply(null)
      else this.snapshots?.step(this.undoStackPointer)
    }
  }

  /**
  * Performs a redo step.
  * @returns {void}
  */
  redo () {
    if (this.undoStackPointer < this.undoStack.length && this.undoStack.length > 0) {
      const cmd = this.undoStack[this.undoStackPointer++]
      if (cmd.domless) cmd.apply(null)
      else this.snapshots?.step(this.undoStackPointer)
    }
  }

  /**
  * Adds a command object to the undo history stack.
  * @param {Command} cmd - The command object to add
  * @returns {void}
  */
  addCommandToHistory (cmd) {
    // TODO: we MUST compress consecutive text changes to the same element
    // (right now each keystroke is saved as a separate command that includes the
    // entire text contents of the text element)
    // TODO: consider limiting the history that we store here (need to do some slicing)

    // if our stack pointer is not at the end, then we have to remove
    // all commands after the pointer and insert the new command
    if (this.undoStackPointer < this.undoStack.length && this.undoStack.length > 0) {
      this.undoStack = this.undoStack.splice(0, this.undoStackPointer)
    }
    this.undoStack.push(cmd)
    this.undoStackPointer = this.undoStack.length
    this.onPush?.(cmd)
  }

  /**
  * This function tells the canvas to remember the old values of the
  * `attrName` attribute for each element sent in.  The elements and values
  * are stored on a stack, so the next call to `finishUndoableChange()` will
  * pop the elements and old values off the stack, gets the current values
  * from the DOM and uses all of these to construct the undo-able command.
  * @param {string} attrName - The name of the attribute being changed
  * @param {Element[]} elems - Array of DOM elements being changed
  * @returns {void}
  */
  beginUndoableChange (attrName, elems) {
    this.snapshots?.baseline()
    const p = ++this.undoChangeStackPointer
    let i = elems.length
    const oldValues = new Array(i); const elements = new Array(i)
    while (i--) {
      const elem = elems[i]
      if (!elem) { continue }
      elements[i] = elem
      oldValues[i] = elem.getAttribute(attrName)
    }
    this.undoableChangeStack[p] = {
      attrName,
      oldValues,
      elements
    }
  }

  /**
  * This function returns a `BatchCommand` object which summarizes the
  * change since `beginUndoableChange` was called.  The command can then
  * be added to the command history.
  * @returns {BatchCommand} Batch command object with resulting changes
  */
  finishUndoableChange () {
    const p = this.undoChangeStackPointer--
    const changeset = this.undoableChangeStack[p]
    const { attrName } = changeset
    const batchCmd = new BatchCommand(`Change ${attrName}`)
    let i = changeset.elements.length
    while (i--) {
      const elem = changeset.elements[i]
      if (!elem) { continue }
      /** @type {Record<string, any>} */
      const changes = {}
      changes[attrName] = changeset.oldValues[i]
      if (changes[attrName] !== elem.getAttribute(attrName)) {
        batchCmd.addSubCommand(new ChangeElementCommand(elem, changes, attrName))
      }
    }
    this.undoableChangeStack[p] = null
    return batchCmd
  }
}
