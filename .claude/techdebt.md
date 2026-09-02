# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

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
