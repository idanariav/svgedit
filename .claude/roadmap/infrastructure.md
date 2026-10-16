# Infrastructure follow-ups: Tier 0, typing, round-trip corpus

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Read the section for the area your task touches;
when you finish an item, delete it (git history keeps the record).

## Tier 0 follow-ups (VectorCraft port)

Not started. Each is built with the first feature that needs it; do not build them standalone.

- **Tool cursors by position** are done through `svgCanvas.setCursorHint` (see [ui-polish](ui-polish.md) › "Tool cursors"), not a `ToolDef.cursor()` by
  position; `ToolDef.cursor` (a CSS cursor, or a function of the context) is still applied on activate and removed on
  deactivate (Measure uses `crosshair`). Every drawing tool, old and new, now has a static cursor (`toolCursors.js`, below). `wantsHover` exists and is used by the cutter. (`options()/setOption()` was built with T2.13: the Blend tool; the
  editor draws the bar from the descriptors, `panels/toolOptionsBar.js`. Other tools opt in by adding `options()`;
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
  (`commandGates.js`: the shortcut table, the panel commands, paste, the layer buttons; path, text and Convert to Path
  had theirs earlier; crop Apply / Cancel follow `svgCanvas.isImageCropping()`, Remove glow / outline the selection's
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

## `svgcanvas.d.ts` is hand-written and incomplete; no explicit host API

`npm run typecheck` (part of `pretest`) compiles `packages/svgcanvas/svgcanvas.d.ts`
via `packages/svgcanvas/tsconfig.json`, which catches broken re-exports (it found a
stale `sanitizeSvg` export). `tests/unit/svgcanvas-dts-drift.test.js` compares a live
`SvgCanvas` instance with the d.ts class and fails on any runtime member that is
neither declared nor listed on `InternalMembers` (`svgcanvas-internal.d.ts`: ~217
names typed `any` and tagged `@internal` — state accessors and module plumbing
that nothing in the editor or extensions calls). Promote a member to the public
API by declaring it properly and deleting it from `InternalMembers`. Runtime-attached members now live in `packages/svgcanvas/svgcanvas-members.d.ts`
(`AttachedMembers`): `svgcanvas.d.ts` merges it into the class, and `svgcanvas.js`
extends it through a JSDoc cast on its base class (augmenting the JS module
doesn't work — TS ignores `declare module` merges into a JS-declared class).
`svgcanvas.js` carries `// @ts-check` and is part of `npm run typecheck` (strict
since 2026-10-13, see below). **All 107 `core/`+`common/` modules carry it** (2026-10-12: 72 added in three passes; JSDoc
`{Float}`/`{Integer}` became `{number}`, leftover `{PlainObject}`/`{GenericArray}` resolve through
`legacy-jsdoc-types.d.ts`, and `NS` is `as const` so `createElementNS(NS.SVG, 'g')` returns the right element type). A pragma is
checked by *both* configs, so a file the strict config reaches through an import must be strict-clean, and all of them are.
What is left is tightening, not coverage: `tsconfig.strict.json` (`noImplicitAny` + `strictNullChecks`) now covers **all 107**
`core/`+`common/` modules (2026-10-12; typing them turned up one real bug, `segment.js`'s `farthestPointFrom` measuring from a
`{cx, cy}` centre with `.x/.y`, which made a radial divider line stop at the first crossing instead of the farthest). `svgcanvas.js`
itself joined it on 2026-10-13 (147 errors: untyped accessor parameters, the `state` literal whose `[]`/`null` fields narrowed to `never`, and
a few null cases; the state is now the `CanvasState` / `StyleProps` / `BrushParams` typedefs at the top of the file, and a few
guards that were silent bugs got explicit handling: `flashStorage` no longer copies a missing clipboard as the string `"null"`,
`restoreRefElements` skips a malformed `url(`, and `getParents` is declared `Element[] | null` as it really is). The accepted stopgaps to shrink: `/** @type {any} */` at DOM-API
seams and on canvas-attached state whose class is built inside an `init` (the `Path` of `path-actions.js`/`path.js`, the `canvas`
parameter of every `init`). Most errors were untyped parameters and `null`-initialised variables; the rest nullable DOM links
(`parentNode`, `firstChild`) and the legacy `pathSegList` API.
Writing a module: a stale `@param` name that is not a parameter, or a `module:…` typedef name, is an error under the checker,
so write the real name.

The host API is `src/editor/hostApi.d.ts` (`EditorHostApi`, `HostCanvas`),
typechecked against `Editor` by `npm run typecheck` and copied to
`dist/editor/hostApi.d.ts`; the plugin consumes it.
The root `tsconfig.json` (what editors and the LSP read, no script uses it) is `module: ESNext` / `moduleResolution: Bundler` since 2026-10-15, so
`@svgedit/svgcanvas/core/*` imports resolve instead of reporting missing declaration files; `tsc -p tsconfig.json` still reports 19 real strict-mode
errors in `src/` (untyped parameters, index signatures), not a gate.

## Typing the `init` modules (decided 2026-10-13: no d.ts generation)

*Re-opened by [R2](rearchitecture.md#r2-canvas-composition-instead-of-attached-members) and [R3](rearchitecture.md#r3-typescript): with the attachment pattern gone and `.ts` sources, the declarations can be generated. Until then this section stands.*

Generating `svgcanvas.d.ts` (and deleting `svgcanvas-members.d.ts` / `svgcanvas-internal.d.ts`) was tried on three modules and
dropped. `tsc --declaration` works on `svgcanvas.js`, but the ~540 members the `core/*` `init`s attach (`canvas.foo = …`) cannot be
inferred, and deriving them as `ReturnType<typeof init>` is a type cycle (the class's base type would depend on `init`'s signature,
whose parameter is the class: TS2506 / TS2456). What it would take is a hand-written API `@typedef` plus `@returns` per module,
`init` returning it, `runGuardedInit` assigning it, and `svgcanvas.d.ts` split into an interface-only file (TS resolves
`./svgcanvas.js` to the sibling `.d.ts` first, so modules never see the source class): about 62 modules and a change to the
published types layout, for a generated file that is the weakest benefit. Not worth it; the d.ts files stay hand-written and the drift
test guards them. (Side note: the d.ts re-exports `NS`, `logger`, `math`, `units` and `dataStorage` by name, which the built entry
does not export; only the default export exists at runtime.)

What is worth having, without a deadline: **when you touch a module's `init`, type its `canvas` parameter as
`import('../svgcanvas.js').default`** instead of `any` or a `module:…` name (which resolves to `any`). Then
(1) `svgCanvas.foo = foo` is checked against the signature declared in `svgcanvas-members.d.ts`, so a mismatch fails `npm run
typecheck`, and (2) every `svgCanvas.method()` call inside the module is checked against the real class, which is how typing the
`core/` modules found the `segment.js` bug. 53 modules do it now (2026-10-15: 5 earlier, then two passes that typed the rest). The gesture state, `pathActions`' missing methods, the editor-set overlay hooks and a few `Config` flags are declared in `svgcanvas-members.d.ts` / `svgcanvas.d.ts`, and several declarations that disagreed with the runtime were corrected (`embedImage`, `groupSelectedElements`, `moveSelectedElements`, `getText`, the phantom `pathActions.selectNode`). Still on `any` or a hand-made context type (`EditorContext`, `pasteContext`…), on purpose or not tried: `bbox-utils`, `blur-event`, `dom-utils`, `draw`, `paste-elem`, `sanitize` (context-typed), and the `init = () => register…` modules (`distort`, `live-effects-distort`, `warp`), which take no canvas. Typing `canvas` precisely makes `getElement()` / `getRefElem()` results (`Element | null`) visible to the strict config; the fixes were casts where null cannot happen (it would have thrown before) and a few real guards. Beware when editing: a line starting with a cast `/** @type … */ (x)` after a line without a semicolon is parsed as a call (`standard` has no semicolons); assign to a local first. Expect new errors when a module is switched (members still typed `any` in `InternalMembers`,
members missing from the d.ts): fix them by declaring the member properly and deleting it from `InternalMembers`.

## Convert `packages/svgcanvas` core modules to TypeScript

Decided and under way as [R3](rearchitecture.md#r3-typescript) (2026-10-16): the toolchain (ESLint + neostandard, `.ts` through
Vite / vitest / tsc / coverage, the `./x.ts` import rule and its gate) is done and four leaf modules are converted. State of
the types: every `core/` and `common/` module is `// @ts-check` or `.ts` and strict-clean (`tsconfig.strict.json`, 2026-10-12 / 13);
editor-layer Tier 0 modules (`commands.js`, `coreCommands.js`, `automation.js`, `components/commandBinding.js`) are `// @ts-check`,
checked through `src/editor/tsconfig.hostapi.json`. The public types are the hand-written `svgcanvas.d.ts` /
`svgcanvas-members.d.ts` / `svgcanvas-internal.d.ts`, kept honest by `tests/unit/svgcanvas-dts-drift.test.js`; generating them
from source was tried and dropped (2026-10-13, see "Typing the `init` modules" below) and returns only with R2.

**Don't break:** the published package shape (`main: dist/svgcanvas.js`, `types: svgcanvas.d.ts`), `src/editor/hostApi.d.ts`, which
the Obsidian plugin consumes, and the self-contained `dist/editor/Editor.js` bundle. The plugin sees only built JS, so it is
unaffected as long as those hold.

**New code meanwhile:** see the Typing guideline in [`roadmap.md`](../roadmap.md): a new engine module is `.ts`; a new editor module
is `// @ts-check` with strict JSDoc.

