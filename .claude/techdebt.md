# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

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
