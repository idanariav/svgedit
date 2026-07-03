# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

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

## Test infrastructure (discovered during the Phase 1-11 cleanup)

Automated coverage is unreliable in this environment for three pre-existing,
unrelated reasons (confirmed via `git log -S` / `git merge-base --is-ancestor`
to predate the cleanup session — not caused by it):

1. `coords.js` → `taper-stroke.js` → bare `paper/dist/paper-core.js` import
   breaks unbundled-ES-module test harnesses and jsdom (introduced by the
   "Wave 2" Milani commit `72888e39`).
2. The `#tool_source` button was removed by an earlier "Frame tool" commit
   (`01301bdd`), breaking several e2e specs that rely on the `setSvgSource`
   test helper.
3. `mainmenu.spec.js` references a `showDocProperties` method that no longer
   exists on `MainMenu.js`.

Net effect: `npx vitest run` sits at a fixed 179-failed/219-passed baseline
that has to be treated as a known-bad floor rather than a signal — every
phase of the cleanup had to fall back to hand-written real-browser Playwright
scripts for actual regression verification instead of trusting the test
suite. Worth a dedicated session to either fix the harness (paper.js import),
update the stale specs (`#tool_source`, `showDocProperties`), or both — until
then, don't trust a green/red vitest delta alone as proof of no regression.

---

## Other follow-ups

*(none yet — add items here as they come up in future sessions)*
