/**
 * @file DebugActionStream.js
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
import { redact, describeElement } from '@svgedit/svgcanvas/core/debug-events.js'

/** Findings listed per action; the rest are only counted. */
const MAX_FINDINGS = 5

/**
 * @param {any} svgCanvas
 * @returns {{ok: true}|{ok: false, count: number, findings: object[]}}
 */
const drawingHealth = (svgCanvas) => {
  try {
    const found = svgCanvas.checkDrawing()
    return found.length ? { ok: false, count: found.length, findings: found.slice(0, MAX_FINDINGS) } : { ok: true }
  } catch (err) {
    return { ok: false, count: 1, findings: [{ code: 'check-threw', message: String(err) }] }
  }
}

/**
 * What the drawing is made of, for the start of a log.
 * @param {any} svgCanvas
 * @returns {object}
 */
const describeDrawing = (svgCanvas) => {
  /** @type {Record<string, number>} */
  const tags = {}
  const content = svgCanvas.getSvgContent()
  for (const el of content.querySelectorAll('*')) tags[el.tagName] = (tags[el.tagName] ?? 0) + 1
  return { tags, layers: svgCanvas.getCurrentDrawing?.().getNumLayers?.() }
}

/**
 * Start streaming. `emit` is the sequenced sink every other channel of the log (the state
 * snapshots) should write through, so one numbering covers the whole log.
 * @param {any} editor
 * @param {(event: string, detail?: object) => void} sink the host's `(event, detail)` log
 * @returns {{emit: (event: string, detail?: object) => void, stop: () => void}}
 */
export const attachDebugActionStream = (editor, sink) => {
  const { svgCanvas } = editor
  const t0 = Date.now()
  let seq = 0
  /** @type {(event: string, detail?: object) => void} */
  const emit = (event, detail) => sink(event, { seq: ++seq, t: Date.now() - t0, ...detail })

  svgCanvas.setDebugEventSink(emit)
  const off = editor.commands.onRun((/** @type {import('./commands.js').RunEntry} */ e) => {
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
