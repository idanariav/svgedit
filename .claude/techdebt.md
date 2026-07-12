# Tech Debt / Future Work

Running log of deferred refactors, follow-ups, and "do it properly later"
items surfaced during work sessions but intentionally **not** scheduled or
executed at the time. This is a reference backlog, not a roadmap — nothing
here should be picked up unless explicitly requested in a future session.

When adding an entry: say what it is, why it wasn't done now, and roughly
how big/risky it is. When an item is finally addressed, delete its entry
(git history keeps the record).

---

## Cmd/Ctrl+V paste fallback only restores internal paste, not external clipboard content, on hosts that swallow the native `paste` event

`src/editor/EditorStartup.js` (keydown listener) + `src/editor/pasteFallbackArmer.js`
added a timing-raced fallback: on Cmd/Ctrl+V, if the browser's native `paste`
DOM event doesn't arrive within 80ms (observed in the Obsidian/Electron host,
where the OS accelerator only reaches non-editable targets via
`document.execCommand`-style edit commands that some hosts silently no-op
on), it falls back to `svgCanvas.pasteElements()` — the same
sessionStorage-backed internal clipboard the right-click "Paste" menu item
already used. This fixes internal copy → paste via keyboard.

Not done now: it does **not** restore pasting external content (e.g. an SVG
copied from Excalidraw via "Copy as SVG", handled by case (b) in
`pasteHandler`) on hosts where the native `paste` event never fires, since
that path needs the browser's clipboard payload, not the internal snapshot.
A real fix would need an async `navigator.clipboard.read()`/`readText()`
call triggered from the keydown itself — which may hit the same
permission/host restrictions that already silently break the OS-clipboard
mirror in `copySelectedElements()` (`packages/svgcanvas/core/selected-elem.js`),
so it needs its own investigation into what clipboard APIs Obsidian's
Electron renderer actually grants.

## From the Phase 1-11 cleanup roadmap (`.claude/plans/i-want-to-do-immutable-kettle.md`)

The following were explicitly called out in that plan as "Deferred / optional
future refactors" — each needs its own planning pass before execution:

- **Reorganize `svgcanvas.js` state bag (80+ flat properties)** into concern
  objects (selection / drawing / style / history / zoom), keeping getters for
  API compat. Very high effort; 100+ call sites.
