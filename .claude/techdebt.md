# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## Bug-hunt findings (2026-07-18): copy-paste / multi-instance follow-ups

Findings from a targeted audit. Seven of the eight original findings
(curvature tool cleanup, path node-index sort, zoom-adjusted drag threshold,
three multi-instance active-editor/teardown bugs, and the cross-drawing
Paste enable-state propagation) were fixed, with regression tests in
`tests/unit/` where feasible. The one below is still open — it was
explicitly called out as needing more than a mechanical fix (a
module-singleton-to-per-instance refactor), so it was left for a dedicated
pass.

### Hazard note: dom-utils/bbox-utils module singletons follow the *active* editor only

`core/dom-utils.js` and `core/bbox-utils.js` keep module-level
`svgCanvas`/`svgroot_` state, re-pointed to an instance only by
`activateUtilities()` on that editor's pointerdown/focusin (or the host
calling `editor.activate()`). Interactive use is safe, but any programmatic
call on a **background** instance that goes through the module-level helpers
(`getElement`, `getRefElem`, `findDefs`, module `getBBox`, …) resolves
against the *active* instance's svgroot — wrong-document lookups. Hosts that
drive background instances (batch save/export across panes) must call
`instance.activate()` first. Not a bug to fix so much as a constraint to
respect until those two modules are made per-instance like the rest
(moderate effort; they are the last two module-singleton core files).

## From the Phase 1-11 cleanup roadmap (`.claude/plans/i-want-to-do-immutable-kettle.md`)

The following were explicitly called out in that plan as "Deferred / optional
future refactors" — each needs its own planning pass before execution:

- **Reorganize `svgcanvas.js` state bag (80+ flat properties)** into concern
  objects (selection / drawing / style / history / zoom), keeping getters for
  API compat. Very high effort; 100+ call sites.
