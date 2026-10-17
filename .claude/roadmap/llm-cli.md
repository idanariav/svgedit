# Last priority: log replay and an LLM drawing CLI

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).


Both come after everything above and every phase of the plans. They rest on the same fact: since the command registry, every
user-visible action is a documented command with a stable id, typed params, an `enabled` reason and one undo step, so what
happened in a session can be *named* rather than guessed from DOM snapshots.

1. **Command-based debug log:** done 2026-10-15 (`.claude/debug-log.md`): every command run (id, params, source, outcome, undo
   size before / after, `checkDrawing` after), keys, pointer press / release, tool gestures, selection and history pushes, all
   numbered; the snapshot polling stays as the periodic checkpoint. Open: replay — a log that re-runs (`automation` +
   `commands.run`) over a starting SVG would double as a bug-repro script and a fixture generator; the log would need to store
   the starting drawing.
2. **A CLI for LLMs to work on drawings, including the ones embedded in Obsidian notes.** Follows the technical guidelines of the
   sibling tools (CLI-compatible package, local only, front-loaded reasoning): `svgedit-cli list` (commands with their params and
   enabled state, from `commands.list()`), `inspect` (what `automation.inspect()` returns: layers, selection, undo state, plus a
   compact structural summary of the drawing), `run <command> --param k=v` (through `commands.run`, so gates and undo behave as
   in the editor), `check` (`checkDrawing` findings), `read` / `write` for `.svg` files and for the drawings an Obsidian note
   holds (the plugin's `.md` drawings, raw or compressed, and embedded ones: the same reader `scripts/repair-drawings.mjs` already
   has), and JSON output on every verb. The engine needs a **headless host**: today `commands.run` needs the whole editor DOM, so
   the first piece of work is either running the editor in headless Chromium (Playwright is already a dependency, cheap but
   heavy) or splitting the canvas-level commands from the panel-level ones so the former run under jsdom. Decide that before
   anything else; start with the Playwright route. The plugin already exposes `editorCommands` for a future CLI / MCP bridge
   (see "Plugin command access" in [`../roadmap.md`](../roadmap.md)), so an MCP server over the same verbs is the natural second front end.

   *Shipped 2026-10-17 (read side, no browser):* `npm run cli -- inspect|read|check <file.svg|note.md> [--version N]`
   (`scripts/svgedit-cli.mjs`; `summarizeDrawing` in `core/model/summary.ts`): `inspect` prints a JSON summary (size, guides, layers
   with their objects by kind, defs, every `se:` attribute in use, typed features that do not parse, all object ids), `read` writes
   the drawing back through the model, `check` runs the round-trip and typed-feature check and exits 1 on a problem; notes are read
   like `repair-drawings.mjs` does (raw or compressed block, saved versions). Left: `list` (needs the command registry without the
   DOM), `run` and the DOM `checkDrawing` (the editor), `write`, and an MCP front end.

   *Update 2026-10-15 ([R1](rearchitecture.md#step-a-status) step a):* the read side no longer needs a browser. `core/model/`
   parses a drawing in plain Node (`readDrawing`: layers, objects with ids, transforms, hidden / locked state, typed `se:`
   features) and `scripts/check-model-roundtrip.mjs` already reads `.svg` files and the plugin's `.md` drawings, so `inspect`,
   `read` and a structural summary can ship without Chromium. `run <command>` and `check` still need the editor (commands
   run on the DOM; `checkDrawing` is DOM-based) until R1 step (c) ports commands to `(doc, params) → doc'`, so keep the
   Playwright route for those and do not duplicate `checkDrawing` on the model.
