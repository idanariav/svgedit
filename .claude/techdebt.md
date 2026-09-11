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

## `opencloseSubPath()` has no undo-history entry at all (2026-09-11)

Found while expanding pathedit debug logging (see `file-map.md`'s
`setDebugEventSink`/`logDebugEvent` entry): unlike every other pathedit
commit action (move/clone/delete/toggle-seg-type/smooth — all funnel through
`Path#endChanges()`), `path-actions.js`'s `opencloseSubPath()` mutates
`elem.pathSegList` directly and returns with no `path.storeD()`/
`path.endChanges()` call anywhere in it. Toggling a node open/closed is
therefore **not undoable** — Ctrl+Z after this action undoes whatever came
before it instead, silently. Given this repo's long history of recurring
"path node" bugs (grips desyncing after open/close-adjacent sequences — see
the several `fix(path):` grip-staleness commits), a user hitting undo right
after an open/close toggle and getting an unexpected result is a plausible
root cause worth checking first. Not fixed here since the ask was to log the
behavior, not change it (and adding undo tracking to a function with 4 return
paths and direct `pathSegList` mutation deserves its own careful pass, not a
drive-by alongside a logging change). The action's before/after `d` is now
at least captured by a `path-open-close` debug event, so once logging is
live in the field this can be confirmed or ruled out from real repro data.
