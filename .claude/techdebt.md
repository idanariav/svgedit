# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

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
were **fixed**. These remain as lower-priority follow-ups:

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

- **Group-context coordinate mismatch (niche).** If the user has drilled *into*
  a group (`isCreateInCurrentGroup`), `mouseDown` receives group-local
  `start_x/start_y` while `mouseMove` receives raw content `mouse_x/zoom`, so
  pin placement and dragging use different frames (`hitTestPin` would mis-hit).
  Normalize both to content space to fix. Rare path.

- **Scale-dependent magic constants.** `REFIT_TOLERANCE = 2` and the `len / 6`
  sample step are absolute user units; on a tiny icon the refit can over-smooth,
  on a huge path the 400-sample cap can undersample. Derive both from the
  target's bbox diagonal for scale-independence. Low priority.

- **Text / image / use in a warped group are left stationary.** `WARPABLE`
  excludes them, so a mixed group deforms only its shapes. Defensible v1 scope;
  worth surfacing in the tooltip/docs if it confuses users.

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

Still open (documented, not fixed — needs its own semantic pass):

### `opencloseSubPath()` corrupts `d` when re-closing an already-closed sub-path

Calling open/close-subpath (the node-panel toggle) with the first node after a
sub-path's `M` selected on an **already-closed** sub-path appends a redundant
`L x,y Z` each time (e.g. `M100,100 L200,100 L150,180 Z` →
`… Z L100,100 Z`, and repeated presses keep stacking `L100,100 Z`). The result
is a dangling sub-path segment after a `Z` with no intervening `M`. It renders
mostly harmlessly and no longer crashes node-editing (the `show()` fix above),
but the open/closed detection in `opencloseSubPath` mis-classifies the first
post-`M` node of a closed loop. Fixing it correctly means reworking that
detection (moderate risk; the function's index bookkeeping is intricate), so it
was left out of the freeze fix. Reproduce: select node index 1 of a closed
triangle in pathedit, press the open/close-subpath control repeatedly.

## From the Phase 1-11 cleanup roadmap (`.claude/plans/i-want-to-do-immutable-kettle.md`)

The following were explicitly called out in that plan as "Deferred / optional
future refactors" — each needs its own planning pass before execution:

- **Reorganize `svgcanvas.js` state bag (80+ flat properties)** into concern
  objects (selection / drawing / style / history / zoom), keeping getters for
  API compat. Very high effort; 100+ call sites.
