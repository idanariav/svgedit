# Debug log — event vocabulary

`editor.setDebugLogger(sink)` (Editor.ts) turns the log on; `sink(event, detail)` is the host's log (the Obsidian plugin
writes `<ISO time> <event> <json detail>` lines to a file). `null` turns it off. Everything below goes through that one
sink. Written so a person or an LLM can read a log top to bottom as **the user's session**: what they pressed, which
command ran from where, what a gesture committed, and what the editor looked like afterwards.

Every detail carries `seq` (1, 2, 3… from switch-on) and `t` (ms since switch-on). Content is never logged: elements are
`tag#id`, text content is not read, strings are cut at 80 characters and `data:` URIs reduced to their size
(`redact()` in `packages/svgcanvas/core/debug-events.js`). `d` of a committed path is the one drawing-geometry field.

| event | when | detail |
|---|---|---|
| `session-start` | log switched on | `mode`, `zoom`, `bytes`, `tags` (element counts by tag), `layers`, `drawing` |
| `action` | **every command run** (`commands.run` / `tryRun`, any source) | `command`, `params`, `source` (`hotkey` / `button` / `favorites` / `tablet` / `api` = host, extension or automation code), `outcome` (`ran` / `disabled` / `badParams` / `unknown` / `internal`), `error`, `undo` (`before->after` stack size), `ms`, `mode`, `selected`, `nested` (ran inside another command), `drawing` |
| `key` | a keydown the editor owns | `combo`, `command` (the bound id or null), `handledBy: 'tool'`, `mode`. A key bound to a *disabled* command logs here only (no `action`) |
| `pointer-down` / `pointer-up` | mouse press / release on the canvas | `mode`, `target`, `button`, `mods`, `client`, `doc` (document coordinates, from the screen matrix read at that moment), `selected`, `undoSize`; `pointer-up` adds `moves` (mouse-moves in between) and `undoSizeAtDown`, or `noPress: true` when the press began outside the canvas (a panel, a scrollbar) and only the release reached it. Mouse-moves are counted, not logged |
| `set-mode` | tool changed | `from`, `to` |
| `selection` | selection changed | `elems`, `mode` |
| `tool-gesture` | a `registerTool` gesture | `tool`, `phase` (`begin` / `commit` / `cancel`), `at`, `created`, `why` |
| `history-push` | a command landed on the undo stack | `text`, `type`, `undoSize`, `elemIds` (the elements the step changed: from the renderer for a model step, from the command for a DOM one; first 20). A shape drawn by a drag is pushed shortly **after** its `pointer-up` |
| `history-apply` | undo / redo applied | `direction`, `cmdType`, `text`, `elemIds`, `mode`, `refreshedInPlace` (by snapshot: `direction: 'snapshot'`, `elemIds` of the elements the step changed, no `cmdType`) |
| `path-*`, `pathedit-*` | node selection, enter / exit path edit, open / close subpath, node delete, commits | see `path-actions.js`, `path-method.js` |
| `debug-snapshot` | the visibility state changed (polled every 400 ms) | selectors and path grips that show or are `stale` (rendered without a model behind them); the hidden pool is a count (`hiddenSelectors`, `hiddenGrips`); group dimming as `disabledCount`; `pathEditing.mode` |
| `layer-tree` | the Layers panel's object tree folded or opened | `action` (`expand` / `collapse` by the user, `reveal` when a canvas selection opened it), `target` (`layer:<name>` or `tag#id`) |

`drawing` is `{ ok: true }` or `{ ok: false, count, findings: [{ code, message, id }] }` (first 5): the `checkDrawing()`
result *after* the action, so the first `ok: false` names the step that corrupted the drawing.

## Reading a log for a bug

1. Find the first `debug-snapshot` with a `stale: true` entry (or the first `drawing.ok: false`).
2. Walk **back** from it: the `pointer-*`, `key`, `action`, `tool-gesture` and `history-*` entries before it are the
   sequence that produced it; `mode` on each says which tool was active, `selected` what was selected.
3. `undo: "n->n"` on a command that should edit means it changed nothing; `n->n+1` is one undo step.

## Adding an event

Call `svgCanvas.logDebugEvent('name', { … })` (core; a no-op while the log is off, so hot paths pay one property read) with
ids, counts and numbers — never text content. Commands need nothing: the registry reports them. Add the event to the table
above. Tests: `tests/unit/debug-events.test.js`, `debug-action-stream.test.js`, `commands.test.js` (`onRun`),
`tests/e2e/debug-log.spec.js`.

## Not done

- **Replay.** A log does not yet replay (`automation` + `commands.run` over a starting SVG) as a repro script. The starting
  drawing is not stored either, only its shape (`session-start`).
- **Ring buffer / size cap** is the host's (the plugin trims its file at 500k characters).
