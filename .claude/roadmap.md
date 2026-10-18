# Roadmap

Guidelines and planned work that are **not scheduled** but should shape future development. Read this file at the
start of a task: apply the guidelines, and if the task touches an area in the index below, read that area's file and
fold its items in. `techdebt.md` is the other half (compromises and known hazards): a roadmap item is something we
*want*, a techdebt item is something we *owe*.

When you finish an item, delete it (git history keeps the record). When you defer a feature, add it to its area file
(a new area gets a new file and a row in the index); when you take a shortcut, add it to `techdebt.md`. Keep this file
short: details belong in the area files.

## Standing guidelines for new code

- **Everything is a command.** A user-visible action is a command with a stable id (never rename one: hotkey overrides
  and favorites store them), typed `params` and an `enabled` gate from day one (`commandGates.ts`). Buttons are views
  (`command="<id>"`, no `$click`). See `CLAUDE.md` › Key source locations.
- **Drawing tools use `svgCanvas.registerTool`** (document-space events, one undo step per gesture, `options()` for an
  options bar). No new legacy mouse hooks.
- **Undo goes through `svgCanvas.transact(label, fn)`.** Never construct a `ChangeElementCommand` before its mutation.
- **Typing ([R3](roadmap/rearchitecture.md#r3-typescript)):** a new module in `packages/svgcanvas` is a `.ts` file (erasable
  syntax only: no enums, namespaces or parameter properties; no `any`, use `unknown` and narrow) and is listed in
  `tsconfig.strict.json`. Import a `.ts` module with its `.ts` extension (`./x.ts`): plain Node runs the headless engine and
  does not map `.js` to `.ts`. After renaming a module run `node scripts/check-ts-imports.mjs --fix`. A new *editor* module
  is a `.ts` file too (the `check-editor-strict` ratchet covers it; `no-explicit-any` is an error there too, so narrow with `unknown` and a guard, not `any`). When you touch a core module's `init`,
  type its `canvas` parameter as `SvgCanvas` (`import type SvgCanvas from '../svgcanvas.ts'`); convert a module you are rewriting anyway.
- **No new `canvas.foo = …` attachments** ([R2](roadmap/rearchitecture.md#r2-canvas-composition-instead-of-attached-members)):
  a new core module exports `XApi` (its interface) and `createX(canvas): XApi`; `svgcanvas.ts` attaches it with `attachApi` and
  lists it in `type ModuleApis`. A feature with few callers returns one service object instead (`svgCanvas.clipMask.setClip()`).
  Pure logic is exported as plain functions that take the canvas (or what they need from it) as an argument.
- **Built-in features are not new extensions** ([R4](roadmap/rearchitecture.md#r4-built-in-features-are-not-extensions)):
  new built-in behaviour registers commands, tools and panel sections directly; `ext-*` stays for what a host may
  leave out.
- **Corruption fixes:** prevention + a `checkDrawing` rule + a narrow `scripts/repair-drawings.mjs` entry; never a
  sanitizer in `setSvgString()` (`CLAUDE.md` › Data-corruption bug fixes).
- **Persisted `se:` state** needs a round-trip fixture saved by the real tool (`tests/e2e/fixtures/roundtrip/`); keep
  the command sweep green, `SWEEP=full` before closing a larger batch.
- **Agent docs:** say what a thing is and why, not how it got there (history is in git). Give every source file a header comment (the file map is generated from it, `npm run file-map`); regenerate `commands.md` when a command changes; put user-facing behaviour in `tools.md` and construction notes in `extensions.md`, one fact in one place.
- **Calling the canvas from the editor:** `check-canvas-calls` (`pretest`) type-checks every `svgCanvas.x(…)` in `src/editor` against the
  facade, so a new canvas member is on the class or in a module interface before the editor calls it; an
  extension reaches the editor through `const svgEditor = /** @type {import('../../Editor.ts').default} */ (/** @type {unknown} */ (this))`.
- **Editor typing is a ratchet:** `check-editor-strict` (`pretest`) runs `tsc --strict` over `src/editor` and fails on any error in a file
  listed in `src/editor/strict-files.json`. Write new editor code so it is clean and add the file to the list (`node
  scripts/check-editor-strict.mjs --report` shows the error count per file). `$req('id')` is `$id` for an element that must exist (it throws, and the
  type is not nullable); element types by id come from `src/editor/ui-ids.d.ts` (`npm run gen-ui-ids`) and by tag from `element-tags.d.ts`.
- **Layering:** `packages/svgcanvas` never imports `src/editor`, reads `window.svgEditor` or defines custom elements
  (`check-layers`).

## Background tracks

- **Typing** (the engine is `.ts` and strict; the editor is JSDoc, strict on every file and now `.ts`, except the CSS / data / locale modules, `browser-not-supported.js` and the `Editor.ts` re-export): the explicit `any`s are gone, see [R3](roadmap/rearchitecture.md#r3-typescript) and [infrastructure](roadmap/infrastructure.md).
- **Plugin command access** (plugin repo): done 2026-10-12 (plugin 1.0.48): one "Run editor command…" palette picker
  over `commands.list()` plus `plugin.editorCommands(view?)` for a future CLI / MCP bridge; no per-command palette
  entries, by decision. The picker asks for a command's `params` (2026-10-15); no editor command declares any yet.
- **Round-trip corpus, `checkDrawing` rules, command sweep:** every feature adds its fixtures and keeps the sweep green
  (details in [infrastructure](roadmap/infrastructure.md)).
- **UI/UX polish:** opportunistically when a feature touches that toolbar ([ui-polish](roadmap/ui-polish.md)).

The VectorCraft port sequence (Tier 0 through Phase 6 of `plans/vectorcraft-port/`) is complete; what is left of it is
the per-area follow-ups below.

## Re-architecture (rewrite on the table)

Raised 2026-10-15 from a "what would we build differently from scratch" review. Everything is open, including a rewrite
of the canvas engine; the stable seams to keep are the **saved file format** (SVG + `se:` attributes, read by the
plugin's drawings), **`src/editor/hostApi.d.ts`** (the plugin's contract), the **command ids**, and the single
self-contained **`dist/editor/Editor.ts`**. Full write-up, evidence and migration paths: [`roadmap/rearchitecture.md`](roadmap/rearchitecture.md).

| # | Change | Size | Depends on |
|---|---|---|---|
| R1 | A document model as the source of truth (persistent tree, snapshot undo, SVG as import/export), replacing the live DOM + command-diff undo (step a mostly done 2026-10-15: `core/model/`, see its status in the re-architecture file) | XL | R2, R3 helpful |
| R2 | Canvas composition: modules export functions over an explicit context instead of attaching ~540 members to one object (facade typed 2026-10-16; members not yet moved off the canvas, see the status in the re-architecture file) | L | — |
| R3 | TypeScript (`.ts`) for the engine, then the editor (toolchain done; engine converted 2026-10-17 (except the modules R1 deletes); the editor is next) | M toolchain + L conversion | — |
| R4 | Built-in features are not extensions; the extension API shrinks to what third parties need | L | — |
| R6 | Bundle size and startup (deferred evaluation, chunks if the plugin can ship them, a budget) | M | plugin change for chunks |

**R1 stops at "the model owns state and undo, the DOM is the view and the measurer"** (2026-10-18); what is deliberately not
being done is listed in [`roadmap/rearchitecture.md`](roadmap/rearchitecture.md#not-worth-doing-decided-2026-10-18).

Suggested order (history): R3 toolchain → R2 → R1 step (a) (which also gives the
[LLM CLI](roadmap/llm-cli.md) its headless engine) → decide on the rest of R1 with that in hand. Step (a) was done first, out of
this order, because it needed neither: what it learned about R2 and R3 is in the re-architecture file. R4 and R6 run alongside.

## Follow-ups by area

| File | Covers |
|---|---|
| [`roadmap/rearchitecture.md`](roadmap/rearchitecture.md) | R1–R4, R6 above (R5 and R7 are done) |
| [`roadmap/infrastructure.md`](roadmap/infrastructure.md) | Tier 0 follow-ups (tool cursors, live-effects preview on transactions, precise `enabled`, puppet warp on `registerTool`, lazy transaction snapshot), round-trip corpus, `svgcanvas.d.ts` / host API, typing the `init` modules, TypeScript conversion steps |
| [`roadmap/drawing-tools.md`](roadmap/drawing-tools.md) | Measure, Distort, Gradient, Shaper, Pencil / Smooth Path fit, Pen continue / join, centerline tracing, Pencil continue, Smooth tool, ruler guides, snapping while drawing, shape-family tools |
| [`roadmap/appearance.md`](roadmap/appearance.md) | Recolor Artwork, live effects, Live Corners, art / pattern brushes, Blend, the live stack, width profiles, arrowheads, fitted dashes, Eyedropper Copy style, glow |
| [`roadmap/objects-layers-text.md`](roadmap/objects-layers-text.md) | Transform Each / Split Into Grid, Layers panel object rows and gestures, area text, scrubby labels, Select Same |
| [`roadmap/ui-polish.md`](roadmap/ui-polish.md) | Toolbar auto-fold, tablet shell, keyboard shortcuts, side panel / top bar, tool cursors, icons and palette |
| [`roadmap/llm-cli.md`](roadmap/llm-cli.md) | Last priority: debug-log replay and an LLM drawing CLI |
