# Infrastructure follow-ups: Tier 0, typing, round-trip corpus

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).

## Tier 0 follow-ups (VectorCraft port)

Not started. Each is built with the first feature that needs it; do not build them standalone.

- **Tool cursors by position** are done through `svgCanvas.setCursorHint` (see [ui-polish](ui-polish.md) › "Tool cursors"), not a `ToolDef.cursor()` by
  position; `ToolDef.cursor` (a CSS cursor, or a function of the context) is still applied on activate and removed on
  deactivate (Measure uses `crosshair`). Every drawing tool, old and new, now has a static cursor (`toolCursors.ts`, below). `wantsHover` exists and is used by the cutter. (`options()/setOption()` was built with T2.13: the Blend tool; the
  editor draws the bar from the descriptors, `panels/toolOptionsBar.ts`. Other tools opt in by adding `options()`;
  the Magic Wand has one too (Match, Tolerance), and so has the Smooth tool (Radius, Tolerance).)
- **Live-effects preview on transactions.** The apply-without-re-select path exists now (`applyLiveEffectsTo`, built
  for the Distort tool, which mutates the real element on every pointer move inside its gesture's transaction). What is
  left is the Effects *panel's* preview: `live-effects.js` still hides the original and shows a throwaway clone
  (`data-se-ephemeral`). Moving it onto a transaction means holding one open across the user's panel session (many
  param ticks, any other click or undo in between), which `techdebt.md` lists as a hazard, and the primitive → path
  swap re-selects, which the panel treats as "selection changed, cancel the edit". Do it only if the clone preview
  causes a real problem (a selection box that keeps the original's bbox is the known cosmetic one). Other hand-rolled
  previews: ext-curvature, ext-cutter (both already ephemeral).
- **Precise `enabled` on commands.** Done for everything with a selection, clipboard or layer precondition
  (`commandGates.ts`: the shortcut table, the panel commands, paste, the layer buttons; path, text and Convert to Path
  had theirs earlier; crop Apply / Cancel follow `svgCanvas.imageCrop.isCropping()`, Remove glow / outline the selection's
  effects, `corner_kind_*` a shape with corners); new commands get a gate from day one. Left "always": the
  drawing-tool mode commands (switching tools is always allowed) and extension commands that register without a
  check. A hotkey on a gated command is inert and no longer
  `preventDefault`s: arrow keys scroll the canvas with nothing selected, Tab moves focus in an empty layer.
- **Puppet warp on `registerTool`.** Needs a way for a gesture to cancel without dooming an enclosing session
  transaction (see `techdebt.md`, "Tool contract (compromises)"). Worth it only if a second session-style tool
  appears; then give the registry a session concept instead of special-casing. *Scheduled:* T2.7 and T2.8 did not need it (one undo step per drag); the next candidate is T2.11, if it becomes a tool at all.
- **Lazy transaction snapshot** (targeted at the elements a caller declares) if anything ever needs a transaction
  per pointer-move. *Not scheduled:* no known consumer (T3.1's scrub is one transaction around a drag, which is cheap).
- **Plugin side:** expose `editor.commands.list()/run()` as Obsidian palette entries and hotkeys. Tracked in the
  plugin repo (`../obsidian-svgedit-plugin/.claude/techdebt.md`, "Expose the editor's command registry…"). *Scheduled:* a background track, best before Phase 3.

## Round-trip corpus: keep adding drawings

`tests/e2e/roundtrip.spec.js` loads/saves/loads every drawing in
`tests/e2e/fixtures/roundtrip/` and asserts the output stabilises after one
pass. Covered: frames, corner radius, taper, shadow/outline, text-on-path,
groups/layers/gradients, markers, clip-path/mask, `<use>`/symbols, embedded
images, repeat (radial + grid), mirror, puppet-warp, free/perspective distort and area text. Corner-radius and taper
predate the `xmlns:se` fix and double as legacy-file coverage. Not covered:
repeat's *path* mode, and real drawings from the plugin. Each new corruption bug
should add the file that exhibited it. Small per fixture.

## The canvas surface: class plus module interfaces

The canvas class is `svgcanvas.ts` (the public types `Config`, `SVGElementJSON`, `Resolution`, `BBox`, `HistoryCommand`,
`UndoManager`, `ExtensionResult`, `RasterExport*`, `ImportEntry` are exported from it). Every core module exports the interface of
the members it gives the canvas (`XApi`) and a `createX(canvas)` that returns them; `type ModuleApis` in `svgcanvas.ts` lists them
and the class extends that through a cast on its base class (augmenting the module doesn't work: TS ignores `declare module`
merges into a class it declares). State the modules share is `declare`d on the class. `npm run typecheck` checks the class and
every module against them, strict since 2026-10-13, and `tests/unit/svgcanvas-members.test.js` compares a live instance with the
class and the module interfaces.

A module's `canvas` parameter is typed `SvgCanvas` (`import type SvgCanvas from '../svgcanvas.ts'`), so every `svgCanvas.method()`
call inside it is checked against the real class, and the object it returns against the interface it exports.

## Convert `packages/svgcanvas` core modules to TypeScript

Decided and under way as [R3](rearchitecture.md#r3-typescript) (2026-10-16): the toolchain (ESLint + neostandard, `.ts` through
Vite / vitest / tsc / coverage, the `./x.ts` import rule and its gate) is done and four leaf modules are converted. State of
the types: every `core/` and `common/` module is `// @ts-check` or `.ts` and strict-clean (`tsconfig.strict.json`, 2026-10-12 / 13);
editor-layer Tier 0 modules (`commands.js`, `coreCommands.ts`, `automation.ts`, `components/commandBinding.js`) are `// @ts-check`,
checked through `src/editor/tsconfig.hostapi.json`. The class is `svgcanvas.ts` (2026-10-17) and the members the core modules give it are typed by the interfaces those modules export
(R2): no hand-written declaration file describes the canvas.

**Don't break:** `src/editor/hostApi.d.ts`, which the Obsidian plugin consumes, and the self-contained `dist/editor/Editor.js` bundle.
The fork is not published to npm and the plugin copies only those two files, so the canvas's own types are internal.

**New code meanwhile:** see the Typing guideline in [`roadmap.md`](../roadmap.md): a new engine module is `.ts`; a new editor module
is `// @ts-check` with strict JSDoc.

