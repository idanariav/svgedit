/**
 * The lifecycle every pointer gesture on the canvas shares: a press begins one (and opens its undo transaction), the release
 * commits it, and every other way out rolls it back (roadmap R9, `.claude/plans/r9-gesture-lifecycle.md`).
 *
 * One gesture is active at a time, and its state lives on it (`state`), so nothing of it can outlive it. The ways out are
 * owned here, not by each gesture: Escape, a mode switch, undo / redo, a new press with no release in between (the mouseup
 * happened outside the window), the window losing focus or being hidden, a context menu, a handler throwing and the canvas
 * being destroyed. A gesture's own `onCancel` puts back what the transaction does not (overlays, grips, a tool's fields).
 *
 * Lifted out of the tool registry (`tool-registry.ts`), which runs its tools' gestures on it; the built-in select / resize /
 * rotate / path-edit gestures move onto it step by step.
 * @module gesture-session
 * @license MIT
 */
import type SvgCanvas from '../svgcanvas.ts'
import { error as logError } from '../common/logger.ts'

const LOG = 'gesture-session'

/** Why a gesture ended other than by its release committing it (also written to the debug log). */
export type GestureEndReason =
  | 'escape' | 'mode switch' | 'undo' | 'new press' | 'focus lost' | 'context menu' | 'error' | 'destroy'
  | 'declined' | 'not committed' | 'replaced' | (string & {})

export interface Gesture<S = unknown> {
  /** what kind of gesture (`tool:<id>` for a registered tool) */
  readonly kind: string
  /** the gesture's own state: created with it, dropped with it */
  readonly state: S
  /** it has been committed or cancelled */
  readonly ended: boolean
  /** End it and keep what it did as one undo step. */
  commit(detail?: Record<string, unknown>): void
  /** End it and roll back what it did. */
  cancel(why: GestureEndReason): void
  /** Change the undo-menu text of its step (a resize turns out to be a stretch at its first movement). */
  relabel(label: string): void
  /**
   * Stop it being the active gesture without ending it: the caller commits or cancels it itself afterwards. A release runs
   * code that may switch modes (a finished path goes back to select); detached first, the switch does not cancel it.
   */
  detach(): void
}

export interface GestureBeginOptions<S> {
  /** the gesture's own state */
  state: S
  /** undo-menu text of the step it records (default: the kind) */
  label?: string
  /** the gesture records no transaction of its own (a session that keeps one across gestures, like puppet warp) */
  ownsUndo?: boolean
  /** put back what the transaction does not; runs after the roll-back, also when that throws */
  onCancel?: (why: GestureEndReason) => void
  /** extra fields for the debug log's `begin` entry */
  log?: Record<string, unknown>
}

export interface GestureSessionApi {
  /** The active gesture, or `null` between gestures. */
  activeGesture(): Gesture | null
  /** Begin a gesture; one still active (its release never came) is cancelled first, as a `new press`. */
  beginGesture<S>(kind: string, options: GestureBeginOptions<S>): Gesture<S>
  /** Roll the active gesture back (no-op without one). */
  cancelGesture(why?: GestureEndReason): void
}

const NO_TRANSACTION = { commit: (): unknown => null, cancel: (): void => {}, relabel: (_label: string): void => {} }

export const createGestureSession = (canvas: SvgCanvas): GestureSessionApi => {
  const svgCanvas = canvas
  let active: Gesture | null = null

  const log = (kind: string, phase: 'begin' | 'commit' | 'cancel', detail: Record<string, unknown> = {}): void => {
    svgCanvas.logDebugEvent?.('gesture', { kind, phase, ...detail })
  }

  const beginGesture = <S>(kind: string, options: GestureBeginOptions<S>): Gesture<S> => {
    if (active) cancelGesture('new press')
    const tx = options.ownsUndo ? NO_TRANSACTION : svgCanvas.beginTransaction(options.label ?? kind)
    let ended = false
    const finish = (): boolean => {
      if (ended) return false
      ended = true
      if (active === gesture) active = null
      return true
    }
    const gesture: Gesture<S> = {
      kind,
      state: options.state,
      get ended () { return ended },
      commit (detail) {
        if (!finish()) return
        tx.commit()
        log(kind, 'commit', detail)
      },
      cancel (why) {
        if (!finish()) return
        log(kind, 'cancel', { why })
        try {
          // a live preview (snapshotHistory.preview: the renderer showing the drag) is the gesture's: it goes first
          if (svgCanvas.snapshotHistory?.previewing) svgCanvas.snapshotHistory.cancelPreview()
          tx.cancel()
        } finally {
          try { options.onCancel?.(why) } catch (err) { logError(`cancelling the ${kind} gesture failed`, err, LOG) }
        }
      },
      relabel (label) {
        tx.relabel(label)
      },
      detach () {
        if (active === gesture) active = null
      }
    }
    active = gesture
    log(kind, 'begin', options.log)
    return gesture
  }

  const cancelGesture = (why: GestureEndReason = 'cancelled'): void => {
    active?.cancel(why)
  }

  // The ways out that are not a canvas event: the window losing focus or being hidden (the release will not come: the
  // mouseup lands in another window or app), a context menu (it swallows the release), the canvas being destroyed.
  const signal = svgCanvas.destroyAbort?.signal
  const opts = signal ? { signal } : undefined
  window.addEventListener('blur', () => cancelGesture('focus lost'), opts)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cancelGesture('focus lost') }, opts)
  window.addEventListener('contextmenu', () => cancelGesture('context menu'), opts)
  signal?.addEventListener('abort', () => cancelGesture('destroy'))

  return { activeGesture: () => active, beginGesture, cancelGesture }
}
