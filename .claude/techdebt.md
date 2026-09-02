# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

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

## No keyboard equivalent for the lock-tool double-click gesture (2026-09-02)

Added while implementing keyboard-accessible reorder for `#tools_left`
(`toolDragReorder.js` — see `tools.md`): every direct child of the left panel
is now a real roving-tabindex stop, with Enter forwarding to the tool's own
`click()` so keyboard users can select tools, not just reorder them. But
"double-click a drawing tool to lock it" (`LeftPanel.js`'s `lockTool`,
bound via a plain `dblclick` listener on `tool_fhpath`/`tool_line`/
`tool_path`/`tool_text`/`tools_shapes`) has no keyboard trigger — a
keyboard-only user can select these tools but can't lock them for
multi-object drawing. Small, self-contained fix (e.g. a second Enter within
some window, or a distinct key) if ever requested; left out here since it's
a separate gesture from reordering and wasn't part of the ask.
