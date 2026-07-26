# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## `pathActions.clear()` call-site audit (2026-07-26)

Root-caused a "path node mode" report where a drawing became permanently
unsaveable: `svgCanvasToString()` (`packages/svgcanvas/core/svg-exec.js`,
called by `getSvgString()` — i.e. every save/export) called
`pathActions.clear(true)` **unguarded**. `setMode()` already wrapped that same
call in try/catch (commit `d38833ad`, with a regression test) after an earlier
freeze bug, but that isolation was never audited across other call sites.

Grepped every call site of `pathActions.clear()`:

- `packages/svgcanvas/svgcanvas.js:951` (`setMode()`) — guarded (pre-existing)
- `packages/svgcanvas/svgcanvas.js:980` (`clear()`, new blank document)
- `packages/svgcanvas/core/svg-exec.js` (`svgCanvasToString()`, every save) — now guarded
- `packages/svgcanvas/core/event-select.js:73` (plain-shape mousedown handler)
- `packages/svgcanvas/core/draw.js:1204`
- `packages/svgcanvas/core/undo.js:76`
- `packages/svgcanvas/core/path-actions.js:957` (`addSubPath(false)`, clears its own session)

Only 2 of 7 had guards, and only because each was patched reactively after its
own specific bug report — not because the risk of `pathActions.clear()`
throwing had been treated as a shared contract. Rather than adding a 3rd/4th/…
bespoke try/catch per call site (the same pattern that produced the gap),
fixed it at the source: `clear()`'s internal `toSelectMode()` call and
`path.init().show(false)` call (`path-actions.js`, inside `clear()`) are now
each wrapped in their own try/catch, so `clear()` itself can never throw
regardless of which of its ~7 callers reaches it — including any future one.
The two existing outer guards (`setMode()`, `svgCanvasToString()`) are kept as
harmless defense-in-depth rather than removed.

Regression coverage: `tests/unit/path-degenerate.test.js` — the three
mock-based tests (`pathActions.clear = () => { throw }`) prove callers survive
a throwing `clear()`; a fourth test reproduces the *actual* wild state (mode
committed to `'pathedit'` via `setMode()` without `toEditMode()` ever running,
so the module-private path-edit session was never set up) against the real,
unmocked `clear()`/`getSvgString()`.

---

## Left panel drag-reorder / overflow bucket follow-ups (2026-07-24)

From the `toolDragReorder.js`/`se-tool-overflow` build. Minor, accepted-scope
UX rough edge, not a bug:

- **No keyboard-accessible reorder.** Mouse/pointer drag only (native HTML5
  DnD). Consistent with the rest of `#tools_left` being mouse-driven desktop
  chrome (the panel is hidden entirely in tablet mode), but a screen-reader
  or keyboard-only user can't reorder tools or use the overflow bucket.
  Would need explicit ARIA + keyboard handlers (arrow-key move, Enter to
  drop) — real effort, deferred until requested.

