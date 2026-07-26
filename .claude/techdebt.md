# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## Backend coherence sweep (2026-07-25): the shape-tools-freeze bug is a symptom of a systemic pattern, not a one-off

Triggered by 26b91862 (a left-panel refactor left a stale DOM id in
`BottomPanel.js`, which threw mid-`selectedChanged()` and silently aborted
every UI update after it). Git history shows this exact failure *shape*
recurring repeatedly — not a coincidence, a structural gap: **d38833ad**,
**3a1dcffd**, **7a32d8f6**, **db28628f**, **0ac7845f**, **26b91862** are all
"stop X from freezing/getting stuck" fixes for the same root cause (an
unguarded exception partway through a sequential update chain), and
**94a2a409, bbabd2ed, 810fc06b, 06ab4dbf, 84834f2f, 70c4cd31, 5f9b2668,
f83d7381, e5bada12, 264ff2bf** are all "scope X to the owning/active editor
instance" fixes for a second recurring root cause (module/document-level
lookups resolving to the wrong instance). Both classes get patched file-by-file
as each new instance is discovered, never closed structurally. The items below
are ordered by leverage (cheapest fix / biggest blast-radius reduction first),
not by where they live in the codebase. None of this has been implemented —
this is a documented backlog per this file's own convention.

### 1-3. Fixed (2026-07-25): extension broadcast isolation, editor-layer update-chain isolation, panel-init isolation

Items 1-3 as originally logged here (`runExtensions()`'s unguarded broadcast
loop, the unguarded `selectedChanged`/`elementChanged`/`zoomChanged`/
`elementTransition`/`TopPanel.update()`/`TopPanel.updateContextPanel()` chains,
and `EditorStartup.init()`'s unwrapped panel-init sequence) are fixed:

- `packages/svgcanvas/core/selection.js`'s `runExtensionsMethod` now wraps
  `ext[action](vars)` in try/catch, logs, and continues to the next extension.
- `EditorStartup.js`'s panel-init sequence (`leftPanel.init()` through
  `tabletShell.init()`) is now wrapped the same way the extension-loading loop
  already was — one panel's init failure logs and lets the rest, plus the
  `svgCanvas.bind(...)` registrations and extension loading after it, proceed.
- A small shared helper, `src/editor/runSteps.js` (`runSteps([[label, fn], ...])`
  — try/catch + `console.error(label, err)` + continue per step), now backs
  `Editor.js`'s `selectedChanged()`, `elementChanged()`, `zoomChanged()`, and
  `elementTransition()`, and `TopPanel.js`'s `update()` and
  `updateContextPanel()`. `updateContextPanel()`'s original early-return
  short-circuit (pathedit-node mode skips the history-buttons/layer-menu tail)
  is preserved exactly via an explicit `skipTail` flag rather than relying on
  `return`'s scope, so behavior is unchanged when nothing throws.

### 9-10. Fixed (2026-07-26): extension id/class namespacing convention, malformed-extension error clarity

- Documented an `ext-<name>-*` DOM id/class prefix convention for new
  extensions in `.claude/extensions.md`; the handful of pre-convention
  built-ins (`ext-grid`'s `#canvasGrid`/`#gridLines`, `ext-markers`'
  `#marker_panel`) are left unrenamed since other files reference them
  (`ext-proportion-markers.js`, `tests/unit/`, `.claude/tools.md`) — noted as
  an opportunistic spot-fix only, not done blind.
- `EditorStartup.js`'s two extension-loading branches now check
  `imported.default` exists before destructuring, throwing a clear
  `Extension <name> has no default export` instead of a generic
  `TypeError: Cannot destructure property 'name' of undefined`.

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

Closed 2026-07-26: a flyout dragged into "Additional tools" no longer closes
the bucket's popover when its own handle is clicked —
`seToolOverflow.js`'s click handler now leaves the drawer open on a
`SE-FLYINGBUTTON`-retargeted click (a nested flyout's own trigger), only
closing on a genuine leaf-tool pick, mirroring how `se-flyingbutton` itself
distinguishes the two. Regression test in
`tests/unit/components/seToolOverflow.test.js`.

## Puppet Warp follow-ups (2026-07-23)

From the initial `ext-puppet-warp` build. Each was explicitly scoped out with
the user; each is an additive enhancement, not a fix. (The bézier-refit item is
now done — on commit the dense warp polyline is refit to cubic béziers via
`svgCanvas.simplifyPathD`, so it's no longer listed here.)

- **No persistent / re-editable rig.** By decision, the tool is session-only:
  the shape's geometry at tool-entry is the rest pose, pins live only for that
  session, and the pose bakes on exit. There's no canonical rest pose to snap
  back to and pins don't survive save/reload. A true reusable puppet would store
  pins + original rest geometry as `se:`-prefixed metadata (precedent:
  `core/corner-radius.js`'s `se:orig-d`) and re-hydrate on re-entry, with
  `remapElement` hooks to keep the source geometry synced through baked
  transforms. Significant effort (metadata schema, save/load, remap plumbing) —
  deferred until the session-only tool proves useful.

- **Pins are fixed content-space anchors, not mesh-attached.** A pin left as an
  anchor stays at its content coordinate; after a big warp it can visually
  detach from the limb it was placed on. Illustrator attaches pins to the mesh
  so they ride the deformation. Attaching a pin to a path parameter (nearest
  sample + offset) would fix this but only matters once multi-drag sessions /
  persistent rigs exist. Minor UX item.

### Deferred code-review findings (2026-07-23 review pass)

A review agent flagged these; the correctness items (own-transform space bug,
atomic/cancelable conversion, singular-matrix guard, no-op undo, themed pins)
were **fixed**, and three more were closed 2026-07-26 (group-context coordinate
mismatch — `puppetwarp` added to `event-group-context.js`'s
`CONTENT_SPACE_MODES` so `mouseDown`'s `start_x/start_y` and `mouseMove`'s
`mouse_x/mouse_y` stay in the same content space; scale-dependent magic
constants — `REFIT_TOLERANCE`/the `len / 6` sample step replaced with
`sampleStepFor`/`refitToleranceFor`, derived from each target's content-space
bbox diagonal, with regression tests in `tests/unit/ext-puppet-warp-scale.test.js`
and `tests/unit/event-modes.test.js`). This remains as a lower-priority
follow-up:

- **Overlay pins live inside `#svgcontent` (serialization risk).** `addPinDot`
  appends `<circle>`s to the current layer. They're removed on every exit path,
  so a normal session is clean — but if a host autosave / `getSvgString()` fires
  *mid-session* the pins get serialized into the saved doc. `ext-curvature` has
  the same accepted risk; the proper fix (used by smart-guides / shape-builder)
  is an overlay `<svg>`/`<g>` in `#svgroot` (outside content) synced to the
  content transform on move + `zoomChanged`. Moderate effort. Low likelihood.

- **Extension logic has no vitest coverage (only `mls.js` does).** The
  coordinate mapping, `startSession` target resolution, and commit/cancel undo
  behavior are covered by the Playwright e2e scripts (not part of `vitest run`)
  rather than unit tests, because meaningful coverage needs heavy `svgCanvas` /
  paper.js / DOM mocking. If unit coverage is wanted, extract the pure helpers
  (`buildD`, the warp-mapping loop) and test those against a stub matrix.

---

## Bug-hunt findings (2026-07-18): copy-paste / multi-instance follow-ups

Findings from a targeted audit. All eight original findings (curvature tool
cleanup, path node-index sort, zoom-adjusted drag threshold, three
multi-instance active-editor/teardown bugs, the cross-drawing Paste
enable-state propagation, and — closed 2026-07-26 in a dedicated pass — the
`dom-utils.js`/`bbox-utils.js` module-singleton-to-per-instance refactor)
are now fixed, with regression tests in `tests/unit/` where feasible.

## Bug-hunt findings (2026-07-21): path-tool freeze sweep

Swept the path/pathedit tool for the reported "path tool enters node-editing of
a different path and freezes the UI" edge cases. Two root issues were fixed with
regression tests (`tests/unit/path-degenerate.test.js`):

- `Path#show(true)` dereferenced `this.first_seg.index` on a degenerate
  single-point sub-path (`M x,y` / `M x,y Z`, `first_seg` never assigned by
  `init()`), throwing mid mode-transition. Called from `toEditMode()`, the
  undo/redo handler (`undo.js`), and `addSubPath`. Now null-guarded.
- `setMode()` ran `pathActions.clear()` / `textActions.clear()` **before**
  committing `currentMode`, so any throw in path/text teardown left the mode
  stuck and every subsequent toolbar click re-threw — the "can't select any
  other tool, only a reload fixes it" freeze. Each teardown is now isolated so a
  failure is logged but the tool still switches.
- `opencloseSubPath()` (the node-panel open/close-subpath toggle) treated
  `openPt === false` ("already closed") the same as `openPt === null` ("not
  found") via `if (!openPt)`, so re-closing an already-closed sub-path appended
  a redundant `L x,y Z` on every press instead of opening it. Fixed by checking
  `=== null` explicitly; regression tests in `tests/unit/path-actions.test.js`
  (`describe('opencloseSubPath', ...)`) cover both the generic-split and
  mate-shortcut opening branches plus a repeated-press round trip.
