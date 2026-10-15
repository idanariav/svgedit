# Re-architecture (R1–R7)

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Raised 2026-10-15 from a "what would we build
differently from scratch" review, with everything on the table, including a rewrite of the canvas engine. Nothing here
is scheduled; each item says what it would take and where to start.

**Seams to keep whatever is rewritten:**
- the **saved file format**: SVG with `se:` attributes, as the plugin's `.svg` and `.md` drawings hold it, read and
  written losslessly (the round-trip corpus and `scripts/repair-drawings.mjs`'s reader are the oracle);
- **`src/editor/hostApi.d.ts`**, the plugin's contract (typechecked against `Editor`);
- the **command ids** (hotkey overrides and favorites store them) and the command registry's run/enabled/params shape;
- one self-contained **`dist/editor/Editor.js`** (the plugin copies only that file; see R6).

VectorCraft (`../vectorcraft`) is the reference for most of this; take the ideas, not the Rust (`CLAUDE.md` ›
VectorCraft).

## R1. A document model as the source of truth

**Today.** The live SVG DOM under `#svgcontent` *is* the document. Undo records DOM diffs: hand-built `BatchCommand`s
(60 sites) and `ChangeElementCommand`s that read the new value from the DOM when constructed, plus `transaction.js`,
which snapshots every element's attributes, text and child lists at begin and diffs at commit (≈14 ms / ≈22 ms at
5,000 elements). Most of what `techdebt.md` records is a consequence:
- commands built before their mutation, so redo re-applied the old value (three found, more possible);
- `undo.js` side effects keyed on `cmd.type()`, which minification silently disabled in the shipped bundle;
- `getSvgString()` purging unused `<defs>` from the live DOM, so undo has to restore them (`restoreRefElements`);
- previews as throwaway DOM clones (`data-se-ephemeral`) that must never be serialised;
- the transaction cost making per-pointer-move transactions impossible, and a held transaction swallowing other
  commands' undo steps (puppet warp);
- no headless engine: commands need the editor DOM, which blocks the [LLM CLI](llm-cli.md).

**Target.** A plain data model (layers, groups, shapes, paths, text, defs; every `se:` feature a typed field) held as a
persistent tree: an edit copies only the nodes on the path from the root, so the previous document value *is* the undo
snapshot (VectorCraft `crates/doc/src/lib.rs`: `Arc<Node>` children, `Document::node_mut`; `crates/engine/src/lib.rs`:
`History` of `Arc<Document>`). A gesture is Begin / Preview / Commit: previews re-apply the command to the snapshot
taken at Begin, so a preview never touches the committed document and cancel is free. The SVG DOM becomes a **view**:
a renderer reconciles the model into `#svgcontent` (keyed by id). SVG is an **import / export format**, with unknown
elements and attributes kept verbatim as opaque nodes so foreign SVGs round-trip (VectorCraft keeps its native
document inside an exported SVG and a hash of the markup to notice outside edits: `crates/svg/src/lib.rs`
`preserve_editing`, worth considering for the `se:` attributes).

**What it would delete:** `history.js` command types, `transaction.js`'s snapshot diff, `undo.js`'s type-keyed side
effects, `restoreRefElements`, the save-time defs purge on the live DOM (export would drop unused defs from its
output only), ephemeral preview clones, and most of `drawing-invariants.js`'s DOM-shape rules (the model's types
enforce them).

**Hard parts (decide before committing):**
- **Measurement needs a DOM.** `getBBox`, `getComputedTextLength`, text layout (area text), stroked bboxes: either the
  model caches geometry computed by the renderer (render synchronously after each commit), or the engine keeps a
  hidden measuring SVG. Text editing (`text-actions.js`) is the riskiest part.
- **Geometry kernels take DOM elements** (`paper-utils.js` `svgToPaper`, clipper offsetting, boolean ops, shape
  builder): they need a model → paper / path-data adaptor.
- **Every extension mutates the DOM directly** (~45); they would move with R4.
- **Performance:** reconciliation at 5,000+ elements needs a cost budget like VectorCraft's `vectorcraft-cli perf`.

**Path (strangler, not big bang):**
1. **(a) Model + lossless SVG parse / serialize, no editor change.** Types for the model, `parseSvg(string) → Document`,
   `serialize(Document) → string`, tested by round-tripping the e2e round-trip corpus and the vault's drawings
   (`repair-drawings.mjs`'s reader finds them) to byte-stable output. Useful on its own: it is the headless engine the
   [LLM CLI](llm-cli.md) needs (`inspect`, `check`, simple edits without a browser).
2. **(b) Renderer:** model → `#svgcontent` reconciliation; a check script forbids DOM writes into `#svgcontent`
   outside the renderer once a command group is ported.
3. **(c) Port commands group by group.** The registry is the seam: a ported command's `run` becomes
   `(doc, params) → doc'`; unported ones keep running on the DOM, followed by a DOM → model re-read (slow but correct)
   until they are ported.
4. **(d) Undo = the snapshot stack**; delete `history.js` / `transaction.js` once nothing records DOM commands.
5. **(e) Tools:** `registerTool` gestures become Begin / Preview / Commit over the model.

Size: XL (months). Do step (a) first and decide on (b)–(e) with it in hand. R2 and R3 make it much cheaper.

## R2. Canvas composition instead of attached members

**Today.** `svgcanvas.js` runs 50 `init(canvas)` functions (`runGuardedInit`), each attaching functions and state to
the one `SvgCanvas` instance (`svgCanvas.findSameAs = findSameAs`): about 540 members, with an `initGuardRegistry` to
log name collisions. The shape cannot be inferred, so it is described by hand: `svgcanvas-members.d.ts`,
`svgcanvas-internal.d.ts` (~217 members typed `any`), `svgcanvas.d.ts`, kept honest by
`tests/unit/svgcanvas-dts-drift.test.js`. Generating them was tried and dropped: deriving the members from `init` is a
type cycle (see [infrastructure](infrastructure.md) › "Typing the `init` modules").

**Target.** Core modules export plain functions taking an explicit context (`selectSameAs(ctx, criterion, opts)`), or
small service objects the canvas composes; the canvas's public surface is an explicit facade of what hosts and
extensions call (`hostApi.d.ts` already says what the plugin uses). Types come from the source, and the three
hand-written d.ts files and the drift test go away.

**Path:** the standing guideline (no new attachments) now; then per module, leaves first: export the functions,
generate the attachment as a thin compatibility shim (`canvas.foo = (...a) => foo(canvas, ...a)`) from one table,
move callers to the import, delete the shim when nothing calls it through `svgCanvas`. The context object is where R1's
document and services later live.

Size: L, fully incremental, low risk per module.

## R3. TypeScript

**Today.** Decision of 2026-10-09 / 10-13: strict JSDoc (`// @ts-check` on all 107 core modules, strict for all of them
and `svgcanvas.js`), no `.ts`, three tsconfigs, hand-written d.ts. With a rewrite on the table that decision is open
again: JSDoc types are verbose for the data model R1 needs (discriminated unions, readonly trees), and `.ts` lets
`tsc --emitDeclarationOnly` produce the declarations once R2 removes the attachment pattern.

**Target.** New engine code (R1) in `.ts`; existing modules converted leaves first (`math.js`, `units.js`,
`namespaces.js`, `se-namespace.js`, `proportions.js`, `geometry-remap-registry.js`, `common/util.js`), then upward
through the import graph, `svgcanvas.js` last; the editor after the engine.

**Toolchain** (steps already listed in [infrastructure](infrastructure.md) › "Convert `packages/svgcanvas` core modules
to TypeScript"): Vite and Vitest transpile `.ts` already; `standard` does not lint TS, so move to ESLint +
`typescript-eslint` (or `ts-standard`) for one style over `.js` and `.ts`; `isolatedModules` on; check that
`vite-plugin-istanbul` and nyc map `.ts` coverage back to source (`nyc.config.js` `extension`). Known pitfalls of
incremental migrations: no big-bang conversion, no `any` to silence errors (`unknown` and narrowing), strict flags kept
on per file as today.

Size: M for the toolchain, L for the conversion (small per module).

## R4. Built-in features are not extensions

**Today.** 45 `ext-*` modules, including what is core to the editor (`ext-path-edit`, `ext-shapes`, `ext-panning`,
`ext-grid`, `ext-markers`, `ext-connector`, `ext-layer_view`, `ext-eyedropper`…), all loaded through upstream's
third-party extension API: `runExtensions` hook fan-out over every extension (which once let one extension's
`undefined` cancel another's `preventDefault`), `addLangData`, a `defaultExtensions` list in `ConfigObj`, and the eager
glob in `extensionRegistry.js`. Hosts choose features by name: the plugin's `SvgView.ts` sets `noDefaultExtensions`
and repeats 43 of the 45 names by hand (leaving out `ext-opensave` and `ext-theme-toggle`), so every new built-in tool
also needs a plugin release. Puppet warp still uses the legacy mouse hooks.

**Target.** A built-in feature registers its commands, `registerTool` tools, panel sections and canvas hooks through
explicit, typed APIs at startup, in `src/editor/features/<name>/`. Hosts turn features *off* (`disabledFeatures:
['opensave']`) instead of listing everything on. The extension API stays only as a small typed surface for genuinely
third-party add-ons (none exist today, so it could also go).

**Path:** add the opt-out config and make the plugin use it (so new tools stop needing plugin changes); then move
features one at a time, deleting extension hooks as their last user goes; puppet warp after the `registerTool` session
concept ([infrastructure](infrastructure.md) › Tier 0 follow-ups).

Size: L, incremental, low risk per feature.

## R5. Drop URL configuration

**Today.** `ConfigObj` parses the page URL into config (`initStroke[color]`, `bkgd_color`, `dimensions`, `extensions`
by name, any pref) and loads drawing content from `source` / `url` parameters unless `preventURLContentLoading` is set.
`userExtensions` and `imgPath` are already refused from the URL, and cross-folder extension names rejected. The only
consumer, the plugin, configures through `setConfig`; the URL path is unused surface (and `lockExtensions`,
`preventAllURLConfig`, `allowedOrigins` exist only to fence it in).

**Target.** Config only through `setConfig` / the host API. Remove the URL parsing, `source` / `url` loading and the
fencing options (no e2e spec navigates with a query string as of 2026-10-15). Also review `userExtensions` (URL-free but still a dynamic `import()` of a host-given path; drop
it if R4 removes the extension API).

Size: S–M. Check the plugin for query parameters before removing.

## R6. Bundle size and startup

**Today.** `dist/editor/Editor.js` is 3.33 MB (2026-10-15, after the svgcanvas alias removed the duplicated core
modules; it was 3.83 MB) with paper.js, clipper-lib, imagetracerjs, spiro, the shape library JSON, the Google-fonts
catalog and all 45 extensions in one file. The build sets `inlineDynamicImports`, which turns every `import()` back
into an inline module, because the plugin ships only `Editor.js` (`fetch-svgedit-dist.mjs`); so code splitting cannot
help without a plugin change.

**Options, cheapest first:**
1. **Measure:** a bundle report (e.g. `rollup-plugin-visualizer`) and an e2e startup-time budget, like VectorCraft's
   `vectorcraft-cli perf` budgets.
2. **Defer evaluation inside the single file:** heavy modules initialised on first use (paper's scope already is,
   `getPaperScope`); large data (shape library, font catalog) parsed on first open rather than at import.
3. **Ship chunks:** teach the plugin to copy a `svgedit-dist/` folder, drop `inlineDynamicImports`, and lazy-load rarely
   used tools (tracing, puppet warp, blend, recolor, shape library data). Cross-repo; only if 1 shows startup matters.

Size: M.

## R7. Agent docs diet

**Today.** `tools.md` 116 KB, `file-map.md` 74 KB, `extensions.md` 56 KB, `css-rules.md` 34 KB, `attributes.md` 28 KB:
many rows have grown into changelogs (how a bug was found, what used to be there). The roadmap was split into area
files on 2026-10-15 for the same reason.

**Target.** Docs say what a thing is and why it is that way; history lives in git. Generate what can be generated:
the file map from each file's header comment (a script, plus a check that every file has one), the tool and shortcut
lists from `commands.list()` (ids, labels, groups, default keys); keep hand-written prose for behaviour that is not
obvious from code.

Size: M, can be done one doc at a time.
