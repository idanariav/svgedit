/**
 * @file DebugSnapshotLogger.ts
 *
 * Polls a snapshot function (svgCanvas.getDebugSnapshot()) and forwards it
 * to a host-provided sink whenever it changes, instead of rendering it in a
 * UI panel (see Editor.js's setDebugLogger()). Kept dependency-free so it
 * can be unit-tested without importing the rest of the editor.
 *
 * @license MIT
 */

const POLL_MS = 400

type Entry = { display?: string | null, stale?: boolean }

/** Keep only the entries that show (or should not): the pooled, hidden ones are counted instead. */
const visibleOnly = <T extends Entry>(list: T[]): { list: T[], hidden: number } => {
  const kept = list.filter((e) => e.display === 'inline' || e.stale)
  return { list: kept, hidden: list.length - kept.length }
}

/**
 * The snapshot as logged: the selector and path-grip pools keep every element they ever made (hidden, `display:none`), which
 * made each line several kilobytes and pushed the session out of a size-capped host log within minutes. A hidden entry that
 * is not stale says nothing, so it is counted (`hiddenSelectors`, `hiddenGrips`), and the dimmed siblings of an entered
 * group are a count.
 */
export const compactSnapshot = (snapshot: object): object => {
  const s = snapshot as {
    selection?: { selectors?: Entry[] } & Record<string, unknown>
    pathEditing?: { grips?: Entry[] } & Record<string, unknown>
    groupContext?: { disabledElems?: unknown[] } & Record<string, unknown>
  } & Record<string, unknown>
  const out: Record<string, unknown> = { ...s }
  if (s.selection?.selectors) {
    const { list, hidden } = visibleOnly(s.selection.selectors)
    out.selection = { ...s.selection, selectors: list, ...(hidden ? { hiddenSelectors: hidden } : {}) }
  }
  if (s.pathEditing?.grips) {
    const { list, hidden } = visibleOnly(s.pathEditing.grips)
    out.pathEditing = { ...s.pathEditing, grips: list, ...(hidden ? { hiddenGrips: hidden } : {}) }
  }
  if (s.groupContext?.disabledElems?.length) {
    const { disabledElems, ...rest } = s.groupContext
    out.groupContext = { ...rest, disabledCount: disabledElems.length }
  }
  return out
}

export default class DebugSnapshotLogger {
  _getSnapshot: () => object
  _sink: ((event: string, detail?: object) => void) | null
  _timer: number | null
  _lastJSON: string | null

  /** @param getSnapshot Returns the current debug snapshot. */
  constructor (getSnapshot: () => object) {
    this._getSnapshot = getSnapshot
    this._sink = null
    this._timer = null
    this._lastJSON = null
  }

  /**
 * @param sink Pass
`null`/omit to stop polling.
   */
  start (sink: ((event: string, detail?: object) => void) | null): void {
    this._sink = typeof sink === 'function' ? sink : null
    if (!this._sink) {
      this.stop()
      return
    }
    this._lastJSON = null
    this._poll()
    if (!this._timer) this._timer = setInterval(() => this._poll(), POLL_MS)
  }

  stop (): void {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    this._sink = null
    this._lastJSON = null
  }

  _poll (): void {
    if (!this._sink) return
    let snapshot
    try {
      snapshot = this._getSnapshot()
    } catch (err) {
      return
    }
    const compact = compactSnapshot(snapshot)
    const json = JSON.stringify(compact)
    if (json === this._lastJSON) return
    this._lastJSON = json
    this._sink('debug-snapshot', compact)
  }
}
