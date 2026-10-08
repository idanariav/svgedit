# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

## Ghost path-node grips after leaving path-edit (unreproduced)

An Obsidian-plugin log (2026-09-28) showed 4 `pathpointgrip_*` still
`display:inline` in select mode, belonging to no selected path. Every exit
route tried in a browser (setMode, click empty/other shape, Escape, tool
buttons, undo) hides them correctly, so the trigger is unknown. The debug
snapshot now includes `pathEditing.mode`, flags any visible grip outside
`path`/`pathedit` as stale, and records grip x/y; freehand closes log a
`path-draw-commit` event. Next time it shows up, the log should identify the
sequence. Don't add speculative hide-all calls before then.

## Closed subpaths must carry an explicit closing lineto

The node editor (`Path#init`, `opencloseSubPath`, delete-node) models a closed
subpath as `M A … L(back to A) Z`; the closing lineto is A's only grip. Do
**not** "dedupe" it away (that was tried and removed every drawn path's start
node grip). `ensureExplicitClosingSegments()` in `path-method.js` repairs
`Z`-only subpaths (external SVGs, or saved by the reverted change) whenever a
path enters the editor; other absolute-path shapes it doesn't cover
(relative segments, `H`/`V`) are left as-is.

---

The entries below came out of a whole-repo code review (2026-10-07). None
were started at the time; they are listed in suggested order. Baseline then:
1,631 unit tests passing, lint failing, e2e not run.

## Remaining `window.svgEditor` consumers

Components and dialogs now resolve their editor with `domScope.ownerEditor(this)`
(module helpers take an explicit `editor` argument) and `check-dom-scope.mjs`
rejects new `window.svgEditor` reads / `/* globals svgEditor */` headers. Still
on the global by design or not yet migrated: `ownerEditor()`'s last-resort
fallback (unattached elements, e.g. a constructor running before connect, or a
dialog appended to `document.body`), hosts and e2e tests that read
`window.svgEditor`, `EditorStartup`'s repointing on interaction (kept for
those), and `window.seAlert`/`seConfirm`/`sePrompt`/`seSelect`, which create
standalone dialogs and don't touch an editor. Constructor-time reads such as
`this.imgPath = ownerEditor(this).configObj…` still fall back to the global
when the element isn't attached yet; they're harmless as long as `imgPath` is
the same for every editor on the page. Small.

## Round-trip corpus: keep adding drawings

`tests/e2e/roundtrip.spec.js` loads/saves/loads every drawing in
`tests/e2e/fixtures/roundtrip/` and asserts the output stabilises after one
pass. Covered: frames, corner radius, taper, shadow/outline, text-on-path,
groups/layers/gradients, markers, clip-path/mask, `<use>`/symbols, embedded
images, repeat (radial + grid), mirror and puppet-warp. Corner-radius and taper
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
`svgcanvas.js` carries `// @ts-check` and is part of `npm run typecheck` (strict,
but `noImplicitAny`/`strictNullChecks` off — turning those on gives ~150 errors
there; tighten per file). The other `core/*.js` modules are not checked yet:
add `// @ts-check` to them one at a time, declaring what they attach in
`AttachedMembers` as you go.

The host API is `src/editor/hostApi.d.ts` (`EditorHostApi`, `HostCanvas`),
typechecked against `Editor` by `npm run typecheck` and copied to
`dist/editor/hostApi.d.ts`; the plugin consumes it.
Also open: generate the `svgcanvas.d.ts` from JSDoc instead of hand-writing it,
and the root `tsconfig.json` is `module: commonjs` and unused by any script. Medium.

## Oversized modules (remaining)

All eight files that were over ~1,500 lines are now under it (Editor.js 1,451,
seShapeLibrary.js 1,358, svg-exec.js 1,249, draw.js 1,209, selected-elem.js
1,172, TopPanel.js 1,161, elem-get-set.js 1,110, EditorStartup.js 1,092), by
moving cohesive blocks into `addToShapeLibrary.js`, `editorShortcuts.js`,
`seShapeLibrary.css.js`/`.data.js`, `core/svg-defs.js`, `core/legacy-repairs.js`,
`core/layer-ops.js`, `core/text-attrs.js`, `core/group-ops.js` and
`panels/topPanelContext.js`. What's left is still big in one place each:
`EditorStartup.init()` (~770 lines of listener wiring), `SeShapeLibrary` (one
~1,300-line class: store/view/menu not separated), `Drawing` in `draw.js`
(~880 lines), and `TopPanel.init()`. Split those only with a concrete reason.

## Host theme overrides don't reach dialogs

Every dialog follows the editor's light/dark theme: `svgedit.css` lists each dialog tag in
its light and dark token blocks, each calls `syncDialogTheme()` on open, and the
form-style ones share `dialogs/dialogSkin.css.js` (`tests/unit/dialog-theme-tokens.test.js`
guards it). The remaining hard-coded hex in components/dialogs (~50 lines, re-counted
2026-10-07) is deliberate: text colour on accent buttons, colour-picker maths, danger red,
grid default. The `--cp-*` / `--pd-*` modal tokens are intentional named component tokens.

What doesn't work: a host that overrides tokens on `.svg_editor` (e.g. a theme tweak in the
Obsidian plugin) doesn't reach the dialogs, because they sit outside it. Fixing that means
mounting them inside `.svg_editor` (check `position: fixed` against any transformed ancestor)
or defining the tokens at the container level (`[data-svgedit-root]`). Medium; no host needs
it today.

## Repo hygiene leftovers

- Two coverage systems remain: nyc (`nyc.config.js`, used by
  `scripts/run-e2e.mjs` to merge e2e + vitest coverage), `vite-plugin-istanbul`
  for e2e, and v8 for unit tests. Consolidating means reworking the merge step.

---

The entries below came out of a UI/UX review (2026-10-07). It used screenshots
of the dev server at 1440×900, 1024×700 and 800×600, in light, dark and tablet
modes, plus the live hotkey registry. They are listed most severe first.
Obsidian-only findings are in `../obsidian-svgedit-plugin/.claude/techdebt.md`.

## Toolbars: left column doesn't fold into "…" automatically

Narrow-pane work is done (top bar two-tier collapse + "⋯" tray, tablet command bar
shedding by container width, palette keeps a 14px swatch minimum and scrolls). What's
left: tools in the left column scroll (with "Additional tools" pinned) rather than
moving into `…` when the pane is short. Moving them automatically must not persist the
temporary split as the user's saved order. Covered by `tests/e2e/top-bar-layout.spec.js`.
Small.

## Missing translations: extension-injected strings

When an entry is missing, i18next returns the key, so `t('key') || 'Fallback'` never falls
back. `tests/unit/locale-keys.test.js` fails if a literal `t('ns.key')` isn't in
`lang.en.js`; static panel labels go through `panelI18n.js` (`panel.<slug>`, also
`data-caption`). Remaining: labels some extensions inject (Brush, Markers, …) and a
handful of component strings are still English. A `parseMissingKeyHandler` isn't an
option while components pass literal English as `title` (they rely on the key coming back).
Only the English locale exists today. Small.

## Keyboard shortcuts

Done: Tab/Shift+Tab cycle, `V` select, Duplicate `D`, platform-formatted tooltips, default
keys for Image (M), Brush (W), Cutter (C), Curvature (Y), Puppet warp (X). Remaining:
- Tab still isn't free for focus navigation (it cycles elements). Freeing it means
  choosing another key for cycling; left as is.
- The Shapes flyout and Shape library are not `se-button`s, so they can't take a
  `shortcut` attribute yet (`seFlyingButton`/`seShapeLibrary` don't register with the
  hotkey manager). Small.

## Side panel and top bar: remaining polish

Done: panel opens once on the first selection in a pane ≥1100px wide (a manual toggle is
remembered, `sidePanelManual` pref); Path actions carry captions (`data-caption`); the
theme toggle is no longer a default extension (Preferences has theme). Remaining:
- The six top-bar toggles (frame, wireframe, canvas settings, grid, smart snap, layer view)
  are icon-only with tooltips; visible labels don't fit the tight bar.
- Join/Cap icons are solid glyphs; Brush settings is a lone gear. Small.

## Icons and palette

Done: solid silhouettes are outlined at load (`OUTLINE_ICONS`), curated default palette
plus a "colours in this drawing" row, larger selection handles on coarse pointers,
tooltips shortened to the name. Remaining:
- The Cutter icon (a marker over a dotted line) doesn't suggest cutting — a redraw.
- Shapes shows doubled lines where its artwork has holes.
- The "none" swatch is still faint in the dark theme. Small.

## Colour picker is still a modal

Done: solid, gradient, group (leaf shapes) and canvas-background tweaks preview live and
revert on Cancel/Escape; undo records old → new. Remaining: it is still a modal with
Cancel/Apply rather than an anchored popover that applies on outside click — a UI rewrite,
not scheduled. Medium.
