# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## Orphaned path-node grips left visible after freehand path drawing (2026-08-10)

Confirmed live (not just theorized) while building the `<se-debug-overlay>`
debug inspector (see `file-map.md`'s `seDebugOverlay.js` entry): path-node
grip DOM elements are cached and keyed **by segment index only**
(`pathpointgrip_${index}` etc. in `packages/svgcanvas/core/path-method.js`),
not by which path element owns them. Entering *pathedit* mode via
`toEditMode()` self-heals correctly — `Path.init()` hides every grip in the
shared container before re-showing only the current path's own (see
`packages/svgcanvas/core/path-method.js` `Path#init`). But freehand
**drawing** a new path (mode `'path'`, `path-actions.js` `mouseDown`'s
`!drawnPath` branch) calls `svgCanvas.addPointGrip(index, x, y)` directly with
no equivalent hide-all step first. Finishing one path and starting another
with fewer points leaves the previous path's higher-index grips sitting
`display:inline` at their old screen position — a stray node marker visibly
floating over the canvas while a different path is being drawn. Reproduced
via `svgCanvas.pathActions.mouseDown(...)` calls in a live browser session;
`getDebugSnapshot().pathEditing.grips` correctly flags the orphan `stale:
true` (screenshot taken, not kept in-repo).

Not fixed here — this session's scope was the inspector tool, not the
underlying bug. The fix is presumably a hide-all pass (mirroring
`Path.init()`'s) at the start of a **new**, non-subpath freehand path draw
(the `!drawnPath` branch in `path-actions.js`'s `mouseDown`), but that needs
its own careful pass (subpath drawing intentionally reuses/extends the
current path's grips, so the hide-all can't be unconditional) — real effort,
deferred until requested.

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

