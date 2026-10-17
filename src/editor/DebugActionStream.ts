/**
 * @file DebugActionStream.ts
 *
 * The debug log's *action* channel. Where `DebugSnapshotLogger` reports what the
 * editor looks like, this reports what was done to it, so a log can be read
 * back (by a person or an LLM) as the user's session:
 *
 *  - `session-start`  once, when the log is switched on: mode, zoom, the drawing's
 *                     shape (elements by tag, layers) and its `checkDrawing` findings
 *  - `action`         every command run (id, params, source, outcome, undo size before / after,
 *                     drawing health after)
 *  - `key`, `pointer-down`, `pointer-up`, `selection`, `set-mode`, `tool-gesture`, `history-push`,
 *    `history-apply` and the path-editing events come from the canvas (`svgCanvas.logDebugEvent`)
 *
 * Every event carries a `seq` (1, 2, 3… per switch-on) and `t` (ms since switch-on) so order survives a host that
 * timestamps coarsely. Content is never recorded: elements are `tag#id`, params and strings
 * are cut by `redact` (see packages/svgcanvas/core/debug-events.js). The vocabulary is documented in
 * `.claude/debug-log.md`.
 *
 * @license MIT
 */
import { redact, describeElement } from '@svgedit/svgcanvas/core/debug-events.ts'

/** Findings listed per action; the rest are only counted. */
const MAX_FINDINGS = 5

const drawingHealth = (svgCanvas: any): { ok: true } | { ok: false, count: number, findings: object[] } => {
  try {
    const found = svgCanvas.checkDrawing()
    return found.length ? { ok: false, count: found.length, findings: found.slice(0, MAX_FINDINGS) } : { ok: true }
  } catch (err) {
    return { ok: false, count: 1, findings: [{ code: 'check-threw', message: String(err) }] }
  }
}

/** What the drawing is made of, for the start of a log. */
const describeDrawing = (svgCanvas: any): object => {
  const tags: Record<string, number> = {}
  const content = svgCanvas.getSvgContent()
  for (const el of content.querySelectorAll('*')) tags[el.tagName] = (tags[el.tagName] ?? 0) + 1
  return { tags, layers: svgCanvas.getCurrentDrawing?.().getNumLayers?.() }
}

/**
 * Start streaming. `emit` is the sequenced sink every other channel of the log (the state
 * snapshots) should write through, so one numbering covers the whole log.
 * @param sink the host's `(event, detail)` log
 */
export const attachDebugActionStream = (editor: EditorInstance, sink: (event: string, detail?: object) => void): { emit: (event: string, detail?: object) => void, stop: () => void } => {
  const { svgCanvas } = editor
  const t0 = Date.now()
  let seq = 0
  const emit: (event: string, detail?: object) => void = (event, detail) => sink(event, { seq: ++seq, t: Date.now() - t0, ...detail })

  svgCanvas.setDebugEventSink(emit)
  const off = editor.commands.onRun((e: import('./commands.ts').RunEntry) => {
    const { undoBefore, undoAfter } = e
    emit('action', {
      command: e.id,
      ...(Object.keys(e.params ?? {}).length ? { params: redact(e.params) } : {}),
      source: e.source,
      ...(e.depth ? { nested: true } : {}),
      outcome: e.outcome,
      ...(e.error ? { error: redact(e.error) } : {}),
      undo: `${undoBefore}->${undoAfter}`,
      ms: e.ms,
      mode: svgCanvas.getMode(),
      selected: svgCanvas.getSelectedElements().filter(Boolean).map(describeElement),
      drawing: drawingHealth(svgCanvas)
    })
  })

  emit('session-start', {
    mode: svgCanvas.getMode(),
    zoom: svgCanvas.getZoom(),
    bytes: svgCanvas.getSvgString().length,
    ...describeDrawing(svgCanvas),
    drawing: drawingHealth(svgCanvas)
  })

  return {
    emit,
    stop: () => {
      off()
      svgCanvas.setDebugEventSink(null)
    }
  }
}
