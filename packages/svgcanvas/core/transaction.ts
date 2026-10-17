// @ts-check
/**
 * Undo transactions: `begin → (mutate freely / preview) → commit | cancel`.
 *
 * Everything that changes the drawing between `beginTransaction()` and `commit()` becomes ONE undo step, without
 * hand-building a `BatchCommand`, so "forgot to record the undo" bugs can't happen inside a transaction. `cancel()` puts the
 * drawing (and the selection) back exactly as it was.
 *
 * How it records: the drawing is a model snapshot (core/snapshot-history.ts). `begin` takes the model of the drawing,
 * `commit` takes it again: the two are the same object when nothing changed (snapshots share what an edit did not touch), so
 * "nothing net-changed" is an identity check, and the step the history keeps is the snapshot. `cancel` makes the DOM show the
 * begin model again (a `reconcile`, so only what changed is touched). This replaces an earlier diff of every element's
 * attributes, text and child lists against a copy taken at begin (a hand-built `BatchCommand` of `ChangeElementCommand`s,
 * ≈14 ms and ≈22 ms at 5,000 elements), and a MutationObserver design before that, dropped because browsers don't report
 * edits made through the SVG list APIs (`elem.transform.baseVal.appendItem(…)`).
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/engine/src/lib.rs` (`Interaction`, `UndoGroup`) and `guard.rs` (roll back on panic), MIT OR Apache-2.0.
 *
 * Rules worth knowing:
 *  - Transactions nest by depth count; only the outermost one records and commits. An inner `cancel()` dooms the whole
 *    transaction.
 *  - While one is open `undoMgr.addCommandToHistory()` swallows incoming commands (the snapshot already covers their
 *    mutations), so existing canvas methods can be called inside a transaction unchanged.
 *  - `undo()`/`redo()` while one is open cancel it first.
 *  - Nodes that are not document content but live inside `#svgcontent` must carry `data-se-ephemeral`; they (and their
 *    subtrees) are never part of a snapshot.
 * @module transaction
 * @license MIT
 */

import { BatchCommand } from './history.js'
import { debug, error, warn } from '../common/logger.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { HistoryCommand } from '../svgcanvas.ts'
import type { ModelElement } from './model/node.ts'

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

interface Session {
  label: string
  depth: number
  /** An inner transaction was cancelled. */
  doomed: boolean
  closed: boolean
  selection: Element[]
  /** the drawing at begin (a model snapshot) */
  before: ModelElement
  onAbort: (() => void) | undefined
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

  /** The history of snapshots (every canvas has one: `createUndo` makes it). */
  const history = () => undoMgr.snapshots as NonNullable<typeof undoMgr.snapshots>

  const doCommit = () => {
    const s = session as Session
    const after = history().current()
    end()
    // The two are the same object when nothing net-changed (snapshots share what an edit did not touch)
    if (after === s.before) return null
    history().stage(after)
    const batch = new BatchCommand(s.label)
    rawAddCommand(batch)
    debug(`committed "${s.label}"`, undefined, LOG)
    return batch
  }

  const doCancel = () => {
    const s = session as Session
    const shown = history().current()
    end()
    if (shown !== s.before) history().show(shown, s.before)
    restoreSelection(s.selection)
    debug(`cancelled "${s.label}"`, undefined, LOG)
  }

  /**
   * @param label Undo-menu text of the resulting step.
   */
  const beginTransaction = (label: string, options: TransactionOptions = {}): Transaction => {
    undoMgr.snapshots?.baseline()
    if (!session) {
      session = {
        label,
        depth: 0,
        doomed: false,
        closed: false,
        onAbort: options.onAbort,
        selection: options.selection === false ? [] : svgCanvas.getSelectedElements().filter(Boolean),
        before: history().current()
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
