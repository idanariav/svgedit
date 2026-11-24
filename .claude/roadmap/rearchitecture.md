# Re-architecture (R1–R4, R6, R8–R13)

Part of the roadmap (index: [`../roadmap.md`](../roadmap.md)). Raised 2026-10-15 from a "what would we build
differently from scratch" review, with everything on the table, including a rewrite of the canvas engine. Nothing here
is scheduled; each item says what it would take and where to start.

**Seams to keep whatever is rewritten:**
- the **saved file format**: SVG with `se:` attributes, as the plugin's `.svg` and `.md` drawings hold it, read and
  written losslessly (the round-trip corpus, `scripts/repair-drawings.mjs`'s reader and `scripts/check-model-roundtrip.mjs` are the oracle);
- **`src/editor/hostApi.d.ts`**, the plugin's contract (typechecked against `Editor`);
- the **command ids** (hotkey overrides and favorites store them) and the command registry's run/enabled/params shape;
- one self-contained **`dist/editor/Editor.ts`** (the plugin copies only that file; see R6).

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

**Where this stands (2026-10-18).** R2, R3 and R4 are done (R4 but for the optional `features/` rename) and R6 was measured and needs nothing. For R1:
(a) the model reads and writes the whole vault losslessly and `npm run cli` inspects, reads and checks drawings with no browser; **(b) is in:**
`core/model-render.ts` renders a model into DOM and patches DOM from one model to another (`reconcile`: shared subtrees skipped by identity, children
matched by id, removed elements pooled so the same node comes back), with `readDom` as its inverse and the 32 round-trip fixtures as the oracle;
**(d) is in:** undo and redo are model snapshots (`core/snapshot-history.ts`, on by default; see `architecture.md` › Undo), the whole e2e suite
(592 specs, including the every-command-undoable sweep over 32 fixtures) passes on it, and an undo or redo costs about what the commands cost (≈25 ms
at 5,000 elements in the instrumented build). The old machinery is gone (2026-10-18): `transaction.js`'s snapshot-and-diff is a model comparison, `undo.js`'s type-keyed handler is deleted, and
`history.js` shrank from 900 lines to 300 (the command types are labels; `ChildListCommand` and `CharacterDataCommand` went). What remains of the
commands is at the 57 `BatchCommand` and 88 `ChangeElementCommand` sites: they say *that* a step landed and what it is called, and
`isEmpty()` still decides whether a step landed. Left of R1: **(c)** is under way. The write path exists (`snapshotHistory.edit(label, fn)`: `fn` maps the model to the model, the renderer makes the DOM
show it, the step is recorded; DOM-free edits in `core/model/edit.ts`) and commands are moving onto it, one group at a time, with an ESLint rule
(`core/model-commands.ts`) that keeps a ported group from writing the live DOM again. Ported: move to top / bottom / up / down, switch z-order, delete,
a plain attribute change on the selection (the property panel's path), element creation (`insertElementFromJson`, `insertLooseElements`; the drag-drawn shapes and images preview as ephemeral elements and `commitDrawn` hands them over on mouse-up), group / ungroup, duplicate, paste, every layer operation except lock / template (view state), moving a plain shape (its own coordinates, a leftover pure translation folded in), and single-element attribute sets (`setElementAttributes`: corner radius, arcs, image crop, color shift, taper, clip / mask, polystar), finished gestures on plain shapes (drag, resize, rotate: `bakeDrag`, `commitTransforms`), flip, path-node edits (`PathObject.endChanges`), repeat, the effects filter (glow / shadow / outline) and library brushes. Gestures on plain shapes are shown by the renderer (`snapshotHistory.preview` / `endPreview` / `cancelPreview`; `dragPlan`, `previewDrag`, `previewScale`, `previewTurnedScale`, `previewAfter`, `rotationPlan`, `previewRotation`, `rotationGroupPlan`, `previewGroupRotation` in `model-commands.ts`): drag (also of a turned shape and of groups), resize (also of a turned rect / ellipse / circle / image and of a multi-selection), rotation (single and multi), and the freehand pencil and the freehand shapes preview as ephemeral elements. What is left on the old transform-list preview: a general matrix transform, a rotated line / polyline / polygon / path or multi-selection resize, anything clipped, masked or carrying feature data (`se:` / `data-se`), and text. **(e)** is under way too:
`registerTool` tools are Begin / Preview / Commit (the preview is an overlay, `pointerUp` returns `{ create: json }`, the registry creates the element
through the model); the shaper, shape-family, polystar and brush tools are on it. `npm run check-dom-writes` ratchets what is left (1,112 live-DOM
writes in 100 files in `core/` and `extensions/`, `scripts/dom-writes-baseline.json`; a file may only go down). What is left is the measuring half and
not a list of commands: move / resize / rotate / flip of anything with a transform, clip, mask or feature data (they bake transforms with the browser's
transform lists and `getBBox`), path and node editing, text layout and editing (`text-actions.ts`), freehand and legacy text creation, the shape library
tool, and the extensions that derive geometry (blend, art-brush, taper, glow / outline / shadow regions, connector, mirror, repeat). Each needs its
geometry computed on the model (pure matrix and path math, plus a text-measurement service) before it can state its change as a model edit; that is
a design task of its own, so start with the text-measurement spike named above, then flip / rotate / scale as matrix math on the model. When none of those writes the live DOM, a check
script can forbid it outside the renderer, the command types can go for a one-call `commit(label)`, and the DOM is a view in
the full sense. The derived-data features that regenerate on `elementChanged` (art-brush, corner radius, glow / outline / shadow regions, markers, mirror,
taper, text-on-path, connector) should learn `restored` as blend did, so an undo never re-derives what the snapshot already holds (nothing fails
without it today). The rest touches the 94 `getBBox`, 55 `getStrokedBBox` and 51 `transact` sites; R2 and R3 make it much cheaper.

**Text measurement spike (2026-10-18).** The model holds text boxes in a cache the renderer fills (`core/model/text-metrics.ts`, `core/text-measure.ts`; see `architecture.md` › Text boxes on the model), keyed by model-element identity plus inherited style, with a character-count estimate as the headless fallback. `tests/e2e/text-metrics.spec.js` checks the cache against the live `getBBox` after a load, an edit (also one made on a `<g>` above the text), an undo and a redo, and prints the cost. What it settles: text does not have to be laid out by the model; the browser stays the layout engine and the model remembers what it said. What it does not settle: nothing consumes the cache yet (`getBBox` callers still ask the DOM), the estimate was compared on one sample only, and the cost of measuring after a commit is a walk over every text of the drawing. The shape half followed (`core/model/bounds.ts`): the box of every basic shape and path computed from attributes, equal to the browser's on all 170 shapes of the fixtures and on generated curves (arcs within 0.08, see `techdebt.md`), plus a port of VectorCraft's stroke reach (miter tips, square caps). `getBBox` and `getStrokedBBox` now use it where the DOM cannot (headless `getBBox`) or where it adds to the DOM's answer (stroke tips); the model is *not* tried first in a browser, because it measured 30 to 50 times slower than native `getBBox` and the call sits on every gesture step. Matrices and groups followed (`model/matrix.ts`; a transform's effect on a box is exact, a group is the union of its children, and `getStrokedBBox` turns and scales the stroke of a shape with its transform), checked against rendered ink in `tests/e2e/model-ink.spec.js`. The headless entry point followed (`npm run cli -- bounds`, `llm-cli.md`), and a check of the editor's box for a turned curve against rendered ink found two real bugs in `getBBoxWithTransform`'s lone-`rotate` branch, both fixed (2026-10-18): it rotated a curve's control points instead of measuring its extent (a turned arch was up to 50 units too big), and it added an empty `<path>` to the drawing on every measure of a rect turned by a right angle (`checkDrawing` rule `empty-path`, repair `empty path elements` in `scripts/repair-drawings.mjs`, run as a dry run over every vault and drawing folder on 2026-10-18: none needed it, so the entry was deleted).

### Not worth doing (decided 2026-10-18)

R1 reached the end state that pays: the model owns state and undo (snapshots), the DOM is the view and the measurer, and a drawing can be read, measured and checked with no browser. The rest of R1 is a long way for little, so stop here unless a concrete need appears:

- **Driving the remaining live-DOM writes to zero** (`npm run check-dom-writes`, 1,112 in 100 files). What is left is the measuring half (transform bakes, path and node editing, text layout, the extensions that derive geometry), each needing its geometry on the model; the gain is internal tidiness, and the model-first measurement below shows the DOM is the better measurer in a browser. Keep the ratchet (a file may only go down) and port a group when a feature touches it anyway.
- **Asking the model before the DOM in a browser.** Measured 30 to 50 times slower than native `getBBox` (0.11 ms against 0.002 ms for a small path, 12 ms against 0.22 ms for 2,000 cubics) on a call that runs on every gesture step. The model answers where the DOM cannot (headless) or adds to the DOM's answer (stroke tips).
- **Exact arc extrema, tight butt ends, markers in `strokedBounds`.** Each is a small accuracy gain (arcs 0.08 units, a butt end up to half the stroke width, arrowheads) with no consumer asking; the ink oracle (`tests/e2e/model-ink.spec.js`) will say when one starts to matter.
- **Laying text out on the model.** The browser is the layout engine; the model remembers what it said (`model/text-metrics.ts`).
- **Converting `history.js`'s remaining `BatchCommand` / `ChangeElementCommand` sites to a one-call `commit(label)`.** They only say *that* a step landed and what it is called; a rename for its own sake.

**Decided (2026-10-18):** the editor's `getStrokedBBox` of a *group* includes its children's strokes (`paintedGroupBox` in `core/bbox-utils.ts`: the model's stroked box of the group in its parent's space, exact for a turned group too, where the old DOM box was the turned corners of the unturned box). Used when the model can measure everything in the group (no text, images or `use`), the group's `transform` is a similarity, and it holds at most 600 elements (about 6 ms for 500, against 0.05 ms native); otherwise the DOM box plus the group's own half-width, as before. Selection boxes of groups grow by the outermost child stroke; align and distribute follow (`tests/e2e/align-groups.spec.js`); checked against rendered ink (`model-ink.spec.js`). A multi-element box now starts from empty, so a turned group's loose DOM box no longer stays in the union.

What to spend the time on instead: the feature roadmaps below ([drawing tools](drawing-tools.md), [appearance](appearance.md), [objects, layers, text](objects-layers-text.md)); the CLI's `run` verb only if an LLM workflow is actually planned.

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
- **Bundle:** wiring the model into `Editor.ts` adds `saxes` (and `xmlchars`), about 84 KB of source before
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

**Status (2026-10-17).** Done for the attachment pattern; the canvas itself is still one big object. No core module attaches
members with `svgCanvas.foo = …` any more, and the hand-written `svgcanvas-members.d.ts` / `svgcanvas-internal.d.ts` are gone.

**How a module gives the canvas its members.** `export const createX = (canvas: SvgCanvas): XApi => { …; return { a, b } }`, with
`export interface XApi` written in the same file (the explicit interface is what breaks the class-type cycle). `svgcanvas.ts`
attaches it with `attachApi(this, 'x', createX(this), initGuardRegistry)` (which warns when two modules use one name) and lists
`XApi` in `type ModuleApis = A & B & …`, which the class extends through its base-class type. A module that sits under another
(`text-attrs` under `elem-get-set`, `layer-ops` under `draw`, `group-ops` under `selected-elem`, `path-method` under `path`) is
merged by its parent (`Object.assign(canvas, createY(canvas))`) and still listed in `ModuleApis`. Data that is canvas state
(`undoMgr`, `contentW`, `pathActions`, the drag deltas) is `declare`d as a field of the class. A side-effect-only module
(`touch`, `warp`, `distort`, `live-effects-distort`) keeps a plain `init()`.

**Services.** Where the members form a feature with few callers, the module returns *one* object and the canvas holds it as one
member (`svgCanvas.clipMask.setClip()`, `drawSnap`, `booleanOps`, `imageCrop`, `shapeBuilder`, `textActions`, `pathActions`,
`gesture`): no flat compatibility members, callers (editor, tests) use the nested object, and `check-canvas-calls` fails on a
stale editor call. The rest stay flat on the canvas (the public editing API: `clearSelection`, `setFontSize`, `createLayer`, …),
because hundreds of editor, extension and test call sites and the plugin's host API (`hostApi.d.ts`) use them; their types
come from the module's interface, not from a second declaration.

**Guards.** `tests/unit/svgcanvas-members.test.js` compares a live canvas with the class and the `ModuleApis` interfaces (every
runtime member declared, every required one present, none declared twice); `svgcanvas-facade.test.js` keeps `any` out of the
class and the attachment through `attachApi`; `npm run check-canvas-calls` type-checks the editor's calls into the canvas.

**What is left of R2.** The class still carries ~190 state accessors and ~50 `declare`d fields, and hosts see all of it. Narrowing
it to an explicit facade (what `hostApi.d.ts` lists, what extensions call) and moving the loose state into services
(`selectorManager`, the drawing handles, `state`) is the remaining work; it does not block R1.

Size: done; the rest is optional.

## R3. TypeScript

**Status (2026-10-17).** 113 of the 118 engine modules are `.ts` (with `svgcanvas.ts`) (the 5 left: the shim `path-seg-shim`, and
`history`/`historyrecording`/`transaction`/`undo`, which R1 deletes); every
converted module is in the strict typecheck. `src/editor` is next and is being typed as a ratchet (see "The editor" below).

**Decision (2026-10-16): `.ts` for the engine, incrementally.** The toolchain is in and proven on four leaf modules
(`proportions`, `namespaces`, `se-namespace`, `geometry-remap-registry`). The case for `.ts` that the document model's JSDoc
datapoint left standing: `tsc --emitDeclarationOnly` can replace the hand-written d.ts once R2 removes the attachment
pattern, one style across the code, and R1's data model reads better as types than as JSDoc. The conversion itself stays
opportunistic and small per module.

**Toolchain, done:**
- **Lint:** ESLint 9 + `neostandard` (`eslint.config.mjs`) replaces `standard`, which does not lint TypeScript. One style over
  `.js` and `.ts`; `no-var` stays an error (neostandard only warns), `@typescript-eslint/no-explicit-any` is an error in
  `.ts`. ESLint does not read `.gitignore`: ignores are listed in the config. The hand-written d.ts files, which
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
`text-wrap`, `svgroot`, `load-image`, `model/parse`, `model/serialize`, `model/features`, `model/drawing`, `model/index`, `width-profile`, `measure`, `path-node-guides`, `debug-events`, `touch`, `path-utils`, `paint`, `dom-utils`, `text-rows`, `bbox-utils`, `anchor-path`, `shape-family`, `bezier-fit`, `width-outline`, `select-same`, `drawing-invariants`, `path-fit`, `path-edit`, `path-join`, `dash-fit`, `blend`, `pen-continue`, `path-simplify`, `warp`, `guides`, `smart-guides`, `live-stack`, `art-brush`, `live-effects`, `distort`, `corner-radius`, `gradient-edit`, `recolor`, `shape-recognize`, `arrow-align`, `paper-utils`, `taper-stroke`, `shape-builder`, `path-offset`, `boolean-ops`, `cutter`, `segment`, `split-grid`, `transform-each`, `clip-mask`, `image-crop`, `brush-stroke`, `live-effects-distort`, `json`, `layer`, `object-state`, `sanitize`, `svg-defs`, `layer-ops`, `tool-registry`, `art-brush-canvas`, `blend-canvas`, `copy-elem`, `group-detach`, `event-zoom`, `event-text-edit`, `event-group-context`, `blur-event`, `paste-elem`, `text-path`, `event-path-edit`, `event-rotate`, `event-resize`, `event-shape-draw`, `event-select`, `coords`, `recalculate`, `text-attrs`, `select`, `selection`, `group-ops`, `elem-get-set`, `selected-elem`, `path`, `text-actions`, `event`, `path-method`, `path-types`, `path-actions`, `svg-exec`, `draw` (typedefs became exported interfaces; `any` only where a store is heterogeneous, with an
`eslint-disable` and the reason).

**Left (the conversion):** the self-contained modules are done and the facade is typed (2026-10-16, see R2). The engine is done (`svgcanvas.ts` last, 2026-10-17); `path-seg-shim` is a shim and `history.js`, `historyrecording.js`, `transaction.js` and `undo.js` are not worth converting: R1 deletes them. The `strictNullChecks` errors a conversion hits are real ones (`getRubberBox()` and `getrootSctm()` are nullable now, with `requireRubberBox()` / `requireRootSctm()` for the gesture handlers; `path` in `path-actions.ts` is typed non-null, see techdebt); the editor after the engine, with its own strict tsconfig.
Per module: `git mv x.js x.ts`, move the JSDoc types into syntax (TypeScript's own `annotateWithTypeFromJSDoc` code fix does most of it through the language service API, but it drops the `?` of `[optional]` params, leaves an empty annotation for `module:` pseudo-types, and mixes up the `@param` / `@returns` of a function that follows a `@callback` / `@typedef` block, so read every signature it changed; a class's `this.x = …` fields need declarations; `/** @type {T} */ (expr)` casts become `(expr as T)`), `node scripts/check-ts-imports.mjs --fix`, change the
`tsconfig.strict.json` entry, `npm run file-map`, tests green. Pitfalls: no big-bang conversion, no `any` to silence errors,
no enums or parameter properties, and no hand-written declaration file describes the canvas any more (R2).
Retire the d.ts and the drift test only with R2.

**The editor (2026-10-17).** `src/editor` is JavaScript with JSDoc, 223 files. Under `strict` it had 5,862 errors in 159 files (almost all
DOM typing), so it is typed by a ratchet instead of a conversion: `scripts/check-editor-strict.mjs` (`pretest`; `src/editor/tsconfig.strict.json`)
runs `tsc --strict` over everything and fails on any error in a file listed in `src/editor/strict-files.json`. A file joins the list in the commit
that makes it clean, and the list only grows; `node scripts/check-editor-strict.mjs --report` prints the error count per file, fewest first.
Every file is on the list, so a new editor file is strict from its first commit. The editor is also TypeScript now (2026-10-17, a JSDoc-to-TS codemod plus hand fixes where TS is stricter than checkJs: `object` and `Object` are `any` in a JS file, `new Set()` is `Set<any>`, a `@returns {string|void}` collapses): all of `src/editor` is `.ts` except the CSS / data / locale modules, `browser-not-supported.js` (copied to `dist` as a classic script) and `Editor.ts`, a one-line re-export of `Editor.ts` that stays the HTML entry, the library entry and the bundle's name. The explicit `any`s are gone too (2026-10-17): the 175 that were left were narrowed (accessors to `string | null`, `EditorConfig` for `curConfig`, a discriminated `RepeatParams`, real types for the layer keyboard, the width / smooth tools, the connector's boxes, …) and `no-explicit-any` is an error across `src/editor/**/*.ts` like everywhere else. Typing it surfaced one more real fault: `Editor.setLogSink` declared its parameter as a function returning `void | null` instead of `(…) => void | null`, so a host could not pass `null`. What is left: the typedef comments whose `module:` pseudo-types became `any`, and some leftover `@fires` / `@function` doc blocks that describe nothing.
What made the first 3,000 cheap, and is what new code should use:
- `$id('x')` returns the element type of that id (`src/editor/ui-ids.d.ts`, generated from the panels' HTML and the templates inside the JS sources by
  `npm run gen-ui-ids`; `tests/unit/ui-ids.test.js` fails when it is stale); `$req('x')` is the non-null form for an element that must exist.
- `querySelector('se-…')` and `HTMLElementTagNameMap['se-…']` are typed through `src/editor/element-tags.d.ts` (kept in step with the
  `customElements.define` calls by `tests/unit/element-tags.test.js`); a component's `this.$x = /** @type {T} */ (this._shadowRoot.querySelector(…))`
  fields carry their tag's type; `requireOwnerEditor(el)` (domScope.ts) is `ownerEditor` for code that only runs inside a mounted editor.
- `src/editor/globals.d.ts` types the `window` globals (`seAlert`, `sePrompt`, `svgEditHost`, …), `.html` imports and `EditorInstance`.
- TypeScript's own "infer from usage" code fix (`getCodeFixesAtPosition`, fix name `inferFromUsage`) writes plausible JSDoc for implicit-any
  parameters; skip the results that come out `any`/`undefined`/`never`/`null` and read the rest (it narrows to the argument types it saw, and it
  wrote a few `import("packages/…")` paths and duplicate `@param`s that had to be fixed by hand).
- Pitfall: a statement that starts with a cast, `/** @type {T} */ (x).y = …`, parses as a call of the line above in a semicolon-free file; start it
  with `;`.
- The `Editor` / `EditorStartup` split: `EditorStartup` is the base class that builds the editor in `init()`, and that code calls members only the
  subclass `Editor` defines. `init()` and `extAndLocaleFunc()` are annotated `@this {EditorInstance}` (the subclass) rather than the base calling through
  casts, the members both classes set late are declared as typed class fields (`workarea`, `$svgEditor`, `canvMenu`, …), and the strict config turns
  `strictPropertyInitialization` off for that reason (a constructor, then an async `init()`). Merging the two classes would be cleaner still.
- `svgCanvas.bind(event, handler)` is generic in the payload (`bind<Arg>`): the handler states the type of the argument it expects; there is no
  per-event payload table (the extension hooks have one, `extension-hooks.ts`).
- Typing found real faults (since fixed or removed): methods that did not exist (`Editor.setLang`, `getButtonData`,
  `changeZoom`), a `confirm` that was never awaited, an `appendChild(string)`. A dead hook (`langChanged`) went with the method that fired it.
- After the ratchet reaches the remaining files, the conversion to `.ts` is mechanical (`annotateWithTypeFromJSDoc`), as it was for the engine.

Size: M for the toolchain (done), L for the conversion (small per module).

## R4. Built-in features are not extensions

**Today.** 45 `ext-*` modules, including what is core to the editor (`ext-path-edit`, `ext-shapes`, `ext-panning`,
`ext-grid`, `ext-markers`, `ext-connector`, `ext-layer_view`, `ext-eyedropper`…), all loaded through upstream's
third-party extension API: `runExtensions` hook fan-out over every extension (which once let one extension's
`undefined` cancel another's `preventDefault`), `addLangData`, a `defaultExtensions` list in `ConfigObj`, and the eager
glob in `extensionRegistry.ts`. Hosts choose features by name: the plugin's `SvgView.ts` sets `noDefaultExtensions`
and repeats 43 of the 45 names by hand (leaving out `ext-opensave` and `ext-theme-toggle`), so every new built-in tool
also needs a plugin release. Puppet warp still uses the legacy mouse hooks.

**Target.** A built-in feature registers its commands, `registerTool` tools, panel sections and canvas hooks through
explicit, typed APIs at startup, in `src/editor/features/<name>/`. Hosts turn features *off* (`disabledFeatures:
['opensave']`) instead of listing everything on. The extension API stays only as a small typed surface for genuinely
third-party add-ons (none exist today, so it could also go).

**Path:** the opt-out config exists (`disabledFeatures`, 2026-10-16: names with or without `ext-`, applied to the defaults
and to an explicit `extensions` list; `docs/tutorials/ConfigOptions.md`). The plugin uses it (1.0.51, local commit: `disabledFeatures: ['opensave']`, its drift test now checks the
disabled names are real built-ins). The fork release `v7.4.1-fork.8` carries it and the plugin pins it (1.0.52). Next: move
features one at a time, deleting extension hooks as their last user goes; puppet warp after the `registerTool` session
concept ([infrastructure](infrastructure.md) › Tier 0 follow-ups).

**Status (2026-10-17).** The host-given `userExtensions` (a dynamic `import()` of a path) is gone: neither the editor nor the plugin used it. Every built-in is `defineFeature({ name, init(editor) })` (`extensions/defineFeature.ts`; typed hooks, one shared `addFeatureLocale`), instead of an object whose `init` read `this`. The hooks nothing implemented (`toolButtonStateUpdate`, `beforeClear`, `onSavedDocument`, `elementRenamed`) are deleted. `gestureEnded` (a typed canvas event, after every pointer release in every mode) replaced the `mouseUp` hook in `ext-glow` / `ext-outline` / `ext-shadow`, which also fixes their region refresh after a select-mode move (the hook never ran for select). `ext-repeat`'s centre pick is a `registerTool` tool now. `ext-connector` is not a tool but an observer of two built-in modes (it binds a drawn `<line>` to shapes before the draw is kept, and re-routes lines during a select drag), which `registerTool` cannot be (a tool's id is its own mode), so the canvas announces the gestures instead: `gestureStarted` / `gestureMoved` / `gestureReleased` (before the keep-or-discard decision) and `gestureEnded` (after, every mode) are typed canvas events, and the `mouseDown` / `mouseMove` / `mouseUp` hooks are gone along with the result handling in `event.ts` that only they used (keep / replace / claim). The connector's dead marker block went too (`ext-markers` converts a line with a mid-marker itself). `selectedChanged`, `elementChanged`, `zoomChanged` and the other void hooks (`canvasUpdated`, `elementTransition`, `layersChanged`, `layerVisChanged`, `afterClear`, `onOpenedDocument`) are canvas events too (`svgCanvas.bind` in `init`; the editor `call`s them), `ext-repeat`'s centre pick and `ext-puppet-warp` are `registerTool` tools (puppet warp with `ownsUndo: true`: its session transaction is its own, so a cancelled drag no longer dooms the session), and the extension context-menu registry (never shown, nothing used it) is deleted. What is left of the hook system: `keyDown` and `IDsUpdated`, the two whose return value the dispatcher needs. Next: rename `extensions/` to `features/` if it is still wanted.

Size: L, incremental, low risk per feature.

## R6. Bundle size and startup

**Today.** `dist/editor/Editor.ts` is 3.33 MB (2026-10-15, after the svgcanvas alias removed the duplicated core
modules; it was 3.83 MB) with paper.js, clipper-lib, imagetracerjs, spiro, the shape library JSON, the Google-fonts
catalog and all 45 extensions in one file. The build sets `inlineDynamicImports`, which turns every `import()` back
into an inline module, because the plugin ships only `Editor.ts` (`fetch-svgedit-dist.mjs`); so code splitting cannot
help without a plugin change.

**Measured (2026-10-16, `npm run bundle-report`, `npm run bundle-size`).** `Editor.ts` is 3249 KB minified (4844 KB rendered
across 775 modules). By share of the rendered size: `packages/svgcanvas/core` 29% (1411 KB, 105 files), `src/editor/components`
10%, `paper` 8.5% (413 KB), the editor's top-level files 8%, **`ext-shapes` 7.4% (360 KB: the shape library data)**,
`clipper-lib` 4.4%, panels and dialogs 4% each, the toolbar icons 3.7% (241 files), `ext-fonts` 2.4% (the font catalog),
`culori` 2%, `i18next` 1.6%, the 43 other extensions together about 8% (10–35 KB each). Startup (uninstrumented build,
`vite preview` on this machine, median of 7): `#svgroot` at 234 ms and extensions added at 243 ms from navigation; with the
CPU throttled 4x, 620 / 644 ms. The Editor.ts fetch is 96 ms of that on localhost. **So startup is not a problem, and
splitting the bundle would not buy a visible win**; what is left to weigh is the plugin's main.js parse cost at Obsidian
launch (the whole editor sits in `main.js`), which this machine cannot show and a phone would.

**Options, cheapest first:**
1. **Measure:** done (above). `npm run bundle-size` fails over a 3400 KB budget (`MAX_MINIFIED_KB` in
   `scripts/bundle-report.mjs`; raise it in the commit that adds the weight); it is not in `pretest` (a build takes about a
   minute). A startup-time budget in e2e would be flaky, so there is none.
2. **Defer evaluation inside the single file:** the shape library data (360 KB) and the font catalog (117 KB) are 10% of
   the rendered size and are parsed at import; making them lazy (first open of the shape library / fonts panel) costs no
   plugin change. `paper` (413 KB) is already a lazy scope but is imported eagerly, so its source is still parsed.
3. **Ship chunks:** teach the plugin to copy a `svgedit-dist/` folder, drop `inlineDynamicImports`, and lazy-load rarely
   used tools. Cross-repo; the numbers above say startup does not need it.

**Cost to budget (from R1 step (a)).** Wiring the document model into the editor adds `saxes` + `xmlchars` (about 84 KB of
source before minification; minified size not measured). The browser's `DOMParser` could parse instead in the editor
build, keeping `saxes` for Node only (the model's infoset tests show the two agree on the corpus).

Size: M.

## Root causes behind the fixes of Oct–Nov 2026 (R8–R13)

Raised 2026-11-24 from a review of the fix commits since mid-October (fork and plugin, ~15). Almost every one traced to one
of the structural weaknesses below; each is spread over many call sites, so the same bug keeps coming back in a new form.
Suggested order: R8 → R9 → R10 + R13 → R11 → R12.

### R8. A change to the drawing is announced from the history, not by every call site

**Today.** Three signals are raised by hand and independently: an undo step (a command lands), `call('changed', elems)`
(90 sites in core and the editor) and, from that, the host's dirty flag (the plugin's `svg-changed`). They disagree: a
marquee pushed a "position" step (8364dc73); no-op path edits recorded steps and a finished Curvature path announced nothing,
so the host did not autosave (392929f5); a colour click was not an edit (8e1b7b2a); drags that changed nothing fired
`changed` (debug log 2026-11-24). `changed` also does two jobs at once: "the document changed" (host dirty flag, derived-data
extensions re-deriving) and "refresh the panels".

**Target.** Since R1(d) the history knows exactly when the drawing changed: the model the DOM shows is a new object when, and
only when, something differs (`share` keeps the old one otherwise). One announcer compares it with the last one announced
after every step, undo / redo and `changed`, and raises `documentChanged` only when it differs. Hosts mark dirty on that;
`changed` is left to mean "refresh the UI".

**Path.** (1) the announcer + `documentChanged` in core and the host API; the plugin's dirty flag moves onto it (falling
back to `changed` on an older bundle). (2) The editor's own document-level consumers (`showSaveWarning`, derived-data
extensions' `elementChanged`) move too. (3) The `call('changed')` sites that exist only to say "something changed" go;
the ones that refresh a panel stay. Size: S for (1), M for the rest.

**Status (2026-11-24).** Step (1) is in: `core/document-changes.ts` and `snapshotHistory.revision()`, `documentChanged` in
`hostApi.d.ts`, the plugin's dirty flag on it. On the way: `loadSvgString` resets the undo stack after the load's own
bookkeeping (the `viewBox` and layer ids were drift announced as a first edit), and the model leaves out the editor's
leading `pointer-events` declaration as the serializer does (`withoutEditorState`), so the click that strips one is no
change — the 2026-11-24 log's "svg-changed after a drag that went nowhere". Step (2) has started: the unsaved-work warning
(`showSaveWarning`) is armed by `documentChanged` and cleared by `loadSvgString`.

**Status (2026-11-24, later).** `documentChanged` names what changed: `elems`, the elements that differ from the drawing last
announced (`core/model/diff.ts` pairs children as `reconcile` does and stops at shared subtrees; `snapshotHistory.changedSince`
resolves the paths), and what its handlers write lands in the change they were told about (the announcer re-reads the
revision after them). The features that derive data moved onto it: connector, mirror, blend, art brush, the effect filter
regions (glow, shadow, outline: their `gestureEnded` workaround for a move "without a `changed`" is gone) and the markers'
colour and arrow trim. Each keeps its old undo behaviour (only blend skips `cause: 'history'`). Left on `elementChanged`, on
purpose: panel and overlay refreshes, the connector's reset on a load (a load is not a change), and the markers' "give a
shared marker its own copy", which records an undo step of its own (moving it would nest a step inside an announcement).

**Status (2026-11-24, step 3).** The editor's panel refresh also runs on `documentChanged` (without the layers panel, the
canvas size and the selection adoption, which follow the edits that name them), and 53 of the 90 `call('changed')` sites
are gone: the ones that named the same connected elements a step had just changed. The others stay on purpose: loads and
imports (not announced), layer operations (the layers panel), sites that name a new or replacement element (the selection
adopts it), deletions that name the removed elements, the undo / cancel path (`patched`: a cancelled transaction is not
announced, yet the panels must drop what they showed mid-transaction) and the markers' shared-marker fix-up. A guard came
with it: `documentChanges.pending()` (the drawing differs from the last announcement and no check is coming), asserted
after every command of the sweep. In the sweep it found two older bugs a selection exposed: a live-effect path saved with
relative commands drifted by rounding (the first click dropped its effect; `convertPath` no longer lets the rounding pile
up, checkDrawing's `fx-rounding-drift` and a repair entry cover saved drawings), and the load-time filter realignment
clipped glows (the effect composer now re-derives every region on `sourcechanged`). Tried after every e2e test first, it found one real case (the source dialog's load left
its bookkeeping, layer ids and viewBox, outside the step: one transaction now) and then mostly flagged tests that build their
drawing with `addSVGElementsFromJson`, which records no step; a suite-wide guard needs test setup that goes through steps
or loads. The editor's starting drawing is now the first reference (`settleStartingDrawing`), which is also why the
unsaved-work warning is no longer on after startup.

What is left of R8: the `restored` flag on `elementChanged` (undo's own `changed` call still sets it; the announced refresh
passes `cause === 'history'`); the remaining `changed` sites could each move to a narrower event (`layersChanged`,
`selectionReplaced`) so that `changed` disappears; and `elems` does not name removed elements (a feature that must react
to a deletion still needs the deleting code's call).

### R9. A gesture owns its state

**Today.** Per-gesture state is loose fields on `GestureState` plus module slots (`getStartTransform`, `pathActions`'
tracked path), each reset by hand at chosen points (57 resets in 5 files, with comments arguing where a reset must go). Bugs:
`groupResizeStart` outlived its gesture and scaled old elements on later resizes (e6f50f31); a stale tracked path opened node
edit on the wrong path (8364dc73 and the background-click fix); the shared start-transform slot gave multi-select drags the
wrong undo transform; ghost and stale grips. The plugin's double teardown on close (onClose + onunload) was the same at the
view level.

**Target.** The select / resize / rotate / path-edit gestures in `event.ts` / `event-select.ts` follow the contract
registered tools already have (`registerTool`: begin → preview → commit / cancel with state on a per-gesture object): the
state is created at the press and dropped with the gesture, so nothing can outlive it. Size: L (the shared drag code every
tool uses).

### R10. One entry point per user intent

**Today.** The same intent goes through different code depending on how it was asked. Paste from the menu read the
drawing's stored copy, Cmd+V read the system clipboard (fixed 2026-11-24 by a fallback; `mod+v` is not a command, so it
bypasses the registry); Curvature behaved differently finished by a click and by a tool switch; an extension hook was
defined and never dispatched. Click versus drag is decided in at least five places (the 4 px move threshold, the marquee,
which had none until 2026-11-24, Alt-clone, curve-on-drag in the path tool, the layers-panel drag); closing / matching
tolerances differ by call site (184f99ae: two tolerances met and the distortion compounded); the press-target pipeline
in `mouseDown` is a chain of order-dependent overrides (prefer-selected, stroke proximity, area text, bbox-as-handle), and
two of them interacting was the 2026-11-24 selection bug.

**Target.** Copy / cut / paste are registry commands for every source (keys, menu, native events), the native events
only supplying the system clipboard's content. One pointer-intent classifier (click / drag / marquee, one threshold in
screen px) that every press consults. Shared geometric tolerance constants. The target overrides as one ranked resolver
with its rules tested together. Size: M.

### R11. The editor's own state stays out of the drawing

**Today.** Group dimming (`opacity="0.33"`, `pointer-events: none`) leaked into undo snapshots and saved files (5a3d78d6);
`addSVGElementsFromJson` (`core/json.ts`) stamps `style="pointer-events:inherit"` on every element it creates, and later
code appends the drawing's own declarations to that same `style`: the serializer dropped any style that *began* with
`pointer-events`, so a feathered mask silhouette (`clip-mask.ts`, `pointer-events: inherit; fill: … !important; filter:
blur(8px)`) was saved without its feather (fixed 2026-11-24 by dropping only the declaration, `withoutEditorState`, with
checkDrawing's `mask-feather-lost` and a `repair-drawings` entry; the loader's style-to-attribute conversion also kept
`!important` in attribute values, which would have painted the reloaded silhouette black); the release of a drag strips `style` off the selected element; previews are
`data-se-ephemeral` nodes every reader filters out. R1 made the DOM a view of the model, but the editor still keeps
interaction state on the same nodes, so readers compensate (`withContextUndimmed`, ephemeral filtering).

**Target.** Editor-only state lives outside the document: CSS keyed off a state attribute on the container or the
overlay, never attributes on drawing elements. Comes with a `repair-drawings` entry for the stray `pointer-events` style
in saved drawings and a `checkDrawing` rule. Size: M.

### R12. One placement policy, one set of coordinate frames

**Today.** Where an element's placement lives (its attributes or its `transform`; a group only in its transform; a
rotation decomposed or collapsed into a matrix) is decided in several places that copy each other: the drag release in
`event-select.ts`, nudge in `selected-elem.ts` (the group-consolidation block is nearly verbatim), `recalculateDimensions`
and the model's `affineEdit`. Bugs: a rotated group barely moved on a drag (efd2f3be); a turned curve was measured from its
raw numbers and measuring added an empty `<path>` (2365847f); a font size went to ~0 after a rotation was collapsed.
Coordinate frames (screen, document, layer, entered-group local, element-local) are plain numbers each tool converted on
its own until `src/editor/toolSpace.ts`: 61569a3b, a2101f3b and 478dd235 fixed the same mistake in five tools.

**Target.** One placement policy on the model's matrix math (R1's named next step: flip / rotate / scale on the model) and
one frame-conversion module every tool and gesture uses. Size: L.

### R13. Tests that run the host's conditions

**Today.** Most of the bugs above were found from real Obsidian debug logs, not by the suite: the e2e pages mount one
editor in a plain browser. Two editors in one document, leaf lifecycle events firing together, Electron's clipboard and
menu roles are not simulated (the `window.svgEditor` problems, the 2026-11-24 paste and double-teardown bugs).

**Target.** A host-harness e2e page: two editors plus a fake plugin view lifecycle (open / switch / close firing as Obsidian
does) and a clipboard double that can drop or replace writes the way a host can. Size: S–M.
