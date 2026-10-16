# Re-architecture (R1–R4, R6)

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Raised 2026-10-15 from a "what would we build
differently from scratch" review, with everything on the table, including a rewrite of the canvas engine. Nothing here
is scheduled; each item says what it would take and where to start.

**Seams to keep whatever is rewritten:**
- the **saved file format**: SVG with `se:` attributes, as the plugin's `.svg` and `.md` drawings hold it, read and
  written losslessly (the round-trip corpus, `scripts/repair-drawings.mjs`'s reader and `scripts/check-model-roundtrip.mjs` are the oracle);
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

1. **(a) Model + lossless SVG parse / serialize, no editor change. Mostly done (2026-10-15); see "Step (a): status" below.**
2. **(b) Renderer:** model → `#svgcontent` reconciliation; a check script forbids DOM writes into `#svgcontent`
   outside the renderer once a command group is ported.
3. **(c) Port commands group by group.** The registry is the seam: a ported command's `run` becomes
   `(doc, params) → doc'`; unported ones keep running on the DOM, followed by a DOM → model re-read (slow but correct)
   until they are ported.
4. **(d) Undo = the snapshot stack**; delete `history.js` / `transaction.js` once nothing records DOM commands.
5. **(e) Tools:** `registerTool` gestures become Begin / Preview / Commit over the model.

Size: XL (months). Step (a) is in; decide on (b)–(e) with it in hand (see "What step (a) changed about the plan").
R2 and R3 make it much cheaper.

### Step (a): status

Code: `packages/svgcanvas/core/model/` (not imported by the editor yet; no DOM, runs in Node). First commit `713eb592` (tree,
parser, serializer, typed view); the typed features and the headless fixes follow it (`git log -- packages/svgcanvas/core/model`).

| Layer | File | What it is |
|---|---|---|
| Tree | `node.js` | Frozen, structurally shared XML tree: element / text / cdata / comment / pi, plus the declaration and doctype around the root. `updateAt(root, path, fn)` copies only the ancestors, so the previous root is the undo snapshot; an edit that changes nothing returns the same root |
| Parse | `parse.js` | `parseSvg(text)` on `saxes`, namespace processing off, qualified names kept as written (saved drawings used `se:` without declaring it); `SvgParseError` carries the line |
| Serialize | `serialize.js` | `serializeSvg(doc, {format})`: `preserve` writes the tree as is, `indent` is the editor's save layout (`svgToString`); the editor's `toXml` escaping; tabs and line breaks in attributes as character references |
| Typed view | `drawing.js` | `readDrawing(doc)`: layers (top-level `<g class="layer">`, `<title>` name, hidden / locked / template), items (group with a `role`, shape, path, text, image, use, other), `<defs>` children, orphans, ruler guides, every `se:*` attribute verbatim in `item.se`. Every item has a `path` into the tree |
| Features | `features.js` | `readFeatures(se)`: corner radius, taper / taper style, width profile, dash fit, art brush, blend, brush library, each read with the parser its owning module exports; `invalid` names a typed attribute that does not parse (the `se-attr-parse` condition) |

**Evidence (2026-10-15).**
- `node scripts/check-model-roundtrip.mjs [--typed] [--verbose] <dir>` (read-only; `.svg` files and the plugin's `.md`
  drawings and saved versions, through `drawingsIn()` exported from `repair-drawings.mjs`): over the vault, 447 drawings,
  436 write back byte-identical, 11 differ only in spelling (other tools' output: `<x></x>`, a space inside a tag, a
  newline before a doctype; they re-parse to the same tree), 0 lossy, 0 fail to parse, 0 fail to read, 0 invalid typed
  features. A drawing is *lossy* when the written text parses to a different tree; that fails the run.
- All 32 round-trip fixtures write back byte-identical (`preserve`) and equal the editor's save layout (`indent`)
  apart from the blank line the editor leaves for a skipped empty `<defs>`; names, attribute order and text match the
  browser's `DOMParser`.
- The typed view finds the same layers and objects, with the same hidden / locked state, as the editor's own helpers
  (`isPanelObject`, `hasLockMark`, `isObjectHidden`) on every fixture.
- Cost at 5,000 elements: parse ≈ 36 ms, serialize ≈ 8 ms, one edit ≈ 0.07 ms (today a transaction commit is ≈ 22 ms
  and begin ≈ 14 ms). The edit figure is the point of R1: undo becomes a pointer to the previous root.
- A unit test runs the model in a bare Node process (no `document`, no `paper.js`), so "headless" is enforced.

**Decisions taken (change them here if they turn out wrong).**
- *Lossless means the infoset, not the bytes.* Elements, attribute order, text, CDATA, comments, PIs, declaration and
  doctype are kept; entity spelling, quote style and spacing inside a tag are not (the parser reports decoded values).
  One canonical spelling is written, the editor's own, so everything the editor saved comes back byte-identical.
  Byte-exact round-trip of foreign files would need source slices per node; nothing asks for it.
- *Names are never resolved.* `xmlns*` are plain attributes; a prefix is a string. Namespace resolution, if ever needed,
  is a function over the tree, not a property of it.
- *The tree keeps whitespace text nodes* (so `preserve` can round-trip mixed content). Child indexes therefore
  interleave with them: address things by `item.path`, never by element position.
- *The typed view is read-only and derived,* not a second tree. One source of truth (the tree); a change is `updateAt`
  and a re-read. The cost of re-reading is the thing to measure before (b).
- *Repeat copies stay in the model, flagged `generated`,* because they are in the file; `walkItems(…, {generated:
  false})` gives what the Layers panel shows.
- *Strict JSDoc, not `.ts`* (the standing guideline until R3 is decided). Discriminated unions, `readonly` trees and
  typed factories were fine in JSDoc under the strict config, which weakens the "JSDoc is too verbose for the data
  model" argument for R3; `saxes` needed `skipLibCheck` in `tsconfig.strict.json`.
- *A feature is typed only by calling its owning module's parser,* never a second copy of the grammar.

**What step (a) changed about the plan.**
- **R2 evidence, and a cheap first unblocking.** The pure parsers already exist, but they sit in modules that do DOM
  or `paper.js` work on import, so a headless engine cannot reach them. Both blockers were small: `math.js`
  built a scratch `<svg>` at load (now on first use), and `dash-fit.js` imported one attribute name from
  `taper-stroke.js` and with it `paper.js` (the taper names and parsers now live in `width-profile.js`, re-exported).
  Every such module is the same problem R2 describes; each new feature should keep its attribute names and parsers in a
  DOM-free file from the start.
- **The live-effect registry blocks typing `se:fx`.** `parseFxStack` validates against `registry`, which the effect modules
  fill when they initialise. Typing the stack needs the registry importable on its own (or a looser parse that does not
  check effect names). The same shape will recur for any feature with a registry.
- **Some grammars exist only inside validators** (`se:arrow-*`, `se:wrap-width` / `se:valign` / `se:soft`): there is no
  parser to call. They need an exported parser in the owning module before the model can type them; that is also what
  `checkDrawing`'s `registerAttrValidator` should be built on.
- **Two parallel descriptions of a drawing remain (the DOM `checkDrawing` rules and the model's types).** They agree on
  the corpus today. When (b) lands, the model's invariants replace the DOM-shape rules; until then a model-native
  `check` for the CLI would duplicate them, so the CLI should keep running `checkDrawing` in a browser, or wait for (b).
- **Measurement is untouched.** (a) never needed a bounding box. The "hard parts" above (text layout, stroked bboxes) are
  still all ahead and are the real risk of (b)/(c); a spike on one of them (area text) before committing to (b) is
  worth more than more typed fields.
- **Bundle:** wiring the model into `Editor.js` adds `saxes` (and `xmlchars`), about 84 KB of source before
  minification (the minified size is not measured); the model's own code is small. Count it against the R6 budget, or use
  the browser's `DOMParser` for the editor build and keep `saxes` for Node (the infoset tests already show the two
  agree).

**Left in (a).**
1. Typed fields for `se:fx` (registry), `se:arrow-*` and the area-text attributes (export parsers), then repeat, mirror,
   puppet pins and connector binding.
2. A policy for unknown elements and foreign `<style>`: today they are kept verbatim as ordinary nodes and read as
   `other` items; decide whether the editor must preserve them across a save (it does not today).
3. The headless `inspect` entry point for the [LLM CLI](llm-cli.md) (`readDrawing` summary; `check` waits, see above).
4. A model-vs-editor property test: for generated drawings, the typed view of the saved SVG equals the typed view of the
   DOM (fast-check is already a dev dependency).

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

**Evidence from R1 step (a).** The modules that own the `se:` grammars mix pure parsers with DOM or `paper.js` work, so
a headless consumer cannot import them: `math.js` built an `<svg>` at load and `dash-fit.js` reached `paper.js` through one
constant (both fixed, see [R1](#step-a-status)). Splitting each feature into a DOM-free part (attribute names, parser,
formatter, geometry) and the canvas glue is the same work as this item, and the model is its first consumer.

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

**Datapoint from R1 step (a) (2026-10-15).** The document model was written in strict JSDoc (discriminated unions, `readonly`
trees, typed factories, a type-guarded walker) and is clean under `tsconfig.strict.json`; the JSDoc was verbose but not a
blocker, which weakens the case for `.ts` on the data model alone. The remaining case is generated declarations (R2) and one
style across the editor.

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

`userExtensions` (a dynamic `import()` of a host-given path, consumed in `EditorStartup.extAndLocaleFunc`; no host uses it)
goes with the extension API if that is dropped.

Size: L, incremental, low risk per feature.

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

**Cost to budget (from R1 step (a)).** Wiring the document model into the editor adds `saxes` + `xmlchars` (about 84 KB of
source before minification; minified size not measured). The browser's `DOMParser` could parse instead in the editor
build, keeping `saxes` for Node only (the model's infoset tests show the two agree on the corpus).

Size: M.
