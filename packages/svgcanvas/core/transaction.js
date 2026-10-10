// @ts-check
/**
 * Undo transactions: `begin → (mutate freely / preview) → commit | cancel`.
 *
 * Everything that changes the drawing between `beginTransaction()` and
 * `commit()` becomes ONE undo step, without hand-building a `BatchCommand`, so
 * "forgot to record the undo" bugs can't happen inside a transaction.
 * `cancel()` puts the drawing (and the selection) back exactly as it was.
 *
 * How it records: **snapshot and diff**. `begin` captures every element's
 * attributes, every text node's data and every parent's child list; `commit`
 * diffs that against the live drawing. (The first design observed the DOM with
 * a MutationObserver. It was dropped: browsers don't report edits made through
 * the SVG list APIs — `elem.transform.baseVal.appendItem(…)`, how the canvas
 * moves things — and edits made to an element while it is *detached*
 * (remove → modify → re-attach) are invisible to an observer too, so undo
 * restored the modified state. Diffing the state has neither hole, needs no
 * async record delivery, and costs nothing while the user drags.) The price is
 * an O(elements) pass at begin and at commit/cancel (≈14 ms and ≈22 ms at
 * 5,000 elements).
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/engine/src/lib.rs` (`Interaction`, `UndoGroup`) and `guard.rs`
 * (roll back on panic), MIT OR Apache-2.0 — rebuilt on the live DOM instead of
 * an immutable document snapshot.
 *
 * Rules worth knowing:
 *  - Transactions nest by depth count; only the outermost one records and
 *    commits. An inner `cancel()` dooms the whole transaction.
 *  - While one is open `undoMgr.addCommandToHistory()` swallows incoming
 *    commands (the diff already covers their mutations), so existing canvas
 *    methods can be called inside a transaction unchanged.
 *  - `undo()`/`redo()` while one is open cancel it first.
 *  - Nodes that are not document content but live inside `#svgcontent` must
 *    carry `data-se-ephemeral`; they (and their subtrees) are never recorded.
 *  - Elements created during the transaction are recorded whole (with their
 *    parent's child list), not attribute by attribute.
 * @module transaction
 * @license MIT
 */

import {
  BatchCommand, ChangeElementCommand, ChildListCommand, CharacterDataCommand, isEphemeral
} from './history.js'
import { getHref } from './dom-utils.js'
import { debug, error, warn } from '../common/logger.js'

const LOG = 'transaction'

/**
 * @typedef {object} Transaction
 * @property {string} label
 * @property {() => ?BatchCommand} commit Push the recorded changes as one undo step (null when nothing net-changed).
 * @property {() => void} cancel Revert the drawing and restore the selection.
 */

/**
 * @typedef {object} Snapshot
 * @property {Map<Element, Map<string, string>>} attrs every element → its attributes
 * @property {Map<CharacterData, string>} text every text/comment node → its data
 * @property {Map<Node, Node[]>} kids every element → its child nodes (ephemeral ones excluded)
 */

/**
 * @typedef {object} Session
 * @property {string} label
 * @property {number} depth
 * @property {boolean} doomed An inner transaction was cancelled.
 * @property {boolean} closed
 * @property {Element[]} selection
 * @property {Snapshot} before
 */

/** Attributes written through native SVG lists; reading one forces the browser to sync it. */
const NATIVE_LIST_ATTRS = ['transform', 'gradientTransform', 'patternTransform']

/**
 * An element's attributes by qualified name. `href` / `xlink:href` collapse
 * into the `#href` pseudo-attribute `ChangeElementCommand` understands.
 * @param {Element} el
 * @returns {Map<string, string>}
 */
const readAttrs = (el) => {
  // Reading an attribute makes the browser write back a pending native-list
  // edit into the attribute; do it before enumerating.
  for (const name of NATIVE_LIST_ATTRS) if (name in el) el.getAttribute(name)
  const out = new Map()
  let hasHref = false
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'href' || a.name === 'xlink:href') hasHref = true
    else out.set(a.name, a.value)
  }
  if (hasHref) out.set('#href', getHref(el))
  return out
}

/**
 * Capture the state a diff needs: attributes, text data and child lists of
 * everything under `root` (inclusive), skipping ephemeral subtrees.
 * @param {Element} root
 * @returns {Snapshot}
 */
const takeSnapshot = (root) => {
  /** @type {Snapshot} */
  const snap = { attrs: new Map(), text: new Map(), kids: new Map() }
  const stack = [root]
  while (stack.length) {
    const el = /** @type {Element} */ (stack.pop())
    snap.attrs.set(el, readAttrs(el))
    const kids = []
    for (const node of Array.from(el.childNodes)) {
      if (isEphemeral(node)) continue
      kids.push(node)
      if (node.nodeType === 1) stack.push(/** @type {Element} */ (node))
      else if (/** @type {CharacterData} */ (node).data !== undefined) snap.text.set(/** @type {CharacterData} */ (node), /** @type {CharacterData} */ (node).data)
    }
    snap.kids.set(el, kids)
  }
  return snap
}

/**
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas
  const undoMgr = svgCanvas.undoMgr
  const rawAddCommand = undoMgr.addCommandToHistory.bind(undoMgr)

  /** @type {?Session} */
  let session = null

  /**
   * Build the single batch for everything that differs from the snapshot taken
   * at begin. Structure first, then attributes, then text: `BatchCommand.unapply`
   * runs in reverse, so attribute values are restored while elements are still
   * attached.
   * @param {boolean} [forCancel] cancel applies the batch with a null handler, so
   *   undo.js's text handler never re-shifts the tspans: keep their own x/y.
   * @returns {BatchCommand}
   */
  const buildBatch = (forCancel = false) => {
    const s = /** @type {Session} */ (session)
    const { attrs, text, kids } = s.before
    const batch = new BatchCommand(s.label)

    // Elements present now that were not at begin ("born"), found by walking
    // the live tree (a node added and removed again is simply not in it).
    /** @type {Element[]} */
    const born = []
    /** @type {Element[]} */
    const stack = [svgCanvas.getSvgContent()]
    while (stack.length) {
      const el = /** @type {Element} */ (stack.pop())
      if (!attrs.has(el)) born.push(el)
      for (const node of Array.from(el.children)) if (!isEphemeral(node)) stack.push(node)
    }

    // --- structure -------------------------------------------------------
    /** @type {import('./history.js').ChildListChange[]} */
    const changes = []
    for (const [parent, before] of kids) {
      const after = Array.from(parent.childNodes).filter((n) => !isEphemeral(n))
      if (before.length !== after.length || before.some((n, i) => n !== after[i])) {
        changes.push({ parent, before, after })
      }
    }
    // A new container that adopted existing nodes (grouping): redo has to put
    // them back into it, after undo pulled them out.
    for (const el of born) {
      const after = Array.from(el.childNodes).filter((n) => !isEphemeral(n))
      if (after.some((n) => attrs.has(/** @type {Element} */ (n)) || text.has(/** @type {CharacterData} */ (n)))) {
        changes.push({ parent: el, before: [], after })
      }
    }
    if (changes.length) batch.addSubCommand(new ChildListCommand(changes, s.label))

    // --- attributes ------------------------------------------------------
    /** @type {Array<[Element, Object<string, ?string>]>} */
    const changed = []
    for (const [elem, was] of attrs) {
      if (isEphemeral(elem)) continue
      const now = readAttrs(elem)
      /** @type {Object<string, ?string>} */
      const old = {}
      for (const name of new Set([...was.keys(), ...now.keys()])) {
        if ((was.get(name) ?? null) !== (now.get(name) ?? null)) old[name] = was.get(name) ?? null
      }
      if (Object.keys(old).length) changed.push([elem, old])
    }
    // A <text>'s undo/redo handler shifts its tspans by the text's own x/y
    // delta (undo.js), so the tspans' recorded x/y would be applied twice.
    for (const [elem, old] of changed) {
      if (forCancel || elem.tagName !== 'text' || !('x' in old || 'y' in old)) continue
      for (const [child, childOld] of changed) {
        if (child.parentNode !== elem) continue
        delete childOld.x
        delete childOld.y
      }
    }
    for (const [elem, old] of changed) {
      if (Object.keys(old).length) batch.addSubCommand(new ChangeElementCommand(elem, old))
    }

    // --- text ------------------------------------------------------------
    for (const [node, oldData] of text) {
      if (node.data !== oldData) batch.addSubCommand(new CharacterDataCommand(node, oldData))
    }
    return batch
  }

  /** @param {Element[]} elems */
  const restoreSelection = (elems) => {
    const live = elems.filter((el) => el.isConnected)
    if (live.length) svgCanvas.selectOnly(live)
    else svgCanvas.clearSelection()
  }

  const end = () => {
    /** @type {Session} */ (session).closed = true
    session = null
  }

  const doCommit = () => {
    const s = /** @type {Session} */ (session)
    let batch = null
    try {
      batch = buildBatch()
    } finally {
      end()
    }
    if (batch.isEmpty()) return null
    rawAddCommand(batch)
    debug(`committed "${s.label}" (${batch.stack.length} sub-commands)`, undefined, LOG)
    return batch
  }

  const doCancel = () => {
    const s = /** @type {Session} */ (session)
    let batch = null
    try {
      batch = buildBatch(true)
    } finally {
      end()
    }
    // A null handler: undo's clearSelection/changed side effects must not
    // fire mid-cancel; we restore the selection and fire `changed` once.
    batch.unapply(null)
    restoreSelection(s.selection)
    svgCanvas.call('changed', batch.elements())
    debug(`cancelled "${s.label}"`, undefined, LOG)
  }

  /**
   * @param {string} label Undo-menu text of the resulting step.
   * @param {{selection?: boolean}} [options] `selection: false` skips capturing/restoring the selection.
   * @returns {Transaction}
   */
  const beginTransaction = (label, options = {}) => {
    if (!session) {
      session = {
        label,
        depth: 0,
        doomed: false,
        closed: false,
        selection: options.selection === false ? [] : svgCanvas.getSelectedElements().filter(Boolean),
        before: takeSnapshot(svgCanvas.getSvgContent())
      }
    }
    const owner = session
    owner.depth++
    let done = false
    return {
      label,
      commit () {
        if (done || owner.closed) return null
        done = true
        if (--owner.depth > 0) return null
        if (owner.doomed) { doCancel(); return null }
        return doCommit()
      },
      cancel () {
        if (done || owner.closed) return
        done = true
        owner.doomed = true
        if (--owner.depth > 0) return
        doCancel()
      }
    }
  }

  /**
   * Run `fn` as one undo step. If it throws the drawing is rolled back and the
   * error rethrown. `fn` must be synchronous.
   * @template T
   * @param {string} label
   * @param {() => T} fn
   * @returns {T}
   */
  const transact = (label, fn) => {
    const tx = beginTransaction(label)
    let result
    try {
      result = fn()
    } catch (err) {
      tx.cancel()
      throw err
    }
    if (result && typeof (/** @type {any} */ (result)).then === 'function') {
      warn(`transact("${label}") callback returned a promise; only its synchronous part is recorded`, undefined, LOG)
    }
    tx.commit()
    return result
  }

  // Existing recording code runs unchanged inside a transaction: its commands
  // are dropped because the observer already holds the same mutations.
  undoMgr.addCommandToHistory = (cmd) => {
    if (session) {
      debug(`dropped "${cmd?.getText?.()}" (recorded by open transaction)`, undefined, LOG)
      return
    }
    rawAddCommand(cmd)
  }

  for (const method of /** @type {const} */ (['undo', 'redo'])) {
    const raw = undoMgr[method].bind(undoMgr)
    undoMgr[method] = () => {
      // A registered tool's gesture owns the session: let it cancel itself so
      // its own state resets and a later mouseup does not "finish" a dead gesture.
      /** @type {any} */ (svgCanvas).cancelToolGesture?.()
      if (session) {
        session.depth = 0
        try { doCancel() } catch (err) { error('failed to cancel transaction before undo/redo', err, LOG) }
      }
      raw()
    }
  }

  // The drawing is being replaced wholesale (clear / setSvgString): nothing
  // left to revert to.
  const rawReset = undoMgr.resetUndoStack.bind(undoMgr)
  undoMgr.resetUndoStack = () => {
    if (session) end()
    rawReset()
  }

  svgCanvas.beginTransaction = beginTransaction
  svgCanvas.transact = transact
  svgCanvas.inTransaction = () => session !== null
}
