# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

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

## No legacy-repair for stray alt-drag-duplicate path nodes (2026-08-25)

Root-caused the long-standing "unrelated path node appears" symptom (seen
again in an Obsidian-plugin debug log): `mouseDownEventImpl` in `event.js`
used to call `cloneSelectedElements(0, 0)` unconditionally on any mousedown
with `evt.altKey` true — even a plain click that never dragged, or a stray/
stuck `altKey: true` the browser/OS occasionally reports with nothing
actually held. The clone is invisible (offset 0,0, stacked exactly on the
original) and becomes the new selection, so it silently rides along into
whatever the user clicks next.

**Fixed** (prevention only): the clone now happens in `event-select.js`'s
`move()`, gated on the same 4-screen-px real-drag threshold already used to
distinguish an ordinary click from a drag (`event.js` only arms the intent
via `svgCanvas.altCloneArmed`). Covered by regression tests in
`event.test.js` and `event-select.test.js`.

**Deliberately not repairing already-saved drawings.** Per this file's own
`<defs>`-append precedent (see CLAUDE.md), a data-corruption fix should
normally also sanitize legacy files on load — but that precedent
(`sanitizeLegacyUndefinedDefs`) works because collapsing redundant encodings
of *the same* state (e.g. stacked `translate()`s, per `b6566ebe`) is
provably behavior-preserving. This corruption is different in kind: the
stray element is a real, distinct duplicate. Once saved, nothing in the
markup distinguishes "alt-drag bug's invisible clone" from "user
deliberately stacked two identical shapes on purpose" (e.g. a manual shadow
effect, or a duplicate not yet moved) — an exact-duplicate-sibling heuristic
would risk silently deleting real content, which is worse than the bloat it
fixes. If this becomes worth automating, the safer shape is a **non-
destructive detector** (flag same-parent, identical-geometry/style siblings
differing only by id, for the user to review and delete by hand) — not
auto-delete.

