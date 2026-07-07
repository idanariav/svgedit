# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## `vite-plugin-string` collapses whitespace around `&amp;` in panel HTML

Panel HTML (`src/editor/panels/*.html`, etc.) is inlined as a JS string via
`vite-plugin-string` (`vite.config.mjs`). Its default compression strips the
spaces immediately around an `&amp;` entity, so a literal `"Stroke &amp;
Opacity"` label renders in the browser as `"Stroke&Opacity"` (confirmed on
`.sidepanel_section_label` text for "Stroke & Opacity", "Spacing & Shape",
"Clip & Mask" — all pre-existing, not introduced by any recent change).
Not fixed now: root cause is the shared build plugin, not any one label, and
changing its compression behavior touches every templated HTML file in the
bundle — needs its own regression pass. Workaround for new labels: avoid
`&` in visible text (e.g. the right-panel Object section uses "Select and
Link" instead of "Select & Link" for exactly this reason).

## From the Phase 1-11 cleanup roadmap (`.claude/plans/i-want-to-do-immutable-kettle.md`)

The following were explicitly called out in that plan as "Deferred / optional
future refactors" — each needs its own planning pass before execution:

- **Split `core/event.js` (~2,065 lines) into per-mode handlers** — extract
  the mouseDown/Move/Up mode branches (select, resize, rotate, path-edit,
  text-edit, zoom, shape-draw) behind a dispatcher. High payoff, high
  regression surface; only attempt with a Playwright regression suite over
  all drawing modes first.
- **Reorganize `svgcanvas.js` state bag (80+ flat properties)** into concern
  objects (selection / drawing / style / history / zoom), keeping getters for
  API compat. Very high effort; 100+ call sites.
- **Replace the custom `svgCanvas.bind` single-handler event registry with
  native `EventTarget`** — would remove TabletShell's handler-wrapping
  workaround.
- **`createSVGMatrix` → `DOMMatrix`** (94 occurrences) — opportunistic, do
  when touching a file that already uses it.
- **`utilities.js` split** (~1,644 lines) into dom-utils / path-utils /
  bbox-utils / encoding-utils.
- **`seCanvasSettings.js` adoption of `SettingsPopover`** (784 lines,
  structurally different from the six popovers migrated in Phase 8 —
  presets, layouts).
- **Popover API for the settings popovers** (`SeSettingsPopover` base class)
  — replace its manual outside-click/positioning logic once CSS anchor
  positioning is Baseline; would match the pattern used for `seMenu.js`'s
  hamburger menu.
- **i18next → `t()` shim** and **lazy-loaded shape-library JSONs (380 KB)**
  — only worth it if bundle-size pressure returns; the lazy-load option
  conflicts with the current self-contained-bundle guarantee (would need a
  host-provided loader), so treat as last resort.
- **`pathseg` removal** — blocked until `core/path-actions.js` is rewritten
  off `pathSegList` (used throughout, e.g. lines 39-46, 470-576, 666+) onto
  the modern path API.

---

## Test infrastructure — e2e (Playwright)

`npx vitest run` is clean (fixed 2026-07-03). The Playwright e2e suite
(`node scripts/run-e2e.mjs`) has these known breaks, unrelated to vitest:

- ~~The `#tool_source` button was removed by an earlier "Frame tool" commit
  (`01301bdd`), breaking several specs that rely on the `setSvgSource` test
  helper.~~ **Fixed 2026-07-05**: `setSvgSource` (`tests/e2e/helpers.js`) now
  opens the dialog via `window.svgEditor.topPanel.showSourceEditor()` instead
  of clicking the removed button — the dialog markup/textarea/save button
  were never removed, only the toolbar button that opened them.
- **Newly exposed by the fix above**: with `setSvgSource` no longer hanging,
  ~19 tests across `clipboard.spec.js`, `control-points.spec.js`,
  `group-transforms.spec.js`, `issues.spec.js`, `scenarios.spec.js`, and
  `text-tools.spec.js` now fail on a *different*, previously-masked bug —
  bare id locators like `page.locator('#svg_1')` are ambiguous because
  Playwright pierces every open shadow root on the page by default, and
  several unrelated shadow-DOM templates (toolbar icons, marker previews,
  font-style previews) happen to reuse generic ids (`svg_1`, `svg_2`, …)
  from their original source SVGs. Fixed in `shapes-and-image.spec.js` by
  scoping to `#svgcontent #svg_1`; the other 6 files still need the same
  treatment (or scope to `#svgcontent` generally) before they'll pass.
- `tests/e2e/mainmenu.spec.js` references a `showDocProperties` method that
  no longer exists on `MainMenu.js` (the doc-properties dialog was removed).

---

## Other follow-ups

- **`pasteElements()` reads a stale sessionStorage snapshot instead of the
  live clipboard** (`packages/svgcanvas/core/paste-elem.js`,
  `copySelectedElements` in `core/selected-elem.js`). Copy serializes the
  selection into `sessionStorage`/`localStorage` under `CLIPBOARD_ID` at copy
  time; paste later reads that cached snapshot back. The native `paste`
  listener (`EditorStartup.js`'s `pasteHandler`) already receives the fresh
  clipboard text via `e.clipboardData` and uses it *only* to sniff whether the
  content is svgedit's own JSON (`Array.isArray(JSON.parse(text))`) before
  discarding `text` and calling `pasteInCenter()` → `pasteElements()`, which
  re-derives the same data from sessionStorage instead of the JSON it just
  parsed. This is why multi-editor hosts (e.g. the Obsidian plugin, which
  mounts one svgedit instance per open drawing in a single `document`) need a
  manual `isActiveEditor()` gate on top of a shared `document`-level listener
  to route paste to the right instance at all — a relic of svgedit's original
  single-instance browser-tab design (the sessionStorage→localStorage→
  `storage`-event relay in `svgcanvas.js` exists purely to fake cross-tab
  clipboard sharing).
  Fix: have `pasteElements(type, x, y, data)` accept the already-parsed
  clipboard array directly from the paste handler (falling back to
  sessionStorage only for the context-menu Paste path, which has no
  `ClipboardEvent` to read from), so paste always reflects whatever's
  actually on the OS clipboard right now rather than a cached copy. Compare
  to `obsidian-excalidraw-plugin`: each Excalidraw canvas is a real focusable
  element (`tabIndex: 0`, `.focus()`ed on load) whose `onPaste` reads
  `navigator.clipboard.readText()` live — no shared snapshot, no
  active-editor gate needed at all, because the browser's own focus model
  resolves which instance should handle the event.
  Not done now: touches the internal/external-SVG branch logic in
  `pasteHandler` too (both would source from the same parsed `text`), and the
  context-menu Paste path (`case 'paste': this.svgCanvas.pasteElements()`,
  no keyboard event in hand) still needs the sessionStorage fallback, so it's
  a small-but-fiddly refactor across `EditorStartup.js` and `paste-elem.js`,
  not a one-line change. Moderate risk — clipboard/paste is easy to silently
  regress and hard to unit-test (needs the same two-instance-in-one-document
  Playwright harness used to verify the original active-editor fix).
