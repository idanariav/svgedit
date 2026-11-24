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
 * Hosts mark a drawing dirty on `documentChanged`; `changed` keeps meaning "refresh what shows the selection".
 */
import type { ModelElement } from './model/node.ts'
import type { SnapshotHistory } from './snapshot-history.ts'

/** What made the drawing differ: a step landed, an undo / redo, or an edit announced by `changed` outside a step. */
export type DocumentChangeCause = 'step' | 'history' | 'edit'

export interface DocumentChangedDetail {
  cause: DocumentChangeCause
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

export interface DocumentChanges {
  /** Compare the shown drawing with the one last announced, and announce it if it differs. */
  check(cause: DocumentChangeCause): void
  /** `check('edit')` once the current task is done (a burst of `changed` calls is one check). */
  schedule(): void
  /** A new drawing was loaded (the undo stack was reset): it is the new reference, and nothing is announced. */
  reset(): void
}

export const createDocumentChanges = (target: DocumentChangesTarget, history: SnapshotHistory): DocumentChanges => {
  let announced: ModelElement | undefined
  let scheduled = false

  const busy = (): boolean => Boolean(target.inTransaction?.() || history.previewing || target.getStarted?.())

  const check = (cause: DocumentChangeCause): void => {
    if (busy()) return
    const shown = history.revision()
    if (!shown || shown === announced) return
    const first = announced === undefined
    announced = shown
    // With nothing to compare against yet (no reset since the canvas was made), the drawing as it is becomes the reference;
    // but a step that landed changed it, whatever it was before.
    if (first && cause !== 'step') return
    target.logDebugEvent?.('document-changed', { cause })
    target.call('documentChanged', { cause })
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
