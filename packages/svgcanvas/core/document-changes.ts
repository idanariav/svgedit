/**
 * The announcer of changes to the drawing: raises `documentChanged` when, and only when, the drawing the DOM shows differs
 * from the one last announced (roadmap R8).
 *
 * The history's model snapshots make that exact: the model of the shown drawing is a new object when something differs and
 * the same one otherwise (`share` in `snapshot-history.ts`). So the check is an identity comparison, made after every undo
 * step that lands, every undo / redo, and every `changed` call (coalesced to one per task), which catches the edits that
 * reach the DOM outside the history too. A step that changed nothing, or a `changed` call after a drag that went nowhere,
 * announces nothing; an edit whose code forgot to call `changed` is still announced by its step.
 *
 * The announcement names the elements that differ (`model/diff.ts`), so a feature that derives data from other elements
 * (connectors, blends, mirrors…) re-derives on it, and leaves an undo / redo (`cause: 'history'`) alone: the snapshot
 * brought its data back. Hosts mark a drawing dirty on it; `changed` keeps meaning "refresh what shows the selection".
 */
import type { ModelElement } from './model/node.ts'

/** What made the drawing differ: a step landed, an undo / redo, or an edit announced by `changed` outside a step. */
export type DocumentChangeCause = 'step' | 'history' | 'edit'

export interface DocumentChangedDetail {
  cause: DocumentChangeCause
  /**
   * The elements that differ from the drawing last announced: changed, added, or that lost a child, outermost first (the
   * content root when the layers changed). Empty for a first announcement, with nothing to compare against.
   */
  elems: Element[]
}

/** What the announcer needs from the canvas (a narrow slice, so a unit test can stand in for it). */
export interface DocumentChangesTarget {
  /** A transaction is open: its commit lands the step, and is checked then. (Optional: a partial canvas has none open.) */
  inTransaction?(): boolean
  /** A press is down: a gesture in progress is not a change until it ends. (Optional: a partial canvas has no presses.) */
  getStarted?(): boolean
  call(ev: 'documentChanged', detail: DocumentChangedDetail): unknown
  logDebugEvent?(event: string, detail: Record<string, unknown>): void
}

/** What the announcer needs from the history (a narrow slice of `SnapshotHistory`). */
export interface DocumentChangesHistory {
  readonly previewing: boolean
  revision(): ModelElement | undefined
  changedSince(prev: ModelElement, shown: ModelElement): Element[]
}

export interface DocumentChanges {
  /** Compare the shown drawing with the one last announced, and announce it if it differs. */
  check(cause: DocumentChangeCause): void
  /** `check('edit')` once the current task is done (a burst of `changed` calls is one check). */
  schedule(): void
  /** A new drawing was loaded (the undo stack was reset): it is the new reference, and nothing is announced. */
  reset(): void
}

export const createDocumentChanges = (target: DocumentChangesTarget, history: DocumentChangesHistory): DocumentChanges => {
  let announced: ModelElement | undefined
  let scheduled = false

  const busy = (): boolean => Boolean(target.inTransaction?.() || history.previewing || target.getStarted?.())

  const check = (cause: DocumentChangeCause): void => {
    if (busy()) return
    const shown = history.revision()
    if (!shown || shown === announced) return
    const prev = announced
    announced = shown
    // With nothing to compare against yet (no reset since the canvas was made), the drawing as it is becomes the reference;
    // but a step that landed changed it, whatever it was before.
    if (!prev && cause !== 'step') return
    const elems = prev ? history.changedSince(prev, shown) : []
    target.logDebugEvent?.('document-changed', { cause, elems: elems.length })
    target.call('documentChanged', { cause, elems })
    // What the handlers wrote (a feature re-deriving its data from what changed) is part of this change, not the next one:
    // it lands in the state just announced, as any write after a step does (the snapshot history's rule 1).
    announced = history.revision() ?? shown
  }

  return {
    check,
    schedule () {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        check('edit')
      })
    },
    reset () {
      announced = history.revision()
    }
  }
}
