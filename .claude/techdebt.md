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

## Puppet Warp follow-ups (2026-07-23)

From the initial `ext-puppet-warp` build. Each was explicitly scoped out with
the user; each is an additive enhancement, not a fix.

- **Pins are fixed content-space anchors, not mesh-attached.** A pin left as an
  anchor stays at its content coordinate; after a big warp it can visually
  detach from the limb it was placed on. Illustrator attaches pins to the mesh
  so they ride the deformation. Attaching a pin to a path parameter (nearest
  sample + offset) would fix this. Minor UX item — now more relevant than
  before since persistent single-shape rigs make repeated re-entry (and thus
  repeated exposure to this drift) more common.

- **Extension logic has no vitest coverage (only `mls.js` does).** The
  coordinate mapping, `startSession` target resolution, and commit/cancel undo
  behavior are covered by the Playwright e2e scripts (not part of `vitest run`)
  rather than unit tests, because meaningful coverage needs heavy `svgCanvas` /
  paper.js / DOM mocking. If unit coverage is wanted, extract the pure helpers
  (`buildD`, the warp-mapping loop) and test those against a stub matrix.
