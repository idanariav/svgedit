# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## Path tool: clicking a different path while in pathedit doesn't select it

`PathActions.toSelectMode(elem)` (`packages/svgcanvas/core/path-actions.js`,
~line 890) only reselects `elem` when it's the path that was actively being
edited (`selPath = elem === path.elem`). If the user clicks straight onto a
*different* path while node-editing the current one, the click correctly
exits pathedit (via the existing non-drag-click fallback in `mouseUp`) but
drops to `select` mode with nothing selected, instead of selecting the
clicked path the way a plain select-mode click would. Not fixed now because a
correct fix needs to distinguish "clicked a real content element" from
"clicked empty canvas background" (`svgroot`/`svgcontent`) without
accidentally selecting the SVG root itself — the container-based checks
already used elsewhere in this file (`getContainer().contains(...)`) are too
loose for that distinction (they're satisfied by background clicks too) and
would need a more careful predicate. Also not independently reproduced in a
live browser session (inferred from reading the code), unlike the other path
bugs fixed in the same session. Low severity (missing selection, no data
loss/crash), low-to-moderate effort once the "real element vs. background"
check is designed properly.

## Bug-hunt findings (2026-07-18): copy-paste / multi-instance follow-ups

Findings from a targeted audit. Six of the eight original findings (curvature
tool cleanup, path node-index sort, zoom-adjusted drag threshold, and three
multi-instance active-editor/teardown bugs) were fixed in a follow-up session
with regression tests in `tests/unit/`. The two below are still open — each
was explicitly called out as needing more than a mechanical fix (a rethink of
the flash-storage handshake, and a module-singleton-to-per-instance
refactor), so they were left for a dedicated pass.

### Cross-drawing paste: context-menu "Paste" enable state doesn't propagate in-window

The internal clipboard itself is shared correctly (same-window instances read
the same `sessionStorage` key, and keyboard paste works cross-drawing). But
the menu-item enable state does not follow: `copySelectedElements()` enables
`#paste` only on its own instance's menu, and other same-window instances
only re-check via a `storage` event (`EditorStartup.js` ~line 823) — which
never fires in the window that made the change, and reads a localStorage key
(`Editor.enableOrDisableClipboard`) that `flashStorage()` deletes ~1ms after
writing. Net effect: after copying in drawing A, drawing B's right-click
Paste can stay disabled even though pasting would work. Low severity (Ctrl+V
unaffected); fix belongs with a rethink of the flash-storage handshake for
the same-document multi-instance case.

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
