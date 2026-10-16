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
| Tree | `node.ts` | Frozen, structurally shared XML tree: element / text / cdata / comment / pi, plus the declaration and doctype around the root. `updateAt(root, path, fn)` copies only the ancestors, so the previous root is the undo snapshot; an edit that changes nothing returns the same root |
| Parse | `parse.ts` | `parseSvg(text)` on `saxes`, namespace processing off, qualified names kept as written (saved drawings used `se:` without declaring it); `SvgParseError` carries the line |
| Serialize | `serialize.ts` | `serializeSvg(doc, {format})`: `preserve` writes the tree as is, `indent` is the editor's save layout (`svgToString`); the editor's `toXml` escaping; tabs and line breaks in attributes as character references |
| Typed view | `drawing.ts` | `readDrawing(doc)`: layers (top-level `<g class="layer">`, `<title>` name, hidden / locked / template), items (group with a `role`, shape, path, text, image, use, other), `<defs>` children, orphans, ruler guides, every `se:*` attribute verbatim in `item.se`. Every item has a `path` into the tree |
| Features | `features.ts` | `readFeatures(se)`: corner radius, taper / taper style, width profile, dash fit, art brush, blend, brush library, each read with the parser its owning module exports; `invalid` names a typed attribute that does not parse (the `se-attr-parse` condition) |

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

**Pattern, settled by the pilot (`core/draw-snap.ts`, 2026-10-16).** A module with per-canvas state becomes a service:
`export interface DrawSnap {…}` plus `createDrawSnap(host): DrawSnap`, and the canvas holds it as one member
(`this.drawSnap = createDrawSnap(this)`; one line in `svgcanvas-members.d.ts`, the four `any` lines in
`svgcanvas-internal.d.ts` deleted). Callers say `svgCanvas.drawSnap.snapDrawPoint(…)`; there is no flat compatibility
member, because the callers were few and all in the repo (a module with outside callers would keep a generated shim for
a while). Rules that made it work:
- **The explicit interface breaks the type cycle**: the factory's return type is written down, so the class's type does
  not depend on inferring the body.
- **`host` is `Pick<SvgCanvas, …>` of what the module reads**, not the whole canvas. Passing the JS class `this` to a
  function typed with the whole d.ts canvas fails on unrelated drift (`addExtension`, `getStrokeWidth` disagree between
  the class and the d.ts); the subset checks only what the module uses, and says what it needs.
- **No optional chaining for "the module may be absent"**: the service is always there. Unit-test canvases that call
  through `event.js` get a `drawSnap` stub.
- A stateless module needs no service: export the functions, take `host` as the first argument (`clear.ts`'s
  `clearSvgContentElement(host)` and `sanitize.js`'s `sanitizeSvg(host, node)` went this way; their two members left
  `svgcanvas-members.d.ts`).
**Which members move and which stay (2026-10-16).** Move a member when its callers are core modules, built-in extensions
and unit tests of the module itself (they import the function and pass the canvas). Keep it on the canvas, typed
properly, when editor panels or components call it or their unit tests mock it through `svgCanvas` (`offsetPath`,
`strokeToPath`, `hasVisibleStroke`, `segmentSelection`, `getSegmentParams`, `cutShapes`: the mock canvas is how those tests
isolate the UI, and the e2e specs use `window.svgEditor.svgCanvas.x` as their handle). Those members are the facade; the
thin `canvas.x = (...a) => x(canvas, ...a)` shims in `cutter.js` and `segment.js` stay until the facade is written
down as one typed object. Moved so far: `drawSnap` (service), `clearSvgContentElement`, `sanitizeSvg`, `findSameAs`,
`selectSameAs`, `splitIntoGrid`, `transformEach`. The gesture state that `event-*` modules parked on the canvas
(`groupRotateCenter`, `dragStartTransforms`, `spaceKey`, `addedNew`, …: fourteen loose members) is now one object,
`svgCanvas.gesture` (`core/gesture-state.ts`: `GestureState` and `createGestureState()`, every field at rest from the
constructor, so no reader sees `undefined`); unit-test canvases that run the event modules get
`gesture: createGestureState()`.
**The facade, as it stands (2026-10-16).** `svgcanvas.d.ts` (the class), `svgcanvas-members.d.ts` (`AttachedMembers`: typed,
~310 members) and `svgcanvas-internal.d.ts` (`InternalMembers`: `any`, ~195 members core modules share) are the facade
and its plumbing. Three tests keep them honest: `svgcanvas-dts-drift.test.js` (every runtime member is declared as public
or internal, none is both, no internal one is stale, and now **no required public member is missing at runtime**: the
phantoms `undo`, `redo`, `getLayer`, `getNumLayers`, `getCurrentLayerName`, `unbind`, `getPrivateMethods` were removed and
the gesture fields that only exist during a gesture are optional), and `svgcanvas-facade.test.js` (**the editor and the
extensions never call an `any` member**: ten that they did were typed and promoted). Eleven members nothing called
(`getCanvas`, `getVersion`, `getSnapToGrid`, `getPaintOpacity`, `setFillPaint`, `setStrokePaint`, `setIdPrefix`,
`getFontFamily` / `getFontColor` / `getFontSize`) were deleted. What a deeper facade would add (types derived from source,
the d.ts files deleted) needs the members to leave the canvas, module by module as above; until then a new member is
declared in `svgcanvas-members.d.ts` if the editor calls it, else in `svgcanvas-internal.d.ts`.
Tests spy on the service (`vi.spyOn(canvas.drawSnap, 'snapDrawPoint')`). Next: the other state the canvas carries as loose members (`selectorManager`, `pathActions`, the cursor hint, the drawing handles), then the 5–10-member modules (`boolean-ops`, `clip-mask`, `image-crop`).

Size: L, fully incremental, low risk per module.

## R3. TypeScript

**Decision (2026-10-16): `.ts` for the engine, incrementally.** The toolchain is in and proven on four leaf modules
(`proportions`, `namespaces`, `se-namespace`, `geometry-remap-registry`). The case for `.ts` that the document model's JSDoc
datapoint left standing: `tsc --emitDeclarationOnly` can replace the hand-written d.ts once R2 removes the attachment
pattern, one style across the code, and R1's data model reads better as types than as JSDoc. The conversion itself stays
opportunistic and small per module.

**Toolchain, done:**
- **Lint:** ESLint 9 + `neostandard` (`eslint.config.mjs`) replaces `standard`, which does not lint TypeScript. One style over
  `.js` and `.ts`; `no-var` stays an error (neostandard only warns), `@typescript-eslint/no-explicit-any` is an error in
  `.ts`. ESLint does not read `.gitignore`: ignores are listed in the config. The three hand-written d.ts files, which
  `standard` never linted, were autofixed. The 24 stale `eslint-disable` directives are not reported
  (`reportUnusedDisableDirectives: 'off'`, as `standard` behaved); cleaning them up is a possible small task.
- **Build and tests:** Vite 7 and vitest resolve `./x.js` to `x.ts` from JS importers (checked in build, dev server and
  vitest). Nothing to configure.
- **Plain Node is the catch.** Node does not map `.js` to `.ts`, and the headless engine (the document model, the LLM CLI) runs
  in plain Node using its built-in type stripping (22.18+; CI is 22.x, `engines` is now `>=22.18`). So a converted module is
  imported as `./x.ts` everywhere. `scripts/check-ts-imports.mjs` (a `pretest` gate) fails on a `.js` specifier whose file now
  exists only as `.ts`; `--fix` rewrites them. `tests/unit/model-features.test.js`, which spawns a bare `node`, is what found it.
- **tsconfig:** `isolatedModules`, `erasableSyntaxOnly` (so converted code runs under type stripping), `allowImportingTsExtensions`
  (`noEmit`). `tsconfig.strict.json` lists `.ts` files by their `.ts` name. The checks stay as before: non-strict for
  everything, strict for the listed files.
- **Coverage:** `vite-plugin-istanbul` and vitest's istanbul provider include `.ts` (`vite.config.mjs`, `nyc.config.js`);
  `proportions.ts` shows in both the unit report and the instrumented e2e bundle.
- **The browser unit harness** (`tests/e2e/unit/*.spec.js` via `src/editor/tests/unit-harness.html`) loads a copy of the core
  sources as raw ES modules, which a browser can't do for `.ts`. `scripts/copy-static.mjs` therefore transpiles the copied `.ts`
  files to `.js` with esbuild, rewrites their `./x.ts` specifiers to `./x.js`, and instruments that copy (the full e2e run
  found it; the unit tests could not). The harness page itself still imports `./vendor/svgcanvas/core/x.js`.
- **Gates and docs tools:** `check-dom-scope`, `check-layers` and the file map see `.ts` (not `.d.ts`).

**Converted:** `proportions`, `namespaces`, `se-namespace`, `geometry-remap-registry`, `math`, `units`, `common/util`,
`dataStorage`, `extension-hooks`, `draw-snap` (also the R2 pilot), `common/logger`, `common/browser`, `common/initGuard`, `encoding-utils`, `model/node`,
`text-wrap`, `svgroot`, `load-image`, `model/parse`, `model/serialize`, `model/features`, `model/drawing`, `model/index`, `width-profile` (typedefs became exported interfaces; `any` only where a store is heterogeneous, with an
`eslint-disable` and the reason).

**Left (the conversion):** `core/paint` and `core/touch` (DOM-heavy `any` / `init(svgCanvas)` shapes, easier after R2), then up the import graph, `svgcanvas.js` last; the editor
after the engine, with its own strict tsconfig.
Per module: `git mv x.js x.ts`, move the JSDoc types into syntax, `node scripts/check-ts-imports.mjs --fix`, change the
`tsconfig.strict.json` entry, `npm run file-map`, tests green. Pitfalls: no big-bang conversion, no `any` to silence errors,
no enums or parameter properties, and the hand-written d.ts files (`svgcanvas*.d.ts`) still describe the canvas until R2.
Retire the d.ts and the drift test only with R2.

Size: M for the toolchain (done), L for the conversion (small per module).

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

**Path:** the opt-out config exists (`disabledFeatures`, 2026-10-16: names with or without `ext-`, applied to the defaults
and to an explicit `extensions` list; `docs/tutorials/ConfigOptions.md`). The plugin uses it (1.0.51, local commit: `disabledFeatures: ['opensave']`, its drift test now checks the
disabled names are real built-ins). **Left: cut a fork release that contains `disabledFeatures` and pin it in the plugin's
`SVGEDIT_RELEASE`** (still `v7.4.1-fork.7`, which lacks it), so a fresh clone or CI builds the same editor; then move
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
