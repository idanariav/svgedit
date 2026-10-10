/* eslint-disable no-console */
/**
 * For command history tracking and undo functionality.
 * @module history
 * @license MIT
 * @copyright 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { getHref, setHref, getRotationAngle, getTextWithNewlines, setMultilineText } from './dom-utils.js'
import { getBBox } from './bbox-utils.js'
import { getTransformList, transformListToTransform, transformPoint } from './math.js'

// Attributes that affect an element's bounding box. Only these require
// recalculating the rotation center when changed.
export const BBOX_AFFECTING_ATTRS = new Set([
  'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'd', 'points'
])

/**
* Relocate rotation center after a bbox-affecting attribute change.
* Uses the transform list API to update only the rotation entry,
* preserving compound transforms (translate, scale, etc.).
* @param {Element} elem - SVG element
* @param {string[]} changedAttrs - attribute names that were changed
*/
function relocateRotationCenter (elem, changedAttrs) {
  const hasBboxChange = changedAttrs.some(attr => BBOX_AFFECTING_ATTRS.has(attr))
  if (!hasBboxChange) return

  const angle = getRotationAngle(elem)
  if (!angle) return

  const tlist = getTransformList(elem)
  let n = tlist.numberOfItems
  while (n--) {
    const xform = tlist.getItem(n)
    if (xform.type === 4) { // SVG_TRANSFORM_ROTATE
      // Compute bbox BEFORE removing the rotation so we can bail out
      // safely if getBBox returns nothing (avoids losing the rotation).
      const box = getBBox(elem)
      if (!box) return

      tlist.removeItem(n)

      // Transform bbox center through only post-rotation transforms.
      // After removeItem(n), what was at n+1 is now at n.
      let centerMatrix
      if (n < tlist.numberOfItems) {
        centerMatrix = transformListToTransform(tlist, n, tlist.numberOfItems - 1).matrix
      } else {
        centerMatrix = elem.ownerSVGElement.createSVGMatrix() // identity
      }
      const center = transformPoint(
        box.x + box.width / 2, box.y + box.height / 2, centerMatrix
      )

      const newrot = elem.ownerSVGElement.createSVGTransform()
      newrot.setRotate(angle, center.x, center.y)
      tlist.insertItemBefore(newrot, n)
      break
    }
  }
}

/**
* Group: Undo/Redo history management.
*/
export const HistoryEventTypes = {
  BEFORE_APPLY: 'before_apply',
  AFTER_APPLY: 'after_apply',
  BEFORE_UNAPPLY: 'before_unapply',
  AFTER_UNAPPLY: 'after_unapply'
}

/**
* Base class for commands.
*/
export class Command {
  /**
  * @returns {string}
  */
  getText () {
    return this.text
  }

  /**
   * @param {module:history.HistoryEventHandler} handler
   * @param {callback} applyFunction
   * @returns {void}
  */
  apply (handler, applyFunction) {
    handler && handler.handleHistoryEvent(HistoryEventTypes.BEFORE_APPLY, this)
    applyFunction(handler)
    handler && handler.handleHistoryEvent(HistoryEventTypes.AFTER_APPLY, this)
  }

  /**
   * @param {module:history.HistoryEventHandler} handler
   * @param {callback} unapplyFunction
   * @returns {void}
  */
  unapply (handler, unapplyFunction) {
    handler && handler.handleHistoryEvent(HistoryEventTypes.BEFORE_UNAPPLY, this)
    unapplyFunction()
    handler && handler.handleHistoryEvent(HistoryEventTypes.AFTER_UNAPPLY, this)
  }

  /**
   * @returns {Element[]} Array with element associated with this command
   * This function needs to be surcharged if multiple elements are returned.
  */
  elements () {
    return [this.elem]
  }

  /**
    * @returns {string} String with element associated with this command
  */
  type () {
    return this.constructor.name
  }
}

// Todo: Figure out why the interface members aren't showing
//   up (with or without modules applied), despite our apparently following
//   http://usejsdoc.org/tags-interface.html#virtual-comments

/**
 * An interface that all command objects must implement.
 * @interface module:history.HistoryCommand
*/
/**
 * Applies.
 *
 * @function module:history.HistoryCommand#apply
 * @param {module:history.HistoryEventHandler} handler
 * @fires module:history~Command#event:history
 * @returns {void|true}
 */
/**
 *
 * Unapplies.
 * @function module:history.HistoryCommand#unapply
 * @param {module:history.HistoryEventHandler} handler
 * @fires module:history~Command#event:history
 * @returns {void|true}
 */
/**
 * Returns the elements.
 * @function module:history.HistoryCommand#elements
 * @returns {Element[]}
 */
/**
 * Gets the text.
 * @function module:history.HistoryCommand#getText
 * @returns {string}
 */
/**
 * Gives the type.
 * @function module:history.HistoryCommand.type
 * @returns {string}
 */

/**
 * @event module:history~Command#event:history
 * @type {module:history.HistoryCommand}
 */

/**
 * An interface for objects that will handle history events.
 * @interface module:history.HistoryEventHandler
 */
/**
 *
 * @function module:history.HistoryEventHandler#handleHistoryEvent
 * @param {string} eventType One of the HistoryEvent types
 * @param {module:history~Command#event:history} command
 * @listens module:history~Command#event:history
 * @returns {void}
 *
 */

/**
 * History command for an element that had its DOM position changed.
 * @implements {module:history.HistoryCommand}
*/
export class MoveElementCommand extends Command {
  /**
  * @param {Element} elem - The DOM element that was moved
  * @param {Element} oldNextSibling - The element's next sibling before it was moved
  * @param {Element} oldParent - The element's parent before it was moved
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (elem, oldNextSibling, oldParent, text) {
    super()
    this.elem = elem
    this.text = text ? `Move ${elem.tagName} to ${text}` : `Move ${elem.tagName}`
    this.oldNextSibling = oldNextSibling
    this.oldParent = oldParent
    this.newNextSibling = elem.nextSibling
    this.newParent = elem.parentNode
  }

  /**
   * Re-positions the element.
   * @param {module:history.HistoryEventHandler} handler
   * @fires module:history~Command#event:history
   * @returns {void}
  */
  apply (handler) {
    super.apply(handler, () => {
      const reference =
        this.newNextSibling && this.newNextSibling.parentNode === this.newParent
          ? this.newNextSibling
          : null
      this.elem = this.newParent.insertBefore(this.elem, reference)
    })
  }

  /**
   * Positions the element back to its original location.
   * @param {module:history.HistoryEventHandler} handler
   * @fires module:history~Command#event:history
   * @returns {void}
  */
  unapply (handler) {
    super.unapply(handler, () => {
      const reference =
        this.oldNextSibling && this.oldNextSibling.parentNode === this.oldParent
          ? this.oldNextSibling
          : null
      this.elem = this.oldParent.insertBefore(this.elem, reference)
    })
  }
}

/**
* History command for an element that was added to the DOM.
* @implements {module:history.HistoryCommand}
*/
export class InsertElementCommand extends Command {
  /**
   * @param {Element} elem - The newly added DOM element
   * @param {string} text - An optional string visible to user related to this change
  */
  constructor (elem, text) {
    super()
    this.elem = elem
    this.text = text || `Create ${elem.tagName}`
    this.parent = elem.parentNode
    this.nextSibling = this.elem.nextSibling
  }

  /**
  * Re-inserts the new element.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  apply (handler) {
    super.apply(handler, () => {
      const reference =
        this.nextSibling && this.nextSibling.parentNode === this.parent
          ? this.nextSibling
          : null
      this.elem = this.parent.insertBefore(this.elem, reference)
    })
  }

  /**
  * Removes the element.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  unapply (handler) {
    super.unapply(handler, () => {
      this.parent = this.elem.parentNode
      this.elem.remove()
    })
  }
}

/**
* History command for an element removed from the DOM.
* @implements {module:history.HistoryCommand}
*/
export class RemoveElementCommand extends Command {
  /**
  * @param {Element} elem - The removed DOM element
  * @param {Node} oldNextSibling - The DOM element's nextSibling when it was in the DOM
  * @param {Element} oldParent - The DOM element's parent
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (elem, oldNextSibling, oldParent, text) {
    super()
    this.elem = elem
    this.text = text || `Delete ${elem.tagName}`
    this.nextSibling = oldNextSibling
    this.parent = oldParent
  }

  /**
  * Re-removes the new element.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  apply (handler) {
    super.apply(handler, () => {
      this.parent = this.elem.parentNode
      this.elem.remove()
    })
  }

  /**
  * Re-adds the new element.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  unapply (handler) {
    super.unapply(handler, () => {
      const reference =
        this.nextSibling && this.nextSibling.parentNode === this.parent
          ? this.nextSibling
          : null
      this.parent.insertBefore(this.elem, reference) // Don't use `before` or `prepend` as `reference` may be `null`
    })
  }
}

/**
* @typedef {"#text"|"#href"|string} module:history.CommandAttributeName
*/
/**
* @typedef {PlainObject<module:history.CommandAttributeName, string>} module:history.CommandAttributes
*/

/**
* History command to make a change to an element.
* Usually an attribute change, but can also be textcontent.
* @implements {module:history.HistoryCommand}
*/
export class ChangeElementCommand extends Command {
  /**
  * @param {Element} elem - The DOM element that was changed
  * @param {module:history.CommandAttributes} attrs - Attributes to be changed with the values they had *before* the change
  * @param {string} [text] - An optional string visible to user related to this change
   */
  constructor (elem, attrs, text) {
    super()
    this.elem = elem
    this.text = text ? `Change ${elem.tagName} ${text}` : `Change ${elem.tagName}`
    this.newValues = {}
    this.oldValues = attrs
    for (const attr in attrs) {
      if (attr === '#text') {
        this.newValues[attr] = (elem) ? getTextWithNewlines(elem) : ''
      } else if (attr === '#href') {
        this.newValues[attr] = getHref(elem)
      } else {
        this.newValues[attr] = elem.getAttribute(attr)
      }
    }
  }

  /**
  * Performs the stored change action.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  apply (handler) {
    super.apply(handler, () => {
      let bChangedTransform = false
      Object.entries(this.newValues).forEach(([attr, value]) => {
        const isNullishOrEmpty = value === null || value === undefined || value === ''
        if (attr === '#text') {
          setMultilineText(this.elem, value)
        } else if (attr === '#href') {
          if (isNullishOrEmpty) {
            this.elem.removeAttribute('href')
            this.elem.removeAttributeNS(NS.XLINK, 'href')
          } else {
            setHref(this.elem, String(value))
          }
        } else if (isNullishOrEmpty) {
          this.elem.setAttribute(attr, '')
          this.elem.removeAttribute(attr)
        } else {
          this.elem.setAttribute(attr, value)
        }

        if (attr === 'transform') { bChangedTransform = true }
      })

      // relocate rotational transform, if necessary
      if (!bChangedTransform) {
        relocateRotationCenter(this.elem, Object.keys(this.newValues))
      }
    })
  }

  /**
  * Reverses the stored change action.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  unapply (handler) {
    super.unapply(handler, () => {
      let bChangedTransform = false
      Object.entries(this.oldValues).forEach(([attr, value]) => {
        const isNullishOrEmpty = value === null || value === undefined || value === ''
        if (attr === '#text') {
          setMultilineText(this.elem, value)
        } else if (attr === '#href') {
          if (isNullishOrEmpty) {
            this.elem.removeAttribute('href')
            this.elem.removeAttributeNS(NS.XLINK, 'href')
          } else {
            setHref(this.elem, String(value))
          }
        } else if (isNullishOrEmpty) {
          this.elem.removeAttribute(attr)
        } else {
          this.elem.setAttribute(attr, value)
        }
        if (attr === 'transform') { bChangedTransform = true }
      })
      // relocate rotational transform, if necessary
      if (!bChangedTransform) {
        relocateRotationCenter(this.elem, Object.keys(this.oldValues))
      }
    })
  }
}

// TODO: create a 'typing' command object that tracks changes in text
// if a new Typing command is created and the top command on the stack is also a Typing
// and they both affect the same element, then collapse the two commands into one

/**
* History command that can contain/execute multiple other commands.
* @implements {module:history.HistoryCommand}
*/
export class BatchCommand extends Command {
  /**
  * @param {string} [text] - An optional string visible to user related to this change
  */
  constructor (text) {
    super()
    this.text = text || 'Batch Command'
    this.stack = []
  }

  /**
  * Runs "apply" on all subcommands. A BatchCommand is just a container: its
  * own `type()` ('BatchCommand') never matches any of the type-specific
  * branches in undo.js's `handleHistoryEvent` (ChangeElementCommand,
  * MoveElementCommand, InsertElementCommand, RemoveElementCommand), so
  * routing it through `Command.apply`'s handler notification (like a real
  * leaf command) fires `handleHistoryEvent` an extra, redundant time for
  * every batch on top of the once-per-subcommand notifications the leaf
  * commands already fire. That extra firing does nothing useful — it only
  * re-clears the selection, re-dispatches `changed`, and re-evaluates
  * undo.js's pathedit refresh/clear check against whatever mode the
  * subcommands just left the canvas in, which can spuriously kick the user
  * out of path-edit mode a second time after the subcommands already
  * settled it correctly. So subcommands are still applied *with* the real
  * handler (each needs its own notification for its own side effects) —
  * only the wrapping batch's own notification is skipped.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  apply (handler) {
    this.runBatched(handler, () => {
      this.stack.forEach((stackItem) => {
        console.assert(stackItem, 'stack item should not be null')
        stackItem && stackItem.apply(handler)
      })
    })
  }

  /**
  * Runs "unapply" on all subcommands. See `apply()` above for why this
  * does not also notify the handler for the batch itself.
  * @param {module:history.HistoryEventHandler} handler
  * @fires module:history~Command#event:history
  * @returns {void}
  */
  unapply (handler) {
    this.runBatched(handler, () => {
      [...this.stack].reverse().forEach((stackItem) => {
        console.assert(stackItem, 'stack item should not be null')
        stackItem && stackItem.unapply(handler)
      })
    })
  }

  /**
   * Brackets `fn` with the handler's optional `beginBatch()`/`endBatch()` so it
   * can coalesce the expensive, global notifications (clear selection, the
   * `changed` event) into ONE per batch instead of one per subcommand. Before
   * this, undoing a 5,000-element move cost ~12 s, almost all of it 5,000
   * `changed` dispatches. Handlers without the hooks behave as before.
   * @param {module:history.HistoryEventHandler} handler
   * @param {function(): void} fn
   * @returns {void}
   */
  runBatched (handler, fn) {
    handler?.beginBatch?.()
    try {
      fn()
    } finally {
      handler?.endBatch?.()
    }
  }

  /**
  * Iterate through all our subcommands.
  * @returns {Element[]} All the elements we are changing
  */
  elements () {
    const elems = []
    let cmd = this.stack.length
    while (cmd--) {
      if (!this.stack[cmd]) continue
      const thisElems = this.stack[cmd].elements()
      let elem = thisElems.length
      while (elem--) {
        if (!elems.includes(thisElems[elem])) { elems.push(thisElems[elem]) }
      }
    }
    return elems
  }

  /**
  * Adds a given command to the history stack.
  * @param {Command} cmd - The undo command object to add
  * @returns {void}
  */
  addSubCommand (cmd) {
    console.assert(cmd !== null, 'cmd should not be null')
    this.stack.push(cmd)
  }

  /**
  * @returns {boolean} Indicates whether or not the batch command is empty
  */
  isEmpty () {
    return !this.stack.length
  }
}

/**
 * @typedef {object} ChildListChange
 * @property {Node} parent
 * @property {Node[]} before - `parent.childNodes` before the change
 * @property {Node[]} after - `parent.childNodes` after the change
 */

/**
 * Marker for nodes that live inside `#svgcontent` without being document
 * content (previews, overlays). Transactions never record them or their
 * subtrees, and structural undo/redo leaves them where they are.
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

const sameNodes = (a, b) => a.length === b.length && a.every((n, i) => n === b[i])

/**
 * Sets every change's parent to its `before` or `after` child list.
 * Two phases so that moving a node *between* parents (or re-nesting groups)
 * can't hit a transient "insert an ancestor into its descendant" error: first
 * detach whatever a parent shouldn't hold, then fill each parent in order.
 * Parents that already hold the target children are left alone, so undoing a
 * single insert in a 5,000-child layer doesn't re-attach all 5,000.
 * @param {ChildListChange[]} changes
 * @param {'before'|'after'} key
 * @returns {void}
 */
const setChildLists = (changes, key) => {
  for (const change of changes) {
    const keep = new Set(change[key])
    for (const child of [...change.parent.childNodes]) {
      if (!keep.has(child) && !isEphemeral(child)) child.parentNode.removeChild(child)
    }
  }
  for (const change of changes) {
    const kids = Array.from(change.parent.childNodes)
    if (!sameNodes(kids.filter((n) => !isEphemeral(n)), change[key])) {
      /** @type {Element} */ (change.parent).replaceChildren(...change[key], ...kids.filter(isEphemeral))
    }
  }
}

/**
 * History command for a structural change to one or more parents' child
 * lists (insert, remove, reorder, move between parents), stored as the full
 * before/after child lists. Produced by `transaction.js`, which reconstructs
 * the lists from MutationObserver records; hand-written code should keep
 * using Insert/Remove/MoveElementCommand.
 * @implements {module:history.HistoryCommand}
 */
export class ChildListCommand extends Command {
  /**
   * @param {ChildListChange[]} changes
   * @param {string} [text]
   */
  constructor (changes, text) {
    super()
    this.changes = changes
    this.text = text || 'Change structure'
    const before = new Set(changes.flatMap((c) => c.before))
    const after = new Set(changes.flatMap((c) => c.after))
    // Nodes that enter / leave the drawing altogether (moves between parents
    // are in both sets and so are neither).
    this.entering = [...after].filter((n) => !before.has(n))
    this.leaving = [...before].filter((n) => !after.has(n))
  }

  /**
   * @param {module:history.HistoryEventHandler} handler
   * @returns {void}
   */
  apply (handler) {
    super.apply(handler, () => setChildLists(this.changes, 'after'))
  }

  /**
   * @param {module:history.HistoryEventHandler} handler
   * @returns {void}
   */
  unapply (handler) {
    super.unapply(handler, () => setChildLists(this.changes, 'before'))
  }

  /**
   * Elements attached to the drawing by applying (`isApply`) or unapplying.
   * @param {boolean} isApply
   * @returns {Element[]}
   */
  attachedElements (isApply) {
    return (isApply ? this.entering : this.leaving).filter((n) => n.nodeType === 1)
  }

  /**
   * Elements whose membership in a parent changed; a pure reorder reports the
   * parent itself.
   * @returns {Element[]}
   */
  elements () {
    const elems = new Set()
    for (const { parent, before, after } of this.changes) {
      const b = new Set(before)
      const a = new Set(after)
      const moved = [...before.filter((n) => !a.has(n)), ...after.filter((n) => !b.has(n))]
      for (const n of moved) if (n.nodeType === 1) elems.add(n)
      if (!moved.length && parent.nodeType === 1) elems.add(parent)
    }
    return [...elems]
  }
}

/**
 * History command for editing a text node's data in place (typing inside a
 * `<text>`/`<tspan>`/`<title>`). Produced by `transaction.js`.
 * @implements {module:history.HistoryCommand}
 */
export class CharacterDataCommand extends Command {
  /**
   * @param {CharacterData} node
   * @param {string} oldData
   * @param {string} [text]
   */
  constructor (node, oldData, text) {
    super()
    this.node = node
    this.oldData = oldData
    this.newData = node.data
    this.text = text || 'Change text'
  }

  /**
   * @param {module:history.HistoryEventHandler} handler
   * @returns {void}
   */
  apply (handler) {
    super.apply(handler, () => { this.node.data = this.newData })
  }

  /**
   * @param {module:history.HistoryEventHandler} handler
   * @returns {void}
   */
  unapply (handler) {
    super.unapply(handler, () => { this.node.data = this.oldData })
  }

  /**
   * @returns {Element[]} The element owning the text node
   */
  elements () {
    return this.node.parentElement ? [this.node.parentElement] : []
  }
}

/**
*
*/
export class UndoManager {
  /**
  * @param {module:history.HistoryEventHandler} historyEventHandler
  */
  constructor (historyEventHandler) {
    this.handler_ = historyEventHandler || null
    this.undoStackPointer = 0
    this.undoStack = []

    // this is the stack that stores the original values, the elements and
    // the attribute name for begin/finish
    this.undoChangeStackPointer = -1
    this.undoableChangeStack = []
  }

  /**
  * Resets the undo stack, effectively clearing the undo/redo history.
  * @returns {void}
  */
  resetUndoStack () {
    this.undoStack = []
    this.undoStackPointer = 0
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
      cmd.unapply(this.handler_)
    }
  }

  /**
  * Performs a redo step.
  * @returns {void}
  */
  redo () {
    if (this.undoStackPointer < this.undoStack.length && this.undoStack.length > 0) {
      const cmd = this.undoStack[this.undoStackPointer++]
      cmd.apply(this.handler_)
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
