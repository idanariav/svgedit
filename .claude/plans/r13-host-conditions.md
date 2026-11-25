# R13 — Tests that run the host's conditions

Status: done (2026-11-25). Roadmap: `.claude/roadmap/rearchitecture.md` › R13.

## Why

Most of the Oct–Nov fixes were found from Obsidian debug logs, not by the suite: the e2e pages mount one editor in a plain
browser. The plugin mounts one editor per leaf in one document, fires its lifecycle in bursts (`clear` + `setViewData`,
`onClose` + `onunload` in one tick), switches leaves without a click (`active-leaf-change` → `editor.activate()`), keeps
background tabs mounted but hidden, and runs in Electron, whose clipboard does not deliver a native `paste` to a
non-editable target and whose writes can be lost or replaced by the host.

## What

1. **`tests/e2e/harness/host-page.js`**, an init script (installed before the page loads, as Playwright advises for
   API doubles):
   - `window.host`, a fake plugin: `open(id, svg)` mounts an editor the way `SvgView.initEditor` does (its config, a shared
     in-memory user-data store, `documentChanged` → the view's dirty flag, `activate()` when it is the active leaf),
     `load(id, svg)` is a same-leaf file switch (`clear` + `setViewData`, the load guarded like `isLoading`),
     `activate(id)` is `active-leaf-change`, `hide` / `show` a background tab, `close(id)` fires `onClose` and `onunload`
     in one tick (the editor's `destroy` twice).
   - `window.host.clipboard`, a clipboard double, **opt-in** (the default is the browser's own clipboard, so a broad mock
     cannot drift from the real one): it owns `navigator.clipboard` and the native copy / cut / paste events, and can
     `reject` or `drop` writes, `reject` reads, have another app `replace` the content, and withhold the native paste
     (Electron).
2. **`tests/e2e/host-harness.js`**: `mountHost(page, { clipboard })` (installs the script, visits, adopts the page's
   editor as the first leaf) and small helpers.
3. **The fixture's rest checks run on every leaf's editor** (`checkDrawing`, `gestureLeftovers`), not only
   `window.svgEditor`.
4. **`tests/e2e/host-conditions.spec.js`**: the bug classes of Oct–Nov, under host conditions — shortcuts and paste
   follow a leaf switch without a click; paste through each clipboard failure; a double teardown; dirty only from real
   edits, per leaf; a drawing loaded in a hidden tab; a gesture whose tab is hidden mid-drag; one leaf's tool switch and
   another's Curvature session; the debug log per leaf.

Bugs the spec finds are fixed in the same item, with their own unit tests.

## Out of scope

Moving the older ad hoc two-editor specs (`clipboard-cross-editor`, `multi-editor-owner`, `editor-teardown`) onto the
harness: they pass and say what they test; new host-condition tests use the harness.
