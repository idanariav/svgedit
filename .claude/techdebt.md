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

### Follow-up: `findDefs().append()` call-site audit

The same investigation turned up an unrelated legacy corruption in the same
drawing: its `<defs>` carried ~130 concatenated literal `"undefined"` text
nodes. Root cause: `Element.append(x)` (`ChildNode.append`, not `appendChild`)
silently coerces a non-`Node` argument via `ToString()`, so `defs.append(x)`
with `x` falsy inserts a `"undefined"` text node instead of throwing.
`addSVGElementsFromJson()` (`packages/svgcanvas/core/json.js`) really can
return `null` (`if (!svgdoc_) { return null }`), so any call site that appends
its result straight into `<defs>` without a truthiness check was exploitable
in principle — the corrupted drawing's filter id (`..._blur1`, matching no
current naming scheme) suggests the actual historical trigger predates a
since-rewritten blur/filter implementation and can't be reproduced against
current code.

Audited every `<defs>`-directed `.append()`/`.appendChild()` in the codebase.
Most trace back to `cloneNode()`, `createElementNS()`, `importNode()`, or
NodeList iteration — all of which are guaranteed non-falsy — and were left
alone (adding a truthiness check there would be guarding against something
that provably can't happen). The ones that trace back to
`addSVGElementsFromJson()` were genuinely exploitable and are now guarded:

- `packages/svgcanvas/core/blur-event.js` (`setBlurNoUndo`, `setBlur`)
- `packages/svgcanvas/core/clip-mask.js` (`performSet`, `convertClipToMask`)
- `src/editor/extensions/fx-filter.js` (`writeEffects`)
- `src/editor/extensions/ext-markers/ext-markers.js` (`addMarker`)
- `packages/svgcanvas/core/selected-elem.js` (`pushGroupProperty`'s Ungroup
  path) — guarded as defense-in-depth even though `drawing.copyElem()`
  (its actual source value here) is currently proven to always return a real
  Element; kept because this exact call site's id-naming lineage
  (`{id}_blur` → `{id}_blur1`) is the closest match to the historical
  corruption's fingerprint.

Also added a one-time sanitizer in `svgCanvasToString()` that strips any
leftover `nodeType===3 && nodeValue==='undefined'` children from `<defs>` on
every save, so a drawing that already carries this scar (like the one that
surfaced it) self-heals on its next save rather than needing hand-repair.

Regression coverage: `tests/unit/path-degenerate.test.js` (sanitizer, both the
corrupted and clean cases) and `tests/unit/blur-event.test.js` (the
`setBlur()` guard, via a mocked `addSVGElementsFromJson` returning `null`).

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

