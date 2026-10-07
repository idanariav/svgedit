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

## Round-trip corpus is incomplete

`tests/e2e/roundtrip.spec.js` loads/saves/loads every drawing in
`tests/e2e/fixtures/roundtrip/` and asserts the output stabilises after one
pass. Covered: frames, corner radius, taper, shadow/outline, text-on-path,
groups/layers/gradients, markers, clip-path/mask, `<use>`/symbols, embedded
images (the last four are hand-written drawings normalised by the editor's own
serializer; the first six were saved by driving the real tools). Corner-radius
and taper predate the `xmlns:se` fix and double as legacy-file coverage.
Missing: puppet-warp and mirror/repeat stamps (need the tools driven, or real
drawings from the plugin). Add fixtures as such drawings turn up; each new
corruption bug should add the file that exhibited it. Small per fixture.

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

## Toolbars get cut off in narrow or short panes

Done: the left column stays 56px when the panel opens, `#tools_overflow` is
sticky at the bottom of the left toolbar, and Undo/Redo + zoom (`#top_end`) are
sticky at the right of the top bar, which also scrolls with the plain mouse
wheel. Remaining:
- At 800px wide the contextual trays (align/arrange/flip…) still sit behind the
  pinned right cluster and are only reachable by scrolling. Collapse low-priority
  trays into a "more" menu with a ResizeObserver.
- Move tools into `…` automatically when the left column is too short (today it
  scrolls).
- Tablet mode at 1024 wide: the command bar's undo/redo are still cut off.
- Palette swatches shrink to slivers at 800px.
Medium.

## Missing translations show raw keys

When an entry is missing, i18next returns the key, so `t('key') || 'Fallback'`
never falls back (23 uses of `t(`, 5 of `_t(`). `tests/unit/locale-keys.test.js`
now fails if a literal `t('ns.key')` isn't in `lang.en.js` (`properties.class_none`
and two wrong keys in `Editor.js` fixed). Remaining: dynamic keys
(`'config.jgraduate_' + val`) aren't covered, and some labels bypass i18n
entirely: the side-panel tab and section names, "Rotate", "Radius", "Brush",
"Canvas settings", "Change zoom level", "Background Color", the new zoom
"Zoom in/out" titles. A `parseMissingKeyHandler` isn't an option as long as
components pass literal English as a `title` (it relies on the key coming back).
Small.

## Keyboard shortcuts break common conventions

Done: Tab = next / Shift+Tab = previous, `V` selects, `A` alone no longer selects
all, Duplicate is `D` for one or many, tooltips and the main menu show
platform-formatted shortcuts (⌘Z / Ctrl+Z; menu shortcuts right-aligned) with no
trailing space. Release-note these default changes. Remaining:
- Tab still isn't free for focus navigation (it cycles elements).
- Image, Shapes, Brush, Shape library, Cutter, Curvature and Puppet warp have no
  default shortcut.
- Command search results don't show shortcuts, and a fuzzy match ranks above
  exact prefix matches.
Small.

## Context menu: no icons or shortcuts, weak disabled state

Done: Escape closes it; the defaults are now Paste / Select all / Zoom to fit
(users with stored favorites keep theirs). Remaining: items have no icons or
shortcuts, and disabled items are only slightly lighter than enabled ones. Small.

## Side panel: hidden by default, vague handle, technical fields first

- The panel is closed by default. The tab now reads "Properties"; opening the
  panel on first selection is still undecided.
- The Design tab starts with ID and Class, before Dimensions and Stroke. Most
  illustrators never use those two fields. Move them into a collapsed
  "Advanced" group at the bottom, and keep X/Y/W/H/Rotate together at the top.
- The Text tab is empty unless text is selected. Show a hint such as "Select
  text or press T".
- The drop shadow in the Effects tab shows real-looking values (angle 150,
  blur 4, opacity 0.5) but has no on/off switch, so it isn't clear whether a
  shadow is applied. Its opacity runs 0–1, while the Design tab's runs 0–100.
  Use one scale and add an enable toggle.
- Join/Cap and the Object › Path actions are unlabelled 16px icons, and Brush is
  a lone gear. Use segmented controls with labels or tooltips.

Medium, mostly `RightPanel.html` plus the section JS.

## Inconsistent icons, selection handles and palette

- Icon styles are mixed in the left toolbar. Panning, Shapes, Brush, Shape
  library, Cutter, Curvature, Puppet warp and the overflow icon are filled;
  the rest are outlines. The layers toolbar mixes filled arrows with outline
  icons. Redraw them in one outline style. The Cutter icon (a marker over a
  dotted line) doesn't suggest cutting.
- The left toolbar is one ungrouped column of 14 tools, and the drawing tools
  (pencil, brush, pen, curvature) are scattered. Group them with separators:
  select/hand · pencil/brush/pen/curvature/line · shapes/library · text/image ·
  cutter/warp/eyedropper.
- Selection handles now follow `--accent` with white fills (CSS overrides at the
  end of `svgedit.css`; `select.js` still hard-codes `#22C`/lime as the
  fallback). Still to do: a larger hit area on touch.
- The default palette is 40 saturated rainbow swatches, which doesn't fit the
  limited-palette illustration goal. Ship a curated default palette plus a
  "colours in this drawing" row. In the dark theme the palette swatch
  border now uses `--swatch-inset`; the "none" swatch is still faint.
- Tooltips no longer end with a stray space. Some tooltips are full sentences ("Puppet Warp — pin an object, then drag…"),
  and those sentences also appear as action names in the hotkey manager. Keep
  tooltips to the name plus the shortcut, and put the explanation somewhere
  else.

Medium, mostly icon and CSS work.

## Main menu and top-bar toggles are hard to discover

- (Done: the main menu has a chevron and separators between groups.)
- The six toggles at the top (frame, wireframe, canvas settings, grid, smart
  snap, layer view) are icons with no labels. The theme toggle takes a prime
  toolbar spot for a rarely used setting; move it to Preferences or the menu.
- Zoom now has −/+ buttons and a "%" suffix; the value still shows one decimal
  ("100.0").

Small.

## Preferences, Export and colour-picker dialogs look and work like older UI

- Editor Preferences has OK/Cancel at the top, a fieldset legend, the checkbox
  after its label, a native `<select>`, and only two settings. Move it to
  `dialogSkin` with the actions at the bottom right.
- Export has no title and centred labels. It shows "Quality" for PNG, although
  only JPEG/WebP use it. It has no scale option and no size preview.
- The colour picker is a modal with Cancel/Apply, so trying a colour takes
  three clicks, and the drawing doesn't change until you apply. Figma, Affinity
  and Inkscape instead use a popover that updates the drawing live, where
  Escape reverts.

Medium.
