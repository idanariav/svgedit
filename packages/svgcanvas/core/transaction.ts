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
import { getHref } from './dom-utils.ts'
import { debug, error, warn } from '../common/logger.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { HistoryCommand } from '../svgcanvas.ts'

const LOG = 'transaction'

/** An open transaction (`beginTransaction`). */
export interface Transaction {
  label: string
  /** Push the recorded changes as one undo step (null when nothing net-changed). */
  commit: () => BatchCommand | null
  /** Revert the drawing and restore the selection. */
  cancel: () => void
}

export interface TransactionOptions {
  /** `false` skips capturing/restoring the selection. */
  selection?: boolean
  /**
   * Called when the transaction is ended *for* its owner, not by it: undo/redo cancelled it (the drawing is already
   * reverted), or the drawing was replaced (`clear`/`setSvgString`). A transaction held across many pointer gestures
   * (a tool session) uses it to drop its own state; it is not called by the owner's own `commit()`/`cancel()`.
   */
  onAbort?: () => void
}

interface Snapshot {
  /** Every element → its attributes. */
  attrs: Map<Element, Map<string, string | null>>
  /** Every text/comment node → its data. */
  text: Map<CharacterData, string>
  /** Every element → its child nodes (ephemeral ones excluded). */
  kids: Map<Node, Node[]>
}

interface Session {
  label: string
  depth: number
  /** An inner transaction was cancelled. */
  doomed: boolean
  closed: boolean
  selection: Element[]
  before: Snapshot
  onAbort: (() => void) | undefined
}

/** Attributes written through native SVG lists; reading one forces the browser to sync it. */
const NATIVE_LIST_ATTRS = ['transform', 'gradientTransform', 'patternTransform']

/**
 * An element's attributes by qualified name. `href` / `xlink:href` collapse
 * into the `#href` pseudo-attribute `ChangeElementCommand` understands.
 */
const readAttrs = (el: Element): Map<string, string | null> => {
  // Reading an attribute makes the browser write back a pending native-list
  // edit into the attribute; do it before enumerating.
  for (const name of NATIVE_LIST_ATTRS) if (name in el) el.getAttribute(name)
  const out = new Map<string, string | null>()
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
 */
const takeSnapshot = (root: Element): Snapshot => {
  const snap: Snapshot = { attrs: new Map(), text: new Map(), kids: new Map() }
  const stack = [root]
  while (stack.length) {
    const el = stack.pop() as Element
    snap.attrs.set(el, readAttrs(el))
    const kids: Node[] = []
    for (const node of Array.from(el.childNodes)) {
      if (isEphemeral(node)) continue
      kids.push(node)
      if (node.nodeType === 1) stack.push((node as Element))
      else if ((node as CharacterData).data !== undefined) snap.text.set((node as CharacterData), (node as CharacterData).data)
    }
    snap.kids.set(el, kids)
  }
  return snap
}

/** The members `transaction.ts` gives its canvas. */
export interface TransactionApi {
  /**
   * Start recording every change to the drawing as ONE undo step (core/transaction.js).
   * Nested calls join the outermost transaction. `commit()` returns the pushed
   * batch, or null when nothing net-changed; `cancel()` restores the drawing and selection.
   */
  beginTransaction(label: string, options?: { selection?: boolean, onAbort?: () => void }): { label: string, commit(): HistoryCommand | null, cancel(): void }
  /** Run `fn` as one undo step; a throw rolls the drawing back and rethrows. `fn` must be synchronous. */
  transact<T>(label: string, fn: () => T): T
  inTransaction(): boolean
}

export const createTransaction = (canvas: SvgCanvas): TransactionApi => {
  const svgCanvas = canvas
  const undoMgr = svgCanvas.undoMgr
  const rawAddCommand = undoMgr.addCommandToHistory.bind(undoMgr)

  let session: Session | null = null

  /**
   * Build the single batch for everything that differs from the snapshot taken
   * at begin. Structure first, then attributes, then text: `BatchCommand.unapply`
   * runs in reverse, so attribute values are restored while elements are still
   * attached.
   * @param forCancel cancel applies the batch with a null handler, so
   *   undo.js's text handler never re-shifts the tspans: keep their own x/y.
   */
  const buildBatch = (forCancel: boolean = false): BatchCommand => {
    const s = session as Session
    const { attrs, text, kids } = s.before
    const batch = new BatchCommand(s.label)

    // Elements present now that were not at begin ("born"), found by walking
    // the live tree (a node added and removed again is simply not in it).
    const born: Element[] = []
    const stack: Element[] = [svgCanvas.getSvgContent()]
    while (stack.length) {
      const el = stack.pop() as Element
      if (!attrs.has(el)) born.push(el)
      for (const node of Array.from(el.children)) if (!isEphemeral(node)) stack.push(node)
    }

    // --- structure -------------------------------------------------------
    const changes: import('./history.js').ChildListChange[] = []
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
      if (after.some((n) => attrs.has((n as Element)) || text.has((n as CharacterData)))) {
        changes.push({ parent: el, before: [], after })
      }
    }
    if (changes.length) batch.addSubCommand(new ChildListCommand(changes, s.label))

    // --- attributes ------------------------------------------------------
    const changed: Array<[Element, { [s: string]: string | null }]> = []
    for (const [elem, was] of attrs) {
      if (isEphemeral(elem)) continue
      const now = readAttrs(elem)
      const old: { [s: string]: string | null } = {}
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
  const restoreSelection = (elems: Element[]) => {
    const live = elems.filter((el) => el.isConnected)
    if (live.length) svgCanvas.selectOnly(live)
    else svgCanvas.clearSelection()
  }

  const end = () => {
    (session as Session).closed = true
    session = null
  }

  /**
   * End the open transaction on its owner's behalf (undo/redo, drawing replaced) and tell it.
   * @param revert Put the drawing back (undo/redo) or leave it (it is being replaced).
   */
  const abort = (revert: boolean) => {
    const { onAbort } = session as Session
    try {
      if (revert) {
        (session as Session).depth = 0
        doCancel()
      } else {
        end()
      }
    } finally {
      try { onAbort?.() } catch (err) { error('transaction onAbort handler failed', err, LOG) }
    }
  }

  const doCommit = () => {
    const s = session as Session
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
    const s = session as Session
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
   * @param label Undo-menu text of the resulting step.
   */
  const beginTransaction = (label: string, options: TransactionOptions = {}): Transaction => {
    if (!session) {
      session = {
        label,
        depth: 0,
        doomed: false,
        closed: false,
        onAbort: options.onAbort,
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
   */
  const transact = <T>(label: string, fn: () => T): T => {
    const tx = beginTransaction(label)
    let result
    try {
      result = fn()
    } catch (err) {
      tx.cancel()
      throw err
    }
    if (result && typeof (result as { then?: unknown }).then === 'function') {
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

  for (const method of (['undo', 'redo'] as const)) {
    const raw = undoMgr[method].bind(undoMgr)
    undoMgr[method] = () => {
      // A registered tool's gesture owns the session: let it cancel itself so
      // its own state resets and a later mouseup does not "finish" a dead gesture.
      svgCanvas.cancelToolGesture?.()
      if (session) {
        try { abort(true) } catch (err) { error('failed to cancel transaction before undo/redo', err, LOG) }
      }
      raw()
    }
  }

  // The drawing is being replaced wholesale (clear / setSvgString): nothing
  // left to revert to.
  const rawReset = undoMgr.resetUndoStack.bind(undoMgr)
  undoMgr.resetUndoStack = () => {
    if (session) abort(false)
    rawReset()
  }

  return {
    beginTransaction,
    transact,
    inTransaction: () => session !== null
  }
}
