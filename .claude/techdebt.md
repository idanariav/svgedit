# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## `tool_make_link`, `tool_make_link_multi`, `image_url` still use the broken id-as-class `hideTool`/`displayTool` pattern

Fixed for `tool_topath`/`tool_reorient`/`tool_smooth_path`/`tool_stroke_to_path`
(2026-07-09, see `css-rules.md`'s `displayTool()`/`hideTool()` gotcha note):
`hideTool(name)`/`displayTool(name)` in `src/editor/panels/TopPanel.js`
select by CSS class, but these three targets
(`TopPanel.js:355-363,1107,1129`) only carry a matching `id` in
`RightPanel.html`/`TopPanel.html`, not a `class`. Their show/hide calls are
silent no-ops today — e.g. the "make link" buttons never actually toggle,
and the image URL field's hide/show around image mode is a no-op.

Not done now: narrower blast radius than the path-tools fix (link/image-url
UI, not reported broken by a user) and each needs its own template edit +
manual verification of the surrounding link/image flows before touching it.
Same one-line-per-button fix pattern (add `class="<id>"` alongside the
existing `id`) applies.

## Cutter polyline cuts are scoped to exactly 2 boundary crossings per shape

`packages/svgcanvas/core/cutter.js`'s `cutWithPolyline` (used for multi-point
zigzag cuts, `points.length > 2`) only cuts a shape if the cutting polyline
crosses that shape's boundary **exactly twice** and both polyline endpoints
lie **outside** the shape — any other case (0/1/3+ crossings, or an endpoint
inside the shape) leaves that shape unchanged. This covers the intended use
case (a zigzag drawn across a shape, entering once and exiting once — e.g.
the "broken egg" crack) via an exact boundary-splice construction
(`getIntersections`/`divideAt`/`getOffset`), not the half-plane trick used
for the 2-point straight-line case (which has no polyline equivalent).

Not done now: generalizing to N crossing pairs (e.g. an "S"-shaped cut that
dips out of and back into a shape, producing 3+ pieces) needs a full
Weiler-Atherton-style stitch across all crossings, not just one pair — a
bigger, separately-planned algorithm. Also out of scope, same as the
pre-existing straight-line cutter: compound paths / shapes with holes
(`getElemAsPath` doesn't pass `asCompoundPath` to `svgToPaper`), and
self-intersecting cutting polylines.

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

`npx vitest run` is clean (fixed 2026-07-03). `clipboard.spec.js`,
`control-points.spec.js`, `group-transforms.spec.js`, `issues.spec.js`,
`scenarios.spec.js`, `text-tools.spec.js`, and `mainmenu.spec.js` are clean
too (fixed 2026-07-10 — ambiguous shadow-DOM-piercing id locators,
`mainmenu.spec.js`'s reference to the removed doc-properties dialog methods,
and several further bugs each fix uncovered once the tests could actually
run; see git history for detail).

Note: verify with `npx playwright test` directly rather than
`node scripts/run-e2e.mjs` — that wrapper's `rimraf .nyc_output/*` step fails
with `rimraf: command not found` in a shell whose PATH lacks
`node_modules/.bin`.

The following were found while getting the above passing; distinct issues,
not yet fixed:

- `tests/e2e/unit/*.spec.js` (~40 tests, e.g. `svgcore*.spec.js`) all hang on
  `page.waitForFunction(() => Boolean(window.svgHarness))` in `beforeEach`
  and time out. `tests/unit-harness.html` loads `packages/svgcanvas/core/*.js`
  as raw (unbundled) ES modules directly in the browser. `coords.js` imports
  `taper-stroke.js` (for `remapTaperSource`, a legitimate production
  dependency — see `coords.js:9`), which imports `paper-utils.js`, which
  bare-imports `paper/dist/paper-core.js` — unresolvable without a bundler or
  import map, so the module graph throws (`Failed to resolve module
  specifier "paper/dist/paper-core.js"`) and `window.svgHarness` never gets
  set. Pre-existing since the taper-stroke work landed
  (2026-07-09-ish); the harness was never updated for the new transitive
  dependency. Needs either an import map entry (plus copying paper's dist
  build into served test assets) or bundling the harness instead of loading
  raw modules.
- `layers-panel.spec.js`'s `beforeEach` opens the side panel via
  `#sidepanel_handle` but never activates the `layers` tab (`data-tab`
  defaults to `design` — see `RightPanel.js`'s `activeTab`), so `#layer_new`
  stays hidden and both tests time out waiting for it. Same root cause
  category as the `text-tools.spec.js` fix above (right panel is now
  tabbed); needs a `[data-tab="layers"]` click added to the `beforeEach`.
- `export.spec.js`: `#export_box select` is a strict-mode-violation
  ambiguous locator — it now also matches `#se-storage-pref`'s select
  (`resolved to 2 elements`). Needs scoping, e.g. to
  `#se-export-region select` (or whatever the export size/format control's
  actual container id is).
- `dialogs-extra.spec.js`'s "seAlert creates alert dialog" test asserts
  `created` is `true` but gets `false` — not investigated; could be a
  selector/timing issue in the test or a real regression in the alert
  dialog's creation path.
